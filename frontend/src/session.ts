import { create } from "zustand";
import { authApi } from "./api";
import { clearDemoSession, restoreDemoSession } from "./auth/demoAuth";
import type { CurrentUser } from "./types";

type SessionStatus = "checking" | "anonymous" | "authenticated";

interface SessionState {
	status: SessionStatus;
	user: CurrentUser | null;
	setUser: (user: CurrentUser) => void;
	clear: () => void;
	restore: () => Promise<void>;
}

// 演示登录在开发模式下通过 sessionStorage 恢复；正式登录由后端 Session 恢复。
// 不把密码或令牌写入浏览器存储，演示角色也不能作为服务端授权依据。
export const useSession = create<SessionState>((set) => ({
	status: "checking",
	user: null,
	setUser: (user) => set({ status: "authenticated", user }),
	clear: () => {
		clearDemoSession();
		set({ status: "anonymous", user: null });
	},
	restore: async () => {
		const demoUser = restoreDemoSession();
		if (demoUser) {
			set({ status: "authenticated", user: demoUser });
			return;
		}
		try {
			const user = await authApi.me();
			set({ status: "authenticated", user });
		} catch {
			set({ status: "anonymous", user: null });
		}
	},
}));
