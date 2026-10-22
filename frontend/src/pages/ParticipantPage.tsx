import { useState } from 'react'
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
}: {
  experiments: Experiment[]
  onBack: () => void
  initialExperimentCode?: string
  initialParticipantCode?: string
}) {
  const [experimentCode, setExperimentCode] = useState(initialExperimentCode ?? '')
  const [participantCode, setParticipantCode] = useState(initialParticipantCode ?? '')
  const [started, setStarted] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState<Experiment | null>(null)

  if (started && active) return <ParticipantPreview experiment={active} participantCode={participantCode} onBack={onBack} />

  // Codes supplied at sign-in: validate during render (no extra state/effect)
  // and either enter the runtime directly or surface the validation error here.
  let accessError = ''
  if (initialExperimentCode && initialParticipantCode) {
    const match = experiments.find(
      (experiment) => experiment.code.toUpperCase() === initialExperimentCode.trim().toUpperCase()
    )
    if (match && initialParticipantCode.trim().length >= 3) {
      return <ParticipantPreview experiment={match} participantCode={initialParticipantCode} onBack={onBack} />
    }
    accessError = !match
      ? 'We could not find an experiment with that code. Check it and try again.'
      : 'Please enter a participant code of at least 3 characters.'
  }

  const begin = () => {
    const match = experiments.find(
      (experiment) => experiment.code.toUpperCase() === experimentCode.trim().toUpperCase()
    )
    if (!match) {
      setError('We could not find an experiment with that code. Check it and try again.')
      return
    }
    if (participantCode.trim().length < 3) {
      setError('Please enter a participant code of at least 3 characters.')
      return
    }
    setActive(match)
    setStarted(true)
  }

  return (
    <section className="participant-view">
      <div className="participant-top">
        <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Exit preview</button>
        <span className="preview-label"><span className="live-dot"></span> Participant access</span>
        <span>No account required</span>
      </div>
      <div className="participant-body entry-body">
        <div className="participant-card entry-card">
          <span className="section-tag">START A STUDY</span>
          <h1>Enter your access codes</h1>
          <p className="entry-copy">Use the experiment code and participant code provided by your researcher. No account is created.</p>
          <label className="entry-label">Experiment code
            <input value={experimentCode} onChange={(event) => setExperimentCode(event.target.value.toUpperCase())} placeholder="e.g. DESIGN-7K2M" />
          </label>
          <label className="entry-label">Participant code
            <input value={participantCode} onChange={(event) => setParticipantCode(event.target.value)} placeholder="e.g. P-1048" />
          </label>
          {(error || accessError) !== '' && <p className="entry-error">{error || accessError}</p>}
          <button className="primary-button entry-button" onClick={begin}>Begin experiment <ArrowRight size={15} /></button>
          <p className="privacy-note"><ShieldCheck size={14} /> Your responses are only visible to the research team.</p>
        </div>
      </div>
    </section>
  )
}
