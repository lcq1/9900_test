// Session storage key for the current tab ID.
const TAB_KEY = 'p13-tab-id'

// Reuse the tab ID or generate and save one.
export function getTabId(): string {
	const existing = sessionStorage.getItem(TAB_KEY)
	if (existing) return existing
	const id = `tab-${Math.random().toString(36).slice(2, 10)}`
	sessionStorage.setItem(TAB_KEY, id)
	return id
}
