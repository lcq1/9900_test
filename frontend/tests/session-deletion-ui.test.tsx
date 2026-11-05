import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeleteSessionDialog } from '../src/researcher/DeleteSessionDialog'
import { deleteParticipantSession } from '../src/api/participant'
vi.mock('../src/api/participant', () => ({ deleteParticipantSession: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const session = { id: 'selected-session', participantCode: 'P02', experimentCode: 'DEMO-B' }

describe('participant record deletion confirmation', () => {
    it('sends no delete on cancel and deletes only the selected session after explicit confirmation', async () => {
        const cancel = vi.fn(), deleted = vi.fn()
        vi.mocked(deleteParticipantSession).mockResolvedValue({ deleted: true })
        const view = render(<DeleteSessionDialog session={session} onCancel={cancel} onDeleted={deleted} />)
        expect(deleteParticipantSession).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
        expect(cancel).toHaveBeenCalledOnce()
        expect(deleteParticipantSession).not.toHaveBeenCalled()
        view.rerender(<DeleteSessionDialog session={session} onCancel={cancel} onDeleted={deleted} />)
        fireEvent.click(screen.getByRole('button', { name: 'Delete this record', exact: true }))
        await waitFor(() => expect(deleted).toHaveBeenCalledWith('selected-session'))
        expect(deleteParticipantSession).toHaveBeenCalledExactlyOnceWith('selected-session')
    })
    it('keeps the dialog and record visible when the server rejects a revoked permission', async () => {
        vi.mocked(deleteParticipantSession).mockRejectedValue(new Error('Deletion permission was revoked'))
        const deleted = vi.fn()
        render(<DeleteSessionDialog session={session} onCancel={() => {}} onDeleted={deleted} />)
        fireEvent.click(screen.getByRole('button', { name: 'Delete this record', exact: true }))
        await screen.findByText('Deletion permission was revoked')
        expect(deleted).not.toHaveBeenCalled()
        expect(screen.getByText('P02')).toBeTruthy()
    })
})
