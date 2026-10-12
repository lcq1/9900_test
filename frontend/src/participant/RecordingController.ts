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

export class RecordingController {
  private readonly kind: RecordingKind
  private statusValue: RecordingStatus = 'idle'
  private streamValue: MediaStream | null = null

  constructor(kind: RecordingKind) {
    this.kind = kind
  }

  get status(): RecordingStatus {
    return this.statusValue
  }

  get stream(): MediaStream | null {
    return this.streamValue
  }

  private get mediaDevices(): MediaDevices | null {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return null
    return navigator.mediaDevices
  }

  /** Request the appropriate media and update status. Never throws. */
  async start(): Promise<RecordingStatus> {
    const devices = this.mediaDevices
    if (!devices) {
      this.statusValue = 'unsupported'
      return this.statusValue
    }
    this.statusValue = 'requesting'
    try {
      const stream =
        this.kind === 'self'
          ? await devices.getUserMedia({ video: true, audio: true })
          : await devices.getDisplayMedia({ video: true, audio: true })
      this.streamValue = stream
      this.statusValue = 'active'
    } catch {
      // Permission denied or the user dismissed the picker.
      this.streamValue = null
      this.statusValue = 'denied'
    }
    return this.statusValue
  }

  /** Stop all tracks and mark the controller stopped. */
  stop(): RecordingStatus {
    if (this.streamValue) {
      this.streamValue.getTracks().forEach((track) => track.stop())
      this.streamValue = null
    }
    this.statusValue = 'stopped'
    return this.statusValue
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
