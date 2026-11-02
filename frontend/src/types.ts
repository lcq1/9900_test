// Shared experiment, stage, component, and feature types.
export type ComponentType =
	'text' | 'textbox' | 'choice' | 'checkbox' | 'true_false' | 'rating' | 'signature' | 'attachment' | 'button'
// Feature keys shared by configuration and rendering.
export type FeatureKey =
	| 'ai'
	| 'timer'
	| 'clock'
	| 'screenRecording'
	| 'selfie'
	| 'copyPaste'
	| 'navigation'
	| 'confirm'
	| 'pauseAbort'
	| 'signatureBox'
	| 'attachment'
// Content component identity, label, and optional settings.
export type StageComponent = {
	id: string
	type: ComponentType
	label: string
	required?: boolean
	options?: string[]
}
// Stage metadata, components, features, and countdown settings.
export type Stage = {
	id: string
	name: string
	type: string
	duration: number
	components: StageComponent[]
	features: Record<FeatureKey, boolean>
	countdownMinutes: number
	requiredFeatures?: Partial<
		Record<'questionnaire' | 'signatureBox' | 'attachment', boolean>
	>
	recordingRequired?: boolean
	recordingMode?: 'manual' | 'auto'
	materials?: { id: string; name: string; reference: string }[]
}
// Experiment metadata, status, fullscreen mode, and ordered stages.
export type Experiment = {
	id: string
	name: string
	code: string
	status: 'Draft' | 'Live' | 'Closed'
	created: string
	fullScreen: boolean
	stages: Stage[]
}

export const STAGE_TYPES = [
	{ type: "consent", label: "Consent" },
	{ type: "single_choice", label: "Single choice" },
	{ type: "multiple_choice", label: "Multiple choice" },
	{ type: "true_false", label: "True / false" },
	{ type: "fill_blank", label: "Fill in the blank" },
	{ type: "short_answer", label: "Short answer" },
	{ type: "video_oral_answer", label: "Video oral answer" },
] as const;
export const stageTypeLabel = (type: string): string =>
	STAGE_TYPES.find((i) => i.type === type)?.label ?? type;

export function createStage(type: string = "single_choice"): Stage {
	const consent = type === "consent",
		id = crypto.randomUUID();
	const components: Stage["components"] = [
		{
			id: crypto.randomUUID(),
			type: "text",
			label: consent
				? "Please read the consent information before continuing."
				: "Enter your question.",
		},
	];
	if (!consent)
		components.push({
			id: crypto.randomUUID(),
			type:
				type === "multiple_choice"
					? "checkbox"
					: type === "true_false"
						? "true_false"
					: type === "single_choice"
						? "choice"
						: "textbox",
			label: "Question",
			required: true,
			options:
				type === "true_false"
					? ["True", "False"]
					: ["single_choice", "multiple_choice"].includes(type)
						? ["Option A", "Option B"]
						: undefined,
		});
	return {
		id,
		name: 'Stage name',
		type,
		duration: 0,
		components,
		countdownMinutes: consent ? 0 : 2,
		features: {
			ai: false,
			timer: !consent,
			clock: true,
			screenRecording: !consent,
			selfie: type === "video_oral_answer",
			copyPaste: false,
			navigation: false,
			confirm: false,
			pauseAbort: false,
			signatureBox: false,
			attachment: false,
		},
	};
}

export function getPublishErrors(experiment: Experiment): string[] {
	const errors: string[] = [];
	if (experiment.status === "Closed")
		errors.push("Closed experiments cannot be published again.");
	if (!experiment.name.trim()) errors.push("Enter an experiment name.");
	if (experiment.stages.length < 2 || experiment.stages.length > 20)
		errors.push(
			"Include a consent stage and at least one question stage (2–20 stages in total).",
		);
	if (
		experiment.stages[0]?.type !== "consent" ||
		experiment.stages.slice(1).some((s) => s.type === "consent")
	)
		errors.push("The first stage must be the only consent stage.");

	experiment.stages.forEach((stage, index) => {
		const prefix = `Stage ${index + 1}`;
		if (!stage.name.trim()) errors.push(`${prefix}: enter a stage name.`);
		if (!STAGE_TYPES.some((item) => item.type === stage.type))
			errors.push(`${prefix}: select a supported stage type.`);
		if (!stage.components.length) errors.push(`${prefix}: add stage content.`);
		if (stage.type === "consent") {
			if (!stage.components.some((c) => c.type === "text" && c.label.trim()))
				errors.push(`${prefix}: add consent information.`);
			if (
				stage.features.ai ||
				stage.features.timer ||
				stage.features.screenRecording ||
				stage.features.copyPaste
			)
				errors.push(
					`${prefix}: consent cannot enable AI, countdown, screen recording or copy-paste logging.`,
				);
		}
		if (
			stage.features.timer &&
			(!Number.isInteger(stage.countdownMinutes) || stage.countdownMinutes < 1)
		)
			errors.push(
				`${prefix}: countdown must be a positive whole number of minutes.`,
			);
		if (
			stage.features.copyPaste &&
			!["fill_blank", "short_answer"].includes(stage.type)
		)
			errors.push(
				`${prefix}: copy-paste logging is only available for fill-in and short-answer questions.`,
			);
		const responseType =
			stage.type === "multiple_choice"
				? "checkbox"
				: ["single_choice", "true_false"].includes(stage.type)
					? "choice"
					: ["fill_blank", "short_answer"].includes(stage.type)
						? "textbox"
						: null;
		if (responseType && !stage.components.some((c) => c.type === responseType ||
			(stage.type === 'true_false' && c.type === 'true_false')))
			errors.push(
				`${prefix}: add a ${responseType === "textbox" ? "text box" : responseType} response component.`,
			);
		stage.components.forEach((component, componentIndex) => {
			if (!component.label.trim())
				errors.push(
					`${prefix}, component ${componentIndex + 1}: enter content or a label.`,
				);
			if (component.type === "choice" || component.type === "checkbox" || component.type === 'true_false') {
				const options = (component.options ?? []).map((option) =>
					option.trim(),
				);
				if (
					options.length < 2 ||
					options.length > 6 ||
					options.some((option) => !option) ||
					new Set(options).size !== options.length
				)
					errors.push(
						`${prefix}, component ${componentIndex + 1}: provide 2–6 distinct, non-empty options.`,
					);
			}
		});
	});
	return errors;
}
