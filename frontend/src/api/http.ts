// Shared HTTP layer for authentication, errors, and response parsing.
import axios from 'axios'
import { clear, getSession } from '../auth/sessionStore'
export class HttpError extends Error {
	readonly status: number
	constructor(message: string, status: number) {
		super(message)
		this.name = 'HttpError'
		this.status = status
	}
}
const apiClient = axios.create({
	baseURL: import.meta.env.VITE_API_BASE ?? '/api',
	withCredentials: true,
})
apiClient.interceptors.request.use((config) => {
	const token = getSession()?.token
	if (token) config.headers.Authorization = 'Bearer ' + token
	config.headers['X-Request-Id'] = crypto.randomUUID()
	return config
})
apiClient.interceptors.response.use(
	(r) => r,
	(error: unknown) => {
		if (axios.isAxiosError(error)) {
			if (error.response?.status === 401) clear()
			const detail = error.response?.data?.error?.message ?? error.response?.data?.detail
			return Promise.reject(
				new HttpError(
					typeof detail === 'string'
						? detail
						: error.response
							? 'Request failed (' + error.response.status + ')'
							: 'Cannot reach the study server. Check the backend connection.',
					error.response?.status ?? 0,
				),
			)
		}
		return Promise.reject(error)
	},
)
export const http = {
	get: async <T,>(p: string): Promise<T> => (await apiClient.get<T>(p)).data,
	post: async <T,>(p: string, b?: unknown): Promise<T> => (await apiClient.post<T>(p, b)).data,
	patch: async <T,>(p: string, b?: unknown): Promise<T> => (await apiClient.patch<T>(p, b)).data,
	del: async <T,>(p: string): Promise<T> => (await apiClient.delete<T>(p)).data,
}

export async function openApiStream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
	const token = getSession()?.token
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/x-ndjson',
		'X-Request-Id': crypto.randomUUID(),
	}
	if (token) headers.Authorization = 'Bearer ' + token
	const base = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')
	const response = await fetch(base + path, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
		credentials: 'include',
		signal,
	})
	if (response.status === 401) clear()
	if (!response.ok) {
		const data = await response.json().catch(() => null)
		throw new HttpError(
			typeof data?.detail === 'string' ? data.detail : 'AI request failed (' + response.status + ').',
			response.status,
		)
	}
	return response
}
export async function downloadFile(p: string, filename: string): Promise<void> {
	const r = await apiClient.get(p, { responseType: 'blob' })
	const url = URL.createObjectURL(r.data)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(url)
}
