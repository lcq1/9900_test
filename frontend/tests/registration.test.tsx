import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ResearcherRegisterPage } from '../src/pages/ResearcherRegisterPage'
import { AuthScreen } from '../src/pages/LoginPage'
import * as auth from '../src/api/auth'

vi.mock('../src/api/auth', () => ({ getRegistrationPolicy: vi.fn(), registerResearcher: vi.fn(), signIn: vi.fn() }))
const account = { id: 'new', name: 'New Researcher', email: 'new@example.com', role: 'researcher' as const, createdAt: '2026-11-05', accountStatus: 'active' as const }
const openPolicy = { allowSelfRegistration: true, requireResearcherApproval: false, emailRestricted: false }

async function fill(password = 'password123', confirm = password) {
 await screen.findByLabelText('Full name')
 fireEvent.change(screen.getByLabelText('Full name'), { target: { value: '  New Researcher  ' } })
 fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } })
 fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
 fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } })
 fireEvent.submit(screen.getByLabelText('Full name').closest('form')!)
}

describe('researcher registration', () => {
 beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(auth.getRegistrationPolicy).mockResolvedValue(openPolicy)
  vi.mocked(auth.registerResearcher).mockResolvedValue(account)
 })
 afterEach(cleanup)

 it('keeps success visible until the user chooses researcher sign-in', async () => {
  const completed = vi.fn()
  render(<ResearcherRegisterPage onRegistered={completed} />)
  await fill()
  await screen.findByRole('heading', { name: 'Your researcher account is ready' })
  expect(completed).not.toHaveBeenCalled()
  expect(auth.registerResearcher).toHaveBeenCalledWith({ name: 'New Researcher', email: account.email, password: 'password123' })
  fireEvent.click(screen.getByRole('button', { name: 'Return to researcher sign in' }))
  expect(completed).toHaveBeenCalledWith(account)
 })

 it('explains pending approval before and after registration', async () => {
  vi.mocked(auth.getRegistrationPolicy).mockResolvedValue({ ...openPolicy, requireResearcherApproval: true, emailRestricted: true })
  vi.mocked(auth.registerResearcher).mockResolvedValue({ ...account, accountStatus: 'pending' })
  render(<ResearcherRegisterPage />)
  await screen.findByText('New accounts require administrator approval before sign-in.')
  expect(screen.getByText(/Registration is limited to email addresses/)).toBeDefined()
  await fill()
  await screen.findByRole('heading', { name: 'Account awaiting approval' })
 })

 it('does not offer a form when administrators close registration', async () => {
  vi.mocked(auth.getRegistrationPolicy).mockResolvedValue({ ...openPolicy, allowSelfRegistration: false })
  render(<ResearcherRegisterPage />)
  await screen.findByRole('heading', { name: 'Registration is currently closed' })
  expect(screen.queryByLabelText('Password')).toBeNull()
  expect(auth.registerResearcher).not.toHaveBeenCalled()
 })

 it('offers retry after an availability check failure', async () => {
  vi.mocked(auth.getRegistrationPolicy).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(openPolicy)
  render(<ResearcherRegisterPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry availability check' }))
  await screen.findByLabelText('Full name')
  expect(auth.getRegistrationPolicy).toHaveBeenCalledTimes(2)
 })

 it('rejects mismatched and oversized UTF-8 passwords without creating an account', async () => {
  render(<ResearcherRegisterPage />)
  await fill('password123', 'different')
  expect(screen.getByRole('alert').textContent).toContain('Passwords do not match')
  await fill('中'.repeat(25))
  expect(screen.getByRole('alert').textContent).toContain('72 UTF-8 bytes')
  expect(auth.registerResearcher).not.toHaveBeenCalled()
 })

 it('keeps entered identity after a duplicate-email error', async () => {
  vi.mocked(auth.registerResearcher).mockRejectedValue(new Error('Email already registered'))
  render(<ResearcherRegisterPage />)
  await fill()
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Email already registered'))
  expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe(account.email)
 })

 it('returns the standalone registration flow to researcher login with its email', async () => {
  render(<AuthScreen onSignIn={vi.fn()} onParticipant={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Researcher', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
  await fill()
  fireEvent.click(await screen.findByRole('button', { name: 'Return to researcher sign in' }))
  expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe(account.email)
  expect(screen.getByRole('button', { name: 'Researcher log in' })).toBeDefined()
 })

 it('opens researcher login when routed back with the registered email', () => {
  render(<AuthScreen initialEmail={account.email} onSignIn={vi.fn()} onParticipant={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Researcher', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe(account.email)
 })
})
