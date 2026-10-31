import { useState, useEffect } from 'react'
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
import type { ParticipantEvent, ParticipantEventType } from '../participant/EventQueue'
import { listSessions, downloadSessionCsv } from '../api/participant'
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
	// Filter by experiment name or code, ignoring case.
	const filtered = experiments.filter(
		(experiment) =>
			experiment.name.toLowerCase().includes(query.toLowerCase()) ||
			experiment.code.toLowerCase().includes(query.toLowerCase()),
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
					<span className="stat-label">Total stages</span>
					<strong>
						{experiments
							.reduce((total, experiment) => total + experiment.stages.length, 0)
							.toString()
							.padStart(2, '0')}
					</strong>
				</div>
				<div className="sync-stat">
					<ShieldCheck size={17} />
					<span>
						Results export
						<br />
						<strong>CSV format</strong>
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

interface SessionData {
  id: string
  events: ParticipantEvent[]
  experimentName: string
}

export function ResultsPage({ experiments }: { experiments: Experiment[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Read captured sessions from the backend. The participant runtime submits
  // here on finish/abort, so the server is the authoritative source.
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const backend = await listSessions()
        if (!active) return
        const mapped: SessionData[] = backend
          .map((s) => ({
            id: s.id,
            events: s.events,
            experimentName:
              experiments.find((e) => e.code === s.experimentCode)?.name ?? s.experimentCode,
          }))
          .sort((a, b) => b.id.localeCompare(a.id))
        setSessions(mapped)
      } catch {
        if (active) setError('Could not load captured sessions from the server.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [experiments])

  const allEvents = sessions.flatMap((s) => s.events)
  const totalEvents = allEvents.length
  const typeCount = new Set(allEvents.map((e) => e.type)).size

  // Doughnut segments: event-type mix, sorted by count (only types present).
  const segments = (Object.keys(TYPE_META) as ParticipantEventType[])
    .map((type) => ({
      label: TYPE_META[type].label,
      color: TYPE_META[type].color,
      count: allEvents.filter((event) => event.type === type).length,
    }))
    .filter((segment) => segment.count > 0)
    .sort((a, b) => b.count - a.count)

  return (
    <section className="page dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">RESULTS</p>
          <h1>Visualization results</h1>
          <p className="subheading">
            Captured participant sessions, event-mix and activity charts, and precise
            single-clock timelines — exportable as CSV.
          </p>
        </div>
      </div>

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

      {loading && (
        <p className="subheading" style={{ marginTop: 22 }}>Loading captured sessions…</p>
      )}

      {error && !loading && (
        <p className="entry-error" style={{ marginTop: 22 }}>{error}</p>
      )}

      {!loading && sessions.length === 0 ? (
        <p className="subheading" style={{ marginTop: 22 }}>
          No participant sessions captured yet. Run a participant session to the end (or abort it) to
          generate event data.
        </p>
      ) : (
        <div className="results-list">
          {sessions.map((session) => {
            const first = session.events[0]
            const last = session.events[session.events.length - 1]
            const durationMs = first && last ? last.epochMs - first.epochMs : 0
            const open = openId === session.id
            return (
              <div className="session-card" key={session.id}>
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
                      onClick={() => {
                        void downloadSessionCsv(session.id).catch(() =>
                          setError('Could not download the session CSV. Please retry.'),
                        )
                      }}
                    >
                      Export CSV
                    </button>
                  </div>
                </div>
                {open && (
                  <div className="session-body">
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

      <p className="results-note">
        Data is read from the study server&apos;s participant-session store. Every participant
        session submits its precise event timeline here on finish or abort, so results reflect the
        authoritative capture. Exports are CSV (spreadsheet-ready); detail cells keep the raw JSON
        payload.
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
  const pcts = segments.map((segment) => (total > 0 ? (segment.count / total) * 100 : 0))
  const offsets = pcts.map((_, index) => 25 - pcts.slice(0, index).reduce((sum, pct) => sum + pct, 0))
  return (
    <div className="chart-doughnut">
      <svg viewBox="0 0 42 42" className="doughnut-svg" role="img" aria-label="Event mix">
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#eef2f7" strokeWidth="7" />
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
        <text x="21" y="20" textAnchor="middle" className="doughnut-total">
          {total}
        </text>
        <text x="21" y="26" textAnchor="middle" className="doughnut-sub">
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
    const index = Math.min(BUCKETS - 1, Math.floor(((event.epochMs - min) / span) * BUCKETS))
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
  const points = cumulative.map((v, i) => `${pointX(i)},${pointY(v)}`).join(' ')
  const area = `${PAD},${H - PAD} ${points} ${pointX(BUCKETS - 1)},${H - PAD}`
  const formatTick = (ms: number) => {
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-line-svg" role="img" aria-label="Activity over time">
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

	// Load data and ignore results after unmount.
	useEffect(() => {
		let active = true
		void (async () => {
			try {
				// Fetch researchers and platform settings in parallel.
				const [people, current] = await Promise.all([getWorkspaceMembers(), getWorkspaceSettings()])
				if (active) {
					// Apply fetched data while the component is mounted.
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
				// Parse cached data; fall back if invalid.
				const parsed = JSON.parse(value) as { events?: unknown[] }
				if (Array.isArray(parsed.events)) eventCount += parsed.events.length
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
					<p className="subheading">
						Profile, members, notifications and workspace statistics. Platform-level configuration
						lives in Administration.
					</p>
				</div>
				<button className="secondary-button" onClick={onClose}>
					Back
				</button>
			</div>

			{/* Profile, members, preferences, policies, usage, and cache settings. */}
			<div className="settings-grid">
				{/* Researcher profile and display name. */}
				<section className="settings-card">
					<h3>Profile</h3>
					<p className="card-sub">How your name appears across the workspace.</p>
					<div className="settings-field">
						<label>Researcher name</label>
						<input
							value={settings.researcherName}
							onChange={(event) => onChange({ researcherName: event.target.value })}
						/>
					</div>
					{me && (
						<div className="member-row" style={{ marginTop: 14 }}>
							<span className="member-avatar">{me.name.charAt(0).toUpperCase()}</span>
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
						Researchers with access to this workspace. Roles are managed in Administration.
					</p>
					{members.length === 0 ? (
						<p className="settings-hint">No members loaded yet.</p>
					) : (
						members.map((person) => (
							<div className="member-row" key={person.id}>
								<span className="member-avatar">{person.name.charAt(0).toUpperCase()}</span>
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
						Workspace-level notification preferences, stored on this device.
					</p>
					<div className="pref-row">
						<div className="pref-info">
							<strong>Study events</strong>
							<small>Alert me when a participant session starts or is aborted.</small>
						</div>
						<button
							className={prefs.notifyStudyEvents ? 'switch on' : 'switch'}
							onClick={() => togglePref('notifyStudyEvents')}
							aria-label="Toggle study event notifications"
						>
							<span></span>
						</button>
					</div>
					<div className="pref-row">
						<div className="pref-info">
							<strong>Weekly summary</strong>
							<small>Send me a weekly digest of captured sessions and events.</small>
						</div>
						<button
							className={prefs.notifyWeeklySummary ? 'switch on' : 'switch'}
							onClick={() => togglePref('notifyWeeklySummary')}
							aria-label="Toggle weekly summary notifications"
						>
							<span></span>
						</button>
					</div>
					<div className="pref-row">
						<div className="pref-info">
							<strong>Export notifications</strong>
							<small>Notify me when an export of event timelines completes.</small>
						</div>
						<button
							className={prefs.notifyExports ? 'switch on' : 'switch'}
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
						Platform policy mirror. These are managed by administrators in Administration.
					</p>
					{platform ? (
						<>
							<div className="pref-row">
								<div className="pref-info">
									<strong>Self-registration</strong>
								</div>
								<span className="pill">
									{platform.allowSelfRegistration ? 'Allowed' : 'Restricted'}
								</span>
							</div>
							<div className="pref-row">
								<div className="pref-info">
									<strong>Consent signature</strong>
								</div>
								<span className="pill">
									{platform.requireConsentSignature ? 'Required' : 'Optional'}
								</span>
							</div>
							<div className="pref-row">
								<div className="pref-info">
									<strong>Data retention</strong>
								</div>
								<span className="pill">{platform.dataRetentionDays} days</span>
							</div>
							<div className="pref-row">
								<div className="pref-info">
									<strong>Max session length</strong>
								</div>
								<span className="pill">{platform.maxSessionMinutes} min</span>
							</div>
						</>
					) : (
						<p className="settings-hint">Platform settings could not be loaded.</p>
					)}
				</section>

				{/* Local session, event, and stored character counts. */}
				<section className="settings-card">
					<h3>Usage statistics</h3>
					<p className="card-sub">Live counts from this browser&apos;s workspace storage.</p>
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
					<p className="card-sub">Irreversible local-data operations.</p>
					<p className="settings-hint">
						Clearing local data removes cached preferences and event logs from this device. Experiments and
						sessions saved on the study server remain available.
					</p>
					<button
						className="danger-button"
						style={{ marginTop: 12 }}
						onClick={() => {
							// Clear local caches after user confirmation.
							if (window.confirm('Clear all local data? This cannot be undone.')) onClearAll()
						}}
					>
						Clear all local data
					</button>
				</section>
			</div>
		</div>
	)
}
