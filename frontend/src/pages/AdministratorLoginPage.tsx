import { useState } from "react";
import { Button, Form, Input, Typography } from "antd";
import { Link } from "react-router-dom";
import { authApi } from "../api";
import { showLoginError, useSuccessfulLogin } from "../auth/authSupport";
import { demoAdministratorLogin, demoCredentials } from "../auth/demoAuth";
import { CenteredCard } from "../components";

interface AdminFormValues { password: string }
const { Paragraph, Title } = Typography;

// Administrator 登录页只有密码输入；角色由后端 Session 确认。
export default function AdministratorLoginPage() {
	const [submitting, setSubmitting] = useState(false);
	const successfulLogin = useSuccessfulLogin();

	async function submit(values: AdminFormValues) {
		setSubmitting(true);
		try {
			// 开发模式演示密码只用于前端预览；正式管理员身份仍由后端确认。
			const user = demoAdministratorLogin(values.password) ?? await authApi.administratorLogin({ password: values.password });
			successfulLogin(user, "administrator", "/administrator");
		} catch {
			showLoginError();
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<CenteredCard>
			<Title level={2}>Administrator sign in</Title>
			{import.meta.env.DEV && <Typography.Paragraph type="secondary">Demo password: {demoCredentials.administrator.password}</Typography.Paragraph>}
			<Form<AdminFormValues> layout="vertical" onFinish={(values) => void submit(values)}>
				<Form.Item label="Administrator Password" name="password" rules={[{ required: true, message: "Enter the administrator password." }, { min: 8, message: "Password must be at least 8 characters." }]}>
					<Input.Password autoComplete="current-password" size="large" />
				</Form.Item>
				<Button type="primary" htmlType="submit" loading={submitting} size="large" block>Sign in</Button>
			</Form>
			<Paragraph className="auth-footer"><Link to="/">Back to role selection</Link></Paragraph>
		</CenteredCard>
	);
}
