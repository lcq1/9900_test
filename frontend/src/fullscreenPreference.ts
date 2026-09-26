// 全屏偏好不是权限或敏感信息，可在浏览器缓存以改善新建表单体验。
// 真正的默认值和最终保存结果仍以后端返回的当前账号数据为准。
function key(researcherId: string): string {
	return `experiment-fullscreen:${researcherId}`;
}

export function readFullscreenPreference(researcherId: string | undefined): boolean | null {
	if (!researcherId) return null;
	try {
		const value = localStorage.getItem(key(researcherId));
		return value === null ? null : value === "true";
	} catch {
		return null;
	}
}

export function saveFullscreenPreference(researcherId: string | undefined, value: boolean): void {
	if (!researcherId) return;
	try {
		localStorage.setItem(key(researcherId), String(value));
	} catch {
		// 浏览器禁用本地存储时仍可创建和编辑实验。
	}
}
