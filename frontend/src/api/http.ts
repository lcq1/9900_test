// Shared HTTP layer for authentication, errors, and response parsing.
import { getSession } from '../auth/sessionStore'

// API base URL; defaults to /api.
const BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

// Send authenticated JSON requests and handle network and backend errors.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	const token = getSession()?.token
	const headers: Record<string, string> = { 'Content-Type': 'application/json' }
	if (token) headers.Authorization = `Bearer ${token}`

	let res: Response
	try {
		// Serialize the body only when provided.
		res = await fetch(`${BASE}${path}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
		})
	} catch {
		// Fetch rejects when a network request cannot complete.
		throw new Error(
			'Cannot reach the study server. Start the backend first (npm run dev:api in frontend/, or run-dev.sh) and try again.',
		)
	}

	if (!res.ok) {
		// Treat 502, 503, and 504 as backend availability errors.
		if (res.status === 502 || res.status === 503 || res.status === 504) {
			// Include backend startup instructions.
			throw new Error(
				'Cannot reach the study server (backend is not running). Start it with "npm run dev:api" and try again.',
			)
		}
		let message = `Request failed (${res.status})`
		try {
			// Parse error details; fall back to the HTTP status.
			const data = await res.json()
			if (data?.detail) {
				// Prefer backend error details.
				message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
			}
		} catch {
			// Keep the status message if error details cannot be parsed.
		}
		throw new Error(message)
	}

	if (res.status === 204) return undefined as T
	const text = await res.text()
	return (text ? JSON.parse(text) : undefined) as T
}

// Detect missing resources from a 404 in the error message.
export function isNotFound(error: unknown): boolean {
	return error instanceof Error && error.message.includes('404')
}

// Shared GET, POST, PATCH, and DELETE helpers.
export const http = {
	get: <T>(path: string) => request<T>('GET', path),
	post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
	patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
	del: <T>(path: string) => request<T>('DELETE', path),
}
