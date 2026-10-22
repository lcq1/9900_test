import type { Stage, Experiment } from '../types'
import { ArrowLeft, ArrowRight, Play, Trash2 } from 'lucide-react'
import { StageBuilder } from '../researcher/StageBuilder'
import { StageContentEditor } from '../researcher/StageContentEditor'
import { StageFeatureEditor } from '../researcher/StageFeatureEditor'

/**
 * Researcher editor — three-column layout: stage list (left), stage content
 * (middle), stage features (right). The header (back link, experiment name,
 * full-screen switch, delete/publish) is preserved from the previous design.
 */
export function Editor({ experiment, stage, onBack, onAddStage, onSelectStage, onUpdateExperiment, onUpdateStage, onDelete, onDeleteStage, onReorderStages }: {
  experiment: Experiment
  stage: Stage
  onBack: () => void
  onAddStage: () => void
  onSelectStage: (id: string) => void
  onUpdateExperiment: (update: (experiment: Experiment) => Experiment) => void
  onUpdateStage: (update: (stage: Stage) => Stage) => void
  onDelete: (id: string) => void
  onDeleteStage: (id: string) => void
  onReorderStages: (from: number, to: number) => void
}) {
  return (
    <section className="editor">
      <div className="editor-header">
        <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> All experiments</button>
        <div className="editor-actions">
          <button className="secondary-button" onClick={() => onDelete(experiment.id)}><Trash2 size={15} /> Delete</button>
          <button className="secondary-button" onClick={() => window.alert('Preview opens the participant flow in the next tab.')}><Play size={15} /> Preview</button>
          <button className="primary-button" onClick={() => window.alert('Experiment saved and ready to share.')}>Publish <ArrowRight size={15} /></button>
        </div>
      </div>
      <div className="editor-title">
        <div>
          <p className="eyebrow">EXPERIMENT / {experiment.code}</p>
          <input className="title-input" value={experiment.name} onChange={(event) => onUpdateExperiment((current) => ({ ...current, name: event.target.value }))} />
          <div className="title-meta">
            <span className="status-pill">Draft</span>
            <span className="subheading">Last edited a few seconds ago</span>
          </div>
        </div>
        <label className="switch-label">
          <span>Full-screen mode</span>
          <button className={experiment.fullScreen ? 'switch on' : 'switch'} onClick={() => onUpdateExperiment((current) => ({ ...current, fullScreen: !current.fullScreen }))}><span></span></button>
        </label>
      </div>
      <div className="editor-grid">
        <StageBuilder
          experiment={experiment}
          selectedStageId={stage.id}
          onSelectStage={onSelectStage}
          onAddStage={onAddStage}
          onDeleteStage={onDeleteStage}
          onReorderStages={onReorderStages}
        />
        <StageContentEditor stage={stage} onUpdateStage={onUpdateStage} />
        <StageFeatureEditor stage={stage} onUpdateStage={onUpdateStage} />
      </div>
    </section>
  )
}
