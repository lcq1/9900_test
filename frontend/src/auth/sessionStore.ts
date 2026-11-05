// Synchronous local storage for researcher sessions.
import { create } from 'zustand'
import type { Session } from '../api/auth'

// Local storage key for the researcher session.
const KEY = 'p13-researcher-session'

function readSession(): Session | null {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null
	} catch {
		return null
	}
}

export const useSessionStore = create<{ session: Session | null }>(() => ({
	session: readSession(),
}))

// Save the researcher session locally.
export function setSession(session: Session): void {
	localStorage.setItem(KEY, JSON.stringify(session))
	useSessionStore.setState({ session })
}

// Update identity only while this account is still the signed-in account.
export function updateSessionResearcher(researcher: Session['researcher']): void {
    const current = getSession()
    if (current?.researcher.id === researcher.id) setSession({ ...current, researcher })
}

// Read the cached session; return null if missing or invalid.
export function getSession(): Session | null {
	return useSessionStore.getState().session
}
export function getCurrentResearcher() {
	return getSession()?.researcher ?? null
}

// Check for a valid local researcher session.
export function isSignedIn(): boolean {
	return getSession() !== null
}

// Clear the local researcher session.
export function clear(): void {
	localStorage.removeItem(KEY)
	useSessionStore.setState({ session: null })
}

const PARTICIPANT_KEY = 'beyond-participant-token'
export const getParticipantToken = () => sessionStorage.getItem(PARTICIPANT_KEY)
export const setParticipantToken = (token: string) =>
	sessionStorage.setItem(PARTICIPANT_KEY, token)
export const clearParticipantToken = () =>
	sessionStorage.removeItem(PARTICIPANT_KEY)

let fallbackParticipantClientId: string | undefined
/** Stable in this tab, including when browser storage is unavailable. */
export function getParticipantClientId(): string {
	try {
		const existing = sessionStorage.getItem('p13-client-id')
		if (existing) return existing
		const id = fallbackParticipantClientId ?? crypto.randomUUID()
		fallbackParticipantClientId = id
		sessionStorage.setItem('p13-client-id', id)
		return id
	} catch {
		fallbackParticipantClientId ??= crypto.randomUUID()
		return fallbackParticipantClientId
	}
}
