import { useLocation } from "react-router-dom";
import ExperimentForm from "../experiments/ExperimentForm";

interface CreateLocationState { defaultFullscreenMode?: boolean }

// 新建实验页面读取从控制台传递的全屏默认值。
export default function ExperimentCreatePage() {
	const location = useLocation();
	const defaultFullscreenMode = (location.state as CreateLocationState | null)?.defaultFullscreenMode;
	return <ExperimentForm defaultFullscreenMode={defaultFullscreenMode} />;
}
