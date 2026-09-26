import { Card, Typography } from "antd";
import { ReturnToLogin } from "../components";

// Plan.md 尚未定义管理员控制台的具体功能；此处仅保留对应的页面占位。
// 后续管理员操作必须由后端按 Session 角色逐项校验。
export default function AdministratorDashboardPage() {
	return (
		<Card>
			<Typography.Title level={2}>Administrator dashboard</Typography.Title>
			<Typography.Paragraph>Administrative tools will be added after requirements are confirmed.</Typography.Paragraph>
			<ReturnToLogin role="administrator" />
		</Card>
	);
}
