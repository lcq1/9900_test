import { useCallback, useEffect, useRef, useState } from 'react'
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
import { AIChat } from './AIChat'
import { ConsentView } from './ConsentView'
import { EventQueue } from './EventQueue'
import { submitSession, type ParticipantAnswer } from '../api/participant'
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
 *  - Media capture is stopped on every stage change / unmount.
 */
export function ParticipantPreview({
  experiment,
  participantCode,
  onBack,
}: {
  experiment: Experiment
  participantCode: string
  onBack: () => void
}) {
  const [stageIndex, setStageIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [selections, setSelections] = useState<Record<string, string | string[]>>({})
  // Tracks the chosen file name per attachment component so the UI can show it
  // after a pick (the actual bytes are recorded into the event timeline).
  const [attachments, setAttachments] = useState<Record<string, string>>({})

  // Stable per-session EventQueue (created once, never per render).
  const [queue] = useState(() => new EventQueue(`${experiment.code}-${Date.now()}`))

  const stage = experiment.stages[stageIndex]

  /**
   * Persist the captured session to the backend, then leave the runtime.
   *
   * This is the single convergence point for every exit (last-stage Finish,
   * the "Time is up" modal, the Abort button, and the Exit-preview link). It
   * derives the `answers` array from the `answer` events already in the queue,
   * stamps `finishedAt`, and POSTs the whole timeline. Submission is
   * best-effort: the local timeline is already persisted to localStorage, so a
   * transient server failure never loses participant data.
   */
  const finishSession = useCallback(
    async (reason: 'finish' | 'abort') => {
      if (reason === 'abort') {
        queue.record('abort', { stageName: stage.name }, stage.id)
      }
      const events = queue.all()
      const answers: ParticipantAnswer[] = events
        .filter((event) => event.type === 'answer' && event.detail?.componentId)
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
          experimentCode: experiment.code,
          participantCode,
          finishedAt: new Date().toISOString(),
          answers,
          events,
        })
      } catch {
        // Best-effort: local timeline is already persisted in localStorage.
      }
      onBack()
    },
    [queue, stage.id, stage.name, experiment.code, participantCode, onBack],
  )

  // Live countdown (minutes-based) for the Countdown Timer feature.
  const totalSeconds = Math.max(1, stage.countdownMinutes) * 60
  const [remaining, setRemaining] = useState(totalSeconds)

  const [recordingStatus, setRecordingStatus] = useState<
    Partial<Record<RecordingKind, RecordingStatus>>
  >({})
  // Recording controllers are imperative objects: kept in a ref and only ever
  // read inside handlers/effects, never during render.
  const controllersRef = useRef<Partial<Record<RecordingKind, RecordingController>>>({})
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!stage.features.timer || paused) return
    const id = setInterval(() => {
      setRemaining((value) => (value > 0 ? value - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [stage.features.timer, paused, stageIndex, totalSeconds])

  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0')
  const seconds = String(remaining % 60).padStart(2, '0')

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
      queue.record('copy', { chars: text.length, text: text.slice(0, 500) }, stage.id)
    }
    const handlePaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text') ?? ''
      queue.record('paste', { chars: text.length, text: text.slice(0, 500) }, stage.id)
    }
    document.addEventListener('copy', handleCopy)
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('paste', handlePaste)
    }
  }, [stage.features.copyPaste, paused, stage.id, queue])

  // Never leave the camera / microphone running when leaving a stage.
  useEffect(() => {
    const controllers = controllersRef.current
    return () => {
      ;(Object.keys(controllers) as RecordingKind[]).forEach((kind) => {
        controllers[kind]?.stop()
        delete controllers[kind]
      })
      setRecordingStatus({})
    }
  }, [stage.id])

  const next = () => advance(false)

  /**
   * Move to the next stage (or finish on the last one).
   * `skipConfirm` bypasses the double-confirm dialog — used by the
   * time-is-up modal, which is itself an explicit user action.
   */
  const advance = (skipConfirm: boolean) => {
    if (
      !skipConfirm &&
      stage.features.confirm &&
      !window.confirm('Are you sure you want to continue? You may not be able to return.')
    ) {
      return
    }
    queue.record('navigation', { from: stage.name, triggeredBy: 'participant' }, stage.id)
    if (stageIndex >= experiment.stages.length - 1) {
      void finishSession('finish')
      return
    }
    const nextIndex = stageIndex + 1
    setStageIndex(nextIndex)
    setSelections({})
    setRemaining(Math.max(1, experiment.stages[nextIndex].countdownMinutes) * 60)
  }

  const startRecording = async (kind: RecordingKind) => {
    const controllers = controllersRef.current
    if (!controllers[kind]) controllers[kind] = new RecordingController(kind)
    const controller = controllers[kind]
    if (!controller) return

    setRecordingStatus((current) => ({ ...current, [kind]: 'requesting' }))
    const status = await controller.start()
    setRecordingStatus((current) => ({ ...current, [kind]: status }))
    queue.record('recording_start', { kind, status }, stage.id)

    if (kind === 'self' && controller.stream && videoRef.current) {
      videoRef.current.srcObject = controller.stream
      await videoRef.current.play().catch(() => undefined)
    }
  }

  const stopRecording = (kind: RecordingKind) => {
    const controller = controllersRef.current[kind]
    controller?.stop()
    setRecordingStatus((current) => ({ ...current, [kind]: 'stopped' }))
    queue.record('recording_stop', { kind }, stage.id)
    if (kind === 'self' && videoRef.current) videoRef.current.srcObject = null
  }

  // Answers are written straight into the event timeline so the exported JSON
  // reflects what the participant actually selected / typed.
  const recordAnswer = (componentId: string, value: string | string[]) => {
    queue.record('answer', { componentId, value }, stage.id)
  }

  const toggleChoice = (componentId: string, option: string, multi: boolean) => {
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
    setSelections((current) => ({ ...current, [componentId]: option }))
    recordAnswer(componentId, option)
  }

  const setText = (componentId: string, value: string) => {
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
        (component) => component.type !== 'text' && component.type !== 'button',
      )
    : stage.components

  const handleConsent = (signatureDataUrl: string) => {
    // Store the complete signature image (data URL), not just its length, so it
    // lands on the backend with the rest of the session timeline (P1).
    queue.record(
      'answer',
      {
        componentId: 'consent',
        consent: true,
        signatureDataUrl,
      },
      stage.id,
    )
    next()
  }

  const wantsSelfVideo = stage.features.selfie
  const wantsScreen = stage.features.screenRecording

  // The stage body (everything except the AI rail and the footer) is shared by
  // both the single-column and split layouts.
  const stageBody = (
    <>
      <div className="participant-meta">
        <span className="section-tag">{stage.type.toUpperCase()}</span>
        {stage.features.clock && (
          <span className="stage-clock">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {stage.features.timer && (
          <span className="stage-timer">
            <TimerReset size={13} /> {minutes}:{seconds}
          </span>
        )}
      </div>

      <h1>{stage.name}</h1>

      {stage.features.ai && (
        <div className="ai-banner">
          <MessageCircle size={15} />
          <span>
            <strong>AI assistance is enabled</strong>
            <small>Your interaction history is timestamped and saved.</small>
          </span>
        </div>
      )}

      {/* Consent stages get a real signature pad + consent record. */}
      {isConsent && (
        <ConsentView text={consentLines} onConsent={handleConsent} />
      )}

      {/* MS-Forms-style stage content */}
      {visibleComponents.map((component, componentIndex) => {
        if (component.type === 'text') {
          return (
            <p className="participant-component participant-text" key={component.id}>
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
              <span className="ms-q-number">{questionNumber}</span>
              <span className="ms-q-title">
                {component.label}
                {component.required && <em>Required</em>}
              </span>
            </div>
            <div className="ms-q-body">
              {component.type === 'textbox' && (
                <textarea
                  className="ms-textbox"
                  placeholder="Type your response..."
                  value={typeof selected === 'string' ? selected : ''}
                  onChange={(event) => setText(component.id, event.target.value)}
                  onBlur={() => commitText(component.id)}
                />
              )}

              {component.type === 'rating' && (
                <div className="ms-rating">
                  {component.options?.map((option) => (
                    <button
                      key={option}
                      className={selected === option ? 'active' : ''}
                      onClick={() => setRating(component.id, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              {(component.type === 'choice' || component.type === 'checkbox') && (
                <div className="ms-options">
                  {component.options?.map((option) => {
                    const isChecked = component.type === 'checkbox'
                      ? Array.isArray(selected) && (selected as string[]).includes(option)
                      : selected === option
                    return (
                      <button
                        key={option}
                        className={`ms-option${component.type === 'checkbox' ? ' is-check' : ''}${isChecked ? ' is-selected' : ''}`}
                        onClick={() =>
                          toggleChoice(component.id, option, component.type === 'checkbox')
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
                  <span>Sign here</span>
                </div>
              )}

              {component.type === 'attachment' && (
                <div className={`attachment-input${attachments[component.id] ? ' has-file' : ''}`}>
                  <label className="attachment-drop">
                    <Paperclip size={16} />
                    <span>
                      {attachments[component.id] ? attachments[component.id] : 'Choose a file to upload'}
                    </span>
                    <input
                      type="file"
                      className="attachment-file"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          const dataUrl = typeof reader.result === 'string' ? reader.result : ''
                          setAttachments((current) => ({ ...current, [component.id]: file.name }))
                          // Record the full file as a base64 data URL so the
                          // attachment lands on the backend with the session (P1).
                          queue.record(
                            'answer',
                            {
                              componentId: component.id,
                              value: dataUrl,
                              fileName: file.name,
                              mimeType: file.type,
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
                <button className="primary-button" onClick={next}>
                  {component.label} <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Media capture controls — self video/audio and (optional) screen. */}
      {(wantsSelfVideo || wantsScreen) && (
        <div className="capture-panel">
          <div className="capture-head">This stage records your activity</div>
          {wantsSelfVideo && (
            <div className="capture-row">
              <span className="capture-label">
                <Video size={14} /> Self video / audio
              </span>
              <span className="capture-badge">
                {statusLabel(recordingStatus.self ?? 'idle')}
              </span>
              {recordingStatus.self === 'active' ? (
                <button className="secondary-button" onClick={() => stopRecording('self')}>
                  <Square size={13} /> Stop
                </button>
              ) : (
                <button className="secondary-button" onClick={() => void startRecording('self')}>
                  <Video size={13} /> Start
                </button>
              )}
            </div>
          )}
          {wantsSelfVideo && recordingStatus.self === 'active' && (
            <video className="capture-video" ref={videoRef} muted playsInline />
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
                <button className="secondary-button" onClick={() => stopRecording('screen')}>
                  <Square size={13} /> Stop
                </button>
              ) : (
                <button className="secondary-button" onClick={() => void startRecording('screen')}>
                  <MonitorPlay size={13} /> Start
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
            <button className="secondary-button" onClick={() => setPaused(true)}>
              <Pause size={14} /> Pause
            </button>
            <button className="abort-button" onClick={() => void finishSession('abort')}>
              <CircleStop size={14} /> Abort
            </button>
          </>
        )}
        {stageIndex < experiment.stages.length - 1 ? (
          <button className="primary-button" onClick={next}>
            Next stage <ArrowRight size={15} />
          </button>
        ) : (
          <button className="primary-button" onClick={() => void finishSession('finish')}>
            Finish <CheckSquare size={15} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <section className="participant-view">
      <div className="participant-top">
        <button className="back-link" onClick={() => void finishSession('abort')}>
          <ArrowLeft size={16} /> Exit preview
        </button>
        <span className="preview-label">
          <span className="live-dot"></span> Participant session
        </span>
        <span>{experiment.code}</span>
      </div>

      <div className={stage.features.ai ? 'participant-body participant-body-wide' : 'participant-body'}>
        {/* Mockup-style step header: eyebrow label + segmented progress bar */}
        <div className="step-eyebrow">
          Step {stageIndex + 1} · {stage.name}
        </div>
        <div className="progress-segments">
          {experiment.stages.map((s, i) => (
            <i key={s.id} className={i <= stageIndex ? 'done' : ''}></i>
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
                contextLabel={stage.name}
                onUserMessage={(text) =>
                  queue.record(
                    'ai_prompt',
                    { chars: text.length, text: text.slice(0, 500) },
                    stage.id,
                  )
                }
                onAssistantReply={(text) =>
                  queue.record(
                    'ai_reply',
                    { chars: text.length, text: text.slice(0, 500) },
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
            <p>Your timer and capture features are paused. Resume when you are ready.</p>
            <button className="primary-button" onClick={() => setPaused(false)}>
              Resume session <Play size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Countdown elapsed: the participant must explicitly continue (they
          stay on this stage until the button is clicked). */}
      {stage.features.timer && remaining === 0 && !paused && (
        <div className="pause-overlay">
          <div className="pause-dialog">
            <TimerReset size={25} />
            <h2>Time is up</h2>
            <p>
              The countdown for “{stage.name}” has finished. Your work on this stage is
              saved. Click below to continue — until then you will stay on this page.
            </p>
            <button className="primary-button" onClick={() => advance(true)}>
              {stageIndex < experiment.stages.length - 1
                ? 'Continue to next stage'
                : 'Finish experiment'}{' '}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
