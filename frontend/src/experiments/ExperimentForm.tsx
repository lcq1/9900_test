import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Flex, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Typography } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { experimentApi } from "../api";
import { readFullscreenPreference, saveFullscreenPreference } from "../fullscreenPreference";
import { useSession } from "../session";
import type { ExperimentInput, StageInput, StageTemplateType } from "../types";
import { createStage, readableError, stageLabels, stageTemplates } from "./experimentSupport";
import ComponentEditor from "./stage-builder/ComponentEditor";

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
	const [form] = Form.useForm<{ name: string; fullscreenMode: boolean; dataStorageDescription: string; storageLocation: string; participantSafetyInformation: string }>();
	const [stages, setStages] = useState<StageInput[]>([]);
	const [saving, setSaving] = useState(false);
	const { data: existing, isPending, error } = useQuery({ queryKey: ["experiment", experimentId], queryFn: () => experimentApi.get(experimentId!), enabled: Boolean(experimentId), retry: false });
	const isEditing = Boolean(experimentId);
	const defaultFullscreenMode = routeDefaultFullscreenMode ?? readFullscreenPreference(researcherId) ?? false;

	useEffect(() => {
		if (!existing) return;
		form.setFieldsValue({
			name: existing.name,
			fullscreenMode: existing.fullscreenMode,
			dataStorageDescription: existing.dataStorageDescription,
			storageLocation: existing.storageLocation,
			participantSafetyInformation: existing.participantSafetyInformation,
		});
		setStages((existing.stages ?? []).map(({ id: _id, ...stage }) => stage).sort((a, b) => a.position - b.position));
	}, [existing, form]);

	function updateStage(index: number, changes: Partial<StageInput>) {
		setStages((current) => current.map((stage, position) => position === index ? { ...stage, ...changes } : stage));
	}

	function removeStage(index: number) {
		setStages((current) => current.filter((_, itemIndex) => itemIndex !== index).map((stage, position) => ({ ...stage, position })));
	}

	function moveStage(index: number, offset: -1 | 1) {
		setStages((current) => {
			const target = index + offset;
			if (target < 0 || target >= current.length) return current;
			const next = [...current];
			[next[index], next[target]] = [next[target], next[index]];
			return next.map((stage, position) => ({ ...stage, position }));
		});
	}

	async function save(values: { name: string; fullscreenMode: boolean; dataStorageDescription: string; storageLocation: string; participantSafetyInformation: string }) {
		if (stages.length < 1 || stages.length > 20 || stages.some((stage) => !stage.title.trim() || stage.components.length === 0 || stage.components.some((component) => component.type !== "ai_assistant" && !component.text?.trim()))) {
			Modal.warning({ title: "Complete the stages", content: "Every stage needs a title and content." });
			return;
		}
		setSaving(true);
		try {
			const input: ExperimentInput = {
				name: values.name.trim(),
				fullscreenMode: values.fullscreenMode,
				dataStorageDescription: values.dataStorageDescription.trim(),
				storageLocation: values.storageLocation.trim(),
				participantSafetyInformation: values.participantSafetyInformation.trim(),
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
			<Form form={form} layout="vertical" initialValues={{ name: "", fullscreenMode: defaultFullscreenMode, dataStorageDescription: "", storageLocation: "", participantSafetyInformation: "" }} onFinish={(values) => void save(values)}>
				<Card title="Basic information" className="editor-card">
					<Form.Item label="Experiment name" name="name" rules={[{ required: true, whitespace: true, message: "Enter an experiment name." }, { max: 255, message: "The name must be 255 characters or fewer." }]}><Input size="large" placeholder="Example: Attention and Memory Study" /></Form.Item>
					<Form.Item label="Full-screen mode" name="fullscreenMode" valuePropName="checked" extra="New experiments use your most recently selected setting by default."><Switch /></Form.Item>
					{existing && <Paragraph>Experiment code (read-only): <Text code copyable>{existing.code}</Text></Paragraph>}
					{!existing && <Paragraph type="secondary">The system generates a unique experiment code when you create the experiment.</Paragraph>}
					<Form.Item label="Approved storage location" name="storageLocation" rules={[{ required: true, whitespace: true, message: "Describe the approved storage location." }]}><Input placeholder="Example: UNSW-approved research storage" /></Form.Item>
					<Form.Item label="How data is stored" name="dataStorageDescription" rules={[{ required: true, whitespace: true, message: "Describe how data is stored." }]}><Input.TextArea rows={3} /></Form.Item>
					<Form.Item label="Storage and safety information shown to participants" name="participantSafetyInformation" rules={[{ required: true, whitespace: true, message: "Provide the participant safety information." }]}><Input.TextArea rows={3} /></Form.Item>
				</Card>
				<Card title="Experiment flow" className="editor-card">
					<Paragraph type="secondary">Create 1–20 ordered stages. Templates are editable starting points; every stage uses the same component and feature model.</Paragraph>
					{stages.map((stage, index) => (
						<Card size="small" key={`${stage.templateType ?? "blank"}-${index}`} title={`${index + 1}. ${stage.title || "Untitled stage"}`} className="stage-card">
							<label className="field-label" htmlFor={`stage-template-${index}`}>Quick-start template</label>
							<Select id={`stage-template-${index}`} value={stage.templateType} options={stageTemplates.map((value) => ({ value, label: stageLabels[value] }))} onChange={(value: StageTemplateType) => updateStage(index, { templateType: value })} />
							<label className="field-label" htmlFor={`stage-title-${index}`}>Stage title</label>
							<Input id={`stage-title-${index}`} maxLength={255} value={stage.title} onChange={(event) => updateStage(index, { title: event.target.value })} />
							<ComponentEditor components={stage.components} onChange={(components) => updateStage(index, { components })} />
							<label className="field-label" htmlFor={`stage-time-${index}`}>Time limit (seconds, optional)</label>
							<InputNumber id={`stage-time-${index}`} min={1} max={86400} value={stage.timeLimit} onChange={(value) => updateStage(index, { timeLimit: value })} />
							<Space wrap className="stage-features">
								<Switch checked={stage.showClock} onChange={(checked) => updateStage(index, { showClock: checked })} /> Clock
								<Switch checked={stage.allowPause} onChange={(checked) => updateStage(index, { allowPause: checked })} /> Pause
								<Switch checked={stage.allowBack} onChange={(checked) => updateStage(index, { allowBack: checked })} /> Back
								<Switch checked={stage.doubleConfirm} onChange={(checked) => updateStage(index, { doubleConfirm: checked })} /> Double confirm
								<Switch checked={stage.copyPasteLogging} onChange={(checked) => updateStage(index, { copyPasteLogging: checked })} /> Copy/paste log
								<Switch checked={stage.screenRecording} onChange={(checked) => updateStage(index, { screenRecording: checked })} /> Screen
								<Switch checked={stage.audioRecording} onChange={(checked) => updateStage(index, { audioRecording: checked })} /> Audio
								<Switch checked={stage.videoRecording} onChange={(checked) => updateStage(index, { videoRecording: checked })} /> Video
								<Switch checked={stage.aiEnabled} onChange={(checked) => updateStage(index, { aiEnabled: checked })} /> Text AI
							</Space>
							<Flex gap="small" className="stage-actions">
								<Button disabled={index === 0} onClick={() => moveStage(index, -1)}>Move up</Button>
								<Button disabled={index === stages.length - 1} onClick={() => moveStage(index, 1)}>Move down</Button>
								<Button danger disabled={stages.length === 1} onClick={() => removeStage(index)}>Remove</Button>
							</Flex>
						</Card>
					))}
					<Space wrap>
						{stageTemplates.map((template) => <Button key={template} disabled={stages.length >= 20} onClick={() => setStages((current) => [...current, createStage(template, current.length)])}>Add {stageLabels[template]}</Button>)}
					</Space>
				</Card>
				<Flex justify="end" gap="middle"><Link to="/researcher"><Button>Cancel</Button></Link><Button type="primary" htmlType="submit" loading={saving}>Save experiment</Button></Flex>
			</Form>
		</div>
	);
}
