import { DeleteSessionDialog } from '../researcher/DeleteSessionDialog'
import { useTransientNotice } from '../participant/TimerController'
import { useEffect, useState } from 'react'
import { Modal } from 'antd'
import type { Experiment } from '../types'
import { getCurrentResearcher } from '../auth/sessionStore'
import {
  getSettings,
  getAdminStorage,
  createResearcherForAdmin,
  updateResearcherAccess,
  downloadAdminResults,
  listResearchersForAdmin,
  updateSettings,
  listAdminExperiments,
  listAdminParticipants,
  type PlatformSettings,
} from '../api/administrator'
import { promoteToAdministrator, type Researcher } from '../api/auth'
import { downloadSessionWorkbook } from '../api/participant'

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
export function AdministratorPage() {
	const [experiments, setExperiments] = useState<Experiment[]>([])
	const [researchers, setResearchers] = useState<Researcher[]>([])
	const [settings, setSettings] = useState<PlatformSettings | null>(null)
	const [sessions, setSessions] = useState<SessionSummary[]>([])
    const [deletingSession, setDeletingSession] = useState<SessionSummary | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError, errorVisible, errorRevision] =
		useTransientNotice('')
	const [storage, setStorage] = useState<{ location: string; locations: string[] } | null>(null)
	const [accountBusy, setAccountBusy] = useState(false)
	const [settingsBusy, setSettingsBusy] = useState(false)
	const [downloading, setDownloading] = useState<string | null>(null)

	const downloadSession = async (sessionId: string) => {
		setDownloading(sessionId)
		setError('')
		try {
			await downloadSessionWorkbook(sessionId)
		} catch {
			setError(
				'Could not download the experiment workbook. Please retry.',
			)
		} finally {
			setDownloading(null)
		}
	}

	const me = getCurrentResearcher()

	useEffect(() => {
		let active = true
		const load = async () => {
			try {
				const [people, current, studies, storageOptions] = await Promise.all([
					listResearchersForAdmin(),
					getSettings(),
					listAdminExperiments(),
					getAdminStorage(),
				])
				if (!active) return
				setResearchers(people)
				setSettings(current)
				setExperiments(studies)
				setStorage(storageOptions)
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
	}, [setError])

	/** Persist a settings patch and reflect the stored result in state. */
	const patchSettings = async (patch: Partial<PlatformSettings>) => {
		if (!settings || settingsBusy) return
		setSettingsBusy(true)
		try {
			const next = await updateSettings(patch)
			setSettings(next)
			if (next.defaultStorageLocation) setStorage((current) => current && { ...current, location: next.defaultStorageLocation! })
			setError('')
		} catch {
			setError('Could not save that setting.')
		} finally {
			setSettingsBusy(false)
		}
	}

	const saveAccount = async (action: () => Promise<Researcher>) => {
		setAccountBusy(true)
		setError('')
		try {
			const updated = await action()
			setResearchers((current) => current.some((person) => person.id === updated.id)
				? current.map((person) => person.id === updated.id ? updated : person)
				: [...current, updated])
			return true
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : 'Could not update the account.')
			return false
		} finally {
			setAccountBusy(false)
		}
	}

	// Participant sessions are submitted to the backend on finish/abort; read them
	// from the server store (non-critical — ignore failures so the admin surface
	// still loads even if the session list is momentarily unavailable).
	useEffect(() => {
		let active = true
		const load = async () => {
			try {
				const backend = await listAdminParticipants()
				if (!active) return
				setSessions(
					backend
						.map((s) => ({
							id: s.id,
							participantCode: s.participantCode,
							experimentCode: s.experimentCode,
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
	}, [setError])

	return (
		<section className="page dashboard">
            <DeleteSessionDialog session={deletingSession} onCancel={() => setDeletingSession(null)} onDeleted={id => { setSessions(items => items.filter(item => item.id !== id)); setDeletingSession(null) }} />
			<div className="page-heading">
				<div>
					<p className="eyebrow">ADMINISTRATION</p>
					<h1>Platform administration</h1>
					<p className="subheading">
						Researcher accounts, platform settings and captured
						participant sessions.
					</p>
				</div>
				{me && (
					<span className="pill">
						Signed in as {me.name} ({me.role})
					</span>
				)}
			</div>

			{loading && (
				<p className="subheading">Loading administrator data…</p>
			)}
			{error && errorVisible && (
				<p key={errorRevision} className="entry-error transient-notice">
					{error}
				</p>
			)}

			<div className="stats-row">
				<div>
					<span className="stat-label">Researchers</span>
					<strong>
						{researchers.length.toString().padStart(2, '0')}
					</strong>
				</div>
				<div>
					<span className="stat-label">Experiments</span>
					<strong>
						{experiments.length.toString().padStart(2, '0')}
					</strong>
				</div>
				<div>
					<span className="stat-label">Captured sessions</span>
					<strong>
						{sessions.length.toString().padStart(2, '0')}
					</strong>
				</div>
				<div>
					<span className="stat-label">Captured events</span>
					<strong>
						{sessions.reduce((total, s) => total + s.count, 0)}
					</strong>
				</div>
			</div>

			<h2 className="admin-heading">Researcher accounts</h2>
			<form className="admin-create-account" onSubmit={async (event) => {
				event.preventDefault()
				const form = event.currentTarget
				const values = new FormData(form)
				if (await saveAccount(() => createResearcherForAdmin({
					name: String(values.get('name')).trim(),
					email: String(values.get('email')).trim(),
					password: String(values.get('password')),
				}))) form.reset()
			}}>
				<label>Full name<input name="name" required maxLength={255} /></label>
				<label>Email<input name="email" type="email" required maxLength={255} /></label>
				<label>Initial password<input name="password" type="password" required autoComplete="new-password" /></label>
				<button type="submit" className="primary-button" disabled={accountBusy}>Create researcher</button>
			</form>
			<div className="experiment-table">
				<div className="table-head">
					<span>Researcher</span>
					<span>Role</span>
					<span>Created</span>
					<span></span>
				</div>
				{researchers.length === 0 && !loading && (
					<div className="experiment-row">
						<span className="muted">
							No researchers registered yet.
						</span>
					</div>
				)}
				{researchers.map((person) => (
					<div className="experiment-row" key={person.id}>
						<div className="experiment-name">
							<strong>{person.name}</strong>
							<small>{person.email}</small>
						</div>
						<span className="pill">{person.role === 'administrator' ? 'Administrator' : person.accountStatus ?? 'active'}</span>
						<span className="muted">
							{new Date(person.createdAt).toLocaleDateString()}
						</span>
						<div className="row-actions">
							{person.role !== 'administrator' && <>
								{person.accountStatus === 'active' || !person.accountStatus ? <>
									<button className="secondary-button" disabled={accountBusy}
										onClick={() => Modal.confirm({ title: `Disable ${person.name}?`,
											content: 'This revokes their login sessions and preserves study data.',
											onOk: () => saveAccount(() => updateResearcherAccess(person.id, 'disabled')) })}>
										Disable
									</button>
									<button className="secondary-button" disabled={accountBusy}
										onClick={() => Modal.confirm({ title: `Promote ${person.name}?`,
											content: 'This grants administrator access to all studies and platform settings.',
											onOk: () => saveAccount(() => promoteToAdministrator(person.id)) })}>
										Promote
									</button>
								</> : <button className="secondary-button" disabled={accountBusy}
									onClick={() => void saveAccount(() => updateResearcherAccess(person.id, 'active'))}>
									{person.accountStatus === 'pending' ? 'Approve' : 'Restore access'}
								</button>}
							</>}
						</div>
					</div>
				))}
			</div>

			<h2 className="admin-heading">Platform settings</h2>
			{settings && (
				<div className="admin-settings">
					<SettingsToggle
						label="Allow self-registration"
						hint="Controls public registration. Administrators can still create accounts."
						checked={settings.allowSelfRegistration}
						onChange={(value) =>
							void patchSettings({ allowSelfRegistration: value })
						}
					/>
                    <SettingsToggle label="Allow researchers to delete participant records"
                        hint="Off by default. When enabled, researchers may permanently delete sessions and recordings belonging to their own experiments. Administrators always retain access."
                        checked={Boolean(settings.allowResearcherSessionDeletion)}
                        onChange={value => void patchSettings({ allowResearcherSessionDeletion: value })} />
					<SettingsToggle label="Require researcher approval"
						hint="New self-registered accounts wait for an administrator."
						checked={Boolean(settings.requireResearcherApproval)}
						onChange={(value) => void patchSettings({ requireResearcherApproval: value })} />
					{storage && <label className="admin-setting-row">
						<span className="admin-setting-copy"><strong>Default storage for new files</strong><small>Applies to new uploads and recordings without a workspace override.</small></span>
						<select value={storage.location} disabled={settingsBusy}
							onChange={(event) => void patchSettings({ defaultStorageLocation: event.target.value })}>
							{storage.locations.map((location) => <option key={location} value={location}>{location === 'legacy' ? 'Local server storage' : location}</option>)}
						</select>
					</label>}

					<SettingsToggle
						label="Require consent signature"
						hint="Require a consent stage before questions in published studies. Recording always requires consent."
						checked={settings.requireConsentSignature}
						onChange={(value) =>
							void patchSettings({
								requireConsentSignature: value,
							})
						}
					/>
					<p className="admin-policy-note">Retention and session duration are recorded as policy settings. Apply them under your study protocol.</p>
					<SettingsNumber
						label="Retention policy (days)"
						value={settings.dataRetentionDays}
						min={1}
						onChange={(value) =>
							void patchSettings({ dataRetentionDays: value })
						}
					/>
					<SettingsNumber
						label="Session duration policy (minutes)"
						value={settings.maxSessionMinutes}
						min={1}
						onChange={(value) =>
							void patchSettings({ maxSessionMinutes: value })
						}
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
						<span className="muted">
							{experiment.stages.length}
						</span>
						<div className="row-actions">
							<button className="secondary-button" disabled={downloading !== null} onClick={async () => {
								setDownloading(experiment.id)
								setError('')
								try { await downloadAdminResults(experiment.id) }
								catch { setError('Could not export this experiment.') }
								finally { setDownloading(null) }
							}}>Export study</button>
						</div>
					</div>
				))}
			</div>

			<h2 className="admin-heading">Captured participant sessions</h2>
			{sessions.length === 0 ? (
				<p className="subheading">
					No participant events captured yet.
				</p>
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
								<strong>{session.participantCode}</strong>
								<small>{session.experimentCode}</small>
							</div>
							<span className="muted">{session.count}</span>
							<span className="muted">
								{session.timestamp
									? new Date(
											session.timestamp,
										).toLocaleString()
									: '—'}
							</span>
							<div
								className="row-actions"
								style={{ flexWrap: 'wrap' }}
							>
								<button
									className="secondary-button"
									disabled={downloading !== null}
									onClick={() =>
										void downloadSession(session.id)
									}
								>
									{downloading === session.id
										? 'Downloading…'
										: 'Download Excel'}
								</button>
                                <button type="button" className="danger-button" onClick={() => setDeletingSession(session)}>Delete record</button>
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	)
}

interface SessionSummary {
	participantCode: string
	experimentCode: string
  id: string
  count: number
  timestamp?: string
}

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
	return (
		<div className="admin-setting-row">
			<div className="admin-setting-copy">
				<strong>{label}</strong>
				<small>{hint}</small>
			</div>
			<div className="admin-setting-control">
				<span>{checked ? 'On' : 'Off'}</span>
				<button
					className={checked ? 'switch on' : 'switch'}
					onClick={() => onChange(!checked)}
					aria-label={label}
					role="switch" aria-checked={checked}
				>
					<span></span>
				</button>
			</div>
		</div>
	)
}

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
	return (
		<label className="admin-setting-row">
			<span className="admin-setting-copy"><strong>{label}</strong></span>
			<span className="admin-setting-control">
				<input
					className="minutes-input"
					type="number"
					min={min}
					value={value}
					onChange={(event) =>
						onChange(
							Math.max(min, Number(event.target.value) || min),
						)
					}
				/>
			</span>
		</label>
	)
}
