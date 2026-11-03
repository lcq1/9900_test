import { useNavigate } from 'react-router-dom'
import type { Stage, Experiment } from '../types'
import { ArrowLeft, ArrowRight, Play, Trash2 } from 'lucide-react'
import { StageBuilder } from '../researcher/StageBuilder'
import { StageContentEditor } from '../researcher/StageContentEditor'
import { StageFeatureEditor } from '../researcher/StageFeatureEditor'

// Experiment editor with stage, content, and feature panels.
export function Editor({
	experiment,
	stage,
	onBack,
	onAddStage,
	onSelectStage,
	onUpdateExperiment,
	onUpdateStage,
	onDelete,
	onDeleteStage,
	onReorderStages,
	onPublish,
	onUnpublish,
	publishing,
	unpublishing,
	saving,
	dirty,
}: {
	experiment: Experiment
	stage: Stage
	onBack: () => void
	onAddStage: () => void
	onSelectStage: (id: string) => void
	onUpdateExperiment: (update: (experiment: Experiment) => Experiment) => void
	onUpdateStage: (update: (stage: Stage) => Stage) => void
	onDelete: (id: string) => void
	onDeleteStage: (id: string) => void
	onReorderStages: (from: number, to: number) => void
	onPublish: () => void
	onUnpublish: () => void
	publishing: boolean
	unpublishing: boolean
	saving: boolean
	dirty: boolean
}) {
	const navigate = useNavigate()
	return (
		<section className="editor">
			{/* Dashboard, delete, preview, and publish actions. */}
			<div className="editor-header">
				<button className="back-link" onClick={onBack}>
					<ArrowLeft size={16} /> All experiments
				</button>
				<div className="editor-actions">
					<button
						className="secondary-button"
						onClick={() => onDelete(experiment.id)}
					>
						<Trash2 size={15} /> Delete
					</button>
					<button
						className="secondary-button"
						onClick={() =>
							navigate(
								`/researcher/preview?experiment=${encodeURIComponent(experiment.id)}`,
							)
						}
					>
						<Play size={15} /> Preview
					</button>
					<button
						className="primary-button"
						disabled={
							saving ||
							experiment.status === 'Closed' ||
							(experiment.status === 'Live' && !dirty)
						}
						aria-busy={publishing}
						title={
							experiment.status === 'Closed'
								? 'Closed experiments cannot be published again'
								: 'Save the current experiment and publish it'
						}
						onClick={onPublish}
					>
						{publishing
							? 'Publishing…'
							: experiment.status === 'Live'
								? dirty
									? 'Publish changes'
									: 'Published'
								: 'Publish'}{' '}
						<ArrowRight size={15} />
					</button>
					{experiment.status === 'Live' && (
						<button
							className="secondary-button"
							disabled={saving}
							aria-busy={unpublishing}
							title="Return this experiment to Draft and pause participation"
							onClick={onUnpublish}
						>
							{unpublishing ? 'Unpublishing…' : 'Unpublish'}
						</button>
					)}
				</div>
			</div>
			{/* Experiment name and fullscreen toggle. */}
			<div className="editor-title">
				<div>
					<p className="eyebrow">EXPERIMENT / {experiment.code}</p>
					<input
						className="title-input"
						value={experiment.name}
						onChange={(event) =>
							onUpdateExperiment((current) => ({
								...current,
								name: event.target.value,
							}))
						}
					/>
					<div className="title-meta">
						<span className="status-pill">{experiment.status}</span>
						<span className="subheading">
							{experiment.status === 'Live'
								? dirty
									? 'Unpublished changes'
									: 'Published experiment'
								: 'Experiment draft'}
						</span>
					</div>
				</div>
				<div className="experiment-options">
				<label className="switch-label">
					<span>Full-screen mode</span>
					<button
						className={
							experiment.fullScreen ? 'switch on' : 'switch'
						}
						onClick={() =>
							onUpdateExperiment((current) => ({
								...current,
								fullScreen: !current.fullScreen,
							}))
						}
					>
						<span></span>
					</button>
				</label>
				<label className="switch-label">
					<span>Choose answer order</span>
					<button type="button" role="switch" aria-label="Choose answer order"
						aria-checked={Boolean(experiment.stages[0]?.features.navigation)}
						className={experiment.stages[0]?.features.navigation ? 'switch on' : 'switch'}
						onClick={() => onUpdateExperiment((current) => ({
							...current,
							stages: current.stages.map((item) => ({ ...item, features: {
								...item.features, navigation: !current.stages[0]?.features.navigation,
							} })),
						}))}>
						<span></span>
					</button>
				</label>
				</div>
			</div>
			{/* Stage list, content editor, and feature settings. */}
			<div className="editor-grid">
				<StageBuilder
					experiment={experiment}
					selectedStageId={stage.id}
					onSelectStage={onSelectStage}
					onAddStage={onAddStage}
					onDeleteStage={onDeleteStage}
					onReorderStages={onReorderStages}
				/>
				<StageContentEditor
					experimentId={experiment.id}
					stage={stage}
					onUpdateStage={onUpdateStage}
				/>
				<StageFeatureEditor
					stage={stage}
					onUpdateStage={onUpdateStage}
				/>
			</div>
		</section>
	)
}
