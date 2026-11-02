import type { Stage, FeatureKey } from '../types'
import { Copy, MessageCircle, MonitorPlay, PenLine, Paperclip, TimerReset } from 'lucide-react'
const featureLabels = {
	ai: { label: 'AI chat', icon: MessageCircle },
	timer: { label: 'Countdown timer', icon: TimerReset },
	screenRecording: { label: 'Screen recording', icon: MonitorPlay },
	copyPaste: { label: 'Copy-paste logging', icon: Copy },
	signatureBox: { label: 'Signature box', icon: PenLine },
	attachment: { label: 'Attachment', icon: Paperclip },
}

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
		onUpdateStage((current) => ({
			...current,
			features: { ...current.features, [key]: value },
		}))

	// Allow copy/paste logging only for fill-in and short-answer stages.
	const copyPasteEnabled =
		stage.type === 'fill_blank' || stage.type === 'short_answer'

	return (
		<aside className="right-panel">
			{/* Feature toggles and countdown minutes. */}
			<div className="right-section features">
				<div className="panel-heading">
					<span>STAGE FEATURES</span>
					<span className="feature-count">
						{
							Object.keys(featureLabels).filter(
								(k) => stage.features[k as FeatureKey],
							).length
						}
						/6
					</span>
				</div>
				{(['questionnaire', 'signatureBox', 'attachment'] as const).map(
					(key) => (
						<label key={key}>
							{key} requirement
							<select
								value={String(
									stage.requiredFeatures?.[key] ?? 'default',
								)}
								onChange={(event) =>
									onUpdateStage((current) => ({
										...current,
										requiredFeatures: {
											...current.requiredFeatures,
											[key]:
												event.target.value === 'default'
													? undefined
													: event.target.value ===
														'true',
										},
									}))
								}
							>
								<option value="default">
									Use component settings
								</option>
								<option value="true">Required</option>
								<option value="false">Optional</option>
							</select>
						</label>
					),
				)}
				<label>
					<input
						type="checkbox"
						disabled={stage.type === 'consent'}
						checked={stage.recordingRequired ?? false}
						onChange={(event) =>
							onUpdateStage((current) => ({
								...current,
								recordingRequired: event.target.checked,
							}))
						}
					/>
					Require screen and camera recording
				</label>
				<label>
					Recording start mode
					<select
						value={stage.recordingMode ?? 'manual'}
						disabled={stage.type === 'consent'}
						onChange={(event) =>
							onUpdateStage((current) => ({
								...current,
								recordingMode: event.target.value as
									'manual' | 'auto',
							}))
						}
					>
						<option value="manual">Manual</option>
						<option value="auto">Start after permission</option>
					</select>
				</label>
				<p>
					Screen sharing always requires browser permission. Automatic
					mode starts recording immediately after permission is
					granted.
				</p>
				{Object.entries(featureLabels).map(([key, item]) => {
					// Check the feature state and stage compatibility.
					const feature = key as FeatureKey
					const Icon = item.icon
					const checked = stage.features[feature]
					const disabled =
						(feature === 'copyPaste' && !copyPasteEnabled) ||
						(stage.type === 'consent' &&
							[
								'ai',
								'timer',
								'screenRecording',
								'selfie',
								'copyPaste',
								'pauseAbort',
								'navigation',
								'confirm',
							].includes(feature))
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
							{disabled && (
								<small className="feature-hint">
									{stage.type === 'consent'
										? 'Unavailable for consent'
										: 'Fill / short answer only'}
								</small>
							)}
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
