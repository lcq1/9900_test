import type { Stage, FeatureKey } from '../types'
import { Copy, MessageCircle, MonitorPlay, PenLine, TimerReset } from 'lucide-react'
const featureLabels = {
	ai: { label: 'AI chat', icon: MessageCircle },
	timer: { label: 'Countdown timer', icon: TimerReset },
	screenRecording: { label: 'Screen recording', icon: MonitorPlay },
	copyPaste: { label: 'Copy-paste logging', icon: Copy },
	signatureBox: { label: 'Signature box', icon: PenLine },
}

// Configure stage features; copy/paste logging requires fill-in or short-answer stages.
export function StageFeatureEditor({
	stage,
	onUpdateStage,
}: {
	stage: Stage
	onUpdateStage: (update: (s: Stage) => Stage) => void
}) {
	if (stage.type.toLowerCase() === 'consent') return <aside className="right-panel"><label>Signing method<select value={stage.signingMethod ?? 'handwritten'} onChange={event => onUpdateStage(current => ({ ...current, signingMethod: event.target.value as 'handwritten' | 'name' }))}><option value="handwritten">Handwritten signature</option><option value="name">Full legal name</option></select></label>{stage.signingMethod === 'name' && <label>Required consent clauses (one per line)<textarea value={(stage.consentClauses ?? []).join('\n')} onChange={event => onUpdateStage(current => ({ ...current, consentClauses: event.target.value.split('\n') }))} /></label>}</aside>

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
			<label><input type="checkbox" checked={stage.allowExtension ?? false} onChange={event => onUpdateStage(current => ({ ...current, allowExtension: event.target.checked }))} /> Allow one 30-minute extension</label>
{stage.type === 'video_oral_answer' && <label><input type="checkbox" checked={stage.sequentialQuestions ?? false} onChange={event => onUpdateStage(current => ({ ...current, sequentialQuestions: event.target.checked, recordingMode: 'manual', countdownMinutes: 10, features: { ...current.features, ai: false, timer: true } }))} /> Show questions one at a time (shared 10 minutes)</label>}
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
