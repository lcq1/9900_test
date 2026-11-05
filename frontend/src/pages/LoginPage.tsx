import { useTransientNotice } from '../participant/TimerController'// Code-based participant entry and backend researcher/admin login.
import { useState } from 'react'
import { ArrowRight, LogIn, Play, ShieldCheck, UserPlus, UserRound } from 'lucide-react'
import * as auth from '../api/auth'
import { setSession } from '../auth/sessionStore'
import type React from 'react'

// Participant, researcher, and admin login roles.
type Role = 'participant' | 'researcher' | 'administrator'

// Show code entry for participants and account login for other roles.
export function AuthScreen({
	onSignIn,
	onParticipant,
	onRegister,
	initialEmail,
}: {
	onRegister?: () => void
	initialEmail?: string
	onSignIn: () => void
	onParticipant: (experimentCode?: string, participantCode?: string) => void
}) {
	// Track login role, registration mode, form fields, and request state.
	const [role, setRole] = useState<Role>('participant')
	const [mode, setMode] = useState<'signin' | 'register'>('signin')
	const [name, setName] = useState('')
	const [email, setEmail] = useState(initialEmail ?? '')
	const [password, setPassword] = useState('')
	const [experimentCode, setExperimentCode] = useState('')
	const [participantCode, setParticipantCode] = useState('')
	const [error, setError, errorVisible, errorRevision] =
		useTransientNotice('')
	const [busy, setBusy] = useState(false)

	// Validate and submit the form, then update session and request state.
	const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault()
		setError('')
		if (role === 'participant') {
			// Validate participant codes and pass entry to the parent.
			if (!experimentCode.trim() || !participantCode.trim()) {
				// Require both access codes before submitting.
				setError(
					'Experiment code and participant code are both required.',
				)
				return
			}
			onParticipant(experimentCode.trim(), participantCode.trim())
			return
		}
		if (!email.trim() || !password.trim()) {
			// Require email and password before submitting.
			setError('Email and password are required.')
			return
		}
		if (mode === 'register' && !name.trim()) {
			// Require a researcher name for registration.
			setError('Please enter your name.')
			return
		}
		setBusy(true)
		try {
			// Authenticate, save the session, and notify the parent.
			if (mode === 'register') {
				await auth.registerResearcher({ name, email, password })
				setMode('signin')
				setPassword('')
				return
			}
			const session = await auth.signIn(email, password)
			if (role === 'administrator' && session.researcher.role !== 'administrator') {
				setError('Use an administrator account to sign in here.')
				return
			}
			setSession(session)
			onSignIn()
		} catch (err) {
			// Show the request error and retain loaded data.
			setError(
				err instanceof Error
					? err.message
					: 'Something went wrong. Please try again.',
			)
		} finally {
			// Reset loading state after the request.
			setBusy(false)
		}
	}

	return (
		<div className="auth-screen">
			<div className="auth-panel">
				<div className="brand auth-brand">
					<span className="brand-mark" aria-hidden="true">
						<svg
							viewBox="0 0 24 24"
							width="16"
							height="16"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.4"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M5 19 19 5" />
							<path d="M9 5h10v10" />
						</svg>
					</span>
					<span className="brand-word">Beyond</span>
				</div>

				{/* Login instructions and role hints. */}
				<div className="auth-head">
					<div className="auth-icon">
						<UserRound size={22} />
					</div>
					<h1>Sign in</h1>
					<p className="auth-copy">
						Select your role, then enter your details.
					</p>
				</div>

				{/* Login role selection. */}
				<div className="auth-tabs">
					<button
						type="button"
						className={
							role === 'participant'
								? 'auth-tab active'
								: 'auth-tab'
						}
						aria-pressed={role === 'participant'}
						onClick={() => setRole('participant')}
					>
						<Play size={14} /> Participant
					</button>
					<button
						type="button"
						className={
							role === 'researcher'
								? 'auth-tab active'
								: 'auth-tab'
						}
						aria-pressed={role === 'researcher'}
						onClick={() => setRole('researcher')}
					>
						<LogIn size={14} /> Researcher
					</button>
					<button
						type="button"
						className={
							role === 'administrator'
								? 'auth-tab active'
								: 'auth-tab'
						}
						aria-pressed={role === 'administrator'}
						onClick={() => { setMode('signin'); setError(''); setRole('administrator') }}
					>
						<ShieldCheck size={14} /> Administrator
					</button>
				</div>

				{/* Form fields and validated submission. */}
				<form onSubmit={submit}>
					{role === 'participant' && (
						<>
							<label>
								Experiment code
								<input
									value={experimentCode}
									onChange={(event) =>
										setExperimentCode(event.target.value)
									}
									placeholder="EXP-2026-013"
									autoComplete="off"
									spellCheck={false}
								/>
							</label>
							<label>
								Participant code
								<input
									value={participantCode}
									onChange={(event) =>
										setParticipantCode(event.target.value)
									}
									placeholder="P07"
									autoComplete="off"
									spellCheck={false}
								/>
							</label>
						</>
					)}

					{role !== 'participant' && mode === 'register' && (
						<label>
							Full name
							<input
								value={name}
								onChange={(event) =>
									setName(event.target.value)
								}
								placeholder="Jane Researcher"
							/>
						</label>
					)}

					{role !== 'participant' && (
						<>
							<label>
								Email address
								<input
									type="email"
									value={email}
									onChange={(event) =>
										setEmail(event.target.value)
									}
									placeholder="you@university.edu"
								/>
							</label>
							<label>
								Password
								<input
									type="password"
									value={password}
									onChange={(event) =>
										setPassword(event.target.value)
									}
									placeholder="••••••••"
								/>
							</label>
						</>
					)}

					{error && errorVisible && (
						<p
							key={errorRevision}
							className="entry-error transient-notice"
						>
							{error}
						</p>
					)}

					<button
						className="primary-button wide"
						type="submit"
						disabled={busy}
					>
						{busy
							? 'Please wait…'
							: role === 'participant'
								? 'Start / Continue'
								: role === 'administrator'
									? 'Administrator sign in'
									: mode === 'register'
										? 'Create account'
										: 'Researcher log in'}{' '}
						<ArrowRight size={16} />
					</button>
				</form>

				{role === 'participant' && (
					<p className="auth-code-note">
						Entering the same code again resumes your session where
						you left off.
					</p>
				)}
				{role === 'researcher' && (
					<p className="auth-foot">
						{mode === 'register' ? (
							<>
								Already have an account?{' '}
								<button
									type="button"
									className="consent-clear"
									onClick={() => setMode('signin')}
								>
									Sign in
								</button>
							</>
						) : (
							<>
								New researcher?{' '}
								<button
									type="button"
									className="consent-clear"
									onClick={() =>
										onRegister
											? onRegister()
											: setMode('register')
									}
								>
									<UserPlus size={12} /> Create an account
								</button>
							</>
						)}
					</p>
				)}
				{role === 'administrator' && (
					<p className="auth-foot">
						Administrator accounts are promoted by an existing
						administrator.
					</p>
				)}
			</div>
		</div>
	)
}
