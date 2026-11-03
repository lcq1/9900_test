import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last line of defence for the participant runtime: a thrown render or effect
 * error must never leave a blank page. Participant state is persisted in
 * localStorage and on the study server, so a reload is a safe recovery.
 */
export class AppErrorBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false }

	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true }
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error('Unhandled UI error', error, info)
	}

	render(): ReactNode {
		if (!this.state.failed) return this.props.children
		return (
			<div
				role="alert"
				style={{
					maxWidth: 520,
					margin: '12vh auto',
					padding: 28,
					fontFamily: 'system-ui, sans-serif',
					lineHeight: 1.6,
				}}
			>
				<h1>Something went wrong</h1>
				<p>
					Your study progress is kept on this device and on the study
					server. Reload the page to continue.
				</p>
				<button
					style={{ padding: '10px 18px', cursor: 'pointer' }}
					onClick={() => window.location.reload()}
				>
					Reload
				</button>
			</div>
		)
	}
}
