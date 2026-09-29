import { useQuery } from "@tanstack/react-query";
import { Alert, Card, Col, Row, Table, Typography } from "antd";
import { administratorApi } from "../api";
import { ReturnToLogin } from "../components";


export default function AdministratorDashboardPage() {
	const researchers = useQuery({ queryKey: ["administrator", "researchers"], queryFn: administratorApi.listResearchers });
	const experiments = useQuery({ queryKey: ["administrator", "experiments"], queryFn: administratorApi.listExperiments });
	const error = researchers.error ?? experiments.error;

	return (
		<div>
			<Typography.Title level={2}>Administrator dashboard</Typography.Title>
			<ReturnToLogin role="administrator" />
			{error && <Alert type="error" showIcon message={error instanceof Error ? error.message : "Unable to load administrator data."} />}
			<Row gutter={[16, 16]}>
				<Col xs={24} xl={12}>
					<Card title="Researchers">
						<Table
							rowKey="id"
							loading={researchers.isPending}
							dataSource={researchers.data ?? []}
							columns={[
								{ title: "Email", dataIndex: "email" },
								{ title: "Status", dataIndex: "status" },
								{ title: "Created", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString("en-US") },
							]}
						/>
					</Card>
				</Col>
				<Col xs={24} xl={12}>
					<Card title="Experiments">
						<Table
							rowKey="id"
							loading={experiments.isPending}
							dataSource={experiments.data ?? []}
							columns={[
								{ title: "Name", dataIndex: "name" },
								{ title: "Code", dataIndex: "code" },
								{ title: "Status", dataIndex: "status" },
							]}
						/>
					</Card>
				</Col>
			</Row>
		</div>
	);
}
