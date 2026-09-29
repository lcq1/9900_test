/** 与后端约定的数据类型。前端只接收展示所需字段，不接收密码哈希。 */
export type UserRole = "researcher" | "participant" | "administrator";
export type ExperimentStatus = "draft" | "published" | "closed";
export type StageTemplateType = "consent" | "questionnaire" | "task" | "static";
export type StageComponentType = "heading" | "text" | "attachment" | "checkbox" | "signature" | "short_text" | "long_text" | "single_choice" | "multiple_choice" | "rating_scale" | "button" | "workspace" | "ai_assistant";

export interface StageComponent {
	id: string;
	type: StageComponentType;
	text?: string;
	label?: string;
	required?: boolean;
	options?: string[];
}

export interface CurrentUser {
	id: string;
	role: UserRole;
	email?: string;
}

export interface ParticipantLoginResult {
	user: CurrentUser;
	experimentId: string;
	currentStageId: string | null;
	progress: number;
}

export interface ParticipantExperimentOverview {
	id: string;
	name: string;
	consentText: string;
	currentStageId: string | null;
	progress: number;
	fullscreenMode: boolean;
}

export interface ParticipantStageView {
	id: string;
	title: string;
	position: number;
	templateType: StageTemplateType | null;
	components: StageComponent[];
	timeLimit: number | null;
	timerEndAction: "next_stage" | "offer_extra_time";
	extraTimeSeconds: number | null;
	screenRecording: boolean;
	audioRecording: boolean;
	videoRecording: boolean;
	copyPasteLogging: boolean;
	allowBack: boolean;
	doubleConfirm: boolean;
	allowPause: boolean;
	showClock: boolean;
	aiEnabled: boolean;
}

export interface StageSubmissionResult {
	nextStageId: string | null;
	status: "in_progress" | "completed";
	currentStage: ParticipantStageView | null;
}

export interface ParticipantSessionView {
	status: "in_progress" | "completed";
	experimentId: string;
	experimentName: string;
	fullscreenMode: boolean;
	progress: number;
	currentStage: ParticipantStageView | null;
}

export interface RegisterResult {
	email: string;
}

export interface ResearcherAccount {
	id: string;
	email: string;
	status: string;
	createdAt: string;
}

export interface ParticipantProvisioned {
	participantId: string;
	participantCode: string;
}

export interface Stage {
	id: string;
	templateType: StageTemplateType | null;
	title: string;
	position: number;
	timeLimit: number | null;
	components: StageComponent[];
	timerEndAction: "next_stage" | "offer_extra_time";
	extraTimeSeconds: number | null;
	screenRecording: boolean;
	audioRecording: boolean;
	videoRecording: boolean;
	copyPasteLogging: boolean;
	allowBack: boolean;
	doubleConfirm: boolean;
	allowPause: boolean;
	showClock: boolean;
	aiEnabled: boolean;
}

export type StageInput = Omit<Stage, "id">;

export interface Experiment {
	id: string;
	name: string;
	code: string;
	status: ExperimentStatus;
	fullscreenMode: boolean;
	dataStorageDescription: string;
	storageLocation: string;
	participantSafetyInformation: string;
	createdAt: string;
	stages?: Stage[];
}

export interface ExperimentInput {
	name: string;
	fullscreenMode: boolean;
	dataStorageDescription: string;
	storageLocation: string;
	participantSafetyInformation: string;
	stages: StageInput[];
	status?: ExperimentStatus;
}

export interface ParticipantEventInput {
	stageId: string | null;
	eventType: string;
	payload: Record<string, unknown>;
	clientTimestamp: string;
	clientSequence: number;
}

export interface LoginPayloads {
	researcher: { email: string; password: string };
	participant: { experiment_code: string; participant_code: string };
	administrator: { password: string };
}
