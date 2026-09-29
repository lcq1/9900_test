import { participantApi } from "../../api";

const sequenceKey = "participant-event-sequence";

function nextSequence(): number {
	const current = Number(window.sessionStorage.getItem(sequenceKey) ?? "-1") + 1;
	window.sessionStorage.setItem(sequenceKey, String(current));
	return current;
}

export async function logParticipantEvent(stageId: string | null, eventType: string, payload: Record<string, unknown> = {}): Promise<void> {
	const safePayload = Object.fromEntries(Object.entries(payload).filter(([key]) => !["password", "participantCode", "participant_code", "token"].includes(key)));
	await participantApi.logEvents([{
		stageId,
		eventType,
		payload: safePayload,
		clientTimestamp: new Date().toISOString(),
		clientSequence: nextSequence(),
	}]);
}
