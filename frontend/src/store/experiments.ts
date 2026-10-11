import { useEffect, useState } from 'react'
import type { Experiment, Stage } from '../types'
import { seedExperiments } from '../constants'
import { getSession } from '../auth/sessionStore'
import * as api from '../api/experiments'

// Sync experiments with sample fallback and authenticated seeding; failed writes do not roll back.
export function useExperiments() {
	// Update local experiments before syncing writes to the backend.
	const [experiments, setExperiments] = useState<Experiment[]>([])
	const token = getSession()?.token ?? null

	// Load data and ignore results after unmount.
	useEffect(() => {
		let cancelled = false
		void (async () => {
			// Load initial data and handle results or errors.
			try {
				// Fetch the backend experiment list.
				const remote = await api.listExperiments()
				if (cancelled) return
				if (remote.length > 0) {
					// Use backend experiments when available.
					setExperiments(remote)
					return
				}
				if (token) {
					// Seed an empty backend when logged in.
					const seeded: Experiment[] = []
					for (const e of seedExperiments) {
						// Create sample experiments sequentially.
						try {
							// Create the sample experiment and retain the backend result.
							seeded.push(
								await api.createExperiment({
									id: e.id,
									name: e.name,
									code: e.code,
									status: e.status,
									fullScreen: e.fullScreen,
									stages: e.stages,
								}),
							)
						} catch {
							// Keep the local sample if creation fails.
							seeded.push(e)
						}
					}
					if (!cancelled) setExperiments(seeded)
				} else {
					// Use local samples when logged out.
					setExperiments(seedExperiments)
				}
			} catch {
				// Fall back to samples on load failure unless unmounted.
				if (!cancelled) setExperiments(seedExperiments)
			}
		})()
		return () => {
			// Ignore pending results after unmount.
			cancelled = true
		}
	}, [token])

	// Sync editable experiment fields to the backend.
	const persist = (experiment: Experiment) => {
		api
			.updateExperiment(experiment.id, {
				name: experiment.name,
				code: experiment.code,
				status: experiment.status,
				fullScreen: experiment.fullScreen,
				stages: experiment.stages,
			})
			.catch(() => {
				// Keep local changes if backend sync fails.
			})
	}

	// Add the experiment locally, then sync it to the backend.
	const addExperiment = (experiment: Experiment) => {
		setExperiments((current) => [...current, experiment])
		api
			.createExperiment({
				id: experiment.id,
				name: experiment.name,
				code: experiment.code,
				status: experiment.status,
				fullScreen: experiment.fullScreen,
				stages: experiment.stages,
			})
			.catch(() => {
				// Keep local changes if backend sync fails.
			})
	}

	// Delete the experiment.
	const removeExperiment = (id: string) => {
		setExperiments((current) => current.filter((e) => e.id !== id))
		api.removeExperiment(id).catch(() => {
			// Keep local changes if backend sync fails.
		})
	}

	// Update the experiment by ID and sync the result.
	const updateExperiment = (id: string, update: (e: Experiment) => Experiment) => {
		setExperiments((current) => {
			// Update the matching experiment and sync its changes.
			const next = current.map((e) => (e.id === id ? update(e) : e))
			const updated = next.find((e) => e.id === id)
			if (updated) persist(updated)
			return next
		})
	}

	// Update the matching stage while preserving other stages.
	const updateStage = (experimentId: string, stageId: string, update: (s: Stage) => Stage) =>
		updateExperiment(experimentId, (e) => ({
			...e,
			stages: e.stages.map((s) => (s.id === stageId ? update(s) : s)),
		}))

	// Append a stage to the experiment.
	const addStage = (experimentId: string, stage: Stage) =>
		updateExperiment(experimentId, (e) => ({ ...e, stages: [...e.stages, stage] }))

	// Remove the stage from the experiment.
	const deleteStage = (experimentId: string, stageId: string) =>
		updateExperiment(experimentId, (e) => ({
			...e,
			stages: e.stages.filter((s) => s.id !== stageId),
		}))

	// Copy and reorder stages; ignore out-of-range indices.
	const reorderStages = (experimentId: string, from: number, to: number) =>
		updateExperiment(experimentId, (e) => {
			// Copy the stage list before reordering.
			const stages = [...e.stages]
			if (from < 0 || from >= stages.length || to < 0 || to >= stages.length) return e
			const [moved] = stages.splice(from, 1)
			stages.splice(to, 0, moved)
			return { ...e, stages }
		})

	return {
		experiments,
		addExperiment,
		removeExperiment,
		updateExperiment,
		updateStage,
		addStage,
		deleteStage,
		reorderStages,
	}
}
