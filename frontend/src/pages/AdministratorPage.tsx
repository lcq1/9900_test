import { useEffect, useState } from 'react'
import type { Experiment } from '../types'
import { getCurrentResearcher } from '../auth/sessionStore'
import { downloadCsv, eventsToCsv } from '../utils/sessionCsv'
import {
  getSettings,
  listResearchersForAdmin,
  updateSettings,
  type PlatformSettings,
} from '../api/administrator'
import { promoteToAdministrator, type Researcher } from '../api/auth'
import { getSession, listSessions } from '../api/participant'

/**
 * AdministratorPage — Plan.md §8.2 administrator surface.
 *
 * Three read/write surfaces:
 *  - researcher accounts + role promotion (backend)
 *  - platform settings (backend)
 *  - captured participant sessions / event timelines (backend)
 *
 * Data flow note: the participant-session list is read from the FastAPI backend
 * (`/participant/sessions`) — the participant runtime now submits there on
 * finish/abort, so it reflects the authoritative server store rather than the
 * local browser logs.
 */
export function AdministratorPage({ experiments }: { experiments: Experiment[] }) {
  const [researchers, setResearchers] = useState<Researcher[]>([])
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const me = getCurrentResearcher()

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [people, current] = await Promise.all([
          listResearchersForAdmin(),
          getSettings(),
        ])
        if (!active) return
        setResearchers(people)
        setSettings(current)
      } catch {
        if (active) setError('Could not load administrator data.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  /** Persist a settings patch and reflect the stored result in state. */
  const patchSettings = async (patch: Partial<PlatformSettings>) => {
    if (!settings) return
    try {
      const next = await updateSettings(patch)
      setSettings(next)
      setError('')
    } catch {
      setError('Could not save that setting.')
    }
  }

  const promote = async (id: string) => {
    try {
      const updated = await promoteToAdministrator(id)
      setResearchers((current) =>
        current.map((person) => (person.id === updated.id ? updated : person)),
      )
      setError('')
    } catch {
      setError('Could not update that researcher.')
    }
  }

  // Participant sessions are submitted to the backend on finish/abort; read them
  // from the server store (non-critical — ignore failures so the admin surface
  // still loads even if the session list is momentarily unavailable).
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const backend = await listSessions()
        if (!active) return
        setSessions(
          backend
            .map((s) => ({
              id: s.id,
              count: s.events.length,
              timestamp: s.events[s.events.length - 1]?.timestamp,
            }))
            .sort((a, b) => b.id.localeCompare(a.id)),
        )
      } catch {
        // Session listing is non-critical for the admin surface.
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  return (
    <section className="page dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Platform administration</h1>
          <p className="subheading">
            Researcher accounts, platform settings and captured participant sessions.
          </p>
        </div>
        {me && (
          <span className="pill">Signed in as {me.name} ({me.role})</span>
        )}
      </div>

      {loading && <p className="subheading">Loading administrator data…</p>}
      {error && <p className="entry-error">{error}</p>}

      <div className="stats-row">
        <div>
          <span className="stat-label">Researchers</span>
          <strong>{researchers.length.toString().padStart(2, '0')}</strong>
        </div>
        <div>
          <span className="stat-label">Experiments</span>
          <strong>{experiments.length.toString().padStart(2, '0')}</strong>
        </div>
        <div>
          <span className="stat-label">Captured sessions</span>
          <strong>{sessions.length.toString().padStart(2, '0')}</strong>
        </div>
        <div>
          <span className="stat-label">Captured events</span>
          <strong>{sessions.reduce((total, s) => total + s.count, 0)}</strong>
        </div>
      </div>

      <h2 className="admin-heading">Researcher accounts</h2>
      <div className="experiment-table">
        <div className="table-head">
          <span>Researcher</span>
          <span>Role</span>
          <span>Created</span>
          <span></span>
        </div>
        {researchers.length === 0 && !loading && (
          <div className="experiment-row"><span className="muted">No researchers registered yet.</span></div>
        )}
        {researchers.map((person) => (
          <div className="experiment-row" key={person.id}>
            <div className="experiment-name">
              <strong>{person.name}</strong>
              <small>{person.email}</small>
            </div>
            <span className="pill">{person.role}</span>
            <span className="muted">{new Date(person.createdAt).toLocaleDateString()}</span>
            <div className="row-actions">
              {person.role !== 'administrator' && (
                <button className="secondary-button" onClick={() => void promote(person.id)}>
                  Promote
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 className="admin-heading">Platform settings</h2>
      {settings && (
        <div className="experiment-table admin-settings">
          <SettingsToggle
            label="Allow self-registration"
            hint="Researchers can create their own accounts."
            checked={settings.allowSelfRegistration}
            onChange={(value) => void patchSettings({ allowSelfRegistration: value })}
          />
          <SettingsToggle
            label="Require consent signature"
            hint="Participants must sign before continuing past consent."
            checked={settings.requireConsentSignature}
            onChange={(value) => void patchSettings({ requireConsentSignature: value })}
          />
          <SettingsNumber
            label="Data retention (days)"
            value={settings.dataRetentionDays}
            min={1}
            onChange={(value) => void patchSettings({ dataRetentionDays: value })}
          />
          <SettingsNumber
            label="Max session (minutes)"
            value={settings.maxSessionMinutes}
            min={1}
            onChange={(value) => void patchSettings({ maxSessionMinutes: value })}
          />
        </div>
      )}

      <h2 className="admin-heading">Experiments</h2>
      <div className="experiment-table">
        <div className="table-head">
          <span>Experiment</span>
          <span>Status</span>
          <span>Stages</span>
          <span></span>
        </div>
        {experiments.map((experiment) => (
          <div className="experiment-row" key={experiment.id}>
            <div className="experiment-name">
              <strong>{experiment.name}</strong>
              <small>{experiment.code}</small>
            </div>
            <span className="pill">{experiment.status}</span>
            <span className="muted">{experiment.stages.length}</span>
            <div className="row-actions"></div>
          </div>
        ))}
      </div>

      <h2 className="admin-heading">Captured participant sessions</h2>
      {sessions.length === 0 ? (
        <p className="subheading">No participant events captured yet.</p>
      ) : (
        <div className="experiment-table">
          <div className="table-head">
            <span>Session</span>
            <span>Events</span>
            <span>Last activity</span>
            <span></span>
          </div>
          {sessions.map((session) => (
            <div className="experiment-row" key={session.id}>
              <div className="experiment-name">
                <strong>{session.id}</strong>
              </div>
              <span className="muted">{session.count}</span>
              <span className="muted">
                {session.timestamp ? new Date(session.timestamp).toLocaleString() : '—'}
              </span>
              <div className="row-actions">
                <button className="secondary-button" onClick={() => downloadSession(session.id)}>
                  Export CSV
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

interface SessionSummary {
  id: string
  count: number
  timestamp?: string
}

/** Download one session timeline as CSV (fetched from the backend). */
function downloadSession(sessionId: string): void {
  void (async () => {
    try {
      const session = await getSession(sessionId)
      if (!session) return
      downloadCsv(sessionId, eventsToCsv(session.events))
    } catch {
      // Malformed timeline — nothing sensible to export.
    }
  })()
}

function SettingsToggle({ label, hint, checked, onChange }: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="experiment-row admin-row">
      <div className="experiment-name">
        <strong>{label}</strong>
        <small>{hint}</small>
      </div>
      <span className="muted">{checked ? 'On' : 'Off'}</span>
      <span className="muted"></span>
      <div className="row-actions">
        <button
          className={checked ? 'switch on' : 'switch'}
          onClick={() => onChange(!checked)}
          aria-label={label}
        ><span></span></button>
      </div>
    </div>
  )
}

function SettingsNumber({ label, value, min, onChange }: {
  label: string
  value: number
  min: number
  onChange: (value: number) => void
}) {
  return (
    <div className="experiment-row admin-row">
      <div className="experiment-name">
        <strong>{label}</strong>
      </div>
      <span className="minutes-wrap admin-number">
        <input
          className="minutes-input"
          type="number"
          min={min}
          value={value}
          onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))}
        />
      </span>
      <span className="muted"></span>
      <div className="row-actions"></div>
    </div>
  )
}
