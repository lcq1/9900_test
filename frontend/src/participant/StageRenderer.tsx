import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { Alert, Modal } from 'antd'
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
import { StageNavigation } from './StageNavigation'
import { ConsentView } from './ConsentView'
import { useTimerController, useTransientNotice } from './TimerController'
import { EventQueue, type ParticipantEvent } from './EventQueue'
import { readRuntimeProgress, saveRuntimeProgress, type RuntimeProgress } from './ProgressStore'
import {
	onStorageDegraded,
	safeGetItem,
	safeRemoveItem,
	safeSetItem,
	storageDegraded,
} from './safeStorage'
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
 * Wall-clock readout for stages with the clock feature on. It owns its own
 * interval so a ticking second does not re-render the whole stage, and the
 * minute display therefore keeps advancing even when no countdown is running.
 */
export function StageClock() {
	const [now, setNow] = useState(() => new Date())
	useEffect(() => {
		const id = window.setInterval(() => setNow(new Date()), 1000)
		return () => window.clearInterval(id)
	}, [])
	return (
		<span className="stage-clock" role="timer" aria-label="Current time">
			{now.toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit',
			})}
		</span>
	)
}

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
	initialProgress,
	initialEvents,
}: {
	experiment: Experiment
	participantCode: string
	onBack: () => void
	onComplete?: () => void
	previewOnly?: boolean
	initialSessionId?: string
	initialProgress?: RuntimeProgress
	initialEvents?: ParticipantEvent[]
}) {
	const [restored] = useState(() => {
 if (previewOnly || !initialSessionId) return undefined
 const local = readRuntimeProgress(initialSessionId)
 const saved = local && (!initialProgress || local.updatedAt > initialProgress.updatedAt) ? local : initialProgress
 if (saved) for (const [id, deadline] of Object.entries(saved.deadlines ?? {})) {
  const remaining = saved.remainingSeconds
  const frozen = saved.paused && experiment.stages[saved.stageIndex]?.id === id &&
    typeof remaining === 'number' && Number.isFinite(remaining) && remaining >= 0
  safeSetItem('p13-timer:' + initialSessionId + ':' + id, String(frozen ? Date.now() + remaining * 1000 : deadline))
 }
 return saved
})
const [conversations] = useState<Record<string, string>>(() => restored?.conversations ?? Object.fromEntries(experiment.stages.map(item => [item.id, crypto.randomUUID()])))
const checkpointRef = useRef<RuntimeProgress | null>(null)
const autosaveRef = useRef<Promise<unknown> | null>(null)
const finishingRef = useRef(false)
const [syncStatus, setSyncStatus] = useState('')
const [storageLimited, setStorageLimited] = useState(storageDegraded)
useEffect(() => onStorageDegraded(setStorageLimited), [])
	const [confirmation, setConfirmation] = useState<{ target?: number } | null>(null)
	const extensionUsed = useRef(new Set<string>(Object.keys(restored?.extended ?? {}).filter(id => restored?.extended[id])))
	const [extended, setExtended] = useState<Record<string, boolean>>(restored?.extended ?? {})
	const [oralIndex, setOralIndex] = useState(restored?.oralIndex ?? 0)
	const [oralStarted, setOralStarted] = useState(restored?.oralStarted ?? false)
	const [stageIndex, setStageIndex] = useState(Math.max(0, Math.min(Number.isInteger(restored?.stageIndex) ? restored!.stageIndex : 0, experiment.stages.length - 1)))
	const consentStage = experiment.stages.find((item) => item.type.toLowerCase() === 'consent')
	const allowFreeOrder = Boolean(experiment.stages[0]?.features.navigation)

	// Whether every required questionnaire question in a stage has been answered.
	// Used by the horizontal stage navigation to colour each step green/grey in
	// real time. Consent steps are "done" once the participant has signed.
	const isStageAnswered = (target: Experiment['stages'][number]) => {
		if (target.type.toLowerCase() === 'consent') return consentedStageId === target.id
		const required = target.components.filter(
			(c) =>
				!['text', 'button'].includes(c.type) &&
				(target.requiredFeatures?.[
					c.type === 'signature'
						? 'signatureBox'
						: c.type === 'attachment'
							? 'attachment'
							: 'questionnaire'
				] ??
					c.required),
		)
		return required.every((c) => {
			const value = selections[c.id]
			const filled = typeof value === 'string' ? value.trim() : value?.length
			if (!filled) return false
			if (
				c.otherOption &&
				(Array.isArray(value) ? value.includes(c.otherOption) : value === c.otherOption) &&
				!String(selections[c.id + ':other'] ?? '').trim()
			)
				return false
			return true
		})
	}
	const stageTimes = useRef<Record<string, number>>({})
	const [consentedStageId, setConsentedStageId] = useState<string | null>(
		restored?.consentedStageId ?? null,
	)
	const canJump = allowFreeOrder && (!consentStage || consentedStageId === consentStage.id)
	const [paused, setPaused] = useState(restored?.paused ?? false)
	const [selections, setSelections] = useState<
		Record<string, string | string[]>
	>(() => {
		const base: Record<string, string | string[]> = {
			...(restored?.answers ?? {}),
		}
		// A compact checkpoint can drop bulky inline media when browser storage
		// is full. The event timeline still carries every answer value, so use it
		// to restore anything missing locally (B2 + B3).
		for (const event of initialEvents ?? []) {
			if (event.type !== 'answer') continue
			const detail = event.detail as {
				componentId?: string
				value?: string | string[]
				consent?: boolean
			} | undefined
			const id = detail?.componentId
			if (!id || base[id] !== undefined) continue
			const value =
				detail?.value !== undefined
					? detail.value
					: detail?.consent
						? 'consented'
						: undefined
			if (value !== undefined) base[id] = value
		}
		return base
	})
	// Tracks the chosen file name per attachment component so the UI can show it
	// after a pick (the actual bytes are recorded into the event timeline).
	const [attachments, setAttachments] = useState<Record<string, string>>(restored?.attachments ?? {})

	// Stable per-session EventQueue (created once, never per render).
	const [queue] = useState(
		() => new EventQueue(previewOnly ? crypto.randomUUID() : initialSessionId ?? `${experiment.code}-${participantCode}`, initialEvents),
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
	// Ids of required questions that were still empty on the last "Continue"
	// attempt. Drives the red highlight on unanswered questions.
	const [missingIds, setMissingIds] = useState<string[]>([])
	const [missingQuestions, setMissingQuestions] = useState<string[]>([])
	const [showMissingModal, setShowMissingModal] = useState(false)
	useEffect(() => {
		if (!validationError) return
		// Hold for two seconds, then allow the CSS fade to finish.
		const timer = window.setTimeout(() => setValidationError(''), 2600)
		return () => window.clearTimeout(timer)
	}, [validationError, validationAttempt])
	// The "Time is up" dialog can be dismissed so the participant can return to
	// unanswered required questions instead of being trapped behind the overlay.
	const [timeUpDismissed, setTimeUpDismissed] = useState(false)
	// A validation failure raised while the dialog is open is mirrored into it:
	// the inline Alert has no z-index and is hidden behind the fixed overlay.
	const [timeUpMissing, setTimeUpMissing] = useState('')
	const [saving, setSaving] = useState(false)
	const busyRef = useRef(false)
	const approvedRef = useRef<{
		stageId: string
		recording: Record<string, boolean>
	} | null>(restored?.oralStarted && restored.deadlines?.[experiment.stages[restored.stageIndex]?.id] <= Date.now() ? { stageId: experiment.stages[restored.stageIndex].id, recording: { self: true, screen: false } } : null)

	/**
	 * The COMPLETE current answer state, used for every session submit.
	 *
	 * The backend replaces the whole session row on each submit (answers and
	 * events are deleted first), and a resumed session may have lost local
	 * events. Deriving answers from the timeline therefore silently dropped
	 * answers (B3). `selections` is the authoritative client-side state and
	 * already includes :other values and consent signatures.
	 */
	const collectAnswers = useCallback(
		(): ParticipantAnswer[] =>
			Object.entries(selections).map(([componentId, value]) => ({
				componentId,
				value,
			})),
		[selections],
	)

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
			finishingRef.current = true
			await autosaveRef.current
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
				finishingRef.current = false
				setRecordingError(
					'Recording upload failed. Keep this page open and retry.',
				)
				return
			}
			const events = queue.all()
			const answers: ParticipantAnswer[] = collectAnswers()
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
				finishingRef.current = false
				setRecordingError(
					error instanceof Error
						? `Session could not be saved. ${error.message} Keep this page open and retry.`
						: 'Session could not be saved. Keep this page open and retry.',
				)
				return
			}
			if (reason === 'finish' && initialSessionId) safeRemoveItem('p13-runtime:' + initialSessionId)
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
			initialSessionId,
			setRecordingError,
			collectAnswers,
		],
	)

	// Live countdown (minutes-based) for the Countdown Timer feature.
	const totalSeconds = Math.max(1, stage.countdownMinutes) * 60
	const { remaining, reset: setRemaining } = useTimerController({
		initialSeconds: totalSeconds,
		enabled:
			stage.features.timer && !paused && !interactionLocked && !saving && (!stage.sequentialQuestions || oralStarted),
		stageId: stage.id,
		storageKey: !previewOnly && initialSessionId && stage.features.timer ? 'p13-timer:' + initialSessionId + ':' + stage.id : undefined,
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

// Persist local edits immediately and mirror checkpoints through the existing session API.
useEffect(() => {
 if (previewOnly || !initialSessionId || finishingRef.current) return
 const deadlines: Record<string, number> = {}
 for (const item of experiment.stages) { const value = Number(safeGetItem('p13-timer:' + initialSessionId + ':' + item.id)); if (value) deadlines[item.id] = value }
 const progress: RuntimeProgress = { sessionId: initialSessionId, updatedAt: Date.now(), stageIndex, answers: selections, consentedStageId, attachments, extended, oralIndex, oralStarted, deadlines, conversations, paused, remainingSeconds: remaining }
 checkpointRef.current = progress
 saveRuntimeProgress(progress)
}, [previewOnly, initialSessionId, experiment.stages, stageIndex, selections, consentedStageId, attachments, extended, oralIndex, oralStarted, remaining, conversations, paused])
useEffect(() => {
 if (previewOnly || !initialSessionId) return
 const save = () => {
  if (finishingRef.current || autosaveRef.current || !checkpointRef.current) return
  const progress = checkpointRef.current
  queue.record('progress_checkpoint', { progress }, experiment.stages[progress.stageIndex].id)
  setSyncStatus('Saving progress…')
  autosaveRef.current = submitSession({ sessionId: initialSessionId, experimentCode: experiment.code, participantCode, finishedAt: null, answers: Object.entries(progress.answers).map(([componentId, value]) => ({ componentId, value })), events: queue.all() }).then(() => setSyncStatus('Progress saved.')).catch(() => setSyncStatus('Progress saved on this browser. Server sync failed; retrying.')).finally(() => { autosaveRef.current = null })
 }
 const id = window.setInterval(save, 3000)
 window.addEventListener('pagehide', save)
 return () => { clearInterval(id); window.removeEventListener('pagehide', save); save() }
}, [previewOnly, initialSessionId, experiment.code, experiment.stages, participantCode, queue])
	const minutes = String(Math.floor(remaining / 60)).padStart(2, '0')
	const seconds = String(remaining % 60).padStart(2, '0')

	// The countdown overlay stays until the participant acts on it. Once
	// dismissed it must remain hidden for this stage; a new stage resets it so
	// its own timer can show the overlay again. Validation failures are copied
	// into the dialog because the inline Alert is covered by the overlay.
	const extensionMinutes = stage.extensionMinutes ?? 30
	const extensionAvailable = Boolean(stage.features.timer && stage.allowExtension && !extended[stage.id])
	const extensionButton = extensionAvailable && (
		<button className="secondary-button" disabled={saving || paused || interactionLocked}
			onClick={() => Modal.confirm({
				rootClassName: 'participant-modal',
				centered: true,
				title: 'Researcher approval required',
				content: `Confirm only after the researcher agrees to add ${extensionMinutes} minutes.`,
				onOk: () => {
					if (extensionUsed.current.has(stage.id)) return
					extensionUsed.current.add(stage.id)
					setExtended((current) => ({ ...current, [stage.id]: true }))
					setRemaining((value) => value + extensionMinutes * 60)
					queue.record('timer_extension', { minutes: extensionMinutes, researcherApprovalConfirmed: true }, stage.id)
				},
			})}>
			Extend by {extensionMinutes} {extensionMinutes === 1 ? 'minute' : 'minutes'}
		</button>
	)

	const timeUpVisible = Boolean(
		stage.features.timer &&
			remaining === 0 &&
			!paused &&
			!interactionLocked &&
			!timeUpDismissed,
	)
	useEffect(() => {
		setTimeUpDismissed(false)
		setTimeUpMissing('')
	}, [stage.id])
	useEffect(() => {
		if (timeUpVisible && validationError) setTimeUpMissing(validationError)
	}, [timeUpVisible, validationError])

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

	// Reset the viewport after a successful stage change has rendered.
	useEffect(() => {
		window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
	}, [stage.id])

	// Record every stage transition (including the first render).
	useEffect(() => {
		queue.record('stage_view', { stageName: stage.name }, stage.id)
	}, [queue, stage.id, stage.name])

	// Record a milestone once the countdown for this stage elapses.
	useEffect(() => {
		if (stage.features.timer && remaining === 0) {
			if (stage.sequentialQuestions && controllersRef.current.self?.status === 'active') {
				approvedRef.current = { stageId: stage.id, recording: { self: true, screen: controllersRef.current.screen?.status === 'active' } }
				controllersRef.current.self.stop()
			}

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
		stage.sequentialQuestions,
		stage.id,
		stage.name,
		queue,
	])

	// Real copy/paste logging while this stage has the feature enabled.
	useEffect(() => {
		if (!stage.features.copyPaste || paused) return
		const handleCopy = (event: ClipboardEvent) => {
			const field = event.target
			if (field instanceof HTMLInputElement && field.type === 'password') return
			const text = (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)
				&& field.selectionStart !== null && field.selectionEnd !== null
				? field.value.slice(field.selectionStart, field.selectionEnd)
				: window.getSelection()?.toString() ?? ''
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
			stage.recordingMode === 'auto' && !stage.sequentialQuestions &&
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

	// Clear the red highlight from a question as soon as the participant fills
	// it in, so the "unanswered" marker tracks their progress in real time.
	useEffect(() => {
		if (!missingIds.length) return
		const remaining = missingIds.filter((id) => {
			const value = selections[id]
			return !(typeof value === 'string' ? value.trim() : value?.length)
		})
		if (remaining.length !== missingIds.length) setMissingIds(remaining)
	}, [selections, missingIds])

	const next = () => advance(false)

	/**
	 * Move to the next stage (or finish on the last one).
	 * `skipConfirm` bypasses the double-confirm dialog — used by the
	 * time-is-up modal, which is itself an explicit user action.
	 */
	const advance = async (skipConfirm: boolean, targetIndex?: number, triggeredBy = 'participant') => {
		if (busyRef.current) return
		const choosingStage = targetIndex !== undefined
		if (choosingStage && ((consentStage && consentedStageId !== consentStage.id) || stage.type.toLowerCase() === 'consent' ||
			!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= experiment.stages.length ||
			targetIndex === stageIndex || experiment.stages[targetIndex].type.toLowerCase() === 'consent')) return
		if (stage.sequentialQuestions && remaining > 0 && oralIndex < stage.components.filter(c => c.type === 'text').length - 1) { setValidationError('Please answer every explanation question before submitting.'); return }
		setValidationError('')
		setValidationAttempt((attempt) => attempt + 1)
		// Drop any stale red highlight / missing prompt from a previous attempt.
		setMissingIds([])
		setShowMissingModal(false)
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
		const answers = [...stage.components.map((c) => ({
			componentId: c.id,
			value: selections[c.id] ?? '',
		})), ...stage.components.filter(c => c.otherOption).map(c => ({ componentId: c.id + ':other', value: selections[c.id + ':other'] ?? '' }))]
		if (stage.type.toLowerCase() === 'consent') answers.push({ componentId: 'consent', value: selections.consent ?? '' })
		const missingItems: { id: string; label: string }[] = stage.components
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
			.map((c) => ({ id: c.id, label: c.label }))
		for (const c of stage.components) {
			const value = selections[c.id]
			if (c.otherOption && (Array.isArray(value) ? value.includes(c.otherOption) : value === c.otherOption) && !String(selections[c.id + ':other'] ?? '').trim()) missingItems.push({ id: c.id + ':other', label: c.label + ' (please specify)' })
		}
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
			missingItems.push({ id: 'recording', label: 'Camera and microphone recording' })
		if (!choosingStage && canJump && stageIndex === experiment.stages.length - 1) {
			for (const other of experiment.stages) {
				if (other.id === stage.id || other.type.toLowerCase() === 'consent') continue
				for (const component of other.components) {
					if (['text', 'button'].includes(component.type)) continue
					const feature = component.type === 'signature' ? 'signatureBox' : component.type === 'attachment' ? 'attachment' : 'questionnaire'
					const value = selections[component.id]
					if ((other.requiredFeatures?.[feature] ?? component.required) &&
						!(typeof value === 'string' ? value.trim() : value?.length)) missingItems.push({ id: component.id, label: `${other.name}: ${component.label}` })
				}
			}
		}
		if ((!choosingStage && missingItems.length) || missingRequiredRecording) {
			const labels = missingItems.map((m) => m.label)
			setValidationError('Required: ' + labels.join(', '))
			setMissingIds(missingItems.map((m) => m.id))
			setMissingQuestions(labels)
			setShowMissingModal(true)
			return
		}
		if (!skipConfirm && stage.features.confirm) { setConfirmation({ target: targetIndex }); return }
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
			{ from: stage.name, to: experiment.stages[targetIndex ?? stageIndex + 1]?.name, triggeredBy, recording },
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
		setOralIndex(0)
		setOralStarted(false)
		setStageIndex(nextIndex)
		// Retain submitted answers for resuming this session.
		if (previewOnly || !initialSessionId) setRemaining(
			stageTimes.current[experiment.stages[nextIndex].id] ?? Math.max(1, experiment.stages[nextIndex].countdownMinutes) * 60,
		)
	}

	const advanceAfterExpiry = useEffectEvent(() => { void advance(true, undefined, 'timer') })
	useEffect(() => {
		if (timeUpVisible && stage.timerExpiry === 'advance' && !extensionAvailable)
			advanceAfterExpiry()
	}, [timeUpVisible, stage.id, stage.timerExpiry, extensionAvailable])

	const startRecording = async (kind: RecordingKind) => {
		if (startingRef.current[kind] || paused || busyRef.current || (stage.sequentialQuestions && remaining === 0)) return
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
			if (kind === 'self' && status === 'active' && stage.sequentialQuestions) { setOralStarted(true); queue.record('oral_question', { question: oralIndex + 1, recordingId }, stage.id) }

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
		: stage.sequentialQuestions ? stage.components.filter(c => c.type === 'text').filter((_, i) => i === oralIndex) : stage.components

	const handleConsent = (signatureDataUrl: string, accepted = true) => {
		setSelections(current => ({ ...current, consent: accepted ? signatureDataUrl : '' }))
		setConsentedStageId(accepted ? stage.id : null)
		queue.record('consent', { accepted, signingMethod: stage.signingMethod ?? 'handwritten', record: signatureDataUrl, document: consentLines }, stage.id)
		// Store the complete signature image (data URL), not just its length, so it
		// lands on the backend with the rest of the session timeline (P1).
		queue.record(
			'answer',
			{
				componentId: 'consent',
				consent: accepted,
				value: signatureDataUrl,
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
				{stage.features.clock && <StageClock />}
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
{syncStatus && !saving && <p role="status">{syncStatus}</p>}
			{storageLimited && (
				<Alert
					className="participant-storage-notice"
					type="warning"
					showIcon
					title="Browser storage is full. Progress is still saved to the study server; keep this page open."
				/>
			)}
			{stage.recordingMode === 'auto' &&
				(wantsScreen || wantsSelfVideo) && (
					<p>
						Recording starts after browser permission. If prompted
						to try again, use the recording Start button.
					</p>
				)}

			{(stage.features.ai && stage.type !== 'video_oral_answer') && (
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
 initialValue={typeof selections.consent === 'string' ? selections.consent : undefined}
 signingMethod={stage.signingMethod} clauses={stage.consentClauses}
					onConsent={handleConsent}
				/>
			)}

			{stage.sequentialQuestions && <div className="oral-progress"><p>Question {oralIndex + 1} of {stage.components.filter(c => c.type === 'text').length} · Shared time: {minutes}:{seconds}</p><button className="secondary-button" disabled={!oralStarted || saving || paused || interactionLocked || oralIndex >= stage.components.filter(c => c.type === 'text').length - 1} onClick={() => { queue.record('oral_question', { from: oralIndex + 1, to: oralIndex + 2 }, stage.id); setOralIndex(i => i + 1) }}>Next question</button></div>}
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
					<div className={'ms-question' + (missingIds.includes(component.id) ? ' missing-required' : '')} key={component.id}>
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

								{component.otherOption && (Array.isArray(selected) ? selected.includes(component.otherOption) : selected === component.otherOption) && <label>Please specify<input aria-label={component.label + ' (please specify)'} value={String(selections[component.id + ':other'] ?? '')} onChange={event => setText(component.id + ':other', event.target.value)} onBlur={() => commitText(component.id + ':other')} /></label>}
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
							{recordingStatus.self === 'active' ? stage.sequentialQuestions ? null : (
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
			<span className="participant-footer-status">
				{stage.type === 'instruction'
					? `Stage ${stageIndex + 1} of ${experiment.stages.length}`
					: `${stage.features.copyPaste ? 'Copy-paste logging on' : 'No copy-paste capture on this stage'} · ${queue.count()} events captured this session`}
			</span>
			<div className="participant-actions">{extensionButton}
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
		<section className="participant-view"><Modal rootClassName="participant-modal" open={confirmation !== null} centered title="Submit this stage?" okText="Yes, I'm sure" cancelText="No, not sure" onCancel={() => setConfirmation(null)} onOk={() => { const target = confirmation?.target; setConfirmation(null); void advance(true, target) }}><p>Ready to submit? Once submitted, you cannot return to this stage.</p></Modal>
			<Modal rootClassName="participant-modal" open={showMissingModal} centered title="Some questions still need answers" onCancel={() => setShowMissingModal(false)} footer={[<button key="ok" className="primary-button" onClick={() => setShowMissingModal(false)}>Got it</button>]}>{missingQuestions.length > 0 && (<><p className="missing-modal-intro">You still have {missingQuestions.length} question{missingQuestions.length === 1 ? '' : 's'} to complete before continuing:</p><ul className="missing-question-list">{missingQuestions.map((q, i) => (<li key={i}>{q}</li>))}</ul></>)}</Modal>
			<div inert={fullscreenLocked}>
				<div className="participant-top">
					<button
						className="back-link"
						onClick={() => void finishSession('abort')}
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
					<strong>{experiment.name}</strong>
				</div>

				<div
					className={
						(stage.features.ai && stage.type !== 'video_oral_answer')
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
					{validationError && !timeUpVisible && (
						<Alert
							key={validationAttempt}
							className="participant-validation"
							type="error"
							showIcon
							title={validationError}
						/>
					)}
					{/* Mockup-style step header: eyebrow label + segmented progress bar */}
					{canJump && !isConsent && (
						<label className="participant-stage-picker">
							Go to stage
							<select value={stageIndex} disabled={saving || paused || interactionLocked}
								onChange={(event) => void advance(false, Number(event.target.value))}>
								{experiment.stages.map((item, index) => item.type.toLowerCase() !== 'consent' &&
									<option key={item.id} value={index}>{index + 1}. {item.name}</option>)}
							</select>
						</label>
					)}
					<div className="participant-question-layout">
                        <StageNavigation currentStep={stageIndex + 1} total={experiment.stages.length}>
								{experiment.stages.map((s, i) => {
									const answered = isStageAnswered(s)
									return (
										<button
											type="button"
											key={s.id}
											aria-label={s.name}
                                            title={s.name}
											aria-current={i === stageIndex ? 'step' : undefined}
											className={
												'qnav-item' +
												(answered ? ' done' : '') +
												(i === stageIndex ? ' current' : '')
											}
											disabled={
												i === stageIndex ||
												s.type.toLowerCase() === 'consent' ||
												isConsent ||
												saving ||
												paused ||
												interactionLocked
											}
											onClick={() => void advance(false, i)}
										>
											<span className="qnav-dot" aria-hidden="true" />
											<span className="qnav-num">{i + 1}</span>
											<span className="qnav-name">{s.name}</span>
										</button>
									)
								})}
                        </StageNavigation>
						<div className="participant-question-content">
							<div className="step-eyebrow">
								Step {stageIndex + 1} · {stage.name}
							</div>
							{(stage.features.ai && stage.type !== 'video_oral_answer') ? (
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
 initialConversationId={conversations[stage.id]}
 initialMessages={queue.all().filter(event => event.stageId === stage.id && (event.type === 'ai_prompt' || event.type === 'ai_reply')).map(event => ({ id: 'event-' + event.seq, role: event.type === 'ai_prompt' ? 'user' as const : 'assistant' as const, text: String(event.detail?.text ?? '') }))}
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
					</div>
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

				{/* Countdown elapsed: keep the participant here until they act, but never deadlock. */}
				{timeUpVisible && (
					<div className="pause-overlay">
						<div className="pause-dialog">
							<TimerReset size={25} />
							<h2>Time is up</h2>{extensionButton}
							<p>
								The countdown for “{stage.name}” has
								finished. Submit your work below to save it.
								Click below to continue — until then you
								will stay on this page.
							</p>
							{timeUpMissing && (
								<Alert
									className="time-up-requirements"
									type="error"
									showIcon
									title={timeUpMissing}
								/>
							)}
							<button
								className="primary-button"
								onClick={() => void advance(true)}
							>
								{stageIndex < experiment.stages.length - 1
									? 'Continue to next stage'
									: 'Finish experiment'}{' '}
								<ArrowRight size={15} />
							</button>
							<button
								className="back-link time-up-back"
								onClick={() => {
									setTimeUpDismissed(true)
									setTimeUpMissing('')
								}}
							>
								Back to questions
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
