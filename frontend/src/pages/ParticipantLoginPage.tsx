import { useState } from "react";
import { Button, Form, Input, Typography } from "antd";
import { Link } from "react-router-dom";
import { authApi } from "../api";
import { showLoginError, useSuccessfulLogin } from "../auth/authSupport";
import { demoCredentials, demoModeEnabled, demoParticipantLogin } from "../auth/demoAuth";
import { CenteredCard } from "../components";

interface ParticipantFormValues { experimentCode: string; participantCode: string }
const { Paragraph, Title } = Typography;

// Participant 登录页只接收两个 Code，不提供其他身份验证方式。
export default function ParticipantLoginPage() {
	const [submitting, setSubmitting] = useState(false);
	const successfulLogin = useSuccessfulLogin();

	async function submit(values: ParticipantFormValues) {
		setSubmitting(true);
		try {
			const experimentCode = values.experimentCode.trim();
			const participantCode = values.participantCode.trim();
			// 演示账号只模拟身份，不记录真实实验或答题数据。
			const result = demoParticipantLogin(experimentCode, participantCode) ?? await authApi.participantLogin({ experiment_code: experimentCode, participant_code: participantCode });
			successfulLogin(result.user, "participant", "/participant/session");
		} catch {
			showLoginError();
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<CenteredCard>
			<Title level={2}>Participant sign in</Title>
			<Paragraph type="secondary">Enter your experiment and participant codes</Paragraph>
			{demoModeEnabled && <Paragraph type="secondary">Demo codes: {demoCredentials.participant.experimentCode} / {demoCredentials.participant.participantCode}</Paragraph>}
			<Form<ParticipantFormValues> layout="vertical" initialValues={demoModeEnabled ? demoCredentials.participant : undefined} onFinish={(values) => void submit(values)}>
				<Form.Item label="Experiment Code" name="experimentCode" normalize={(value: string) => value.trim()} rules={[
					{ required: true, message: "Enter your Experiment Code." },
					{ pattern: /^[A-Za-z0-9-]{4,64}$/, message: "Use 4–64 letters, numbers, or hyphens." },
				]}>
					<Input autoComplete="off" size="large" />
				</Form.Item>
				<Form.Item label="Participant Code" name="participantCode" normalize={(value: string) => value.trim()} rules={[
					{ required: true, message: "Enter your Participant Code." },
					{ pattern: /^[A-Za-z0-9-]{4,128}$/, message: "Use 4–128 letters, numbers, or hyphens." },
				]}>
					<Input autoComplete="off" size="large" />
				</Form.Item>
				<Button type="primary" htmlType="submit" loading={submitting} size="large" block>Sign in</Button>
			</Form>
			<Paragraph className="auth-footer"><Link to="/">Back to role selection</Link></Paragraph>
		</CenteredCard>
	);
}
