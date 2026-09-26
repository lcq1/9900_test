import { Button, Flex, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { CenteredCard } from "../components";

// 主入口只负责选择登录页面，不能根据这里点击的按钮授予任何权限。
export default function HomePage() {
	const navigate = useNavigate();
	return (
		<CenteredCard>
			<Typography.Title level={2}>Welcome to the Experiment Platform</Typography.Title>
			<Typography.Paragraph type="secondary">Choose your role to continue</Typography.Paragraph>
			<Flex vertical gap="middle">
				<Button type="primary" size="large" block onClick={() => navigate("/login/participant")}>Participant</Button>
				<Button size="large" block onClick={() => navigate("/login/researcher")}>Researcher</Button>
				<Button size="large" block onClick={() => navigate("/login/administrator")}>Administrator</Button>
			</Flex>
		</CenteredCard>
	);
}
