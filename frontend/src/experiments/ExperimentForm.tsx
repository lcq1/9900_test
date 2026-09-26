import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Flex, Form, Input, InputNumber, Modal, Space, Spin, Switch, Typography } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { experimentApi } from "../api";
import { readFullscreenPreference, saveFullscreenPreference } from "../fullscreenPreference";
import { useSession } from "../session";
import type { ExperimentInput, StageInput } from "../types";
import { createStage, readableError, stageLabels, stageOrder } from "./experimentSupport";

const { Paragraph, Text, Title } = Typography;

interface ExperimentFormProps {
	experimentId?: string;
	defaultFullscreenMode?: boolean;
}

// 新建与编辑页面共用表单；是否编辑只由页面传入的实验编号决定。
export default function ExperimentForm({ experimentId, defaultFullscreenMode: routeDefaultFullscreenMode }: ExperimentFormProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const researcherId = useSession((state) => state.user?.id);
	const [form] = Form.useForm<{ name: string; fullscreenMode: boolean }>();
	const [stages, setStages] = useState<StageInput[]>([]);
	const [saving, setSaving] = useState(false);
	const { data: existing, isPending, error } = useQuery({ queryKey: ["experiment", experimentId], queryFn: () => experimentApi.get(experimentId!), enabled: Boolean(experimentId), retry: false });
	const isEditing = Boolean(experimentId);
	const defaultFullscreenMode = routeDefaultFullscreenMode ?? readFullscreenPreference(researcherId) ?? false;

	useEffect(() => {
		if (!existing) return;
		form.setFieldsValue({ name: existing.name, fullscreenMode: existing.fullscreenMode });
		setStages((existing.stages ?? []).map(({ type, title, position, timeLimit, content }) => ({ type, title, position, timeLimit, content })).sort((a, b) => a.position - b.position));
	}, [existing, form]);

	const nextStageType = stageOrder.find((type) => !stages.some((stage) => stage.type === type));

	function updateStage(index: number, changes: Partial<StageInput>) {
		setStages((current) => current.map((stage, position) => position === index ? { ...stage, ...changes } : stage));
	}

	function removeLastStage() {
		// 只允许从末尾移除，确保 consent → questionnaire → task 的流程顺序。
		setStages((current) => current.slice(0, -1));
	}

	async function save(values: { name: string; fullscreenMode: boolean }) {
		if (stages.some((stage) => !stage.title.trim() || !String(stage.content.text ?? "").trim())) {
			Modal.warning({ title: "Complete the stages", content: "Every stage needs a title and content." });
			return;
		}
		setSaving(true);
		try {
			const input: ExperimentInput = {
				name: values.name.trim(),
				fullscreenMode: values.fullscreenMode,
				stages: stages.map((stage, position) => ({ ...stage, position })),
			};
			// code、id 和 owner_id 不从表单传入；由后端创建或校验。
			const result = isEditing ? await experimentApi.update(experimentId!, input) : await experimentApi.create(input);
			saveFullscreenPreference(researcherId, values.fullscreenMode);
			await queryClient.invalidateQueries({ queryKey: ["experiments"] });
			navigate(`/researcher/experiments/${result.id}`, { replace: true });
		} catch (reason) {
			Modal.error({ title: "Save failed", content: readableError(reason) });
		} finally {
			setSaving(false);
		}
	}

	if (isEditing && isPending) return <Spin size="large" />;
	if (isEditing && error) return <Alert type="info" showIcon message={readableError(error)} />;

	return (
		<div className="editor-page">
			<Flex justify="space-between" align="center" className="page-heading"><Title level={2}>{isEditing ? "Edit experiment" : "Create experiment"}</Title><Link to="/researcher">Back to experiments</Link></Flex>
			<Form form={form} layout="vertical" initialValues={{ name: "", fullscreenMode: defaultFullscreenMode }} onFinish={(values) => void save(values)}>
				<Card title="Basic information" className="editor-card">
					<Form.Item label="Experiment name" name="name" rules={[{ required: true, whitespace: true, message: "Enter an experiment name." }, { max: 255, message: "The name must be 255 characters or fewer." }]}><Input size="large" placeholder="Example: Attention and Memory Study" /></Form.Item>
					<Form.Item label="Full-screen mode" name="fullscreenMode" valuePropName="checked" extra="New experiments use your most recently selected setting by default."><Switch /></Form.Item>
					{existing && <Paragraph>Experiment code (read-only): <Text code copyable>{existing.code}</Text></Paragraph>}
					{!existing && <Paragraph type="secondary">The system generates a unique experiment code when you create the experiment.</Paragraph>}
				</Card>
				<Card title="Experiment flow" className="editor-card">
					<Paragraph type="secondary">Configure consent, questionnaire, and task stages in order. Participants complete them in that sequence.</Paragraph>
					{stages.map((stage, index) => (
						<Card size="small" key={`${stage.type}-${index}`} title={`${index + 1}. ${stageLabels[stage.type]}`} className="stage-card">
							<label className="field-label" htmlFor={`stage-title-${index}`}>Stage title</label>
							<Input id={`stage-title-${index}`} maxLength={255} value={stage.title} onChange={(event) => updateStage(index, { title: event.target.value })} />
							<label className="field-label" htmlFor={`stage-text-${index}`}>Instructions or questions</label>
							<Input.TextArea id={`stage-text-${index}`} rows={4} value={String(stage.content.text ?? "")} onChange={(event) => updateStage(index, { content: { ...stage.content, text: event.target.value } })} />
							<label className="field-label" htmlFor={`stage-time-${index}`}>Time limit (seconds, optional)</label>
							<InputNumber id={`stage-time-${index}`} min={1} max={86400} value={stage.timeLimit} onChange={(value) => updateStage(index, { timeLimit: value })} />
						</Card>
					))}
					<Space wrap>
						<Button disabled={!nextStageType} onClick={() => nextStageType && setStages((current) => [...current, createStage(nextStageType, current.length)])}>Add {nextStageType ? stageLabels[nextStageType] : "stage"}</Button>
						<Button disabled={stages.length === 0} onClick={removeLastStage}>Remove last stage</Button>
					</Space>
				</Card>
				<Flex justify="end" gap="middle"><Link to="/researcher"><Button>Cancel</Button></Link><Button type="primary" htmlType="submit" loading={saving}>Save experiment</Button></Flex>
			</Form>
		</div>
	);
}
