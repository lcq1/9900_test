/**
 * ResultsPage.tsx — Visualization results (Wave 5).
 *
 * Captured participant sessions with:
 *  - a doughnut chart of the event-type mix across all sessions,
 *  - a cumulative-activity line chart over the study timeline,
 *  - per-session precise, single-clock event timelines,
 *  - CSV export (replaces the old JSON export).
 *
 * Sessions are read from the FastAPI backend (`/participant/sessions`) — the
 * participant runtime now submits its captured timeline there on finish/abort,
 * so this page reflects the authoritative server store rather than the local
 * browser logs. Charts are dependency-free hand-rolled SVG (no chart library).
 */
import { useEffect, useState } from 'react'
import type { Experiment } from '../types'
import type { ParticipantEvent, ParticipantEventType } from '../participant/EventQueue'
import { listSessions } from '../api/participant'
import { downloadCsv, eventsToCsv } from '../utils/sessionCsv'

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
                      onClick={() => downloadCsv(session.id, eventsToCsv(session.events))}
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
