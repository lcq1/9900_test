import type { RuntimeProgress } from '../participant/ProgressStore'
import type { ParticipantEvent } from '../participant/EventQueue'
import { useTransientNotice } from '../participant/TimerController'
import { http } from '../api/http'
import {
	clearParticipantToken,
	setParticipantToken,
} from '../auth/sessionStore'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Experiment } from '../types'
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import { ParticipantPreview } from '../participant/StageRenderer'

/**
 * Participant entry — verifies the experiment code (matched across ALL experiments
 * in the workspace, case-insensitive) and a participant code of >= 3 characters,
 * then launches the participant runtime for the matched experiment.
 *
 * Deduplication (Wave 5): when codes were already collected on the sign-in screen
 * (`initialExperimentCode` / `initialParticipantCode`), this page does NOT ask for
 * them again — it validates immediately and jumps straight into the runtime. Only
 * when the codes are missing (researcher preview from the workspace menu) or fail
 * validation does the code form render.
 */
export function ParticipantEntry({
	experiments,
	onBack,
	initialExperimentCode,
	initialParticipantCode,
	previewOnly = false,
}: {
	experiments: Experiment[]
	onBack: () => void
	initialExperimentCode?: string
	initialParticipantCode?: string
	previewOnly?: boolean
}) {
	const [experimentCode, setExperimentCode] = useState(
		initialExperimentCode ?? '',
	)
	const [participantCode, setParticipantCode] = useState(
		initialParticipantCode ?? '',
	)
	const [started, setStarted] = useState(false)
	const [error, setError, errorVisible, errorRevision] =
		useTransientNotice('')
	const [active, setActive] = useState<Experiment | null>(null)

	if (started && active)
		return (
			<ParticipantPreview
				previewOnly={previewOnly}
				experiment={active}
				participantCode={participantCode}
				onBack={onBack}
			/>
		)

	// Codes supplied at sign-in: validate during render (no extra state/effect)
	// and either enter the runtime directly or surface the validation error here.
	let accessError = ''
	if (initialExperimentCode && initialParticipantCode) {
		const match = experiments.find(
			(experiment) =>
				experiment.code.toUpperCase() ===
				initialExperimentCode.trim().toUpperCase(),
		)
		if (match && initialParticipantCode.trim().length >= 3) {
			return (
				<ParticipantPreview
					previewOnly={previewOnly}
					experiment={match}
					participantCode={initialParticipantCode}
					onBack={onBack}
				/>
			)
		}
		accessError = !match
			? 'We could not find an experiment with that code. Check it and try again.'
			: 'Please enter a participant code of at least 3 characters.'
	}

	const begin = () => {
		const match = experiments.find(
			(experiment) =>
				experiment.code.toUpperCase() ===
				experimentCode.trim().toUpperCase(),
		)
		if (!match) {
			setError(
				'We could not find an experiment with that code. Check it and try again.',
			)
			return
		}
		if (participantCode.trim().length < 3) {
			setError(
				'Please enter a participant code of at least 3 characters.',
			)
			return
		}
		setActive(match)
		setStarted(true)
	}

	return (
		<section className="participant-view">
			<div className="participant-top">
				<button className="back-link" onClick={onBack}>
					<ArrowLeft size={16} /> Exit preview
				</button>
				<span className="preview-label">
					<span className="live-dot"></span> Participant access
				</span>
				<span>No account required</span>
			</div>
			<div className="participant-body entry-body">
				<div className="participant-card entry-card">
					<span className="section-tag">START A STUDY</span>
					<h1>Enter your access codes</h1>
					<p className="entry-copy">
						Use the experiment code and participant code provided by
						your researcher. No account is created.
					</p>
					<label className="entry-label">
						Experiment code
						<input
							value={experimentCode}
							onChange={(event) =>
								setExperimentCode(
									event.target.value.toUpperCase(),
								)
							}
							placeholder="e.g. DESIGN-7K2M"
						/>
					</label>
					<label className="entry-label">
						Participant code
						<input
							value={participantCode}
							onChange={(event) =>
								setParticipantCode(event.target.value)
							}
							placeholder="e.g. P-1048"
						/>
					</label>
					{((error && errorVisible) || accessError) && (
						<p
							key={errorRevision}
							className="entry-error transient-notice"
						>
							{error || accessError}
						</p>
					)}
					<button
						className="primary-button entry-button"
						onClick={begin}
					>
						Begin experiment <ArrowRight size={15} />
					</button>
					<p className="privacy-note">
						<ShieldCheck size={14} /> Your responses are only
						visible to the research team.
					</p>
				</div>
			</div>
		</section>
	)
}

export function ParticipantAccessPage({
	initialExperimentCode = '',
	initialParticipantCode = '',
	onBack,
}: {
	initialExperimentCode?: string
	initialParticipantCode?: string
	onBack: () => void
}) {
	const [code, setCode] = useState(initialExperimentCode)
	const [participant, setParticipant] = useState(initialParticipantCode)
	const [active, setActive] = useState<{
		experiment: Experiment
		participant: string
	} | null>(null)
	const [phase, setPhase] = useState<'welcome' | 'study' | 'complete'>(
		'welcome',
	)
	const startId = useRef(crypto.randomUUID())
	const [sessionId, setSessionId] = useState<string>()
	const [resume, setResume] = useState<{ progress?: RuntimeProgress; events?: ParticipantEvent[] }>({})
	const fullscreenOwned = useRef(false)
	const mounted = useRef(true)
	const releaseFullscreen = () => {
		if (
			fullscreenOwned.current &&
			document.fullscreenElement === document.documentElement
		) {
			void document.exitFullscreen?.().catch(() => undefined)
		}
		fullscreenOwned.current = false
	}
	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
			releaseFullscreen()
		}
	}, [])
	const [busy, setBusy] = useState(false)
	const [error, setError, errorVisible, errorRevision] =
		useTransientNotice('')
	const started = useRef(false)
	const enter = useCallback(
		async (experimentCode: string, participantCode: string) => {
			clearParticipantToken()
			if (!experimentCode.trim() || participantCode.trim().length < 3) {
				setError(
					'Enter an experiment code and a participant code of at least 3 characters.',
				)
				return
			}
			setBusy(true)
			setError('')
			try {
				const result = await http.post<{
					token: string
					experiment: Experiment
				}>('/participant/access', {
					experimentCode: experimentCode.trim(),
					participantCode: participantCode.trim(),
				})
				setParticipantToken(result.token)
				setActive({
					experiment: result.experiment,
					participant: participantCode.trim(),
				})
			} catch (e) {
				setError(
					e instanceof Error
						? e.message
						: 'Could not enter the experiment. Please retry.',
				)
			} finally {
				setBusy(false)
			}
		},
		[setError],
	)
	useEffect(() => {
		if (
			!started.current &&
			initialExperimentCode &&
			initialParticipantCode
		) {
			started.current = true
			void enter(initialExperimentCode, initialParticipantCode)
		}
	}, [initialExperimentCode, initialParticipantCode, enter])
	const exit = () => {
		releaseFullscreen()
		clearParticipantToken()
		onBack()
	}
	const beginStudy = async () => {
		if (!active || busy) return
		setError('')
		setBusy(true)
		try {
			const result = await http.post<{
				sessionId: string
				progress?: RuntimeProgress
				events?: ParticipantEvent[]
				experiment: Experiment
			}>('/participant/sessions/start', {
				sessionId: startId.current,
				experimentCode: active.experiment.code,
				participantCode: active.participant,
			})
			if (!mounted.current) return
			setActive({ ...active, experiment: result.experiment })
			setSessionId(result.sessionId)
			setResume({ progress: result.progress, events: result.events })
			if (result.experiment.fullScreen) {
				if (!document.documentElement.requestFullscreen)
					throw new Error(
						'Full-screen mode is required for this study. Use a browser that supports it.',
					)
				await document.documentElement.requestFullscreen()
				fullscreenOwned.current = true
				if (!mounted.current) {
					releaseFullscreen()
					return
				}
				if (document.fullscreenElement !== document.documentElement)
					throw new Error(
						'Full-screen mode could not be entered. Please retry.',
					)
			}
			setPhase('study')
		} catch (error) {
			if (mounted.current)
				setError(
					error instanceof Error
						? error.message
						: 'Could not start the study. Please retry.',
				)
		} finally {
			if (mounted.current) setBusy(false)
		}
	}
	if (active && phase === 'study')
		return (
			<ParticipantPreview
				initialSessionId={sessionId}
				initialProgress={resume.progress}
				initialEvents={resume.events}
				experiment={active.experiment}
				participantCode={active.participant}
				onBack={exit}
				onComplete={() => {
					releaseFullscreen()
					clearParticipantToken()
					setPhase('complete')
				}}
			/>
		)
	if (active)
		return (
			<section className="participant-view">
				<div className="participant-body entry-body">
					<div className="participant-card entry-card">
						<span className="section-tag">
							{phase === 'complete'
								? 'STUDY COMPLETE'
								: 'WELCOME'}
						</span>
						<h1>
							{phase === 'complete'
								? 'Thank you!'
								: 'Welcome to the study'}
						</h1>
						<h2>{active.experiment.name}</h2>
						<p className="entry-copy">
							{phase === 'complete'
								? 'Your responses have been saved. Thank you for your time and participation.'
								: 'Thank you for taking part. When you are ready, select Start experiment and follow the instructions for each stage.'}
						</p>
						{phase === 'welcome' && (
							<p className="entry-copy">
								Participant code: {active.participant}
							</p>
						)}
						{phase === 'welcome' &&
							active.experiment.fullScreen && (
								<p className="entry-copy">
									This study requires full-screen mode. Start
									experiment will request full screen.
								</p>
							)}
						{error && errorVisible && (
							<p
								key={errorRevision}
								className="entry-error transient-notice"
								role="alert"
							>
								{error}
							</p>
						)}
						<button
							className="primary-button entry-button"
							disabled={busy}
							onClick={
								phase === 'complete'
									? exit
									: () => void beginStudy()
							}
						>
							{phase === 'complete'
								? 'Back to sign in'
								: busy
									? 'Starting experiment…'
									: 'Start experiment'}
							<ArrowRight size={15} />
						</button>
						{phase === 'welcome' && (
							<button className="back-link" onClick={exit}>
								Back to sign in
							</button>
						)}
					</div>
				</div>
			</section>
		)
	return (
		<section className="participant-view">
			<div className="participant-body entry-body">
				<form
					className="participant-card entry-card"
					onSubmit={(event) => {
						event.preventDefault()
						if (!busy) void enter(code, participant)
					}}
				>
					<button type="button" className="back-link" onClick={exit}>
						Back to sign in
					</button>
					<h1>Enter your access codes</h1>
					<p>No account required.</p>
					<label className="entry-label">
						Experiment code
						<input
							value={code}
							disabled={busy}
							onChange={(e) => setCode(e.target.value)}
						/>
					</label>
					<label className="entry-label">
						Participant code
						<input
							value={participant}
							disabled={busy}
							onChange={(e) => setParticipant(e.target.value)}
						/>
					</label>
					{error && errorVisible && (
						<p
							role="alert"
							key={errorRevision}
							className="entry-error transient-notice"
						>
							{error}
						</p>
					)}
					<button
						className="primary-button entry-button"
						disabled={busy}
					>
						{busy ? 'Joining experiment…' : 'Begin experiment'}
					</button>
				</form>
			</div>
		</section>
	)
}
