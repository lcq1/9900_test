// Administrator APIs for account access, platform settings and results.
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
	requireResearcherApproval?: boolean
	defaultStorageLocation?: string | null
}
export const getSettings = () => http.get<PlatformSettings>('/admin/settings')
export const updateSettings = (patch: Partial<PlatformSettings>) =>
	http.patch<PlatformSettings>('/admin/settings', patch)
export const getWorkspaceMembers = () => http.get<Researcher[]>('/workspace/members')
export const getWorkspaceSettings = () => http.get<PlatformSettings>('/workspace/settings')

// Fetch researchers for the admin page.
export const listResearchersForAdmin = () => http.get<Researcher[]>('/admin/researchers')
export const createResearcherForAdmin = (input: { name: string; email: string; password: string }) =>
	http.post<Researcher>('/admin/researchers', input)
export const updateResearcherAccess = (id: string, status: 'active' | 'disabled') =>
	http.patch<Researcher>('/admin/researchers/' + encodeURIComponent(id), { status })
export const getAdminStorage = () =>
	http.get<{ location: string; locations: string[] }>('/admin/storage')
export const listAdminExperiments = () => http.get<Experiment[]>('/admin/experiments')
export const listAdminParticipants = () => http.get<ParticipantSessionResult[]>('/admin/participants')
export const downloadAdminResults = (id: string) =>
	downloadFile(
		'/admin/experiments/' + id + '/results.xlsx',
		'experiment.xlsx',
	)

export interface WorkspaceUsage {
    experiments: number
    sessions: number
    completedSessions: number
    events: number
    recordings: number
    updatedAt: string
}
export const getWorkspaceUsage = () => http.get<WorkspaceUsage>('/workspace/usage')
