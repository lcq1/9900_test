// Shared event CSV export for admin and results pages.
import type { ParticipantEvent } from '../participant/EventQueue'

// Quote CSV cells and escape embedded double quotes.
function escapeCell(value: string): string {
	return `"${value.replace(/"/g, '""')}"`
}

// Build event CSV with consistent columns and JSON details.
export function eventsToCsv(events: ParticipantEvent[]): string {
	const header = 'seq,type,timestamp,epochMs,perfMs,stageId,detail'
	const lines = events.map((event) =>
		[
			event.seq,
			event.type,
			event.timestamp,
			event.epochMs,
			Math.round(event.perfMs),
			event.stageId ?? '',
			event.detail ? escapeCell(JSON.stringify(event.detail)) : '',
		].join(','),
	)
	return [header, ...lines].join('\n')
}

// Download CSV and release the temporary object URL.
export function downloadCsv(filename: string, csv: string): void {
	const blob = new Blob([csv], { type: 'text/csv' })
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = `${filename}.csv`
	anchor.click()
	URL.revokeObjectURL(url)
}
