// Authentication API; the HTTP layer adds the session's Bearer token.
import { http } from './http'

// Supported researcher roles.
export type ResearcherRole = 'researcher' | 'administrator'

// Researcher identity, contact details, role, and creation time.
export interface Researcher {
	id: string
	name: string
	email: string
	role: ResearcherRole
	createdAt: string
}

// Login session with token, researcher, and issue time.
export interface Session {
	token: string
	researcher: Researcher
	issuedAt: string
}

// Registration name, email, and optional password.
export interface RegisterInput {
	name: string
	email: string
	// The backend handles and stores the password.
	password?: string
}

// Register, then log in to obtain a session.
export async function registerResearcher(input: RegisterInput): Promise<Session> {
	await http.post<Researcher>('/auth/register', {
		name: input.name,
		email: input.email,
		password: input.password,
	})
	return signIn(input.email, input.password ?? '')
}

// Log in with email and password to obtain a session.
export async function signIn(email: string, password: string): Promise<Session> {
	return http.post<Session>('/auth/login', { email, password })
}

// Log out on the backend; the caller clears the local session.
export async function signOut(): Promise<void> {
	await http.post('/auth/logout')
}

// Fetch all registered researchers.
export async function listResearchers(): Promise<Researcher[]> {
	return http.get<Researcher[]>('/researchers')
}

// Promote a researcher to admin and return the updated account.
export async function promoteToAdministrator(id: string): Promise<Researcher> {
	return http.patch<Researcher>(`/researchers/${id}/promote`, {})
}
