import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 仅使用公开的代理地址。容器内访问 backend 服务名；本机运行时访问 localhost。
// 不要把数据库密码、Session 密钥或 AI API Key 放进 VITE_* 变量。
export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		proxy: {
			// 浏览器始终请求同源 /api，由开发服务器转发到后端。
			"/api": process.env.API_PROXY_TARGET ?? "http://localhost:8000",
		},
	},
});
