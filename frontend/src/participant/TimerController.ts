import { useCallback, useEffect, useState, type SetStateAction } from 'react'

/** Hide feedback after its fade without clearing errors used by retry guards. */
export function useTransientNotice<T>(initial: T) {
	const [notice, setNotice] = useState({ value: initial, revision: 0 })
	const [dismissed, setDismissed] = useState<number | null>(null)
	const setValue = useCallback((value: SetStateAction<T>) => {
		setNotice((current) => ({
			value:
				typeof value === 'function'
					? (value as (previous: T) => T)(current.value)
					: value,
			revision: current.revision + 1,
		}))
	}, [])
	useEffect(() => {
		if (
			!notice.value ||
			(Array.isArray(notice.value) && notice.value.length === 0)
		)
			return
		const timer = window.setTimeout(
			() => setDismissed(notice.revision),
			2600,
		)
		return () => window.clearTimeout(timer)
	}, [notice])
	return [
		notice.value,
		setValue,
		dismissed !== notice.revision,
		notice.revision,
	] as const
}

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
