// Admin API for accounts and settings; action records are not persisted.
import type { Researcher } from './auth'
import { listResearchers } from './auth'
import { http } from './http'

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

// Fetch researchers for the admin page.
export async function listResearchersForAdmin(): Promise<Researcher[]> {
	return listResearchers()
}

// Admin action ID, timestamp, and description.
export interface AdminAuditEntry {
	id: string
	at: string
	message: string
}

// Create an admin action record without persisting it.
export async function logAdminAction(message: string): Promise<AdminAuditEntry> {
	return { id: `log-${Date.now()}`, at: new Date().toISOString(), message }
}
