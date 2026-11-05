import { useTransientNotice } from '../participant/TimerController'
import { useState, useEffect, useId, useRef } from 'react'
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
import {
	getExperimentAIKey,
	saveExperimentAIKey,
	removeExperimentAIKey,
	setExperimentAISource,
	testExperimentAIConnection,
	getStorageSettings,
	saveStorageSettings,
	type ExperimentAIKeyStatus,
	type ExperimentAISettingsInput,
	type StorageSettings,
} from '../api/experiments'
import { HttpError } from '../api/http'
import { ExportDialog } from '../researcher/ExportDialog'
import type { ParticipantEvent, ParticipantEventType } from '../participant/EventQueue'
import { downloadSessionRecording, listSessionRecordings, listSessions, type SessionRecording } from '../api/participant'
import { getCurrentResearcher } from '../auth/sessionStore'
import { getWorkspaceSettings, getWorkspaceMembers, type PlatformSettings } from '../api/administrator'
import type { Researcher } from '../api/auth'

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
	const [filtersOpen, setFiltersOpen] = useState(false)
	const [statusFilter, setStatusFilter] = useState<Experiment['status'] | ''>('')
	const filterPanelId = useId()
	// Combine the selected status with case-insensitive name or code search.
	const filtered = experiments.filter(
		(experiment) =>
			(!statusFilter || experiment.status === statusFilter) &&
			(experiment.name.toLowerCase().includes(query.toLowerCase()) ||
			experiment.code.toLowerCase().includes(query.toLowerCase())),
	)
	// Track the experiment selected for export.
	const [exporting, setExporting] = useState<Experiment | null>(null)
	return (
		<section className="page dashboard">
			{/* Page heading and main actions. */}
			<div className="page-heading">
				<div>
					<p className="eyebrow">RESEARCH WORKSPACE</p>
					<h1>Your experiments</h1>
					<p className="subheading">
						Design, run and inspect your data collection studies.
					</p>
				</div>
				<button className="primary-button" onClick={onCreate}>
					<Plus size={17} /> New experiment
				</button>
			</div>
			{/* Summary statistics. */}
			<div className="stats-row">
				<div>
					<span className="stat-label">All experiments</span>
					<strong>
						{experiments.length.toString().padStart(2, '0')}
					</strong>
				</div>
				<div>
					<span className="stat-label">Active this week</span>
					<strong>
						{experiments
							.filter(
								(experiment) => experiment.status === 'Live',
							)
							.length.toString()
							.padStart(2, '0')}
					</strong>
				</div>
				<div>
					<span className="stat-label">Total stages</span>
					<strong>
						{experiments
							.reduce(
								(total, experiment) =>
									total + experiment.stages.length,
								0,
							)
							.toString()
							.padStart(2, '0')}
					</strong>
				</div>
				<div className="sync-stat">
					<ShieldCheck size={17} />
					<span>
						Results export
						<br />
						<strong>Excel workbook</strong>
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
				<button type="button" className="filter-button"
					aria-expanded={filtersOpen} aria-controls={filterPanelId}
					onClick={() => setFiltersOpen((open) => !open)}>
					<SlidersHorizontal size={15} /> {statusFilter ? `Filter: ${statusFilter}` : 'Filter'}{' '}
					<ChevronDown size={14} />
				</button>
			</div>
			{filtersOpen && (
				<div className="dashboard-filter-panel" id={filterPanelId}
					onKeyDown={(event) => { if (event.key === 'Escape') setFiltersOpen(false) }}>
					<label>
						Status
						<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Experiment['status'] | '')}>
							<option value="">All statuses</option>
							{(['Draft', 'Live', 'Closed'] as const).map((status) => <option key={status} value={status}>{status}</option>)}
						</select>
					</label>
					<button type="button" className="secondary-button" disabled={!statusFilter} onClick={() => setStatusFilter('')}>Reset filters</button>
				</div>
			)}
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
					<div
						className="experiment-row"
						key={experiment.id}
						onClick={() => onEdit(experiment.id)}
					>
						<div className="experiment-name">
							<span className="experiment-icon">
								<FileText size={17} />
							</span>
							<span>
								<strong>{experiment.name}</strong>
								<small>{experiment.code}</small>
							</span>
						</div>
						<span
							className={
								experiment.status === 'Live'
									? 'pill live'
									: 'pill'
							}
						>
							<span></span>
							{experiment.status}
						</span>
						<span className="muted">{experiment.created}</span>
						<span className="muted">
							{experiment.stages.length} stages
						</span>
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
					<div className="empty-state">
						No experiments match your search or filters.
					</div>
				)}
			</div>
			{exporting && (
				<ExportDialog
					experiment={exporting}
					onClose={() => setExporting(null)}
				/>
			)}
		</section>
	)
}

const TYPE_META: Partial<
	Record<ParticipantEventType, { label: string; color: string }>
> = {
	stage_view: { label: 'Stage view', color: '#2563eb' },
	answer: { label: 'Answer', color: '#60a5fa' },
	ai_prompt: { label: 'AI prompt', color: '#c0564a' },
	ai_reply: { label: 'AI reply', color: '#e8928a' },
	copy: { label: 'Copy', color: '#5b82b0' },
	paste: { label: 'Paste', color: '#8fb0d4' },
	recording_start: { label: 'Rec start', color: '#9a3b32' },
	recording_stop: { label: 'Rec stop', color: '#c06a62' },
	timer_tick: { label: 'Timer tick', color: '#8493a5' },
	timer_milestone: { label: 'Timer milestone', color: '#aebfce' },
	navigation: { label: 'Navigation', color: '#1e3a5f' },
	abort: { label: 'Abort', color: '#c0564a' },
}

interface SessionData {
	id: string
	participantCode: string
	events: ParticipantEvent[]
	experimentName: string
	experimentCode: string
}

function normalizeResultEvents(events: ParticipantEvent[]): ParticipantEvent[] {
	return events
		.map((event) => {
			if (Number.isFinite(event.epochMs) && event.epochMs > 0) return event
			// Some server-generated events carry ISO time but leave epochMs at zero.
			const parsed = Date.parse(event.timestamp)
			return { ...event, epochMs: parsed > 0 ? parsed : Number.NaN }
		})
		.sort((a, b) => (Number.isFinite(a.epochMs) ? a.epochMs : Infinity) -
			(Number.isFinite(b.epochMs) ? b.epochMs : Infinity))
}

export function ResultsPage({ experiments }: { experiments: Experiment[] }) {
	// `null` means the researcher has not picked a scope yet: charts then default
	// to the first experiment so the counts never mix sessions from two studies.
	const [chosenExperiment, setChosenExperiment] = useState<string | null>(null)
	const experimentCode = chosenExperiment ?? experiments[0]?.code ?? ''
	const [chart, setChart] = useState('bar')
	const chartVisual = useRef<HTMLDivElement>(null)
	const [openId, setOpenId] = useState<string | null>(null)
	const [sessions, setSessions] = useState<SessionData[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError, errorVisible, errorRevision] =
		useTransientNotice('')
	const [exportSession, setExportSession] = useState<SessionData | null>(null)

	// Read captured sessions from the backend. The participant runtime submits
	// here on finish/abort, so the server is the authoritative source.
	useEffect(() => {
		let active = true
		const load = async () => {
			try {
				setLoading(true)
				setError('')
				const backend = await listSessions(experimentCode)
				if (!active) return
				const mapped: SessionData[] = backend
					.map((s) => ({
						id: s.id,
						participantCode: s.participantCode,
						experimentCode: s.experimentCode,
						events: normalizeResultEvents(s.events),
						experimentName:
							experiments.find((e) => e.code === s.experimentCode)
								?.name ?? s.experimentCode,
					}))
					.sort((a, b) => b.id.localeCompare(a.id))
				setSessions(mapped)
			} catch {
				if (active)
					setError(
						'Could not load captured sessions from the server.',
					)
			} finally {
				if (active) setLoading(false)
			}
		}
		void load()
		return () => {
			active = false
		}
	}, [experiments, experimentCode, setError])

	const visibleSessions = sessions.filter(
		(s) => !experimentCode || s.experimentCode === experimentCode,
	)
	// Per-session timeline anchors: elapsedMs is relative to the session's own
	// first event (single-clock sub-second timeline), order is the 1-based
	// sequence within the session. Elapsed against the GLOBAL first event would
	// squash every session into one narrow band when several sessions are
	// selected, which is what made the scatter/histogram unreadable.
	const allEvents = visibleSessions.flatMap((s) => {
		const valid = s.events.filter(
			(event) => Number.isFinite(event.epochMs) && event.epochMs > 0,
		)
		const start = valid.length
			? Math.min(...valid.map((e) => e.epochMs))
			: 0
		return valid.map((event, index) => ({
			...event,
			elapsedMs: start ? event.epochMs - start : 0,
			order: index + 1,
			sessionId: s.id,
			sessionLabel: s.experimentName,
		}))
	})
	const totalEvents = allEvents.length
	const typeCount = new Set(allEvents.map((e) => e.type)).size
	const segments = [...new Set(allEvents.map((e) => e.type))].map((type) => ({
		label: TYPE_META[type]?.label ?? type,
		color: TYPE_META[type]?.color ?? '#64748b',
		count: allEvents.filter((event) => event.type === type).length,
	}))

	return (
		<section className="page dashboard results-page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">RESULTS</p>
					<h1>Visualization results</h1>
					<p className="subheading">
						Captured participant sessions, event-mix and activity
						charts, and precise single-clock timelines — exportable
						as Excel.
					</p>
				</div>
			</div>

			<div className="stats-row">
				<div>
					<span className="stat-label">Sessions</span>
					<strong>
						{visibleSessions.length.toString().padStart(2, '0')}
					</strong>
				</div>
				<div>
					<span className="stat-label">Total events</span>
					<strong>{totalEvents.toString().padStart(3, '0')}</strong>
				</div>
				<div>
					<span className="stat-label">Event types</span>
					<strong>{typeCount.toString().padStart(2, '0')}</strong>
				</div>
				<div>
					<span className="stat-label">Avg / session</span>
					<strong>
						{visibleSessions.length
							? Math.round(
									totalEvents / visibleSessions.length,
								).toString()
							: '0'}
					</strong>
				</div>
			</div>

			<div className="results-toolbar">
				<div className="results-account">
					<span>Researcher</span>
					<strong>
						{getCurrentResearcher()?.name ?? 'Current account'}
					</strong>
				</div>
				<label className="results-filter">
					Experiment
					<select
						aria-label="Results experiment"
						value={experimentCode}
						onChange={(e) => setChosenExperiment(e.target.value)}
					>
						<option value="">All my experiments</option>
						{experiments.map((e) => (
							<option key={e.id} value={e.code}>
								{e.name} ({e.code})
							</option>
						))}
					</select>
				</label>
				<label className="results-filter">
					Chart type
					<select
						aria-label="Chart type"
						value={chart}
						onChange={(e) => setChart(e.target.value)}
					>
						{Object.entries({
							bar: 'Event counts',
							line: 'Activity over time',
							pie: 'Event mix',
							scatter: 'Event order',
							histogram: 'Elapsed time',
							timeline: 'Session timelines',
						}).map(([type, title]) => (
							<option key={type} value={type}>
								{title}
							</option>
						))}
					</select>
				</label>
				{!loading && !error && totalEvents > 0 && (
					<button type="button" className="secondary-button" onClick={() => {
						const svg = chartVisual.current?.querySelector('svg')
						if (svg) downloadChart(svg, experimentCode || 'all-studies', chart)
					}}>
						<Download size={15} aria-hidden="true" /> Download chart
					</button>
				)}
			</div>
			{!loading && !error && totalEvents === 0 && (
				<p>No valid timestamped events for this selection.</p>
			)}
			{!loading && !error && totalEvents > 0 && (
				<div className="chart-card results-chart-card">
					<div className="results-chart-visual" ref={chartVisual}>
						{chart === 'pie' ? (
							<Doughnut segments={segments} total={totalEvents} />
						) : chart === 'line' ? (
							<ActivityLine events={allEvents} />
						) : chart === 'timeline' ? (
							<SessionTimeline events={allEvents} />
						) : (
							<ResultPlot
								chart={chart}
								events={allEvents}
								segments={segments}
							/>
						)}
					</div>
					<div className="results-chart-data">
						<table>
							<caption>
								Event counts for the selected experiments
							</caption>
							<thead>
								<tr>
									<th>Type</th>
									<th>Count</th>
								</tr>
							</thead>
							<tbody>
								{segments.map((s) => (
									<tr key={s.label}>
										<td>
											<i
												className="type-swatch"
												style={{ background: s.color }}
											/>
											{s.label}
										</td>
										<td>{s.count}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{loading && (
				<p className="subheading" style={{ marginTop: 22 }}>
					Loading captured sessions…
				</p>
			)}

			{error && errorVisible && !loading && (
				<p
					key={errorRevision}
					className="entry-error transient-notice"
					style={{ marginTop: 22 }}
				>
					{error}
				</p>
			)}

			{!loading && visibleSessions.length === 0 ? (
				<p className="subheading" style={{ marginTop: 22 }}>
					No participant sessions captured yet. Run a participant
					session to the end (or abort it) to generate event data.
				</p>
			) : (
				<div className="results-list">
					{visibleSessions.map((session) => {
						const timedEvents = session.events.filter((event) => Number.isFinite(event.epochMs))
						const first = timedEvents[0]
						const last = timedEvents[timedEvents.length - 1]
						const durationMs =
							first && last ? last.epochMs - first.epochMs : 0
						const open = openId === session.id
						return (
							<div className="session-card" key={session.id}>
								<div className="session-head">
									<div className="session-title">
										<strong>
											{session.experimentName}
										</strong>
										<small>Participant {session.participantCode}</small>
									</div>
									<div className="session-chips">
										<span className="session-chip">
											{session.events.length} events
										</span>
										<span className="session-chip" title="Time between the first and last recorded events">
											{formatDuration(durationMs)}
										</span>
										<button
											className="secondary-button"
											onClick={() =>
												setOpenId(
													open ? null : session.id,
												)
											}
										>
											{open
												? 'Hide timeline'
												: 'View timeline'}
										</button>
										<button
											className="secondary-button"
											onClick={() => setExportSession(session)}
										>
											Export session
										</button>
									</div>
								</div>
								{open && (
									<div className="session-body">
										<SessionRecordings sessionId={session.id} />
										<div className="timeline">
											{session.events.map((event) => (
												<div
													className="tl-row"
													key={`${event.type}-${event.seq}-${event.timestamp}`}
												>
													<span className="tl-seq">
														#{event.seq}
													</span>
													<span
														className="tl-chip"
														style={{
															background:
																TYPE_META[
																	event.type
																]?.color ??
																'#8493a5',
														}}
													>
														{TYPE_META[event.type]
															?.label ??
															event.type}
													</span>
													<span className="tl-time">
														{formatClock(
															event.epochMs,
														)}
													</span>
													<span className="tl-detail">
														<code>
															{detailText(
																event.detail,
															)}
														</code>
													</span>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						)
					})}
				</div>
			)}

			<p className="results-note">
				Data is read from the study server&apos;s participant-session
				store. Every participant session submits its precise event
				timeline here on finish or abort, so results reflect the
				authoritative capture. Exports are Excel workbooks with
				versioned answers, AI history and activity.
			</p>
			{exportSession && (
				<ExportDialog
					session={exportSession}
					onClose={() => setExportSession(null)}
				/>
			)}
		</section>
	)
}

function downloadChart(svg: SVGSVGElement, experimentCode: string, chart: string) {
	const copy = svg.cloneNode(true) as SVGSVGElement
	const properties = ['fill', 'stroke', 'stroke-width', 'opacity', 'font-family', 'font-size', 'font-weight']
	const originalElements = svg.querySelectorAll<SVGElement>('*')
	copy.querySelectorAll<SVGElement>('*').forEach((element, index) => {
		const computed = getComputedStyle(originalElements[index])
		for (const property of properties) {
			const value = computed.getPropertyValue(property)
			if (value) element.style.setProperty(property, value)
		}
	})
	const file = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' })
	const url = URL.createObjectURL(file)
	const link = document.createElement('a')
	link.href = url
	link.download = `${experimentCode}-${chart}.svg`
	link.click()
	window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function SessionRecordings({ sessionId }: { sessionId: string }) {
	const [recordings, setRecordings] = useState<SessionRecording[] | null>(null)
	const [error, setError] = useState('')
	const [busyId, setBusyId] = useState('')
	useEffect(() => {
		let active = true
		void listSessionRecordings(sessionId)
			.then((items) => { if (active) setRecordings(items) })
			.catch(() => { if (active) setError('Could not load recordings. Reopen the timeline to retry.') })
		return () => { active = false }
	}, [sessionId])

	const download = async (recording: SessionRecording) => {
		setError('')
		setBusyId(recording.id)
		try {
			await downloadSessionRecording(sessionId, recording)
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Could not download the recording.')
		} finally {
			setBusyId('')
		}
	}

	return <div className="session-recordings">
		<h4>Recordings</h4>
		{error && <p role="alert">{error}</p>}
		{!recordings && !error && <p role="status">Loading recordings…</p>}
		{recordings?.length === 0 && <p>No recordings saved for this session.</p>}
		{recordings?.map((recording) => (
			<button type="button" className="secondary-button" key={recording.id}
				disabled={Boolean(busyId)} onClick={() => void download(recording)}>
				<Download size={14} aria-hidden="true" />
				{busyId === recording.id ? 'Downloading…' : recording.filename}
			</button>
		))}
	</div>
}

/** Dependency-free doughnut chart (stroke-dasharray segments on one circle). */
function Doughnut({
	segments,
	total,
}: {
	segments: { label: string; color: string; count: number }[]
	total: number
}) {
	// Percentages and stroke offsets computed without mutation (pure derivations).
	const pcts = segments.map((segment) =>
		total > 0 ? (segment.count / total) * 100 : 0,
	)
	const offsets = pcts.map(
		(_, index) =>
			25 - pcts.slice(0, index).reduce((sum, pct) => sum + pct, 0),
	)
	return (
		<div className="chart-doughnut">
			<svg
				viewBox="0 0 42 42"
				className="doughnut-svg"
				role="img"
				aria-label="Event mix"
			>
				<circle
					cx="21"
					cy="21"
					r="15.9155"
					fill="none"
					stroke="#eef2f7"
					strokeWidth="7"
				/>
				{segments.map((segment, index) => {
					const pct = pcts[index]
					if (pct <= 0) return null
					return (
						<circle
							key={segment.label}
							cx="21"
							cy="21"
							r="15.9155"
							fill="none"
							stroke={segment.color}
							strokeWidth="7"
							strokeDasharray={`${pct} ${100 - pct}`}
							strokeDashoffset={offsets[index]}
						/>
					)
				})}
				<text
					x="21"
					y="20"
					textAnchor="middle"
					className="doughnut-total"
				>
					{total}
				</text>
				<text
					x="21"
					y="26"
					textAnchor="middle"
					className="doughnut-sub"
				>
					events
				</text>
			</svg>
			<ul className="chart-legend">
				{segments.map((segment) => (
					<li key={segment.label}>
						<i style={{ background: segment.color }}></i>
						{segment.label}
						<b>{segment.count}</b>
					</li>
				))}
			</ul>
		</div>
	)
}

/** Dependency-free cumulative-activity line/area chart over wall-clock time. */
function ActivityLine({ events }: { events: ParticipantEvent[] }) {
	const sorted = [...events].sort((a, b) => a.epochMs - b.epochMs)
	const min = sorted[0].epochMs
	const max = sorted[sorted.length - 1].epochMs
	const BUCKETS = 24
	const span = Math.max(1, max - min)
	const buckets = new Array<number>(BUCKETS).fill(0)
	sorted.forEach((event) => {
		const index = Math.min(
			BUCKETS - 1,
			Math.floor(((event.epochMs - min) / span) * BUCKETS),
		)
		buckets[index] += 1
	})
	const cumulative = buckets.map((_, index) =>
		buckets.slice(0, index + 1).reduce((sum, count) => sum + count, 0),
	)
	const peak = Math.max(...cumulative, 1)

	const W = 560
	const H = 180
	const PAD = 30
	const pointX = (i: number) => PAD + (i / (BUCKETS - 1)) * (W - PAD * 2)
	const pointY = (v: number) => H - PAD - (v / peak) * (H - PAD * 2)
	const points = cumulative
		.map((v, i) => `${pointX(i)},${pointY(v)}`)
		.join(' ')
	const area = `${PAD},${H - PAD} ${points} ${pointX(BUCKETS - 1)},${H - PAD}`
	const formatTick = (ms: number) => {
		const d = new Date(ms)
		const pad = (n: number) => String(n).padStart(2, '0')
		return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
	}

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="chart-line-svg"
			role="img"
			aria-label="Activity over time"
		>
			{[0.25, 0.5, 0.75, 1].map((fraction) => (
				<line
					key={fraction}
					x1={PAD}
					x2={W - PAD}
					y1={pointY(peak * fraction)}
					y2={pointY(peak * fraction)}
					className="chart-grid-line"
				/>
			))}
			<polygon points={area} className="chart-area" />
			<polyline points={points} className="chart-line" />
			<text x={PAD} y={H - 8} className="line-axis">
				{formatTick(min)}
			</text>
			<text x={W - PAD} y={H - 8} textAnchor="end" className="line-axis">
				{formatTick(max)}
			</text>
			<text
				x={PAD - 6}
				y={pointY(peak) + 3}
				textAnchor="end"
				className="line-axis"
			>
				{peak}
			</text>
		</svg>
	)
}

function formatClock(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '—'
  const d = new Date(epochMs)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(epochMs % 1000).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—'
  const seconds = Math.round(ms / 100) / 10
  if (seconds < 60) return `${seconds}s`
  const rounded = Math.round(ms / 1000)
  const minutes = Math.floor(rounded / 60)
  const remainder = rounded % 60
  return `${minutes}m ${remainder}s`
}

function detailText(detail?: Record<string, unknown>): string {
  if (!detail) return '—'
  const text = Object.entries(detail)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('  ·  ')
  return text.length > 96 ? `${text.slice(0, 96)}…` : text
}

const googleAI = {
	provider: 'google',
	model: 'gemini-3.5-flash-lite',
	apiBase: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
}

function aiSettingsFields(value: ExperimentAIKeyStatus): ExperimentAISettingsInput {
	return { provider: value.provider, model: value.model, apiBase: value.apiBase ?? '',
		stream: value.stream ?? true, timeoutSeconds: value.timeoutSeconds ?? 60,
		temperature: value.temperature ?? null, systemPrompt: value.systemPrompt ?? '',
		maxPromptChars: value.maxPromptChars ?? 4000, historyMessages: value.historyMessages ?? 8,
		historyMessageChars: value.historyMessageChars ?? 2000 }
}

export function ExperimentAIKeySettings({ experiments }: { experiments: Experiment[] }) {
	const [experimentId, setExperimentId] = useState('__common__')
	const [apiKey, setApiKey] = useState('')
	const [status, setStatus] = useState<ExperimentAIKeyStatus | null>(null)
	const [configuration, setConfiguration] = useState<ExperimentAISettingsInput | null>(null)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [testing, setTesting] = useState(false)
	const busy = saving || testing
	const [message, setMessage] = useState('')
	const isCommon = experimentId === '__common__'
	useEffect(() => {
		let active = true
		if (experimentId) void getExperimentAIKey(experimentId)
			.then((value) => { if (active) {
				setStatus(value)
				setConfiguration(aiSettingsFields(value))
			} })
			.catch(() => { if (active) setMessage('Could not load AI key settings. Select the experiment again to retry.') })
			.finally(() => { if (active) setLoading(false) })
		return () => { active = false }
	}, [experimentId])
	const updateKey = async (remove: boolean) => {
		if (!experimentId || busy || loading || !status || !configuration) return
		setSaving(true)
		setMessage('')
		try {
			const value = remove
				? await removeExperimentAIKey(experimentId)
				: await saveExperimentAIKey(experimentId, apiKey.trim(), configuration)
			setStatus(value)
			setConfiguration(aiSettingsFields(value))
			setApiKey('')
			setMessage(remove ? 'Common configuration reset to server defaults.' : isCommon ? 'Common AI configuration saved.' : 'AI settings saved for this experiment.')
		} catch (error) {
			setMessage(error instanceof HttpError ? error.message : 'Could not save AI settings. Check the parameters and try again.')
		} finally { setSaving(false) }
	}
	const updateSource = async (useCommon: boolean) => {
		if (busy || loading || isCommon || !experimentId) return
		setSaving(true)
		setApiKey('')
		setMessage('')
		try {
			const value = await setExperimentAISource(experimentId, useCommon)
			setStatus(value)
			setConfiguration(aiSettingsFields(value))
			setMessage('Configuration source saved.')
		} catch { setMessage('Could not change the configuration source. Please retry.') }
		finally { setSaving(false) }
	}
	const testConnection = async () => {
		if (busy || loading || !status?.configured) return
		setTesting(true)
		setMessage('Testing saved AI configuration…')
		try {
			await testExperimentAIConnection(experimentId)
			setMessage('The AI provider returned a reply using the saved configuration.')
		} catch (error) {
			setMessage(error instanceof HttpError ? error.message : 'Could not test the saved AI configuration.')
		} finally {
			setTesting(false)
		}
	}
	return <section className="settings-card ai-settings-card">
		<div className="settings-card-heading">
			<h3>AI API keys</h3>
			<p className="card-sub">Set a common AI configuration for your experiments, or choose an independent configuration for a specific experiment. Switching sources keeps the saved independent settings.</p>
		</div>
		<div className="ai-key-controls">
			<div className="settings-field">
				<label htmlFor="ai-key-experiment">Experiment</label>
				<select id="ai-key-experiment" value={experimentId} disabled={busy} onChange={(event) => {
					setApiKey('')
					setStatus(null)
					setConfiguration(null)
					setMessage('')
					setLoading(Boolean(event.target.value))
					setExperimentId(event.target.value)
				}}>
					<option value="__common__">Common configuration (all my experiments)</option>
					{experiments.map((experiment) => <option key={experiment.id} value={experiment.id}>{experiment.name} ({experiment.code})</option>)}
				</select>
			</div>
			{loading && <p>Loading AI key settings…</p>}
			{status && !isCommon && <label className="ai-independent-option">
				<input type="checkbox" checked={!status.useCommon} disabled={busy}
					onChange={(event) => void updateSource(!event.target.checked)} />
				Use independent configuration
			</label>}
			{status?.useCommon && !isCommon && <div className="ai-key-controls">
				<p>This experiment follows your common configuration, including future updates.</p>
				{!status.configured && <p>The common AI configuration is incomplete.</p>}
				<button type="button" className="secondary-button" disabled={busy || loading} onClick={() => {
					setStatus(null); setConfiguration(null); setApiKey(''); setMessage(''); setLoading(true); setExperimentId('__common__')
				}}>Edit common configuration</button>
			</div>}
			{status && configuration && (isCommon || !status.useCommon) && <form className="ai-key-controls" onSubmit={(event) => { event.preventDefault(); void updateKey(false) }}>
				<p className="settings-hint">{status.configured ? 'Saved configuration is ready to test.' : 'Add an API key and save to enable the connection test.'}</p>
				<div className="settings-field">
					<label htmlFor="ai-provider">Provider</label>
					<select id="ai-provider" value={configuration.provider === 'workbuddy' ? '' : configuration.provider} disabled={busy} required onChange={(event) => {
						setApiKey('')
						setMessage('')
						setConfiguration({ ...configuration, ...(event.target.value === 'google' ? googleAI : {
							provider: 'openai_compatible', model: 'gpt-4o-mini', apiBase: 'https://api.openai.com/v1/chat/completions',
						}) })
					}}>
						{configuration.provider === 'workbuddy' && <option value="" disabled>Select a supported provider</option>}
						<option value="openai_compatible">OpenAI / compatible API</option>
						<option value="google">Google Gemini</option>
					</select>
				</div>
				{configuration.provider === 'google' && <p className="settings-hint">
					Uses Gemini 3.5 Flash-Lite with Google’s endpoint.
					{' '}<a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a Gemini API key</a>.
				</p>}
				<div className="settings-field">
					<label htmlFor="experiment-ai-key">API key</label>
					<input id="experiment-ai-key" type="password" autoComplete="new-password" value={apiKey} disabled={busy} maxLength={4096}
						onChange={(event) => setApiKey(event.target.value)} required={configuration.provider !== status.provider || (status.hasCustomKey && configuration.apiBase !== status.apiBase)}
						placeholder={status.hasCustomKey && configuration.provider === status.provider ? 'Enter a replacement key' : 'Enter API key'} />
				</div>
				<p className="settings-hint">Leave this blank to keep a saved key for the same connection.</p>
				<details className="ai-advanced-settings"><summary>Advanced settings</summary>
					{configuration.provider === 'openai_compatible' && <div className="ai-parameter-grid">
						<div className="settings-field">
							<label htmlFor="ai-model">Model</label>
							<input id="ai-model" required maxLength={255} value={configuration.model} disabled={busy} onChange={(event) => setConfiguration({ ...configuration, model: event.target.value })} />
						</div>
						<div className="settings-field">
							<label htmlFor="ai-api-base">API endpoint URL</label>
							<input id="ai-api-base" type="url" required maxLength={2048} value={configuration.apiBase ?? ''} disabled={busy} onChange={(event) => setConfiguration({ ...configuration, apiBase: event.target.value })} />
						</div>
					</div>}
					<div className="ai-parameter-grid">
						<label className="switch-label"><span>Streaming responses</span>
							<button type="button" role="switch" aria-label="Streaming responses" aria-checked={configuration.stream ?? true} className={configuration.stream ? 'switch on' : 'switch'} disabled={busy} onClick={() => setConfiguration({ ...configuration, stream: !configuration.stream })}><span></span></button>
						</label>
						<div className="settings-field"><label htmlFor="ai-timeout">Timeout (seconds)</label>
							<input id="ai-timeout" type="number" required min="0.1" max="600" step="any" value={configuration.timeoutSeconds} disabled={busy} onChange={(event) => setConfiguration({ ...configuration, timeoutSeconds: Number(event.target.value) })} />
						</div>
					</div>
					<div className="settings-field"><label htmlFor="ai-temperature">Temperature (optional)</label>
						<input id="ai-temperature" type="number" min="0" max="2" step="any" placeholder="Provider default" value={configuration.temperature ?? ''} disabled={busy} onChange={(event) => setConfiguration({ ...configuration, temperature: event.target.value === '' ? null : Number(event.target.value) })} />
					</div>
					<div className="settings-field"><label htmlFor="ai-system-prompt">System prompt</label>
						<textarea id="ai-system-prompt" rows={5} maxLength={50000} placeholder="Use the built-in research assistant instructions" value={configuration.systemPrompt ?? ''} disabled={busy} onChange={(event) => setConfiguration({ ...configuration, systemPrompt: event.target.value })} />
					</div>
					<div className="ai-parameter-grid">
						{([
							['maxPromptChars', 'Maximum prompt characters', 1, 20000],
							['historyMessages', 'History messages', 0, 100],
							['historyMessageChars', 'Characters per history message', 1, 20000],
						] as const).map(([key, label, min, max]) => <div className="settings-field" key={key}>
							<label htmlFor={'ai-' + key}>{label}</label>
							<input id={'ai-' + key} type="number" required min={min} max={max} step="1" value={configuration[key]} disabled={busy} onChange={(event) => setConfiguration({ ...configuration, [key]: Number(event.target.value) })} />
						</div>)}
					</div>
				</details>
				<div className="settings-actions">
					<button type="submit" className="primary-button" disabled={busy}>{saving ? 'Saving…' : 'Save AI settings'}</button>
					{isCommon && (status.hasCustomKey || status.hasCustomSettings) && <button type="button" className="secondary-button" disabled={busy} onClick={() => void updateKey(true)}>Use server default</button>}
				</div>
			</form>}
			{status?.configured && !apiKey && configuration &&
				JSON.stringify(configuration) === JSON.stringify(aiSettingsFields(status)) && <div className="settings-actions">
				<button type="button" className="secondary-button" disabled={busy} onClick={() => void testConnection()}>
					Test saved connection
				</button>
			</div>}
			<p role="status">{message}</p>
		</div>
	</section>
}

// Show AI settings, profiles, members, platform settings, and local usage.
/**
 * Lets a researcher choose where new files are written. The backend validates
 * the choice and probes it for writability, so a rejected location is reported
 * instead of being silently accepted.
 */
export function StorageLocationCard() {
	const [settings, setSettings] = useState<StorageSettings | null>(null)
	const [loadError, setLoadError] = useState('')
	const [saving, setSaving] = useState(false)
	const [message, setMessage] = useState('')
	const [failure, setFailure] = useState('')
	const fieldId = useId()

	useEffect(() => {
		let active = true
		void getStorageSettings()
			.then((value) => {
				if (active) {
					setSettings(value)
					setLoadError('')
				}
			})
			.catch(() => {
				if (active)
					setLoadError('Could not load the storage location settings.')
			})
		return () => {
			active = false
		}
	}, [])

	const change = async (location: string) => {
		setSaving(true)
		setMessage('')
		setFailure('')
		try {
			const next = await saveStorageSettings(location)
			setSettings(next)
			setMessage(
				`New uploads and recordings are now written to "${next.location}". Files already saved stay in their original location.`,
			)
		} catch (error) {
			setFailure(
				error instanceof Error && error.message
					? error.message
					: 'Could not change the storage location.',
			)
		} finally {
			setSaving(false)
		}
	}

	return (
		<section className="settings-card">
			<h3>Storage</h3>
			<p className="card-sub">
				Choose where uploaded materials and recorded media are written.
				Changing it affects new files only.
			</p>
			<div className="settings-field">
				<label htmlFor={fieldId}>Storage location</label>
				<select
					id={fieldId}
					aria-label="Storage location"
					value={settings?.location ?? ''}
					disabled={!settings || saving}
					onChange={(event) => void change(event.target.value)}
				>
					{settings ? (
						settings.locations.map((name) => (
							<option key={name} value={name}>
								{name === 'legacy' ? 'Local server storage' : name}
							</option>
						))
					) : (
						<option value="">Loading…</option>
					)}
				</select>
			</div>
			{saving && <p className="settings-hint">Checking the location…</p>}
			{loadError && (
				<p className="settings-hint" role="alert">
					{loadError}
				</p>
			)}
			{failure && (
				<p className="settings-hint" role="alert">
					{failure}
				</p>
			)}
			{message && (
				<p className="settings-hint" role="status">
					{message}
				</p>
			)}
			{settings && (
				<p className="settings-hint">
					{settings.location === 'legacy' ? 'Files are stored on this server.' : 'New files use the selected storage location.'}
				</p>
			)}
		</section>
	)
}

export function WorkspaceSettingsPage({
	experiments,
	settings,
	onChange,
	onClearAll,
}: {
	experiments: Experiment[]
	settings: { researcherName: string }
	onChange: (next: { researcherName: string }) => void
	onClearAll: () => void
}) {
	// Track backend members and platform settings.
	const [members, setMembers] = useState<Researcher[]>([])
	const [platform, setPlatform] = useState<PlatformSettings | null>(null)
	const me = getCurrentResearcher()
	// Load data and ignore results after unmount.
	useEffect(() => {
		let active = true
		void (async () => {
			try {
				// Fetch researchers and platform settings in parallel.
				const [people, current] = await Promise.all([
					getWorkspaceMembers(),
					getWorkspaceSettings(),
				])
				if (active) {
					setMembers(people)
					setPlatform(current)
				}
			} catch {
				// Clear members if member or setting requests fail.
				if (active) setMembers([])
			}
		})()
		return () => {
			active = false
		}
	}, [])

	// Count local workspace sessions, events, and stored characters.
	let sessionCount = 0
	let eventCount = 0
	let storageBytes = 0
	for (let i = 0; i < localStorage.length; i += 1) {
		// Count stored characters and event logs in workspace caches.
		const key = localStorage.key(i)
		if (!key || !key.startsWith('p13-')) continue
		const value = localStorage.getItem(key) ?? ''
		storageBytes += key.length + value.length
		if (key.startsWith('p13-events:')) {
			// Count participant logs and valid events.
			sessionCount += 1
			try {
				const parsed = JSON.parse(value) as { events?: unknown[] }
				if (Array.isArray(parsed.events))
					eventCount += parsed.events.length
			} catch {
				// Skip invalid event logs.
			}
		}
	}
	const storageKb = (storageBytes / 1024).toFixed(1)

	return (
		<div className="page workspace-settings-page">
			{/* Page heading and main actions. */}
			<div className="page-heading">
				<div>
					<p className="eyebrow">WORKSPACE</p>
					<h1>Workspace settings</h1>
					<p className="subheading">
						Manage AI configurations, your profile, members and workspace policies.
					</p>
				</div>
			</div>

			{/* AI configuration, profile, members, policies, usage, and cache settings. */}
			<div className="settings-grid">
				<ExperimentAIKeySettings experiments={experiments} />
				{/* Where new uploads and recordings are written. */}
				<StorageLocationCard />
				{/* Researcher profile and display name. */}
				<section className="settings-card">
					<h3>Profile</h3>
					<p className="card-sub">
						How your name appears across the workspace.
					</p>
					<div className="settings-field">
						<label>Researcher name</label>
						<input
							value={settings.researcherName}
							onChange={(event) =>
								onChange({ researcherName: event.target.value })
							}
						/>
					</div>
					{me && (
						<div className="member-row" style={{ marginTop: 14 }}>
							<span className="member-avatar">
								{me.name.charAt(0).toUpperCase()}
							</span>
							<div className="member-info">
								<strong>{me.name}</strong>
								<small>{me.email}</small>
							</div>
							<span className="pill">{me.role}</span>
						</div>
					)}
				</section>

				{/* Workspace members and roles. */}
				<section className="settings-card">
					<h3>Members</h3>
					<p className="card-sub">
						Researchers with access to this workspace. Roles are
						managed in Administration.
					</p>
					{members.length === 0 ? (
						<p className="settings-hint">No members loaded yet.</p>
					) : (
						members.map((person) => (
							<div className="member-row" key={person.id}>
								<span className="member-avatar">
									{person.name.charAt(0).toUpperCase()}
								</span>
								<div className="member-info">
									<strong>{person.name}</strong>
									<small>{person.email}</small>
								</div>
								<span className="pill">{person.role}</span>
							</div>
						))
					)}
				</section>

				{/* Platform settings from the admin API. */}
				<section className="settings-card">
					<h3>Permissions</h3>
					<p className="card-sub">
						Platform policy mirror. These are managed by
						administrators in Administration.
					</p>
					{platform ? (
						<>
							<div className="pref-row">
								<div className="pref-info">
									<strong>Self-registration</strong>
								</div>
								<span className="pill">
									{platform.allowSelfRegistration
										? 'Allowed'
										: 'Restricted'}
								</span>
							</div>
							<div className="pref-row">
								<div className="pref-info">
									<strong>Consent signature</strong>
								</div>
								<span className="pill">
									{platform.requireConsentSignature
										? 'Required'
										: 'Optional'}
								</span>
							</div>
							<div className="pref-row">
								<div className="pref-info">
									<strong>Data retention</strong>
								</div>
								<span className="pill">
									{platform.dataRetentionDays} days
								</span>
							</div>
							<div className="pref-row">
								<div className="pref-info">
									<strong>Max session length</strong>
								</div>
								<span className="pill">
									{platform.maxSessionMinutes} min
								</span>
							</div>
						</>
					) : (
						<p className="settings-hint">
							Platform settings could not be loaded.
						</p>
					)}
				</section>

				{/* Local session, event, and stored character counts. */}
				<section className="settings-card">
					<h3>Usage statistics</h3>
					<p className="card-sub">
						Live counts from this browser&apos;s workspace storage.
					</p>
					<div className="stat-mini">
						<div>
							<span>Experiments</span>
							<strong>{experiments.length}</strong>
						</div>
						<div>
							<span>Captured sessions</span>
							<strong>{sessionCount}</strong>
						</div>
						<div>
							<span>Captured events</span>
							<strong>{eventCount}</strong>
						</div>
						<div>
							<span>Storage used</span>
							<strong>{storageKb} KB</strong>
						</div>
					</div>
				</section>

				{/* Clear local workspace data after confirmation. */}
				<section className="settings-card settings-danger-card">
					<h3>Danger zone</h3>
					<p className="card-sub">
						Irreversible local-data operations.
					</p>
					<p className="settings-hint">
						Clearing local data removes cached preferences and event
						logs from this device. Experiments and sessions saved on
						the study server remain available.
					</p>
					<button
						className="danger-button"
						onClick={() => {
							// Clear local caches after user confirmation.
							if (
								window.confirm(
									'Clear all local data? This cannot be undone.',
								)
							)
								onClearAll()
						}}
					>
						Clear all local data
					</button>
				</section>
			</div>
		</div>
	)
}

type TimelineEvent = ParticipantEvent & {
	elapsedMs?: number
	order?: number
	sessionId?: string
	sessionLabel?: string
}

/** Elapsed milliseconds since the session's own first event (0 when unknown). */
const elapsedOfEvent = (event: TimelineEvent) =>
	Number.isFinite(event.elapsedMs) && (event.elapsedMs ?? 0) >= 0
		? (event.elapsedMs as number)
		: Math.max(0, event.epochMs)

/** Compact duration for axis ticks: raw millisecond values ("13143656.7ms")
 *  collide into an unreadable smear; "3h 39m" carries the same information in
 *  a fraction of the width. */
function fmtElapsed(ms: number): string {
	const totalSeconds = Math.round(ms / 1000)
	if (totalSeconds < 1) return '0s'
	if (totalSeconds < 60) return `${totalSeconds}s`
	const minutes = Math.floor(totalSeconds / 60)
	const rest = totalSeconds % 60
	if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
	const hours = Math.floor(minutes / 60)
	const minutesRest = minutes % 60
	return minutesRest ? `${hours}h ${minutesRest}m` : `${hours}h`
}

function ResultPlot({
	chart,
	events,
	segments,
}: {
	chart: string
	events: TimelineEvent[]
	segments: { label: string; count: number }[]
}) {
	const maxElapsed = Math.max(1, ...events.map(elapsedOfEvent))
	const maxOrder = Math.max(1, ...events.map((event) => event.order ?? 1))

	const W = 600
	const H = 280
	const LEFT = 55
	const RIGHT = 590
	const TOP = 22
	const BOTTOM = 200
	const plotW = RIGHT - LEFT
	const plotH = BOTTOM - TOP

	// Histogram bins over the per-session elapsed timeline (0 → last event).
	const bins = Array.from({ length: 10 }, (_, i) => ({
		label: fmtElapsed((i * maxElapsed) / 10),
		count: 0,
	}))
	events.forEach((event) => {
		bins[Math.min(9, Math.floor((elapsedOfEvent(event) / maxElapsed) * 10))]
			.count++
	})
	const data = chart === 'histogram' ? bins : segments
	const peak = Math.max(1, ...data.map((d) => d.count))

	const title =
		chart === 'scatter'
			? 'Event sequence by elapsed time'
			: chart === 'histogram'
				? 'Elapsed time to each event'
				: 'Event count'

	const barX = (i: number) => LEFT + 4 + (i * plotW) / data.length
	const barWidth = Math.max(2, plotW / data.length - 8)
	const barTop = (count: number) => BOTTOM - (count / peak) * plotH
	const fractions = [0.25, 0.5, 0.75, 1]
	// Rotated 40° with an end anchor so long category names stop colliding
	// with their neighbours (the root cause of the "garbled" axis text).
	const tickLabel = (x: number, text: string) => (
		<text
			transform={`rotate(-40 ${x} ${BOTTOM + 16})`}
			x={x}
			y={BOTTOM + 16}
			fontSize="9"
			textAnchor="end"
			fill="#475569"
		>
			{text}
		</text>
	)

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			role="img"
			aria-label={`${chart} chart`}
			style={{ width: '100%', maxHeight: 320 }}
		>
			<text x={LEFT} y="14" fontSize="12" fontWeight="600" fill="#1e293b">
				{title}
			</text>
			{fractions.map((fraction) => (
				<g key={fraction}>
					<line
						x1={LEFT}
						x2={RIGHT}
						y1={BOTTOM - fraction * plotH}
						y2={BOTTOM - fraction * plotH}
						stroke="#e8eef5"
					/>
					<text
						x={LEFT - 6}
						y={BOTTOM - fraction * plotH + 3}
						fontSize="9"
						textAnchor="end"
						fill="#64748b"
					>
						{chart === 'scatter'
							? Math.round(maxOrder * fraction)
							: Math.round(peak * fraction)}
					</text>
				</g>
			))}
			<line x1={LEFT} x2={RIGHT} y1={BOTTOM} y2={BOTTOM} stroke="#cbd5e1" />
			<line x1={LEFT} x2={LEFT} y1={TOP} y2={BOTTOM} stroke="#cbd5e1" />
			{chart === 'scatter' ? (
				<>
					{events.map((event, i) => (
						<circle
							key={i}
							cx={LEFT + (elapsedOfEvent(event) / maxElapsed) * plotW}
							cy={
								BOTTOM -
								((event.order ?? 1) / maxOrder) * plotH
							}
							r="3"
							fill="#2563eb"
						>
							<title>
								{event.type} · {fmtElapsed(elapsedOfEvent(event))} ·
								event {event.order ?? event.seq}
							</title>
						</circle>
					))}
					{[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
						<text
							key={fraction}
							x={LEFT + fraction * plotW}
							y={BOTTOM + 16}
							fontSize="9"
							textAnchor="middle"
							fill="#64748b"
						>
							{fmtElapsed(fraction * maxElapsed)}
						</text>
					))}
					<text
						x={(LEFT + RIGHT) / 2}
						y={BOTTOM + 32}
						fontSize="9"
						textAnchor="middle"
						fill="#64748b"
					>
						Elapsed time since each session started
					</text>
				</>
			) : (
				data.map((d, i) => (
					<g key={i}>
						<rect
							x={barX(i)}
							y={barTop(d.count)}
							width={barWidth}
							height={BOTTOM - barTop(d.count)}
							fill="#2563eb"
						>
							<title>
								{d.label}: {d.count}
							</title>
						</rect>
						<text
							x={barX(i) + barWidth / 2}
							y={barTop(d.count) - 4}
							fontSize="9"
							textAnchor="middle"
							fill="#475569"
						>
							{d.count > 0 ? d.count : ''}
						</text>
						{tickLabel(barX(i) + barWidth / 2, d.label.slice(0, 12))}
					</g>
				))
			)}
		</svg>
	)
}

/**
 * Per-session event raster ("Session timelines"): one horizontal row per
 * captured session, x = elapsed time since that session's own first event,
 * each dot = one event coloured by its type. It is the closest visual match
 * to the client's "precise single-clock timeline" requirement: it shows when
 * bursts happen inside each session and lets a researcher compare pacing
 * across sessions on one shared elapsed-time axis.
 */
function SessionTimeline({ events }: { events: TimelineEvent[] }) {
	const groups = new Map<
		string,
		{ id: string; label: string; events: TimelineEvent[] }
	>()
	events.forEach((event) => {
		const id = event.sessionId ?? 'session'
		const group = groups.get(id) ?? {
			id,
			label: event.sessionLabel ?? 'Session',
			events: [],
		}
		group.events.push(event)
		groups.set(id, group)
	})
	const sessions = [...groups.values()].sort(
		(a, b) => (a.events[0]?.epochMs ?? 0) - (b.events[0]?.epochMs ?? 0),
	)
	const maxElapsed = Math.max(1, ...events.map(elapsedOfEvent))

	const W = 600
	const LEFT = 124
	const RIGHT = 590
	const TOP = 34
	const rowH = Math.max(14, Math.min(26, 220 / Math.max(1, sessions.length)))
	const BOTTOM = TOP + sessions.length * rowH
	const H = BOTTOM + 44
	const plotW = RIGHT - LEFT
	const fractions = [0, 0.25, 0.5, 0.75, 1]

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			role="img"
			aria-label="timeline chart"
			style={{ width: '100%', maxHeight: 320 }}
		>
			<text x={LEFT} y="14" fontSize="12" fontWeight="600" fill="#1e293b">
				Session timelines
			</text>
			{sessions.map((session, row) => {
				const cy = TOP + row * rowH + rowH / 2
				return (
					<g key={session.id}>
						<text
							x={LEFT - 8}
							y={cy + 3}
							fontSize="9"
							textAnchor="end"
							fill="#475569"
						>
							{`${session.label} · ${session.id.slice(0, 6)}`.slice(
								0,
								24,
							)}
						</text>
						<line
							x1={LEFT}
							x2={RIGHT}
							y1={cy}
							y2={cy}
							stroke="#eef2f7"
						/>
						{session.events.map((event, i) => (
							<circle
								key={i}
								cx={
									LEFT +
									(elapsedOfEvent(event) / maxElapsed) * plotW
								}
								cy={cy}
								r="3"
								fill={
									TYPE_META[event.type]?.color ?? '#64748b'
								}
							>
								<title>
									{TYPE_META[event.type]?.label ?? event.type}{' '}
									· {fmtElapsed(elapsedOfEvent(event))} ·
									event {event.order ?? event.seq}
								</title>
							</circle>
						))}
					</g>
				)
			})}
			<line
				x1={LEFT}
				x2={RIGHT}
				y1={TOP - 8}
				y2={TOP - 8}
				stroke="#cbd5e1"
			/>
			<line x1={LEFT} x2={LEFT} y1={TOP - 8} y2={BOTTOM} stroke="#cbd5e1" />
			<line x1={LEFT} x2={RIGHT} y1={BOTTOM} y2={BOTTOM} stroke="#cbd5e1" />
			{fractions.map((fraction) => (
				<text
					key={fraction}
					x={LEFT + fraction * plotW}
					y={BOTTOM + 16}
					fontSize="9"
					textAnchor="middle"
					fill="#64748b"
				>
					{fmtElapsed(fraction * maxElapsed)}
				</text>
			))}
			<text
				x={(LEFT + RIGHT) / 2}
				y={BOTTOM + 32}
				fontSize="9"
				textAnchor="middle"
				fill="#64748b"
			>
				Elapsed time since each session started
			</text>
		</svg>
	)
}
