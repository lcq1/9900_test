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
		const timer = window.setTimeout(() => setDismissed(notice.revision), 2600)
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
	storageKey?: string
}

export function useTimerController({
	initialSeconds,
	enabled,
	stageId,
	storageKey,
}: TimerControllerOptions) {
	const readDeadline = useCallback(
		() =>
			storageKey ? Number(localStorage.getItem(storageKey)) || null : null,
		[storageKey],
	)
	const [remaining, setRemaining] = useState(() => {
		const deadline = readDeadline()
		return deadline
			? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
			: initialSeconds
	})
	useEffect(() => {
		if (!storageKey) return
		let deadline = readDeadline()
		if (!deadline && enabled) {
			deadline = Date.now() + initialSeconds * 1000
			localStorage.setItem(storageKey, String(deadline))
		}
		let last = Date.now()
		const update = () => {
			const now = Date.now()
			const elapsed = now - last
			last = now
			const stored = readDeadline()
			if (stored && !enabled) {
				// Paused / interaction-locked: shift the persisted absolute
				// deadline forward by the elapsed time instead of letting it run
				// out. The visible countdown freezes, and the deadline written to
				// storage stays correct for a resume after a page refresh.
				deadline = stored + elapsed
				localStorage.setItem(storageKey, String(deadline))
			} else {
				deadline = stored
			}
			setRemaining(
				deadline
					? Math.max(0, Math.ceil((deadline - now) / 1000))
					: initialSeconds,
			)
		}
		update()
		if (!deadline) return
		const id = setInterval(update, 250)
		return () => clearInterval(id)
	}, [storageKey, enabled, stageId, initialSeconds, readDeadline])
	useEffect(() => {
		if (!enabled || storageKey) return
		const id = setInterval(
			() => setRemaining((value) => Math.max(0, value - 1)),
			1000,
		)
		return () => clearInterval(id)
	}, [enabled, stageId, initialSeconds, storageKey])
	const reset = (value: SetStateAction<number>) => {
		setRemaining((previous) => {
			const next = typeof value === 'function' ? value(previous) : value
			if (storageKey)
				localStorage.setItem(storageKey, String(Date.now() + next * 1000))
			return next
		})
	}
	return { remaining, reset }
}
