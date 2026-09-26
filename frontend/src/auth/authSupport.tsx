import { Form, Input, Modal } from "antd";
import { useNavigate } from "react-router-dom";
import { useSession } from "../session";
import type { CurrentUser, UserRole } from "../types";

export interface ResearcherFormValues { email: string; password: string }

// Researcher 登录和注册共用邮箱校验与输入框，避免两页规则不一致。
export function EmailField() {
	return (
		<Form.Item label="Email" name="email" normalize={(value: string) => value.trim()} rules={[
			{ required: true, message: "Enter your email address." },
			{ type: "email", message: "Enter a valid email address." },
			{ max: 320, message: "Email must be 320 characters or fewer." },
		]}>
			<Input type="email" autoComplete="email" placeholder="z1234567@ad.unsw.edu.au" size="large" />
		</Form.Item>
	);
}

// 所有角色的登录失败统一提示，避免泄露具体哪一项凭据有误。
export function showLoginError() {
	Modal.error({ title: "Sign-in failed", content: "Invalid sign-in information." });
}

export function useSuccessfulLogin() {
	const navigate = useNavigate();
	const setUser = useSession((state) => state.setUser);
	return (user: CurrentUser, expectedRole: UserRole, destination: string) => {
		// 正式角色须来自后端响应；前端演示角色只用于页面预览。
		if (user.role !== expectedRole) throw new Error("The account role does not match this sign-in page.");
		setUser(user);
		navigate(destination, { replace: true });
	};
}
