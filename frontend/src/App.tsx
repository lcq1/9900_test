import { useEffect } from "react";
import type { ReactNode } from "react";
import { Alert, Spin } from "antd";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components";
import { useSession } from "./session";
import type { UserRole } from "./types";
import HomePage from "./pages/HomePage";
import AdministratorLoginPage from "./pages/AdministratorLoginPage";
import ParticipantLoginPage from "./pages/ParticipantLoginPage";
import ResearcherLoginPage from "./pages/ResearcherLoginPage";
import ResearcherRegisterPage from "./pages/ResearcherRegisterPage";
import ResearcherDashboardPage from "./pages/ResearcherDashboardPage";
import AdministratorDashboardPage from "./pages/AdministratorDashboardPage";
import ExperimentDetailPage from "./pages/ExperimentDetailPage";
import ExperimentCreatePage from "./pages/ExperimentCreatePage";
import ExperimentEditPage from "./pages/ExperimentEditPage";
import ConsentPage from "./pages/ConsentPage";
import ParticipantExperimentPage from "./pages/ParticipantExperimentPage";
import ParticipantStagePage from "./pages/ParticipantStagePage";

const loginPath: Record<UserRole, string> = {
	participant: "/login/participant",
	researcher: "/login/researcher",
	administrator: "/login/administrator",
};

function ProtectedRoute({ role, children }: { role: UserRole; children: ReactNode }) {
	const { status, user } = useSession();
	const location = useLocation();

	if (status === "checking") return <Spin size="large" tip="Restoring your session" fullscreen />;
	if (status === "anonymous") return <Navigate to={loginPath[role]} state={{ from: location.pathname }} replace />;
	if (user?.role !== role) return <Alert type="error" showIcon message="Your account cannot access this page." />;
	return <>{children}</>;
}

// 前端路由保护用于页面体验；后端仍须在每个接口校验 Session 和角色。
export default function App() {
	const restore = useSession((state) => state.restore);
	useEffect(() => { void restore(); }, [restore]);

	return (
		<AppShell>
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/login/participant" element={<ParticipantLoginPage />} />
				<Route path="/login/researcher" element={<ResearcherLoginPage />} />
				<Route path="/login/administrator" element={<AdministratorLoginPage />} />
				<Route path="/register/researcher" element={<ResearcherRegisterPage />} />
				<Route path="/researcher" element={<ProtectedRoute role="researcher"><ResearcherDashboardPage /></ProtectedRoute>} />
				<Route path="/researcher/experiments/new" element={<ProtectedRoute role="researcher"><ExperimentCreatePage /></ProtectedRoute>} />
				<Route path="/researcher/experiments/:experimentId" element={<ProtectedRoute role="researcher"><ExperimentDetailPage /></ProtectedRoute>} />
				<Route path="/researcher/experiments/:experimentId/edit" element={<ProtectedRoute role="researcher"><ExperimentEditPage /></ProtectedRoute>} />
				<Route path="/administrator" element={<ProtectedRoute role="administrator"><AdministratorDashboardPage /></ProtectedRoute>} />
				<Route path="/participant/experiment/consent" element={<ProtectedRoute role="participant"><ConsentPage /></ProtectedRoute>} />
				<Route path="/participant/experiment" element={<ProtectedRoute role="participant"><ParticipantExperimentPage /></ProtectedRoute>} />
				<Route path="/participant/experiment/stages/:stageId" element={<ProtectedRoute role="participant"><ParticipantStagePage /></ProtectedRoute>} />
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</AppShell>
	);
}
