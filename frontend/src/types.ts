/** 与后端约定的数据类型。前端只接收展示所需字段，不接收密码哈希。 */
export type UserRole = "researcher" | "participant" | "administrator";
export type ExperimentStatus = "draft" | "published" | "closed";
export type StageType = "consent" | "questionnaire" | "task";

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
	content: Record<string, unknown>;
	timeLimit: number | null;
}

export interface StageSubmissionResult {
	nextStageId: string | null;
}

export interface RegisterResult {
	email: string;
}

export interface Stage {
	id: string;
	type: StageType;
	title: string;
	position: number;
	timeLimit: number | null;
	content: Record<string, unknown>;
}

export type StageInput = Pick<Stage, "type" | "title" | "position" | "timeLimit" | "content">;

export interface Experiment {
	id: string;
	name: string;
	code: string;
	status: ExperimentStatus;
	fullscreenMode: boolean;
	createdAt: string;
	stages?: Stage[];
}

export interface ExperimentInput {
	name: string;
	fullscreenMode: boolean;
	stages: StageInput[];
}

export interface LoginPayloads {
	researcher: { email: string; password: string };
	participant: { experiment_code: string; participant_code: string };
	administrator: { password: string };
}
