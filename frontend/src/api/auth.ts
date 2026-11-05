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
	accountStatus?: 'active' | 'pending' | 'disabled'
	createdAt: string
}

// Login session with token, researcher, and issue time.
export interface Session {
	token: string
	researcher: Researcher
	issuedAt: string
}

// Researcher registration requires a name, email and password.
export interface RegisterInput {
	name: string
	email: string
	// The backend handles and stores the password.
	password: string
}

export interface RegistrationPolicy {
    allowSelfRegistration: boolean
    requireResearcherApproval: boolean
    emailRestricted: boolean
}
export const getRegistrationPolicy = () => http.get<RegistrationPolicy>('/auth/registration-policy')

export const registerResearcher = (input: RegisterInput) => http.post<Researcher>('/auth/register', input)

// Log in with email and password to obtain a session.
export async function signIn(email: string, password: string): Promise<Session> {
	return http.post<Session>('/auth/login', { email, password })
}

// Log out on the backend; the caller clears the local session.
export async function signOut(): Promise<void> {
	await http.post('/auth/logout')
}

// Promote a researcher to admin and return the updated account.
export const promoteToAdministrator = (id: string) => http.patch<Researcher>('/researchers/' + id + '/promote')
