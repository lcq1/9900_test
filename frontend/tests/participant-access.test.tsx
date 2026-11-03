import { afterEach, expect, it, vi } from 'vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { ParticipantAccessPage } from '../src/pages/ParticipantPage'
import { http } from '../src/api/http'
import {
	clear,
	getParticipantToken,
	getSession,
	setSession,
} from '../src/auth/sessionStore'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
vi.mock('../src/api/http', () => ({ http: { post: vi.fn() } }))
vi.mock('../src/participant/StageRenderer', () => ({
	ParticipantPreview: ({
		participantCode,
		onComplete,
		onBack,
	}: {
		participantCode: string
		onComplete: () => void
		onBack: () => void
	}) => (
		<div>
			Study for {participantCode}
			<button onClick={onComplete}>Complete study</button>
			<button onClick={onBack}>Abort study</button>
		</div>
	),
}))
afterEach(() => {
	cleanup()
	clear()
	sessionStorage.clear()
	vi.restoreAllMocks()
	vi.resetAllMocks()
	vi.unstubAllGlobals()
	Reflect.deleteProperty(document, 'fullscreenElement')
	Reflect.deleteProperty(document, 'exitFullscreen')
	Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
})
it('welcomes participants before starting without a researcher session or experiment list', async () => {
	vi.mocked(http.post).mockResolvedValue({
		token: 'participant-token',
		experiment: { code: 'EXP1' },
	})
	render(
		<ParticipantAccessPage
			initialExperimentCode=" EXP1 "
			initialParticipantCode=" P01 "
			onBack={() => {}}
		/>,
	)
	expect(
		await screen.findByRole('heading', { name: 'Welcome to the study' }),
	).toBeTruthy()
	expect(screen.queryByText('Study for P01')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Start experiment' }))
	expect(await screen.findByText('Study for P01')).toBeTruthy()
	expect(http.post).toHaveBeenCalledWith('/participant/access', {
		experimentCode: 'EXP1',
		participantCode: 'P01',
	})
	expect(getParticipantToken()).toBe('participant-token')
})
it('shows backend entry errors and allows corrected codes to be submitted', async () => {
	vi.mocked(http.post).mockRejectedValueOnce(
		new Error('Experiment is not open for participation'),
	)
	render(
		<ParticipantAccessPage
			initialExperimentCode="DRAFT"
			initialParticipantCode="P01"
			onBack={() => {}}
		/>,
	)
	expect(await screen.findByRole('alert')).toBeTruthy()
	await waitFor(() =>
		expect(
			screen.getByRole('button', { name: 'Begin experiment' }),
		).toBeTruthy(),
	)
	expect(getParticipantToken()).toBeNull()
	fireEvent.change(screen.getByLabelText('Experiment code'), {
		target: { value: 'LIVE' },
	})
	vi.mocked(http.post).mockResolvedValue({
		token: 'valid',
		experiment: { code: 'LIVE' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Begin experiment' }))
	await screen.findByRole('heading', { name: 'Welcome to the study' })
	fireEvent.click(screen.getByRole('button', { name: 'Start experiment' }))
	expect(await screen.findByText('Study for P01')).toBeTruthy()
})

it('shows thanks after completion and clears access before returning to sign in', async () => {
	vi.mocked(http.post).mockResolvedValue({
		token: 'participant-token',
		experiment: { code: 'EXP1', name: 'Design study' },
	})
	const back = vi.fn()
	render(
		<ParticipantAccessPage
			initialExperimentCode="EXP1"
			initialParticipantCode="P01"
			onBack={back}
		/>,
	)
	await screen.findByRole('heading', { name: 'Welcome to the study' })
	fireEvent.click(screen.getByRole('button', { name: 'Start experiment' }))
	fireEvent.click(
		await screen.findByRole('button', { name: 'Complete study' }),
	)
	expect(screen.getByRole('heading', { name: 'Thank you!' })).toBeTruthy()
	expect(screen.getByText(/Your responses have been saved/)).toBeTruthy()
	expect(screen.queryByText('Study for P01')).toBeNull()
	expect(getParticipantToken()).toBeNull()
	expect(back).not.toHaveBeenCalled()
	fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
	expect(back).toHaveBeenCalledOnce()
})

it('exits an aborted study without showing thanks', async () => {
	vi.mocked(http.post).mockResolvedValue({
		token: 'participant-token',
		experiment: { code: 'EXP1' },
	})
	const back = vi.fn()
	render(
		<ParticipantAccessPage
			initialExperimentCode="EXP1"
			initialParticipantCode="P01"
			onBack={back}
		/>,
	)
	await screen.findByRole('heading', { name: 'Welcome to the study' })
	fireEvent.click(screen.getByRole('button', { name: 'Start experiment' }))
	fireEvent.click(await screen.findByRole('button', { name: 'Abort study' }))
	expect(back).toHaveBeenCalledOnce()
	expect(screen.queryByRole('heading', { name: 'Thank you!' })).toBeNull()
	expect(getParticipantToken()).toBeNull()
})

it.each(['complete', 'abort', 'unmount'])(
	'enters configured fullscreen and releases it on %s',
	async (action) => {
		let fullscreen: Element | null = null
		Object.defineProperty(document, 'fullscreenElement', {
			configurable: true,
			get: () => fullscreen,
		})
		const request = vi.fn().mockImplementation(async () => {
			fullscreen = document.documentElement
		})
		const exit = vi.fn().mockImplementation(async () => {
			fullscreen = null
		})
		Object.defineProperty(document.documentElement, 'requestFullscreen', {
			configurable: true,
			value: request,
		})
		Object.defineProperty(document, 'exitFullscreen', {
			configurable: true,
			value: exit,
		})
		vi.mocked(http.post).mockResolvedValue({
			token: 'token',
			experiment: { code: 'EXP1', fullScreen: true },
		})
		const { unmount } = render(
			<ParticipantAccessPage
				initialExperimentCode="EXP1"
				initialParticipantCode="P01"
				onBack={vi.fn()}
			/>,
		)
		await screen.findByRole('heading', { name: 'Welcome to the study' })
		expect(request).not.toHaveBeenCalled()
		fireEvent.click(
			screen.getByRole('button', { name: 'Start experiment' }),
		)
		await screen.findByText('Study for P01')
		expect(request).toHaveBeenCalledOnce()
		if (action === 'unmount') unmount()
		else
			fireEvent.click(
				screen.getByRole('button', {
					name:
						action === 'complete'
							? 'Complete study'
							: 'Abort study',
				}),
			)
		expect(exit).toHaveBeenCalledOnce()
	},
)

it('keeps the welcome page when fullscreen is denied and allows retry', async () => {
	let fullscreen: Element | null = null
	Object.defineProperty(document, 'fullscreenElement', {
		configurable: true,
		get: () => fullscreen,
	})
	const request = vi
		.fn()
		.mockRejectedValueOnce(new Error('denied'))
		.mockImplementation(async () => {
			fullscreen = document.documentElement
		})
	Object.defineProperty(document.documentElement, 'requestFullscreen', {
		configurable: true,
		value: request,
	})
	vi.mocked(http.post).mockResolvedValue({
		token: 'token',
		experiment: { code: 'EXP1', fullScreen: true },
	})
	render(
		<ParticipantAccessPage
			initialExperimentCode="EXP1"
			initialParticipantCode="P01"
			onBack={vi.fn()}
		/>,
	)
	fireEvent.click(
		await screen.findByRole('button', { name: 'Start experiment' }),
	)
	await screen.findByRole('alert')
	expect(screen.queryByText('Study for P01')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Start experiment' }))
	await screen.findByText('Study for P01')
})

it.each([false, true])(
	'respects fullscreen configuration when the API is unavailable: %s',
	async (fullScreen) => {
		Object.defineProperty(document.documentElement, 'requestFullscreen', {
			configurable: true,
			value: undefined,
		})
		vi.mocked(http.post).mockResolvedValue({
			token: 'token',
			experiment: { code: 'EXP1', fullScreen },
		})
		render(
			<ParticipantAccessPage
				initialExperimentCode="EXP1"
				initialParticipantCode="P01"
				onBack={vi.fn()}
			/>,
		)
		fireEvent.click(
			await screen.findByRole('button', { name: 'Start experiment' }),
		)
		if (fullScreen) {
			await screen.findByRole('alert')
			expect(screen.queryByText('Study for P01')).toBeNull()
		} else expect(await screen.findByText('Study for P01')).toBeTruthy()
	},
)

it('starts once per request ID, retries failures and uses the returned snapshot', async () => {
	vi.mocked(http.post)
		.mockResolvedValueOnce({
			token: 'token',
			experiment: { code: 'EXP1', name: 'Welcome version' },
		})
		.mockRejectedValueOnce(new Error('Start unavailable'))
		.mockResolvedValueOnce({
			sessionId: 'bound-session',
			experiment: {
				code: 'EXP1',
				name: 'Published snapshot',
				fullScreen: false,
			},
		})
	render(
		<ParticipantAccessPage
			initialExperimentCode="EXP1"
			initialParticipantCode="P01"
			onBack={vi.fn()}
		/>,
	)
	await screen.findByRole('heading', { name: 'Welcome to the study' })
	expect(http.post).toHaveBeenCalledTimes(1)
	fireEvent.click(screen.getByRole('button', { name: 'Start experiment' }))
	expect(await screen.findByRole('alert')).toHaveProperty(
		'textContent',
		'Start unavailable',
	)
	expect(screen.queryByText('Study for P01')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Start experiment' }))
	await screen.findByText('Study for P01')
	expect(vi.mocked(http.post).mock.calls[1]).toEqual(
		vi.mocked(http.post).mock.calls[2],
	)
	expect(vi.mocked(http.post).mock.calls[1][0]).toBe(
		'/participant/sessions/start',
	)
})

it.each(['researcher', 'administrator'] as const)(
	'returns to login after thanks despite a retained %s session',
	async (role) => {
		setSession({
			token: 'retained-token',
			issuedAt: '2026-11-03T00:00:00Z',
			researcher: {
				id: 'retained',
				name: 'Researcher',
				email: 'retained@example.com',
				role,
				createdAt: '2026-11-03T00:00:00Z',
			},
		})
		vi.mocked(http.post).mockResolvedValue({
			token: 'participant-token',
			sessionId: 'bound-session',
			experiment: { code: 'EXP1', name: 'Study', fullScreen: false },
		})
		render(
			<MemoryRouter
				initialEntries={[
					{
						pathname: '/participant',
						state: {
							experimentCode: 'EXP1',
							participantCode: 'P01',
						},
					},
				]}
			>
				<App />
			</MemoryRouter>,
		)
		await screen.findByRole('heading', { name: 'Welcome to the study' })
		fireEvent.click(
			screen.getByRole('button', { name: 'Start experiment' }),
		)
		fireEvent.click(
			await screen.findByRole('button', { name: 'Complete study' }),
		)
		expect(screen.getByRole('heading', { name: 'Thank you!' })).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
		expect(await screen.findByLabelText('Experiment code')).toBeTruthy()
		expect(
			screen.getByRole('button', { name: 'Researcher', exact: true }),
		).toBeTruthy()
		expect(getSession()).toBeNull()
		expect(getParticipantToken()).toBeNull()
	},
)
