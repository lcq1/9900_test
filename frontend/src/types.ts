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
	otherOption?: string
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
	signingMethod?: 'handwritten' | 'name'
	consentClauses?: string[]
	allowExtension?: boolean
	extensionMinutes?: number
	sequentialQuestions?: boolean
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
	{ type: "instruction", label: "Instructions" },
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
	if (!consent && type !== 'video_oral_answer' && type !== 'instruction')
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
		// New consent stages default to a handwritten signature; clauses are only needed for 'name'.
		...(consent ? { signingMethod: 'handwritten' as const } : {}),
		duration: 0,
		components,
		countdownMinutes: consent ? 0 : 2,
		recordingRequired: type === 'video_oral_answer',
		recordingMode: type === 'video_oral_answer' ? 'auto' : 'manual',
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
		if (stage.signingMethod === 'name' && !(stage.consentClauses?.length && stage.consentClauses.every(c => c.trim()))) errors.push(prefix + ': enter the approved consent clauses.')
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
		const extensionMinutes = stage.extensionMinutes ?? 30;
		if (stage.features.timer && stage.allowExtension &&
			(!Number.isInteger(extensionMinutes) || extensionMinutes < 1 || extensionMinutes > 1440))
			errors.push(`${prefix}: extension must be between 1 and 1440 whole minutes.`);

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
					options.length > 12 ||
					options.some((option) => !option) ||
					new Set(options).size !== options.length
				)
					errors.push(
						`${prefix}, component ${componentIndex + 1}: provide 2–12 distinct, non-empty options.`,
					);
			}
		});
	});
	return errors;
}

// Client study content transcribed from the supplied research documents.
const clientContent = {
 "background": [
  {"type": "choice", "label": "Age:", "required": true, "options": ["18", "19", "20", "21", "22", "22+"]},
  {"type": "choice", "label": "Gender:", "required": true, "options": ["Woman", "Man", "Prefer not to say"]},
  {"type": "choice", "label": "Are you a local or international student?", "required": true, "options": ["Local", "International"]},
  {"type": "choice", "label": "What is your first language?", "required": true, "options": ["English", "Mandarin", "Hindi", "Arabic", "Korean", "Indonesian", "Vietnamese", "Bengali", "Japanese", "Other"]},
  {"type": "choice", "label": "Is English your first language?", "required": true, "options": ["Yes", "No"]},
  {"type": "choice", "label": "What is your discipline or intended major?", "required": true, "options": ["Computer Science", "Computer Engineering", "Software Engineering", "Bioinformatics", "Other"]},
  {"type": "choice", "label": "What year of study are you in?", "required": true, "options": ["First", "Second", "Third", "Fourth", "Other"]},
  {"type": "choice", "label": "Have you taken the first-year engineering design course (DESN1000)?", "required": true, "options": ["Yes", "No"]},
  {"type": "choice", "label": "How often do you use AI tools (such as ChatGPT) for your studies?", "required": true, "options": ["Never", "Rarely", "Sometimes", "Often", "Very often"]},
  {"type": "choice", "label": "How would you rate your experience with engineering design tasks?", "required": true, "options": ["None", "A little", "Some", "A lot"]},
  {"type": "choice", "label": "Do you have a disability or specific learning need that may affect how you work on this task?", "required": true, "options": ["Yes", "No", "Prefer not to say"]}
 ],
 "personality": [
  {"type": "choice", "label": "Is outgoing, sociable.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is compassionate, has a soft heart.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Tends to be disorganized.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is relaxed, handles stress well.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Has few artistic interests.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Has an assertive personality.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is respectful, treats others with respect.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Tends to be lazy.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Stays optimistic after experiencing a setback.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is curious about many different things.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Rarely feels excited or eager.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Tends to find fault with others.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is dependable, steady.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is moody, has up and down mood swings.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is inventive, finds clever ways to do things.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Tends to be quiet.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Feels little sympathy for others.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is systematic, likes to keep things in order.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Can be tense.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is fascinated by art, music, or literature.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is dominant, acts as a leader.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Starts arguments with others.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Has difficulty getting started on tasks.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Feels secure, comfortable with self.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Avoids intellectual, philosophical discussions.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is less active than other people.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Has a forgiving nature.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Can be somewhat careless.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is emotionally stable, not easily upset.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Has little creativity.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is sometimes shy, introverted.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is helpful and unselfish with others.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Keeps things neat and tidy.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Worries a lot.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Values art and beauty.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Finds it hard to influence people.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is sometimes rude to others.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is efficient, gets things done.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Often feels sad.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is complex, a deep thinker.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is full of energy.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is suspicious of others’ intentions.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is reliable, can always be counted on.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Keeps their emotions under control.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Has difficulty imagining things.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is talkative.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Can be cold and uncaring.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Leaves a mess, doesn’t clean up.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Rarely feels anxious or afraid.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Thinks poetry and plays are boring.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Prefers to have others take charge.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is polite, courteous to others.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is persistent, works until the task is finished.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Tends to feel depressed, blue.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Has little interest in abstract ideas.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Shows a lot of enthusiasm.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Assumes the best about people.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Sometimes behaves irresponsibly.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is temperamental, gets emotional easily.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]},
  {"type": "choice", "label": "Is original, comes up with new ideas.", "required": true, "options": ["1 = Disagree strongly", "2 = Disagree a little", "3 = Neutral no opinion", "4 = Agree a little", "5 = Agree strongly"]}
 ],
 "post": [
  {"type": "choice", "label": "How much did you rely on the AI during the task?", "options": ["Not at all", "A little", "A moderate amount", "A lot", "Almost entirely"], "required": true},
  {"type": "choice", "label": "What made you turn to the AI most?", "options": ["I did not turn to the AI", "I was stuck", "To save time", "To check my own thinking", "I wasn't sure how to start", "Other (if Other, please write)"], "required": true, "otherOption": "Other (if Other, please write)"},
  {"type": "checkbox", "label": "Where did you rely on the AI most? (Select any that apply)", "options": ["I did not use the AI", "Understanding the problem", "Coming up with approaches", "Choosing an approach", "Writing the design", "Checking my work", "Other (if Other, please write)"], "required": true, "otherOption": "Other (if Other, please write)"},
  {"type": "choice", "label": "Did you rework what the AI gave you, or use it as it was?", "options": ["I did not use the AI's output", "Reworked most of it", "Reworked some", "Used most of it as it was"], "required": true},
  {"type": "choice", "label": "During the task, did you feel you were mostly:", "options": ["Thinking through the problem yourself", "A mix of your own thinking and the AI's help", "Getting answers from the AI"], "required": true},
  {"type": "choice", "label": "How difficult did you find this task?", "options": ["Very easy", "Easy", "Moderate", "Hard", "Very hard"], "required": true},
  {"type": "choice", "label": "How much effort did you put into thinking through the problem yourself?", "options": ["None", "A little", "A moderate amount", "A lot", "A great deal"], "required": true},
  {"type": "choice", "label": "How confident are you that you could explain your design without the AI?", "options": ["Not at all", "Slightly", "Moderately", "Very", "Completely"], "required": true},
  {"type": "choice", "label": "How would you rate your current level of fatigue?", "options": ["Not fatigued at all", "Slightly fatigued", "Moderately fatigued", "Quite fatigued", "Extremely fatigued"], "required": true},
  {"type": "checkbox", "label": "Did you experience any discomfort during the session? (Select any that apply)", "options": ["None", "From wearing the sensors", "From the recording", "From the task itself", "At another time (please specify)"], "required": true, "otherOption": "At another time (please specify)"},
  {"type": "textbox", "label": "Anything you want to add about how you used the AI or your experience in the session? (Optional, short text)", "required": false}
 ],
 "oral": [
  "How did you understand the problem, and what did you decide to design?",
  "What approaches did you consider, and why did you choose the one you did?",
  "What are the main trade-offs in your design (for example, cost, accuracy, or privacy), and how did you handle them?",
  "If one part of your chosen approach couldn't be done as planned, what would you change, and why?"
 ],
 "instructions": {
  "3": `Before you start, please read the following:
• You will work on a design task, as you would in a real design activity.
• Your work will be assessed afterwards against design criteria, and you will receive feedback on your reasoning to help you improve.
• Please treat it seriously and work through it properly.
• You may use the AI assistant however you normally would, use it as much or as little as you like.
• Your work is for this research only. It will not affect any grade, and no names are attached to your answers.

Please complete the questionnaires on the next screens before the task begins.`,
  "5": `The researcher will now help you put on the sensors for the study. These are comfortable and non-invasive:
• A wristband on your wrist, which records your heart rate and skin activity.
• A headband, which records brain activity (EEG).
• An eye-tracker on the screen, which follows where you look. You do not wear this; it sits on the computer.

Once the sensors are fitted, we will record a short baseline for a couple of minutes while you sit and relax, before the task begins.

Please let the researcher know if anything feels uncomfortable at any point. You can ask to adjust or remove any sensor, and you may still take part. When everything is ready, we will move on to the task.`,
  "6": `You will now work on the design task.
• You have 60 minutes to complete this task. A timer is shown, and you may ask for more time if you need it (maximum 30 minutes extra).
• An AI assistant is available on the screen. You may use it as you wish.
• Write your answer in the space provided, and click Submit when you are finished.
• Work through the task the way that feels natural to you.

When you are ready, click Start to see the task.`,
  "8": `Thank you for submitting your design. For the next part, the AI assistant is turned off. You will now explain your design in your own words.

You will be shown a few questions, one at a time, and asked to record a short spoken answer to each using the camera and microphone. There are no right or wrong answers, we would just like to hear your thinking.

Take a moment to think before you answer each question. You have a maximum of 10 minutes to answer all the questions. Click Continue when you are ready. Read the questions, and the recording will start once you are ready.`,
  "11": `That's the end of the session. Thank you very much for taking part.

Please wait while the researcher removes the equipment and confirms your data is saved. Please do not close this page yet.

You will receive feedback on your design reasoning afterwards, and you may contact the research team at any time if you have questions.`
 },
 "consentText": `Welcome, and thank you for taking part in this study. In this session, you will work on a design task using an AI assistant, and then explain your design.

The session takes about two hours. You can take a break if you need one, and you may stop at any time.

You will now be shown the participant information and consent form. Please read it and confirm your consent electronically to begin. You may ask the researcher any questions first.

CAMPUS STUDY SPACE FINDER — CONSENT FORM

Project: Real-Time Campus Study Space Finder
Researcher / System owner: Kholoud Alqattan, UNSW
Ethics approval reference: [e.g., ETH-XXXX — insert if approved]

1. What this system does (Purpose)
This system helps students find a free and suitable study space on campus in real time. It shows you which study areas are currently available and matches them to your preferences (for example, quiet versus group space, power outlets, opening hours).

2. Why your participation matters
Students often lose valuable study time walking between buildings looking for a seat. By sharing anonymous availability information, you help build a live map that benefits the whole campus — and you get a faster way to find your own space.

3. What taking part involves
• Opening the app or web tool on your device.
• Allowing the app to detect your on-campus location while it is active.
• Optionally marking a space as "free" or "full" when you leave.
That is the entire commitment — no surveys are required to use the core feature.

4. Data we collect
• Coarse on-campus location (building / zone level), obtained via device location services only while the app is open, so we know which zone has free space.
• Space status you report (free / full), from your taps, to keep the live map accurate.
• Anonymous usage analytics (counts, session durations) from app logs, to measure and improve the service.
• Email / account (optional), only if you create a profile, to save your preferences.
We do NOT collect your name, exact GPS movement tracks, message content, or anything outside the app.

5. How your data is used
• To display live study-space availability to you and other students.
• In aggregated, de-identified form for campus planning analysis.
• Never sold to or shared with third parties for marketing or advertising.

6. Privacy and security
Location is collected only while the app is active and you are on campus, and is reduced to zone level to avoid revealing your exact movements. All data is encrypted in transit and at rest, with access limited to the research team. We minimise retention: we keep counts and zones, not personal trails.

7. Voluntary participation and withdrawal
Taking part is entirely voluntary. You can stop location sharing at any time by closing the app or toggling the setting off. To delete any data linked to you, contact us (below), and we will remove it within [X] working days.

8. Risks and benefits
Benefits: less time spent hunting for a seat; better use of existing campus space.
Risks: like any location feature, there is a small privacy risk if location data were exposed. We mitigate this by using zone-level data and encryption. No significant physical, legal, or financial risk is expected.

9. Data retention
We retain aggregated, de-identified data for the duration of the project until the end of 2026 and then delete or fully anonymise it.

10. Contact
Questions, concerns, or withdrawal requests:
• Research contact: [researcher email]
• Ethics office: [ethics office contact]

CONSENT

By signing below, you confirm that you have read and understood this form, that your participation is voluntary, and that you consent to the collection and use of your data as described above.`,
 "design": `Design a system that helps students find a free study space on campus in real time.

Students often waste time walking around campus looking for somewhere suitable to study. Your task is to design a system that tells them where a free and suitable space is available, in real time.

In your answer, please:
1. Explain the problem as you understand it, including who it affects, why it matters, and what makes a space "suitable".
2. Consider at least two different approaches to solving it, and explain the strengths and weaknesses of each.
3. Choose one approach and justify why you chose it.
4. Address the trade-offs between cost, accuracy, and privacy.

You are not expected to build the system or write any code. You have 60 minutes to complete the task, with one 30-minute extension available with researcher approval, and you may use the AI assistant as you wish.`
}

export function createClientStages(consent: Stage): Stage[] {
 const component = (c: Omit<StageComponent, 'id'>): StageComponent => ({ ...c, id: crypto.randomUUID() })
 const make = (name: string, type: string, components: Omit<StageComponent, 'id'>[]): Stage => ({ ...createStage(type), name, components: components.map(component), countdownMinutes: 0, features: { ...createStage(type).features, timer: false, screenRecording: false, selfie: false } })
 const info = (name: string, content: string) => make(name, 'instruction', [{ type: 'text', label: content }])
 // One fully editable text block per stage keeps the researcher editor complete (the consent
 // text and question stem fields bind to it); line breaks and bullets render participant-side
 // through the pre-wrap text style, so nothing is trimmed away or hidden in extra components.
 const welcome = { ...consent, name: 'Read and sign the consent form', signingMethod: 'handwritten' as const, features: { ...consent.features, navigation: false }, components: [component({ type: 'text', label: clientContent.consentText }), ...consent.components.filter(c => c.type !== 'text')] }
 const design = make('Design task', 'short_answer', [{ type: 'text', label: clientContent.design }, { type: 'textbox', label: 'Your design', required: true }])
 design.countdownMinutes = 60; design.allowExtension = true; design.features = { ...design.features, timer: true, ai: true, screenRecording: true, copyPaste: true, confirm: true, pauseAbort: true }
 const oral = make('Recorded explanation', 'video_oral_answer', clientContent.oral.map(label => ({ type: 'text', label })))
 oral.countdownMinutes = 10; oral.sequentialQuestions = true; oral.recordingRequired = true; oral.recordingMode = 'manual'; oral.features = { ...oral.features, timer: true, selfie: true, ai: false, confirm: true }
 return [welcome, info('Before the task', clientContent.instructions['3']), make('Background questionnaire', 'single_choice', clientContent.background as Omit<StageComponent, 'id'>[]), make('Personality questionnaire (BFI-2)', 'single_choice', [{ type: 'text', label: 'Here are a number of characteristics that may or may not apply to you. For example, do you agree that you are someone who likes to spend time with others? Please write a number next to each statement to indicate the extent to which you agree or disagree with that statement.\n1 = Disagree strongly\n2 = Disagree a little\n3 = Neutral no opinion\n4 = Agree a little\n5 = Agree strongly' }, ...clientContent.personality as Omit<StageComponent, 'id'>[]]), info('Sensor setup and baseline', clientContent.instructions['5']), info('Task instructions', clientContent.instructions['6']), design, info('Before the explanation', clientContent.instructions['8']), oral, make('Self-report questionnaire', 'multiple_choice', clientContent.post as Omit<StageComponent, 'id'>[]), info('Finish', clientContent.instructions['11'])]
}
