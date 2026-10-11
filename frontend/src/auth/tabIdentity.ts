// Sync participant identity across tabs via broadcasts and storage events.

export interface ParticipantIdentity {
	sessionId: string
	experimentCode: string
	participantCode: string
	tabId: string
	startedAt: string
}

// Participant identity broadcast channel.
const CHANNEL_NAME = 'p13-tab-identity'
// Local storage key for the latest participant identity.
const STORAGE_KEY = 'p13-active-participant'
// Session storage key for the current tab ID.
const TAB_KEY = 'p13-tab-id'

// Cached channel: undefined before initialization, null if unsupported.
let cachedChannel: BroadcastChannel | null | undefined

// Create and cache the channel; return null if unsupported.
function getChannel(): BroadcastChannel | null {
	if (cachedChannel !== undefined) return cachedChannel
	if (typeof BroadcastChannel !== 'undefined') {
		// Create the broadcast channel if supported.
		cachedChannel = new BroadcastChannel(CHANNEL_NAME)
	} else {
		// Mark broadcasts as unsupported.
		cachedChannel = null
	}
	return cachedChannel
}

// Reuse the tab ID or generate and save one.
export function getTabId(): string {
	const existing = sessionStorage.getItem(TAB_KEY)
	if (existing) return existing
	const id = `tab-${Math.random().toString(36).slice(2, 10)}`
	sessionStorage.setItem(TAB_KEY, id)
	return id
}

// Save and broadcast participant identity with the current tab ID.
export function announceParticipantIdentity(identity: Omit<ParticipantIdentity, 'tabId'>): void {
	const full: ParticipantIdentity = { ...identity, tabId: getTabId() }
	const payload = JSON.stringify(full)
	try {
		// Try to save the shared identity.
		localStorage.setItem(STORAGE_KEY, payload)
	} catch {
		// Continue broadcasting if privacy or quota limits block storage.
	}
	getChannel()?.postMessage({ type: 'identity', identity: full })
}

// Clear the shared identity and broadcast the change.
export function clearParticipantIdentity(): void {
	try {
		// Try to clear the cached identity.
		localStorage.removeItem(STORAGE_KEY)
	} catch {
		// Broadcast the clear message even if storage cleanup fails.
	}
	getChannel()?.postMessage({ type: 'clear', tabId: getTabId() })
}

// Read the latest participant identity from local storage.
export function getActiveParticipantIdentity(): ParticipantIdentity | null {
	try {
		// Parse cached data; fall back if invalid.
		const raw = localStorage.getItem(STORAGE_KEY)
		return raw ? (JSON.parse(raw) as ParticipantIdentity) : null
	} catch {
		// Treat invalid cached data as no active session or identity.
		return null
	}
}

// Identity change callback; null means cleared.
export type IdentityListener = (identity: ParticipantIdentity | null) => void

// Listen for broadcasts and storage events; return an unsubscribe function.
export function onParticipantIdentityChange(listener: IdentityListener): () => void {
	const channel = getChannel()
	// Forward identity updates and clear messages to the listener.
	const handleMessage = (event: MessageEvent) => {
		if (!event.data) return
		if (event.data.type === 'identity') {
			// Notify the listener of the updated identity.
			listener(event.data.identity as ParticipantIdentity)
		} else if (event.data.type === 'clear') {
			// Notify the listener that the identity was cleared.
			listener(null)
		}
	}
	channel?.addEventListener('message', handleMessage)

	// Forward participant identity storage changes to the listener.
	const handleStorage = (event: StorageEvent) => {
		if (event.key === STORAGE_KEY) {
			// Parse the updated participant identity.
			listener(event.newValue ? (JSON.parse(event.newValue) as ParticipantIdentity) : null)
		}
	}
	window.addEventListener('storage', handleStorage)

	return () => {
		// Remove broadcast and storage listeners.
		channel?.removeEventListener('message', handleMessage)
		window.removeEventListener('storage', handleStorage)
	}
}
