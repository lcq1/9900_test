import { afterEach, expect, it, vi } from 'vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { createElement } from 'react'
import { ParticipantPreview } from '../src/participant/StageRenderer'
import { createStage, type Experiment } from '../src/types'
import { ExportDialog } from '../src/researcher/ExportDialog'
import { downloadResults } from '../src/api/experiments'
import { downloadAdminResults } from '../src/api/administrator'
import { downloadFile, http } from '../src/api/http'

vi.mock('../src/api/participant', () => ({
	submitSession: vi.fn().mockResolvedValue({ id: 'test-session' }),
	submitStage: vi.fn().mockResolvedValue({ accepted: true }),
	uploadRecording: vi.fn(),
}))
vi.mock('../src/api/http', () => ({
	http: {
		get: vi
			.fn()
			.mockRejectedValue(new Error('No clock in this isolated test')),
	},
	downloadFile: vi.fn(),
}))
vi.mock('../src/participant/ConsentView', () => ({
	ConsentView: ({ onConsent }: { onConsent: (signature: string) => void }) =>
		createElement(
			'button',
			{ onClick: () => onConsent('test-signature') },
			'Accept test consent',
		),
}))
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	localStorage.clear()
})

// This is a simulated workflow test, not real-browser or client-material acceptance.
it('requires consent before moving through pretest, task and posttest', async () => {
	class Recorder {
		state = 'inactive'
		onstop?: () => void
		start() {
			this.state = 'recording'
		}
		stop() {
			this.state = 'inactive'
			this.onstop?.()
		}
	}
	vi.stubGlobal('MediaRecorder', Recorder)
	vi.stubGlobal('navigator', {
		mediaDevices: {
			getDisplayMedia: async () => {
				const track = {
					readyState: 'live',
					getSettings: () => ({ displaySurface: 'monitor' }),
					stop: vi.fn(),
					addEventListener: vi.fn(),
				}
				return {
					getTracks: () => [track],
					getVideoTracks: () => [track],
				}
			},
		},
	})
	vi.spyOn(window, 'alert').mockImplementation(() => {})
	const stages = [
		createStage('consent'),
		createStage('short_answer'),
		createStage('short_answer'),
		createStage('short_answer'),
	]
	stages.forEach((stage, index) => {
		stage.name = ['Consent', 'Pretest', 'Task', 'Posttest'][index]
		stage.components = [
			{ id: `text-${index}`, type: 'text', label: stage.name },
		]
		stage.features.timer = false
		stage.features.confirm = false
	})
	const experiment: Experiment = {
		id: 'test',
		code: 'TEST',
		name: 'Sample only',
		status: 'Live',
		created: '',
		fullScreen: false,
		stages,
	}
	const done = vi.fn()
	render(
		createElement(ParticipantPreview, {
			experiment,
			participantCode: 'TESTER',
			onBack: done,
		}),
	)
	fireEvent.click(screen.getByRole('button', { name: /Next stage/ }))
	expect(
		(
			screen.getByRole('button', {
				name: /Next stage/,
			}) as HTMLButtonElement
		).disabled,
	).toBe(true)
	expect(screen.getByRole('heading', { name: 'Consent' })).toBeDefined()
	fireEvent.click(screen.getByRole('button', { name: 'Accept test consent' }))
	fireEvent.click(screen.getByRole('button', { name: /Next stage/ }))
	for (const name of ['Pretest', 'Task']) {
		await screen.findByRole('heading', { name })
		await screen.findByText('Recording', { exact: true })
		fireEvent.click(screen.getByRole('button', { name: /Next stage/ }))
	}
	await screen.findByRole('heading', { name: 'Posttest' })
	await screen.findByText('Recording', { exact: true })
	fireEvent.click(screen.getByRole('button', { name: 'Finish', exact: true }))
	await waitFor(() => expect(done).toHaveBeenCalledOnce())
})

it('downloads one workbook from each role and keeps legacy CSV helpers', async () => {
	const { downloadSessionWorkbook, downloadSessionCsv } =
		await vi.importActual<typeof import('../src/api/participant')>(
			'../src/api/participant',
		)
	vi.mocked(downloadFile).mockResolvedValue(undefined)
	await downloadResults('study')
	expect(downloadFile).toHaveBeenLastCalledWith(
		'/experiments/study/results.xlsx',
		'experiment.xlsx',
	)
	await downloadAdminResults('study')
	expect(downloadFile).toHaveBeenLastCalledWith(
		'/admin/experiments/study/results.xlsx',
		'experiment.xlsx',
	)
	await downloadSessionWorkbook('session')
	expect(downloadFile).toHaveBeenLastCalledWith(
		'/participant/sessions/session/xlsx',
		'experiment.xlsx',
	)
	await downloadSessionCsv('session', 'activity')
	expect(downloadFile).toHaveBeenLastCalledWith(
		'/participant/sessions/session/csv?view=activity',
		'session_activity.csv',
	)
})

it('offers one Excel download and reports failures', async () => {
	vi.mocked(http.get).mockResolvedValue({
		completed_count: 1,
		incomplete_count: 1,
	})
	vi.mocked(downloadFile).mockReset().mockResolvedValue(undefined)
	const experiment: Experiment = {
		id: 'study',
		code: 'S',
		name: 'Study',
		stages: [],
		status: 'Live',
		created: '',
		fullScreen: false,
	}
	render(createElement(ExportDialog, { experiment, onClose: vi.fn() }))
	await screen.findByText(/Completed: 1/)
	expect(screen.getByText(/Australia\/Sydney/)).toBeDefined()
	expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }))
	await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1))
	expect(downloadFile).toHaveBeenLastCalledWith(
		'/experiments/study/results.xlsx',
		'experiment.xlsx',
	)
	await waitFor(() =>
		expect(
			(
				screen.getByRole('button', {
					name: 'Download Excel',
				}) as HTMLButtonElement
			).disabled,
		).toBe(false),
	)
	let rejectDownload!: (reason: Error) => void
	vi.mocked(downloadFile).mockImplementationOnce(
		() =>
			new Promise((_, reject) => {
				rejectDownload = reject
			}),
	)
	fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }))
	expect(
		(
			screen.getByRole('button', {
				name: 'Downloading…',
			}) as HTMLButtonElement
		).disabled,
	).toBe(true)
	rejectDownload(new Error('Download unavailable'))
	expect(await screen.findByRole('alert')).toHaveProperty(
		'textContent',
		'Download unavailable',
	)
})
