import { useParams } from "react-router-dom";
import ExperimentForm from "../experiments/ExperimentForm";

// 编辑实验页面通过 URL 中的编号加载并保存指定实验。
export default function ExperimentEditPage() {
	const { experimentId } = useParams();
	return <ExperimentForm experimentId={experimentId} />;
}
