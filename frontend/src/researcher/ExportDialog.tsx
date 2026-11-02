import { useTransientNotice } from '../participant/TimerController'
import type { Experiment } from '../types'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { downloadResults, getResultsSummary } from '../api/experiments'

// Show participation counts and download experiment results as Excel.
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
	const [error, setError, errorVisible, errorRevision] =
		useTransientNotice('')
	const [busy, setBusy] = useState(false)
	useEffect(() => {
		let active = true
		getResultsSummary(experiment.id)
			.then((value) => {
				if (active) setSummary(value)
			})
			.catch((reason) => {
				if (active)
					setError(
						reason instanceof Error
							? reason.message
							: 'Could not load results.',
					)
			})
		return () => {
			active = false
		}
	}, [experiment.id, setError])
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-card"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="panel-heading" style={{ padding: '0 0 12px' }}>
					<span>EXPORT EXPERIMENT</span>
					<button className="icon-button" onClick={onClose}>
						<X size={16} />
					</button>
				</div>
				<h2>{experiment.name}</h2>
				<p className="subheading">
					One Excel workbook contains experiment information and a
					sheet per published version. Each participation includes
					answers, AI history and activity. Times use
					Australia/Sydney. Earlier records without version tracking
					appear in a separate unknown-version sheet.
				</p>
				{summary && (
					<p>
						Completed: {summary.completed_count} · Incomplete:{' '}
						{summary.incomplete_count}
					</p>
				)}
				{error && errorVisible && (
					<p
						key={errorRevision}
						className="entry-error transient-notice"
						role="alert"
					>
						{error}
					</p>
				)}
				{/* Close the dialog or download experiment results. */}
				<div className="export-actions">
					<button className="secondary-button" onClick={onClose}>
						Close
					</button>
					<button
						className="primary-button"
						disabled={busy || !summary}
						onClick={async () => {
							setBusy(true)
							setError('')
							try {
								await downloadResults(experiment.id)
							} catch (reason) {
								setError(
									reason instanceof Error
										? reason.message
										: 'Could not download results.',
								)
							} finally {
								setBusy(false)
							}
						}}
					>
						{busy ? 'Downloading…' : 'Download Excel'}
					</button>
				</div>
			</div>
		</div>
	)
}
