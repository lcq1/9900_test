import type {
	Experiment,
	ExperimentInput,
	ParticipantEventInput,
	ParticipantExperimentOverview,
	ParticipantProvisioned,
	ParticipantSessionView,
	ParticipantStageView,
	ResearcherAccount,
	Stage,
	StageSubmissionResult,
} from "../types";

const experimentsKey = "experiment-platform-demo-experiments";
const participantStageKey = "experiment-platform-demo-participant-stage";

const demoStages: Stage[] = [
	{
		id: "demo-welcome",
		templateType: "static",
		title: "Welcome",
		position: 1,
		timeLimit: null,
		components: [
			{ id: "welcome-heading", type: "heading", text: "Welcome to the demo experiment" },
			{ id: "welcome-text", type: "text", text: "This browser-only session demonstrates the participant workflow deployed on Vercel." },
		],
		timerEndAction: "next_stage",
		extraTimeSeconds: null,
		screenRecording: false,
		audioRecording: false,
		videoRecording: false,
		copyPasteLogging: true,
		allowBack: false,
		doubleConfirm: false,
		allowPause: false,
		showClock: true,
		aiEnabled: false,
	},
	{
		id: "demo-questionnaire",
		templateType: "questionnaire",
		title: "Demo questionnaire",
		position: 2,
		timeLimit: null,
		components: [
			{ id: "demo-rating", type: "rating_scale", label: "How clear was this demo?", required: true },
			{ id: "demo-comment", type: "long_text", label: "Optional comments", required: false },
		],
		timerEndAction: "next_stage",
		extraTimeSeconds: null,
		screenRecording: false,
		audioRecording: false,
		videoRecording: false,
		copyPasteLogging: true,
		allowBack: false,
		doubleConfirm: true,
		allowPause: false,
		showClock: false,
		aiEnabled: false,
	},
];

const initialExperiment: Experiment = {
	id: "demo-experiment",
	name: "Vercel Demo Experiment",
	code: "DEMO-EXP",
	status: "published",
	fullscreenMode: false,
	dataStorageDescription: "Demo data is retained only in this browser session.",
	storageLocation: "Browser session storage",
	participantSafetyInformation: "This is a public demonstration and does not collect research data.",
	createdAt: "2026-09-30T00:00:00.000Z",
	stages: demoStages,
};

function readExperiments(): Experiment[] {
	const stored = window.sessionStorage.getItem(experimentsKey);
	if (!stored) return [initialExperiment];
	try {
		return JSON.parse(stored) as Experiment[];
	} catch {
		return [initialExperiment];
	}
}

function writeExperiments(experiments: Experiment[]): void {
	window.sessionStorage.setItem(experimentsKey, JSON.stringify(experiments));
}

function stageFromInput(stage: ExperimentInput["stages"][number], index: number): Stage {
	return { ...stage, id: `demo-stage-${Date.now()}-${index}` };
}

function participantStageIndex(): number {
	return Number(window.sessionStorage.getItem(participantStageKey) ?? "0");
}

function participantSession(): ParticipantSessionView {
	const index = participantStageIndex();
	const currentStage = demoStages[index] ?? null;
	return {
		status: currentStage ? "in_progress" : "completed",
		experimentId: initialExperiment.id,
		experimentName: initialExperiment.name,
		fullscreenMode: false,
		progress: Math.round((Math.min(index, demoStages.length) / demoStages.length) * 100),
		currentStage,
	};
}

export const demoExperimentApi = {
	list: async (): Promise<Experiment[]> => readExperiments(),
	get: async (experimentId: string): Promise<Experiment> => {
		const experiment = readExperiments().find((item) => item.id === experimentId);
		if (!experiment) throw new Error("Demo experiment not found.");
		return experiment;
	},
	create: async (input: ExperimentInput): Promise<Experiment> => {
		const experiment: Experiment = {
			...input,
			id: `demo-experiment-${Date.now()}`,
			code: `DEMO-${String(Date.now()).slice(-6)}`,
			status: input.status ?? "draft",
			createdAt: new Date().toISOString(),
			stages: input.stages.map(stageFromInput),
		};
		writeExperiments([...readExperiments(), experiment]);
		return experiment;
	},
	update: async (experimentId: string, input: ExperimentInput): Promise<Experiment> => {
		const experiments = readExperiments();
		const current = experiments.find((item) => item.id === experimentId);
		if (!current) throw new Error("Demo experiment not found.");
		const updated: Experiment = {
			...current,
			...input,
			status: input.status ?? current.status,
			stages: input.stages.map((stage, index) => ({ ...stage, id: current.stages?.[index]?.id ?? `demo-stage-${Date.now()}-${index}` })),
		};
		writeExperiments(experiments.map((item) => item.id === experimentId ? updated : item));
		return updated;
	},
	remove: async (experimentId: string): Promise<void> => {
		writeExperiments(readExperiments().filter((item) => item.id !== experimentId));
	},
	provisionParticipant: async (): Promise<ParticipantProvisioned> => ({
		participantId: "demo-participant",
		participantCode: "DEMO-PART",
	}),
};

export const demoParticipantApi = {
	getSession: async (): Promise<ParticipantSessionView> => participantSession(),
	submitCurrentStage: async (): Promise<StageSubmissionResult> => {
		const nextIndex = participantStageIndex() + 1;
		window.sessionStorage.setItem(participantStageKey, String(nextIndex));
		const currentStage = demoStages[nextIndex] ?? null;
		return {
			nextStageId: currentStage?.id ?? null,
			status: currentStage ? "in_progress" : "completed",
			currentStage,
		};
	},
	logEvents: async (events: ParticipantEventInput[]): Promise<{ accepted: number; serverTimestamp: string }> => ({
		accepted: events.length,
		serverTimestamp: new Date().toISOString(),
	}),
	getExperiment: async (): Promise<ParticipantExperimentOverview> => {
		const session = participantSession();
		return {
			id: session.experimentId,
			name: session.experimentName,
			consentText: "This is a browser-only public demonstration.",
			currentStageId: session.currentStage?.id ?? null,
			progress: session.progress,
			fullscreenMode: session.fullscreenMode,
		};
	},
	submitConsent: async (): Promise<void> => undefined,
	getStage: async (stageId: string): Promise<ParticipantStageView> => {
		const stage = demoStages.find((item) => item.id === stageId);
		if (!stage) throw new Error("Demo stage not found.");
		return stage;
	},
};

export const demoAdministratorApi = {
	listResearchers: async (): Promise<ResearcherAccount[]> => [{
		id: "demo-researcher",
		email: "researcher@example.com",
		status: "active",
		createdAt: initialExperiment.createdAt,
	}],
	listExperiments: async (): Promise<Experiment[]> => readExperiments(),
};
