import type { Experiment } from '../types'
import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { downloadResults, getResultsSummary } from '../api/experiments'

// Preview and download experiment JSON.
export function ExportDialog({
	experiment,
	onClose,
}: {
	experiment: Experiment
	onClose: () => void
}) {
	const [summary, setSummary] = useState<{
		completed_count: number
		incomplete_count: number
	} | null>(null)
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	useEffect(() => {
		let active = true
		getResultsSummary(experiment.id)
			.then((value) => {
				if (active) setSummary(value)
			})
			.catch((reason) => {
				if (active) setError(reason instanceof Error ? reason.message : 'Could not load results.')
			})
		return () => {
			active = false
		}
	}, [experiment.id])
	// Format experiment JSON for preview and download.
	const json = JSON.stringify(experiment, null, 2)

	// Download the file and release the object URL.
	const download = () => {
		const blob = new Blob([json], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `${experiment.code}.json`
		document.body.appendChild(anchor)
		anchor.click()
		document.body.removeChild(anchor)
		URL.revokeObjectURL(url)
	}

	// Render the current view.
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-card" onClick={(event) => event.stopPropagation()}>
				<div className="panel-heading" style={{ padding: '0 0 12px' }}>
					<span>EXPORT EXPERIMENT</span>
					<button className="icon-button" onClick={onClose}>
						<X size={16} />
					</button>
				</div>
				<h2>{experiment.name}</h2>
				<p className="subheading">
					Download this study as a JSON file. No data leaves your browser.
				</p>
				{/* Formatted experiment JSON. */}
				<pre className="export-pre">{json}</pre>
				{summary && (
					<p>
						Completed: {summary.completed_count} · Incomplete:{' '}
					{summary.incomplete_count}
					</p>
				)}
				{error && (
					<p className="entry-error" role="alert">
						{error}
					</p>
				)}
				{/* Close the dialog or download experiment JSON. */}
				<div className="export-actions">
					<button className="secondary-button" onClick={onClose}>
						Close
					</button>
					<button className="primary-button" onClick={download}>
						<Download size={15} /> Download JSON
					</button>
					<button
						className="secondary-button"
						disabled={busy || !summary}
						onClick={async () => {
							setBusy(true)
							setError('')
							try {
								await downloadResults(experiment.id)
							} catch (reason) {
								setError(reason instanceof Error ? reason.message : 'Could not download results.')
							} finally {
								setBusy(false)
							}
						}}
					>
						{busy ? 'Downloading…' : 'Download results CSV'}
					</button>
				</div>
			</div>
		</div>
	)
}
