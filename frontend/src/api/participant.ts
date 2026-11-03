import type { ParticipantEvent } from '../participant/EventQueue'
import { downloadFile, http, HttpError, openApiStream } from './http'

// Text or multiple-choice answer for a component.
export interface ParticipantAnswer {
	componentId: string
	value: string | string[]
}

// Session result with access codes, timestamps, answers, and events.
export interface ParticipantSessionResult {
	id: string
	experimentCode: string
	participantCode: string
	startedAt: string
	finishedAt: string | null
	answers: ParticipantAnswer[]
	events: ParticipantEvent[]
}

export const submitStage = (
	stageId: string,
	input: {
		experimentCode: string
		participantCode: string
		sessionId?: string
		answers: ParticipantAnswer[]
		recording: Record<string, boolean>
		consentAccepted?: boolean
	},
) =>
	http.post(
		`/participant/stages/${encodeURIComponent(stageId)}/submit`,
		input,
	)

// Participant session endpoint.
const PATH = '/participant/sessions'

// Fetch saved participant sessions.
export async function listSessions(
	experimentCode = '',
): Promise<ParticipantSessionResult[]> {
	return http.get<ParticipantSessionResult[]>(
		PATH +
			(experimentCode
				? '?experiment_code=' + encodeURIComponent(experimentCode)
				: ''),
	)
}

// Submit a session; the backend generates its ID and start time.
export async function submitSession(
	input: Omit<ParticipantSessionResult, 'id' | 'startedAt'> & {
		sessionId?: string
	},
): Promise<ParticipantSessionResult> {
	return http.post<ParticipantSessionResult>(PATH, {
		sessionId: input.sessionId,
		experimentCode: input.experimentCode,
		participantCode: input.participantCode,
		finishedAt: input.finishedAt,
		answers: input.answers,
		events: input.events,
	})
}

export type CsvView = 'answers' | 'activity'

/** Download saved answers or activity from the study server. */
export const downloadSessionCsv = (id: string, view: CsvView = 'answers') =>
	downloadFile(
		PATH + '/' + encodeURIComponent(id) + '/csv?view=' + view,
		id + '_' + view + '.csv',
	)

export const downloadSessionWorkbook = (id: string) =>
	downloadFile(
		PATH + '/' + encodeURIComponent(id) + '/xlsx',
		'experiment.xlsx',
	)

export interface AIConfig {
	model: string
	configured: boolean
}

export const getAIConfig = (stageId?: string) => http.get<AIConfig>('/ai/config' +
	(stageId ? '?stageId=' + encodeURIComponent(stageId) : ''))

export interface StreamChatOptions {
	sessionId?: string
	stageId: string
	prompt: string
	conversationId: string
	requestId: string
	signal?: AbortSignal
	onDelta: (delta: string) => void
	onModel?: (model: string) => void
}

export interface StreamChatResult {
	text: string
	model: string
	aborted: boolean
}

export class LlmCallError extends Error {
	readonly retryable: boolean
	readonly partialText: string
	constructor(message: string, retryable: boolean, partialText = '') {
		super(message)
		this.name = 'LlmCallError'
		this.retryable = retryable
		this.partialText = partialText
	}
}

/** Decode backend NDJSON across arbitrary network and UTF-8 boundaries. */
export async function streamChat(
	options: StreamChatOptions,
): Promise<StreamChatResult> {
	let text = '',
		model = '',
		pending = '',
		done = false
	let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
	const accept = (line: string) => {
		if (!line.trim()) return
		const event = JSON.parse(line) as {
			type: string
			text?: string
			model?: string
			message?: string
			retryable?: boolean
		}
		if (event.type === 'error')
			throw new LlmCallError(
				event.message || 'The AI request failed. Please retry.',
				event.retryable !== false,
				text,
			)
		if (event.model) {
			model = event.model
			options.onModel?.(model)
		}
		if (event.type === 'delta') {
			if (typeof event.text !== 'string')
				throw new LlmCallError(
					'The study server sent an invalid reply.',
					true,
					text,
				)
			text += event.text
			options.onDelta(event.text)
		} else if (event.type === 'done') done = true
	}
	try {
		const response = await openApiStream(
			'/participant/stages/' +
				encodeURIComponent(options.stageId) +
				'/ai-stream',
			{
				content: options.prompt,
				sessionId: options.sessionId,
				conversationId: options.conversationId,
				requestId: options.requestId,
			},
			options.signal,
		)
		if (!response.body)
			throw new LlmCallError(
				'The study server returned an empty response.',
				true,
			)
		reader = response.body.getReader()
		const decoder = new TextDecoder()
		while (true) {
			const chunk = await reader.read()
			if (chunk.done) break
			pending += decoder.decode(chunk.value, { stream: true })
			let end: number
			while ((end = pending.indexOf('\n')) >= 0) {
				accept(pending.slice(0, end))
				pending = pending.slice(end + 1)
			}
		}
		pending += decoder.decode()
		if (pending.trim()) accept(pending)
		if (!done)
			throw new LlmCallError(
				'The AI reply was interrupted. Please retry.',
				true,
				text,
			)
		return { text, model, aborted: false }
	} catch (error) {
		if (
			options.signal?.aborted ||
			(error instanceof Error && error.name === 'AbortError')
		)
			return { text, model, aborted: true }
		if (error instanceof LlmCallError) throw error
		const retryable =
			!(error instanceof HttpError) ||
			[0, 409, 429, 502, 503, 504].includes(error.status)
		throw new LlmCallError(
			error instanceof Error
				? error.message
				: 'Cannot reach the study server. Please retry.',
			retryable,
			text,
		)
	} finally {
		await reader?.cancel().catch(() => undefined)
		reader?.releaseLock()
	}
}

export async function uploadRecording(
	sessionId: string,
	stageId: string,
	recordingId: string,
	kind: string,
	offset: number,
	chunk: Blob,
): Promise<void> {
	const query = new URLSearchParams({
		stage_id: stageId,
		kind,
		offset: String(offset),
		mime: chunk.type || 'video/webm',
	})
	await http.post(
		`/participant/sessions/${sessionId}/recordings/${recordingId}?${query}`,
		chunk,
	)
}
