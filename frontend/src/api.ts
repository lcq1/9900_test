import type { CurrentUser, Experiment, ExperimentInput, LoginPayloads, ParticipantExperimentOverview, ParticipantLoginResult, ParticipantStageView, RegisterResult, StageSubmissionResult } from "./types";

/**
 * 前后端通信契约集中在这里。当前阶段只完成前端，方法刻意留空。
 * 后端接入时在各方法中发送请求并返回 data；不要在浏览器保存密码、
 * Participant Code、Session ID，也不要由前端自行授予角色或生成实验代码。
 */
export class ApiNotConnectedError extends Error {
	constructor() {
		super("The backend API is not connected yet.");
		this.name = "ApiNotConnectedError";
	}
}

function notConnected<T>(): Promise<T> {
	return Promise.reject(new ApiNotConnectedError());
}

export const authApi = {
	// TODO: GET /api/auth/me。浏览器带 HttpOnly Cookie，刷新后由服务端恢复身份。
	me: (): Promise<CurrentUser> => notConnected(),
	// TODO: POST /api/auth/researcher/login。服务端校验密码并设置 Session Cookie。
	researcherLogin: (_body: LoginPayloads["researcher"]): Promise<CurrentUser> => notConnected(),
	// TODO: POST /api/auth/participant/login。返回当前实验和答题进度。
	participantLogin: (_body: LoginPayloads["participant"]): Promise<ParticipantLoginResult> => notConnected(),
	// TODO: POST /api/auth/administrator/login。仅传管理员密码。
	administratorLogin: (_body: LoginPayloads["administrator"]): Promise<CurrentUser> => notConnected(),
	// TODO: POST /api/auth/researcher/register。返回标准化邮箱，不返回密码。
	researcherRegister: (_body: LoginPayloads["researcher"]): Promise<RegisterResult> => notConnected(),
	// TODO: POST /api/auth/logout。服务端销毁 Session，前端再清空身份状态。
	logout: (): Promise<void> => notConnected(),
};

export const experimentApi = {
	// TODO: GET /api/experiments。服务端按当前 Researcher 身份限定 owner_id。
	list: (): Promise<Experiment[]> => notConnected(),
	// TODO: GET /api/experiments/:experimentId。服务端再次校验所有权。
	get: (_experimentId: string): Promise<Experiment> => notConnected(),
	// TODO: POST /api/experiments。code/id 仅由服务端生成。
	create: (_input: ExperimentInput): Promise<Experiment> => notConnected(),
	// TODO: PUT /api/experiments/:experimentId。包含设置和有序 Stage 列表。
	update: (_experimentId: string, _input: ExperimentInput): Promise<Experiment> => notConnected(),
	// TODO: DELETE /api/experiments/:experimentId。服务端决定物理删除或软删除。
	remove: (_experimentId: string): Promise<void> => notConnected(),
};

export const participantApi = {
	// TODO: GET /api/participant/experiment。仅返回当前 Participant 的实验、同意书和进度。
	getExperiment: (): Promise<ParticipantExperimentOverview> => notConnected(),
	// TODO: POST /api/participant/consent。服务端记录明确的同意/不同意选择。
	submitConsent: (_accepted: boolean): Promise<void> => notConnected(),
	// TODO: GET /api/participant/stages/:stageId。服务端验证当前 Stage 的访问权限。
	getStage: (_stageId: string): Promise<ParticipantStageView> => notConnected(),
	// TODO: POST /api/participant/stages/:stageId/responses。提交答案并返回下一 Stage ID。
	submitStageResponse: (_stageId: string, _answerData: Record<string, unknown>): Promise<StageSubmissionResult> => notConnected(),
};
