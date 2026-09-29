import { useState } from "react";
import { Button, Form, Input, Tabs, Typography } from "antd";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../api";
import { EmailField, showLoginError, useSuccessfulLogin } from "../auth/authSupport";
import type { ResearcherFormValues } from "../auth/authSupport";
import { demoAdministratorLogin, demoCredentials, demoModeEnabled, demoParticipantLogin, demoResearcherLogin } from "../auth/demoAuth";
import { CenteredCard } from "../components";

interface ParticipantValues { experimentCode: string; participantCode: string }
interface AdministratorValues { password: string }

const { Paragraph, Title } = Typography;

export default function LoginPage() {
	const [searchParams] = useSearchParams();
	const [submitting, setSubmitting] = useState(false);
	const successfulLogin = useSuccessfulLogin();
	const registeredEmail = searchParams.get("email") ?? "";

	async function participantLogin(values: ParticipantValues) {
		setSubmitting(true);
		try {
			const experimentCode = values.experimentCode.trim();
			const participantCode = values.participantCode.trim();
			const result = demoParticipantLogin(experimentCode, participantCode)
				?? await authApi.participantLogin({ experiment_code: experimentCode, participant_code: participantCode });
			successfulLogin(result.user, "participant", "/participant/session");
		} catch {
			showLoginError();
		} finally {
			setSubmitting(false);
		}
	}

	async function researcherLogin(values: ResearcherFormValues) {
		setSubmitting(true);
		try {
			const email = values.email.trim().toLowerCase();
			const user = demoResearcherLogin(email, values.password)
				?? await authApi.researcherLogin({ email, password: values.password });
			successfulLogin(user, "researcher", "/researcher");
		} catch {
			showLoginError();
		} finally {
			setSubmitting(false);
		}
	}

	async function administratorLogin(values: AdministratorValues) {
		setSubmitting(true);
		try {
			const user = demoAdministratorLogin(values.password)
				?? await authApi.administratorLogin({ password: values.password });
			successfulLogin(user, "administrator", "/administrator");
		} catch {
			showLoginError();
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<CenteredCard>
			<Title level={2}>Sign in</Title>
			<Paragraph type="secondary">Select your role, then enter your details.</Paragraph>
			<Tabs
				defaultActiveKey="participant"
				items={[
					{
						key: "participant",
						label: "Participant",
						children: <Form<ParticipantValues> layout="vertical" initialValues={demoModeEnabled ? demoCredentials.participant : undefined} onFinish={(values) => void participantLogin(values)}>
							<Form.Item label="Experiment Code" name="experimentCode" rules={[{ required: true }, { pattern: /^[A-Za-z0-9-]{4,64}$/ }]}><Input autoComplete="off" size="large" /></Form.Item>
							<Form.Item label="Participant Code" name="participantCode" rules={[{ required: true }, { pattern: /^[A-Za-z0-9-]{4,128}$/ }]}><Input autoComplete="off" size="large" /></Form.Item>
							<Button type="primary" htmlType="submit" loading={submitting} block>Start / Continue</Button>
						</Form>,
					},
					{
						key: "researcher",
						label: "Researcher",
						children: <Form<ResearcherFormValues> layout="vertical" initialValues={registeredEmail ? { email: registeredEmail, password: "" } : demoModeEnabled ? demoCredentials.researcher : undefined} onFinish={(values) => void researcherLogin(values)}>
							<EmailField />
							<Form.Item label="Password" name="password" rules={[{ required: true }, { min: 8 }]}><Input.Password autoComplete="current-password" size="large" /></Form.Item>
							<Button type="primary" htmlType="submit" loading={submitting} block>Sign in</Button>
							<Paragraph className="auth-footer">New researcher? <Link to="/register/researcher">Create an account</Link></Paragraph>
						</Form>,
					},
					{
						key: "administrator",
						label: "Administrator",
						children: <Form<AdministratorValues> layout="vertical" initialValues={demoModeEnabled ? demoCredentials.administrator : undefined} onFinish={(values) => void administratorLogin(values)}>
							<Form.Item label="Administrator Password" name="password" rules={[{ required: true }, { min: 8 }]}><Input.Password autoComplete="current-password" size="large" /></Form.Item>
							<Button type="primary" htmlType="submit" loading={submitting} block>Sign in</Button>
						</Form>,
					},
				]}
			/>
		</CenteredCard>
	);
}
