export type RecordingKind = "screen" | "audio" | "video";

export async function requestRecordingStream(kind: RecordingKind): Promise<MediaStream> {
	if (kind === "screen") return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
	return navigator.mediaDevices.getUserMedia({
		audio: true,
		video: kind === "video",
	});
}

export function stopRecordingStream(stream: MediaStream): void {
	for (const track of stream.getTracks()) track.stop();
}
