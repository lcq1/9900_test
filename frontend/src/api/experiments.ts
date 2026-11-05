// Experiment API using camelCase fields and backend creation timestamps.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Experiment } from '../types'
import { useSessionStore } from '../auth/sessionStore'
import { downloadFile, http } from './http'

export type ExperimentInput = {
	id?: string
	code?: string
	status?: Experiment['status']
	name: string
	stages: Experiment['stages']
	fullScreen?: boolean
	storageNotice?: string
}

// Experiment endpoint.
const PATH = '/experiments'
export const listExperiments = () => http.get<Experiment[]>(PATH)
export const createExperiment = (input: ExperimentInput) =>
	http.post<Experiment>(PATH, input)
export const updateExperiment = (
	id: string,
	patch: Partial<Experiment> & {
		publish?: boolean
		publishRequestId?: string
	},
) => http.patch<Experiment>(PATH + '/' + id, patch)
export const removeExperiment = (id: string) => http.del<void>(PATH + '/' + id)
export const getResultsSummary = (id: string) =>
	http.get<{ completed_count: number; incomplete_count: number }>(PATH + '/' + id + '/results/summary')
export const downloadResults = (id: string) =>
	downloadFile(PATH + '/' + id + '/results.xlsx', 'experiment.xlsx')

export const downloadExperimentCsv = (id: string, view: 'answers' | 'activity') =>
	downloadFile(PATH + '/' + encodeURIComponent(id) + '/results.csv?view=' + view,
		'experiment_' + view + '.csv')

export interface ExperimentAIKeyStatus {
	hasCustomKey: boolean
	configured: boolean
	provider: string
	model: string
	hasCustomSettings?: boolean
	useCommon?: boolean
	apiBase?: string
	stream?: boolean
	timeoutSeconds?: number
	temperature?: number | null
	systemPrompt?: string | null
	maxPromptChars?: number
	historyMessages?: number
	historyMessageChars?: number
}
export type ExperimentAISettingsInput = Omit<ExperimentAIKeyStatus, 'hasCustomKey' | 'hasCustomSettings' | 'configured' | 'useCommon'>
const aiSettingsPath = (id: string) => id === '__common__' ? '/workspace/ai-config' : PATH + '/' + encodeURIComponent(id) + '/ai-key'
export const getExperimentAIKey = (id: string) =>
	http.get<ExperimentAIKeyStatus>(aiSettingsPath(id))
export const testExperimentAIConnection = (id: string) =>
	http.post<void>(aiSettingsPath(id) + '/test')
export const saveExperimentAIKey = (id: string, apiKey: string, configuration?: ExperimentAISettingsInput) =>
	http.patch<ExperimentAIKeyStatus>(aiSettingsPath(id),
		{ ...configuration, ...(apiKey ? { apiKey } : {}) })
export const removeExperimentAIKey = (id: string) =>
	http.del<ExperimentAIKeyStatus>(aiSettingsPath(id))
export const setExperimentAISource = (id: string, useCommon: boolean) =>
	http.patch<ExperimentAIKeyStatus>(aiSettingsPath(id), { useCommon })
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
		mutationFn: ({
			id,
			patch,
		}: {
			id: string
			patch: Partial<Experiment> & {
				publish?: boolean
				publishRequestId?: string
			}
		}) => updateExperiment(id, patch),
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
		saveExperiment: (
			e: Experiment & { publish?: boolean; publishRequestId?: string },
		) => update.mutateAsync({ id: e.id, patch: e }),
		removeExperiment: remove.mutateAsync,
	}
}

export interface StorageSettings {
	location: string
	locations: string[]
}
export const getStorageSettings = () =>
	http.get<StorageSettings>('/workspace/storage')
export const saveStorageSettings = (location: string) =>
	http.patch<StorageSettings>('/workspace/storage', { location })


export type ParticipantCode = { code: string; revoked: boolean }
const participantCodesPath = (id: string) => PATH + '/' + encodeURIComponent(id) + '/participant-codes'
export const listParticipantCodes = (id: string) => http.get<ParticipantCode[]>(participantCodesPath(id))
export const issueParticipantCode = (id: string) => http.post<ParticipantCode>(participantCodesPath(id))
export const revokeParticipantCode = (id: string, code: string) =>
	http.del<void>(participantCodesPath(id) + '/' + encodeURIComponent(code))

export const addStorageLocation = (location: string) =>
	http.post<StorageSettings>('/workspace/storage/locations', { location })
