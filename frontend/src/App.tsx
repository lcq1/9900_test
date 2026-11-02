import { useTransientNotice } from './participant/TimerController'
import { ParticipantAccessPage } from './pages/ParticipantPage'
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";

import {
	Navigate,
	Route,
	Routes,
	useLocation,
	useNavigate,
	useParams,
} from "react-router-dom";
import { Alert, Modal } from "antd";
import {
	BarChart3,
	ChevronDown,
	LayoutDashboard,
	LogOut,
	Play,
	Settings2,
	UserCog,
} from "lucide-react";
import { useExperiments } from "./api/experiments";
import { signOut } from "./api/auth";
import {
	clear,
	clearParticipantToken,
	getSession,
	useSessionStore,
} from './auth/sessionStore'
import { AuthScreen } from './pages/LoginPage'
import { ResearcherRegisterPage } from "./pages/ResearcherRegisterPage";
import {
	Dashboard,
	ResultsPage,
	WorkspaceSettingsPage,
} from "./pages/ResearcherDashboardPage";
import { Editor } from './pages/ExperimentEditorPage'
import { ParticipantEntry } from './pages/ParticipantPage'
import { AdministratorPage } from './pages/AdministratorPage'
import {
	createStage,
	type Experiment,
	type Stage,
	getPublishErrors,
} from "./types";

function Login() {
	const navigate = useNavigate(),
		location = useLocation(),
		session = useSessionStore((s) => s.session);
	if (session)
		return (
			<Navigate
				replace
				to={
					session.researcher.role === "administrator"
						? "/administrator/dashboard"
						: "/researcher/dashboard"
				}
			/>
		);
	return (
		<AuthScreen
			initialEmail={(location.state as { email?: string } | null)?.email}
			onRegister={() => navigate("/researcher/register")}
			onSignIn={() =>
				navigate(
					getSession()?.researcher.role === "administrator"
						? "/administrator/dashboard"
						: "/researcher/dashboard",
				)
			}
			onParticipant={(experimentCode, participantCode) =>
				navigate("/participant", { state: { experimentCode, participantCode } })
			}
		/>
	);
}
function Register() {
	const navigate = useNavigate();
	return (
		<ResearcherRegisterPage
			onRegistered={(r) => navigate("/login", { state: { email: r.email } })}
			onBack={() => navigate("/login")}
		/>
	);
}
function Protected({
	children,
	admin = false,
}: {
	children: ReactNode;
	admin?: boolean;
}) {
	const session = useSessionStore((s) => s.session);
	if (!session) return <Navigate to="/login" replace />;
	if (admin && session.researcher.role !== "administrator")
		return <Navigate to="/researcher/dashboard" replace />;
	return children;
}
function WorkspaceLayout({
	children,
	title = "Experiments",
	dirty = false,
	saving = false,
	onSave,
}: {
	children: ReactNode;
	title?: string;
	dirty?: boolean;
	saving?: boolean;
	onSave?: () => void;
}) {
	const navigate = useNavigate(),
		location = useLocation(),
		session = useSessionStore((s) => s.session);
	const me = session?.researcher;
	const [profileName, setProfileName] = useState(me?.name || "Researcher");
	useEffect(() => {
		const update = () => {
			try {
				setProfileName(
					localStorage.getItem("beyond-display-name:" + me?.id) ||
					JSON.parse(localStorage.getItem("p13-workspace") || "{}")
						.researcherName ||
					me?.name ||
					"Researcher",
				);
			} catch {
				setProfileName(me?.name || "Researcher");
			}
		};
		update();
		window.addEventListener("beyond-profile-change", update);
		return () => window.removeEventListener("beyond-profile-change", update);
	}, [me?.id, me?.name]);
	const links = [
		{
			path: "/researcher/dashboard",
			label: "Researcher overview",
			icon: LayoutDashboard,
		},
		{ path: "/researcher/preview", label: "Participant preview", icon: Play },
		...(me?.role === "administrator"
			? [
				{
					path: "/administrator/dashboard",
					label: "Administration",
					icon: UserCog,
				},
			]
			: []),
		{
			path: "/researcher/results",
			label: "Visualization results",
			icon: BarChart3,
		},
	];
	return (
		<div className="app-shell">
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
				<nav aria-label="Workspace">
					{links.map(({ path, label, icon: Icon }) => (
						<button
							key={path}
							className={
								location.pathname === path ? "nav-item active" : "nav-item"
							}
							onClick={() => navigate(path)}
						>
							<Icon size={17} />
							{label}
						</button>
					))}
				</nav>
				<div className="sidebar-bottom">
					<button
						className={
							location.pathname === "/researcher/settings"
								? "nav-item active"
								: "nav-item"
						}
						onClick={() => navigate("/researcher/settings")}
					>
						<Settings2 size={17} />
						Workspace settings
					</button>
					<div className="profile">
						<span className="avatar">
							{profileName.charAt(0).toUpperCase()}
						</span>
						<div>
							<strong>{profileName}</strong>
							<small>
								{me?.role === "administrator" ? "Administrator" : "Researcher"}
							</small>
						</div>
						<ChevronDown size={15} />
					</div>
				</div>
			</aside>
			<main className="main-content">
				<header className="topbar">
					<div className="breadcrumbs">
						<span>Workspace</span>
						<span>/</span>
						<strong>{title}</strong>
					</div>
					<div className="top-actions">
						{onSave ? (
							<>
								<span className="save-state">
									<span className="status-dot" />
									{saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
								</span>
								<button
									className="primary-button"
									disabled={!dirty || saving}
									onClick={onSave}
								>
									{saving ? "Saving…" : "Save draft"}
								</button>
							</>
						) : null}
						<button
							className="icon-button"
							title="Sign out"
							onClick={async () => {
								await signOut().catch(() => undefined);
								clear();
								navigate("/login");
							}}
						>
							<LogOut size={17} />
						</button>
					</div>
				</header>
				{children}
			</main>
		</div>
	);
}
function WorkspacePage({ view }: { view: 'preview' | 'results' | 'settings' }) {
	const navigate = useNavigate(),
		location = useLocation(),
		{ experiments, loading, error } = useExperiments()
	const requestedExperiment = new URLSearchParams(location.search).get(
		'experiment',
	)
	const previewExperiment = requestedExperiment
		? experiments.find(
				(experiment) => experiment.id === requestedExperiment,
			)
		: experiments[0]
	const [previewParticipantCode] = useState(
		() => `PREVIEW-${crypto.randomUUID()}`,
	)
	const me = useSessionStore((s) => s.session?.researcher)
	const [workspaceSettings, setWorkspaceSettings] = useState(() => {
		try {
			return {
				researcherName:
					localStorage.getItem('beyond-display-name:' + me?.id) ||
					JSON.parse(localStorage.getItem('p13-workspace') || '{}')
						.researcherName ||
					me?.name ||
					'Researcher',
			}
		} catch {
			return { researcherName: me?.name || 'Researcher' }
		}
	})
	return (
		<WorkspaceLayout
			title={
				view === 'preview'
					? 'Participant preview'
					: view === 'results'
						? 'Visualization results'
						: 'Workspace settings'
			}
		>
			{view === 'preview' ? (
				loading ? (
					<p className="page">Loading experiment…</p>
				) : error ? (
					<Alert type="error" title={error.message} />
				) : previewExperiment ? (
					<ParticipantEntry
						key={previewExperiment.id}
						previewOnly
						experiments={[previewExperiment]}
						initialExperimentCode={previewExperiment.code}
						initialParticipantCode={previewParticipantCode}
						onBack={() =>
							navigate(
								`/researcher/experiment/${previewExperiment.id}`,
							)
						}
					/>
				) : (
					<p className="page">
						{requestedExperiment
							? 'Experiment not found.'
							: 'Create an experiment before previewing it.'}
					</p>
				)
			) : view === 'results' ? (
				<ResultsPage experiments={experiments} />
			) : (
				<WorkspaceSettingsPage
					experiments={experiments}
					settings={workspaceSettings}
					onChange={(next) => {
						setWorkspaceSettings(next)
						localStorage.setItem(
							'p13-workspace',
							JSON.stringify(next),
						)
						localStorage.setItem(
							'beyond-display-name:' + me?.id,
							next.researcherName,
						)
						window.dispatchEvent(new Event('beyond-profile-change'))
					}}
					onClearAll={() => {
						for (const key of Object.keys(localStorage)) {
							if (
								[
									'p13-experiments',
									'p13-workspace',
									'p13-signed-in',
									'p13-session',
									'p13-researchers',
									'p13-platform-settings',
								].includes(key) ||
								key.startsWith('p13-api') ||
								key.startsWith('p13-events')
							)
								localStorage.removeItem(key)
						}
					}}
					onClose={() => navigate('/researcher/dashboard')}
				/>
			)}
		</WorkspaceLayout>
	)
}
function Workspace() {
	const navigate = useNavigate(),
		{ experiments, loading, error, addExperiment, removeExperiment } =
			useExperiments()
	const [query, setQuery] = useState(''),
		[failure, setFailure, failureVisible, failureRevision] =
			useTransientNotice('')
	const create = async () => {
		const name = window.prompt('Experiment name')
		if (!name?.trim()) return
		try {
			const e = await addExperiment({
				name: name.trim(),
				stages: [createStage('consent')],
				fullScreen: false,
			})
			navigate('/researcher/experiment/' + e.id)
		} catch (e) {
			setFailure(
				e instanceof Error ? e.message : 'Could not create experiment.',
			)
		}
	}
	const remove = (id: string) => {
		Modal.confirm({
			title: 'Delete this experiment?',
			content: 'Experiments with participant runs cannot be deleted.',
			onOk: async () => {
				try {
					await removeExperiment(id)
				} catch (e) {
					setFailure(
						e instanceof Error
							? e.message
							: 'Could not delete experiment.',
					)
					throw e
				}
			},
		})
	}
	return (
		<WorkspaceLayout>
			{(error || (failure && failureVisible)) && (
				<Alert
					key={failureRevision}
					className={
						failure && failureVisible
							? 'transient-notice'
							: undefined
					}
					type="error"
					showIcon
					title={failure && failureVisible ? failure : error?.message}
				/>
			)}
			{loading ? (
				<p className="page">Loading experiments…</p>
			) : (
				<Dashboard
					experiments={experiments}
					query={query}
					setQuery={setQuery}
					onCreate={() => void create()}
					onEdit={(id) => navigate('/researcher/experiment/' + id)}
					onDelete={remove}
				/>
			)}
		</WorkspaceLayout>
	)
}
function ExperimentEditor() {
	const { experimentId } = useParams(),
		{ experiments, loading, error } = useExperiments();
	const remote = experiments.find((e) => e.id === experimentId);
	if (loading) return <p className="page">Loading experiment…</p>;
	if (error) return <Alert type="error" title={error.message} />;
	if (!remote) return <Alert type="error" title="Experiment not found." />;
	return <ExperimentDraft key={remote.id} remote={remote} />;
}
function ExperimentDraft({ remote }: { remote: Experiment }) {
	const navigate = useNavigate(),
		{ saveExperiment, removeExperiment } = useExperiments()
	const revision = useRef(0)
	const publishIntent = useRef<{ key: string; id: string } | null>(null)
	const requestInFlight = useRef(false)
	const [draft, setDraft] = useState<Experiment>(() =>
			structuredClone(remote),
		),
		[selected, setSelected] = useState(remote.stages[0]?.id ?? ''),
		[dirty, setDirty] = useState(false),
		[saving, setSaving] = useState(false),
		[publishing, setPublishing] = useState(false),
		[unpublishing, setUnpublishing] = useState(false),
		[
			publishErrors,
			setPublishErrors,
			publishErrorsVisible,
			publishErrorsRevision,
		] = useTransientNotice<string[]>([]),
		[success, setSuccess, successVisible, successRevision] =
			useTransientNotice(''),
		[failure, setFailure, failureVisible, failureRevision] =
			useTransientNotice('')
	const stage = draft.stages.find((s) => s.id === selected) ?? draft.stages[0]
	const change = (fn: (e: Experiment) => Experiment) => {
		revision.current += 1
		setDraft((current) => {
			const updated = fn(current)
			const changed =
				updated.name !== current.name ||
				updated.fullScreen !== current.fullScreen ||
				JSON.stringify(updated.stages) !==
					JSON.stringify(current.stages)
			return changed && current.status === 'Live'
				? { ...updated, status: 'Draft' }
				: updated
		})
		setDirty(true)
		setSuccess('')
		setPublishErrors([])
	}
	const changeStage = (fn: (s: Stage) => Stage) =>
		change((e) => ({
			...e,
			stages: e.stages.map((s) => (s.id === stage.id ? fn(s) : s)),
		}))
	const add = () => {
		if (draft.stages.length >= 20) return
		const next = createStage()
		change((e) => ({ ...e, stages: [...e.stages, next] }))
		setSelected(next.id)
	}
	const removeStage = (id: string) => {
		if (draft.stages[0]?.id === id) return
		change((e) => ({ ...e, stages: e.stages.filter((s) => s.id !== id) }))
		if (selected === id) setSelected(draft.stages[0].id)
	}
	const reorder = (from: number, to: number) => {
		if (
			from <= 0 ||
			to <= 0 ||
			from >= draft.stages.length ||
			to >= draft.stages.length
		)
			return
		change((e) => {
			const stages = [...e.stages]
			const [moved] = stages.splice(from, 1)
			stages.splice(to, 0, moved)
			return { ...e, stages }
		})
	}
	const save = useCallback(
		async (publish = false, notifySuccess = false, unpublish = false) => {
			if (requestInFlight.current) return
			setFailure('')
			setSuccess('')
			const errors = publish ? getPublishErrors(draft) : []
			setPublishErrors(errors)
			if (errors.length) return
			if (publish && draft.status === 'Live' && !dirty) return
			requestInFlight.current = true
			setSaving(true)
			setPublishing(publish)
			setUnpublishing(unpublish)
			try {
				const pending = revision.current
				const intentKey = JSON.stringify(draft)
				if (publish && publishIntent.current?.key !== intentKey) {
					publishIntent.current = {
						key: intentKey,
						id: crypto.randomUUID(),
					}
				}
				const saved = await saveExperiment(
					publish
						? {
								...draft,
								status: 'Live',
								publish: true,
								publishRequestId: publishIntent.current!.id,
							}
						: unpublish
							? { ...draft, status: 'Draft', publish: false }
							: draft,
				)
				if (publish && saved.status !== 'Live')
					throw new Error(
						'The server did not confirm publication. Please retry.',
					)
				if (unpublish && saved.status !== 'Draft')
					throw new Error(
						'The server did not confirm unpublishing. Please retry.',
					)
				if (publish || unpublish) publishIntent.current = null
				if (pending === revision.current) {
					setDraft(saved)
					setDirty(false)
				} else {
					// Preserve edits made while the request was pending, including their dirty state.
					setDraft((current) => ({
						...current,
						status:
							current.status === 'Closed' ? 'Closed' : 'Draft',
					}))
				}
				if (unpublish)
					setSuccess(
						'Experiment unpublished. Participation is paused until you publish again.',
					)
				if (!publish && notifySuccess) {
					setSuccess(
						pending === revision.current
							? 'Draft saved.'
							: 'Draft saved. Newer edits are still being saved.',
					)
				}
				if (publish)
					setSuccess(
						`Experiment published. Experiment code: ${saved.code}.${pending !== revision.current ? ' Newer edits are still unsaved; publish changes when ready.' : ''}`,
					)
			} catch (e) {
				setFailure(
					e instanceof Error
						? e.message
						: publish
							? 'Could not publish experiment.'
							: unpublish
								? 'Could not unpublish experiment.'
								: 'Could not save experiment.',
				)
			} finally {
				requestInFlight.current = false
				setSaving(false)
				setPublishing(false)
				setUnpublishing(false)
			}
		},
		[
			draft,
			dirty,
			saveExperiment,
			setFailure,
			setSuccess,
			setPublishErrors,
		],
	)
	// Preserve the original editor's automatic persistence with the backup's
	// in-flight revision guard. Manual Save/Publish remain available.
	useEffect(() => {
		if (!dirty || saving || failure) return
		const timer = window.setTimeout(() => void save(), 600)
		return () => window.clearTimeout(timer)
	}, [draft, dirty, saving, failure, save])
	return (
		<WorkspaceLayout
			title={draft.name}
			dirty={dirty}
			saving={saving}
			onSave={() => void save(false, true)}
		>
			{failure && failureVisible && (
				<Alert
					key={failureRevision}
					className="transient-notice"
					type="error"
					title={failure}
				/>
			)}
			{success && successVisible && (
				<Alert
					key={successRevision}
					className="transient-notice"
					type="success"
					showIcon
					title={success}
				/>
			)}
			{publishErrors.length > 0 && publishErrorsVisible && (
				<Alert
					key={publishErrorsRevision}
					className="transient-notice"
					type="error"
					showIcon
					title="This experiment is not ready to publish"
					description={
						<ul>
							{publishErrors.map((error) => (
								<li key={error}>{error}</li>
							))}
						</ul>
					}
				/>
			)}
			{stage && (
				<Editor
					experiment={draft}
					onPublish={() => void save(true)}
					onUnpublish={() => void save(false, false, true)}
					publishing={publishing}
					unpublishing={unpublishing}
					saving={saving}
					dirty={dirty}
					stage={stage}
					onBack={() => {
						if (
							!dirty ||
							window.confirm('Discard unsaved changes?')
						)
							navigate('/researcher/dashboard')
					}}
					onAddStage={add}
					onSelectStage={setSelected}
					onUpdateExperiment={change}
					onUpdateStage={changeStage}
					onDelete={(id) => {
						Modal.confirm({
							title: 'Delete this experiment?',
							onOk: async () => {
								await removeExperiment(id)
								navigate('/researcher/dashboard')
							},
						})
					}}
					onDeleteStage={removeStage}
					onReorderStages={reorder}
				/>
			)}
		</WorkspaceLayout>
	)
}
function Participant() {
	const navigate = useNavigate(),
		location = useLocation()
	const access = (location.state ?? {}) as {
		experimentCode?: string
		participantCode?: string
	}
	return (
		<ParticipantAccessPage
			onBack={() => {
				clearParticipantToken()
				clear()
				navigate('/login', { replace: true })
			}}
			initialExperimentCode={access.experimentCode}
			initialParticipantCode={access.participantCode}
		/>
	)
}
export default function App() {
	return (
		<Routes>
			<Route path="/" element={<Navigate to="/login" replace />} />
			<Route path="/login" element={<Login />} />
			<Route path="/researcher/register" element={<Register />} />
			<Route
				path="/researcher/dashboard"
				element={
					<Protected>
						<Workspace />
					</Protected>
				}
			/>
			<Route
				path="/researcher/experiment/new"
				element={<Navigate to="/researcher/dashboard" replace />}
			/>
			<Route
				path="/researcher/experiment/:experimentId"
				element={
					<Protected>
						<ExperimentEditor />
					</Protected>
				}
			/>
			{(["preview", "results", "settings"] as const).map((view) => (
				<Route
					key={view}
					path={"/researcher/" + view}
					element={
						<Protected>
							<WorkspacePage view={view} />
						</Protected>
					}
				/>
			))}
			<Route path="/participant" element={<Participant />} />
			<Route
				path="/administrator/dashboard"
				element={
					<Protected admin>
						<WorkspaceLayout title="Administration">
							<AdministratorPage />
						</WorkspaceLayout>
					</Protected>
				}
			/>
			<Route path="*" element={<Navigate to="/login" replace />} />
		</Routes>
	);
}
