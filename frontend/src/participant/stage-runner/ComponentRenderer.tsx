import { Alert, Checkbox, Input, Radio, Rate, Typography } from "antd";
import type { StageComponent } from "../../types";
import AIChat from "../ai-chat/AIChat";

interface Props {
	component: StageComponent;
	value: unknown;
	onChange: (value: unknown) => void;
}

export default function ComponentRenderer({ component, value, onChange }: Props) {
	const label = component.label ?? component.text ?? "Response";
	switch (component.type) {
		case "heading": return <Typography.Title level={3}>{component.text}</Typography.Title>;
		case "text": return <Typography.Paragraph className="stage-copy">{component.text}</Typography.Paragraph>;
		case "attachment": return <Alert type="info" message={component.text ?? "Attachment"} />;
		case "checkbox": return <Checkbox checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)}>{label}</Checkbox>;
		case "signature":
		case "short_text": return <><label className="field-label">{label}</label><Input value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} /></>;
		case "long_text":
		case "workspace": return <><label className="field-label">{label}</label><Input.TextArea rows={component.type === "workspace" ? 12 : 5} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} /></>;
		case "single_choice": return <><label className="field-label">{label}</label><Radio.Group options={component.options ?? []} value={value} onChange={(event) => onChange(event.target.value)} /></>;
		case "multiple_choice": return <><label className="field-label">{label}</label><Checkbox.Group options={component.options ?? []} value={Array.isArray(value) ? value as string[] : []} onChange={onChange} /></>;
		case "rating_scale": return <><label className="field-label">{label}</label><Rate value={typeof value === "number" ? value : 0} onChange={onChange} /></>;
		case "ai_assistant": return <AIChat />;
		case "button": return <Typography.Text>{component.text}</Typography.Text>;
		default: return null;
	}
}
