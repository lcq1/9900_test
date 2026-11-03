import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import {
	onStorageDegraded,
	safeGetItem,
	safeRemoveItem,
	safeSetItem,
	storageDegraded,
} from '../src/participant/safeStorage'
import {
	readRuntimeProgress,
	saveRuntimeProgress,
	type RuntimeProgress,
} from '../src/participant/ProgressStore'
import { EventQueue } from '../src/participant/EventQueue'
import { useTimerController } from '../src/participant/TimerController'
import { AppErrorBoundary } from '../src/AppErrorBoundary'

const quotaError = () =>
	new DOMException('Quota exceeded', 'QuotaExceededError')

function checkpoint(
	answers: Record<string, string | string[]>,
): RuntimeProgress {
	return {
		sessionId: 'quota-session',
		updatedAt: 1,
		stageIndex: 2,
		answers,
		consentedStageId: null,
		attachments: {},
		extended: {},
		oralIndex: 0,
		oralStarted: false,
		deadlines: { task: Date.now() + 60000 },
	}
}

afterEach(() => {
	vi.restoreAllMocks()
	for (const key of [
		'quota-key',
		'notify-key',
		'p13-runtime:quota-session',
		'p13-events:queue-session',
		'p13-timer:timer-session',
	]) safeRemoveItem(key)
	localStorage.clear()
	vi.useRealTimers()
})

describe('participant storage degradation', () => {
	it('never throws on a full quota and keeps the value readable on this page', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw quotaError()
		})
		expect(() => safeSetItem('quota-key', 'hello')).not.toThrow()
		expect(safeGetItem('quota-key')).toBe('hello')
		expect(storageDegraded()).toBe(true)
	})

	it('persists a compact checkpoint and drops only bulky inline media', () => {
		const original = Storage.prototype.setItem
		let first = true
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
			this: Storage,
			key: string,
			value: string,
		) {
			if (first) {
				first = false
				throw quotaError()
			}
			return original.call(this, key, value)
		})
		const big = 'data:image/png;base64,' + 'A'.repeat(9000)
		expect(() =>
			saveRuntimeProgress(checkpoint({ short: 'ok', attachment: big })),
		).not.toThrow()
		const restored = readRuntimeProgress('quota-session')
		expect(restored?.answers.short).toBe('ok')
		expect(restored?.answers.attachment).toBeUndefined()
		expect(restored?.stageIndex).toBe(2)
		expect(restored?.deadlines.task).toBeGreaterThan(0)
	})

	it('keeps recording events when the timeline cannot be persisted', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw quotaError()
		})
		const queue = new EventQueue('queue-session')
		expect(() =>
			queue.record('answer', { componentId: 'q1', value: 'A' }),
		).not.toThrow()
		expect(queue.all().some((event) => event.type === 'answer')).toBe(true)
		expect(queue.exportJson()).toContain('q1')
	})

	it('does not throw while freezing a countdown when storage writes fail', () => {
		vi.useFakeTimers()
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw quotaError()
		})
		const { result, rerender, unmount } = renderHook(
			({ enabled }: { enabled: boolean }) =>
				useTimerController({
					initialSeconds: 60,
					enabled,
					stageId: 'task',
					storageKey: 'timer-session',
				}),
			{ initialProps: { enabled: true } },
		)
		act(() => vi.advanceTimersByTime(1000))
		expect(result.current.remaining).toBe(59)
		rerender({ enabled: false })
		expect(() => act(() => vi.advanceTimersByTime(5000))).not.toThrow()
		expect(result.current.remaining).toBe(59)
		unmount()
	})

	it('notifies subscribers when durable storage recovers', () => {
		const observed: boolean[] = []
		const unsubscribe = onStorageDegraded((value) => observed.push(value))
		const original = Storage.prototype.setItem
		const spy = vi
			.spyOn(Storage.prototype, 'setItem')
			.mockImplementation(() => {
				throw quotaError()
			})
		safeSetItem('notify-key', 'x')
		spy.mockImplementation(function (this: Storage, key: string, value: string) {
			return original.call(this, key, value)
		})
		safeSetItem('notify-key', 'y')
		unsubscribe()
		expect(observed[observed.length - 1]).toBe(false)
	})

	it('shows a recovery panel instead of a blank page on a render error', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		const Broken = () => {
			throw new Error('boom')
		}
		render(
			<AppErrorBoundary>
				<Broken />
			</AppErrorBoundary>,
		)
		expect(screen.getByText('Something went wrong')).toBeDefined()
		expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined()
	})
})
