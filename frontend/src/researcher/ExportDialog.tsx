import type { Experiment } from '../types'
import { Download, X } from 'lucide-react'

// Preview and download experiment JSON.
export function ExportDialog({
	experiment,
	onClose,
}: {
	experiment: Experiment
	onClose: () => void
}) {
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
				{/* Close the dialog or download experiment JSON. */}
				<div className="export-actions">
					<button className="secondary-button" onClick={onClose}>
						Close
					</button>
					<button className="primary-button" onClick={download}>
						<Download size={15} /> Download JSON
					</button>
				</div>
			</div>
		</div>
	)
}
