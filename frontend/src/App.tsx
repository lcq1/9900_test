import { useState } from 'react'
import { useExperiments } from './store/experiments'
import './App.css'
import { BarChart3, ChevronDown, LayoutDashboard, LogOut, Play, Settings2, UserCog } from 'lucide-react'
import type { Stage, Experiment } from './types'
import { makeStage, starterExperiment } from './constants'
import { AuthScreen } from './pages/LoginPage'
import { Dashboard } from './pages/ResearcherDashboardPage'
import { Editor } from './pages/ExperimentEditorPage'
import { ParticipantEntry } from './pages/ParticipantPage'
import { AdministratorPage } from './pages/AdministratorPage'
import { ResultsPage } from './pages/ResultsPage'
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage'

function App() {
  const { experiments, error, clearError, addExperiment, removeExperiment, updateExperiment: updateExperimentById, updateStage: updateStageById, deleteStage, reorderStages } = useExperiments()
  const [signedIn, setSignedIn] = useState(() => localStorage.getItem('p13-signed-in') !== 'false')
  const [workspaceSettings, setWorkspaceSettings] = useState<{ researcherName: string }>(() => {
    try {
      const raw = localStorage.getItem('p13-workspace')
      if (raw) return JSON.parse(raw) as { researcherName: string }
    } catch { /* ignore corrupt value */ }
    return { researcherName: 'Beyong' }
  })
  const saveWorkspace = (next: { researcherName: string }) => {
    setWorkspaceSettings(next)
    localStorage.setItem('p13-workspace', JSON.stringify(next))
  }
  const [entryRole, setEntryRole] = useState<'researcher' | 'participant'>('researcher')
  const [participantAccess, setParticipantAccess] = useState<{ experimentCode?: string; participantCode?: string }>({})
  const [view, setView] = useState<'dashboard' | 'editor' | 'participant' | 'administrator' | 'results' | 'settings'>('dashboard')
  const [selectedId, setSelectedId] = useState(starterExperiment.id)
  const [selectedStageId, setSelectedStageId] = useState(starterExperiment.stages[0].id)
  const [query, setQuery] = useState('')
  const selectedExperiment = experiments.find((experiment) => experiment.id === selectedId) ?? experiments[0]
  const selectedStage = selectedExperiment?.stages.find((stage) => stage.id === selectedStageId) ?? selectedExperiment?.stages[0]
  const updateExperiment = (update: (experiment: Experiment) => Experiment) => updateExperimentById(selectedExperiment.id, update)
  const updateStage = (update: (stage: Stage) => Stage) => updateStageById(selectedExperiment.id, selectedStage.id, update)
  const createExperiment = () => { const id = `exp-${Date.now()}`; const experiment: Experiment = { id, name: 'Untitled experiment', code: `STUDY-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, status: 'Draft', created: '27 Sep 2026', fullScreen: selectedExperiment?.fullScreen ?? true, stages: [makeStage(`${id}-stage`, 'Welcome', 'Consent', [{ id: `${id}-text`, type: 'text', label: 'Welcome to your study' }])] }; addExperiment(experiment); setSelectedId(id); setSelectedStageId(experiment.stages[0].id); setView('editor') }
  const deleteExperiment = (id: string) => { if (!window.confirm('Delete this experiment? This cannot be undone.')) return; removeExperiment(id); if (id === selectedId) setView('dashboard') }
  const addStage = () => { const stage = makeStage(`stage-${Date.now()}`, 'New stage', 'Task', []); updateExperiment((experiment) => ({ ...experiment, stages: [...experiment.stages, stage] })); setSelectedStageId(stage.id) }
  const deleteStageOf = (id: string) => {
    const current = experiments.find((e) => e.id === selectedExperiment.id)
    deleteStage(selectedExperiment.id, id)
    if (current && id === selectedStageId) {
      const remaining = current.stages.filter((s) => s.id !== id)
      if (remaining.length > 0) setSelectedStageId(remaining[0].id)
    }
  }
  const reorder = (from: number, to: number) => reorderStages(selectedExperiment.id, from, to)
  if (entryRole === 'participant' && selectedExperiment) return <ParticipantEntry experiments={experiments} onBack={() => setEntryRole('researcher')} initialExperimentCode={participantAccess.experimentCode} initialParticipantCode={participantAccess.participantCode} />
  if (!signedIn) return <AuthScreen onSignIn={() => { localStorage.setItem('p13-signed-in', 'true'); setSignedIn(true) }} onParticipant={(experimentCode, participantCode) => { setParticipantAccess({ experimentCode, participantCode }); setEntryRole('participant') }} />

  return (
    <div className="app-shell">
      {error && (
        <div className="persist-banner" role="alert">
          <span className="persist-banner-icon">!</span>
          <span className="persist-banner-text">{error}</span>
          <button className="persist-banner-close" onClick={clearError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <aside className="sidebar"><div className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19 19 5" /><path d="M9 5h10v10" /></svg></span><span className="brand-word">Beyond</span></div><div className="workspace-label">WORKSPACE</div><nav><button className={view === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setView('dashboard')}><LayoutDashboard size={17} /> Researcher overview</button><button className={view === 'participant' ? 'nav-item active' : 'nav-item'} onClick={() => setView('participant')}><Play size={17} /> Participant preview</button><button className={view === 'administrator' ? 'nav-item active' : 'nav-item'} onClick={() => setView('administrator')}><UserCog size={17} /> Administration</button><button className={view === 'results' ? 'nav-item active' : 'nav-item'} onClick={() => setView('results')}><BarChart3 size={17} /> Visualization results</button></nav><div className="sidebar-bottom"><button className={view === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setView('settings')}><Settings2 size={17} /> Workspace settings</button><div className="profile"><span className="avatar">{(workspaceSettings.researcherName || 'Beyong').charAt(0).toUpperCase()}</span><div><strong>{workspaceSettings.researcherName || 'Beyong'}</strong><small>Researcher</small></div><ChevronDown size={15} /></div></div></aside><main className="main-content"><header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{view === 'settings' ? 'Workspace settings' : view === 'editor' ? selectedExperiment?.name : view === 'participant' ? 'Participant preview' : 'Experiments'}</strong></div><div className="top-actions"><span className="save-state"><span className="status-dot"></span> Saved just now</span><button className="icon-button" title="Sign out" onClick={() => { localStorage.setItem('p13-signed-in', 'false'); setSignedIn(false) }}><LogOut size={17} /></button></div></header>{view === 'dashboard' && <Dashboard experiments={experiments} query={query} setQuery={setQuery} onCreate={createExperiment} onEdit={(id) => { setSelectedId(id); const experiment = experiments.find((item) => item.id === id); setSelectedStageId(experiment?.stages[0].id ?? ''); setView('editor') }} onDelete={deleteExperiment} />}{view === 'editor' && selectedExperiment && selectedStage && <Editor experiment={selectedExperiment} stage={selectedStage} onBack={() => setView('dashboard')} onAddStage={addStage} onSelectStage={setSelectedStageId} onUpdateExperiment={updateExperiment} onUpdateStage={updateStage} onDelete={deleteExperiment} onDeleteStage={deleteStageOf} onReorderStages={reorder} />}{view === 'participant' && selectedExperiment && <ParticipantEntry experiments={experiments} onBack={() => setView('dashboard')} />}{view === 'administrator' && <AdministratorPage experiments={experiments} />}{view === 'results' && <ResultsPage experiments={experiments} />}{view === 'settings' && (<WorkspaceSettingsPage experiments={experiments} settings={workspaceSettings} onChange={saveWorkspace} onClose={() => setView('dashboard')} onClearAll={clearAllLocalData} />)}</main></div>
  )
}

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
