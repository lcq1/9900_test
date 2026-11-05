/**
 * ProgressStore.ts — per-session progress: current stage index + collected answers.
 *
 * Persisted to localStorage keyed by session id so a participant session can be
 * resumed and so the researcher can later inspect collected responses.
 */

import { safeGetItem, safeSetItem } from './safeStorage'

export type AnswerValue = string | string[]

export interface CollectedAnswers {
	[componentId: string]: AnswerValue
}

export interface ProgressSnapshot {
	sessionId: string
	stageIndex: number
	answers: CollectedAnswers
}

/** Tracks the current stage index and the answers collected so far. */
export class ProgressStore {
	private readonly sessionId: string
	private stageIndexValue = 0
	private answersValue: CollectedAnswers = {}

	constructor(sessionId: string) {
		this.sessionId = sessionId
		this.load()
	}

	private storageKey(): string {
		return `p13-progress:${this.sessionId}`
	}

	private load(): void {
		const raw = safeGetItem(this.storageKey())
		if (!raw) return
		try {
			const parsed = JSON.parse(raw) as ProgressSnapshot
			this.stageIndexValue = parsed.stageIndex ?? 0
			this.answersValue = parsed.answers ?? {}
		} catch {
			this.stageIndexValue = 0
			this.answersValue = {}
		}
	}

	private save(): void {
		const snapshot: ProgressSnapshot = {
			sessionId: this.sessionId,
			stageIndex: this.stageIndexValue,
			answers: this.answersValue,
		}
		safeSetItem(this.storageKey(), JSON.stringify(snapshot))
	}

	/** The current 0-based stage index. */
	get stageIndex(): number {
		return this.stageIndexValue
	}

	setStageIndex(index: number): void {
		this.stageIndexValue = index
		this.save()
	}

	/** All collected answers (defensive copy). */
	get answers(): CollectedAnswers {
		return { ...this.answersValue }
	}

	getAnswer(componentId: string): AnswerValue | undefined {
		return this.answersValue[componentId]
	}

	setAnswer(componentId: string, value: AnswerValue): void {
		this.answersValue = { ...this.answersValue, [componentId]: value }
		this.save()
	}

	/** Reset progress (used when a session is abandoned). */
	clear(): void {
		this.stageIndexValue = 0
		this.answersValue = {}
		this.save()
	}
}

/** A resumable runtime checkpoint, stored in existing browser and event storage. */
export interface RuntimeProgress {
	/** First stage without a confirmed server submission, supplied on session entry. */
	unlockedStageIndex?: number
	paused?: boolean
	remainingSeconds?: number
	sessionId: string
	updatedAt: number
	stageIndex: number
	answers: CollectedAnswers
	consentedStageId: string | null
	attachments: Record<string, string>
	extended: Record<string, boolean>
	oralIndex: number
	oralStarted: boolean
	conversations?: Record<string, string>
	deadlines: Record<string, number>
}
export function readRuntimeProgress(
	sessionId: string,
): RuntimeProgress | undefined {
	try {
		return (
			JSON.parse(safeGetItem('p13-runtime:' + sessionId) ?? 'null') ??
			undefined
		)
	} catch {
		return undefined
	}
}
/** Detail above this size is a base64 attachment or signature image. */
const CHECKPOINT_VALUE_LIMIT = 4096

/**
 * If durable storage is full, keep the navigation/deadline state but drop the
 * bulky inline media from the local checkpoint. The full values remain in the
 * event timeline, which is autosaved to the study server.
 */
function compactProgress(progress: RuntimeProgress): RuntimeProgress {
	const answers: CollectedAnswers = {}
	for (const [id, value] of Object.entries(progress.answers)) {
		const oversized = Array.isArray(value)
			? value.some((item) => item.length > CHECKPOINT_VALUE_LIMIT)
			: value.length > CHECKPOINT_VALUE_LIMIT
		if (!oversized) answers[id] = value
	}
	return { ...progress, answers }
}

export function saveRuntimeProgress(progress: RuntimeProgress): void {
	const key = 'p13-runtime:' + progress.sessionId
	safeSetItem(
		key,
		JSON.stringify(progress),
		JSON.stringify(compactProgress(progress)),
	)
}
