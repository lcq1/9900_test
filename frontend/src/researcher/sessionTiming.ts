import type { ParticipantEvent } from '../participant/EventQueue'

export function eventEpoch(event: ParticipantEvent): number {
    if (Number.isFinite(event.epochMs) && event.epochMs > 0) return event.epochMs
    const parsed = Date.parse(event.timestamp)
    return parsed > 0 ? parsed : Number.NaN
}

/** Recorded visit spans, not an estimate of engagement or keyboard activity.
 * Reading time within a visit counts; explicit pauses and exited visits do not.
 * No arbitrary idle timeout trims valid long reading/recording intervals.
 */
export function sessionTiming(events: ParticipantEvent[]) {
    const timed = events.map(event => ({ event, time: eventEpoch(event) }))
        .filter(item => Number.isFinite(item.time)).sort((a, b) => a.time - b.time || a.event.seq - b.event.seq)
    let recordedMs = 0, visits = 0, previous = 0
    let state: 'active' | 'paused' | 'closed' = 'closed'
    for (const { event, time } of timed) {
        // Media timestamps describe server file writes, not participant activity.
        if (event.type === 'recording_media') continue
        const entering = event.type === 'stage_view' && (event.detail?.visitStarted === true || state === 'closed')
        if (visits === 0 || entering) {
            visits++
            state = 'active'
        } else if (state === 'active') recordedMs += Math.max(0, time - previous)
        previous = time
        if (event.type === 'abort') state = 'closed'
        else if (event.type === 'pause') state = 'paused'
        else if (event.type === 'resume') state = 'active'
    }
    const spanMs = timed.length ? timed[timed.length - 1].time - timed[0].time : 0
    return { recordedMs, spanMs, visits, excludedMs: Math.max(0, spanMs - recordedMs) }
}

export function formatSessionDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '—'
    const total = Math.round(ms / 1000)
    const days = Math.floor(total / 86400), hours = Math.floor(total % 86400 / 3600)
    const minutes = Math.floor(total % 3600 / 60), seconds = total % 60
    if (days) return `${days}d ${hours}h ${minutes}m ${seconds}s`
    if (hours) return `${hours}h ${minutes}m ${seconds}s`
    if (minutes) return `${minutes}m ${seconds}s`
    return `${Math.round(ms / 100) / 10}s`
}
