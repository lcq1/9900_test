/**
 * ProgressStore.ts — per-session progress: current stage index + collected answers.
 *
 * Persisted to localStorage keyed by session id so a participant session can be
 * resumed and so the researcher can later inspect collected responses.
 */

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
    const raw = localStorage.getItem(this.storageKey())
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
    localStorage.setItem(this.storageKey(), JSON.stringify(snapshot))
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
