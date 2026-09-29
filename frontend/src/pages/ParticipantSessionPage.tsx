import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Card, Progress, Spin, Typography } from "antd";
import { participantApi } from "../api";
import { participantError } from "../participant/participantError";
import StageRenderer from "../participant/stage-runner/StageRenderer";

export default function ParticipantSessionPage() {
	const queryClient = useQueryClient();
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const { data, isPending, error } = useQuery({ queryKey: ["participant-session"], queryFn: participantApi.getSession, retry: false });

	async function submit(answers: Record<string, unknown>) {
		setSubmitting(true);
		setSubmitError(null);
		try {
			await participantApi.submitCurrentStage(answers);
			await queryClient.invalidateQueries({ queryKey: ["participant-session"] });
		} catch (reason) {
			setSubmitError(participantError(reason));
		} finally {
			setSubmitting(false);
		}
	}

	if (isPending) return <Spin size="large" />;
	if (error || !data) return <Alert type="error" showIcon message={participantError(error)} />;
	if (data.status === "completed" || !data.currentStage) {
		return <Card className="finish-card"><Typography.Title level={2}>That’s the end — thank you!</Typography.Title><Typography.Paragraph>Your session is complete and your data is saved.</Typography.Paragraph></Card>;
	}

	return (
		<div className={data.fullscreenMode ? "participant-session fullscreen-session" : "participant-session"}>
			<Typography.Title level={4}>{data.experimentName}</Typography.Title>
			<Progress percent={data.progress} />
			{submitError && <Alert type="error" showIcon message={submitError} className="page-alert" />}
			<StageRenderer stage={data.currentStage} submitting={submitting} onSubmit={submit} />
		</div>
	);
}
