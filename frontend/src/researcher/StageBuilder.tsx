import { useState } from 'react'
import { type Experiment, stageTypeLabel } from '../types'
import { GripVertical, Plus, Trash2 } from 'lucide-react'

// Manage up to 20 stages using an accessible drag handle.
export function StageBuilder({
	experiment,
	selectedStageId,
	onSelectStage,
	onAddStage,
	onDeleteStage,
	onReorderStages,
}: {
	experiment: Experiment
	selectedStageId: string
	onSelectStage: (id: string) => void
	onAddStage: () => void
	onDeleteStage: (id: string) => void
	onReorderStages: (from: number, to: number) => void
}) {
	const stages = experiment.stages
	const isMax = stages.length >= 20
	// Track the highlighted drop target.
	const [dragOverId, setDragOverId] = useState<string | null>(null)

	return (
		<aside className="stage-panel">
			<div className="panel-heading">
				<span>
					STAGES <b>{stages.length}</b>
				</span>
				<button
					className="icon-button"
					title="Add stage"
					onClick={onAddStage}
					disabled={isMax}
				>
					<Plus size={16} />
				</button>
			</div>
			{/* Stage selection, drag reordering, and deletion. */}
			<div className="stage-list">
				{stages.map((item, index) => {
					// Determine stage position and drop state.
					const isDropTarget = dragOverId === item.id
					return (
						<div
							className={
								(item.id === selectedStageId
									? 'stage-item selected'
									: 'stage-item') +
								(isDropTarget ? ' drop-target' : '')
							}
							key={item.id}
							onClick={() => onSelectStage(item.id)}
							onDragOver={(event) => {
								// Allow dropping on this stage and highlight the target.
								event.preventDefault()
								setDragOverId(item.id)
							}}
							onDragLeave={() =>
								setDragOverId((current) =>
									current === item.id ? null : current,
								)
							}
							onDrop={(event) => {
								// Read the drag source and reorder valid indices.
								event.preventDefault()
								setDragOverId(null)
								const from = Number(
									event.dataTransfer.getData('text/plain'),
								)
								if (!Number.isInteger(from)) return
								if (
									from <= 0 ||
									index === 0 ||
									from >= stages.length
								)
									return
								if (from !== index) onReorderStages(from, index)
							}}
						>
							<span className="stage-number">
								{String(index + 1).padStart(2, '0')}
							</span>
							<span className="stage-name-wrap">
								<strong title={item.name}>{item.name}</strong>
								<small>{stageTypeLabel(item.type)}</small>
							</span>
							<span
								className="grip"
								role="button"
								tabIndex={index > 0 ? 0 : -1}
								aria-label={`Reorder ${item.name}`}
								title="Drag to reorder; use Alt + arrow keys with the keyboard"
								onKeyDown={(event) => {
									if (!event.altKey || index === 0) return
									const target =
										event.key === 'ArrowUp'
											? index - 1
											: event.key === 'ArrowDown'
												? index + 1
												: index
									if (
										target > 0 &&
										target < stages.length &&
										target !== index
									) {
										event.preventDefault()
										onReorderStages(index, target)
									}
								}}
								draggable={index > 0}
								onDragStart={(event) => {
									// Store the stage index and mark the drag as a move.
									event.dataTransfer.setData(
										'text/plain',
										String(index),
									)
									event.dataTransfer.effectAllowed = 'move'
								}}
								onDragEnd={() => setDragOverId(null)}
							>
								<GripVertical size={15} />
							</span>
							{/* Move and delete controls based on stage position. */}
							<span className="stage-controls">
								{index > 0 && stages.length > 1 && (
									<button
										className="icon-button danger"
										title="Delete stage"
										onClick={(event) => {
											// Stop stage selection and delete the stage.
											event.stopPropagation()
											onDeleteStage(item.id)
										}}
									>
										<Trash2 size={14} />
									</button>
								)}
							</span>
						</div>
					)
				})}
			</div>
			<button className="add-stage" onClick={onAddStage} disabled={isMax}>
				<Plus size={15} /> Add stage
			</button>
		</aside>
	)
}
