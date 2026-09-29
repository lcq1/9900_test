import axios, { AxiosError } from "axios";
import { demoAdministratorApi, demoExperimentApi, demoParticipantApi } from "./auth/demoApi";
import { getDemoSessionRole } from "./auth/demoAuth";
import type {
	CurrentUser,
	Experiment,
	ExperimentInput,
	LoginPayloads,
	ParticipantEventInput,
	ParticipantExperimentOverview,
	ParticipantLoginResult,
	ParticipantSessionView,
	ParticipantStageView,
	ParticipantProvisioned,
	RegisterResult,
	ResearcherAccount,
	StageSubmissionResult,
} from "./types";

interface ApiEnvelope<T> {
	data: T;
	message: string;
}

interface ApiErrorBody {
	detail?: string;
	error?: { message?: string };
}

export class ApiError extends Error {
	status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

const client = axios.create({
	baseURL: "/api",
	withCredentials: true,
	timeout: 15_000,
	headers: { "Content-Type": "application/json" },
});

function apiError(reason: unknown): ApiError {
	if (reason instanceof AxiosError) {
		const body = reason.response?.data as ApiErrorBody | undefined;
		return new ApiError(
			body?.detail ?? body?.error?.message ?? "The request failed. Please try again.",
			reason.response?.status,
		);
	}
	return new ApiError("The request failed. Please try again.");
}

async function getData<T>(request: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
	try {
		return (await request).data.data;
	} catch (reason) {
		throw apiError(reason);
	}
}

async function sendWithoutData(request: Promise<unknown>): Promise<void> {
	try {
		await request;
	} catch (reason) {
		throw apiError(reason);
	}
}

export const authApi = {
	me: (): Promise<CurrentUser> => getData(client.get("/auth/me")),
	researcherLogin: (body: LoginPayloads["researcher"]): Promise<CurrentUser> =>
		getData(client.post("/auth/researcher/login", body)),
	participantLogin: (body: LoginPayloads["participant"]): Promise<ParticipantLoginResult> =>
		getData(client.post("/auth/participant/login", body)),
	administratorLogin: (body: LoginPayloads["administrator"]): Promise<CurrentUser> =>
		getData(client.post("/auth/administrator/login", body)),
	researcherRegister: (body: LoginPayloads["researcher"]): Promise<RegisterResult> =>
		getData(client.post("/auth/researcher/register", body)),
	logout: (): Promise<void> => getDemoSessionRole() ? Promise.resolve() : sendWithoutData(client.post("/auth/logout")),
};

export const experimentApi = {
	list: (): Promise<Experiment[]> => getDemoSessionRole() === "researcher" ? demoExperimentApi.list() : getData(client.get("/experiments")),
	get: (experimentId: string): Promise<Experiment> => getDemoSessionRole() === "researcher" ? demoExperimentApi.get(experimentId) : getData(client.get(`/experiments/${experimentId}`)),
	create: (input: ExperimentInput): Promise<Experiment> => getDemoSessionRole() === "researcher" ? demoExperimentApi.create(input) : getData(client.post("/experiments", input)),
	update: (experimentId: string, input: ExperimentInput): Promise<Experiment> =>
		getDemoSessionRole() === "researcher" ? demoExperimentApi.update(experimentId, input) : getData(client.put(`/experiments/${experimentId}`, input)),
	remove: (experimentId: string): Promise<void> => getDemoSessionRole() === "researcher" ? demoExperimentApi.remove(experimentId) : sendWithoutData(client.delete(`/experiments/${experimentId}`)),
	provisionParticipant: (experimentId: string): Promise<ParticipantProvisioned> =>
		getDemoSessionRole() === "researcher" ? demoExperimentApi.provisionParticipant() : getData(client.post(`/experiments/${experimentId}/participants`, {})),
};

export const participantApi = {
	getSession: (): Promise<ParticipantSessionView> => getDemoSessionRole() === "participant" ? demoParticipantApi.getSession() : getData(client.get("/participant/session")),
	submitCurrentStage: (answerData: Record<string, unknown>): Promise<StageSubmissionResult> =>
		getDemoSessionRole() === "participant" ? demoParticipantApi.submitCurrentStage() : getData(client.post("/participant/session/current-stage/responses", { answerData })),
	logEvents: (events: ParticipantEventInput[]): Promise<{ accepted: number; serverTimestamp: string }> =>
		getDemoSessionRole() === "participant" ? demoParticipantApi.logEvents(events) : getData(client.post("/participant/session/events/batch", { events })),
	getExperiment: (): Promise<ParticipantExperimentOverview> => getDemoSessionRole() === "participant" ? demoParticipantApi.getExperiment() : getData(client.get("/participant/experiment")),
	submitConsent: (accepted: boolean): Promise<void> =>
		getDemoSessionRole() === "participant" ? demoParticipantApi.submitConsent() : sendWithoutData(client.post("/participant/consent", { accepted })),
	getStage: (stageId: string): Promise<ParticipantStageView> =>
		getDemoSessionRole() === "participant" ? demoParticipantApi.getStage(stageId) : getData(client.get(`/participant/stages/${stageId}`)),
	submitStageResponse: (stageId: string, answerData: Record<string, unknown>): Promise<StageSubmissionResult> =>
		getDemoSessionRole() === "participant" ? demoParticipantApi.submitCurrentStage() : getData(client.post(`/participant/stages/${stageId}/responses`, { answerData })),
};

export const administratorApi = {
	listResearchers: (): Promise<ResearcherAccount[]> => getDemoSessionRole() === "administrator" ? demoAdministratorApi.listResearchers() : getData(client.get("/administrator/researchers")),
	listExperiments: (): Promise<Experiment[]> => getDemoSessionRole() === "administrator" ? demoAdministratorApi.listExperiments() : getData(client.get("/administrator/experiments")),
};
