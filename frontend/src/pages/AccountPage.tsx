import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfile, updateProfile, changePassword, signOut } from '../api/auth'
import { clear, getSession, setSession, updateSessionResearcher, useSessionStore } from '../auth/sessionStore'

export function AccountPage() {
 const navigate = useNavigate()
 const me = useSessionStore(state => state.session?.researcher)
 const [name, setName] = useState(me?.name ?? '')
 const [currentPassword, setCurrentPassword] = useState('')
 const [newPassword, setNewPassword] = useState('')
 const [confirmation, setConfirmation] = useState('')
 const [showPasswords, setShowPasswords] = useState(false)
 const [savingName, setSavingName] = useState(false)
 const [savingPassword, setSavingPassword] = useState(false)
 const [profileError, setProfileError] = useState('')
 const [profileNotice, setProfileNotice] = useState('')
 const [passwordError, setPasswordError] = useState('')
 const [passwordNotice, setPasswordNotice] = useState('')
 const accountId = me?.id
 useEffect(() => {
  let active = true
  const originalName = getSession()?.researcher.name
  getProfile().then(profile => {
   if (active && getSession()?.researcher.id === profile.id) {
    updateSessionResearcher(profile)
    setName(current => current === originalName ? profile.name : current)
   }
  }).catch(() => { if (active) setProfileError('Could not refresh your account details. Please reload this page.') })
  return () => { active = false }
 }, [accountId])

 async function saveName(event: FormEvent) {
  event.preventDefault()
  if (savingName) return
  setProfileError(''); setProfileNotice('')
  if (!name.trim()) { setProfileError('Enter your full name.'); return }
  setSavingName(true)
  try {
   const profile = await updateProfile(name.trim())
   updateSessionResearcher(profile)
   setName(profile.name)
   setProfileNotice('Your name has been saved across the platform.')
  } catch (error) { setProfileError(error instanceof Error ? error.message : 'Could not save your name.') }
  finally { setSavingName(false) }
 }
 async function savePassword(event: FormEvent) {
  event.preventDefault()
  if (savingPassword) return
  setPasswordError(''); setPasswordNotice('')
  if (newPassword.length < 6 || new TextEncoder().encode(newPassword).length > 72) {
   setPasswordError('Use at least 6 characters and no more than 72 UTF-8 bytes.'); return
  }
  if (newPassword !== confirmation) { setPasswordError('New passwords do not match.'); return }
  if (currentPassword === newPassword) { setPasswordError('Choose a different new password.'); return }
  setSavingPassword(true)
  try {
   const session = await changePassword(currentPassword, newPassword)
   if (getSession()?.researcher.id === session.researcher.id) setSession(session)
   setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setShowPasswords(false)
   setPasswordNotice('Password updated. Other signed-in sessions have been signed out.')
  } catch (error) { setPasswordError(error instanceof Error ? error.message : 'Could not update your password.') }
  finally { setSavingPassword(false) }
 }
 if (!me) return null
 const joined = new Date(me.createdAt)
 return <div className="account-page">
  <div className="account-heading"><h1>Your account</h1><p>Manage your personal details and sign-in security.</p></div>
  <div className="account-grid">
   <section className="account-card">
    <h2>Personal details</h2>
    <form onSubmit={saveName}>
     <label>Full name<input value={name} onChange={event => setName(event.target.value)} required maxLength={255} autoComplete="name" disabled={savingName} /></label>
     <label>Email address<input type="email" value={me.email} readOnly autoComplete="email" /></label>
     <p className="account-hint">Your email is your sign-in address. Contact an administrator if it needs to change.</p>
     <dl className="account-details">
      <div><dt>Role</dt><dd>{me.role === 'administrator' ? 'Administrator' : 'Researcher'}</dd></div>
      <div><dt>Account status</dt><dd>{me.accountStatus ?? 'active'}</dd></div>
      <div><dt>Member since</dt><dd>{Number.isNaN(joined.getTime()) ? 'Unavailable' : joined.toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'})}</dd></div>
     </dl>
     {profileError && <p role="alert" className="entry-error">{profileError}</p>}
     {profileNotice && <p role="status" className="account-success">{profileNotice}</p>}
     <button type="submit" className="primary-button" disabled={savingName || name.trim() === me.name}>{savingName ? 'Saving…' : 'Save personal details'}</button>
    </form>
   </section>
   <section className="account-card">
    <h2>Change password</h2>
    <p className="account-hint">Confirm your current password. Updating it signs out your other sessions.</p>
    <form onSubmit={savePassword}>
     <label>Current password<input type={showPasswords ? 'text' : 'password'} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" required disabled={savingPassword} /></label>
     <label>New password<input type={showPasswords ? 'text' : 'password'} value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" minLength={6} required disabled={savingPassword} /></label>
     <label>Confirm new password<input type={showPasswords ? 'text' : 'password'} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" required disabled={savingPassword} /></label>
     <p className="account-hint">Use at least 6 characters and no more than 72 UTF-8 bytes.</p>
     <label className="password-visibility"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} /> Show passwords</label>
     {passwordError && <p role="alert" className="entry-error">{passwordError}</p>}
     {passwordNotice && <p role="status" className="account-success">{passwordNotice}</p>}
     <button type="submit" className="primary-button" disabled={savingPassword}>{savingPassword ? 'Updating…' : 'Update password'}</button>
    </form>
   </section>
   <section className="account-card account-shortcuts">
    <div><h2>Workspace and session</h2><p className="account-hint">Configure AI and storage in workspace settings, or return to your studies.</p></div>
    <div className="account-actions">
     <button type="button" className="secondary-button" onClick={() => navigate('/researcher/dashboard')}>My experiments</button>
     <button type="button" className="secondary-button" onClick={() => navigate('/researcher/settings')}>Workspace settings</button>
     <button type="button" className="secondary-button" onClick={async () => { await signOut().catch(() => undefined); clear(); navigate('/login', {replace:true}) }}>Sign out</button>
    </div>
   </section>
  </div>
 </div>
}
