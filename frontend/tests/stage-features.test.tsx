import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { StageFeatureEditor } from '../src/researcher/StageFeatureEditor'
import { StageClock } from '../src/participant/StageRenderer'
import { createStage, type Stage } from '../src/types'

function FeatureHarness() {
	const [stage, setStage] = useState<Stage>(() => createStage('single_choice'))
	return (
		<>
			<StageFeatureEditor stage={stage} onUpdateStage={setStage} />
			<output data-testid="stage">{JSON.stringify(stage)}</output>
		</>
	)
}

describe('stage feature panel', () => {
	afterEach(cleanup)

	it('exposes the clock, confirmation and pause/abort switches', () => {
		render(<FeatureHarness />)
		const read = () =>
			JSON.parse(screen.getByTestId('stage').textContent!) as {
				features: Record<string, boolean>
			}

		// Every flag the participant runtime reads must be reachable from the UI.
		for (const [label, key, initial] of [
			['Stage clock', 'clock', true],
			['Confirm before changing stage', 'confirm', false],
			['Pause and abort controls', 'pauseAbort', false],
		] as const) {
			expect(read().features[key]).toBe(initial)
			fireEvent.click(screen.getByRole('button', { name: label }))
			expect(read().features[key]).toBe(!initial)
		}
	})

	it('keeps the count of enabled features in step with the new switches', () => {
		render(<FeatureHarness />)
		const counter = () =>
			document.querySelector('.feature-count')?.textContent ?? ''
		// A single-choice stage has seven rows (no copy-paste logging) and starts
		// with countdown, clock and screen recording enabled.
		expect(counter()).toContain('3/7')
		fireEvent.click(
			screen.getByRole('button', { name: 'Pause and abort controls' }),
		)
		expect(counter()).toContain('4/7')
	})
})

describe('stage clock', () => {
	afterEach(() => {
		cleanup()
		vi.useRealTimers()
	})

	it('advances without a running countdown', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-11-06T09:00:00'))
		render(<StageClock />)
		const first = screen.getByRole('timer', { name: 'Current time' })
			.textContent
		expect(first).toBeTruthy()

		act(() => {
			vi.advanceTimersByTime(61_000)
		})

		expect(
			screen.getByRole('timer', { name: 'Current time' }).textContent,
		).not.toBe(first)
	})
})
