// Admin API for accounts and settings; action records are not persisted.
import type { Researcher } from './auth'
import type { Experiment } from '../types'
import { downloadFile, http } from './http'
import type { ParticipantSessionResult } from './participant'

// Registration, consent, retention, and session policies.
export interface PlatformSettings {
	allowSelfRegistration: boolean
	requireConsentSignature: boolean
	dataRetentionDays: number
	maxSessionMinutes: number
}
export const getSettings = () => http.get<PlatformSettings>('/admin/settings')
export const updateSettings = (patch: Partial<PlatformSettings>) =>
	http.patch<PlatformSettings>('/admin/settings', patch)
export const getWorkspaceMembers = () => http.get<Researcher[]>('/workspace/members')
export const getWorkspaceSettings = () => http.get<PlatformSettings>('/workspace/settings')

// Fetch researchers for the admin page.
export const listResearchersForAdmin = () => http.get<Researcher[]>('/admin/researchers')
export const listAdminExperiments = () => http.get<Experiment[]>('/admin/experiments')
export const listAdminParticipants = () => http.get<ParticipantSessionResult[]>('/admin/participants')
export const downloadAdminResults = (id: string) =>
	downloadFile(
		'/admin/experiments/' + id + '/results.xlsx',
		'experiment.xlsx',
	)
