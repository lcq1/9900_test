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
}
// Experiment metadata, status, fullscreen mode, and ordered stages.
export type Experiment = {
	id: string
	name: string
	code: string
	status: 'Draft' | 'Live'
	created: string
	fullScreen: boolean
	stages: Stage[]
}
