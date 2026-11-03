import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles.css'
import App from './App.tsx'
import { AppErrorBoundary } from './AppErrorBoundary.tsx'

const client = new QueryClient({
	defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

// Mount the app with React StrictMode checks.
createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<QueryClientProvider client={client}>
		<BrowserRouter>
			<AppErrorBoundary>
				<App />
			</AppErrorBoundary>
		</BrowserRouter>
		</QueryClientProvider>
	</StrictMode>,
)
