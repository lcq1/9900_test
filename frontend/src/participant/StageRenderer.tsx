import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from 'antd'
import type { Experiment } from '../types'
import {
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  CircleStop,
  MessageCircle,
  MonitorPlay,
  Paperclip,
  Pause,
  PenLine,
  Play,
  Square,
  TimerReset,
  Video,
} from 'lucide-react'
import { http, downloadFile } from '../api/http'
import { AIChat } from './AIChat'
import { ConsentView } from './ConsentView'
import { useTimerController, useTransientNotice } from './TimerController'
import { EventQueue } from './EventQueue'
import {
	uploadRecording,
	submitStage,
	submitSession,
	type ParticipantAnswer,
} from '../api/participant'
import {
  RecordingController,
  statusLabel,
  type RecordingKind,
  type RecordingStatus,
} from './RecordingController'

/**
 * ParticipantPreview — the participant-facing runtime of a single experiment.
 *
 * Preserved behaviours (earlier UI-polish work):
 *  - Live minutes:seconds countdown derived from `stage.countdownMinutes`,
 *    paused with the session and reset per stage.
 *  - MS-Forms-style numbered questions for every non-text component.
 *
 * Layout (Request C):
 *  - When a stage has the AI feature on (the "Design task" assistant scenario),
 *    the stage content and the AI assistant render as a two-column split:
 *    the assistant is pinned to the far-right rail, like e-commerce AI helpers.
 *  - When AI is off, the stage renders as the familiar single column.
 *
 * Wired-in data capture:
 *  - ONE `EventQueue` per participant session, stable across renders and
 *    persisted to localStorage under `p13-events:<sessionId>`.
 *  - `stage_view` on entering a stage, `timer_milestone` when the countdown
 *    elapses, `answer` for AI replies and consent, `recording_start/stop`.
 *  - Real copy/paste logging when `features.copyPaste` is on.
 *  - Stage boundaries finalize files; enabled auto stages may reuse live streams.
 */
export function ParticipantPreview({
	experiment,
	participantCode,
	onBack,
	onComplete,
	previewOnly = false,
	initialSessionId,
}: {
	experiment: Experiment
	participantCode: string
	onBack: () => void
	onComplete?: () => void
	previewOnly?: boolean
	initialSessionId?: string
}) {
	const [stageIndex, setStageIndex] = useState(0)
	const allowFreeOrder = Boolean(experiment.stages[0]?.features.navigation)
	const stageTimes = useRef<Record<string, number>>({})
	const [consentedStageId, setConsentedStageId] = useState<string | null>(
		null,
	)
	const [paused, setPaused] = useState(false)
	const [selections, setSelections] = useState<
		Record<string, string | string[]>
	>({})
	// Tracks the chosen file name per attachment component so the UI can show it
	// after a pick (the actual bytes are recorded into the event timeline).
	const [attachments, setAttachments] = useState<Record<string, string>>({})

	// Stable per-session EventQueue (created once, never per render).
	const [queue] = useState(
		() => new EventQueue(`${experiment.code}-${Date.now()}`),
	)

	const stage = experiment.stages[stageIndex]
	const requiresScreen =
		!previewOnly &&
		stage.type.toLowerCase() !== 'consent' &&
		Boolean(stage.features.screenRecording)
	const [recordingStatus, setRecordingStatus] = useState<
		Partial<Record<RecordingKind, RecordingStatus>>
	>({})
	const [recordingStageId, setRecordingStageId] = useState('')
	const screenLocked =
		requiresScreen &&
		(recordingStageId !== stage.id || recordingStatus.screen !== 'active')
	const requiresFullscreen = !previewOnly && experiment.fullScreen
	const [fullscreenActive, setFullscreenActive] = useState(
		() => document.fullscreenElement === document.documentElement,
	)
	const [
		fullscreenError,
		setFullscreenError,
		fullscreenErrorVisible,
		fullscreenErrorRevision,
	] = useTransientNotice('')
	const [fullscreenBusy, setFullscreenBusy] = useState(false)
	const fullscreenLocked = requiresFullscreen && !fullscreenActive
	const interactionLocked = screenLocked || fullscreenLocked
	useEffect(() => {
		if (!requiresFullscreen) return
		const changed = () => {
			const active =
				document.fullscreenElement === document.documentElement
			setFullscreenActive(active)
			queue.record(
				active ? 'fullscreen_enter' : 'fullscreen_exit',
				{},
				stage.id,
			)
		}
		document.addEventListener('fullscreenchange', changed)
		return () => document.removeEventListener('fullscreenchange', changed)
	}, [requiresFullscreen, queue, stage.id])
	const restoreFullscreen = async () => {
		setFullscreenBusy(true)
		setFullscreenError('')
		try {
			if (!document.documentElement.requestFullscreen)
				throw new Error('unsupported')
			await document.documentElement.requestFullscreen()
			setFullscreenActive(
				document.fullscreenElement === document.documentElement,
			)
		} catch {
			setFullscreenError(
				'Could not enter full screen. Allow full screen and try again.',
			)
		} finally {
			setFullscreenBusy(false)
		}
	}
	const sessionRef = useRef<Promise<string> | null>(
		initialSessionId ? Promise.resolve(initialSessionId) : null,
	)
	const ensureSession = () => {
		if (!sessionRef.current) {
			sessionRef.current = submitSession({
				experimentCode: experiment.code,
				participantCode,
				finishedAt: null,
				answers: [],
				events: [],
			})
				.then((result) => result.id)
				.catch((error) => {
					sessionRef.current = null
					throw error
				})
		}
		return sessionRef.current
	}
	const [
		recordingError,
		setRecordingError,
		recordingErrorVisible,
		recordingErrorRevision,
	] = useTransientNotice('')
	const [validationError, setValidationError] = useState('')
	const [validationAttempt, setValidationAttempt] = useState(0)
	useEffect(() => {
		if (!validationError) return
		// Hold for two seconds, then allow the CSS fade to finish.
		const timer = window.setTimeout(() => setValidationError(''), 2600)
		return () => window.clearTimeout(timer)
	}, [validationError, validationAttempt])
	const [saving, setSaving] = useState(false)
	const busyRef = useRef(false)
	const approvedRef = useRef<{
		stageId: string
		recording: Record<string, boolean>
	} | null>(null)

	/**
	 * Persist the captured session to the backend, then leave the runtime.
	 *
	 * This is the single convergence point for every exit (last-stage Finish,
	 * the "Time is up" modal, the Abort button, and the Exit-preview link). It
	 * derives the `answers` array from the `answer` events already in the queue,
	 * stamps `finishedAt`, and POSTs the whole timeline. Failed uploads or
	 * submissions keep the runtime open so the participant can retry.
	 */
	const finishSession = useCallback(
		async (reason: 'finish' | 'abort') => {
			if (previewOnly) {
				onBack()
				return
			}
			if (reason === 'abort') {
				queue.record('abort', { stageName: stage.name }, stage.id)
			}
			try {
				await Promise.all(
					Object.values(controllersRef.current).map((controller) =>
						controller?.finish(),
					),
				)
			} catch {
				setRecordingError(
					'Recording upload failed. Keep this page open and retry.',
				)
				return
			}
			const events = queue.all()
			const answers: ParticipantAnswer[] = events
				.filter(
					(event) =>
						event.type === 'answer' && event.detail?.componentId,
				)
				.map((event) => {
					const detail = event.detail as {
						componentId?: string
						value?: string | string[]
						consent?: boolean
					}
					const value: string | string[] =
						detail.value !== undefined
							? detail.value
							: detail.consent
								? 'consented'
								: ''
					return { componentId: String(detail.componentId), value }
				})
			try {
				await submitSession({
					sessionId: sessionRef.current
						? await sessionRef.current
						: undefined,
					experimentCode: experiment.code,
					participantCode,
					finishedAt:
						reason === 'finish' ? new Date().toISOString() : null,
					answers,
					events,
				})
			} catch (error) {
				setRecordingError(
					error instanceof Error
						? `Session could not be saved. ${error.message} Keep this page open and retry.`
						: 'Session could not be saved. Keep this page open and retry.',
				)
				return
			}
			if (reason === 'finish' && onComplete) onComplete()
			else onBack()
		},
		[
			queue,
			stage.id,
			stage.name,
			experiment.code,
			participantCode,
			onBack,
			onComplete,
			previewOnly,
			setRecordingError,
		],
	)

	// Live countdown (minutes-based) for the Countdown Timer feature.
	const totalSeconds = Math.max(1, stage.countdownMinutes) * 60
	const { remaining, reset: setRemaining } = useTimerController({
		initialSeconds: totalSeconds,
		enabled:
			stage.features.timer && !paused && !interactionLocked && !saving,
		stageId: stage.id,
	})

	// Recording controllers are imperative objects: kept in a ref and only ever
	// read inside handlers/effects, never during render.
	const controllersRef = useRef<
		Partial<Record<RecordingKind, RecordingController>>
	>({})
	const videoRef = useRef<HTMLVideoElement>(null)
	const startingRef = useRef<Partial<Record<RecordingKind, boolean>>>({})
	const aliveRef = useRef(true)
	const activeStageRef = useRef(stage.id)
	activeStageRef.current = stage.id

	const minutes = String(Math.floor(remaining / 60)).padStart(2, '0')
	const seconds = String(remaining % 60).padStart(2, '0')

	useEffect(() => {
		let active = true
		const sent = Date.now()
		void http
			.get<{ epochMs: number }>('/time')
			.then((sample) => {
				if (active && Number.isFinite(sample.epochMs))
					queue.setClock(sample.epochMs, sent, Date.now())
			})
			.catch(() => undefined)
		return () => {
			active = false
		}
	}, [queue])

	// Record every stage transition (including the first render).
	useEffect(() => {
		queue.record('stage_view', { stageName: stage.name }, stage.id)
	}, [queue, stage.id, stage.name])

	// Record a milestone once the countdown for this stage elapses.
	useEffect(() => {
		if (stage.features.timer && remaining === 0) {
			queue.record(
				'timer_milestone',
				{ stageName: stage.name, limitMinutes: stage.countdownMinutes },
				stage.id,
			)
		}
	}, [
		remaining,
		stage.features.timer,
		stage.countdownMinutes,
		stage.id,
		stage.name,
		queue,
	])

	// Real copy/paste logging while this stage has the feature enabled.
	useEffect(() => {
		if (!stage.features.copyPaste || paused) return
		const handleCopy = () => {
			const text = window.getSelection()?.toString() ?? ''
			queue.record('copy', { chars: text.length, text }, stage.id)
		}
		const handlePaste = (event: ClipboardEvent) => {
			const text = event.clipboardData?.getData('text') ?? ''
			queue.record('paste', { chars: text.length, text }, stage.id)
		}
		document.addEventListener('copy', handleCopy)
		document.addEventListener('paste', handlePaste)
		return () => {
			document.removeEventListener('copy', handleCopy)
			document.removeEventListener('paste', handlePaste)
		}
	}, [stage.features.copyPaste, paused, stage.id, queue])

	// Release devices when leaving the runtime; transitions explicitly hand off streams.
	useEffect(() => {
		aliveRef.current = true
		const controllers = controllersRef.current
		return () => {
			aliveRef.current = false
			;(Object.keys(controllers) as RecordingKind[]).forEach((kind) => {
				controllers[kind]?.stop()
				delete controllers[kind]
			})
			setRecordingStatus({})
		}
	}, [])

	useEffect(() => {
		setRecordingStatus({})
		if (stage.type.toLowerCase() === 'consent') return
		if (
			requiresScreen ||
			(stage.recordingMode === 'auto' &&
				stage.features.screenRecording)
		)
			void startRecording('screen')
		if (
			stage.recordingMode === 'auto' &&
			(stage.features.selfie || stage.recordingRequired)
		)
			void startRecording('self')
		// Reuse only live streams retained by the previous stage.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [stage.id])

	useEffect(() => {
		if (paused)
			Object.values(controllersRef.current).forEach((controller) =>
				controller?.stop(),
			)
	}, [paused])

	useEffect(() => {
		if (recordingStatus.self === 'active' && videoRef.current) {
			videoRef.current.srcObject =
				controllersRef.current.self?.stream ?? null
			void videoRef.current.play().catch(() => undefined)
		}
	}, [recordingStatus.self, stage.id])

	const next = () => advance(false)

	/**
	 * Move to the next stage (or finish on the last one).
	 * `skipConfirm` bypasses the double-confirm dialog — used by the
	 * time-is-up modal, which is itself an explicit user action.
	 */
	const advance = async (skipConfirm: boolean, targetIndex?: number) => {
		if (busyRef.current) return
		const choosingStage = targetIndex !== undefined
		if (choosingStage && (!allowFreeOrder || stage.type.toLowerCase() === 'consent' ||
			!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= experiment.stages.length ||
			targetIndex === stageIndex || experiment.stages[targetIndex].type.toLowerCase() === 'consent')) return
		setValidationError('')
		setValidationAttempt((attempt) => attempt + 1)
		const consentAccepted = consentedStageId === stage.id
		if (stage.type.toLowerCase() === 'consent' && !consentAccepted) {
			setValidationError('Please read and accept the consent form first.')
			return
		}
		if (
			requiresFullscreen &&
			document.fullscreenElement !== document.documentElement
		) {
			setValidationError('Return to full screen before continuing.')
			return
		}
		if (
			requiresScreen &&
			(paused || controllersRef.current.screen?.status !== 'active')
		) {
			setValidationError(
				'Screen recording is required for this stage. Allow screen sharing to continue.',
			)
			return
		}
		const answers = stage.components.map((c) => ({
			componentId: c.id,
			value: selections[c.id] ?? '',
		}))
		const missing = stage.components
			.filter((c) => {
				if (['text', 'button'].includes(c.type)) return false
				const feature =
					c.type === 'signature'
						? 'signatureBox'
						: c.type === 'attachment'
							? 'attachment'
							: 'questionnaire'
				const value = selections[c.id]
				return (
					(stage.requiredFeatures?.[feature] ?? c.required) &&
					!(typeof value === 'string' ? value.trim() : value?.length)
				)
			})
			.map((c) => c.label)
		const recording =
			approvedRef.current?.stageId === stage.id
				? approvedRef.current.recording
				: {
						self: controllersRef.current.self?.status === 'active',
						screen:
							controllersRef.current.screen?.status === 'active',
					}
		const missingRequiredRecording = stage.recordingRequired && !recording.self
		if (missingRequiredRecording)
			missing.push('Camera and microphone recording')
		if (!choosingStage && allowFreeOrder && stageIndex === experiment.stages.length - 1) {
			for (const other of experiment.stages) {
				if (other.id === stage.id || other.type.toLowerCase() === 'consent') continue
				for (const component of other.components) {
					if (['text', 'button'].includes(component.type)) continue
					const feature = component.type === 'signature' ? 'signatureBox' : component.type === 'attachment' ? 'attachment' : 'questionnaire'
					const value = selections[component.id]
					if ((other.requiredFeatures?.[feature] ?? component.required) &&
						!(typeof value === 'string' ? value.trim() : value?.length)) missing.push(`${other.name}: ${component.label}`)
				}
			}
		}
		if ((!choosingStage && missing.length) || missingRequiredRecording) {
			setValidationError('Required: ' + missing.join(', '))
			return
		}
		busyRef.current = true
		setSaving(true)
		try {
			if (!previewOnly && !choosingStage)
				await submitStage(stage.id, {
					experimentCode: experiment.code,
					participantCode,
					sessionId: await ensureSession(),
					answers,
					recording,
					consentAccepted,
				})
		} catch {
			busyRef.current = false
			setSaving(false)
			setValidationError(
				'Stage submission failed. Please check required items and retry.',
			)
			return
		}
		answers.forEach((a) => recordAnswer(a.componentId, a.value))
		if (
			!skipConfirm &&
			stage.features.confirm &&
			!window.confirm(
				'Are you sure you want to continue? You may not be able to return.',
			)
		) {
			busyRef.current = false
			setSaving(false)
			return
		}
		queue.record('stage_exit', { recording }, stage.id)
		approvedRef.current = { stageId: stage.id, recording }
		setSaving(true)
		try {
			const following = experiment.stages[targetIndex ?? stageIndex + 1]
			await Promise.all(
				(
					Object.entries(controllersRef.current) as [
						RecordingKind,
						RecordingController,
					][]
				).map(([kind, controller]) => {
					const keep =
						following &&
						(following.recordingMode === 'auto' ||
							(!previewOnly && kind === 'screen')) &&
						following.type.toLowerCase() !== 'consent' &&
						((kind === 'self' && following.recordingRequired) ||
							following.features[
								kind === 'self' ? 'selfie' : 'screenRecording'
							])
					return controller.finish(Boolean(keep))
				}),
			)
			setRecordingError('')
		} catch {
			setRecordingError(
				'Recording upload failed. Keep this page open and retry.',
			)
			setSaving(false)
			busyRef.current = false
			return
		}
		setSaving(false)
		queue.record(
			'navigation',
			{ from: stage.name, to: experiment.stages[targetIndex ?? stageIndex + 1]?.name, triggeredBy: 'participant', recording },
			stage.id,
		)
		if (!choosingStage && stageIndex >= experiment.stages.length - 1) {
			await finishSession('finish')
			busyRef.current = false
			return
		}
		approvedRef.current = null
		busyRef.current = false
		const nextIndex = targetIndex ?? stageIndex + 1
		stageTimes.current[stage.id] = remaining
		setStageIndex(nextIndex)
		if (!allowFreeOrder) setSelections({})
		setRemaining(
			stageTimes.current[experiment.stages[nextIndex].id] ?? Math.max(1, experiment.stages[nextIndex].countdownMinutes) * 60,
		)
	}

	const startRecording = async (kind: RecordingKind) => {
		if (startingRef.current[kind] || paused || busyRef.current) return
		startingRef.current[kind] = true
		try {
			const controllers = controllersRef.current
			if (
				controllers[kind]?.status === 'requesting' ||
				controllers[kind]?.status === 'active'
			)
				return
			try {
				if (controllers[kind]) await controllers[kind].finish(true)
			} catch {
				setRecordingError(
					'Pending recording could not be saved. Retry when connected.',
				)
				return
			}
			if (!aliveRef.current || activeStageRef.current !== stage.id) return
			const retainedStream = controllers[kind]?.takeStream()
			const recordingId = crypto.randomUUID()
			let offset = 0
			controllers[kind] = new RecordingController(
				kind,
				async (chunk) => {
					// Researcher preview exercises capture without uploading study data.
					if (previewOnly) return
					const sessionId = await ensureSession()
					await uploadRecording(
						sessionId,
						stage.id,
						recordingId,
						kind,
						offset,
						chunk,
					)
					offset += chunk.size
				},
				(status) => {
					if (aliveRef.current && activeStageRef.current === stage.id)
						setRecordingStatus((current) => ({
							...current,
							[kind]: status,
						}))
					queue.record('recording_stop', { kind, status }, stage.id)
					if (status === 'error')
						setRecordingError(
							'Recording or upload failed. Keep this page open and retry.',
						)
				},
			)
			const controller = controllers[kind]
			if (!controller) return

			setRecordingStatus((current) => ({
				...current,
				[kind]: 'requesting',
			}))
			setRecordingStageId(stage.id)
			setRecordingError('')
			const status = await controller.start(retainedStream)
			if (!aliveRef.current || activeStageRef.current !== stage.id) return
			setRecordingStatus((current) => ({ ...current, [kind]: status }))
			queue.record('recording_start', { kind, status }, stage.id)

			if (kind === 'self' && controller.stream && videoRef.current) {
				videoRef.current.srcObject = controller.stream
				await videoRef.current.play().catch(() => undefined)
			}
		} finally {
			startingRef.current[kind] = false
		}
	}

	const stopRecording = (kind: RecordingKind) => {
		const controller = controllersRef.current[kind]
		controller?.stop()
		setRecordingStatus((current) => ({ ...current, [kind]: 'stopped' }))

		if (kind === 'self' && videoRef.current)
			videoRef.current.srcObject = null
	}

	// Answers are written straight into the event timeline so the exported JSON
	// reflects what the participant actually selected / typed.
	const recordAnswer = (componentId: string, value: string | string[]) => {
		queue.record('answer', { componentId, value }, stage.id)
	}

	const toggleChoice = (
		componentId: string,
		option: string,
		multi: boolean,
	) => {
		if (!canEditAnswers()) return
		const currentValue = selections[componentId]
		const list = Array.isArray(currentValue) ? currentValue : []
		const nextValue: string | string[] = multi
			? list.includes(option)
				? list.filter((item) => item !== option)
				: [...list, option]
			: option
		setSelections((current) => ({ ...current, [componentId]: nextValue }))
		recordAnswer(componentId, nextValue)
	}

	const setRating = (componentId: string, option: string) => {
		if (!canEditAnswers()) return
		setSelections((current) => ({ ...current, [componentId]: option }))
		recordAnswer(componentId, option)
	}

	const setText = (componentId: string, value: string) => {
		if (!canEditAnswers()) return
		setSelections((current) => ({ ...current, [componentId]: value }))
	}

	/** Free-text answers are logged on blur (not per keystroke) to keep the
	 *  timeline readable and localStorage small. */
	const commitText = (componentId: string) => {
		const value = selections[componentId]
		if (typeof value === 'string' && value.trim().length > 0) {
			recordAnswer(componentId, value)
		}
	}

	// Also protect delayed attachment reads after recording has stopped.
	const canEditAnswers = () =>
		!busyRef.current &&
		!paused &&
		(!requiresFullscreen ||
			document.fullscreenElement === document.documentElement) &&
		(!requiresScreen || controllersRef.current.screen?.status === 'active')

	// A consent stage is rendered through ConsentView (its own copy + signature
	// pad + confirm button), so the plain text blocks and the generic consent
	// button are not duplicated below it.
	// Case-insensitive: stage types come from the researcher editor, the seeded
	// demo experiments ('Consent') and API round-trips, and casing has varied
	// between them. A strict lowercase compare silently skipped the signature
	// pad, so consent was recorded without the signature image (P1).
	const isConsent = stage.type.toLowerCase() === 'consent'
	const consentLines = stage.components
		.filter((component) => component.type === 'text')
		.map((component) => component.label)
	const visibleComponents = isConsent
		? stage.components.filter(
				(component) =>
					component.type !== 'text' && component.type !== 'button',
			)
		: stage.components

	const handleConsent = (signatureDataUrl: string, accepted = true) => {
		setConsentedStageId(accepted ? stage.id : null)
		queue.record('consent', { accepted }, stage.id)
		// Store the complete signature image (data URL), not just its length, so it
		// lands on the backend with the rest of the session timeline (P1).
		queue.record(
			'answer',
			{
				componentId: 'consent',
				consent: accepted,
				signatureDataUrl,
			},
			stage.id,
		)
	}

	const wantsSelfVideo = stage.features.selfie || stage.recordingRequired
	const wantsScreen = stage.features.screenRecording

	// The stage body (everything except the AI rail and the footer) is shared by
	// both the single-column and split layouts.
	const stageBody = (
		<>
			<div className="participant-meta">
				<span className="section-tag">{stage.type.toUpperCase()}</span>
				{stage.features.clock && (
					<span className="stage-clock">
						{new Date().toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
						})}
					</span>
				)}
				{stage.features.timer && (
					<span className="stage-timer">
						<TimerReset size={13} /> {minutes}:{seconds}
					</span>
				)}
			</div>

			<h1>{stage.name}</h1>
			{!isConsent &&
				stage.materials?.map((material) => (
					<button
						className="secondary-button"
						disabled={interactionLocked || paused || saving}
						key={material.id}
						onClick={() =>
							void downloadFile(
								`/experiments/${experiment.id}/stages/${stage.id}/materials/${material.id}`,
								material.name,
							).catch(() =>
								setRecordingError(
									'Could not download study material.',
								),
							)
						}
					>
						{material.name}
					</button>
				))}
			{saving && <p role="status">Saving recording…</p>}
			{stage.recordingMode === 'auto' &&
				(wantsScreen || wantsSelfVideo) && (
					<p>
						Recording starts after browser permission. If prompted
						to try again, use the recording Start button.
					</p>
				)}

			{stage.features.ai && (
				<div className="ai-banner">
					<MessageCircle size={15} />
					<span>
						<strong>AI assistance is enabled</strong>
						<small>
							Your interaction history is timestamped and saved.
						</small>
					</span>
				</div>
			)}

			{/* Consent stages get a real signature pad + consent record. */}
			{isConsent && (
				<ConsentView
					key={stage.id}
					text={consentLines}
					onConsent={handleConsent}
				/>
			)}

			{/* MS-Forms-style stage content */}
			<fieldset
				disabled={interactionLocked || paused || saving}
				inert={interactionLocked || paused || saving}
				style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
			>
				{visibleComponents.map((component, componentIndex) => {
					if (component.type === 'text') {
						return (
							<p
								className="participant-component participant-text"
								key={component.id}
							>
								{component.label}
							</p>
						)
					}

					const questionNumber =
						visibleComponents
							.slice(0, componentIndex)
							.filter((c) => c.type !== 'text').length + 1
					const selected = selections[component.id]

					return (
						<div className="ms-question" key={component.id}>
							<div className="ms-q-head">
								<span className="ms-q-number">
									{questionNumber}
								</span>
								<span className="ms-q-title">
									{component.label}
									{(stage.requiredFeatures?.[
										component.type === 'signature'
											? 'signatureBox'
											: component.type === 'attachment'
												? 'attachment'
												: 'questionnaire'
									] ??
										component.required) && (
										<em>Required</em>
									)}
								</span>
							</div>
							<div className="ms-q-body">
								{component.type === 'textbox' && (
									<textarea
										className="ms-textbox"
										placeholder="Type your response..."
										value={
											typeof selected === 'string'
												? selected
												: ''
										}
										onChange={(event) =>
											setText(
												component.id,
												event.target.value,
											)
										}
										onBlur={() => commitText(component.id)}
									/>
								)}

								{component.type === 'rating' && (
									<div className="ms-rating">
										{component.options?.map((option) => (
											<button
												key={option}
												className={
													selected === option
														? 'active'
														: ''
												}
												onClick={() =>
													setRating(
														component.id,
														option,
													)
												}
											>
												{option}
											</button>
										))}
									</div>
								)}

								{(component.type === 'choice' ||
									component.type === 'checkbox' || component.type === 'true_false') && (
									<div className="ms-options">
										{(component.type === 'true_false' ? ['True', 'False'] : component.options)?.map((option) => {
											const isChecked =
												component.type === 'checkbox'
													? Array.isArray(selected) &&
														(
															selected as string[]
														).includes(option)
													: selected === option
											return (
												<button
													key={option}
													className={`ms-option${component.type === 'checkbox' ? ' is-check' : ''}${isChecked ? ' is-selected' : ''}`}
													onClick={() =>
														toggleChoice(
															component.id,
															option,
															component.type ===
																'checkbox',
														)
													}
												>
													<span className="ms-dot"></span>
													{option}
												</button>
											)
										})}
									</div>
								)}

								{component.type === 'signature' && (
									<div className="signature-box">
										<PenLine size={18} />
										<input
											aria-label={component.label}
											placeholder="Type your signature"
											value={
												typeof selected === 'string'
													? selected
													: ''
											}
											onChange={(event) =>
												setText(
													component.id,
													event.target.value,
												)
											}
										/>
									</div>
								)}

								{component.type === 'attachment' && (
									<div
										className={`attachment-input${attachments[component.id] ? ' has-file' : ''}`}
									>
										<label className="attachment-drop">
											<Paperclip size={16} />
											<span>
												{attachments[component.id]
													? attachments[component.id]
													: 'Choose a file to upload'}
											</span>
											<input
												type="file"
												className="attachment-file"
												onChange={(event) => {
													if (!canEditAnswers())
														return
													const file =
														event.target.files?.[0]
													if (!file) return
													const reader =
														new FileReader()
													reader.onload = () => {
														if (!canEditAnswers())
															return
														const dataUrl =
															typeof reader.result ===
															'string'
																? reader.result
																: ''
														setText(
															component.id,
															dataUrl,
														)
														setAttachments(
															(current) => ({
																...current,
																[component.id]:
																	file.name,
															}),
														)
														// Record the full file as a base64 data URL so the
														// attachment lands on the backend with the session (P1).
														queue.record(
															'answer',
															{
																componentId:
																	component.id,
																value: dataUrl,
																fileName:
																	file.name,
																mimeType:
																	file.type,
																size: file.size,
															},
															stage.id,
														)
													}
													reader.readAsDataURL(file)
												}}
											/>
										</label>
									</div>
								)}

								{component.type === 'button' && (
									<button
										className="primary-button"
										disabled={
											saving ||
											interactionLocked ||
											paused ||
											(isConsent &&
												consentedStageId !== stage.id)
										}
										onClick={next}
									>
										{component.label}{' '}
										<ArrowRight size={15} />
									</button>
								)}
							</div>
						</div>
					)
				})}
			</fieldset>

			{/* Media capture controls — self video/audio and (optional) screen. */}
			{(wantsSelfVideo || wantsScreen) && (
				<div className="capture-panel">
					<div className="capture-head">
						This stage records your activity
					</div>
					{wantsSelfVideo && (
						<div className="capture-row">
							<span className="capture-label">
								<Video size={14} /> Self video / audio
							</span>
							<span className="capture-badge">
								{statusLabel(recordingStatus.self ?? 'idle')}
							</span>
							{recordingStatus.self === 'active' ? (
								<button
									className="secondary-button"
									onClick={() => stopRecording('self')}
								>
									<Square size={13} /> Stop
								</button>
							) : (
								<button
									className="secondary-button"
									onClick={() => void startRecording('self')}
								>
									<Video size={13} /> Start
								</button>
							)}
						</div>
					)}
					{wantsSelfVideo && recordingStatus.self === 'active' && (
						<video
							className="capture-video"
							ref={videoRef}
							muted
							playsInline
						/>
					)}
					{wantsScreen && (
						<div className="capture-row">
							<span className="capture-label">
								<MonitorPlay size={14} /> Screen recording
							</span>
							<span className="capture-badge">
								{statusLabel(recordingStatus.screen ?? 'idle')}
							</span>
							{recordingStatus.screen === 'active' ? (
								requiresScreen ? null : (
									<button
										className="secondary-button"
										onClick={() => stopRecording('screen')}
									>
										<Square size={13} /> Stop
									</button>
								)
							) : (
								<button
									className="secondary-button"
									disabled={
										recordingStatus.screen ===
											'requesting' ||
										saving ||
										paused
									}
									onClick={() =>
										void startRecording('screen')
									}
								>
									<MonitorPlay size={13} />{' '}
									{requiresScreen
										? 'Enable screen recording'
										: 'Start'}
								</button>
							)}
						</div>
					)}
				</div>
			)}
		</>
	)

	const footer = (
		<div className="participant-footer">
			<span>
				{stage.features.copyPaste
					? 'Copy-paste logging on'
					: 'No copy-paste capture on this stage'}{' '}
				· {queue.count()} events captured this session
			</span>
			<div className="participant-actions">
				{stage.features.pauseAbort && (
					<>
						<button
							className="secondary-button"
							onClick={() => {
								queue.record('pause', {}, stage.id)
								setPaused(true)
							}}
						>
							<Pause size={14} /> Pause
						</button>
						<button
							className="abort-button"
							onClick={() => void finishSession('abort')}
						>
							<CircleStop size={14} /> Abort
						</button>
					</>
				)}
				{stageIndex < experiment.stages.length - 1 ? (
					<button
						className="primary-button"
						disabled={
							saving ||
							interactionLocked ||
							paused ||
							(isConsent && consentedStageId !== stage.id)
						}
						onClick={next}
					>
						Next stage <ArrowRight size={15} />
					</button>
				) : (
					<button
						className="primary-button"
						disabled={
							saving ||
							interactionLocked ||
							paused ||
							(isConsent && consentedStageId !== stage.id)
						}
						onClick={() => void advance(false)}
					>
						Finish <CheckSquare size={15} />
					</button>
				)}
			</div>
		</div>
	)

	return (
		<section className="participant-view">
			<div inert={fullscreenLocked}>
				<div className="participant-top">
					<button
						className="back-link"
						onClick={onBack}
					>
						<ArrowLeft size={16} />{' '}
						{previewOnly ? 'Back to experiment' : 'Back to sign in'}
					</button>
					<span className="preview-label">
						<span className="live-dot"></span>{' '}
						{previewOnly
							? 'Researcher preview · Answers and recordings are not saved'
							: 'Participant session'}
					</span>
					<span>{experiment.code}</span>
				</div>

				<div
					className={
						stage.features.ai
							? 'participant-body participant-body-wide'
							: 'participant-body'
					}
				>
					{recordingError &&
						recordingErrorVisible &&
						!fullscreenLocked && (
							<Alert
								key={recordingErrorRevision}
								className="participant-error transient-notice"
								type="error"
								showIcon
								title={recordingError}
							/>
						)}
					{validationError && (
						<Alert
							key={validationAttempt}
							className="participant-validation"
							type="error"
							showIcon
							title={validationError}
						/>
					)}
					{/* Mockup-style step header: eyebrow label + segmented progress bar */}
					{allowFreeOrder && !isConsent && (
						<label className="participant-stage-picker">
							Go to stage
							<select value={stageIndex} disabled={saving || paused || interactionLocked}
								onChange={(event) => void advance(false, Number(event.target.value))}>
								{experiment.stages.map((item, index) => item.type.toLowerCase() !== 'consent' &&
									<option key={item.id} value={index}>{index + 1}. {item.name}</option>)}
							</select>
						</label>
					)}
					<div className="step-eyebrow">
						Step {stageIndex + 1} · {stage.name}
					</div>
					<div className="progress-segments">
						{experiment.stages.map((s, i) => (
							<i
								key={s.id}
								className={i <= stageIndex ? 'done' : ''}
							></i>
						))}
					</div>

					{stage.features.ai ? (
						<div className="participant-split">
							<div className="participant-card">
								{stageBody}
								{footer}
							</div>
							<aside className="ai-sidebar">
								<AIChat
									disabled={
										interactionLocked || paused || saving
									}
									key={stage.id}
									stageId={stage.id}
									getSessionId={
										previewOnly ? undefined : ensureSession
									}
									onFailure={(message, partialText) =>
										queue.record(
											'ai_error',
											{ message, partialText },
											stage.id,
										)
									}
									contextLabel={stage.name}
									onUserMessage={(text) =>
										queue.record(
											'ai_prompt',
											{ chars: text.length, text },
											stage.id,
										)
									}
									onAssistantReply={(text) =>
										queue.record(
											'ai_reply',
											{ chars: text.length, text },
											stage.id,
										)
									}
								/>
							</aside>
						</div>
					) : (
						<div className="participant-card">
							{stageBody}
							{footer}
						</div>
					)}
				</div>

				{paused && (
					<div className="pause-overlay">
						<div className="pause-dialog">
							<Pause size={25} />
							<h2>Session paused</h2>
							<p>
								Your timer and capture features are paused.
								Resume when you are ready.
							</p>
							<button
								className="primary-button"
								onClick={() => {
									queue.record('resume', {}, stage.id)
									setPaused(false)
								}}
							>
								Resume session <Play size={15} />
							</button>
						</div>
					</div>
				)}

				{/* Countdown elapsed: the participant must explicitly continue (they
          stay on this stage until the button is clicked). */}
				{stage.features.timer &&
					remaining === 0 &&
					!paused &&
					!interactionLocked && (
						<div className="pause-overlay">
							<div className="pause-dialog">
								<TimerReset size={25} />
								<h2>Time is up</h2>
								<p>
									The countdown for “{stage.name}” has
									finished. Your work on this stage is saved.
									Click below to continue — until then you
									will stay on this page.
								</p>
								<button
									className="primary-button"
									onClick={() => advance(true)}
								>
									{stageIndex < experiment.stages.length - 1
										? 'Continue to next stage'
										: 'Finish experiment'}{' '}
									<ArrowRight size={15} />
								</button>
							</div>
						</div>
					)}
			</div>
			{fullscreenLocked && (
				<div
					className="pause-overlay"
					role="dialog"
					aria-modal="true"
					aria-labelledby="fullscreen-title"
				>
					<div className="pause-dialog">
						<h2 id="fullscreen-title">Full-screen mode required</h2>
						<p>
							Your answers are kept. Return to full screen to
							continue this study.
						</p>
						{fullscreenError && fullscreenErrorVisible && (
							<p
								key={fullscreenErrorRevision}
								className="entry-error transient-notice"
								role="alert"
							>
								{fullscreenError}
							</p>
						)}
						<button
							className="primary-button"
							disabled={fullscreenBusy}
							onClick={() => void restoreFullscreen()}
						>
							{fullscreenBusy
								? 'Entering full screen…'
								: 'Return to full screen'}
						</button>
						<button
							className="back-link"
							disabled={fullscreenBusy || saving}
							onClick={() => void finishSession('abort')}
						>
							Exit experiment
						</button>
						{recordingError && recordingErrorVisible && (
							<Alert
								key={recordingErrorRevision}
								className="participant-error transient-notice"
								type="error"
								showIcon
								title={recordingError}
							/>
						)}
					</div>
				</div>
			)}
		</section>
	)
}
