import { useState } from 'react'
import { useExperiments } from './store/experiments'
import './App.css'
import {
	BarChart3,
	ChevronDown,
	LayoutDashboard,
	LogOut,
	Play,
	Settings2,
	UserCog,
} from 'lucide-react'
import type { Stage, Experiment } from './types'
import { makeStage, starterExperiment } from './constants'
import { AuthScreen } from './pages/LoginPage'
import { Dashboard } from './pages/ResearcherDashboardPage'
import { Editor } from './pages/ExperimentEditorPage'
import { ParticipantEntry } from './pages/ParticipantPage'
import { AdministratorPage } from './pages/AdministratorPage'
import { ResultsPage } from './pages/ResultsPage'
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage'

// Manage login, experiment selection, and workspace navigation.
function App() {
	const {
		experiments,
		addExperiment,
		removeExperiment,
		updateExperiment: updateExperimentById,
		updateStage: updateStageById,
		deleteStage,
		reorderStages,
	} = useExperiments()
	// Initialize login state and researcher display settings.
	const [signedIn, setSignedIn] = useState(() => localStorage.getItem('p13-signed-in') !== 'false')
	const [workspaceSettings, setWorkspaceSettings] = useState<{ researcherName: string }>(() => {
		// Load cached settings or use defaults.
		try {
			// Parse cached data; fall back if invalid.
			const raw = localStorage.getItem('p13-workspace')
			if (raw) return JSON.parse(raw) as { researcherName: string }
		} catch {
			// Use the default researcher name if settings are invalid.
		}
		return { researcherName: 'Beyong' }
	})
	// Update the researcher name and save workspace settings locally.
	const saveWorkspace = (next: { researcherName: string }) => {
		setWorkspaceSettings(next)
		localStorage.setItem('p13-workspace', JSON.stringify(next))
	}
	// Track role, access codes, navigation, selection, and search.
	const [entryRole, setEntryRole] = useState<'researcher' | 'participant'>('researcher')
	const [participantAccess, setParticipantAccess] = useState<{
		experimentCode?: string
		participantCode?: string
	}>({})
	const [view, setView] = useState<
		'dashboard' | 'editor' | 'participant' | 'administrator' | 'results' | 'settings'
	>('dashboard')
	const [selectedId, setSelectedId] = useState(starterExperiment.id)
	const [selectedStageId, setSelectedStageId] = useState(starterExperiment.stages[0].id)
	const [query, setQuery] = useState('')
	// Use the selected experiment or fall back to the first.
	const selectedExperiment =
		experiments.find((experiment) => experiment.id === selectedId) ?? experiments[0]
	// Use the selected stage or fall back to the first.
	const selectedStage =
		selectedExperiment?.stages.find((stage) => stage.id === selectedStageId) ??
		selectedExperiment?.stages[0]
	// Apply changes to the current experiment.
	const updateExperiment = (update: (experiment: Experiment) => Experiment) =>
		updateExperimentById(selectedExperiment.id, update)
	// Apply changes to the selected stage.
	const updateStage = (update: (stage: Stage) => Stage) =>
		updateStageById(selectedExperiment.id, selectedStage.id, update)
	// Create an experiment with a welcome stage and open the editor.
	const createExperiment = () => {
		const id = `exp-${Date.now()}`
		const experiment: Experiment = {
			id,
			name: 'Untitled experiment',
			code: `STUDY-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
			status: 'Draft',
			created: '27 Sep 2026',
			fullScreen: selectedExperiment?.fullScreen ?? true,
			stages: [
				makeStage(`${id}-stage`, 'Welcome', 'Consent', [
					{ id: `${id}-text`, type: 'text', label: 'Welcome to your study' },
				]),
			],
		}
		addExperiment(experiment)
		setSelectedId(id)
		setSelectedStageId(experiment.stages[0].id)
		setView('editor')
	}
	// Confirm deletion and return to the dashboard if needed.
	const deleteExperiment = (id: string) => {
		if (!window.confirm('Delete this experiment? This cannot be undone.')) return
		removeExperiment(id)
		if (id === selectedId) setView('dashboard')
	}
	// Append a stage to the experiment.
	const addStage = () => {
		const stage = makeStage(`stage-${Date.now()}`, 'New stage', 'Task', [])
		updateExperiment((experiment) => ({ ...experiment, stages: [...experiment.stages, stage] }))
		setSelectedStageId(stage.id)
	}
	// Delete a stage and select the first remaining stage if needed.
	const deleteStageOf = (id: string) => {
		const current = experiments.find((e) => e.id === selectedExperiment.id)
		deleteStage(selectedExperiment.id, id)
		if (current && id === selectedStageId) {
			// Select the first remaining stage if the selected stage was deleted.
			const remaining = current.stages.filter((s) => s.id !== id)
			if (remaining.length > 0) setSelectedStageId(remaining[0].id)
		}
	}
	// Reorder stages in the current experiment.
	const reorder = (from: number, to: number) => reorderStages(selectedExperiment.id, from, to)
	if (entryRole === 'participant' && selectedExperiment)
		return (
			<ParticipantEntry
				experiments={experiments}
				onBack={() => setEntryRole('researcher')}
				initialExperimentCode={participantAccess.experimentCode}
				initialParticipantCode={participantAccess.participantCode}
			/>
		)
	if (!signedIn)
		return (
			<AuthScreen
				onSignIn={() => {
					// Save the login flag and open the workspace.
					localStorage.setItem('p13-signed-in', 'true')
					setSignedIn(true)
				}}
				onParticipant={(experimentCode, participantCode) => {
					// Save access codes and open the participant entry page.
					setParticipantAccess({ experimentCode, participantCode })
					setEntryRole('participant')
				}}
			/>
		)

	// Render the current view.
	return (
		<div className="app-shell">
			{/* Workspace navigation and researcher profile. */}
			<aside className="sidebar">
				<div className="brand">
					<span className="brand-mark" aria-hidden="true">
						<svg
							viewBox="0 0 24 24"
							width="16"
							height="16"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.4"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M5 19 19 5" />
							<path d="M9 5h10v10" />
						</svg>
					</span>
					<span className="brand-word">Beyond</span>
				</div>
				<div className="workspace-label">WORKSPACE</div>
				<nav>
					<button
						className={view === 'dashboard' ? 'nav-item active' : 'nav-item'}
						onClick={() => setView('dashboard')}
					>
						<LayoutDashboard size={17} /> Researcher overview
					</button>
					<button
						className={view === 'participant' ? 'nav-item active' : 'nav-item'}
						onClick={() => setView('participant')}
					>
						<Play size={17} /> Participant preview
					</button>
					<button
						className={view === 'administrator' ? 'nav-item active' : 'nav-item'}
						onClick={() => setView('administrator')}
					>
						<UserCog size={17} /> Administration
					</button>
					<button
						className={view === 'results' ? 'nav-item active' : 'nav-item'}
						onClick={() => setView('results')}
					>
						<BarChart3 size={17} /> Visualization results
					</button>
				</nav>
				{/* Workspace settings and researcher profile. */}
				<div className="sidebar-bottom">
					<button
						className={view === 'settings' ? 'nav-item active' : 'nav-item'}
						onClick={() => setView('settings')}
					>
						<Settings2 size={17} /> Workspace settings
					</button>
					<div className="profile">
						<span className="avatar">
							{(workspaceSettings.researcherName || 'Beyong').charAt(0).toUpperCase()}
						</span>
						<div>
							<strong>{workspaceSettings.researcherName || 'Beyong'}</strong>
							<small>Researcher</small>
						</div>
						<ChevronDown size={15} />
					</div>
				</div>
			</aside>
			<main className="main-content">
				{/* Breadcrumbs, save status, and logout. */}
				<header className="topbar">
					<div className="breadcrumbs">
						<span>Workspace</span>
						<span>/</span>
						<strong>
							{/* Workspace profile, preferences, and local usage. */}
							{view === 'settings'
								? 'Workspace settings'
								: view === 'editor'
									? selectedExperiment?.name
									: view === 'participant'
										? 'Participant preview'
										: 'Experiments'}
						</strong>
					</div>
					<div className="top-actions">
						<span className="save-state">
							<span className="status-dot"></span> Saved just now
						</span>
						<button
							className="icon-button"
							title="Sign out"
							onClick={() => {
								// Clear the login flag and show the login page.
								localStorage.setItem('p13-signed-in', 'false')
								setSignedIn(false)
							}}
						>
							<LogOut size={17} />
						</button>
					</div>
				</header>
				{/* Researcher dashboard and experiment management. */}
				{view === 'dashboard' && (
					<Dashboard
						experiments={experiments}
						query={query}
						setQuery={setQuery}
						onCreate={createExperiment}
						onEdit={(id) => {
							// Select the experiment and its first stage, then open the editor.
							setSelectedId(id)
							const experiment = experiments.find((item) => item.id === id)
							setSelectedStageId(experiment?.stages[0].id ?? '')
							setView('editor')
						}}
						onDelete={deleteExperiment}
					/>
				)}
				{/* Experiment and selected stage editor. */}
				{view === 'editor' && selectedExperiment && selectedStage && (
					<Editor
						experiment={selectedExperiment}
						stage={selectedStage}
						onBack={() => setView('dashboard')}
						onAddStage={addStage}
						onSelectStage={setSelectedStageId}
						onUpdateExperiment={updateExperiment}
						onUpdateStage={updateStage}
						onDelete={deleteExperiment}
						onDeleteStage={deleteStageOf}
						onReorderStages={reorder}
					/>
				)}
				{/* Participant entry and experiment preview. */}
				{view === 'participant' && selectedExperiment && (
					<ParticipantEntry experiments={experiments} onBack={() => setView('dashboard')} />
				)}
				{/* Researcher accounts and platform settings. */}
				{view === 'administrator' && <AdministratorPage experiments={experiments} />}
				{/* Participant sessions and event charts. */}
				{view === 'results' && <ResultsPage experiments={experiments} />}
				{/* Workspace profile, preferences, and local usage. */}
				{view === 'settings' && (
					<WorkspaceSettingsPage
						experiments={experiments}
						settings={workspaceSettings}
						onChange={saveWorkspace}
						onClose={() => setView('dashboard')}
						onClearAll={clearAllLocalData}
					/>
				)}
			</main>
		</div>
	)
}

// Clear workspace caches, API caches, and participant event logs.
function clearAllLocalData() {
	const keysToRemove = [
		'p13-experiments',
		'p13-workspace',
		'p13-signed-in',
		'p13-session',
		'p13-researchers',
		'p13-platform-settings',
	]
	keysToRemove.forEach((key) => localStorage.removeItem(key))
	Object.keys(localStorage)
		.filter((key) => key.startsWith('p13-api') || key.startsWith('p13-events'))
		.forEach((key) => localStorage.removeItem(key))
}

export default App
