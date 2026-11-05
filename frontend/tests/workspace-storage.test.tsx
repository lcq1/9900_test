import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getStorageSettings, saveStorageSettings } from '../src/api/experiments'

vi.mock('../src/api/experiments', async (original) => ({
	...(await original<typeof import('../src/api/experiments')>()),
	getStorageSettings: vi.fn(),
	saveStorageSettings: vi.fn(),
	getExperimentAIKey: vi.fn().mockRejectedValue(new Error('no AI key')),
	saveExperimentAIKey: vi.fn(),
	removeExperimentAIKey: vi.fn(),
	setExperimentAISource: vi.fn(),
}))

vi.mock('../src/api/administrator', async (original) => ({
	...(await original<typeof import('../src/api/administrator')>()),
	getWorkspaceMembers: vi.fn().mockResolvedValue([]),
	getWorkspaceSettings: vi.fn().mockResolvedValue(null),
}))

describe('workspace storage location', () => {
	beforeEach(() => {
		localStorage.clear()
		vi.clearAllMocks()
		vi.mocked(getStorageSettings).mockResolvedValue({
			location: 'legacy',
			locations: ['legacy', 'onedrive'],
		})
	})

	afterEach(cleanup)

	it('shows the current location and saves a new one', async () => {
		const { StorageLocationCard } = await import(
			'../src/pages/ResearcherDashboardPage'
		)
		vi.mocked(saveStorageSettings).mockResolvedValue({
			location: 'onedrive',
			locations: ['legacy', 'onedrive'],
		})
		render(<StorageLocationCard />)

		const select = (await screen.findByLabelText(
			'Storage location',
		)) as HTMLSelectElement
		await waitFor(() => expect(select.value).toBe('legacy'))
		expect(select.disabled).toBe(false)

		fireEvent.change(select, { target: { value: 'onedrive' } })

		await waitFor(() =>
			expect(saveStorageSettings).toHaveBeenCalledWith('onedrive'),
		)
		const confirmation = await screen.findByRole('status')
		expect(confirmation.textContent).toContain('onedrive')
		expect(
			screen.queryByRole('alert'),
			'a successful save must not report a failure',
		).toBeNull()
	})

	it('reports a rejected location instead of pretending it was saved', async () => {
		const { StorageLocationCard } = await import(
			'../src/pages/ResearcherDashboardPage'
		)
		vi.mocked(saveStorageSettings).mockRejectedValue(
			new Error('Storage location is not writable or has insufficient space'),
		)
		render(<StorageLocationCard />)

		const select = (await screen.findByLabelText(
			'Storage location',
		)) as HTMLSelectElement
		await waitFor(() => expect(select.value).toBe('legacy'))

		fireEvent.change(select, { target: { value: 'onedrive' } })

		const failure = await screen.findByRole('alert')
		expect(failure.textContent).toContain('not writable')
		expect(screen.queryByRole('status')).toBeNull()
		// The select keeps showing the server state, so the UI cannot drift.
		await waitFor(() => expect(select.value).toBe('legacy'))
	})

	it('reports a failed initial load without offering a broken selector', async () => {
		const { StorageLocationCard } = await import(
			'../src/pages/ResearcherDashboardPage'
		)
		vi.mocked(getStorageSettings).mockRejectedValue(new Error('offline'))
		render(<StorageLocationCard />)

		expect((await screen.findByRole('alert')).textContent).toContain(
			'Could not load',
		)
		expect(
			(screen.getByLabelText('Storage location') as HTMLSelectElement)
				.disabled,
		).toBe(true)
	})

	it('renders the selector inside the workspace settings page', async () => {
		const { WorkspaceSettingsPage } = await import(
			'../src/pages/ResearcherDashboardPage'
		)
		render(
			<WorkspaceSettingsPage
				experiments={[]}
				onClearAll={() => {}}
			/>,
		)

		expect(
			await screen.findByRole('heading', { name: 'Storage' }),
		).toBeDefined()
		expect(await screen.findByLabelText('Storage location')).toBeDefined()
	})
})
