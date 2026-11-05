import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { ParticipantPreview } from '../src/participant/StageRenderer'
import {
	EventQueue,
	type ParticipantEvent,
} from '../src/participant/EventQueue'
import { submitSession } from '../src/api/participant'
import { createStage, type Experiment } from '../src/types'
import type { RuntimeProgress } from '../src/participant/ProgressStore'

vi.mock('../src/api/participant', async (original) => ({
	...(await original<typeof import('../src/api/participant')>()),
	submitSession: vi.fn(),
	submitStage: vi.fn().mockResolvedValue({ accepted: true }),
	uploadRecording: vi.fn().mockResolvedValue(undefined),
	listSessions: vi.fn().mockResolvedValue([]),
	getAIConfig: vi.fn(),
	streamChat: vi.fn(),
}))

function study(): Experiment {
	const stage = createStage('short_answer')
	stage.features = {
		...stage.features,
		timer: false,
		clock: false,
		screenRecording: false,
		pauseAbort: true,
		copyPaste: false,
	}
	return {
		id: 'study',
		code: 'STUDY-123',
		name: 'Design study',
		status: 'Live',
		created: '',
		fullScreen: false,
		stages: [stage],
	}
}

function event(
	seq: number,
	overrides: Partial<ParticipantEvent> = {},
): ParticipantEvent {
	return {
		seq,
		type: 'answer',
		timestamp: '2026-11-03T01:00:00Z',
		epochMs: 1793667600000 + seq,
		perfMs: 0,
		...overrides,
	}
}

function checkpoint(
	sessionId: string,
	answers: Record<string, string | string[]>,
	updatedAt: number,
): RuntimeProgress {
	return {
		sessionId,
		updatedAt,
		stageIndex: 0,
		answers,
		consentedStageId: null,
		attachments: {},
		extended: {},
		oralIndex: 0,
		oralStarted: false,
		deadlines: {},
	}
}

beforeEach(() => {
	localStorage.clear()
	sessionStorage.clear()
	vi.clearAllMocks()
	vi.mocked(submitSession).mockResolvedValue({} as never)
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe('resumed session integrity', () => {
	it('merges server and local events instead of replacing by max seq', () => {
		localStorage.setItem(
			'p13-events:merge-session',
			JSON.stringify({
				events: [
					event(20, {
						type: 'answer',
						detail: { componentId: 'q2', value: 'answer-two' },
					}),
				],
				seq: 21,
			}),
		)
		const server = [
			event(10, { type: 'stage_view', detail: { stageName: 'Task' } }),
			event(11, {
				type: 'answer',
				detail: { componentId: 'q1', value: 'answer-one' },
			}),
		]
		const queue = new EventQueue('merge-session', server)
		expect(queue.all().map((item) => item.seq)).toEqual([10, 11, 20])
		expect(queue.all().some((item) => item.detail?.componentId === 'q2')).toBe(
			true,
		)
		expect(queue.record('navigation').seq).toBe(21)
	})

	it('submits every collected answer on abort after a resume', async () => {
		const experiment = study()
		const stage = experiment.stages[0]
		const sessionId = 'b3-session'
		const localProgress = checkpoint(
			sessionId,
			{ q1: 'answer-one', q2: 'answer-two' },
			200,
		)
		localStorage.setItem(
			'p13-runtime:' + sessionId,
			JSON.stringify(localProgress),
		)
		localStorage.setItem(
			'p13-events:' + sessionId,
			JSON.stringify({
				events: [
					event(20, {
						stageId: stage.id,
						detail: { componentId: 'q2', value: 'answer-two' },
					}),
				],
				seq: 21,
			}),
		)
		const serverEvents = [
			event(10, {
				type: 'stage_view',
				stageId: stage.id,
				detail: { stageName: stage.name },
			}),
			event(11, {
				stageId: stage.id,
				detail: { componentId: 'q1', value: 'answer-one' },
			}),
		]
		render(
			<ParticipantPreview
				initialSessionId={sessionId}
				initialProgress={checkpoint(
					sessionId,
					{ q1: 'answer-one' },
					100,
				)}
				initialEvents={serverEvents}
				experiment={experiment}
				participantCode="B3-P01"
				onBack={() => {}}
			/>,
		)
		fireEvent.click(screen.getByRole('button', { name: /Back to sign in/i }))
		await waitFor(() => expect(submitSession).toHaveBeenCalled())
		const payload = vi.mocked(submitSession).mock.calls.at(-1)![0]
		const values = Object.fromEntries(
			payload.answers.map((answer) => [answer.componentId, answer.value]),
		)
		expect(values.q1).toBe('answer-one')
		expect(values.q2).toBe('answer-two')
		expect(payload.finishedAt).toBeNull()
	})

	it('restores answers from the event timeline when the local checkpoint is compact', async () => {
		const experiment = study()
		const stage = experiment.stages[0]
		const sessionId = 'b3-compact'
		const large = 'data:image/png;base64,' + 'A'.repeat(9000)
		const serverEvents = [
			event(0, {
				stageId: stage.id,
				detail: { componentId: 'signature', value: large },
			}),
		]
		render(
			<ParticipantPreview
				initialSessionId={sessionId}
				initialProgress={checkpoint(sessionId, {}, 100)}
				initialEvents={serverEvents}
				experiment={experiment}
				participantCode="B3-P02"
				onBack={() => {}}
			/>,
		)
		fireEvent.click(screen.getByRole('button', { name: /Back to sign in/i }))
		await waitFor(() => expect(submitSession).toHaveBeenCalled())
		const payload = vi.mocked(submitSession).mock.calls.at(-1)![0]
		expect(
			payload.answers.find((answer) => answer.componentId === 'signature')
				?.value,
		).toBe(large)
	})
})

it('restores a paused countdown without consuming time while the page was closed', () => {
	const experiment = study()
	const stage = experiment.stages[0]
	stage.features.timer = true
	const sessionId = 'paused-session'
	const progress = {
		...checkpoint(sessionId, {}, Date.now() - 60000),
		paused: true,
		remainingSeconds: 120,
		deadlines: { [stage.id]: Date.now() - 60000 },
	}
	render(<ParticipantPreview experiment={experiment} participantCode="P01"
		initialSessionId={sessionId} initialProgress={progress} onBack={() => {}} />)
	expect(screen.getByText('Session paused')).toBeDefined()
	expect(Number(localStorage.getItem('p13-timer:' + sessionId + ':' + stage.id))).toBeGreaterThan(Date.now() + 118000)
})
