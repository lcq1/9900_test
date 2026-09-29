import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Flex, Modal, Space, Spin, Typography } from "antd";
import { Link, useParams } from "react-router-dom";
import { experimentApi } from "../api";
import { readableError, statusLabels } from "../experiments/experimentSupport";
import type { Experiment, ExperimentStatus } from "../types";

const { Paragraph, Text, Title } = Typography;

export default function ExperimentDetailPage() {
	const { experimentId } = useParams();
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState(false);
	const { data, isPending, error } = useQuery({ queryKey: ["experiment", experimentId], queryFn: () => experimentApi.get(experimentId!), enabled: Boolean(experimentId), retry: false });

	async function setStatus(experiment: Experiment, nextStatus: ExperimentStatus) {
		setBusy(true);
		try {
			await experimentApi.update(experiment.id, {
				name: experiment.name,
				fullscreenMode: experiment.fullscreenMode,
				dataStorageDescription: experiment.dataStorageDescription,
				storageLocation: experiment.storageLocation,
				participantSafetyInformation: experiment.participantSafetyInformation,
				status: nextStatus,
				stages: (experiment.stages ?? []).map(({ id: _id, ...stage }) => stage),
			});
			await queryClient.invalidateQueries({ queryKey: ["experiment", experiment.id] });
			await queryClient.invalidateQueries({ queryKey: ["experiments"] });
		} catch (reason) {
			Modal.error({ title: "Status update failed", content: readableError(reason) });
		} finally {
			setBusy(false);
		}
	}

	async function createParticipant(experiment: Experiment) {
		setBusy(true);
		try {
			const result = await experimentApi.provisionParticipant(experiment.id);
			Modal.success({
				title: "Participant created",
				content: <>Participant Code: <Text code copyable>{result.participantCode}</Text><br />Store it now; it cannot be recovered later.</>,
			});
		} catch (reason) {
			Modal.error({ title: "Participant creation failed", content: readableError(reason) });
		} finally {
			setBusy(false);
		}
	}

	if (isPending) return <Spin size="large" />;
	if (error || !data) return <Alert type="info" showIcon message={readableError(error)} />;
	return (
		<Card>
			<Flex justify="space-between" align="center" wrap gap="middle">
				<Title level={2}>{data.name}</Title>
				<Space wrap>
					{data.status === "draft" && <Button loading={busy} onClick={() => void setStatus(data, "published")}>Publish</Button>}
					{data.status === "published" && <Button loading={busy} onClick={() => void setStatus(data, "closed")}>Close</Button>}
					<Button loading={busy} disabled={data.status === "closed"} onClick={() => void createParticipant(data)}>Create participant</Button>
					<Link to={`/researcher/experiments/${data.id}/edit`}><Button type="primary">Edit experiment</Button></Link>
				</Space>
			</Flex>
			<Paragraph>Experiment code: <Text code copyable>{data.code}</Text></Paragraph>
			<Paragraph>Status: {statusLabels[data.status]}</Paragraph>
			<Paragraph>Full-screen mode: {data.fullscreenMode ? "On" : "Off"}</Paragraph>
			<Paragraph>Approved storage: {data.storageLocation || "Not configured"}</Paragraph>
			<Paragraph>Participant safety information: {data.participantSafetyInformation || "Not configured"}</Paragraph>
			<Paragraph>Stages: {data.stages?.length ?? 0}</Paragraph>
		</Card>
	);
}
