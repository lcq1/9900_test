import { useEffect, useState } from 'react'
import type { Experiment, Stage } from '../types'
import { seedExperiments } from '../constants'
import { getSession } from '../auth/sessionStore'
import * as api from '../api/experiments'

/**
 * Data-access layer for experiments, backed by the FastAPI backend.
 *
 * The hook keeps an optimistic local copy of experiments for instant UI updates
 * and mirrors every mutation to the server. On mount it hydrates from
 * GET /experiments; when the backend is empty it seeds the demo experiments so
 * the workspace is never blank. When no session token is present yet (not
 * signed in) it shows the in-memory seeds and re-fetches once authenticated.
 *
 * Public surface (unchanged): { experiments, addExperiment, removeExperiment,
 * updateExperiment(id, fn), updateStage(expId, stageId, fn), addStage(expId,
 * stage), deleteStage(expId, stageId), reorderStages(expId, from, to) }.
 */
export function useExperiments() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [error, setError] = useState<string | null>(null)
  const token = getSession()?.token ?? null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const remote = await api.listExperiments()
        if (cancelled) return
        if (remote.length > 0) {
          setExperiments(remote)
          return
        }
        if (token) {
          const seeded: Experiment[] = []
          for (const e of seedExperiments) {
            try {
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
              seeded.push(e)
            }
          }
          if (!cancelled) setExperiments(seeded)
        } else {
          setExperiments(seedExperiments)
        }
      } catch {
        if (!cancelled) setExperiments(seedExperiments)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  /**
   * Surface — never swallow — a persistence failure. A researcher who edits an
   * experiment must know if the server rejected the save (expired token, network
   * drop, code clash) instead of seeing a false "saved" state and losing work on
   * refresh. P0 #3.
   */
  const fail = (message: string) => setError(message)

  /** Mirror a full experiment back to the server (used by every field mutation). */
  const persist = (experiment: Experiment) => {
    setError(null)
    api
      .updateExperiment(experiment.id, {
        name: experiment.name,
        code: experiment.code,
        status: experiment.status,
        fullScreen: experiment.fullScreen,
        stages: experiment.stages,
      })
      .catch(() => fail('Could not save changes to the server. Your edits are kept in this tab but may be lost if you refresh the page.'))
  }

  const addExperiment = (experiment: Experiment) => {
    setError(null)
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
      .catch(() => fail('Could not create the experiment on the server. It exists in this tab but will not survive a page refresh.'))
  }

  const removeExperiment = (id: string) => {
    setError(null)
    setExperiments((current) => current.filter((e) => e.id !== id))
    api.removeExperiment(id).catch(() => fail('Could not delete the experiment on the server.'))
  }

  const updateExperiment = (id: string, update: (e: Experiment) => Experiment) => {
    setExperiments((current) => {
      const next = current.map((e) => (e.id === id ? update(e) : e))
      const updated = next.find((e) => e.id === id)
      if (updated) persist(updated)
      return next
    })
  }

  const updateStage = (experimentId: string, stageId: string, update: (s: Stage) => Stage) =>
    updateExperiment(experimentId, (e) => ({
      ...e,
      stages: e.stages.map((s) => (s.id === stageId ? update(s) : s)),
    }))

  const addStage = (experimentId: string, stage: Stage) =>
    updateExperiment(experimentId, (e) => ({ ...e, stages: [...e.stages, stage] }))

  const deleteStage = (experimentId: string, stageId: string) =>
    updateExperiment(experimentId, (e) => ({
      ...e,
      stages: e.stages.filter((s) => s.id !== stageId),
    }))

  const reorderStages = (experimentId: string, from: number, to: number) =>
    updateExperiment(experimentId, (e) => {
      const stages = [...e.stages]
      if (from < 0 || from >= stages.length || to < 0 || to >= stages.length) return e
      const [moved] = stages.splice(from, 1)
      stages.splice(to, 0, moved)
      return { ...e, stages }
    })

  return {
    experiments,
    error,
    clearError: () => setError(null),
    addExperiment,
    removeExperiment,
    updateExperiment,
    updateStage,
    addStage,
    deleteStage,
    reorderStages,
  }
}
