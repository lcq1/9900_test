import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Flex, Spin, Typography } from "antd";
import { Link, useParams } from "react-router-dom";
import { experimentApi } from "../api";
import { readableError, statusLabels } from "../experiments/experimentSupport";

const { Paragraph, Text, Title } = Typography;

// 实验详情页仅使用 URL 中的实验编号加载对应数据。
export default function ExperimentDetailPage() {
	const { experimentId } = useParams();
	const { data, isPending, error } = useQuery({ queryKey: ["experiment", experimentId], queryFn: () => experimentApi.get(experimentId!), enabled: Boolean(experimentId), retry: false });
	if (isPending) return <Spin size="large" />;
	if (error || !data) return <Alert type="info" showIcon message={readableError(error)} />;
	return (
		<Card>
			<Flex justify="space-between" align="center"><Title level={2}>{data.name}</Title><Link to={`/researcher/experiments/${data.id}/edit`}><Button type="primary">Edit experiment</Button></Link></Flex>
			<Paragraph>Experiment code: <Text code copyable>{data.code}</Text></Paragraph>
			<Paragraph>Status: {statusLabels[data.status]}</Paragraph>
			<Paragraph>Full-screen mode: {data.fullscreenMode ? "On" : "Off"}</Paragraph>
			<Paragraph>Stages: {data.stages?.length ?? 0}</Paragraph>
		</Card>
	);
}
