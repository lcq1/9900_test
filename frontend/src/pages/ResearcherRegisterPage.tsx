import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Check, Clock } from 'lucide-react'
import * as auth from '../api/auth'

export interface ResearcherRegisterPageProps {
	onRegistered?: (researcher: auth.Researcher) => void
	onBack?: () => void
}

export function ResearcherRegisterPage({ onRegistered, onBack }: ResearcherRegisterPageProps) {
	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [confirm, setConfirm] = useState('')
	const [showPasswords, setShowPasswords] = useState(false)
	const [error, setError] = useState('')
	const [done, setDone] = useState<auth.Researcher | null>(null)
	const [busy, setBusy] = useState(false)
	const [policy, setPolicy] = useState<auth.RegistrationPolicy | null>(null)
	const [policyError, setPolicyError] = useState('')
	const [retry, setRetry] = useState(0)

	useEffect(() => {
		let current = true
		auth.getRegistrationPolicy().then(value => {
			if (current) setPolicy(value)
		}).catch(() => {
			if (current) setPolicyError('Cannot check registration availability. Check your connection and try again.')
		})
		return () => { current = false }
	}, [retry])

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		if (busy || !policy?.allowSelfRegistration) return
		setError('')
		if (!name.trim() || !email.trim() || !password) {
			setError('All fields are required.')
			return
		}
		if (password.length < 6) {
			setError('Password must be at least 6 characters.')
			return
		}
		if (new TextEncoder().encode(password).length > 72) {
			setError('Password must be no more than 72 UTF-8 bytes. Non-English characters can use more than one byte.')
			return
		}
		if (password !== confirm) {
			setError('Passwords do not match.')
			return
		}
		setBusy(true)
		try {
			const researcher = await auth.registerResearcher({ name: name.trim(), email: email.trim(), password })
			setPassword('')
			setConfirm('')
			setDone(researcher)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
		} finally {
			setBusy(false)
		}
	}

	if (done) {
		const pending = done.accountStatus === 'pending'
		return <section className="page registration-page"><div className="register-done" role="status">
			<span className="register-done-icon">{pending ? <Clock size={28} /> : <Check size={28} />}</span>
			<h1>{pending ? 'Account awaiting approval' : 'Your researcher account is ready'}</h1>
			<p className="subheading">Your account for {done.email} has been created.</p>
			<p>{pending ? 'An administrator must approve your account before you can sign in. Contact your platform administrator for approval.' : 'Sign in with your email and password to create and manage experiments.'}</p>
			<button className="primary-button" onClick={() => onRegistered ? onRegistered(done) : onBack?.()}>
				Return to researcher sign in
			</button>
		</div></section>
	}

	return <section className="page registration-page">
		<button type="button" className="back-link" onClick={() => onBack?.()}><ArrowLeft size={16} /> Back to sign in</button>
		<div className="register-card">
			<p className="eyebrow">RESEARCHER SIGN-UP</p>
			<h1>Create your researcher account</h1>
			<p className="subheading">Create and manage experiments, invite participants and review your study results.</p>
			{policyError ? <div role="alert">
				<p className="entry-error">{policyError}</p>
				<button type="button" className="secondary-button" onClick={() => { setPolicyError(''); setRetry(value => value + 1) }}>Retry availability check</button>
			</div> : !policy ? <p role="status">Checking registration availability…</p>
				: !policy.allowSelfRegistration ? <div role="status">
					<h2>Registration is currently closed</h2>
					<p>Please contact the platform administrator to request a researcher account. Existing accounts can still sign in.</p>
				</div> : <>
				{policy.requireResearcherApproval && <p role="note">New accounts require administrator approval before sign-in.</p>}
				{policy.emailRestricted && <p role="note">Registration is limited to email addresses approved by this platform. Contact the administrator if your address is not accepted.</p>}
				<form onSubmit={submit}>
					<label className="entry-label">Full name
						<input value={name} onChange={event => setName(event.target.value)} required maxLength={255} autoComplete="name" placeholder="Jane Researcher" disabled={busy} />
					</label>
					<label className="entry-label">Email address
						<input type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={255} autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@university.edu" disabled={busy} />
					</label>
					<label className="entry-label">Password
						<input type={showPasswords ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} required minLength={6} autoComplete="new-password" placeholder="At least 6 characters" disabled={busy} aria-describedby="registration-password-help" />
					</label>
					<p id="registration-password-help">Use at least 6 characters and no more than 72 UTF-8 bytes.</p>
					<label className="entry-label">Confirm password
						<input type={showPasswords ? "text" : "password"} value={confirm} onChange={event => setConfirm(event.target.value)} required autoComplete="new-password" placeholder="Re-enter password" disabled={busy} />
					</label>
					<label className="password-visibility"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} /> Show passwords</label>
					{error && <p className="entry-error" role="alert">{error}</p>}
					<button className="primary-button entry-button" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
				</form>
			</>}
		</div>
	</section>
}
