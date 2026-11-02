/**
 * RecordingController.ts — wraps media capture with graceful degradation.
 *
 * `self`     → navigator.mediaDevices.getUserMedia (self video + audio)
 * `screen`   → navigator.mediaDevices.getDisplayMedia (screen capture)
 *
 * Permission denial or unsupported APIs are surfaced as a `status` flag rather
 * than thrown, so the UI can render a status badge and never crash. The active
 * stream is exposed for binding to a <video> element.
 */

export type RecordingKind = 'self' | 'screen'

export type RecordingStatus =
	| 'idle'
	| 'requesting'
	| 'active'
	| 'denied'
	| 'unsupported'
	| 'stopped'
	| 'error'
	| 'screen_required'

export class RecordingController {
	private readonly kind: RecordingKind
	private statusValue: RecordingStatus = 'idle'
	private recorder: MediaRecorder | null = null
	private streamValue: MediaStream | null = null

	private pending: Blob[] = []
	private uploading = Promise.resolve()
	private stopped = Promise.resolve()
	private cancelled = false

	private readonly upload: (chunk: Blob) => Promise<void>
	private readonly changed: (status: RecordingStatus) => void

	constructor(
		kind: RecordingKind,
		upload: (chunk: Blob) => Promise<void> = async () => {},
		changed: (status: RecordingStatus) => void = () => {},
	) {
		this.upload = upload
		this.changed = changed
		this.kind = kind
	}

	get status(): RecordingStatus {
		return this.statusValue === 'active' &&
			(this.recorder?.state !== 'recording' ||
				!this.streamValue
					?.getVideoTracks()
					.some((t) => t.readyState === 'live'))
			? 'stopped'
			: this.statusValue
	}

	get stream(): MediaStream | null {
		return this.streamValue
	}

	private get mediaDevices(): MediaDevices | null {
		if (typeof navigator === 'undefined' || !navigator.mediaDevices)
			return null
		return navigator.mediaDevices
	}

	private isEntireScreen(stream = this.streamValue): boolean {
		return (
			stream?.getVideoTracks()[0]?.getSettings?.().displaySurface ===
			'monitor'
		)
	}

	/** Request the appropriate media and update status. Never throws. */
	async start(retainedStream?: MediaStream): Promise<RecordingStatus> {
		if (this.status === 'active' || this.status === 'requesting')
			return this.status
		if (this.pending.length) await this.flush()
		this.cancelled = false
		const devices = this.mediaDevices
		if (
			(!devices && !retainedStream) ||
			typeof MediaRecorder === 'undefined'
		) {
			this.statusValue = 'unsupported'
			return this.status
		}
		this.statusValue = 'requesting'
		try {
			// Picker hints are advisory; validate the selected surface before recording.
			const displayOptions = {
				video: { displaySurface: 'monitor' },
				audio: true,
				preferCurrentTab: false,
				selfBrowserSurface: 'exclude',
				surfaceSwitching: 'exclude',
			}
			const stream =
				retainedStream ??
				(this.kind === 'self'
					? await devices!.getUserMedia({ video: true, audio: true })
					: await devices!.getDisplayMedia(displayOptions))
			if (this.cancelled) {
				stream.getTracks().forEach((t) => t.stop())
				return this.status
			}
			this.streamValue = stream
			if (this.kind === 'screen' && !this.isEntireScreen()) {
				this.stop()
				this.statusValue = 'screen_required'
				this.changed(this.statusValue)
				return this.statusValue
			}
			this.recorder = new MediaRecorder(stream)
			this.recorder.ondataavailable = (event) => {
				if (this.kind === 'screen' && !this.isEntireScreen(stream)) {
					if (this.statusValue === 'active') {
						this.stop()
						this.statusValue = 'screen_required'
						this.changed(this.statusValue)
					}
					return
				}
				if (event.data.size) this.pending.push(event.data)
				this.uploading = this.uploading
					.then(() => this.drain())
					.catch(() => {
						this.stop()
						this.statusValue = 'error'
						this.changed('error')
					})
			}
			this.stopped = new Promise((resolve) => {
				this.recorder!.onstop = () => {
					resolve()
					if (this.statusValue === 'active') this.stop()
				}
			})
			this.recorder.onerror = () => {
				this.stop()
				this.statusValue = 'error'
				this.changed('error')
			}
			this.recorder.start(1000)
			stream.getTracks().forEach((track) =>
				track.addEventListener('ended', () => {
					if (this.streamValue === stream) this.stop()
				}),
			)
			this.statusValue = 'active'
		} catch (error) {
			// A failed start will not emit stop; do not leave finish waiting forever.
			if (this.recorder?.state === 'inactive')
				this.stopped = Promise.resolve()
			this.stop()
			this.statusValue =
				error instanceof DOMException &&
				error.name === 'NotAllowedError'
					? 'denied'
					: 'error'
		}
		return this.status
	}

	/** Stop all tracks and mark the controller stopped. */
	stop(keepStream = false): RecordingStatus {
		this.cancelled = true
		this.statusValue = 'stopped'
		if (this.recorder && this.recorder.state !== 'inactive')
			this.recorder.stop()
		if (this.streamValue && !keepStream) {
			this.streamValue.getTracks().forEach((track) => track.stop())
			this.streamValue = null
		}
		this.changed(this.status)
		return this.status
	}

	private async drain(): Promise<void> {
		while (this.pending.length) {
			await this.upload(this.pending[0])
			this.pending.shift()
		}
	}

	async flush(): Promise<void> {
		await this.uploading
		await this.drain()
	}

	async finish(keepStream = false): Promise<void> {
		this.stop(keepStream)
		await this.stopped
		await this.flush()
	}

	takeStream(): MediaStream | undefined {
		const stream = this.streamValue
		this.streamValue = null
		return stream
			?.getVideoTracks()
			.some((track) => track.readyState === 'live')
			? stream
			: undefined
	}

	/** Stop and return to a clean idle state. */
	reset(): void {
		this.stop()
		this.statusValue = 'idle'
	}
}

/** Human-readable label for a recording status (used by status badges). */
export function statusLabel(status: RecordingStatus): string {
	switch (status) {
		case 'screen_required':
			return 'Select Entire screen, not a tab or window. If unavailable, use a browser that supports entire-screen sharing.'
		case 'error':
			return 'Recording or upload failed. Retry to save pending data.'
		case 'idle':
			return 'Not recording'
		case 'requesting':
			return 'Requesting permission…'
		case 'active':
			return 'Recording'
		case 'denied':
			return 'Permission denied'
		case 'unsupported':
			return 'Not supported'
		case 'stopped':
			return 'Stopped'
	}
}
