import type { CurrentUser, ParticipantLoginResult } from "../types";

// 固定凭据仅供本地前端演示；生产环境必须由后端验证身份。
export const demoCredentials = {
	researcher: { email: "researcher@example.com", password: "Researcher123!" },
	participant: { experimentCode: "DEMO-EXP", participantCode: "DEMO-PART" },
	administrator: { password: "AdminDemo123!" },
} as const;

const demoSessionKey = "experiment-platform-demo-role";
const demoUsers: Record<CurrentUser["role"], CurrentUser> = {
	researcher: { id: "demo-researcher", role: "researcher", email: demoCredentials.researcher.email },
	participant: { id: "demo-participant", role: "participant" },
	administrator: { id: "demo-administrator", role: "administrator" },
};

function saveDemoSession(user: CurrentUser): CurrentUser {
	// 仅保存演示角色，不保存密码或 Participant Code；关闭浏览器标签后自动清除。
	window.sessionStorage.setItem(demoSessionKey, user.role);
	return user;
}

export function demoResearcherLogin(email: string, password: string): CurrentUser | null {
	if (!import.meta.env.DEV || email !== demoCredentials.researcher.email || password !== demoCredentials.researcher.password) return null;
	return saveDemoSession(demoUsers.researcher);
}

export function demoParticipantLogin(experimentCode: string, participantCode: string): ParticipantLoginResult | null {
	if (!import.meta.env.DEV || experimentCode !== demoCredentials.participant.experimentCode || participantCode !== demoCredentials.participant.participantCode) return null;
	const user = saveDemoSession(demoUsers.participant);
	return { user, experimentId: "demo-experiment", currentStageId: null, progress: 0 };
}

export function demoAdministratorLogin(password: string): CurrentUser | null {
	if (!import.meta.env.DEV || password !== demoCredentials.administrator.password) return null;
	return saveDemoSession(demoUsers.administrator);
}

export function restoreDemoSession(): CurrentUser | null {
	if (!import.meta.env.DEV) return null;
	const role = window.sessionStorage.getItem(demoSessionKey);
	return role === "researcher" || role === "participant" || role === "administrator" ? demoUsers[role] : null;
}

export function clearDemoSession(): void {
	window.sessionStorage.removeItem(demoSessionKey);
}
