import type { Stage, FeatureKey } from '../types'
import { featureLabels } from '../constants'

// Configure 11 features; copy/paste logging requires fill-in or short-answer stages.
export function StageFeatureEditor({
	stage,
	onUpdateStage,
}: {
	stage: Stage
	onUpdateStage: (update: (s: Stage) => Stage) => void
}) {
	// Update one feature while preserving the others.
	const toggle = (key: FeatureKey, value: boolean) =>
		onUpdateStage((current) => ({ ...current, features: { ...current.features, [key]: value } }))

	// Allow copy/paste logging only for fill-in and short-answer stages.
	const copyPasteEnabled = stage.type === 'fill_blank' || stage.type === 'short_answer'

	// Render the current view.
	return (
		<aside className="right-panel">
			{/* Feature toggles and countdown minutes. */}
			<div className="right-section features">
				<div className="panel-heading">
					<span>STAGE FEATURES</span>
					<span className="feature-count">
						{Object.values(stage.features).filter(Boolean).length}/11
					</span>
				</div>
				{Object.entries(featureLabels).map(([key, item]) => {
					// Check the feature state and stage compatibility.
					const feature = key as FeatureKey
					const Icon = item.icon
					const checked = stage.features[feature]
					const disabled = feature === 'copyPaste' && !copyPasteEnabled
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
												countdownMinutes: Math.max(1, Number(event.target.value) || 1),
											}))
										}
									/>
									<span className="minutes-unit">min</span>
								</span>
							)}
							{disabled && <small className="feature-hint">Fill / short answer only</small>}
							<button
								className={checked ? 'switch on' : 'switch'}
								disabled={disabled}
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
