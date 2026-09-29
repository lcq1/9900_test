import { ApiError } from "../api";
import type { ExperimentStatus, StageInput, StageTemplateType } from "../types";

// Stage模板只是快速起点；Researcher可重复使用并自由排序。
export const statusLabels: Record<ExperimentStatus, string> = { draft: "Draft", published: "Published", closed: "Closed" };
export const stageLabels: Record<StageTemplateType, string> = { consent: "Consent", questionnaire: "Questionnaire", task: "Task", static: "Static page" };
export const stageTemplates: StageTemplateType[] = ["static", "consent", "questionnaire", "task"];

export function readableError(error: unknown): string {
	return error instanceof ApiError ? error.message : "The operation failed. Please try again later.";
}

export function createStage(templateType: StageTemplateType, position: number): StageInput {
	const componentType = templateType === "questionnaire" ? "single_choice" : templateType === "task" ? "workspace" : "text";
	return {
		templateType,
		title: stageLabels[templateType],
		position,
		timeLimit: null,
		components: [{ id: crypto.randomUUID(), type: componentType, text: "", required: componentType !== "text" }],
		timerEndAction: "next_stage",
		extraTimeSeconds: null,
		screenRecording: false,
		audioRecording: false,
		videoRecording: false,
		copyPasteLogging: false,
		allowBack: false,
		doubleConfirm: false,
		allowPause: false,
		showClock: false,
		aiEnabled: false,
	};
}
