import { useState } from "react";
import { Button, Form, Input, Typography } from "antd";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../api";
import { EmailField, showLoginError, useSuccessfulLogin } from "../auth/authSupport";
import { demoCredentials, demoResearcherLogin } from "../auth/demoAuth";
import type { ResearcherFormValues } from "../auth/authSupport";
import { CenteredCard } from "../components";

const { Paragraph, Title } = Typography;

// Researcher 登录页：注册后只预填邮箱，密码始终由用户重新输入。
export default function ResearcherLoginPage() {
	const [searchParams] = useSearchParams();
	const [submitting, setSubmitting] = useState(false);
	const successfulLogin = useSuccessfulLogin();
	const registeredEmail = searchParams.get("email") ?? "";

	async function submit(values: ResearcherFormValues) {
		setSubmitting(true);
		try {
			const email = values.email.trim().toLowerCase();
			// 开发模式先匹配固定演示账号；正式账号仍交由后端验证。
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
			{import.meta.env.DEV && <Paragraph type="secondary">Demo account: {demoCredentials.researcher.email} / {demoCredentials.researcher.password}</Paragraph>}
			<Form<ResearcherFormValues> layout="vertical" initialValues={{ email: registeredEmail }} onFinish={(values) => void submit(values)}>
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
