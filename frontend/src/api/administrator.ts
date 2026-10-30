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

// Platform settings endpoint.
const SETTINGS_PATH = '/admin/settings'

// Fetch platform settings.
export async function getSettings(): Promise<PlatformSettings> {
	return http.get<PlatformSettings>(SETTINGS_PATH)
}

// Update platform settings and return the saved result.
export async function updateSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
	return http.patch<PlatformSettings>(SETTINGS_PATH, patch)
}
export const getWorkspaceMembers = () => http.get<Researcher[]>('/workspace/members')
export const getWorkspaceSettings = () => http.get<PlatformSettings>('/workspace/settings')

// Fetch researchers for the admin page.
export const listResearchersForAdmin = () => http.get<Researcher[]>('/admin/researchers')
export const listAdminExperiments = () => http.get<Experiment[]>('/admin/experiments')
export const listAdminParticipants = () => http.get<ParticipantSessionResult[]>('/admin/participants')
export const downloadAdminResults = (id: string) =>
	downloadFile('/admin/experiments/' + id + '/results.csv', 'experiment_results.csv')
