/**
 * EventQueue.ts — precise participant event timeline (Plan.md core requirement).
 *
 * Records participant events with SUB-SECOND precision by combining:
 *   - `Date.now()` / ISO wall clock        → aligns with external sensors
 *   - `performance.now()` offset           → sub-second ordering within a session
 *
 * The queue is persisted to localStorage so a session can be resumed / exported,
 * and exported as a single JSON timeline.
 */

import { safeGetItem, safeSetItem } from './safeStorage'

export type ParticipantEventType =
	| 'progress_checkpoint'
	| 'fullscreen_enter'
	| 'fullscreen_exit'
	| 'timer_extension'
  | 'oral_question'
  | 'stage_view'
	| 'answer'
	| 'ai_prompt'
	| 'ai_reply'
	| 'ai_error'
	| 'copy'
	| 'paste'
	| 'recording_start'
	| 'recording_stop'
	| 'timer_tick'
	| 'timer_milestone'
	| 'navigation'
	| 'abort'
	| 'pause'
	| 'resume'
	| 'consent'
	| 'stage_exit'
	| 'clock_sync'
	| 'recording_media'

export interface ParticipantEvent {
  /** Monotonic sequence number within the session. */
  seq: number
  type: ParticipantEventType
  /** Wall-clock ISO timestamp (aligned to external sensors). */
  timestamp: string
  /** Unix epoch milliseconds (Date.now()). */
  epochMs: number
  /** Monotonic high-resolution offset in ms (performance.now()). */
  perfMs: number
  stageId?: string
  detail?: Record<string, unknown>
}

export interface EventQueueSnapshot {
  sessionId: string
  exportedAt: string
  events: ParticipantEvent[]
}

/** Capture a sub-second-precise timestamp (wall clock + performance clock). */
export function preciseNow(): {
  timestamp: string
  epochMs: number
  perfMs: number
} {
  const epochMs = Date.now()
  const perfMs = typeof performance !== 'undefined' ? performance.now() : epochMs
  return { timestamp: new Date(epochMs).toISOString(), epochMs, perfMs }
}

/** In-memory, localStorage-persisted queue of participant events. */
export class EventQueue {
	private readonly sessionId: string
	private events: ParticipantEvent[] = []
	private seq = 0
	private offsetMs = 0

	setClock(serverEpochMs: number, sent: number, received: number): void {
		this.offsetMs = serverEpochMs - (sent + received) / 2
		this.record('clock_sync', {
			offsetMs: this.offsetMs,
			roundTripMs: received - sent,
			uncertaintyMs: (received - sent) / 2,
		})
	}

	constructor(sessionId: string, initialEvents: ParticipantEvent[] = []) {
		this.sessionId = sessionId
		this.load()
		if (Math.max(-1, ...initialEvents.map(e => e.seq)) > Math.max(-1, ...this.events.map(e => e.seq))) { this.events = initialEvents; this.seq = Math.max(0, ...initialEvents.map(e => e.seq + 1)); this.save() }
	}

	private storageKey(): string {
		return `p13-events:${this.sessionId}`
	}

	private load(): void {
		const raw = safeGetItem(this.storageKey())
		if (!raw) return
		try {
			const parsed = JSON.parse(raw) as {
				events?: ParticipantEvent[]
				seq?: number
			}
			this.events = Array.isArray(parsed.events) ? parsed.events : []
			this.seq = parsed.seq ?? this.events.length
		} catch {
			this.events = []
			this.seq = 0
		}
	}

	private save(): void {
		safeSetItem(
			this.storageKey(),
			JSON.stringify({ events: this.events, seq: this.seq }),
		)
	}

	/** Record a single event and persist it. */
	record(
		type: ParticipantEventType,
		detail?: Record<string, unknown>,
		stageId?: string,
	): ParticipantEvent {
		const now = preciseNow()
		const epochMs = Math.round(now.epochMs + this.offsetMs)
		const timestamp = new Date(epochMs).toISOString()
		const perfMs = now.perfMs
		const event: ParticipantEvent = {
			seq: this.seq++,
			type,
			timestamp,
			epochMs,
			perfMs,
		}
		if (stageId !== undefined) event.stageId = stageId
		if (detail !== undefined) event.detail = detail
		if (type === 'progress_checkpoint') this.events = this.events.filter(e => e.type !== 'progress_checkpoint')
		this.events.push(event)
		this.save()
		return event
	}

	/** All recorded events (defensive copy). */
	all(): ParticipantEvent[] {
		return [...this.events]
	}

	/** Number of recorded events. */
	count(): number {
		return this.events.length
	}

	/** Empty the queue. */
	clear(): void {
		this.events = []
		this.seq = 0
		this.save()
	}

	/** Export a precise event timeline (Plan.md requirement) as pretty JSON. */
	exportJson(): string {
		const snapshot: EventQueueSnapshot = {
			sessionId: this.sessionId,
			exportedAt: new Date().toISOString(),
			events: this.all(),
		}
		return JSON.stringify(snapshot, null, 2)
	}
}
