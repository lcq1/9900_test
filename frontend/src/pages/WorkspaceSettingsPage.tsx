// Workspace settings, backend member data, and local usage statistics.
import { useEffect, useState } from 'react'
import type { Experiment } from '../types'
import { getCurrentResearcher } from '../auth/sessionStore'
import { getSettings, listResearchersForAdmin, type PlatformSettings } from '../api/administrator'
import type { Researcher } from '../api/auth'

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
			// Load initial data and handle results or errors.
			try {
				// Fetch researchers and platform settings in parallel.
				const [people, current] = await Promise.all([listResearchersForAdmin(), getSettings()])
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
			// Ignore pending results after unmount.
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

	// Render the current view.
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
						Clearing local data removes all experiments, sessions, and captured events from this
						device. This prototype stores data locally in your browser.
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
