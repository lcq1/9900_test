import { Modal, Dropdown } from 'antd'
import { useTransientNotice } from '../participant/TimerController'
import { useState, useEffect, useId, useRef, lazy, Suspense } from 'react'
import type { Experiment } from '../types'
import {
	ChevronDown,
	MoreHorizontal,
	Download,
	FileText,
    Video,
    MonitorPlay,
	Plus,
	Search,
	ShieldCheck,
	SlidersHorizontal,
	Trash2,
} from 'lucide-react'
import {
	getExperimentAIKey,
	downloadStudyTemplate,
	saveExperimentAIKey,
	removeExperimentAIKey,
	setExperimentAISource,
	testExperimentAIConnection,
	getStorageSettings,
	addStorageLocation,
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
import { getWorkspaceSettings, getWorkspaceMembers, getWorkspaceUsage, type WorkspaceUsage, type PlatformSettings } from '../api/administrator'
import type { Researcher } from '../api/auth'

const StudyQRCode = lazy(() => import('antd/es/qr-code'))

// Researcher dashboard with statistics, experiment search, editing, and export.
export function Dashboard({
	experiments,
	query,
	setQuery,
	onCreate,
	onEdit,
	onDelete,
    onDuplicate, onCollection, onImport, busy = false,
}: {
	experiments: Experiment[]
	query: string
	setQuery: (value: string) => void
	onCreate: () => void
	onEdit: (id: string) => void
	onDelete: (id: string) => void
    onDuplicate?: (study: Experiment) => void
    onCollection?: (study: Experiment) => void
    onImport?: (file: File) => void
    busy?: boolean
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
    const importInput = useRef<HTMLInputElement>(null)
    const [sharing, setSharing] = useState<Experiment | null>(null)
    const [actionError, setActionError] = useState('')
    const [copyNotice, setCopyNotice] = useState('')
    const participantLink = sharing ? window.location.origin + '/participant?experiment=' + encodeURIComponent(sharing.code) : ''
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
                <div className="settings-actions">
                    {onImport && <><input ref={importInput} type="file" accept=".json,application/json" hidden aria-label="Study design file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onImport(file) }} />
                    <button className="secondary-button" type="button" disabled={busy} onClick={() => importInput.current?.click()}>Import study design</button></>}
                    <button className="primary-button" disabled={busy} onClick={onCreate}><Plus size={17} /> New experiment</button>
                </div>
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
					<span className="stat-label">Open for participation</span>
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
            {actionError && <p className="entry-error" role="alert">{actionError}</p>}
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
                            <Dropdown trigger={['click']} menu={{ items: [
                                { key: 'share', label: 'Share participant link', disabled: experiment.status !== 'Live' },
                                { key: 'duplicate', label: 'Duplicate as draft', disabled: busy || !onDuplicate },
                                { key: 'design', label: 'Download study design', disabled: busy },
                                ...(experiment.status !== 'Draft' ? [{ key: 'collection', label: experiment.status === 'Live' ? 'Close recruitment' : 'Reopen recruitment', disabled: busy || !onCollection }] : []),
                            ], onClick: ({key, domEvent}) => {
                                domEvent.stopPropagation()
                                if (key === 'share') { setSharing(experiment); setCopyNotice('') }
                                if (key === 'duplicate') onDuplicate?.(experiment)
                                if (key === 'collection') onCollection?.(experiment)
                                if (key === 'design') { setActionError(''); void downloadStudyTemplate(experiment.id).catch(error => setActionError(error instanceof Error ? error.message : 'Could not download study design.')) }
                            } }}>
                                <button type="button" className="row-menu" aria-label={`Actions for ${experiment.name}`} onClick={event => event.stopPropagation()}><MoreHorizontal size={16} /></button>
                            </Dropdown>

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
            {sharing && <Modal title="Share participant access" open onCancel={() => setSharing(null)} footer={null}>
                {sharing && <div className="study-share-panel">
                    <p>Share this link or QR code. Participants still need an assigned participant code; the link does not grant access by itself.</p>
                    <label>Participant link<input value={participantLink} readOnly onFocus={event => event.target.select()} /></label>
                    <button type="button" className="primary-button" onClick={async () => { try { await navigator.clipboard.writeText(participantLink); setCopyNotice('Participant link copied.') } catch { setCopyNotice('Select and copy the link above manually.') } }}>Copy participant link</button>
                    <Suspense fallback={<p>Loading QR code…</p>}><StudyQRCode value={participantLink} size={160} /></Suspense>
                    {['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) && <p className="settings-hint" role="note">This link points to this computer only. Use the deployed HTTPS website address before sharing with participants on other devices.</p>}
                    <p className="settings-hint">To test participant access while signed in as a researcher, use a private browser window.</p>
                    {copyNotice && <p role="status">{copyNotice}</p>}
                </div>}
            </Modal>}
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
	stage_exit: { label: 'Stage exit', color: '#475569' },
	consent: { label: 'Consent', color: '#16856b' },
	oral_question: { label: 'Oral question', color: '#7955b4' },
	clock_sync: { label: 'Clock sync', color: '#94a3b8' },
	progress_checkpoint: { label: 'Progress saved', color: '#a3b8cc' },
	recording_media: { label: 'Recording saved', color: '#258c99' },
	ai_error: { label: 'AI error', color: '#b64871' },
	timer_extension: { label: 'Time extension', color: '#c78628' },
	pause: { label: 'Pause', color: '#b58437' },
	resume: { label: 'Resume', color: '#45866b' },
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

const chartTitles = {
	bar: 'Event counts',
	line: 'Activity over time',
	pie: 'Event mix',
	scatter: 'Event order',
	histogram: 'Elapsed time',
	timeline: 'Session timelines',
} as const
type ChartKind = keyof typeof chartTitles
const chartKinds = Object.keys(chartTitles) as ChartKind[]

export function ResultsPage({ experiments }: { experiments: Experiment[] }) {
	// `null` means the researcher has not picked a scope yet: charts then default
	// to the first experiment so the counts never mix sessions from two studies.
	const [chosenExperiment, setChosenExperiment] = useState<string | null>(null)
	const experimentCode = chosenExperiment ?? experiments[0]?.code ?? ''
	const [chart, setChart] = useState<ChartKind>('bar')
	const [chartExport, setChartExport] = useState<ChartKind | 'all' | null>(null)
	const exportCharts = useRef<HTMLDivElement>(null)
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
			sessionLabel: `${s.participantCode || "Participant"} · ${s.id.slice(0, 6)}`,
		}))
	})
	const totalEvents = allEvents.length
	const typeCount = new Set(allEvents.map((e) => e.type)).size
	const segments = [...new Set(allEvents.map((e) => e.type))].map((type) => ({
		label: TYPE_META[type]?.label ?? type,
		color: TYPE_META[type]?.color ?? '#64748b',
		count: allEvents.filter((event) => event.type === type).length,
	})).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

	const interpretation = chartInterpretation(chart, allEvents, segments)
	const renderChart = (kind: ChartKind) => {
		if (kind === 'pie') return <Doughnut segments={segments} total={totalEvents} />
		if (kind === 'line') return <ActivityLine events={allEvents} />
		if (kind === 'timeline') return <SessionTimeline events={allEvents} />
		return <ResultPlot chart={kind} events={allEvents} segments={segments} />
	}

	return (
		<section className="page dashboard results-page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">RESULTS</p>
					<h1>Visualization results</h1>
					<p className="subheading">
						Captured participant sessions, event-mix and activity
						charts, and precise single-clock timelines — exportable
						as workbooks, CSV and SVG charts.
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
						onChange={(e) => setChart(e.target.value as ChartKind)}
					>
						{Object.entries(chartTitles).map(([type, title]) => (
							<option key={type} value={type}>
								{title}
							</option>
						))}
					</select>
				</label>
				{!loading && !error && totalEvents > 0 && (
					<button type="button" className="secondary-button" onClick={() => setChartExport(chart)}>
						<Download size={15} aria-hidden="true" /> Download chart
					</button>
				)}
			</div>
			{!loading && !error && totalEvents === 0 && (
				<p>No valid timestamped events for this selection.</p>
			)}
			{!loading && !error && totalEvents > 0 && (
				<div className="chart-card results-chart-card">
					<div className="results-chart-visual">
						{renderChart(chart)}
					</div>
					<div className="chart-interpretation" aria-live="polite">
						<h2>{chartTitles[chart]}</h2>
						<p>{interpretation.meaning}</p>
						<ul>{interpretation.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
						<p className="chart-caveat">Counts include system events such as autosave checkpoints. Event frequency describes recorded activity.</p>
					</div>
					<details className="results-chart-data">
						<summary>View event counts and colour key</summary>
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
					</details>
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
			{chartExport && (
				<Modal open title="Download chart" okText="Download SVG" onCancel={() => setChartExport(null)}
					onOk={() => {
						const items = Array.from(exportCharts.current?.querySelectorAll<SVGSVGElement>('[data-export-chart] svg') ?? [])
						if (items.length) downloadCharts(items, experimentCode || 'all-studies', chartExport)
						setChartExport(null)
					}}>
					<label className="settings-field chart-export-field">
						Chart to download
						<select value={chartExport} onChange={(event) => setChartExport(event.target.value as ChartKind | 'all')}>
							{chartKinds.map((kind) => <option value={kind} key={kind}>{chartTitles[kind]}</option>)}
							<option value="all">All six charts (one SVG)</option>
						</select>
					</label>
					<div ref={exportCharts} className="chart-export-source" aria-hidden="true">
						{(chartExport === 'all' ? chartKinds : [chartExport]).map((kind) => (
							<div key={kind} data-export-chart={kind}>{renderChart(kind)}</div>
						))}
					</div>
				</Modal>
			)}
			{exportSession && (
				<ExportDialog
					session={exportSession}
					onClose={() => setExportSession(null)}
				/>
			)}
		</section>
	)
}

function copyChart(svg: SVGSVGElement) {
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
	return copy
}

function downloadCharts(charts: SVGSVGElement[], experimentCode: string, choice: ChartKind | 'all') {
	const ns = 'http://www.w3.org/2000/svg'
	const result = choice === 'all' ? document.createElementNS(ns, 'svg') : copyChart(charts[0])
	if (choice === 'all') {
		const width = 1000
		let offset = 0
		charts.forEach((source) => {
			const kind = source.closest('[data-export-chart]')?.getAttribute('data-export-chart') as ChartKind
			const chart = copyChart(source)
			const view = source.viewBox.baseVal
			const height = view.width ? Math.ceil(width * view.height / view.width) : 400
			const title = document.createElementNS(ns, 'text')
			title.setAttribute('x', '20')
			title.setAttribute('y', String(offset + 26))
			title.setAttribute('font-family', 'sans-serif')
			title.setAttribute('font-size', '20')
			title.textContent = chartTitles[kind]
			chart.setAttribute('y', String(offset + 40))
			chart.setAttribute('width', String(width))
			chart.setAttribute('height', String(height))
			result.append(title, chart)
			offset += height + 60
		})
		result.setAttribute('viewBox', `0 0 ${width} ${offset}`)
	}

	const file = new Blob([new XMLSerializer().serializeToString(result)], { type: 'image/svg+xml' })
	const url = URL.createObjectURL(file)
	const link = document.createElement('a')
	link.href = url
	link.download = `${experimentCode}-${choice}.svg`
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

	return <section className="session-recordings" aria-label="Session recordings">
        <div className="session-recordings-heading"><h4>Recordings</h4>
            {recordings && <span>{recordings.length} file{recordings.length === 1 ? '' : 's'}</span>}
        </div>
        {error && <p role="alert">{error}</p>}
        {!recordings && !error && <p role="status">Loading recordings…</p>}
        {recordings?.length === 0 && <p>No recordings saved for this session.</p>}
        <div className="recording-file-grid">
            {recordings?.map((recording, index) => {
                const kind = /-screen\.[^.]+$/i.test(recording.filename) ? 'Screen recording' : /-self\.[^.]+$/i.test(recording.filename) ? 'Camera / audio recording' : 'Recording'
                const Icon = kind === 'Screen recording' ? MonitorPlay : Video
                const format = recording.filename.split('.').pop()?.toUpperCase()
                return <article className="recording-file-card" key={recording.id}>
                    <div className="recording-file-icon"><Icon size={20} aria-hidden="true" /></div>
                    <div className="recording-file-info"><strong>{kind} {index + 1}</strong>
                        <span className="recording-filename" title={recording.filename}>{recording.filename}</span>
                        <small>{format} file</small>
                    </div>
                    <button type="button" className="secondary-button" aria-label={`Download ${recording.filename}`}
                        disabled={Boolean(busyId)} onClick={() => void download(recording)}>
                        <Download size={15} aria-hidden="true" />{busyId === recording.id ? 'Downloading…' : 'Download'}
                    </button>
                </article>
            })}
        </div>
    </section>
}

/** Filled ring sectors give each event category its own pointer target. */
function Doughnut({
	segments, total,
}: {
	segments: { label: string; color: string; count: number }[]
	total: number
}) {
	const [active, setActive] = useState<string | null>(null)
	const [hovered, setHovered] = useState(false)
	const tooltipId = useId()
	const selected = segments.find((segment) => segment.label === active) ?? segments[0]
	const share = selected ? (100 * selected.count / Math.max(1, total)).toFixed(1) : '0'
	let offset = -90
	const point = (angle: number, radius: number) => {
		const radians = angle * Math.PI / 180
		return `${160 + radius * Math.cos(radians)} ${150 + radius * Math.sin(radians)}`
	}
	const arcs: { label: string; color: string; count: number; path: string }[] = []
	for (const segment of segments) {
		const start = offset
		offset += 360 * segment.count / Math.max(1, total)
		const end = offset
		const middle = (start + end) / 2
		const path = `M ${point(start, 120)} A 120 120 0 0 1 ${point(middle, 120)} A 120 120 0 0 1 ${point(end, 120)}
			L ${point(end, 80)} A 80 80 0 0 0 ${point(middle, 80)} A 80 80 0 0 0 ${point(start, 80)} Z`
		arcs.push({ ...segment, path })
	}
	const select = (label: string) => { setActive(label); setHovered(true) }
	return <div className="chart-doughnut">
		<div className="event-mix-focus" onMouseLeave={() => setHovered(false)}>
			<div className="event-mix-heading">
				<strong>{total.toLocaleString()} timed events</strong>
				<span>{segments.length} event categories · hover to inspect</span>
			</div>
			<svg viewBox="0 0 320 300" className="doughnut-svg" role="img" aria-label="Event mix">
				<title>Share of recorded events by category</title>
				{arcs.map((segment) => <path key={segment.label} d={segment.path} fill={segment.color}
					className="event-mix-sector" stroke="#fff" strokeWidth="1"
					fillOpacity={hovered && selected?.label !== segment.label ? .35 : 1}
					onMouseEnter={() => select(segment.label)} onFocus={() => select(segment.label)}
					onBlur={() => setHovered(false)} tabIndex={0}
					aria-label={`${segment.label}, ${segment.count} events, ${(100 * segment.count / Math.max(1, total)).toFixed(1)} percent`}
					aria-describedby={hovered && selected?.label === segment.label ? tooltipId : undefined}>
					<title>{segment.label}: {segment.count} events</title>
				</path>)}
				<text x="160" y="145" textAnchor="middle" className="event-mix-share">{share}%</text>
				<text x="160" y="170" textAnchor="middle" className="event-mix-centre-label">{selected?.label}</text>
			</svg>
			<div className="event-mix-detail" id={tooltipId} role={hovered ? 'tooltip' : undefined}>
				<i style={{ background: selected?.color }} />
				<span><strong>{selected?.label}</strong><small>{selected?.count.toLocaleString() ?? 0} of {total.toLocaleString()} events · {share}%</small></span>
			</div>
		</div>
		<ul className="chart-legend" aria-label="Event categories">
			{segments.map((segment) => <li key={segment.label}>
				<button type="button" className={selected?.label === segment.label ? 'event-legend-button selected' : 'event-legend-button'}
					onMouseEnter={() => select(segment.label)} onMouseLeave={() => setHovered(false)}
					onFocus={() => select(segment.label)} onBlur={() => setHovered(false)}
					onClick={() => select(segment.label)}>
					<i style={{ background: segment.color }} />
					<span>{segment.label}</span>
					<b>{segment.count} <small>{(100 * segment.count / Math.max(1, total)).toFixed(1)}%</small></b>
				</button>
			</li>)}
		</ul>
	</div>
}

/** Cumulative counts aligned to each session's first recorded event. */
function ActivityLine({ events }: { events: TimelineEvent[] }) {
	const span = Math.max(1, ...events.map(elapsedOfEvent))
	const buckets = eventHistogram(events, span, 24)
	let running = 0
	const points = [{ elapsed: 0, count: 0 }]
	for (const bucket of buckets) {
		running += bucket.count
		points.push({ elapsed: bucket.end, count: running })
	}
	const W = 900, H = 400, L = 72, R = 870, T = 30, B = 330
	const yMax = niceCountMax(events.length)
	const x = (ms: number) => L + ms / span * (R - L)
	const y = (count: number) => B - count / yMax * (B - T)
	const coordinates = points.map((point) => `${x(point.elapsed)},${y(point.count)}`).join(' ')
	return <svg viewBox={`0 0 ${W} ${H}`} className="chart-line-svg" role="img" aria-label="Activity over time">
		<title>Cumulative event count by session elapsed time</title>
		{[0, .25, .5, .75, 1].map((fraction) => <g key={fraction}>
			<line x1={L} x2={R} y1={y(yMax * fraction)} y2={y(yMax * fraction)} className="chart-grid-line" />
			<text x={L - 12} y={y(yMax * fraction) + 5} textAnchor="end" className="plot-tick">{yMax * fraction}</text>
			<text x={x(span * fraction)} y={B + 25} textAnchor="middle" className="plot-tick">{fmtElapsed(span * fraction)}</text>
		</g>)}
		<polygon points={`${L},${B} ${coordinates} ${R},${B}`} fill="#dceafb" opacity=".65" />
		<polyline points={coordinates} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" />
		{points.slice(1).filter((point, index) => point.count !== points[index].count).map((point, index) => <circle key={index} cx={x(point.elapsed)} cy={y(point.count)} r="4" fill="#2563eb" stroke="#fff" strokeWidth="1.5">
			<title>{fmtElapsed(point.elapsed)}: {point.count} cumulative events</title>
		</circle>)}
		<text x={L} y="18" className="plot-axis-title">Cumulative events</text>
		<text x={(L + R) / 2} y={H - 16} textAnchor="middle" className="plot-axis-title">Elapsed time from each session's first event</text>
	</svg>
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
	const canTest = Boolean(status?.configured && !apiKey && configuration &&
		JSON.stringify(configuration) === JSON.stringify(aiSettingsFields(status)))
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
                        <div className="settings-field"><label htmlFor="ai-timeout">Timeout (seconds)</label>
                            <input id="ai-timeout" type="number" required min="0.1" max="600" step="any" value={configuration.timeoutSeconds} disabled={busy} onChange={(event) => setConfiguration({ ...configuration, timeoutSeconds: Number(event.target.value) })} />
                        </div>
					</div>
                    <div className="ai-response-delivery" role="group" aria-labelledby="ai-response-heading">
                        <div>
                            <h4 id="ai-response-heading">Response delivery</h4>
                            <p id="ai-stream-help" className="settings-hint">Streaming shows the reply progressively as the AI generates it, so participants can start reading sooner. Turn it off to wait for one complete reply, or when your provider does not support streaming. It does not change the model’s answer quality.</p>
                        </div>
                        <label className="switch-label"><span>Streaming responses</span>
                            <button type="button" role="switch" aria-label="Streaming responses" aria-describedby="ai-stream-help" aria-checked={configuration.stream ?? true} className={configuration.stream ? 'switch on' : 'switch'} disabled={busy} onClick={() => setConfiguration({ ...configuration, stream: !configuration.stream })}><span></span></button>
                        </label>
                    </div>
				</details>
				<div className="settings-actions">
					<button type="submit" className="primary-button" disabled={busy}>{saving ? 'Saving…' : 'Save AI settings'}</button>
					{isCommon && (status.hasCustomKey || status.hasCustomSettings) && <button type="button" className="secondary-button" disabled={busy} onClick={() => void updateKey(true)}>Use server default</button>}
					<button type="button" className="secondary-button" disabled={busy || !canTest} onClick={() => void testConnection()}>
						{testing ? 'Testing…' : 'Test saved connection'}
					</button>
				</div>
			</form>}			{canTest && status?.useCommon && !isCommon && (
				<button type="button" className="secondary-button" disabled={busy} onClick={() => void testConnection()}>Test saved connection</button>
			)}
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
	const [locationName, setLocationName] = useState('')
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

	const createLocation = async () => {
		setSaving(true)
		setFailure('')
		setMessage('')
		try {
			setSettings(await addStorageLocation(locationName.trim()))
			setLocationName('')
			setMessage('Location added. Select it above to use it for new files.')
		} catch (error) {
			setFailure(error instanceof HttpError ? error.message : 'Could not add the location.')
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
								{name === 'legacy' ? 'Local server storage' : name.replace(/^workspace-[0-9a-f-]{36}-/, '')}
							</option>
						))
					) : (
						<option value="">Loading…</option>
					)}
				</select>
			</div>
			{settings && <form className="storage-add-form" onSubmit={(event) => {
				event.preventDefault()
				void createLocation()
			}}>
				<div className="settings-field">
					<label htmlFor={fieldId + '-name'}>New storage folder</label>
					<input id={fieldId + '-name'} value={locationName} onChange={(event) => setLocationName(event.target.value)}
						required maxLength={17} pattern="[A-Za-z0-9](?:[A-Za-z0-9]|-){0,16}" placeholder="e.g. pilot-study" disabled={saving} />
				</div>
				<button type="submit" className="secondary-button" disabled={saving}>Add location</button>
				<p className="settings-hint">Creates a folder for this workspace on the server. Use letters, numbers or hyphens.</p>
			</form>}
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
					{settings.location === 'legacy' ? 'Files are stored on this server.' : 'New files use the selected storage folder.'}
				</p>
			)}
		</section>
	)
}

export function WorkspaceSettingsPage({
	experiments,
	onClearAll,
}: {
	experiments: Experiment[]
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

    const [usage, setUsage] = useState<WorkspaceUsage | null>(null)
    const [usageFailure, setUsageFailure] = useState(false)
    const [usageLoading, setUsageLoading] = useState(true)
    const [usageRefresh, setUsageRefresh] = useState(0)
    useEffect(() => {
        let active = true
        getWorkspaceUsage().then(value => { if (active) { setUsage(value); setUsageFailure(false) } })
            .catch(() => { if (active) setUsageFailure(true) })
            .finally(() => { if (active) setUsageLoading(false) })
        return () => { active = false }
    }, [usageRefresh])
	// Count local workspace sessions, events, and stored characters.
	let sessionCount = 0
	let eventCount = 0
	let storageBytes = 0
	for (let i = 0; i < localStorage.length; i += 1) {
		// Count stored characters and event logs in workspace caches.
		const key = localStorage.key(i)
		if (!key || !key.startsWith('p13-')) continue
		const value = localStorage.getItem(key) ?? ''
		storageBytes += (key.length + value.length) * 2
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
                    <a className="secondary-button" href="/researcher/account">Manage personal details and password</a>
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

                <section className="settings-card">
                    <h3>Usage statistics</h3>
                    <p className="card-sub">Saved server data for your own experiments, across browsers and devices.</p>
                    {usageLoading && <p role="status">Refreshing server counts…</p>}
                    {usageFailure && <p role="alert" className="entry-error">Server counts could not be refreshed. Previously loaded counts may be out of date.</p>}
                    {usage && <>
                        <div className="stat-mini">
                            <div><span>Experiments</span><strong>{usage.experiments}</strong></div>
                            <div><span>Saved sessions</span><strong>{usage.sessions}</strong></div>
                            <div><span>Completed sessions</span><strong>{usage.completedSessions}</strong></div>
                            <div><span>Saved events</span><strong>{usage.events}</strong></div>
                            <div><span>Recordings</span><strong>{usage.recordings}</strong></div>
                            <div><span>In progress</span><strong>{usage.sessions - usage.completedSessions}</strong></div>
                        </div>
                        <p className="settings-hint">Updated {new Date(usage.updatedAt).toLocaleTimeString()}. Counts exclude private system records.</p>
                    </>}
                    <button type="button" className="secondary-button" disabled={usageLoading} onClick={() => { setUsageLoading(true); setUsageRefresh(value => value + 1) }}>Refresh statistics</button>
                    <p className="settings-hint">This device separately holds {sessionCount} cached sessions, {eventCount} cached events and approximately {storageKb} KB of browser cache. Unsynchronised browser work is not included above.</p>
                </section>

                <section className="settings-card study-preparation-card">
                    <h3>Study preparation</h3>
                    <p className="card-sub">A summary of your study configurations. Preview and test each study before inviting participants.</p>
                    <div className="stat-mini">
                        <div><span>Published studies</span><strong>{experiments.filter(item => item.status === 'Live').length}</strong></div>
                        <div><span>Draft studies</span><strong>{experiments.filter(item => item.status === 'Draft').length}</strong></div>
                        <div><span>AI-enabled studies</span><strong>{experiments.filter(item => item.stages.some(stage => stage.features.ai)).length}</strong></div>
                        <div><span>Recording-enabled studies</span><strong>{experiments.filter(item => item.stages.some(stage => stage.recordingRequired || stage.features.screenRecording || stage.features.selfie)).length}</strong></div>
                    </div>
                    <p className="settings-hint">Enabled features are configuration counts, not a successful connection or recording test.</p>
                    <div className="settings-actions">
                        <a className="secondary-button" href="/researcher/dashboard">Review experiments</a>
                        {experiments.length > 0 && <a className="secondary-button" href="/researcher/preview">Preview a study</a>}
                        <a className="secondary-button" href="/researcher/results">View results</a>
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
	if (ms > 0 && ms < 1000) return `${Math.round(ms)}ms`
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

function niceCountMax(count: number) {
	const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, count))) - 1))
	return Math.max(4, Math.ceil(count / (4 * step)) * 4 * step)
}

function eventHistogram(events: TimelineEvent[], span: number, count = 10) {
	const bins = Array.from({ length: count }, (_, index) => ({
		start: index * span / count, end: (index + 1) * span / count, count: 0,
	}))
	for (const event of events) {
		const index = Math.min(count - 1, Math.floor(elapsedOfEvent(event) / span * count))
		bins[index].count += 1
	}
	return bins
}

function chartInterpretation(
	chart: ChartKind, events: TimelineEvent[],
	segments: { label: string; count: number }[],
) {
	const total = events.length
	const span = Math.max(0, ...events.map(elapsedOfEvent))
	const percent = (count: number) => `${total ? (100 * count / total).toFixed(1) : '0'}%`
	const top = segments[0]
	const groups = new Map<string, TimelineEvent[]>()
	for (const event of events) {
		const key = event.sessionId ?? 'session'
		const group = groups.get(key) ?? []
		group.push(event)
		groups.set(key, group)
	}
	const duration = [...groups.values()].map((items) => Math.max(...items.map(elapsedOfEvent)))
	const common = `${total} timed ${total === 1 ? 'event' : 'events'} across ${groups.size} ${groups.size === 1 ? 'session' : 'sessions'} with recorded activity.`
	if (!total) return { meaning: 'Select a study with recorded events to explore its activity.', facts: [] }
	if (chart === 'bar') return {
		meaning: 'Each bar shows how often an event type was recorded. Categories are sorted from most to least frequent.',
		facts: [common, `${top.label} is the largest category with ${top.count} ${top.count === 1 ? 'event' : 'events'} (${percent(top.count)}).`],
	}
	if (chart === 'pie') return {
		meaning: 'Each segment shows an event type’s share of all timed events. Segment colours match the event-count table.',
		facts: [common, `The three largest categories account for ${percent(segments.slice(0, 3).reduce((sum, item) => sum + item.count, 0))} of events.`],
	}
	const earlyCount = events.filter((event) => elapsedOfEvent(event) <= span / 2).length
	if (chart === 'line') return {
		meaning: 'This line accumulates recorded events as elapsed time increases. Sessions share a zero point at their first event. A steep section indicates more events in that interval.',
		facts: [common, `${earlyCount} ${earlyCount === 1 ? 'event occurred' : 'events occurred'} within the first half of the longest recorded event span (${fmtElapsed(span / 2)}).`],
	}
	if (chart === 'histogram') {
		const bins = eventHistogram(events, Math.max(1, span))
		const peak = bins.reduce((best, bin) => bin.count > best.count ? bin : best, bins[0])
		return {
			meaning: 'Ten equal time intervals group events by elapsed time from each session’s first event. Bar height is the number of events in an interval, pooled across sessions.',
			facts: [common, `The earliest peak interval is ${fmtElapsed(peak.start)}–${fmtElapsed(peak.end)} with ${peak.count} events (${percent(peak.count)}).`],
		}
	}
	if (chart === 'scatter') {
		let gap = 0
		for (const items of groups.values()) {
			for (let index = 1; index < items.length; index++)
				gap = Math.max(gap, elapsedOfEvent(items[index]) - elapsedOfEvent(items[index - 1]))
		}
		return {
			meaning: 'Each dot represents an event. The horizontal axis is session elapsed time, the vertical axis is event order within that session, and colour identifies the event type.',
			facts: [common, `The longest gap between consecutive recorded events in a session is ${fmtElapsed(gap)}.`],
		}
	}
	return {
		meaning: 'Each row is a participant session. Dots show event times on a shared elapsed-time axis, making activity clusters and gaps easier to compare.',
		facts: [common, `Recorded event spans range from ${fmtElapsed(Math.min(...duration))} to ${fmtElapsed(Math.max(...duration))}, including gaps and pauses.`],
	}
}

function ResultPlot({
	chart, events, segments,
}: {
	chart: string
	events: TimelineEvent[]
	segments: { label: string; count: number; color: string }[]
}) {
	const W = 900
	if (chart === 'bar') {
		const L = 170, R = 790, T = 34, row = 30
		const H = T + segments.length * row + 55
		const peak = niceCountMax(Math.max(...segments.map((item) => item.count), 1))
		const x = (value: number) => L + value / peak * (R - L)
		return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="bar chart" className="result-plot">
			<title>Event counts by category</title>
			{[0, .25, .5, .75, 1].map((fraction) => <g key={fraction}>
				<line x1={x(peak * fraction)} x2={x(peak * fraction)} y1={T - 10} y2={H - 42} className="chart-grid-line" />
				<text x={x(peak * fraction)} y={H - 20} textAnchor="middle" className="plot-tick">{peak * fraction}</text>
			</g>)}
			{segments.map((item, index) => <g key={item.label}>
				<text x={L - 14} y={T + index * row + 18} textAnchor="end" className="plot-tick">{item.label}</text>
				<rect x={L} y={T + index * row} width={Math.max(1, x(item.count) - L)} height="22" rx="4" fill={item.color}>
					<title>{item.label}: {item.count}</title>
				</rect>
				<text x={x(item.count) + 8} y={T + index * row + 18} className="plot-value">{item.count} · {(100 * item.count / Math.max(1, events.length)).toFixed(1)}%</text>
			</g>)}
		</svg>
	}
	const H = 400, L = 72, R = 870, T = 30, B = 330
	const span = Math.max(1, ...events.map(elapsedOfEvent))
	const bins = eventHistogram(events, span)
	const yMax = niceCountMax(chart === 'scatter'
		? Math.max(...events.map((event) => event.order ?? 1))
		: Math.max(...bins.map((bin) => bin.count)))
	const x = (ms: number) => L + ms / span * (R - L)
	const y = (count: number) => B - count / yMax * (B - T)
	return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chart} chart`} className="result-plot">
		<title>{chart === 'scatter' ? 'Event order by elapsed time' : 'Event frequency by elapsed time'}</title>
		{[0, .25, .5, .75, 1].map((fraction) => <g key={fraction}>
			<line x1={L} x2={R} y1={y(yMax * fraction)} y2={y(yMax * fraction)} className="chart-grid-line" />
			<text x={L - 12} y={y(yMax * fraction) + 5} textAnchor="end" className="plot-tick">{yMax * fraction}</text>
			<text x={x(span * fraction)} y={B + 25} textAnchor="middle" className="plot-tick">{fmtElapsed(span * fraction)}</text>
		</g>)}
		{chart === 'scatter' ? events.map((event, index) => (
			<circle key={index} cx={x(elapsedOfEvent(event))} cy={y(event.order ?? 1)} r="4.5"
				fill={TYPE_META[event.type]?.color ?? '#64748b'} fillOpacity=".7" stroke="#fff" strokeWidth=".7">
				<title>{event.sessionLabel} · {event.type} · {fmtElapsed(elapsedOfEvent(event))} · event {event.order}</title>
			</circle>
		)) : bins.map((bin, index) => <g key={index}>
			<rect x={x(bin.start) + 3} y={y(bin.count)} width={(R - L) / bins.length - 6}
				height={B - y(bin.count)} rx="5" fill={bin.count === Math.max(...bins.map((item) => item.count)) ? '#2563eb' : '#93b4e5'}>
				<title>{fmtElapsed(bin.start)}–{fmtElapsed(bin.end)}: {bin.count} events ({(100 * bin.count / Math.max(1, events.length)).toFixed(1)}%)</title>
			</rect>
			{bin.count > 0 && <text x={x((bin.start + bin.end) / 2)} y={y(bin.count) - 8} textAnchor="middle" className="plot-value">{bin.count}</text>}
		</g>)}
		<text x={L} y="18" className="plot-axis-title">{chart === 'scatter' ? 'Event order within session' : 'Events per interval'}</text>
		<text x={(L + R) / 2} y={H - 16} textAnchor="middle" className="plot-axis-title">Elapsed time from each session's first event</text>
	</svg>
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

	const W = 930
	const LEFT = 130
	const RIGHT = 745
	const TOP = 55
	const rowH = 32
	const BOTTOM = TOP + sessions.length * rowH
	const H = BOTTOM + 55
	const plotW = RIGHT - LEFT
	const fractions = [0, 0.25, 0.5, 0.75, 1]

	return (
		<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="timeline chart" className="result-plot timeline-plot">
			<title>Participant session timelines with event counts and recorded spans</title>
			<text x={W / 2} y="18" textAnchor="middle" className="plot-axis-title">Session activity and recorded spans</text>
			<text x="10" y="42" className="plot-tick">Participant</text>
			<text x="806" y="42" textAnchor="end" className="plot-tick">Events</text>
			<text x="916" y="42" textAnchor="end" className="plot-tick">Span</text>
			{fractions.map((fraction) => <line key={fraction}
				x1={LEFT + fraction * plotW} x2={LEFT + fraction * plotW} y1={TOP} y2={BOTTOM}
				className="chart-grid-line" />)}
			{sessions.map((session, row) => {
				const cy = TOP + row * rowH + rowH / 2
				const duration = Math.max(0, ...session.events.map(elapsedOfEvent))
				const participant = session.label.split(' · ')[0]
				return <g key={session.id}>
					<text x="10" y={cy + 4} className="plot-tick">
						{participant.length > 15 ? participant.slice(0, 14) + '…' : participant}
						<title>{session.label}</title>
					</text>
					<line x1={LEFT} x2={RIGHT} y1={cy} y2={cy} stroke="#e8eef5" />
					<line x1={LEFT} x2={LEFT + duration / maxElapsed * plotW} y1={cy} y2={cy} stroke="#cbd9eb" strokeWidth="3" />
					{session.events.map((event, index) => <circle key={index}
						cx={LEFT + elapsedOfEvent(event) / maxElapsed * plotW} cy={cy} r="2.8"
						fill={TYPE_META[event.type]?.color ?? '#64748b'} fillOpacity=".8">
						<title>{session.label} · {TYPE_META[event.type]?.label ?? event.type} · {fmtElapsed(elapsedOfEvent(event))} · event {event.order ?? event.seq}</title>
					</circle>)}
					<text x="806" y={cy + 4} textAnchor="end" className="plot-value">{session.events.length}</text>
					<text x="916" y={cy + 4} textAnchor="end" className="plot-value">{fmtElapsed(duration)}</text>
				</g>
			})}
			<line x1={LEFT} x2={RIGHT} y1={BOTTOM} y2={BOTTOM} stroke="#cbd5e1" />
			{fractions.map((fraction) => <text key={fraction}
				x={LEFT + fraction * plotW} y={BOTTOM + 20} textAnchor="middle" className="plot-tick">
				{fmtElapsed(fraction * maxElapsed)}
			</text>)}
			<text x={(LEFT + RIGHT) / 2} y={H - 8} textAnchor="middle" className="plot-axis-title">
				Time from each session's first event
			</text>
		</svg>
	)
}
