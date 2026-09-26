import { ApiNotConnectedError } from "../api";
import type { ExperimentStatus, StageInput, StageType } from "../types";

// 实验页面共用的英文展示文案和固定阶段顺序。
export const statusLabels: Record<ExperimentStatus, string> = { draft: "Draft", published: "Published", closed: "Closed" };
export const stageLabels: Record<StageType, string> = { consent: "Consent", questionnaire: "Questionnaire", task: "Task" };
export const stageOrder: StageType[] = ["consent", "questionnaire", "task"];

export function readableError(error: unknown): string {
	return error instanceof ApiNotConnectedError ? "The backend API is not connected yet. Experiments cannot be loaded or saved." : "The operation failed. Please try again later.";
}

export function createStage(type: StageType, position: number): StageInput {
	return { type, title: stageLabels[type], position, timeLimit: null, content: { text: "" } };
}
