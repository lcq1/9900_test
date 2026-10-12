import { useState } from 'react'
import type { Experiment } from '../types'
import {
	ChevronDown,
	Download,
	FileText,
	Plus,
	Search,
	ShieldCheck,
	SlidersHorizontal,
	Trash2,
} from 'lucide-react'
import { ExportDialog } from '../researcher/ExportDialog'

// Researcher dashboard with statistics, experiment search, editing, and export.
export function Dashboard({
	experiments,
	query,
	setQuery,
	onCreate,
	onEdit,
	onDelete,
}: {
	experiments: Experiment[]
	query: string
	setQuery: (value: string) => void
	onCreate: () => void
	onEdit: (id: string) => void
	onDelete: (id: string) => void
}) {
	// Filter by experiment name or code, ignoring case.
	const filtered = experiments.filter(
		(experiment) =>
			experiment.name.toLowerCase().includes(query.toLowerCase()) ||
			experiment.code.toLowerCase().includes(query.toLowerCase()),
	)
	// Track the experiment selected for export.
	const [exporting, setExporting] = useState<Experiment | null>(null)
	// Render the current view.
	return (
		<section className="page dashboard">
			{/* Page heading and main actions. */}
			<div className="page-heading">
				<div>
					<p className="eyebrow">RESEARCH WORKSPACE</p>
					<h1>Your experiments</h1>
					<p className="subheading">Design, run and inspect your data collection studies.</p>
				</div>
				<button className="primary-button" onClick={onCreate}>
					<Plus size={17} /> New experiment
				</button>
			</div>
			{/* Summary statistics. */}
			<div className="stats-row">
				<div>
					<span className="stat-label">All experiments</span>
					<strong>{experiments.length.toString().padStart(2, '0')}</strong>
				</div>
				<div>
					<span className="stat-label">Active this week</span>
					<strong>
						{experiments
							.filter((experiment) => experiment.status === 'Live')
							.length.toString()
							.padStart(2, '0')}
					</strong>
				</div>
				<div>
					<span className="stat-label">Events captured</span>
					<strong>1,284</strong>
				</div>
				<div className="sync-stat">
					<ShieldCheck size={17} />
					<span>
						Clock sync
						<br />
						<strong>± 1 second</strong>
					</span>
				</div>
			</div>
			{/* Experiment search and filters. */}
			<div className="list-toolbar">
				<div className="search-input">
					<Search size={16} />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search experiments"
					/>
				</div>
				<button className="filter-button">
					<SlidersHorizontal size={15} /> Filter <ChevronDown size={14} />
				</button>
			</div>
			{/* Records and row actions. */}
			<div className="experiment-table">
				<div className="table-head">
					<span>Experiment</span>
					<span>Status</span>
					<span>Created</span>
					<span>Stages</span>
					<span></span>
				</div>
				{filtered.map((experiment) => (
					<div className="experiment-row" key={experiment.id} onClick={() => onEdit(experiment.id)}>
						<div className="experiment-name">
							<span className="experiment-icon">
								<FileText size={17} />
							</span>
							<span>
								<strong>{experiment.name}</strong>
								<small>{experiment.code}</small>
							</span>
						</div>
						<span className={experiment.status === 'Live' ? 'pill live' : 'pill'}>
							<span></span>
							{experiment.status}
						</span>
						<span className="muted">{experiment.created}</span>
						<span className="muted">{experiment.stages.length} stages</span>
						<div className="row-actions">
							<button
								className="row-menu"
								title="Export experiment"
								onClick={(event) => {
									// Stop row navigation and open the export dialog.
									event.stopPropagation()
									setExporting(experiment)
								}}
							>
								<Download size={16} />
							</button>
							<button
								className="row-menu"
								title="Delete experiment"
								onClick={(event) => {
									// Stop row navigation and request experiment deletion.
									event.stopPropagation()
									onDelete(experiment.id)
								}}
							>
								<Trash2 size={16} />
							</button>
						</div>
					</div>
				))}
				{filtered.length === 0 && (
					<div className="empty-state">No experiments match that search.</div>
				)}
			</div>
			{exporting && <ExportDialog experiment={exporting} onClose={() => setExporting(null)} />}
		</section>
	)
}
