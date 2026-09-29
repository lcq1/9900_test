import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Flex, Modal, Space, Switch, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Link, useNavigate } from "react-router-dom";
import { experimentApi } from "../api";
import { ReturnToLogin } from "../components";
import { readableError, statusLabels } from "../experiments/experimentSupport";
import { readFullscreenPreference, saveFullscreenPreference } from "../fullscreenPreference";
import { useSession } from "../session";
import type { Experiment, ExperimentStatus } from "../types";

const { Paragraph, Text, Title } = Typography;

// Researcher 控制台只展示后端返回的本人实验，不自行推断所有者。
export default function ResearcherDashboardPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const researcherId = useSession((state) => state.user?.id);
	const [busyId, setBusyId] = useState<string | null>(null);
	const { data = [], isPending, error } = useQuery({ queryKey: ["experiments"], queryFn: experimentApi.list, retry: false });
	const experiments = useMemo(() => [...data].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [data]);
	const lastFullscreenMode = readFullscreenPreference(researcherId) ?? experiments[0]?.fullscreenMode ?? false;

	async function changeFullscreen(experiment: Experiment, checked: boolean) {
		setBusyId(experiment.id);
		try {
			// 先获取完整阶段数据，避免保存开关时覆盖已有配置。
			const current = await experimentApi.get(experiment.id);
			await experimentApi.update(experiment.id, {
				name: current.name,
				fullscreenMode: checked,
				dataStorageDescription: current.dataStorageDescription,
				storageLocation: current.storageLocation,
				participantSafetyInformation: current.participantSafetyInformation,
				stages: (current.stages ?? []).map(({ id: _id, ...stage }) => stage),
			});
			saveFullscreenPreference(researcherId, checked);
			await queryClient.invalidateQueries({ queryKey: ["experiments"] });
		} catch (reason) {
			Modal.error({ title: "Save failed", content: readableError(reason) });
		} finally {
			setBusyId(null);
		}
	}

	function confirmDelete(experiment: Experiment) {
		Modal.confirm({
			title: "Delete this experiment?",
			content: `Delete “${experiment.name}”? Experiments with participant responses must be closed or archived by the backend.`,
			okText: "Delete",
			okType: "danger",
			cancelText: "Cancel",
			async onOk() {
				setBusyId(experiment.id);
				try {
					await experimentApi.remove(experiment.id);
					await queryClient.invalidateQueries({ queryKey: ["experiments"] });
				} catch (reason) {
					Modal.error({ title: "Delete failed", content: readableError(reason) });
				} finally {
					setBusyId(null);
				}
			},
		});
	}

	const columns: ColumnsType<Experiment> = [
		{ title: "Experiment name", dataIndex: "name", key: "name", render: (name: string, experiment) => <Link to={`/researcher/experiments/${experiment.id}`}>{name}</Link> },
		{ title: "Experiment code", dataIndex: "code", key: "code", render: (code: string) => <Text code copyable>{code}</Text> },
		{ title: "Status", dataIndex: "status", key: "status", render: (status: ExperimentStatus) => <Tag color={status === "published" ? "blue" : status === "draft" ? "default" : "orange"}>{statusLabels[status]}</Tag> },
		{ title: "Created", dataIndex: "createdAt", key: "createdAt", render: (value: string) => new Date(value).toLocaleString("en-US") },
		{ title: "Full-screen mode", key: "fullscreenMode", render: (_, experiment) => <Switch checked={experiment.fullscreenMode} loading={busyId === experiment.id} onChange={(checked) => void changeFullscreen(experiment, checked)} aria-label={`${experiment.name} full-screen mode`} /> },
		{ title: "Actions", key: "actions", render: (_, experiment) => <Space><Link to={`/researcher/experiments/${experiment.id}`}>View details</Link><Button type="link" danger disabled={busyId === experiment.id} onClick={() => confirmDelete(experiment)}>Delete</Button></Space> },
	];

	return (
		<div className="dashboard-page">
			<Flex justify="space-between" align="center" wrap gap="middle" className="page-heading">
				<div><Title level={2}>My experiments</Title><Paragraph type="secondary">View and manage the experiments you created</Paragraph><ReturnToLogin role="researcher" /></div>
				<Button type="primary" size="large" onClick={() => navigate("/researcher/experiments/new", { state: { defaultFullscreenMode: lastFullscreenMode } })}>Create experiment</Button>
			</Flex>
			{error && <Alert type="info" showIcon message={readableError(error)} className="page-alert" />}
			<Card>
				<Table<Experiment> rowKey="id" columns={columns} dataSource={experiments} loading={isPending} pagination={{ pageSize: 10 }} locale={{ emptyText: <Empty description="No experiments yet" /> }} scroll={{ x: 900 }} onRow={(experiment) => ({ onClick: (event) => { if (!(event.target as HTMLElement).closest("a, button, .ant-switch, .ant-typography-copy")) navigate(`/researcher/experiments/${experiment.id}`); } })} rowClassName="clickable-row" />
			</Card>
		</div>
	);
}
