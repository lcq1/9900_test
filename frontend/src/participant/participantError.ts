import { ApiError } from "../api";

// Participant 页面共用的英文错误提示。
export function participantError(error: unknown): string {
	return error instanceof ApiError ? error.message : "This step could not be completed. Please try again.";
}
