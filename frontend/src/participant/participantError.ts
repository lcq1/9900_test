import { ApiNotConnectedError } from "../api";

// Participant 页面共用的英文错误提示。
export function participantError(error: unknown): string {
	return error instanceof ApiNotConnectedError
		? "The participant service is not connected yet. Please try again later."
		: "This step could not be completed. Please try again.";
}
