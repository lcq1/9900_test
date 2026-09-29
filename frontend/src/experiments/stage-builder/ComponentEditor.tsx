import { useState } from "react";
import { Button, Card, Flex, Input, Select, Space, Switch, Typography } from "antd";
import type { StageComponent, StageComponentType } from "../../types";

const componentOptions: { value: StageComponentType; label: string }[] = [
	{ value: "heading", label: "Heading" },
	{ value: "text", label: "Text" },
	{ value: "attachment", label: "Attachment" },
	{ value: "checkbox", label: "Checkbox" },
	{ value: "signature", label: "Signature / name" },
	{ value: "short_text", label: "Short text" },
	{ value: "long_text", label: "Long text" },
	{ value: "single_choice", label: "Single choice" },
	{ value: "multiple_choice", label: "Multiple choice" },
	{ value: "rating_scale", label: "Rating scale" },
	{ value: "button", label: "Button" },
	{ value: "workspace", label: "Task workspace" },
	{ value: "ai_assistant", label: "AI assistant (text only)" },
];

interface Props {
	components: StageComponent[];
	onChange: (components: StageComponent[]) => void;
}

export default function ComponentEditor({ components, onChange }: Props) {
	const [newType, setNewType] = useState<StageComponentType>("text");

	function update(index: number, changes: Partial<StageComponent>) {
		onChange(components.map((component, itemIndex) => itemIndex === index ? { ...component, ...changes } : component));
	}

	function add() {
		onChange([...components, { id: crypto.randomUUID(), type: newType, text: "", required: false }]);
	}

	return (
		<section className="component-editor">
			<Typography.Text strong>Components</Typography.Text>
			{components.map((component, index) => (
				<Card key={component.id} size="small" className="component-card" title={`${index + 1}. ${componentOptions.find((item) => item.value === component.type)?.label ?? component.type}`}>
					{component.type !== "ai_assistant" && <Input.TextArea rows={2} placeholder={component.type === "text" || component.type === "heading" ? "Displayed text" : "Question or label"} value={component.text ?? ""} onChange={(event) => update(index, { text: event.target.value })} />}
					{["single_choice", "multiple_choice"].includes(component.type) && <Input className="component-options" placeholder="Options separated by commas" value={(component.options ?? []).join(", ")} onChange={(event) => update(index, { options: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} />}
					<Flex justify="space-between" align="center" className="component-actions">
						<Space><Switch checked={Boolean(component.required)} onChange={(checked) => update(index, { required: checked })} /> Required</Space>
						<Button danger disabled={components.length === 1} onClick={() => onChange(components.filter((_, itemIndex) => itemIndex !== index))}>Remove component</Button>
					</Flex>
				</Card>
			))}
			<Space wrap>
				<Select value={newType} options={componentOptions} onChange={setNewType} style={{ minWidth: 190 }} />
				<Button onClick={add}>Add component</Button>
			</Space>
		</section>
	);
}
