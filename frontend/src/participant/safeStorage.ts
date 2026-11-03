/**
 * safeStorage.ts — quota-safe localStorage access for participant runtime state.
 *
 * A runtime checkpoint can carry base64 attachments and signature images. A
 * single oversized write throws QuotaExceededError; because these writes happen
 * inside React effects, an uncaught throw unmounts the whole participant tree
 * (white screen). These helpers never throw: on failure they retry with a
 * caller-supplied compact payload, then keep the value in memory for this page.
 */

const memory = new Map<string, string>()
const listeners = new Set<(degraded: boolean) => void>()
let degraded = false

function setDegraded(value: boolean): void {
	if (degraded === value) return
	degraded = value
	for (const listener of listeners) listener(value)
}

/** Subscribe to durable-storage degradation. Returns an unsubscribe function. */
export function onStorageDegraded(
	listener: (degraded: boolean) => void,
): () => void {
	listeners.add(listener)
	listener(degraded)
	return () => {
		listeners.delete(listener)
	}
}

export function storageDegraded(): boolean {
	return degraded
}

export function safeGetItem(key: string): string | null {
	if (memory.has(key)) return memory.get(key) ?? null
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

/**
 * Persist a value without ever throwing. `compact` is a smaller representation
 * the caller can tolerate losing detail from. Returns true when the value (or
 * its compact form) reached durable storage; false means in-memory only.
 */
export function safeSetItem(
	key: string,
	value: string,
	compact?: string,
): boolean {
	try {
		localStorage.setItem(key, value)
		memory.delete(key)
		setDegraded(false)
		return true
	} catch {
		// QuotaExceededError, SecurityError, or storage disabled entirely.
	}
	if (compact !== undefined) {
		try {
			localStorage.setItem(key, compact)
			memory.delete(key)
			setDegraded(true)
			return true
		} catch {
			// Fall through to the in-memory fallback.
		}
	}
	memory.set(key, compact ?? value)
	setDegraded(true)
	return false
}

export function safeRemoveItem(key: string): void {
	memory.delete(key)
	try {
		localStorage.removeItem(key)
	} catch {
		setDegraded(true)
	}
}

export function safeKeys(): string[] {
	try {
		return Object.keys(localStorage)
	} catch {
		return [...memory.keys()]
	}
}
