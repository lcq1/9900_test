import type { Stage, FeatureKey } from '../types'
import {
	Clock,
	Copy,
	MessageCircle,
	MonitorPlay,
	Pause,
	PenLine,
	ShieldCheck,
	TimerReset,
} from 'lucide-react'
const featureLabels = {
	ai: { label: 'AI chat', icon: MessageCircle },
	timer: { label: 'Countdown timer', icon: TimerReset },
	clock: { label: 'Stage clock', icon: Clock },
	screenRecording: { label: 'Screen recording', icon: MonitorPlay },
	copyPaste: { label: 'Copy-paste logging', icon: Copy },
	signatureBox: { label: 'Signature box', icon: PenLine },
	confirm: { label: 'Confirm before changing stage', icon: ShieldCheck },
	pauseAbort: { label: 'Pause and abort controls', icon: Pause },
}

// Configure stage features; copy/paste logging requires fill-in or short-answer stages.
export function StageFeatureEditor({
	stage,
	onUpdateStage,
	onPreview,
}: {
	stage: Stage
	onPreview?: () => void
	onUpdateStage: (update: (s: Stage) => Stage) => void
}) {
	if (stage.type.toLowerCase() === 'consent') {
		const typed = stage.signingMethod === 'name'
		const clauses = stage.consentClauses ?? []
		const hasText = stage.components.some((item) => item.type === 'text' && item.label.trim())
		const hasClauses = clauses.length > 0 && clauses.every((clause) => clause.trim())
		return <aside className="right-panel consent-settings-panel">
			<section className="consent-settings-section">
				<h3>Consent settings</h3>
				<label>
					Signing method
					<select value={stage.signingMethod ?? 'handwritten'} onChange={(event) => {
						const signingMethod = event.target.value === 'name' ? 'name' : 'handwritten'
						onUpdateStage((current) => ({ ...current, signingMethod }))
					}}>
						<option value="handwritten">Handwritten signature</option>
						<option value="name">Full legal name</option>
					</select>
				</label>
				<p>{typed ? 'Participants enter their legal name and accept each approved clause.' : 'Participants sign using the signature pad.'}</p>
				{typed && <label>
					Required consent clauses (one per line)
					<textarea rows={4} value={clauses.join('\n')} onChange={(event) => {
						const consentClauses = event.target.value.split('\n')
						onUpdateStage((current) => ({ ...current, consentClauses }))
					}} />
				</label>}
			</section>
			<section className="consent-settings-section">
				<h3>Readiness</h3>
				<ul>
					<li>{hasText ? '✓ Consent text added' : 'Add the consent text'}</li>
					{typed && <li>{hasClauses ? `✓ ${clauses.length} consent clauses entered` : 'Add approved clauses and remove blank lines'}</li>}
				</ul>
				{onPreview && <button type="button" className="secondary-button" onClick={onPreview}>Preview participant flow</button>}
			</section>
		</aside>
	}

	// Update one feature while preserving the others.
	const toggle = (key: FeatureKey, value: boolean) =>
		onUpdateStage((current) => ({
			...current,
			features: { ...current.features, [key]: value },
		}))

	// Allow copy/paste logging only for fill-in and short-answer stages.
	const copyPasteEnabled =
		stage.type === 'fill_blank' || stage.type === 'short_answer'
	const availableFeatures = Object.entries(featureLabels).filter(([key]) =>
		key !== 'copyPaste' || copyPasteEnabled,
	)

	const questionnaireRequired = stage.requiredFeatures?.questionnaire ??
		stage.components.some((component) =>
			!['text', 'button', 'signature', 'attachment'].includes(component.type) &&
			Boolean(component.required),
		)

	return (
		<aside className="right-panel">
			{/* Feature toggles and countdown minutes. */}
			<div className="right-section features">
				<div className="panel-heading">
					<span>STAGE FEATURES</span>
					<span className="feature-count">
						{
							availableFeatures.filter(
								([key]) => stage.features[key as FeatureKey],
							).length
						}
						/{availableFeatures.length}
					</span>
				</div>
				{stage.features.timer && (
					<>
						<label className="feature-row feature-option">
							<input type="checkbox" checked={stage.allowExtension ?? false}
								onChange={(event) => onUpdateStage((current) => ({ ...current, allowExtension: event.target.checked }))} />
							<span className="feature-label">Allow one extension</span>
						</label>
						{stage.allowExtension && <label className="feature-row feature-option feature-option-detail">
							<span className="feature-label">Extra minutes</span>
							<input className="minutes-input" type="number" min={1} max={1440} step={1}
								value={stage.extensionMinutes ?? 30}
								onChange={(event) => onUpdateStage((current) => ({ ...current, extensionMinutes: Number(event.target.value) }))} />
						</label>}
					</>
				)}
				{stage.features.timer && <label className="feature-row feature-option feature-option-detail">
					<span className="feature-label">When time expires</span>
					<select value={stage.timerExpiry ?? 'manual'} onChange={(event) => {
						const timerExpiry = event.target.value === 'advance' ? 'advance' : 'manual'
						onUpdateStage((current) => ({ ...current, timerExpiry }))
					}}>
						<option value="manual">Ask to continue</option>
						<option value="advance">Advance if ready</option>
					</select>
				</label>}

				{stage.type === 'video_oral_answer' && (
					<label className="feature-row feature-option">
						<input type="checkbox" checked={stage.sequentialQuestions ?? false}
							onChange={(event) => onUpdateStage((current) => ({
								...current, sequentialQuestions: event.target.checked,
								recordingMode: 'manual', countdownMinutes: 10,
								features: { ...current.features, ai: false, timer: true },
							}))} />
						<span className="feature-label">
							Show questions one at a time
							<small>Shared 10-minute countdown</small>
						</span>
					</label>
				)}
				<div className="feature-row">
					<span className="feature-label">Questionnaire required</span>
					<button
						type="button"
						role="switch"
						aria-label="Questionnaire required"
						aria-checked={questionnaireRequired}
						className={questionnaireRequired ? 'switch on' : 'switch'}
						onClick={() => onUpdateStage((current) => ({
							...current,
							requiredFeatures: { ...current.requiredFeatures, questionnaire: !questionnaireRequired },
						}))}
					><span></span></button>
					<small className="feature-hint">
						{stage.requiredFeatures?.questionnaire == null
							? 'Using component settings'
							: <button type="button" onClick={() => onUpdateStage((current) => ({
								...current,
								requiredFeatures: { ...current.requiredFeatures, questionnaire: undefined },
							}))}>Restore component settings</button>}
					</small>
				</div>
				<div className="feature-row">
					<span className="feature-label">Request camera and microphone</span>
					<button
						type="button"
						role="switch"
						aria-label="Request camera and microphone"
						aria-checked={stage.recordingRequired ?? false}
						className={stage.recordingRequired ? 'switch on' : 'switch'}
						onClick={() => onUpdateStage((current) => ({
							...current,
							recordingRequired: !current.recordingRequired,
						}))}
					><span></span></button>
				</div>
				<div className="feature-row">
					<span className="feature-label">Start recording after permission</span>
					<button
						type="button"
						role="switch"
						aria-label="Start recording after permission"
						aria-checked={stage.recordingMode === 'auto'}
						className={stage.recordingMode === 'auto' ? 'switch on' : 'switch'}
						onClick={() => onUpdateStage((current) => ({
							...current,
							recordingMode: current.recordingMode === 'auto' ? 'manual' : 'auto',
						}))}
					><span></span></button>
				</div>
				<p>
					When off, start recording manually. Screen sharing always requires browser permission. Automatic
					mode starts recording immediately after permission is
					granted.
				</p>
				{availableFeatures.map(([key, item]) => {
					// Check the feature state and stage compatibility.
					const feature = key as FeatureKey
					const Icon = item.icon
					const checked = stage.features[feature]
					return (
						<div className="feature-row" key={feature}>
							<span className="feature-icon">
								<Icon size={14} />
							</span>
							<span className="feature-label">{item.label}</span>
							{feature === 'timer' && (
								<span className="minutes-wrap">
									<input
										className="minutes-input"
										type="number"
										min={1}
										value={stage.countdownMinutes}
										onChange={(event) =>
											onUpdateStage((current) => ({
												...current,
												countdownMinutes: Math.max(
													1,
													Number(
														event.target.value,
													) || 1,
												),
											}))
										}
									/>
									<span className="minutes-unit">min</span>
								</span>
							)}
							<button
								className={checked ? 'switch on' : 'switch'}
								onClick={() => toggle(feature, !checked)}
								aria-label={item.label}
							>
								<span></span>
							</button>
						</div>
					)
				})}
			</div>
		</aside>
	)
}
