// Visualize local participant logs with SVG charts and CSV export.
import { useState } from 'react'
import type { Experiment } from '../types'
import type { ParticipantEvent, ParticipantEventType } from '../participant/EventQueue'
import { downloadCsv, eventsToCsv } from '../utils/sessionCsv'

// Event chart labels and colors.
const TYPE_META: Record<ParticipantEventType, { label: string; color: string }> = {
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

// Session ID, events, and experiment label for results.
interface SessionData {
	id: string
	events: ParticipantEvent[]
	experimentName: string
}

// Read local logs, resolve experiment names, and sort by descending session ID.
function scanSessions(experiments: Experiment[]): SessionData[] {
	const list: SessionData[] = []
	for (let i = 0; i < localStorage.length; i += 1) {
		// Read valid sessions from local event logs.
		const key = localStorage.key(i)
		if (!key || !key.startsWith('p13-events:')) continue
		const raw = localStorage.getItem(key)
		if (!raw) continue
		try {
			// Parse cached data; fall back if invalid.
			const parsed = JSON.parse(raw) as { events?: ParticipantEvent[] }
			const events = Array.isArray(parsed.events) ? parsed.events : []
			const id = key.slice('p13-events:'.length)
			const code = id.split('-')[0]
			const experimentName = experiments.find((e) => e.code === code)?.name ?? code
			list.push({ id, events, experimentName })
		} catch {
			// Skip invalid event logs.
		}
	}
	return list.sort((a, b) => b.id.localeCompare(a.id))
}

// Show local event statistics, charts, timelines, and CSV export.
export function ResultsPage({ experiments }: { experiments: Experiment[] }) {
	// Track the expanded session; null collapses all timelines.
	const [openId, setOpenId] = useState<string | null>(null)
	// Read current local event logs on each render.
	const sessions = scanSessions(experiments)

	// Combine session events and count events and distinct types.
	const allEvents = sessions.flatMap((s) => s.events)
	const totalEvents = allEvents.length
	const typeCount = new Set(allEvents.map((e) => e.type)).size

	// Build doughnut segments from present event types, sorted by count.
	const segments = (Object.keys(TYPE_META) as ParticipantEventType[])
		.map((type) => ({
			label: TYPE_META[type].label,
			color: TYPE_META[type].color,
			count: allEvents.filter((event) => event.type === type).length,
		}))
		.filter((segment) => segment.count > 0)
		.sort((a, b) => b.count - a.count)

	// Render the current view.
	return (
		<section className="page dashboard">
			{/* Page heading and main actions. */}
			<div className="page-heading">
				<div>
					<p className="eyebrow">RESULTS</p>
					<h1>Visualization results</h1>
					<p className="subheading">
						Captured participant sessions, event-mix and activity charts, and precise single-clock
						timelines — exportable as CSV.
					</p>
				</div>
			</div>

			{/* Summary statistics. */}
			<div className="stats-row">
				<div>
					<span className="stat-label">Sessions</span>
					<strong>{sessions.length.toString().padStart(2, '0')}</strong>
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
						{sessions.length ? Math.round(totalEvents / sessions.length).toString() : '0'}
					</strong>
				</div>
			</div>

			{/* Event distribution and cumulative activity charts. */}
			{totalEvents > 0 && (
				<div className="charts-grid">
					<div className="chart-card">
						<h3>Event mix</h3>
						<p className="card-sub">Distribution of captured event types across all sessions.</p>
						<Doughnut segments={segments} total={totalEvents} />
					</div>
					<div className="chart-card">
						<h3>Activity over time</h3>
						<p className="card-sub">Cumulative captured events along the study timeline.</p>
						<ActivityLine events={allEvents} />
					</div>
				</div>
			)}

			{/* Session summaries, exports, and expandable timelines. */}
			{sessions.length === 0 ? (
				<p className="subheading" style={{ marginTop: 22 }}>
					No participant sessions captured yet. Run a participant preview to generate event data.
				</p>
			) : (
				<div className="results-list">
					{sessions.map((session) => {
						// Calculate duration from the first and last events.
						const first = session.events[0]
						const last = session.events[session.events.length - 1]
						const durationMs = first && last ? last.epochMs - first.epochMs : 0
						const open = openId === session.id
						return (
							<div className="session-card" key={session.id}>
								{/* Session ID, event count, duration, and actions. */}
								<div className="session-head">
									<div className="session-title">
										<strong>{session.experimentName}</strong>
										<small>{session.id}</small>
									</div>
									<div className="session-chips">
										<span className="session-chip">{session.events.length} events</span>
										<span className="session-chip">{formatDuration(durationMs)}</span>
										<button
											className="secondary-button"
											onClick={() => setOpenId(open ? null : session.id)}
										>
											{open ? 'Hide timeline' : 'View timeline'}
										</button>
										<button
											className="secondary-button"
											onClick={() => downloadCsv(session.id, eventsToCsv(session.events))}
										>
											Export CSV
										</button>
									</div>
								</div>
								{open && (
									<div className="session-body">
										{/* Event sequence, type, timestamp, and details. */}
										<div className="timeline">
											{session.events.map((event) => (
												<div className="tl-row" key={event.seq}>
													<span className="tl-seq">#{event.seq}</span>
													<span
														className="tl-chip"
														style={{ background: TYPE_META[event.type]?.color ?? '#8493a5' }}
													>
														{TYPE_META[event.type]?.label ?? event.type}
													</span>
													<span className="tl-time">{formatClock(event.epochMs)}</span>
													<span className="tl-detail">
														<code>{detailText(event.detail)}</code>
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

			{/* Data source and export format notes. */}
			<p className="results-note">
				Data is read from this browser&apos;s local event logs (<code>p13-events:*</code>). The
				backend session API is implemented but not yet wired into the participant runtime, so
				results reflect local captures only. Exports are CSV (spreadsheet-ready); detail cells keep
				the raw JSON payload.
			</p>
		</section>
	)
}

// Draw an SVG doughnut chart with dashed arcs and a legend.
function Doughnut({
	segments,
	total,
}: {
	segments: { label: string; color: string; count: number }[]
	total: number
}) {
	// Calculate arc lengths and offsets without changing segment data.
	const pcts = segments.map((segment) => (total > 0 ? (segment.count / total) * 100 : 0))
	const offsets = pcts.map(
		(_, index) => 25 - pcts.slice(0, index).reduce((sum, pct) => sum + pct, 0),
	)
	// Render the current view.
	return (
		<div className="chart-doughnut">
			<svg viewBox="0 0 42 42" className="doughnut-svg" role="img" aria-label="Event mix">
				<circle cx="21" cy="21" r="15.9155" fill="none" stroke="#eef2f7" strokeWidth="7" />
				{segments.map((segment, index) => {
					// Skip zero-count types and draw colored, offset arcs.
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
				<text x="21" y="20" textAnchor="middle" className="doughnut-total">
					{total}
				</text>
				<text x="21" y="26" textAnchor="middle" className="doughnut-sub">
					events
				</text>
			</svg>
			{/* Event type colors, names, and counts. */}
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

// Bin events into 24 intervals and draw cumulative SVG line and area charts.
function ActivityLine({ events }: { events: ParticipantEvent[] }) {
	// Copy and sort events by time to find the chart range.
	const sorted = [...events].sort((a, b) => a.epochMs - b.epochMs)
	const min = sorted[0].epochMs
	const max = sorted[sorted.length - 1].epochMs
	// Split the time range into 24 bins and count events.
	const BUCKETS = 24
	const span = Math.max(1, max - min)
	const buckets = new Array<number>(BUCKETS).fill(0)
	sorted.forEach((event) => {
		// Count the event in its time bin.
		const index = Math.min(BUCKETS - 1, Math.floor(((event.epochMs - min) / span) * BUCKETS))
		buckets[index] += 1
	})
	// Compute cumulative counts and the vertical scale.
	const cumulative = buckets.map((_, index) =>
		buckets.slice(0, index + 1).reduce((sum, count) => sum + count, 0),
	)
	const peak = Math.max(...cumulative, 1)

	// Set chart dimensions and margins for axis labels.
	const W = 560
	const H = 180
	const PAD = 30
	// Map a time bin to its horizontal coordinate.
	const pointX = (i: number) => PAD + (i / (BUCKETS - 1)) * (W - PAD * 2)
	// Scale vertical coordinates by the peak cumulative count.
	const pointY = (v: number) => H - PAD - (v / peak) * (H - PAD * 2)
	// Convert counts to line points and close the area path.
	const points = cumulative.map((v, i) => `${pointX(i)},${pointY(v)}`).join(' ')
	const area = `${PAD},${H - PAD} ${points} ${pointX(BUCKETS - 1)},${H - PAD}`
	// Format timestamps as month/day and hour/minute axis labels.
	const formatTick = (ms: number) => {
		const d = new Date(ms)
		// Pad a number to two digits.
		const pad = (n: number) => String(n).padStart(2, '0')
		return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
	}

	// Render the current view.
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
			<text x={PAD - 6} y={pointY(peak) + 3} textAnchor="end" className="line-axis">
				{peak}
			</text>
		</svg>
	)
}

// Format local timestamps with millisecond precision.
function formatClock(epochMs: number): string {
	const d = new Date(epochMs)
	const hh = String(d.getHours()).padStart(2, '0')
	const mm = String(d.getMinutes()).padStart(2, '0')
	const ss = String(d.getSeconds()).padStart(2, '0')
	const ms = String(epochMs % 1000).padStart(3, '0')
	return `${hh}:${mm}:${ss}.${ms}`
}

// Format duration as seconds or minutes; use a placeholder if nonpositive.
function formatDuration(ms: number): string {
	if (!ms || ms < 0) return '—'
	const seconds = Math.round(ms / 100) / 10
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	const remainder = Math.round(seconds - minutes * 60)
	return `${minutes}m ${remainder}s`
}

// Format event details as key-value text and truncate long values.
function detailText(detail?: Record<string, unknown>): string {
	if (!detail) return '—'
	const text = Object.entries(detail)
		.map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
		.join('  ·  ')
	return text.length > 96 ? `${text.slice(0, 96)}…` : text
}
