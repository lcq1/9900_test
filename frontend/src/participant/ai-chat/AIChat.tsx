import { Alert, Input, Typography } from "antd";

export default function AIChat() {
	return (
		<section className="ai-chat">
			<Typography.Text strong>AI assistant</Typography.Text>
			<Alert type="info" showIcon message="Text-only AI is enabled for this stage. The external AI provider must be configured by the backend." />
			<Input.TextArea aria-label="AI message" rows={3} placeholder="Ask a text-only question" disabled />
		</section>
	);
}
