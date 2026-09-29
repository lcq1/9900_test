import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Flex, Input, Spin, Typography } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { participantApi } from "../api";
import { participantError } from "../participant/participantError";

const { Paragraph, Text, Title } = Typography;

// 作答页只进入后端返回的下一阶段；当前文本输入是后端内容格式未定时的占位。
export default function ParticipantStagePage() {
	const { stageId } = useParams();
	const navigate = useNavigate();
	const [answer, setAnswer] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [completed, setCompleted] = useState(false);
	const { data: stage, isPending, error } = useQuery({
		queryKey: ["participant-stage", stageId],
		queryFn: () => participantApi.getStage(stageId!),
		enabled: Boolean(stageId),
		retry: false,
	});

	async function submitResponse() {
		if (!stageId || !answer.trim()) return;
		setSubmitting(true);
		setSubmitError(null);
		try {
			const result = await participantApi.submitStageResponse(stageId, { text: answer.trim() });
			if (result.nextStageId) {
				setAnswer("");
				navigate("/participant/session", { replace: true });
			} else {
				setCompleted(true);
			}
		} catch (reason) {
			setSubmitError(participantError(reason));
		} finally {
			setSubmitting(false);
		}
	}

	if (isPending) return <Spin size="large" />;
	if (error || !stage) return <Alert type="info" showIcon message={participantError(error)} />;

	return (
		<Card>
			<Title level={2}>{stage.title}</Title>
			{stage.timeLimit && <Paragraph>Time limit: {stage.timeLimit} seconds</Paragraph>}
			<Paragraph>{stage.components.map((component) => component.text).filter(Boolean).join("\n")}</Paragraph>
			{completed ? <Alert type="success" showIcon message="You have completed the experiment." /> : (
				<>
					<label className="field-label" htmlFor="participant-response">Your response</label>
					<Input.TextArea id="participant-response" rows={5} value={answer} onChange={(event) => setAnswer(event.target.value)} />
					{submitError && <Alert type="error" showIcon message={submitError} className="page-alert" />}
					<Flex justify="end" className="stage-submit"><Button type="primary" loading={submitting} disabled={!answer.trim()} onClick={() => void submitResponse()}>Submit and continue</Button></Flex>
				</>
			)}
			<Text type="secondary">Stage ID: {stageId}</Text>
		</Card>
	);
}
