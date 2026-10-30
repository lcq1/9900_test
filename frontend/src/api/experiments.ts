// Experiment API using camelCase fields and backend creation timestamps.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Experiment } from '../types'
import { useSessionStore } from '../auth/sessionStore'
import { downloadFile, http } from './http'

// Experiment creation payload; the backend supplies optional defaults.
export type ExperimentInput = {
	id?: string
	name: string
	code?: string
	status?: Experiment['status']
	fullScreen?: boolean
	stages: Experiment['stages']
}

// Experiment endpoint.
const PATH = '/experiments'

// Fetch experiments.
export async function listExperiments(): Promise<Experiment[]> {
	return http.get<Experiment[]>(PATH)
}

// Create an experiment and return the saved result.
export async function createExperiment(input: ExperimentInput): Promise<Experiment> {
	return http.post<Experiment>(PATH, input)
}

// Patch an experiment and return the saved result.
export const updateExperiment = (id: string, patch: Partial<Experiment>) =>
	http.patch<Experiment>(PATH + '/' + id, patch)

// Delete the experiment.
export async function removeExperiment(id: string): Promise<void> {
	await http.del(`${PATH}/${id}`)
}
export const getResultsSummary = (id: string) =>
	http.get<{ completed_count: number; incomplete_count: number }>(PATH + '/' + id + '/results/summary')
export const downloadResults = (id: string) => downloadFile(PATH + '/' + id + '/results.csv', 'experiment_results.csv')
export function useExperiments() {
	const session = useSessionStore((s) => s.session),
		client = useQueryClient(),
		key = ['experiments', session?.researcher.id]
	const query = useQuery({
		queryKey: key,
		queryFn: listExperiments,
		enabled: !!session,
	})
	const create = useMutation({
		mutationFn: createExperiment,
		onSuccess: () => client.invalidateQueries({ queryKey: key }),
	})
	const update = useMutation({
		mutationFn: ({ id, patch }: { id: string; patch: Partial<Experiment> }) => updateExperiment(id, patch),
		onSuccess: () => client.invalidateQueries({ queryKey: key }),
	})
	const remove = useMutation({
		mutationFn: removeExperiment,
		onSuccess: () => client.invalidateQueries({ queryKey: key }),
	})
	return {
		experiments: query.data ?? [],
		loading: query.isPending,
		error: query.error,
		addExperiment: create.mutateAsync,
		saveExperiment: (e: Experiment) => update.mutateAsync({ id: e.id, patch: e }),
		removeExperiment: remove.mutateAsync,
	}
}
