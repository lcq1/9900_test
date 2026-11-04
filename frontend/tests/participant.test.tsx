import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { ParticipantPreview } from "../src/participant/StageRenderer";
import {
	submitSession,
	submitStage,
	uploadRecording,
	listSessions,
	getAIConfig,
	streamChat,
	LlmCallError,
} from '../src/api/participant'
import { createStage, type Experiment, type Stage } from "../src/types";
import { AIChat } from "../src/participant/AIChat";
import {
	useTimerController,
	useTransientNotice,
} from '../src/participant/TimerController'

vi.mock('../src/api/participant', async (original) => ({
	...(await original<typeof import('../src/api/participant')>()),
	submitSession: vi.fn(),
	listSessions: vi.fn().mockResolvedValue([]),
	uploadRecording: vi.fn().mockResolvedValue(undefined),
	submitStage: vi.fn().mockResolvedValue({ accepted: true }),
	getAIConfig: vi.fn(),
	streamChat: vi.fn(),
}))

describe('participant runtime', () => {
	beforeEach(() => {
		localStorage.clear()
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
		vi.clearAllMocks()
		vi.mocked(submitSession).mockResolvedValue({} as never)
	})

	afterEach(() => {
		cleanup()
		if (vi.isMockFunction(window.scrollTo)) vi.mocked(window.scrollTo).mockRestore()
	})

	it('allows choosing stage order while preserving answers and checking skipped required questions', async () => {
		const experiment = study()
		const first = experiment.stages[0]
		first.name = 'First task'
		first.features.navigation = true
		const second = createStage('short_answer')
		second.name = 'Second task'
		second.features.timer = false
		second.features.screenRecording = false
		experiment.stages = [first, second]
		render(<ParticipantPreview experiment={experiment} participantCode="PREVIEW-ORDER" previewOnly onBack={() => {}} />)
		fireEvent.change(screen.getByRole('combobox', { name: 'Go to stage' }), { target: { value: '1' } })
		await screen.findByText('Step 2 · Second task')
		fireEvent.change(screen.getByPlaceholderText('Type your response...'), { target: { value: 'Second answer' } })
		fireEvent.click(screen.getByRole('button', { name: 'Finish', exact: true }))
		await screen.findByText(/Required: First task/)
		fireEvent.change(screen.getByRole('combobox', { name: 'Go to stage' }), { target: { value: '0' } })
		await screen.findByText('Step 1 · First task')
		fireEvent.change(screen.getByPlaceholderText('Type your response...'), { target: { value: 'First answer' } })
		fireEvent.change(screen.getByRole('combobox', { name: 'Go to stage' }), { target: { value: '1' } })
		await screen.findByText('Step 2 · Second task')
		expect((screen.getByPlaceholderText('Type your response...') as HTMLTextAreaElement).value).toBe('Second answer')
		fireEvent.change(screen.getByRole('combobox', { name: 'Go to stage' }), { target: { value: '0' } })
		await screen.findByText('Step 1 · First task')
		expect((screen.getByPlaceholderText('Type your response...') as HTMLTextAreaElement).value).toBe('First answer')
	})

	it('does not expose stage selection before consent or when free order is disabled', () => {
		const experiment = study()
		const { rerender } = render(<ParticipantPreview experiment={experiment} participantCode="PREVIEW-ORDER" previewOnly onBack={() => {}} />)
		expect(screen.queryByRole('combobox', { name: 'Go to stage' })).toBeNull()
		const consent = createStage('consent')
		consent.features.navigation = true
		rerender(<ParticipantPreview key="consent" experiment={{ ...experiment, stages: [consent, ...experiment.stages] }} participantCode="PREVIEW-ORDER" previewOnly onBack={() => {}} />)
		expect(screen.queryByRole('combobox', { name: 'Go to stage' })).toBeNull()
	})

	it('renders true/false components as mutually exclusive choices', () => {
		const experiment = study()
		const stage = createStage('true_false')
		stage.features.screenRecording = false
		stage.features.timer = false
		experiment.stages = [stage]
		render(<ParticipantPreview experiment={experiment} participantCode="PREVIEW-TF" previewOnly onBack={() => {}} />)
		const trueOption = screen.getByRole('button', { name: 'True', exact: true })
		const falseOption = screen.getByRole('button', { name: 'False', exact: true })
		fireEvent.click(trueOption)
		expect(trueOption.classList.contains('is-selected')).toBe(true)
		fireEvent.click(falseOption)
		expect(falseOption.classList.contains('is-selected')).toBe(true)
		expect(trueOption.classList.contains('is-selected')).toBe(false)
	})

	it('requests camera and microphone without implicitly requesting the screen', async () => {
		const camera = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
		const screenCapture = vi.fn()
		vi.stubGlobal('MediaRecorder', class {})
		vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: camera, getDisplayMedia: screenCapture } })
		const experiment = study()
		experiment.stages[0].recordingRequired = true
		experiment.stages[0].recordingMode = 'auto'
		try {
			render(<ParticipantPreview experiment={experiment} participantCode="PREVIEW-CAMERA" previewOnly onBack={() => {}} />)
			await waitFor(() => expect(camera).toHaveBeenCalledWith({ video: true, audio: true }))
			expect(screenCapture).not.toHaveBeenCalled()
		} finally { cleanup(); vi.unstubAllGlobals() }
	})

	it.each([false, true])(
		'requests enabled recordings in auto mode with gate=%s',
		async (required) => {
			vi.stubGlobal('MediaRecorder', class {})
			const request = vi
				.fn()
				.mockRejectedValue(
					new DOMException('permission denied', 'NotAllowedError'),
				)
			vi.stubGlobal('navigator', {
				mediaDevices: {
					getDisplayMedia: request,
					getUserMedia: request,
				},
			})
			const experiment = study()
			experiment.stages[0].recordingMode = 'auto'
			experiment.stages[0].recordingRequired = required
			experiment.stages[0].features.screenRecording = true
			experiment.stages[0].features.selfie = false
			try {
				render(
					<ParticipantPreview
						experiment={experiment}
						participantCode="P-001"
						onBack={() => {}}
					/>,
				)
				await waitFor(() =>
					expect(request).toHaveBeenCalledTimes(required ? 2 : 1),
				)
				expect(screen.getAllByText('Permission denied').length).toBe(
					required ? 2 : 1,
				)
			} finally {
				cleanup()
				vi.unstubAllGlobals()
			}
		},
	)

	it('requests configured screen recording even in manual mode and blocks on denial', async () => {
		vi.stubGlobal('MediaRecorder', class {})
		const request = vi
			.fn()
			.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
		vi.stubGlobal('navigator', {
			mediaDevices: { getDisplayMedia: request },
		})
		const experiment = study()
		experiment.stages[0].features.screenRecording = true
		try {
			render(
				<ParticipantPreview
					experiment={experiment}
					participantCode="P-001"
					onBack={() => {}}
				/>,
			)
			await screen.findByText('Permission denied')
			expect(request).toHaveBeenCalledOnce()
			expect(
				screen
					.getByPlaceholderText('Type your response...')
					.matches(':disabled'),
			).toBe(true)
			expect(
				(
					screen.getByRole('button', {
						name: 'Finish',
					}) as HTMLButtonElement
				).disabled,
			).toBe(true)
			fireEvent.click(
				screen.getByRole('button', { name: 'Enable screen recording' }),
			)
			await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
		} finally {
			cleanup()
			vi.unstubAllGlobals()
		}
	})

	it('locks configured stages until permission, relocks on interruption, and preserves answers', async () => {
		let grant!: (stream: unknown) => void
		let ended = () => {}
		let stopRecorder = () => {}
		const track = {
			readyState: 'live',
			getSettings: () => ({ displaySurface: 'monitor' }),
			stop: vi.fn(),
			addEventListener: (_: string, fn: () => void) => {
				ended = fn
			},
		}
		const stream = {
			getTracks: () => [track],
			getVideoTracks: () => [track],
		}
		const request = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						grant = resolve
					}),
			)
			.mockResolvedValue(stream)
		class Recorder {
			state = 'inactive'
			onstop?: () => void
			constructor() {
				stopRecorder = () => this.stop()
			}
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
			mediaDevices: { getDisplayMedia: request },
		})
		vi.mocked(getAIConfig).mockResolvedValue({
			configured: true,
			model: 'test',
		})
		const experiment = study()
		experiment.stages[0].features.screenRecording = true
		experiment.stages[0].features.ai = true
		experiment.stages[0].features.timer = true
		experiment.stages[0].countdownMinutes = 1
		try {
			const { container } = render(
				<ParticipantPreview
					experiment={experiment}
					participantCode="P-001"
					onBack={vi.fn()}
				/>,
			)
			await waitFor(() => expect(request).toHaveBeenCalledOnce())
			const answer = screen.getByPlaceholderText(
				'Type your response...',
			) as HTMLTextAreaElement
			expect(answer.matches(':disabled')).toBe(true)
			expect(
				(screen.getByLabelText('AI message') as HTMLTextAreaElement)
					.disabled,
			).toBe(true)
			vi.useFakeTimers()
			act(() => vi.advanceTimersByTime(3000))
			expect(
				container.querySelector('.stage-timer')?.textContent,
			).toContain('01:00')
			vi.useRealTimers()
			await act(async () => grant(stream))
			await screen.findByText('Recording', { exact: true })
			expect(answer.matches(':disabled')).toBe(false)
			expect(
				screen.queryByRole('button', { name: 'Stop', exact: true }),
			).toBeNull()
			fireEvent.change(answer, { target: { value: 'Saved answer' } })
			act(() => ended())
			expect(answer.matches(':disabled')).toBe(true)
			expect(answer.value).toBe('Saved answer')
			expect(
				(
					screen.getByRole('button', {
						name: 'Finish',
					}) as HTMLButtonElement
				).disabled,
			).toBe(true)
			fireEvent.click(
				screen.getByRole('button', { name: 'Enable screen recording' }),
			)
			await screen.findByText('Recording', { exact: true })
			expect(answer.matches(':disabled')).toBe(false)
			act(() => stopRecorder())
			expect(answer.matches(':disabled')).toBe(true)
		} finally {
			cleanup()
			vi.useRealTimers()
			vi.unstubAllGlobals()
		}
	})

	it('leaves stages without screen recording configuration unlocked', () => {
		const request = vi.fn()
		vi.stubGlobal('navigator', {
			mediaDevices: { getDisplayMedia: request },
		})
		try {
			render(
				<ParticipantPreview
					experiment={study()}
					participantCode="P-001"
					onBack={vi.fn()}
				/>,
			)
			expect(request).not.toHaveBeenCalled()
			expect(
				screen
					.getByPlaceholderText('Type your response...')
					.matches(':disabled'),
			).toBe(false)
			expect(
				screen.queryByRole('button', {
					name: 'Enable screen recording',
				}),
			).toBeNull()
		} finally {
			cleanup()
			vi.unstubAllGlobals()
		}
	})

	it('completes two gated auto stages with one permission request per device', async () => {
		const streams = () => {
			const track = {
				readyState: 'live',
				getSettings: () => ({ displaySurface: 'monitor' }),
				stop: vi.fn(),
				addEventListener: vi.fn(),
			}
			return { getTracks: () => [track], getVideoTracks: () => [track] }
		}
		const display = vi.fn().mockResolvedValue(streams())
		const camera = vi.fn().mockResolvedValue(streams())
		class Recorder {
			state = 'inactive'
			ondataavailable?: (event: { data: Blob }) => void
			onstop?: () => void
			start() {
				this.state = 'recording'
			}
			stop() {
				this.state = 'inactive'
				this.ondataavailable?.({
					data: new Blob(['media'], { type: 'video/webm' }),
				})
				this.onstop?.()
			}
		}
		vi.stubGlobal('MediaRecorder', Recorder)
		vi.stubGlobal('navigator', {
			mediaDevices: { getDisplayMedia: display, getUserMedia: camera },
		})
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
		vi.mocked(submitSession).mockResolvedValue({ id: 'session' } as never)
		const experiment = study()
		const first = experiment.stages[0]
		first.components = []
		first.features.confirm = false
		first.recordingRequired = true
		first.features.screenRecording = true
		first.recordingMode = 'auto'
		experiment.stages.push({
			...first,
			id: 'second',
			name: 'Second capture',
		})
		const done = vi.fn()
		try {
			render(
				<ParticipantPreview
					experiment={experiment}
					participantCode="P-001"
					onBack={done}
				/>,
			)
			await waitFor(() =>
				expect(screen.getAllByText('Recording')).toHaveLength(2),
			)
			fireEvent.click(screen.getByRole('button', { name: /Next stage/ }))
			await screen.findByRole('heading', { name: 'Second capture' })
			await waitFor(() =>
				expect(screen.getAllByText('Recording')).toHaveLength(2),
			)
			fireEvent.click(
				screen.getByRole('button', { name: 'Finish', exact: true }),
			)
			await waitFor(() => expect(done).toHaveBeenCalledOnce())
			expect(display).toHaveBeenCalledOnce()
			expect(camera).toHaveBeenCalledOnce()
			expect(uploadRecording).toHaveBeenCalledTimes(4)
			expect(
				new Set(
					vi
						.mocked(uploadRecording)
						.mock.calls.map((call) => call[1]),
				),
			).toEqual(new Set([first.id, 'second']))
			expect(submitStage).toHaveBeenCalledTimes(2)
			const final = vi.mocked(submitSession).mock.calls.at(-1)![0]
			expect(final.sessionId).toBe('session')
			expect(
				final.events
					.filter((event) => event.type === 'navigation')
					.every(
						(event) =>
							(
								event.detail?.recording as
									Record<string, boolean> | undefined
							)?.screen &&
							(
								event.detail?.recording as
									Record<string, boolean> | undefined
							)?.self,
					),
			).toBe(true)
		} finally {
			cleanup()
			vi.unstubAllGlobals()
			vi.restoreAllMocks()
		}
	})

	it('requires confirmation before submission and permits only one extension', async () => {
 const experiment = study()
 experiment.stages[0].allowExtension = true
 experiment.stages[0].features.confirm = true
 render(<ParticipantPreview experiment={experiment} participantCode="client-test" onBack={() => {}} />)
 fireEvent.click(screen.getByRole('button', { name: 'Extend by 30 minutes' }))
 await screen.findAllByText('Researcher approval required')
 fireEvent.click(screen.getByRole('button', { name: 'OK', exact: true }))
 await waitFor(() => expect(screen.queryByRole('button', { name: 'Extend by 30 minutes' })).toBeNull())
 fireEvent.change(screen.getByPlaceholderText('Type your response...'), { target: { value: 'My design' } })
 fireEvent.click(screen.getByRole('button', { name: 'Finish', exact: true }))
 await screen.findByText('Submit this stage?')
 expect(submitStage).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name: "Yes, I'm sure" }))
 await waitFor(() => expect(submitStage).toHaveBeenCalled())
 const saved = vi.mocked(submitSession).mock.calls.at(-1)![0]
 expect(saved.events.filter(event => event.type === 'timer_extension')).toHaveLength(1)
 })
	it('restores an unfinished stage and unsent text after leaving and returning', () => {
 const experiment = study()
 const second = createStage('short_answer'); second.name = 'Resumed task'; second.features.timer = false; second.features.screenRecording = false
 experiment.stages.push(second)
 const first = render(<ParticipantPreview initialSessionId="resume-session" experiment={experiment} participantCode="RESUME" onBack={() => {}} />)
 fireEvent.change(screen.getByPlaceholderText('Type your response...'), { target: { value: 'Draft without blur' } })
 first.unmount()
 render(<ParticipantPreview initialSessionId="resume-session" experiment={experiment} participantCode="RESUME" onBack={() => {}} />)
 expect((screen.getByPlaceholderText('Type your response...') as HTMLTextAreaElement).value).toBe('Draft without blur')
 })
	function study(): Experiment {
		const stage = createStage('short_answer')
		stage.features = {
			...stage.features,
			timer: false,
			clock: false,
			screenRecording: false,
			pauseAbort: true,
			copyPaste: true,
		}
		stage.components.push({
			id: 'file',
			type: 'attachment',
			label: 'Notes',
		})
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

	it('locks answers and pauses the timer after exiting configured fullscreen, then restores them', async () => {
		let fullscreen: Element | null = document.documentElement
		Object.defineProperty(document, 'fullscreenElement', {
			configurable: true,
			get: () => fullscreen,
		})
		const request = vi.fn().mockImplementation(async () => {
			fullscreen = document.documentElement
			document.dispatchEvent(new Event('fullscreenchange'))
		})
		Object.defineProperty(document.documentElement, 'requestFullscreen', {
			configurable: true,
			value: request,
		})
		const experiment = study()
		experiment.fullScreen = true
		experiment.stages[0].features.timer = true
		experiment.stages[0].countdownMinutes = 1
		try {
			const { container } = render(
				<ParticipantPreview
					experiment={experiment}
					participantCode="P-001"
					onBack={vi.fn()}
				/>,
			)
			const answer = screen.getByPlaceholderText(
				'Type your response...',
			) as HTMLTextAreaElement
			fireEvent.change(answer, { target: { value: 'Keep my answer' } })
			act(() => {
				fullscreen = null
				document.dispatchEvent(new Event('fullscreenchange'))
			})
			expect(
				screen.getByRole('dialog', {
					name: 'Full-screen mode required',
				}),
			).toBeDefined()
			expect(answer.matches(':disabled')).toBe(true)
			fireEvent.change(answer, { target: { value: 'Blocked change' } })
			expect(answer.value).toBe('Keep my answer')
			vi.useFakeTimers()
			act(() => vi.advanceTimersByTime(3000))
			expect(
				container.querySelector('.stage-timer')?.textContent,
			).toContain('01:00')
			vi.useRealTimers()
			request.mockRejectedValueOnce(new Error('denied'))
			fireEvent.click(
				screen.getByRole('button', { name: 'Return to full screen' }),
			)
			await screen.findByText(
				'Could not enter full screen. Allow full screen and try again.',
			)
			expect(answer.matches(':disabled')).toBe(true)
			fireEvent.click(
				screen.getByRole('button', { name: 'Return to full screen' }),
			)
			await waitFor(() =>
				expect(
					screen.queryByRole('dialog', {
						name: 'Full-screen mode required',
					}),
				).toBeNull(),
			)
			expect(answer.matches(':disabled')).toBe(false)
			expect(answer.value).toBe('Keep my answer')
		} finally {
			cleanup()
			vi.useRealTimers()
			Reflect.deleteProperty(document, 'fullscreenElement')
			Reflect.deleteProperty(
				document.documentElement,
				'requestFullscreen',
			)
		}
	})

	it('enables Next only while signed consent is checked', () => {
		const context = {
			beginPath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			stroke: vi.fn(),
			clearRect: vi.fn(),
		}
		const canvasContext = vi
			.spyOn(HTMLCanvasElement.prototype, 'getContext')
			.mockReturnValue(context as unknown as CanvasRenderingContext2D)
		const canvasImage = vi
			.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
			.mockReturnValue('data:image/png;base64,test')
		try {
			const experiment = study()
			experiment.stages.unshift(createStage('consent'))
			const { container } = render(
				<ParticipantPreview
					experiment={experiment}
					participantCode="PREVIEW-TEST"
					previewOnly
					onBack={() => {}}
				/>,
			)
			const next = screen.getByRole('button', {
				name: 'Next stage',
			}) as HTMLButtonElement
			const consent = screen.getByRole('checkbox', {
				name: 'I consent and want to continue',
			}) as HTMLInputElement
			expect(next.disabled).toBe(true)
			expect(consent.disabled).toBe(false)
			fireEvent.click(consent)
			expect(consent.checked).toBe(true)
			expect(next.disabled).toBe(true)
			const canvas = container.querySelector('canvas')!
			const sign = () => {
				fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 })
				fireEvent.pointerMove(canvas, { clientX: 30, clientY: 20 })
				fireEvent.pointerUp(canvas)
			}
			sign()
			expect(next.disabled).toBe(false)
			expect(
				screen.getByRole('heading', { name: 'Stage name' }),
			).toBeDefined()
			fireEvent.click(consent)
			expect(next.disabled).toBe(true)
			fireEvent.click(consent)
			fireEvent.click(
				screen.getByRole('button', { name: 'Clear', exact: true }),
			)
			expect(consent.checked).toBe(true)
			expect(next.disabled).toBe(true)
			fireEvent.click(consent)
			sign()
			expect(next.disabled).toBe(true)
			fireEvent.click(consent)
			expect(next.disabled).toBe(false)
		} finally {
			canvasContext.mockRestore()
			canvasImage.mockRestore()
		}
	})

	it('signs with the full legal name after every clause (client consent example)', () => {
		const experiment = study()
		const consent = createStage('consent')
		consent.signingMethod = 'name'
		consent.consentClauses = ['I understand the study.', 'I consent to participate.']
		experiment.stages.unshift(consent)
		render(<ParticipantPreview experiment={experiment} participantCode="NAME-SIGN" previewOnly onBack={() => {}} />)

		const sign = screen.getByRole('button', { name: 'Sign consent and continue' }) as HTMLButtonElement
		expect(sign.disabled).toBe(true)
		expect(screen.getByText('Scroll through the full document before signing.')).toBeTruthy()

		// Every clause box must be ticked before the signature is accepted.
		const clauses = screen.getAllByRole('checkbox')
		expect(clauses).toHaveLength(2)
		for (const clause of clauses) fireEvent.click(clause)
		expect(sign.disabled).toBe(true)

		fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Kholoud AlQattan' } })
		expect(sign.disabled).toBe(false)
		fireEvent.click(sign)

		expect(screen.getByText('Consent confirmed. Select Next stage to continue.')).toBeTruthy()
		expect(screen.getByRole('button', { name: 'Next stage' }).disabled).toBe(false)
	})

	it('places validation above Step and resets its dismissal timer on retry', () => {
		vi.useFakeTimers()
		try {
			const experiment = study()
			experiment.stages[0].components = [
				{
					id: 'required-answer',
					type: 'textbox',
					label: 'Your response',
					required: true,
				},
			]
			const { container } = render(
				<ParticipantPreview
					experiment={experiment}
					participantCode="PREVIEW-TEST"
					previewOnly
					onBack={() => {}}
				/>,
			)
			fireEvent.click(
				screen.getByRole('button', { name: 'Finish', exact: true }),
			)
		expect(
			container.querySelector('.participant-validation')
				?.nextElementSibling?.className,
		).toBe('participant-question-layout')
			act(() => vi.advanceTimersByTime(2000))
			expect(screen.getByRole('alert')).toBeDefined()
			fireEvent.click(
				screen.getByRole('button', { name: 'Finish', exact: true }),
			)
			act(() => vi.advanceTimersByTime(2599))
			expect(screen.getByRole('alert')).toBeDefined()
			act(() => vi.advanceTimersByTime(1))
			expect(screen.queryByRole('alert')).toBeNull()
		} finally {
			cleanup()
			vi.useRealTimers()
		}
	})

	it('shows missing answers inline instead of opening a browser alert', async () => {
		const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
		try {
			const experiment = study()
			experiment.stages[0].features.confirm = false
			experiment.stages[0].components = [
				{
					id: 'required-answer',
					type: 'textbox',
					label: 'Your response',
					required: true,
				},
			]
			experiment.stages.push({
				...experiment.stages[0],
				id: 'next-stage',
				name: 'Next question',
			})
			render(
				<ParticipantPreview
					experiment={experiment}
					participantCode="PREVIEW-TEST"
					previewOnly
					onBack={() => {}}
				/>,
			)
			fireEvent.click(screen.getByRole('button', { name: 'Next stage' }))
			expect((await screen.findByRole('alert')).textContent).toContain(
				'Required: Your response',
			)
			expect(alert).not.toHaveBeenCalled()
			fireEvent.change(
				screen.getByPlaceholderText('Type your response...'),
				{
					target: { value: 'Completed' },
				},
			)
			fireEvent.click(screen.getByRole('button', { name: 'Next stage' }))
			await screen.findByRole('heading', { name: 'Next question' })
			expect(screen.queryByRole('alert')).toBeNull()
		} finally {
			alert.mockRestore()
		}
	})

	it('lists missing required answers in the time-up dialog and lets the participant go back', () => {
		vi.useFakeTimers()
		try {
			const experiment = study()
			experiment.stages[0].features.timer = true
			experiment.stages[0].features.confirm = false
			experiment.stages[0].countdownMinutes = 1
			experiment.stages[0].components = [
				{
					id: 'required-answer',
					type: 'textbox',
					label: 'Your response',
					required: true,
				},
			]
			render(
				<ParticipantPreview
					experiment={experiment}
					participantCode="P-001"
					previewOnly
					onBack={() => {}}
				/>,
			)
			// Fake timers are installed before render so the countdown interval
			// is driven by them; one minute elapses and remaining reaches zero.
			act(() => {
				vi.advanceTimersByTime(60000)
			})
			expect(
				screen.getByRole('heading', { name: 'Time is up' }),
			).toBeDefined()

			// "Continue" is the action that used to deadlock: advance() still runs
			// required-field validation and the inline Alert is hidden beneath the
			// fixed, z-indexed overlay. The dialog must surface the missing item.
			fireEvent.click(
				screen.getByRole('button', { name: /Finish experiment/ }),
			)
			const dialog = document.querySelector('.pause-dialog')
			expect(dialog).toBeTruthy()
			expect(dialog!.textContent).toContain('Required: Your response')

			// A secondary escape hatch dismisses the overlay so the form is
			// reachable again (no refresh, no lost progress).
			fireEvent.click(
				screen.getByRole('button', { name: /Back to questions/ }),
			)
			expect(
				screen.queryByRole('heading', { name: 'Time is up' }),
			).toBeNull()
			expect(
				screen.queryByRole('button', { name: /Back to questions/ }),
			).toBeNull()
			const answer = screen.getByPlaceholderText(
				'Type your response...',
			) as HTMLTextAreaElement
			expect(answer.matches(':disabled')).toBe(false)
			fireEvent.change(answer, { target: { value: 'Now answered' } })
			expect(answer.value).toBe('Now answered')
		} finally {
			cleanup()
			vi.useRealTimers()
		}
	})

	it('advances and finishes researcher preview without submitting study data', async () => {
		const experiment = study()
		experiment.stages[0].components = [
			{ id: 'intro', type: 'text', label: 'Preview first stage' },
		]
		experiment.stages[0].features.confirm = false
		experiment.stages.push({
			...experiment.stages[0],
			id: 'preview-next',
			name: 'Preview second stage',
		})
		const done = vi.fn()
		render(
			<ParticipantPreview
				experiment={experiment}
				participantCode="PREVIEW-TEST"
				previewOnly
				onBack={done}
			/>,
		)
		fireEvent.click(screen.getByRole('button', { name: 'Next stage' }))
		await screen.findByRole('heading', { name: 'Preview second stage' })
		expect(submitStage).not.toHaveBeenCalled()
		fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
		await waitFor(() => expect(done).toHaveBeenCalledOnce())
		expect(submitSession).not.toHaveBeenCalled()
		expect(uploadRecording).not.toHaveBeenCalled()
	})


	it('persists an aborted session through the back link', async () => {
		const done = vi.fn()
		vi.mocked(submitSession).mockResolvedValue({} as never)
		render(
			<ParticipantPreview
				initialSessionId="test-session"
				experiment={study()}
				participantCode="P001"
				onBack={done}
			/>,
		)
		fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
		await waitFor(() => expect(submitSession).toHaveBeenCalledOnce())
		expect(vi.mocked(submitSession).mock.calls[0][0].finishedAt).toBeNull()
		await waitFor(() => expect(done).toHaveBeenCalledOnce())
	})

	it('leaves researcher preview immediately without waiting for a session save', () => {
		const done = vi.fn()
		render(
			<ParticipantPreview
				experiment={study()}
				participantCode="PREVIEW-TEST"
				previewOnly
				onBack={done}
			/>,
		)
		fireEvent.click(
			screen.getByRole('button', { name: 'Back to experiment' }),
		)
		expect(done).toHaveBeenCalledOnce()
		expect(submitSession).not.toHaveBeenCalled()
	})

	it('submits answers, attachments and the full event timeline on Finish', async () => {
		const experiment = study(),
			done = vi.fn()
		const { container } = render(
			<ParticipantPreview
				experiment={experiment}
				participantCode="P-001"
				onBack={done}
			/>,
		)
		const answer = screen.getByPlaceholderText('Type your response...')
		fireEvent.change(answer, { target: { value: 'A lightweight bridge' } })
		fireEvent.blur(answer)
		fireEvent.change(container.querySelector('input[type="file"]')!, {
			target: {
				files: [
					new File(['notes'], 'notes.txt', { type: 'text/plain' }),
				],
			},
		})
		await screen.findByText('notes.txt')
		fireEvent.paste(document, {
			clipboardData: { getData: () => 'x'.repeat(800) },
		})
		fireEvent.click(
			screen.getByRole('button', { name: 'Finish', exact: true }),
		)
		await waitFor(() => expect(done).toHaveBeenCalledOnce())
		const payload = vi.mocked(submitSession).mock.calls.at(-1)![0]
		expect(payload.participantCode).toBe('P-001')
		expect(payload.answers).toEqual(
			expect.arrayContaining([
				{
					componentId: experiment.stages[0].components[1].id,
					value: 'A lightweight bridge',
				},
				{
					componentId: 'file',
					value: 'data:text/plain;base64,bm90ZXM=',
				},
			]),
		)
		expect(
			payload.events.find((e) => e.type === 'paste')?.detail?.text,
		).toHaveLength(800)
		expect(payload.finishedAt).not.toBeNull()
	})

	it('reports completion only after the final save succeeds', async () => {
		const experiment = study()
		experiment.stages[0].components = []
		experiment.stages[0].features.confirm = false
		const completed = vi.fn(),
			back = vi.fn()
		vi.mocked(submitSession)
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({} as never)
		render(
			<ParticipantPreview
				initialSessionId="test-session"
				experiment={experiment}
				participantCode="P-001"
				onBack={back}
				onComplete={completed}
			/>,
		)
		fireEvent.click(
			screen.getByRole('button', { name: 'Finish', exact: true }),
		)
		const failure = await screen.findByText(/Session could not be saved.*offline/)
		expect(failure.closest('.ant-alert-error')).toBeTruthy()
		expect(completed).not.toHaveBeenCalled()
		expect(back).not.toHaveBeenCalled()
		fireEvent.click(
			screen.getByRole('button', { name: 'Finish', exact: true }),
		)
		await waitFor(() => expect(completed).toHaveBeenCalledOnce())
		expect(back).not.toHaveBeenCalled()
	})

	it('keeps pause/resume and marks aborted sessions incomplete', async () => {
		render(
			<ParticipantPreview
				experiment={study()}
				participantCode="P-002"
				onBack={vi.fn()}
			/>,
		)
		fireEvent.click(
			screen.getByRole('button', { name: 'Pause', exact: true }),
		)
		expect(screen.getByText('Session paused')).toBeDefined()
		fireEvent.click(screen.getByRole('button', { name: /Resume/ }))
		expect(screen.queryByText('Session paused')).toBeNull()
		fireEvent.click(
			screen.getByRole('button', { name: 'Abort', exact: true }),
		)
		await waitFor(() => expect(submitSession).toHaveBeenCalledOnce())
		expect(vi.mocked(submitSession).mock.calls[0][0].finishedAt).toBeNull()
	})
})

describe('AI chat panel', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(getAIConfig).mockResolvedValue({
			model: 'configured-server-model',
			configured: true,
		})
	})

	afterEach(cleanup)

	it('keeps Shift+Enter and input-method composition from sending', async () => {
		vi.mocked(streamChat).mockResolvedValue({
			text: 'reply',
			model: 'test',
			aborted: false,
		})
		render(<AIChat stageId="design" />)
		const field = screen.getByLabelText('AI message')
		fireEvent.change(field, { target: { value: '中文问题' } })
		fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })
		fireEvent.compositionStart(field)
		fireEvent.keyDown(field, { key: 'Enter' })
		expect(streamChat).not.toHaveBeenCalled()
		fireEvent.compositionEnd(field)
		fireEvent.keyDown(field, { key: 'Enter' })
		await waitFor(() => expect(streamChat).toHaveBeenCalledOnce())
	})

	it('renders streamed replies and retries with the same request ID without sending history', async () => {
		vi.mocked(streamChat).mockRejectedValueOnce(
			new LlmCallError('Provider unavailable', true),
		)
		vi.mocked(streamChat).mockImplementationOnce(async (options) => {
			options.onDelta('Consider the load.')
			options.onModel?.('actual-model')
			return {
				text: 'Consider the load.',
				model: 'actual-model',
				aborted: false,
			}
		})
		const logPrompt = vi.fn(),
			logReply = vi.fn()
		render(
			<AIChat
				stageId="design"
				contextLabel="Design task"
				onUserMessage={logPrompt}
				onAssistantReply={logReply}
			/>,
		)
		fireEvent.change(screen.getByPlaceholderText('Type a question…'), {
			target: { value: 'How to design a bridge?' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Send' }))
		await screen.findByText('Provider unavailable')
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
		await screen.findByText('Consider the load.')
		expect(vi.mocked(streamChat).mock.calls[1][0]).toMatchObject({
			stageId: 'design',
			prompt: 'How to design a bridge?',
		})
		expect(vi.mocked(streamChat).mock.calls[1][0].requestId).toBe(
			vi.mocked(streamChat).mock.calls[0][0].requestId,
		)
		expect(vi.mocked(streamChat).mock.calls[1][0]).not.toHaveProperty(
			'history',
		)
		expect(screen.getAllByText('How to design a bridge?')).toHaveLength(1)
		expect(logPrompt).toHaveBeenCalledOnce()
		expect(logReply).toHaveBeenCalledWith('Consider the load.')
		expect(screen.getByText('Text-only · actual-model')).toBeDefined()
	})

	it('keeps the Stop button wired to backend request cancellation', async () => {
		vi.mocked(streamChat).mockImplementation(
			(options) =>
				new Promise((resolve) => {
					options.signal?.addEventListener('abort', () =>
						resolve({ text: '', model: '', aborted: true }),
					)
				}),
		)
		render(<AIChat stageId="design" />)
		fireEvent.change(screen.getByPlaceholderText('Type a question…'), {
			target: { value: 'hello' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Send' }))
		fireEvent.click(await screen.findByRole('button', { name: 'Stop' }))
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Send' })).toBeDefined(),
		)
		expect(vi.mocked(streamChat).mock.calls[0][0].signal?.aborted).toBe(
			true,
		)
	})

	it('sends only the new prompt on later turns while keeping old messages visible', async () => {
		vi.mocked(streamChat).mockImplementation(async (options) => {
			options.onDelta('reply to ' + options.prompt)
			return {
				text: 'reply to ' + options.prompt,
				model: 'server-model',
				aborted: false,
			}
		})
		render(<AIChat stageId="design" />)
		for (const prompt of ['first question', 'second question']) {
			fireEvent.change(screen.getByPlaceholderText('Type a question…'), {
				target: { value: prompt },
			})
			fireEvent.click(screen.getByRole('button', { name: 'Send' }))
			await screen.findByText('reply to ' + prompt)
			await waitFor(() =>
				expect(
					screen.getByRole('button', { name: 'Send' }),
				).toBeDefined(),
			)
		}
		const first = vi.mocked(streamChat).mock.calls[0][0],
			second = vi.mocked(streamChat).mock.calls[1][0]
		expect(second.prompt).toBe('second question')
		expect(second.conversationId).toBe(first.conversationId)
		expect(second.requestId).not.toBe(first.requestId)
		expect(second).not.toHaveProperty('history')
		expect(screen.getByText('first question')).toBeDefined()
		expect(screen.getByText('reply to first question')).toBeDefined()
	})
})

describe("countdown controller", () => {
 it('freezes a persisted countdown while paused and resumes from the same value', () => {
  vi.useFakeTimers(); localStorage.clear()
  const key = 'pause-timer-test'
  const { result, rerender, unmount } = renderHook(
   ({ enabled }) => useTimerController({ initialSeconds: 60, enabled, stageId: 'task', storageKey: key }),
   { initialProps: { enabled: true } },
  )
  act(() => vi.advanceTimersByTime(10000))
  expect(result.current.remaining).toBe(50)
  rerender({ enabled: false })
  act(() => vi.advanceTimersByTime(30000))
  expect(result.current.remaining).toBe(50)
  expect(Math.ceil((Number(localStorage.getItem(key)) - Date.now()) / 1000)).toBe(50)
  rerender({ enabled: true })
  act(() => vi.advanceTimersByTime(10000))
  expect(result.current.remaining).toBe(40)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
 })
 it('counts elapsed time while unmounted, preserves extensions, and clamps expired timers', () => {
  vi.useFakeTimers(); localStorage.clear()
  const key = 'resume-timer-test'
  const first = renderHook(() => useTimerController({ initialSeconds: 60, enabled: true, stageId: 'task', storageKey: key }))
  act(() => vi.advanceTimersByTime(10000)); expect(first.result.current.remaining).toBe(50)
  act(() => first.result.current.reset(value => value + 30))
  first.unmount(); act(() => vi.advanceTimersByTime(20000))
  const resumed = renderHook(() => useTimerController({ initialSeconds: 60, enabled: false, stageId: 'task', storageKey: key }))
  expect(resumed.result.current.remaining).toBe(60)
  resumed.unmount(); act(() => vi.advanceTimersByTime(70000))
  const expired = renderHook(() => useTimerController({ initialSeconds: 60, enabled: false, stageId: 'task', storageKey: key }))
  expect(expired.result.current.remaining).toBe(0)
 })
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  it("pauses, resumes, resets for another stage, and stops at zero", () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(
      ({ enabled, stageId }) =>
        useTimerController({ initialSeconds: 3, enabled, stageId }),
      { initialProps: { enabled: true, stageId: "first" } },
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);
    rerender({ enabled: false, stageId: "first" });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.remaining).toBe(2);
    act(() => result.current.reset(3));
    rerender({ enabled: true, stageId: "next" });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.remaining).toBe(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('recording capture and upload', () => {
	afterEach(() => vi.unstubAllGlobals())

	it.each(['browser', 'window', undefined])(
		'rejects non-monitor capture (%s) before recording',
		async (surface) => {
			const { RecordingController } =
				await import('../src/participant/RecordingController')
			const stop = vi.fn()
			const track = {
				stop,
				getSettings: () => ({ displaySurface: surface }),
			}
			const stream = {
				getTracks: () => [track],
				getVideoTracks: () => [track],
			}
			const recorder = vi.fn()
			const request = vi.fn().mockResolvedValue(stream)
			vi.stubGlobal('MediaRecorder', recorder)
			vi.stubGlobal('navigator', {
				mediaDevices: { getDisplayMedia: request },
			})
			const upload = vi.fn()
			const controller = new RecordingController('screen', upload)
			expect(await controller.start()).toBe('screen_required')
			expect(stop).toHaveBeenCalledOnce()
			expect(recorder).not.toHaveBeenCalled()
			expect(upload).not.toHaveBeenCalled()
			expect(controller.stream).toBeNull()
			expect(request).toHaveBeenCalledWith(
				expect.objectContaining({
					video: { displaySurface: 'monitor' },
					preferCurrentTab: false,
					surfaceSwitching: 'exclude',
				}),
			)
			await controller.finish()
		},
	)

	it('rejects a retained tab stream and stops if a browser switches away from the entire screen', async () => {
		const { RecordingController } =
			await import('../src/participant/RecordingController')
		let surface = 'browser'
		let emit = () => {}
		const stop = vi.fn()
		const track = {
			readyState: 'live',
			stop,
			addEventListener: vi.fn(),
			getSettings: () => ({ displaySurface: surface }),
		}
		const stream = {
			getTracks: () => [track],
			getVideoTracks: () => [track],
		} as unknown as MediaStream
		class Recorder {
			state = 'inactive'
			ondataavailable?: (event: { data: Blob }) => void
			onstop?: () => void
			constructor() {
				emit = () =>
					this.ondataavailable?.({
						data: new Blob(['wrong surface']),
					})
			}
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
				getDisplayMedia: vi.fn().mockResolvedValue(stream),
			},
		})
		expect(await new RecordingController('screen').start(stream)).toBe(
			'screen_required',
		)
		surface = 'monitor'
		const upload = vi.fn()
		const changed = vi.fn()
		const controller = new RecordingController('screen', upload, changed)
		expect(await controller.start()).toBe('active')
		surface = 'window'
		emit()
		expect(controller.status).toBe('screen_required')
		expect(changed).toHaveBeenLastCalledWith('screen_required')
		expect(upload).not.toHaveBeenCalled()
		await controller.finish()
	})

	it('saves the final chunk, retries failed uploads, and stops on track loss', async () => {
		const { RecordingController } =
			await import('../src/participant/RecordingController')
		let ended = () => {}
		const track = {
			readyState: 'live',
			getSettings: () => ({ displaySurface: 'monitor' }),
			stop: vi.fn(),
			addEventListener: (_: string, fn: () => void) => {
				ended = fn
			},
		}
		const stream = {
			getTracks: () => [track],
			getVideoTracks: () => [track],
		}
		const recorders: FakeRecorder[] = []
		class FakeRecorder {
			state = 'inactive'
			ondataavailable?: (event: { data: Blob }) => void
			onstop?: () => void
			onerror?: () => void
			// Expose the browser callback target to the test.
			constructor() {
				recorders.push(this)
			}
			start() {
				this.state = 'recording'
			}
			stop() {
				this.state = 'inactive'
				this.ondataavailable?.({
					data: new Blob(['last'], { type: 'video/webm' }),
				})
				this.onstop?.()
			}
		}
		vi.stubGlobal('MediaRecorder', FakeRecorder)
		vi.stubGlobal('navigator', {
			mediaDevices: {
				getDisplayMedia: vi.fn().mockResolvedValue(stream),
			},
		})
		const upload = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue(undefined)
		const controller = new RecordingController('screen', upload)
		expect(await controller.start()).toBe('active')
		recorders[0].ondataavailable?.({ data: new Blob(['first']) })
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(controller.status).not.toBe('active')
		await controller.finish()
		expect(upload.mock.calls.some(([chunk]) => chunk.size === 4)).toBe(true)
		expect(track.stop).toHaveBeenCalled()
		ended()
		expect(controller.status).toBe('stopped')
	})

	it('hands a live stream to the next stage without requesting permission again', async () => {
		const { RecordingController } =
			await import('../src/participant/RecordingController')
		const listeners: (() => void)[] = []
		const track = {
			readyState: 'live',
			getSettings: () => ({ displaySurface: 'monitor' }),
			stop: vi.fn(),
			addEventListener: (_: string, fn: () => void) => listeners.push(fn),
		}
		const stream = {
			getTracks: () => [track],
			getVideoTracks: () => [track],
		}
		class Recorder {
			state = 'inactive'
			ondataavailable?: (event: { data: Blob }) => void
			onstop?: () => void
			start() {
				this.state = 'recording'
			}
			stop() {
				this.state = 'inactive'
				this.ondataavailable?.({ data: new Blob(['stage-video']) })
				this.onstop?.()
			}
		}
		const permission = vi.fn().mockResolvedValue(stream)
		vi.stubGlobal('MediaRecorder', Recorder)
		vi.stubGlobal('navigator', {
			mediaDevices: { getDisplayMedia: permission },
		})
		const uploadFirst = vi.fn().mockResolvedValue(undefined)
		const uploadSecond = vi.fn().mockResolvedValue(undefined)
		const first = new RecordingController('screen', uploadFirst)
		expect(await first.start()).toBe('active')
		await first.finish(true)
		expect(track.stop).not.toHaveBeenCalled()
		const second = new RecordingController('screen', uploadSecond)
		expect(await second.start(first.takeStream())).toBe('active')
		expect(permission).toHaveBeenCalledTimes(1)
		expect(uploadFirst).toHaveBeenCalledTimes(1)
		track.readyState = 'ended'
		listeners.forEach((listener) => listener())
		expect(second.status).toBe('stopped')
		await second.finish()
		expect(uploadSecond).toHaveBeenCalledTimes(1)
	})

	it('finishes promptly when MediaRecorder.start fails', async () => {
		const { RecordingController } =
			await import('../src/participant/RecordingController')
		const stop = vi.fn()
		vi.stubGlobal(
			'MediaRecorder',
			class {
				state = 'inactive'
				start() {
					throw new Error('encoder failed')
				}
			},
		)
		vi.stubGlobal('navigator', {
			mediaDevices: {
				getDisplayMedia: async () => ({
					getTracks: () => [{ stop }],
					getVideoTracks: () => [
						{ getSettings: () => ({ displaySurface: 'monitor' }) },
					],
				}),
			},
		})
		const controller = new RecordingController('screen')
		expect(await controller.start()).toBe('error')
		await controller.finish()
		expect(stop).toHaveBeenCalled()
	})

	it('does not restore active state or keep a late permission stream after leaving', async () => {
		const { RecordingController } =
			await import('../src/participant/RecordingController')
		vi.stubGlobal('MediaRecorder', class {})
		let grant!: (stream: unknown) => void
		const stop = vi.fn()
		vi.stubGlobal('navigator', {
			mediaDevices: {
				getDisplayMedia: () =>
					new Promise((resolve) => {
						grant = resolve
					}),
			},
		})
		const controller = new RecordingController('screen')
		expect(controller.status).toBe('idle')
		const starting = controller.start()
		controller.stop()
		grant({
			getTracks: () => [{ stop }],
			getVideoTracks: () => [
				{ getSettings: () => ({ displaySurface: 'monitor' }) },
			],
		})
		expect(await starting).toBe('stopped')
		expect(stop).toHaveBeenCalled()
	})
})

describe('researcher results', () => {
	afterEach(cleanup)
	it('switches all six chart types and requests the selected experiment', async () => {
		const { ResultsPage } =
			await import('../src/pages/ResearcherDashboardPage')
		const { EventQueue } = await import('../src/participant/EventQueue')
		const queue = new EventQueue('results-test')
		queue.clear()
		queue.record('answer', { value: 'sample' })
		vi.mocked(listSessions).mockResolvedValue([
			{ id: 'session', experimentCode: 'E1', events: queue.all() },
		] as never)
		render(
			<ResultsPage
				experiments={
					[{ id: 'e1', code: 'E1', name: 'Study' }] as Experiment[]
				}
			/>,
		)
		await screen.findByRole('img', { name: 'bar chart' })
		for (const [value, label] of [
			['line', 'Activity over time'],
			['pie', 'Event mix'],
			['scatter', 'scatter chart'],
			['histogram', 'histogram chart'],
			['timeline', 'timeline chart'],
		]) {
			fireEvent.change(screen.getByLabelText('Chart type'), {
				target: { value },
			})
			expect(screen.getByRole('img', { name: label })).toBeDefined()
		}
		fireEvent.change(screen.getByLabelText('Results experiment'), {
			target: { value: 'E1' },
		})
		await waitFor(() => expect(listSessions).toHaveBeenLastCalledWith('E1'))
	})
	it('scopes the charts to one experiment by default', async () => {
		const { ResultsPage } = await import('../src/pages/ResearcherDashboardPage')
		vi.mocked(listSessions).mockResolvedValue([])
		render(
			<ResultsPage
				experiments={
					[
						{ id: 'e1', code: 'E1', name: 'Study' },
						{ id: 'e2', code: 'E2', name: 'Second study' },
					] as Experiment[]
				}
			/>,
		)

		// Mixing two studies in one chart is never what a researcher wants, so the
		// page starts on a concrete experiment instead of "All my experiments".
		await waitFor(() => expect(listSessions).toHaveBeenLastCalledWith('E1'))
		expect(
			(screen.getByLabelText('Results experiment') as HTMLSelectElement)
				.value,
		).toBe('E1')

		// The combined view stays reachable, and is not overridden afterwards.
		fireEvent.change(screen.getByLabelText('Results experiment'), {
			target: { value: '' },
		})
		await waitFor(() => expect(listSessions).toHaveBeenLastCalledWith(''))
		expect(
			(screen.getByLabelText('Results experiment') as HTMLSelectElement)
				.value,
		).toBe('')
	})
	it('records clock offset and round-trip uncertainty', async () => {
		const { EventQueue } = await import('../src/participant/EventQueue')
		const queue = new EventQueue('clock-test')
		queue.clear()
		queue.setClock(1100, 1000, 1020)
		expect(queue.all()[0].detail).toEqual({
			offsetMs: 90,
			roundTripMs: 20,
			uncertaintyMs: 10,
		})
	})
})

describe('temporary operation notices', () => {
	afterEach(() => {
		cleanup()
		vi.useRealTimers()
	})
	it('holds for two seconds and removes the notice after fading without losing the error', () => {
		vi.useFakeTimers()
		const { result } = renderHook(() => useTransientNotice(''))
		act(() => result.current[1]('Save failed'))
		act(() => vi.advanceTimersByTime(2000))
		expect(result.current[2]).toBe(true)
		act(() => vi.advanceTimersByTime(600))
		expect(result.current[2]).toBe(false)
		expect(result.current[0]).toBe('Save failed')
	})
	it('restarts the entire display period when the same message occurs again', () => {
		vi.useFakeTimers()
		const { result } = renderHook(() => useTransientNotice(''))
		act(() => result.current[1]('Save failed'))
		act(() => vi.advanceTimersByTime(2500))
		const previousKey = result.current[3]
		act(() => result.current[1]('Save failed'))
		expect(result.current[3]).toBeGreaterThan(previousKey)
		act(() => vi.advanceTimersByTime(2000))
		expect(result.current[2]).toBe(true)
		act(() => vi.advanceTimersByTime(600))
		expect(result.current[2]).toBe(false)
	})
})


it('records integer event times when clock synchronization has a half-millisecond offset', async () => {
	const { EventQueue } = await import('../src/participant/EventQueue')
	const now = vi.spyOn(Date, 'now').mockReturnValue(1000000)
	try {
		const queue = new EventQueue('fractional-clock-regression')
		queue.clear()
		queue.setClock(1000000, 999999, 1000000)
		const event = queue.record('answer', { componentId: 'question', value: 'answer' })
		expect(event.epochMs).toBe(1000001)
		expect(new Date(event.timestamp).getTime()).toBe(event.epochMs)
		expect(queue.all().every(item => Number.isInteger(item.epochMs))).toBe(true)
	} finally { now.mockRestore() }
})

describe('questionnaire question-number panel and validation', () => {
	function qStage(id: string, name: string, required: boolean): Stage {
		const stage = createStage('short_answer')
		stage.id = id
		stage.name = name
		stage.features = {
			...stage.features, timer: false, clock: false,
			screenRecording: false, copyPaste: false, navigation: false,
		}
		stage.components = [{ id: `${id}-q`, type: 'textbox', label: `${name} question`, required }]
		return stage
	}

	it('shows a left panel listing every question and marks answered ones green in real time', () => {
		const experiment: Experiment = {
			id: 'q', code: 'Q-1', name: 'Questionnaire study', status: 'Live',
			created: '', fullScreen: false,
			stages: [qStage('s1', 'First question', true), qStage('s2', 'Second question', true)],
		}
		const { container } = render(
			<ParticipantPreview experiment={experiment} participantCode="Q-TEST" previewOnly onBack={() => {}} />,
		)
		const items = container.querySelectorAll('.qnav-item')
		expect(items.length).toBe(2)
		expect(items[0].classList.contains('done')).toBe(false)
		expect(items[1].classList.contains('done')).toBe(false)
		fireEvent.change(screen.getByPlaceholderText('Type your response...'), { target: { value: 'done' } })
		expect(items[0].classList.contains('done')).toBe(true)
		expect(items[1].classList.contains('done')).toBe(false)
	})

	it('lets the participant jump between questions from the panel without enabling the navigation feature', async () => {
		const experiment: Experiment = {
			id: 'q', code: 'Q-1', name: 'Questionnaire study', status: 'Live',
			created: '', fullScreen: false,
			stages: [qStage('s1', 'First question', true), qStage('s2', 'Second question', true)],
		}
		const { container } = render(
			<ParticipantPreview experiment={experiment} participantCode="Q-TEST" previewOnly onBack={() => {}} />,
		)
		const items = container.querySelectorAll('.qnav-item')
		expect(items[1].disabled).toBe(false)
		fireEvent.click(items[1])
		await screen.findByText('Step 2 · Second question')
		expect(items[1].classList.contains('current')).toBe(true)
	})

	it('blocks continue on missing answers with a modal and highlights the unanswered question in red', async () => {
		const experiment: Experiment = {
			id: 'q', code: 'Q-1', name: 'Questionnaire study', status: 'Live',
			created: '', fullScreen: false, stages: [qStage('solo', 'Only question', true)],
		}
		const { container } = render(
			<ParticipantPreview experiment={experiment} participantCode="Q-TEST" previewOnly onBack={() => {}} />,
		)
		expect(screen.queryByText('Some questions still need answers')).toBeNull()
		fireEvent.click(screen.getByRole('button', { name: 'Finish', exact: true }))
		expect(await screen.findByText('Some questions still need answers')).toBeTruthy()
		expect(container.querySelector('.ms-question.missing-required')).not.toBeNull()
		fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
		fireEvent.change(screen.getByPlaceholderText('Type your response...'), { target: { value: 'done' } })
		expect(container.querySelector('.ms-question.missing-required')).toBeNull()
	})
})
