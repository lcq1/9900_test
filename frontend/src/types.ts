// Shared experiment, stage, component, and feature types.
export type ComponentType =
	'text' | 'textbox' | 'choice' | 'checkbox' | 'rating' | 'signature' | 'attachment' | 'button'
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

export function createStage(type: string = "short_answer"): Stage {
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
	if (!consent && type !== "instruction")
		components.push({
			id: crypto.randomUUID(),
			type:
				type === "multiple_choice"
					? "checkbox"
					: ["single_choice", "true_false"].includes(type)
						? "choice"
						: "textbox",
			label: "Your response",
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
		name: stageTypeLabel(type),
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
		if (responseType && !stage.components.some((c) => c.type === responseType))
			errors.push(
				`${prefix}: add a ${responseType === "textbox" ? "text box" : responseType} response component.`,
			);
		stage.components.forEach((component, componentIndex) => {
			if (!component.label.trim())
				errors.push(
					`${prefix}, component ${componentIndex + 1}: enter content or a label.`,
				);
			if (component.type === "choice" || component.type === "checkbox") {
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
 "instructions": {"1": "Welcome, and thank you for taking part in this study. In this session, you will work on a design task using an AI assistant, and then explain your design. The session takes about two hours. You can take a break if you need one, and you may stop at any time. You will now be shown the participant information and consent form. Please read it and confirm your consent electronically to begin. You may ask the researcher any questions first.", "3": "Before you start, please read the following: • You will work on a design task, as you would in a real design activity. • Your work will be assessed afterwards against design criteria, and you will receive feedback on your reasoning to help you improve. • Please treat it seriously and work through it properly. • You may use the AI assistant however you normally would, use it as much or as little as you like. • Your work is for this research only. It will not affect any grade, and no names are attached to your answers. Please complete the questionnaires on the next screens before the task begins.", "5": "The researcher will now help you put on the sensors for the study. These are comfortable and non-invasive: • A wristband on your wrist, which records your heart rate and skin activity. • A headband, which records brain activity (EEG). • An eye-tracker on the screen, which follows where you look. You do not wear this; it sits on the computer. Once the sensors are fitted, we will record a short baseline for a couple of minutes while you sit and relax, before the task begins. Please let the researcher know if anything feels uncomfortable at any point. You can ask to adjust or remove any sensor, and you may still take part. When everything is ready, we will move on to the task.", "6": "You will now work on the design task. • You have 60 minutes to complete this task. A timer is shown, and you may ask for more time if you need it (maximum 30 minutes extra). • An AI assistant is available on the screen. You may use it as you wish. • Write your answer in the space provided, and click Submit when you are finished. • Work through the task the way that feels natural to you. When you are ready, click Start to see the task.", "8": "Thank you for submitting your design. For the next part, the AI assistant is turned off. You will now explain your design in your own words. You will be shown a few questions, one at a time, and asked to record a short spoken answer to each using the camera and microphone. There are no right or wrong answers, we would just like to hear your thinking. Take a moment to think before you answer each question. You have a maximum of 10 minutes to answer all the questions. Click Continue when you are ready. Read the questions, and the recording will start once you are ready.", "11": "That's the end of the session. Thank you very much for taking part. Please wait while the researcher removes the equipment and confirms your data is saved. Please do not close this page yet. You will receive feedback on your design reasoning afterwards, and you may contact the research team at any time if you have questions."},
 "design": "Design a system that helps students find a free study space on campus in real time. Students often waste time walking around campus looking for somewhere suitable to study. Your task is to design a system that tells them where a free and suitable space is available, in real time. In your answer, please: 1. Explain the problem as you understand it, including who it affects, why it matters, and what makes a space \"suitable\". 2. Consider at least two different approaches to solving it, and explain the strengths and weaknesses of each. 3. Choose one approach and justify why you chose it. 4. Address the trade-offs between cost, accuracy, and privacy. You are not expected to build the system or write any code. You have 60 minutes to complete the task, with one 30-minute extension available with researcher approval, and you may use the AI assistant as you wish."
}

export function createClientStages(consent: Stage): Stage[] {
 const component = (c: Omit<StageComponent, 'id'>): StageComponent => ({ ...c, id: crypto.randomUUID() })
 const make = (name: string, type: string, components: Omit<StageComponent, 'id'>[]): Stage => ({ ...createStage(type), name, components: components.map(component), countdownMinutes: 0, features: { ...createStage(type).features, timer: false, screenRecording: false, selfie: false } })
 const info = (name: string, content: string) => make(name, 'instruction', [{ type: 'text', label: content }])
 const welcome = { ...consent, name: 'Welcome and consent', signingMethod: 'name' as const, features: { ...consent.features, navigation: false }, components: [component({ type: 'text', label: clientContent.instructions['1'] }), ...consent.components] }
 const design = make('Design task', 'short_answer', [{ type: 'text', label: clientContent.design }, { type: 'textbox', label: 'Your design', required: true }])
 design.countdownMinutes = 60; design.allowExtension = true; design.features = { ...design.features, timer: true, ai: true, screenRecording: true, copyPaste: true, confirm: true }
 const oral = make('Recorded explanation', 'video_oral_answer', clientContent.oral.map(label => ({ type: 'text', label })))
 oral.countdownMinutes = 10; oral.sequentialQuestions = true; oral.recordingRequired = true; oral.recordingMode = 'manual'; oral.features = { ...oral.features, timer: true, selfie: true, ai: false }
 return [welcome, info('Before the task', clientContent.instructions['3']), make('Background questionnaire', 'single_choice', clientContent.background as Omit<StageComponent, 'id'>[]), make('Personality questionnaire (BFI-2)', 'single_choice', [{ type: 'text', label: 'I am someone who…\nBFI-2 items copyright 2015 by Oliver P. John and Christopher J. Soto. Used for non-commercial research. Soto, C. J., & John, O. P. (2017). Journal of Personality and Social Psychology, 113, 117–143.' }, ...clientContent.personality as Omit<StageComponent, 'id'>[]]), info('Sensor setup and baseline', clientContent.instructions['5']), info('Task instructions', clientContent.instructions['6']), design, info('Before the explanation', clientContent.instructions['8']), oral, make('Self-report questionnaire', 'multiple_choice', clientContent.post as Omit<StageComponent, 'id'>[]), info('Finish', clientContent.instructions['11'])]
}
