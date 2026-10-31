import { useEffect, useState } from 'react'

interface TimerControllerOptions {
  initialSeconds: number
  enabled: boolean
  stageId: string
}

export function useTimerController({ initialSeconds, enabled, stageId }: TimerControllerOptions) {
  const [remaining, setRemaining] = useState(initialSeconds)
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(id)
  }, [enabled, stageId, initialSeconds])
  return { remaining, reset: setRemaining }
}
