// Researcher registration with session storage and completion callbacks.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import * as auth from '../api/auth'
import { setSession } from '../auth/sessionStore'

// Optional registration and back callbacks.
export interface ResearcherRegisterPageProps {
	onRegistered?: (researcher: auth.Researcher) => void
	onBack?: () => void
}

// Validate registration, create the account, and save the session.
export function ResearcherRegisterPage({ onRegistered, onBack }: ResearcherRegisterPageProps) {
	// Track registration fields, validation errors, and the created account.
	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [confirm, setConfirm] = useState('')
	const [error, setError] = useState('')
	const [done, setDone] = useState<auth.Researcher | null>(null)
	const [busy, setBusy] = useState(false)

	// Validate required fields and matching passwords, then register.
	const submit = async (event: FormEvent) => {
		event.preventDefault()
		setError('')
		if (!name.trim() || !email.trim() || !password) {
			// Require email and password before submitting.
			setError('All fields are required.')
			return
		}
		if (password.length < 6) {
			// Require a password of at least six characters.
			setError('Password must be at least 6 characters.')
			return
		}
		if (password !== confirm) {
			// Require matching passwords.
			setError('Passwords do not match.')
			return
		}
		setBusy(true)
		try {
			// Authenticate, save the session, and notify the parent.
			const session = await auth.registerResearcher({ name, email, password })
			setSession(session)
			setDone(session.researcher)
			onRegistered?.(session.researcher)
		} catch (err) {
			// Show the request error and retain loaded data.
			setError(err instanceof Error ? err.message : 'Registration failed.')
		} finally {
			// Reset loading state after the request.
			setBusy(false)
		}
	}

	if (done) {
		// Show confirmation after registration.
		// Render the current view.
		return (
			<section className="page">
				{/* Registered account details and workspace entry. */}
				<div className="register-done">
					<span className="register-done-icon">
						<Check size={28} />
					</span>
					<h1>Welcome, {done.name}</h1>
					<p className="subheading">Your researcher account ({done.email}) has been created.</p>
					<button className="primary-button" onClick={() => onBack?.()}>
						Continue to workspace
					</button>
				</div>
			</section>
		)
	}

	// Render the current view.
	return (
		<section className="page">
			<button className="back-link" onClick={() => onBack?.()}>
				<ArrowLeft size={16} /> Back
			</button>
			<div className="register-card">
				<p className="eyebrow">RESEARCHER SIGN-UP</p>
				<h1>Create your researcher account</h1>
				<p className="subheading">Register to build and run human-AI studies on protocol.</p>
				{/* Form fields and validated submission. */}
				<form onSubmit={submit}>
					<label className="entry-label">
						Full name
						<input
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Jane Researcher"
						/>
					</label>
					<label className="entry-label">
						Email address
						<input
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="you@university.edu"
						/>
					</label>
					<label className="entry-label">
						Password
						<input
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							placeholder="At least 6 characters"
						/>
					</label>
					<label className="entry-label">
						Confirm password
						<input
							type="password"
							value={confirm}
							onChange={(event) => setConfirm(event.target.value)}
							placeholder="Re-enter password"
						/>
					</label>
					{error && <p className="entry-error">{error}</p>}
					<button className="primary-button entry-button" type="submit" disabled={busy}>
						{busy ? 'Creating…' : 'Create account'}
					</button>
				</form>
			</div>
		</section>
	)
}
