import { useTransientNotice } from '../participant/TimerController'
import type { Experiment } from '../types'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { downloadExperimentCsv, downloadResults, getResultsSummary } from '../api/experiments'
import { downloadSessionCsv, downloadSessionWorkbook } from '../api/participant'

const formats = {
	workbook: 'Excel workbook',
	answers: 'Raw answers (CSV)',
	activity: 'Event timeline (CSV)',
} as const

type ExportFormat = keyof typeof formats
export function ExportDialog({
	experiment,
	session,
	onClose,
}: {
	onClose: () => void
} & (
	| { experiment: Pick<Experiment, 'id' | 'name'>; session?: never }
	| { experiment?: never; session: { id: string; participantCode: string; experimentName: string } }
)) {
	const [summary, setSummary] = useState<{
		completed_count: number
		incomplete_count: number
	} | null>(null)
	const [error, setError, errorVisible, errorRevision] =
		useTransientNotice('')
	const [busy, setBusy] = useState(false)
	const experimentId = experiment?.id
	const [format, setFormat] = useState<ExportFormat>('workbook')
	useEffect(() => {
		if (!experimentId) return
		let active = true
		getResultsSummary(experimentId)
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
	}, [experimentId, setError])
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-card"
				role="dialog"
				aria-modal="true"
				aria-labelledby="export-title"
				onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
				onClick={(event) => event.stopPropagation()}
			>
				<div className="panel-heading" style={{ padding: '0 0 12px' }}>
					<span>{session ? 'EXPORT PARTICIPANT SESSION' : 'EXPORT EXPERIMENT'}</span>
					<button className="icon-button" aria-label="Close export" onClick={onClose}>
						<X size={16} />
					</button>
				</div>
				<h2 id="export-title">{session?.experimentName ?? experiment?.name}</h2>
				{session && <p>Participant {session.participantCode}</p>}
				<label className="export-format">
					File format
					<select autoFocus value={format} disabled={busy}
						onChange={(event) => setFormat(event.target.value as ExportFormat)}>
						{Object.entries(formats).map(([value, label]) =>
							<option key={value} value={value}>{label}</option>,
						)}
					</select>
				</label>
				<p className="subheading">
					{format === 'workbook' && 'Includes study information, answers, AI history and activity. Display times use Australia/Sydney.'}
					{format === 'answers' && 'Structured answers for analysis in a spreadsheet or statistics tool.'}
					{format === 'activity' && 'Timestamped activity, including AI messages, clipboard events and stage transitions.'}
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
						disabled={busy}
						onClick={async () => {
							setBusy(true)
							setError('')
							try {
								if (session) {
									if (format === 'workbook') await downloadSessionWorkbook(session.id)
									else await downloadSessionCsv(session.id, format)
								} else if (experiment && format === 'workbook') {
									await downloadResults(experiment.id)
								} else if (experiment && format !== 'workbook') {
									await downloadExperimentCsv(experiment.id, format)
								}
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
						{busy ? 'Downloading…' : format === 'workbook' ? 'Download Excel' : 'Download CSV'}
					</button>
				</div>
			</div>
		</div>
	)
}
