/**
 * TimerController.ts — small reusable countdown controller.
 *
 * Provides both a framework-agnostic `CountdownController` class and a React
 * hook `useTimerController` that drives it with an interval. StageRenderer uses
 * the hook to power its minutes:seconds countdown without owning the logic.
 */
import { useEffect, useState } from 'react'

export interface TimerControllerOptions {
  initialSeconds: number
  autoStart?: boolean
  intervalMs?: number
}

export interface TimerController {
  remaining: number
  running: boolean
  start: () => void
  pause: () => void
  reset: (value?: number) => void
  toggle: () => void
}

/** Framework-agnostic countdown state machine. */
export class CountdownController {
  private readonly initial: number
  private remainingValue: number
  private runningValue = false

  constructor(initialSeconds: number) {
    this.initial = Math.max(0, initialSeconds)
    this.remainingValue = this.initial
  }

  get remaining(): number {
    return this.remainingValue
  }

  get running(): boolean {
    return this.runningValue
  }

  start(): void {
    this.runningValue = true
  }

  pause(): void {
    this.runningValue = false
  }

  reset(value?: number): void {
    this.remainingValue = Math.max(0, value ?? this.initial)
  }

  /** Advance one tick; returns the new remaining value (floors at 0). */
  tick(): number {
    if (this.remainingValue > 0) this.remainingValue -= 1
    return this.remainingValue
  }
}

/** React hook wrapping a CountdownController with an interval-driven ticker. */
export function useTimerController(options: TimerControllerOptions): TimerController {
  const { initialSeconds, autoStart = false, intervalMs = 1000 } = options
  // Hold the controller instance in state (created once via the lazy
  // initialiser) rather than reading a ref during render — reading `ref.current`
  // in the render phase is what previously tripped the lint rules.
  const [controller] = useState(() => new CountdownController(initialSeconds))

  const [remaining, setRemaining] = useState(() => controller.remaining)
  const [running, setRunning] = useState(autoStart)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const next = controller.tick()
      setRemaining(next)
      if (next <= 0) {
        clearInterval(id)
        setRunning(false)
      }
    }, intervalMs)
    return () => clearInterval(id)
  }, [running, intervalMs, controller])

  const start = () => {
    controller.start()
    setRunning(true)
  }
  const pause = () => {
    controller.pause()
    setRunning(false)
  }
  const reset = (value?: number) => {
    controller.reset(value)
    setRemaining(controller.remaining)
  }
  const toggle = () => (running ? pause() : start())

  return { remaining, running, start, pause, reset, toggle }
}
