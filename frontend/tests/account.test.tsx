import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AccountPage } from '../src/pages/AccountPage'
import { getSession, setSession } from '../src/auth/sessionStore'
import * as auth from '../src/api/auth'

vi.mock('../src/api/auth', () => ({ getProfile: vi.fn(), updateProfile: vi.fn(), changePassword: vi.fn(), signOut: vi.fn() }))
const me = { id:'alice', name:'Alice Researcher', email:'alice@example.com', role:'researcher' as const, accountStatus:'active' as const, createdAt:'2026-11-05T00:00:00Z' }
beforeEach(() => {
 vi.resetAllMocks()
 localStorage.clear()
 setSession({ token:'old', researcher:me, issuedAt:'2026-11-05' })
 vi.mocked(auth.getProfile).mockResolvedValue(me)
})
afterEach(cleanup)
const mount = () => render(<MemoryRouter><AccountPage /></MemoryRouter>)

it('saves the name to the server and refreshes the current session identity', async () => {
 vi.mocked(auth.updateProfile).mockResolvedValue({ ...me, name:'Alice Updated' })
 mount()
 await waitFor(() => expect(auth.getProfile).toHaveBeenCalledOnce())
 fireEvent.change(screen.getByLabelText('Full name'), { target:{ value:'Alice Updated' } })
 fireEvent.click(screen.getByRole('button', { name:'Save personal details' }))
 await screen.findByText('Your name has been saved across the platform.')
 expect(auth.updateProfile).toHaveBeenCalledWith('Alice Updated')
 expect(getSession()?.researcher.name).toBe('Alice Updated')
 expect((screen.getByLabelText('Email address') as HTMLInputElement).readOnly).toBe(true)
})

it('does not replace a name edit with a slower initial profile response', async () => {
 let resolve!: (value: auth.Researcher) => void
 vi.mocked(auth.getProfile).mockReturnValue(new Promise(result => { resolve=result }))
 mount()
 fireEvent.change(screen.getByLabelText('Full name'), { target:{ value:'Editing my name' } })
 resolve(me)
 await waitFor(() => expect(auth.getProfile).toHaveBeenCalledOnce())
 expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe('Editing my name')
})

it('validates password confirmation, replaces the token and clears secret inputs', async () => {
 vi.mocked(auth.changePassword).mockResolvedValue({ token:'renewed', researcher:me, issuedAt:'2026-11-05' })
 mount()
 fireEvent.change(screen.getByLabelText('Current password'), { target:{ value:'current-password' } })
 fireEvent.change(screen.getByLabelText('New password'), { target:{ value:'new-password' } })
 fireEvent.change(screen.getByLabelText('Confirm new password'), { target:{ value:'wrong-password' } })
 fireEvent.click(screen.getByRole('button', { name:'Update password' }))
 expect(screen.getByRole('alert').textContent).toContain('do not match')
 expect(auth.changePassword).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('Confirm new password'), { target:{ value:'new-password' } })
 fireEvent.click(screen.getByRole('checkbox', { name:'Show passwords' }))
 expect((screen.getByLabelText('New password') as HTMLInputElement).type).toBe('text')
 fireEvent.click(screen.getByRole('button', { name:'Update password' }))
 await screen.findByText('Password updated. Other signed-in sessions have been signed out.')
 expect(getSession()?.token).toBe('renewed')
 expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('')
 expect((screen.getByLabelText('New password') as HTMLInputElement).type).toBe('password')
})
