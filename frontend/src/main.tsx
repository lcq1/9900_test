import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

// One QueryClient centralises server-state caching and request lifecycle state.
const queryClient = new QueryClient();

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("React root element was not found.");
}

ReactDOM.createRoot(rootElement).render(
	<React.StrictMode>
		<ConfigProvider locale={enUS}>
			<QueryClientProvider client={queryClient}>
				<BrowserRouter>
					<App />
				</BrowserRouter>
			</QueryClientProvider>
		</ConfigProvider>
	</React.StrictMode>,
);
