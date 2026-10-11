// Experiment API using camelCase fields and backend creation timestamps.
import type { Experiment } from '../types'
import { http, isNotFound } from './http'

// Experiment endpoint.
const PATH = '/experiments'

// Experiment creation payload; the backend supplies optional defaults.
export type ExperimentInput = {
	id?: string
	name: string
	code: string
	status?: Experiment['status']
	fullScreen?: boolean
	stages?: Experiment['stages']
}

// Fetch experiments.
export async function listExperiments(): Promise<Experiment[]> {
	return http.get<Experiment[]>(PATH)
}

// Fetch an experiment by ID; return null on 404 and rethrow other errors.
export async function getExperiment(id: string): Promise<Experiment | null> {
	try {
		// Fetch the resource; the catch block handles missing records.
		return await http.get<Experiment>(`${PATH}/${id}`)
	} catch (error) {
		// Return null on 404; rethrow other errors.
		if (isNotFound(error)) return null
		throw error
	}
}

// Create an experiment and return the saved result.
export async function createExperiment(input: ExperimentInput): Promise<Experiment> {
	return http.post<Experiment>(PATH, input)
}

// Patch an experiment and return the saved result.
export async function updateExperiment(
	id: string,
	patch: Partial<Omit<Experiment, 'id' | 'created'>>,
): Promise<Experiment> {
	return http.patch<Experiment>(`${PATH}/${id}`, patch)
}

// Delete the experiment.
export async function removeExperiment(id: string): Promise<void> {
	await http.del(`${PATH}/${id}`)
}
