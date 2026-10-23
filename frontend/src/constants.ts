import type { ComponentType, FeatureKey, StageComponent, Stage, Experiment } from './types'
import { ArrowLeft, Clock3, Copy, MessageCircle, MonitorPlay, Pause, PenLine, Paperclip, ShieldCheck, TimerReset, Video } from 'lucide-react'

export const featureLabels: Record<FeatureKey, { label: string; icon: typeof Clock3 }> = {
  ai: { label: 'AI chat', icon: MessageCircle },
  timer: { label: 'Countdown timer', icon: TimerReset },
  clock: { label: 'Wall clock', icon: Clock3 },
  screenRecording: { label: 'Screen recording', icon: MonitorPlay },
  selfie: { label: 'Self video / audio', icon: Video },
  copyPaste: { label: 'Copy-paste logging', icon: Copy },
  navigation: { label: 'Back navigation', icon: ArrowLeft },
  confirm: { label: 'Double-confirm', icon: ShieldCheck },
  pauseAbort: { label: 'Pause / abort', icon: Pause },
  signatureBox: { label: 'Signature box', icon: PenLine },
  attachment: { label: 'Attachment', icon: Paperclip },
}

/** The seven stage types defined in Plan.md §2.4. */
export const STAGE_TYPES: { type: string; label: string }[] = [
  { type: 'consent', label: 'Consent' },
  { type: 'single_choice', label: 'Single choice' },
  { type: 'multiple_choice', label: 'Multiple choice' },
  { type: 'true_false', label: 'True / false' },
  { type: 'fill_blank', label: 'Fill in the blank' },
  { type: 'short_answer', label: 'Short answer' },
  { type: 'video_oral_answer', label: 'Video oral answer' },
]

/** Resolve a stage type to its human-readable label (falls back to the raw type). */
export const stageTypeLabel = (type: string): string => STAGE_TYPES.find((t) => t.type === type)?.label ?? type

export const makeStage = (id: string, name: string, type: string, components: StageComponent[], features: Partial<Record<FeatureKey, boolean>> = {}): Stage => ({
  id,
  name,
  type,
  duration: 20,
  components,
  countdownMinutes: 2,
  features: {
    ai: false,
    timer: true,
    clock: false,
    screenRecording: true,
    selfie: false,
    copyPaste: false,
    navigation: true,
    confirm: false,
    pauseAbort: true,
    signatureBox: false,
    attachment: false,
    ...features,
  },
})

export const starterExperiment: Experiment = { id: 'exp-design-01', name: 'AI-assisted design study', code: 'DESIGN-7K2M', status: 'Draft', created: '26 Sep 2026', fullScreen: true, stages: [makeStage('stage-consent', 'Consent', 'consent', [{ id: 'c1', type: 'text', label: 'Before you begin' }, { id: 'c2', type: 'text', label: 'This study records your AI interactions, copy-paste events, and optional self video. You may stop at any time.' }, { id: 'c3', type: 'button', label: 'I consent and want to continue' }]), makeStage('stage-questionnaire', 'Questionnaire', 'Questionnaire', [{ id: 'q1', type: 'text', label: 'Tell us about your engineering design experience.' }, { id: 'q2', type: 'textbox', label: 'Your response', required: true }, { id: 'q3', type: 'rating', label: 'How confident do you feel?', options: ['1', '2', '3', '4', '5'] }], { copyPaste: true }), makeStage('stage-task', 'Design task', 'Task', [{ id: 't1', type: 'text', label: 'Design a lightweight bridge for a 20 cm gap.' }, { id: 't2', type: 'textbox', label: 'Describe your approach', required: true }], { ai: true, timer: true, clock: true, selfie: true, copyPaste: true, confirm: true })] }

/** Seed experiments used on first load (when localStorage is empty). Each has a
 *  distinct code so testers can exercise different participant scenarios. */
const aiStudy: Experiment = {
  id: 'exp-ai-21',
  name: 'AI brainstorming session',
  code: 'STUDY-AI21',
  status: 'Draft',
  created: '27 Sep 2026',
  fullScreen: true,
  stages: [
    makeStage('ai-consent', 'Consent', 'consent', [
      { id: 'a1', type: 'text', label: 'Welcome to this study.' },
      { id: 'a2', type: 'text', label: 'This session enables AI chat and optional self video. You may withdraw at any time.' },
      { id: 'a3', type: 'button', label: 'I consent and want to continue' },
    ]),
    makeStage('ai-brief', 'Design brief', 'short_answer', [
      { id: 'b1', type: 'text', label: 'Sketch an approach to the given prompt.' },
      { id: 'b2', type: 'textbox', label: 'Your response', required: true },
    ], { ai: true, timer: true, clock: true, copyPaste: true }),
    makeStage('ai-oral', 'Oral reflection', 'video_oral_answer', [
      { id: 'c1', type: 'text', label: 'Record a short spoken reflection of your approach.' },
      { id: 'c2', type: 'textbox', label: 'Summary notes' },
    ], { selfie: true, timer: true, confirm: true }),
  ],
}

const designSurvey: Experiment = {
  id: 'exp-quiz-39',
  name: 'Design attitudes survey',
  code: 'QUIZ-3F9K',
  status: 'Draft',
  created: '27 Sep 2026',
  fullScreen: false,
  stages: [
    makeStage('q-consent', 'Consent', 'consent', [
      { id: 'q1', type: 'text', label: 'Welcome to the survey.' },
      { id: 'q2', type: 'button', label: 'I consent' },
    ]),
    makeStage('q-mc', 'Tooling preferences', 'multiple_choice', [
      { id: 'm1', type: 'text', label: 'Which tools do you use most?' },
      { id: 'm2', type: 'choice', label: 'Select one', options: ['CAD', 'Simulation', 'Prototype', 'None'] },
    ], { copyPaste: true }),
    makeStage('q-tf', 'Confidence check', 'true_false', [
      { id: 't1', type: 'text', label: 'I feel confident applying design methods.' },
      { id: 't2', type: 'checkbox', label: 'Agree / Disagree', options: ['Agree', 'Disagree'] } ]),
    makeStage('q-rating', 'Self rating', 'short_answer', [
      { id: 'r1', type: 'text', label: 'Rate your design self-efficacy.' },
      { id: 'r2', type: 'rating', label: 'Score', options: ['1', '2', '3', '4', '5'] },
    ], { timer: true }),
  ],
}

export const seedExperiments: Experiment[] = [starterExperiment, aiStudy, designSurvey]

export const palette: { type: ComponentType; label: string; hint: string }[] = [{ type: 'text', label: 'Text', hint: 'Instruction or context' }, { type: 'textbox', label: 'Text box', hint: 'Free-form response' }, { type: 'choice', label: 'Multiple choice', hint: 'Single select' }, { type: 'checkbox', label: 'Checkboxes', hint: 'One or many' }, { type: 'rating', label: 'Rating scale', hint: '1 to 5 or 1 to 10' }, { type: 'signature', label: 'Signature', hint: 'Draw or sign' }, { type: 'attachment', label: 'Attachment', hint: 'Upload a file' }, { type: 'button', label: 'Button', hint: 'Advance the stage' }]

export const makeComponent = (type: ComponentType): StageComponent => ({ id: `${type}-${Date.now()}`, type, label: type === 'text' ? 'New instruction' : type === 'textbox' ? 'New response' : type === 'choice' ? 'Choose one option' : type === 'checkbox' ? 'Select all that apply' : type === 'rating' ? 'Rate this statement' : type === 'signature' ? 'Your signature' : type === 'attachment' ? 'Upload an attachment' : 'Continue', required: ['textbox', 'signature', 'attachment'].includes(type), options: ['choice', 'checkbox'].includes(type) ? ['Option A', 'Option B', 'Option C'] : type === 'rating' ? ['1', '2', '3', '4', '5'] : undefined })
