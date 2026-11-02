import { useTransientNotice } from '../participant/TimerController'
import { useState, useEffect, useId } from 'react'
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
	getStorageSettings,
	saveStorageSettings,
	type StorageSettings,
	getExperimentAIKey,
	saveExperimentAIKey,
	removeExperimentAIKey,
	type ExperimentAIKeyStatus,
} from '../api/experiments'
import { ExportDialog } from '../researcher/ExportDialog'
import type { ParticipantEvent, ParticipantEventType } from '../participant/EventQueue'
import { listSessions, downloadSessionWorkbook } from '../api/participant'
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
	events: ParticipantEvent[]
	experimentName: string
	experimentCode: string
}

export function ResultsPage({ experiments }: { experiments: Experiment[] }) {
	const [experimentCode, setExperimentCode] = useState('')
	const [chart, setChart] = useState('bar')
	const [openId, setOpenId] = useState<string | null>(null)
	const [sessions, setSessions] = useState<SessionData[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError, errorVisible, errorRevision] =
		useTransientNotice('')
	const [downloading, setDownloading] = useState<string | null>(null)

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
						experimentCode: s.experimentCode,
						events: s.events,
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
	const allEvents = visibleSessions
		.flatMap((s) => s.events)
		.filter((event) => Number.isFinite(event.epochMs) && event.epochMs > 0)
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
						onChange={(e) => setExperimentCode(e.target.value)}
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
						}).map(([type, title]) => (
							<option key={type} value={type}>
								{title}
							</option>
						))}
					</select>
				</label>
			</div>
			{!loading && !error && totalEvents === 0 && (
				<p>No valid timestamped events for this selection.</p>
			)}
			{!loading && !error && totalEvents > 0 && (
				<div className="chart-card results-chart-card">
					<div className="results-chart-visual">
						{chart === 'pie' ? (
							<Doughnut segments={segments} total={totalEvents} />
						) : chart === 'line' ? (
							<ActivityLine events={allEvents} />
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
										<td>{s.label}</td>
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
						const first = session.events[0]
						const last = session.events[session.events.length - 1]
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
										<small>{session.id}</small>
									</div>
									<div className="session-chips">
										<span className="session-chip">
											{session.events.length} events
										</span>
										<span className="session-chip">
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
											disabled={downloading !== null}
											onClick={() => {
												setDownloading(session.id)
												setError('')
												void downloadSessionWorkbook(
													session.id,
												)
													.catch(() =>
														setError(
															'Could not download the experiment workbook. Please retry.',
														),
													)
													.finally(() =>
														setDownloading(null),
													)
											}}
										>
											{downloading === session.id
												? 'Downloading…'
												: 'Download Excel'}
										</button>
									</div>
								</div>
								{open && (
									<div className="session-body">
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
		</section>
	)
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
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds - minutes * 60)
  return `${minutes}m ${remainder}s`
}

function detailText(detail?: Record<string, unknown>): string {
  if (!detail) return '—'
  const text = Object.entries(detail)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('  ·  ')
  return text.length > 96 ? `${text.slice(0, 96)}…` : text
}

// Device-local workspace notification preferences.
interface WorkspacePrefs {
	notifyStudyEvents: boolean
	notifyWeeklySummary: boolean
	notifyExports: boolean
}

// Local storage key for notification preferences.
const PREFS_KEY = 'p13-workspace-prefs'
// Default preferences for missing or invalid cached settings.
const DEFAULT_PREFS: WorkspacePrefs = {
	notifyStudyEvents: true,
	notifyWeeklySummary: false,
	notifyExports: true,
}

// Merge saved preferences with defaults; fall back if invalid.
function loadPrefs(): WorkspacePrefs {
	try {
		// Parse cached data; fall back if invalid.
		const raw = localStorage.getItem(PREFS_KEY)
		if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<WorkspacePrefs>) }
	} catch {
		// Use default notification preferences if the cache is invalid.
	}
	return DEFAULT_PREFS
}

export function ExperimentAIKeySettings({ experiments }: { experiments: Experiment[] }) {
	const [experimentId, setExperimentId] = useState('')
	const [apiKey, setApiKey] = useState('')
	const [status, setStatus] = useState<ExperimentAIKeyStatus | null>(null)
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [message, setMessage] = useState('')
	useEffect(() => {
		let active = true
		if (experimentId) void getExperimentAIKey(experimentId)
			.then((value) => { if (active) setStatus(value) })
			.catch(() => { if (active) setMessage('Could not load AI key settings. Select the experiment again to retry.') })
			.finally(() => { if (active) setLoading(false) })
		return () => { active = false }
	}, [experimentId])
	const updateKey = async (remove: boolean) => {
		if (!experimentId || saving || loading || !status) return
		setSaving(true)
		setMessage('')
		try {
			const value = remove
				? await removeExperimentAIKey(experimentId)
				: await saveExperimentAIKey(experimentId, apiKey.trim())
			setStatus(value)
			setApiKey('')
			setMessage(remove ? 'Custom key removed. This experiment now uses the server default.' : 'API key saved for this experiment.')
		} catch {
			setMessage('Could not save AI key settings. Check the key and try again.')
		} finally { setSaving(false) }
	}
	return <section className="settings-card">
		<h3>AI API keys</h3>
		<p className="card-sub">Configure a separate API key for each experiment. Experiments without a custom key use the server default. The provider, model and API address follow server settings.</p>
		<div className="settings-field">
			<label htmlFor="ai-key-experiment">Experiment</label>
			<select id="ai-key-experiment" value={experimentId} disabled={saving} onChange={(event) => {
				setApiKey('')
				setStatus(null)
				setMessage('')
				setLoading(Boolean(event.target.value))
				setExperimentId(event.target.value)
			}}>
				<option value="">Select an experiment</option>
				{experiments.map((experiment) => <option key={experiment.id} value={experiment.id}>{experiment.name} ({experiment.code})</option>)}
			</select>
		</div>
		{loading && <p>Loading AI key settings…</p>}
		{status && <>
			<p>{status.hasCustomKey ? 'Custom API key configured' : 'Using server default'} · {status.provider} · {status.model}</p>
			{!status.configured && <p>AI is not configured. Check the API key and server settings.</p>}
			<div className="settings-field">
				<label htmlFor="experiment-ai-key">API key</label>
				<input id="experiment-ai-key" type="password" autoComplete="new-password" value={apiKey} disabled={saving} maxLength={4096}
					onChange={(event) => setApiKey(event.target.value)} placeholder={status.hasCustomKey ? 'Enter a replacement key' : 'Enter API key'} />
			</div>
			<p className="settings-hint">Saved keys are kept on the server and are never displayed. Saving does not send a test request to the provider.</p>
			<button type="button" className="primary-button" disabled={saving || !apiKey.trim()} onClick={() => void updateKey(false)}>{saving ? 'Saving…' : 'Save API key'}</button>
			{status.hasCustomKey && <button type="button" className="secondary-button" disabled={saving} onClick={() => void updateKey(true)}>Use server default</button>}
		</>}
		<p role="status">{message}</p>
	</section>
}

// Show profiles, members, preferences, platform settings, and local usage.
export function WorkspaceSettingsPage({
	experiments,
	settings,
	onChange,
	onClose,
	onClearAll,
}: {
	experiments: Experiment[]
	settings: { researcherName: string }
	onChange: (next: { researcherName: string }) => void
	onClose: () => void
	onClearAll: () => void
}) {
	// Initialize local preferences and track backend members and settings.
	const [prefs, setPrefs] = useState<WorkspacePrefs>(loadPrefs)
	const [members, setMembers] = useState<Researcher[]>([])
	const [platform, setPlatform] = useState<PlatformSettings | null>(null)
	const me = getCurrentResearcher()
	const [storage, setStorage] = useState<StorageSettings | null>(null)
	const [storageMessage, setStorageMessage] = useState('')
	useEffect(() => {
		let active = true
		void getStorageSettings()
			.then((value) => {
				if (active) setStorage(value)
			})
			.catch(() => {
				if (active)
					setStorageMessage('Storage settings are unavailable.')
			})
		return () => {
			active = false
		}
	}, [])

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

	// Toggle a notification preference and save it locally.
	const togglePref = (key: keyof WorkspacePrefs) => {
		const next = { ...prefs, [key]: !prefs[key] }
		setPrefs(next)
		localStorage.setItem(PREFS_KEY, JSON.stringify(next))
	}

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
		<div className="page">
			{/* Page heading and main actions. */}
			<div className="page-heading">
				<div>
					<p className="eyebrow">WORKSPACE</p>
					<h1>Workspace settings</h1>
					<label>
						Server storage location{' '}
						<select
							aria-label="Server storage location"
							value={storage?.location ?? ''}
							disabled={!storage}
							onChange={(event) => {
								void saveStorageSettings(event.target.value)
									.then((value) => {
										setStorage(value)
										setStorageMessage(
											'Storage preference saved. Existing files stay accessible.',
										)
									})
									.catch(() =>
										setStorageMessage(
											'Could not save storage location. Check server configuration and free space.',
										),
									)
							}}
						>
							{storage?.locations.map((location) => (
								<option key={location} value={location}>
									{location}
								</option>
							))}
						</select>
					</label>
					<p role="status">{storageMessage}</p>
					<p className="subheading">
						Profile, members, notifications and workspace
						statistics. Platform-level configuration lives in
						Administration.
					</p>
				</div>
				<button className="secondary-button" onClick={onClose}>
					Back
				</button>
			</div>

			{/* Profile, members, preferences, policies, usage, and cache settings. */}
			<div className="settings-grid">
				<ExperimentAIKeySettings experiments={experiments} />
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

				{/* Device-local notification preferences. */}
				<section className="settings-card">
					<h3>Notifications</h3>
					<p className="card-sub">
						Workspace-level notification preferences, stored on this
						device.
					</p>
					<div className="pref-row">
						<div className="pref-info">
							<strong>Study events</strong>
							<small>
								Alert me when a participant session starts or is
								aborted.
							</small>
						</div>
						<button
							className={
								prefs.notifyStudyEvents ? 'switch on' : 'switch'
							}
							onClick={() => togglePref('notifyStudyEvents')}
							aria-label="Toggle study event notifications"
						>
							<span></span>
						</button>
					</div>
					<div className="pref-row">
						<div className="pref-info">
							<strong>Weekly summary</strong>
							<small>
								Send me a weekly digest of captured sessions and
								events.
							</small>
						</div>
						<button
							className={
								prefs.notifyWeeklySummary
									? 'switch on'
									: 'switch'
							}
							onClick={() => togglePref('notifyWeeklySummary')}
							aria-label="Toggle weekly summary notifications"
						>
							<span></span>
						</button>
					</div>
					<div className="pref-row">
						<div className="pref-info">
							<strong>Export notifications</strong>
							<small>
								Notify me when an export of event timelines
								completes.
							</small>
						</div>
						<button
							className={
								prefs.notifyExports ? 'switch on' : 'switch'
							}
							onClick={() => togglePref('notifyExports')}
							aria-label="Toggle export notifications"
						>
							<span></span>
						</button>
					</div>
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
				<section className="settings-card">
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
						style={{ marginTop: 12 }}
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

function ResultPlot({
	chart,
	events,
	segments,
}: {
	chart: string
	events: ParticipantEvent[]
	segments: { label: string; count: number }[]
}) {
	const min = Math.min(...events.map((e) => e.epochMs))
	const span = Math.max(1, Math.max(...events.map((e) => e.epochMs)) - min)
	const bins = Array.from({ length: 10 }, (_, i) => ({
		label: `${((i * span) / 10).toFixed(1)}ms`,
		count: 0,
	}))
	events.forEach(
		(e) =>
			bins[Math.min(9, Math.floor(((e.epochMs - min) / span) * 10))]
				.count++,
	)
	const data = chart === 'histogram' ? bins : segments
	const peak = Math.max(1, ...data.map((d) => d.count))
	return (
		<svg
			viewBox="0 0 600 240"
			role="img"
			aria-label={`${chart} chart`}
			style={{ width: '100%', maxHeight: 320 }}
		>
			<text x="30" y="16">
				{chart === 'scatter'
					? 'Event sequence by elapsed time'
					: 'Event count'}
			</text>
			{chart === 'scatter'
				? events.map((e, i) => (
						<circle
							key={i}
							cx={30 + ((e.epochMs - min) / span) * 540}
							cy={
								205 - (i / Math.max(1, events.length - 1)) * 170
							}
							r="3"
							fill="#2563eb"
						>
							<title>
								{e.type}: {e.timestamp}, sequence {e.seq}
							</title>
						</circle>
					))
				: data.map((d, i) => (
						<g key={i}>
							<rect
								x={30 + (i * 540) / data.length}
								y={205 - (d.count / peak) * 170}
								width={Math.max(2, 500 / data.length)}
								height={(d.count / peak) * 170}
								fill="#2563eb"
							>
								<title>
									{d.label}: {d.count}
								</title>
							</rect>
							<text
								x={30 + (i * 540) / data.length}
								y="225"
								fontSize="9"
							>
								{d.label.slice(0, 12)}
							</text>
						</g>
					))}
		</svg>
	)
}
