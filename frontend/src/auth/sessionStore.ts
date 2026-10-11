// Synchronous local storage for researcher sessions.
import type { Researcher, Session } from '../api/auth'

// Local storage key for the researcher session.
const KEY = 'p13-researcher-session'

// Save the researcher session locally.
export function setSession(session: Session): void {
	localStorage.setItem(KEY, JSON.stringify(session))
}

// Read the cached session; return null if missing or invalid.
export function getSession(): Session | null {
	const raw = localStorage.getItem(KEY)
	if (!raw) return null
	try {
		// Parse cached data; fall back if invalid.
		return JSON.parse(raw) as Session
	} catch {
		// Treat invalid cached data as no active session or identity.
		return null
	}
}

// Return the current researcher or null if logged out.
export function getCurrentResearcher(): Researcher | null {
	return getSession()?.researcher ?? null
}

// Clear the local researcher session.
export function clear(): void {
	localStorage.removeItem(KEY)
}

// Check for a valid local researcher session.
export function isSignedIn(): boolean {
	return getSession() !== null
}
