import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Space, Spin, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { authApi, participantApi } from "../api";
import { participantError } from "../participant/participantError";
import { useSession } from "../session";

const { Paragraph, Title } = Typography;

// Participant 只按后端确认的实验进入知情同意流程。
export default function ConsentPage() {
	const navigate = useNavigate();
	const clearSession = useSession((state) => state.clear);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const { data: experiment, isPending, error } = useQuery({ queryKey: ["participant-experiment"], queryFn: participantApi.getExperiment, retry: false });

	async function decline() {
		setSubmitting(true);
		// 拒绝同意不应困住用户；即使服务暂不可用，也允许回到登录页。
		try {
			await participantApi.submitConsent(false);
		} catch {
			// 后端未接入或请求失败时，前端仍会离开知情同意流程。
		}
		try {
			await authApi.logout();
		} catch {
			// 服务端接入后仍需校验 Session；前端不能把失败当作已记录同意。
		}
		clearSession();
		navigate("/login/participant", { replace: true });
	}

	async function agree() {
		if (!experiment?.consentText.trim()) return;
		setSubmitting(true);
		setSubmitError(null);
		try {
			// 只有服务端记录同意成功，才能进入测试介绍页。
			await participantApi.submitConsent(true);
			navigate("/participant/experiment");
		} catch (reason) {
			setSubmitError(participantError(reason));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Card>
			<Title level={2}>Informed consent</Title>
			{isPending && <Spin />}
			{error && <Alert type="info" showIcon message={participantError(error)} className="page-alert" />}
			{experiment?.consentText && <Paragraph className="consent-text">{experiment.consentText}</Paragraph>}
			{!isPending && !experiment?.consentText && <Paragraph type="secondary">Consent details are unavailable. You can return to sign in.</Paragraph>}
			{submitError && <Alert type="error" showIcon message={submitError} className="page-alert" />}
			<Space wrap>
				<Button loading={submitting} onClick={() => void decline()}>I do not agree</Button>
				<Button type="primary" loading={submitting} disabled={!experiment?.consentText.trim()} onClick={() => void agree()}>I agree</Button>
			</Space>
		</Card>
	);
}
