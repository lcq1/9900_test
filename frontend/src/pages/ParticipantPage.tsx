import { useState } from 'react'
import type { Experiment } from '../types'
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import { ParticipantPreview } from '../participant/StageRenderer'

// Validate entry codes and open the preview; reuse valid codes from login.
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
	// Track access codes, validation errors, and the active experiment.
	const [experimentCode, setExperimentCode] = useState(initialExperimentCode ?? '')
	const [participantCode, setParticipantCode] = useState(initialParticipantCode ?? '')
	const [started, setStarted] = useState(false)
	const [error, setError] = useState('')
	const [active, setActive] = useState<Experiment | null>(null)

	if (started && active) return <ParticipantPreview experiment={active} onBack={onBack} />

	// Validate codes from login and open the preview if valid.
	let accessError = ''
	if (initialExperimentCode && initialParticipantCode) {
		// Reuse codes supplied by the login page.
		const match = experiments.find(
			(experiment) => experiment.code.toUpperCase() === initialExperimentCode.trim().toUpperCase(),
		)
		if (match && initialParticipantCode.trim().length >= 3) {
			// Open the preview when prefilled codes are valid.
			return <ParticipantPreview experiment={match} onBack={onBack} />
		}
		accessError = !match
			? 'We could not find an experiment with that code. Check it and try again.'
			: 'Please enter a participant code of at least 3 characters.'
	}

	// Find the experiment and validate the participant code before preview.
	const begin = () => {
		const match = experiments.find(
			(experiment) => experiment.code.toUpperCase() === experimentCode.trim().toUpperCase(),
		)
		if (!match) {
			// Reject entry if no experiment matches.
			setError('We could not find an experiment with that code. Check it and try again.')
			return
		}
		if (participantCode.trim().length < 3) {
			// Require at least three characters for the participant code.
			setError('Please enter a participant code of at least 3 characters.')
			return
		}
		setActive(match)
		setStarted(true)
	}

	// Render the current view.
	return (
		<section className="participant-view">
			{/* Participant instructions and preview exit. */}
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
				{/* Experiment and participant code inputs. */}
				<div className="participant-card entry-card">
					<span className="section-tag">START A STUDY</span>
					<h1>Enter your access codes</h1>
					<p className="entry-copy">
						Use the experiment code and participant code provided by your researcher. No account is
						created.
					</p>
					<label className="entry-label">
						Experiment code
						<input
							value={experimentCode}
							onChange={(event) => setExperimentCode(event.target.value.toUpperCase())}
							placeholder="e.g. DESIGN-7K2M"
						/>
					</label>
					<label className="entry-label">
						Participant code
						<input
							value={participantCode}
							onChange={(event) => setParticipantCode(event.target.value)}
							placeholder="e.g. P-1048"
						/>
					</label>
					{(error || accessError) !== '' && <p className="entry-error">{error || accessError}</p>}
					<button className="primary-button entry-button" onClick={begin}>
						Begin experiment <ArrowRight size={15} />
					</button>
					<p className="privacy-note">
						<ShieldCheck size={14} /> Your responses are only visible to the research team.
					</p>
				</div>
			</div>
		</section>
	)
}
