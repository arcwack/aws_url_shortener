/**
 * Mock analytics data for the Stats tab.
 *
 * The shape mirrors what GET /stats/{code} is expected to return once the
 * SQS -> AnalyticsProcessor pipeline is live, so swapping the mock out in
 * `api.ts` requires no changes to the UI.
 */

export interface DailyClicks {
  /** ISO date, e.g. 2026-09-22 */
  date: string
  /** Short weekday label, e.g. "Mon" */
  label: string
  clicks: number
}

export interface RecentClick {
  id: string
  /** ISO timestamp */
  timestamp: string
  country: string
  device: string
}

export interface Stats {
  code: string
  totalClicks: number
  uniqueVisitors: number
  daily: DailyClicks[]
  recent: RecentClick[]
}

const COUNTRIES = ['India', 'United States', 'Germany', 'Brazil', 'Japan', 'Kenya', 'Australia']
const DEVICES = ['Mobile', 'Desktop', 'Tablet']

/** FNV-1a hash so each short code gets stable-but-different mock numbers. */
function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Mulberry32 seeded PRNG. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildDaily(random: () => number): DailyClicks[] {
  const days: DailyClicks[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const base = isWeekend ? 45 : 130
    days.push({
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      clicks: Math.round(base + random() * 120),
    })
  }

  return days
}

function buildRecent(random: () => number): RecentClick[] {
  const now = Date.now()
  const clicks: RecentClick[] = []

  for (let i = 0; i < 8; i += 1) {
    const minutesAgo = Math.round(3 + i * (25 + random() * 90))
    clicks.push({
      id: `click-${i}`,
      timestamp: new Date(now - minutesAgo * 60_000).toISOString(),
      country: COUNTRIES[Math.floor(random() * COUNTRIES.length)] ?? 'Unknown',
      device: DEVICES[Math.floor(random() * DEVICES.length)] ?? 'Unknown',
    })
  }

  return clicks
}

export function getMockStats(code: string): Stats {
  const normalized = code.trim() || 'demo'
  const random = createRandom(hashString(normalized))
  const daily = buildDaily(random)
  const totalClicks = daily.reduce((sum, day) => sum + day.clicks, 0)

  return {
    code: normalized,
    totalClicks,
    uniqueVisitors: Math.round(totalClicks * (0.6 + random() * 0.2)),
    daily,
    recent: buildRecent(random),
  }
}
