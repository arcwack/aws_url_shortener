/**
 * Persistence for the "Recent links" list.
 *
 * Every localStorage call is wrapped in try/catch because storage can throw
 * (private browsing, disabled cookies, quota exceeded) — the app must keep
 * working even when persistence is unavailable.
 */

export interface RecentLink {
  short_code: string
  short_url: string
  original_url: string
  /** ISO timestamp of when the link was created. */
  created_at: string
}

export const MAX_RECENT_LINKS = 10

const STORAGE_KEY = 'snipcloud.recentLinks'

function isRecentLink(value: unknown): value is RecentLink {
  if (typeof value !== 'object' || value === null) return false
  const link = value as Record<string, unknown>
  return (
    typeof link.short_code === 'string' &&
    typeof link.short_url === 'string' &&
    typeof link.original_url === 'string' &&
    typeof link.created_at === 'string'
  )
}

export function loadRecentLinks(): RecentLink[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentLink).slice(0, MAX_RECENT_LINKS)
  } catch {
    return []
  }
}

export function saveRecentLinks(links: RecentLink[]): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(links.slice(0, MAX_RECENT_LINKS)),
    )
  } catch {
    // Persistence is best-effort only.
  }
}
