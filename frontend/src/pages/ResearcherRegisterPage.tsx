import { useState } from "react";
import { Button, Form, Input, Modal, Typography } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api";
import { EmailField } from "../auth/authSupport";
import type { ResearcherFormValues } from "../auth/authSupport";
import { CenteredCard } from "../components";

const { Paragraph, Title } = Typography;

// 注册成功后仅把标准化邮箱带回登录页，不带回或保存密码。
export default function ResearcherRegisterPage() {
	const [submitting, setSubmitting] = useState(false);
	const navigate = useNavigate();

	async function submit(values: ResearcherFormValues) {
		setSubmitting(true);
		try {
			const result = await authApi.researcherRegister({ email: values.email.trim().toLowerCase(), password: values.password });
			navigate(`/login/researcher?email=${encodeURIComponent(result.email)}`, { replace: true });
		} catch {
			Modal.error({ title: "Registration failed", content: "We could not create your account. Please try again later." });
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<CenteredCard>
			<Title level={2}>Researcher registration</Title>
			<Paragraph type="secondary">Create an account, then return to sign in</Paragraph>
			<Form<ResearcherFormValues & { confirmPassword: string }> layout="vertical" onFinish={(values) => void submit(values)}>
				<EmailField />
				<Form.Item label="Password" name="password" rules={[
					{ required: true, message: "Enter a password." },
					{ min: 8, message: "Password must be at least 8 characters." },
					{ max: 30, message: "Password must be 30 characters or fewer." },
				]}>
					<Input.Password autoComplete="new-password" size="large" />
				</Form.Item>
				<Form.Item label="Confirm password" name="confirmPassword" dependencies={["password"]} rules={[
					{ required: true, message: "Enter the password again." },
					({ getFieldValue }) => ({ validator(_, value: string) { return value === getFieldValue("password") ? Promise.resolve() : Promise.reject(new Error("The passwords do not match.")); } }),
				]}>
					<Input.Password autoComplete="new-password" size="large" />
				</Form.Item>
				<Button type="primary" htmlType="submit" loading={submitting} size="large" block>Create account</Button>
			</Form>
			<Paragraph className="auth-footer"><Link to="/login/researcher">Back to sign in</Link></Paragraph>
		</CenteredCard>
	);
}
