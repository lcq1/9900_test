import { useEffect, useState } from 'react'
import type { Experiment } from '../types'
import type { ParticipantEvent } from '../participant/EventQueue'
import { getCurrentResearcher } from '../auth/sessionStore'
import { downloadCsv, eventsToCsv } from '../utils/sessionCsv'
import {
	getSettings,
	listResearchersForAdmin,
	updateSettings,
	type PlatformSettings,
} from '../api/administrator'
import { promoteToAdministrator, type Researcher } from '../api/auth'

// Manage backend accounts and settings, and inspect local participant logs.
export function AdministratorPage({ experiments }: { experiments: Experiment[] }) {
	// Track admin data, loading state, and errors.
	const [researchers, setResearchers] = useState<Researcher[]>([])
	const [settings, setSettings] = useState<PlatformSettings | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	const me = getCurrentResearcher()

	// Load data and ignore results after unmount.
	useEffect(() => {
		let active = true
		// Load researchers and settings in parallel; ignore results after unmount.
		const load = async () => {
			try {
				// Fetch researchers and platform settings in parallel.
				const [people, current] = await Promise.all([listResearchersForAdmin(), getSettings()])
				if (!active) return
				setResearchers(people)
				setSettings(current)
			} catch {
				// Show the request error and retain loaded data.
				if (active) setError('Could not load administrator data.')
			} finally {
				// Reset loading state after the request.
				if (active) setLoading(false)
			}
		}
		void load()
		return () => {
			// Ignore pending results after unmount.
			active = false
		}
	}, [])

	// Save setting changes and apply the backend response.
	const patchSettings = async (patch: Partial<PlatformSettings>) => {
		if (!settings) return
		try {
			// Save changes and refresh platform settings.
			const next = await updateSettings(patch)
			setSettings(next)
			setError('')
		} catch {
			// Show the request error and retain loaded data.
			setError('Could not save that setting.')
		}
	}

	// Promote the researcher and update the list entry.
	const promote = async (id: string) => {
		try {
			// Promote the account and replace its researcher entry.
			const updated = await promoteToAdministrator(id)
			setResearchers((current) =>
				current.map((person) => (person.id === updated.id ? updated : person)),
			)
			setError('')
		} catch {
			// Show the request error and retain loaded data.
			setError('Could not update that researcher.')
		}
	}

	// Local event logs use p13-events:<session> keys.
	const sessions = readSessions()

	// Render the current view.
	return (
		<section className="page dashboard">
			{/* Page heading and main actions. */}
			<div className="page-heading">
				<div>
					<p className="eyebrow">ADMINISTRATION</p>
					<h1>Platform administration</h1>
					<p className="subheading">
						Researcher accounts, platform settings and captured participant sessions.
					</p>
				</div>
				{me && (
					<span className="pill">
						Signed in as {me.name} ({me.role})
					</span>
				)}
			</div>

			{loading && <p className="subheading">Loading administrator data…</p>}
			{error && <p className="entry-error">{error}</p>}

			{/* Summary statistics. */}
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
			{/* Records and row actions. */}
			<div className="experiment-table">
				<div className="table-head">
					<span>Researcher</span>
					<span>Role</span>
					<span>Created</span>
					<span></span>
				</div>
				{researchers.length === 0 && !loading && (
					<div className="experiment-row">
						<span className="muted">No researchers registered yet.</span>
					</div>
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
			{/* Editable platform settings. */}
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
			{/* Records and row actions. */}
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
			{/* Records and row actions. */}
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

// Session ID, event count, and last activity for the admin page.
interface SessionSummary {
	id: string
	count: number
	timestamp?: string
}

// Summarize event counts and last activity from p13-events: logs.
function readSessions(): SessionSummary[] {
	const summaries: SessionSummary[] = []
	for (let i = 0; i < localStorage.length; i += 1) {
		// Read valid sessions from local event logs.
		const key = localStorage.key(i)
		if (!key || !key.startsWith('p13-events:')) continue
		const raw = localStorage.getItem(key)
		if (!raw) continue
		try {
			// Parse cached data; fall back if invalid.
			const parsed = JSON.parse(raw) as { events?: { timestamp?: string }[] }
			const events = Array.isArray(parsed.events) ? parsed.events : []
			summaries.push({
				id: key.slice('p13-events:'.length),
				count: events.length,
				timestamp: events[events.length - 1]?.timestamp,
			})
		} catch {
			// Skip invalid event logs.
		}
	}
	return summaries
}

// Export the session's local event log as CSV.
function downloadSession(sessionId: string): void {
	const raw = localStorage.getItem(`p13-events:${sessionId}`)
	if (!raw) return
	try {
		// Parse cached data; fall back if invalid.
		const parsed = JSON.parse(raw) as { events?: ParticipantEvent[] }
		const events = Array.isArray(parsed.events) ? parsed.events : []
		downloadCsv(sessionId, eventsToCsv(events))
	} catch {
		// Cancel export if the log cannot be parsed.
	}
}

// Boolean platform setting with a label and toggle.
function SettingsToggle({
	label,
	hint,
	checked,
	onChange,
}: {
	label: string
	hint: string
	checked: boolean
	onChange: (value: boolean) => void
}) {
	// Render the current view.
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
				>
					<span></span>
				</button>
			</div>
		</div>
	)
}

// Numeric platform setting with a minimum value.
function SettingsNumber({
	label,
	value,
	min,
	onChange,
}: {
	label: string
	value: number
	min: number
	onChange: (value: number) => void
}) {
	// Render the current view.
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
