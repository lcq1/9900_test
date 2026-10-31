import { type Stage, type ComponentType, type StageComponent, STAGE_TYPES } from '../types'
import {
	Type,
	TextCursorInput,
	CircleDot,
	CheckSquare,
	Star,
	PenLine,
	Paperclip,
	Plus,
	X,
} from 'lucide-react'

// Quick-add component buttons.
const QUICK_ADD: { type: ComponentType; label: string; icon: typeof Plus }[] = [
	{ type: 'text', label: 'Text', icon: Type },
	{ type: 'textbox', label: 'Text box', icon: TextCursorInput },
	{ type: 'choice', label: 'Choice', icon: CircleDot },
	{ type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
	{ type: 'rating', label: 'Rating', icon: Star },
	{ type: 'signature', label: 'Signature', icon: PenLine },
	{ type: 'attachment', label: 'Attachment', icon: Paperclip },
]

// Edit stage content; normalize choice options when the stage type changes.
export function StageContentEditor({
	stage,
	onUpdateStage,
}: {
	stage: Stage
	onUpdateStage: (update: (s: Stage) => Stage) => void
}) {
	// Replace components through the stage update callback.
	const updateComponents = (fn: (components: StageComponent[]) => StageComponent[]) =>
		onUpdateStage((current) => ({ ...current, components: fn(current.components) }))

	// Update the component label.
	const setLabel = (id: string, label: string) =>
		updateComponents((comps) => comps.map((c) => (c.id === id ? { ...c, label } : c)))

	// Remove the content component.
	const removeComponent = (id: string) =>
		updateComponents((comps) => comps.filter((c) => c.id !== id))

	// Append an empty choice option.
	const addOption = (id: string) =>
		updateComponents((comps) =>
			comps.map((c) =>
				c.id === id
					? {
							...c,
							options: (c.options ?? []).length < 6 ? [...(c.options ?? []), ''] : c.options,
						}
					: c,
			),
		)

	// Update a choice option by index.
	const setOption = (id: string, index: number, value: string) =>
		updateComponents((comps) =>
			comps.map((c) =>
				c.id === id
					? { ...c, options: (c.options ?? []).map((o, i) => (i === index ? value : o)) }
					: c,
			),
		)

	// Remove a choice option by index.
	const removeOption = (id: string, index: number) =>
		updateComponents((comps) =>
			comps.map((c) =>
				c.id === id && (c.options ?? []).length > 2
					? { ...c, options: (c.options ?? []).filter((_, i) => i !== index) }
					: c,
			),
		)

	// Append a default component to the stage.
	const addComponent = (type: ComponentType) =>
		updateComponents((comps) => [...comps, makeComponent(type)])

	// Change the stage type and normalize choice options.
	const onTypeChange = (type: string) => {
		if (stage.type === 'consent' || type === 'consent') return
		onUpdateStage((current) => {
			// Adjust components for the new stage type.
			let comps = current.components
			if (type === 'true_false') {
				// Use True and False options for true/false stages.
				comps = ensureChoice(comps, ['True', 'False'])
			} else if (type === 'single_choice' || type === 'multiple_choice') {
				// Keep valid options or create two empty choices.
				comps = ensureChoice(comps, ['', '']).map((c) =>
					c.type === 'choice' || c.type === 'checkbox'
						? { ...c, type: type === 'multiple_choice' ? 'checkbox' : 'choice' }
						: c,
				)
			} else if (type === 'fill_blank' || type === 'short_answer') {
				// Remove choice options for fill-in and short-answer stages.
				comps = comps.map((c) =>
					c.type === 'choice' || c.type === 'checkbox' ? { ...c, options: undefined } : c,
				)
			}
			return { ...current, type, components: comps }
		})
	}

	// Render the current view.
	return (
		<div className="canvas-wrap">
			<div className="canvas-toolbar">
				<span>
					<span className="live-dot" /> Stage content
				</span>
				<span className="canvas-hint">Edit the stage name, type and components</span>
			</div>
			<div className="builder-canvas">
				<div className="canvas-paper">
					{/* Stage type and editable name. */}
					<div className="paper-header">
						<span className="section-tag">{stage.type.toUpperCase()}</span>
						<input
							className="stage-name"
							value={stage.name}
							onChange={(event) =>
								onUpdateStage((current) => ({ ...current, name: event.target.value }))
							}
							placeholder="Untitled stage"
							aria-label="Stage name"
						/>
					</div>

					{/* Stage type selection and option defaults. */}
					<div className="content-field">
						<label className="content-label">Stage type</label>
						<select
							className="type-select"
							value={stage.type}
							onChange={(event) => onTypeChange(event.target.value)}
						>
							{STAGE_TYPES.map((t) => (
								<option key={t.type} value={t.type}>
									{t.label}
								</option>
							))}
						</select>
					</div>

					{/* Stage components and choice options. */}
					<div className="components-editor">
						<div className="panel-heading">
							<span>COMPONENTS</span>
							<b>{stage.components.length}</b>
						</div>
						{stage.components.length === 0 && (
							<div className="empty-components">No components yet. Add one below.</div>
						)}
						{stage.components.map((component) => (
							<div className="builder-block" key={component.id}>
								<div className="block-top">
									<span className="block-type">{component.type}</span>
									<button className="block-delete" onClick={() => removeComponent(component.id)}>
										<X size={14} />
									</button>
								</div>
								<input
									className="component-label"
									value={component.label}
									onChange={(event) => setLabel(component.id, event.target.value)}
									placeholder="Label"
								/>
								{/* Add, edit, and remove choice options. */}
								{(component.type === 'choice' || component.type === 'checkbox') && (
									<div className="options-editor">
										{(component.options ?? []).map((option, i) => (
											<div className="option-row" key={i}>
												<input
													className="option-input"
													value={option}
													onChange={(event) => setOption(component.id, i, event.target.value)}
													placeholder={`Option ${i + 1}`}
												/>
												<button
													className="icon-button"
													onClick={() => removeOption(component.id, i)}
												>
													<X size={13} />
												</button>
											</div>
										))}
										<button className="add-option" onClick={() => addOption(component.id)}>
											<Plus size={13} /> Add option
										</button>
									</div>
								)}
							</div>
						))}

						{/* Quick-add content components. */}
						<div className="quick-add">
							{QUICK_ADD.map((item) => (
								<button
									className="library-item"
									key={item.type}
									onClick={() => addComponent(item.type)}
								>
									<span className="library-icon">
										<item.icon size={15} />
									</span>
									<span>{item.label}</span>
								</button>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

// Create a choice component if missing; otherwise update the first match.
function ensureChoice(comps: StageComponent[], opts: string[]): StageComponent[] {
	const index = comps.findIndex((c) => c.type === 'choice' || c.type === 'checkbox')
	if (index === -1) {
		// Create a choice component with default options.
		const created = makeComponent('choice')
		created.options = opts
		return [...comps, created]
	}
	const next = [...comps]
	const existing = next[index]
	const options =
		opts[0] === 'True'
			? ['True', 'False']
			: existing.options && existing.options.length >= 2
				? existing.options
				: ['', '']
	next[index] = { ...existing, type: 'choice', options }
	return next
}

function makeComponent(type: ComponentType): StageComponent {
	return {
		id: crypto.randomUUID(),
		type,
		label: type === 'text' ? 'New instruction' : 'Your response',
		required: ['textbox', 'signature'].includes(type),
		options: ['choice', 'checkbox'].includes(type)
			? ['Option A', 'Option B']
			: type === 'rating'
				? ['1', '2', '3', '4', '5']
				: undefined,
	}
}
