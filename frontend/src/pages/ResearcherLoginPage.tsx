import { useState } from "react";
import { Button, Form, Input, Typography } from "antd";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../api";
import { EmailField, showLoginError, useSuccessfulLogin } from "../auth/authSupport";
import { demoCredentials, demoModeEnabled, demoResearcherLogin } from "../auth/demoAuth";
import type { ResearcherFormValues } from "../auth/authSupport";
import { CenteredCard } from "../components";

const { Paragraph, Title } = Typography;

// 演示模式预填固定账号；注册返回时优先预填新邮箱，密码保持空白。
export default function ResearcherLoginPage() {
	const [searchParams] = useSearchParams();
	const [submitting, setSubmitting] = useState(false);
	const successfulLogin = useSuccessfulLogin();
	const registeredEmail = searchParams.get("email") ?? "";
	const initialValues = searchParams.has("email")
		? { email: registeredEmail, password: "" }
		: demoModeEnabled ? demoCredentials.researcher : { email: "", password: "" };

	async function submit(values: ResearcherFormValues) {
		setSubmitting(true);
		try {
			const email = values.email.trim().toLowerCase();
			// 演示账号由前端匹配；其他账号仍交由后端验证。
			const user = demoResearcherLogin(email, values.password) ?? await authApi.researcherLogin({ email, password: values.password });
			successfulLogin(user, "researcher", "/researcher");
		} catch {
			showLoginError();
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<CenteredCard>
			<Title level={2}>Researcher sign in</Title>
			<Paragraph type="secondary">Sign in with your email and password</Paragraph>
			{demoModeEnabled && <Paragraph type="secondary">Demo account: {demoCredentials.researcher.email} / {demoCredentials.researcher.password}</Paragraph>}
			<Form<ResearcherFormValues> key={registeredEmail} layout="vertical" initialValues={initialValues} onFinish={(values) => void submit(values)}>
				<EmailField />
				<Form.Item label="Password" name="password" rules={[{ required: true, message: "Enter your password." }, { min: 8, message: "Password must be at least 8 characters." }]}>
					<Input.Password autoComplete="current-password" size="large" />
				</Form.Item>
				<Button type="primary" htmlType="submit" loading={submitting} size="large" block>Sign in</Button>
			</Form>
			<Paragraph className="auth-footer">New researcher? <Link to="/register/researcher">Create an account</Link></Paragraph>
			<Paragraph className="auth-footer"><Link to="/">Back to role selection</Link></Paragraph>
		</CenteredCard>
	);
}
