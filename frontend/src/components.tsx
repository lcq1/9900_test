import { useState } from "react";
import type { PropsWithChildren } from "react";
import { Button, Layout, Modal, Typography } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { authApi } from "./api";
import { useSession } from "./session";
import type { UserRole } from "./types";

/** 全站蓝白色容器。入口页只呈现居中的角色选择框。 */
export function AppShell({ children }: PropsWithChildren) {
	const { pathname } = useLocation();
	const showHeader = pathname.startsWith("/researcher") || pathname.startsWith("/administrator") || pathname.startsWith("/participant/session");
	return (
		<Layout className="app-shell">
			{showHeader && <Layout.Header className="app-header"><Typography.Text strong>Experiment Platform</Typography.Text></Layout.Header>}
			<Layout.Content className="app-content">{children}</Layout.Content>
		</Layout>
	);
}

/** 登录与注册页共用的居中表单容器。 */
export function CenteredCard({ children }: PropsWithChildren) {
	return <section className="centered-card">{children}</section>;
}

/** 返回角色登录页前结束前端身份；接入后端后必须先成功销毁服务端 Session。 */
export function ReturnToLogin({ role }: { role: UserRole }) {
	const navigate = useNavigate();
	const clearSession = useSession((state) => state.clear);
	const [loading, setLoading] = useState(false);

	async function returnToLogin() {
		setLoading(true);
		try {
			await authApi.logout();
		} catch {
			Modal.error({ title: "Could not sign out", content: "Please try again." });
			setLoading(false);
			return;
		}
		clearSession();
		setLoading(false);
		navigate("/login", { replace: true, state: { role } });
	}

	return <Button type="link" className="back-link" loading={loading} onClick={() => void returnToLogin()}>Back to sign in</Button>;
}
