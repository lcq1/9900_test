// Session API for answers and events; the results page reads local logs.
import type { Experiment } from '../types'
import type { ParticipantEvent } from '../participant/EventQueue'
import { http, isNotFound } from './http'

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

// Participant session endpoint.
const PATH = '/participant/sessions'

// Fetch saved participant sessions.
export async function listSessions(): Promise<ParticipantSessionResult[]> {
	return http.get<ParticipantSessionResult[]>(PATH)
}

// Fetch a session by ID; return null on 404 and rethrow other errors.
export async function getSession(id: string): Promise<ParticipantSessionResult | null> {
	try {
		// Fetch the resource; the catch block handles missing records.
		return await http.get<ParticipantSessionResult>(`${PATH}/${id}`)
	} catch (error) {
		// Return null on 404; rethrow other errors.
		if (isNotFound(error)) return null
		throw error
	}
}

// Submit a session; the backend generates its ID and start time.
export async function submitSession(
	input: Omit<ParticipantSessionResult, 'id' | 'startedAt'>,
): Promise<ParticipantSessionResult> {
	return http.post<ParticipantSessionResult>(PATH, {
		experimentCode: input.experimentCode,
		participantCode: input.participantCode,
		finishedAt: input.finishedAt,
		answers: input.answers,
		events: input.events,
	})
}

// Create an empty local session for the experiment and participant.
export function emptySession(
	experiment: Experiment,
	participantCode: string,
): ParticipantSessionResult {
	return {
		id: `sess-${Date.now()}`,
		experimentCode: experiment.code,
		participantCode,
		startedAt: new Date().toISOString(),
		finishedAt: null,
		answers: [],
		events: [],
	}
}
