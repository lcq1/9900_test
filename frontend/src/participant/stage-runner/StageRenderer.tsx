import { useEffect, useMemo, useState } from "react";
import { Button, Card, Flex, Modal, Space, Statistic, Tag, Typography } from "antd";
import type { ParticipantStageView } from "../../types";
import { logParticipantEvent } from "../event-logger/eventLogger";
import ComponentRenderer from "./ComponentRenderer";

interface Props {
	stage: ParticipantStageView;
	submitting: boolean;
	onSubmit: (answers: Record<string, unknown>) => Promise<void>;
}

export default function StageRenderer({ stage, submitting, onSubmit }: Props) {
	const [answers, setAnswers] = useState<Record<string, unknown>>({});
	const [secondsLeft, setSecondsLeft] = useState(stage.timeLimit);
	const [paused, setPaused] = useState(false);
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		setAnswers({});
		setSecondsLeft(stage.timeLimit);
		void logParticipantEvent(stage.id, "stage_entered");
	}, [stage.id, stage.timeLimit]);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setNow(new Date());
			if (!paused) setSecondsLeft((value) => value === null ? null : Math.max(0, value - 1));
		}, 1000);
		return () => window.clearInterval(timer);
	}, [paused]);

	const requiredComplete = useMemo(() => stage.components.every((component) => !component.required || Boolean(answers[component.id])), [answers, stage.components]);

	async function submit() {
		if (!requiredComplete) return;
		if (stage.doubleConfirm) {
			Modal.confirm({ title: "Confirm submission", content: "After confirmation, this stage will be submitted.", onOk: () => onSubmit(answers) });
			return;
		}
		await onSubmit(answers);
	}

	return (
		<Card className="participant-stage" onCopy={(event) => stage.copyPasteLogging && void logParticipantEvent(stage.id, "copy", { text: window.getSelection()?.toString() ?? "" })} onPaste={(event) => stage.copyPasteLogging && void logParticipantEvent(stage.id, "paste", { text: event.clipboardData.getData("text") })}>
			<Flex justify="space-between" align="start" gap="middle" wrap>
				<div><Typography.Text type="secondary">Stage {stage.position + 1}</Typography.Text><Typography.Title level={2}>{stage.title}</Typography.Title></div>
				<Space wrap>{stage.showClock && <Statistic title="Current time" value={now.toLocaleTimeString()} />}{secondsLeft !== null && <Statistic title="Time remaining" value={secondsLeft} suffix="s" />}</Space>
			</Flex>
			<Space wrap className="stage-flags">
				{stage.screenRecording && <Tag color="blue">Screen recording</Tag>}
				{stage.audioRecording && <Tag color="blue">Audio recording</Tag>}
				{stage.videoRecording && <Tag color="blue">Video recording</Tag>}
				{stage.copyPasteLogging && <Tag color="blue">Copy/paste logging</Tag>}
				{stage.aiEnabled && <Tag color="gold">Text AI enabled</Tag>}
			</Space>
			<div className="stage-components">
				{stage.components.map((component) => <ComponentRenderer key={component.id} component={component} value={answers[component.id]} onChange={(value) => setAnswers((current) => ({ ...current, [component.id]: value }))} />)}
			</div>
			<Flex justify="space-between" align="center" className="stage-submit">
				{stage.allowPause ? <Button onClick={() => { setPaused((value) => !value); void logParticipantEvent(stage.id, paused ? "resumed" : "paused"); }}>{paused ? "Resume" : "Pause"}</Button> : <span />}
				<Button type="primary" loading={submitting} disabled={!requiredComplete || paused} onClick={() => void submit()}>Submit and continue</Button>
			</Flex>
		</Card>
	);
}
