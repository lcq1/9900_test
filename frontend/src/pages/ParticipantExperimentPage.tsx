import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Progress, Spin, Statistic, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { participantApi } from "../api";
import { participantError } from "../participant/participantError";

const { Paragraph, Title } = Typography;

// 测试介绍页仅使用后端给出的当前阶段和进度，不在浏览器推测下一阶段。
export default function ParticipantExperimentPage() {
	const navigate = useNavigate();
	const [now, setNow] = useState(() => new Date());
	const { data: experiment, isPending, error } = useQuery({ queryKey: ["participant-experiment"], queryFn: participantApi.getExperiment, retry: false });

	useEffect(() => {
		const timer = window.setInterval(() => setNow(new Date()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	return (
		<Card>
			<Title level={2}>{experiment?.name ?? "Experiment"}</Title>
			<Statistic title="Current time" value={now.toLocaleTimeString("en-US")} />
			{isPending && <Spin />}
			{error && <Alert type="info" showIcon message={participantError(error)} className="page-alert" />}
			{experiment && <Progress percent={Math.max(0, Math.min(100, experiment.progress))} status="active" />}
			<Paragraph type="secondary">Continue with the stage assigned to you.</Paragraph>
			<Button type="primary" disabled={!experiment?.currentStageId} onClick={() => navigate("/participant/session", { replace: true })}>
				Start / Continue
			</Button>
		</Card>
	);
}
