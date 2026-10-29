import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getStats } from '../api'
import type { Stats } from '../api'
import { loadRecentLinks } from '../storage'
import Spinner from './Spinner'

const DEFAULT_CODE = 'uDI5wn'

function normalizeCode(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.pathname.split('/').filter(Boolean)[0] ?? ''
    }
  } catch {
    // Not an absolute URL; fall through to the path-only parser.
  }

  const withoutScheme = trimmed.replace(/^https?:\/\//i, '')
  const parts = withoutScheme.split('/').filter(Boolean)
  if (parts.length > 1 && parts[0]?.includes('.')) {
    return parts[1]?.split('?')[0] ?? ''
  }

  const first = parts[0]?.split('?')[0] ?? ''
  return first.includes('.') ? '' : first
}

function compactUrl(value: string): string {
  return value.replace(/^https?:\/\//, '')
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormatter.format(date)
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export default function StatsView() {
  const [recentLinks] = useState(() => loadRecentLinks())
  const [inputCode, setInputCode] = useState(DEFAULT_CODE)
  const [request, setRequest] = useState({ code: DEFAULT_CODE, nonce: 0 })
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    getStats(request.code)
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load stats.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [request])

  function loadCode(code: string) {
    setInputCode(code)
    setLoading(true)
    setError(null)
    setRequest((current) => ({ code, nonce: current.nonce + 1 }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = normalizeCode(inputCode)
    if (!code) {
      setError('Paste a short code or a full short URL.')
      return
    }
    loadCode(code)
  }

  const maxClicks = stats ? Math.max(...stats.daily.map((day) => day.clicks), 1) : 1

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-foreground">Stats</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live click analytics from the SQS → AnalyticsProcessor pipeline.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="card">
        <label htmlFor="stats-code" className="label">
          Short code or short URL
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="stats-code"
            name="code"
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="uDI5wn or https://go.devansharora.in/uDI5wn"
            value={inputCode}
            onChange={(event) => setInputCode(event.target.value)}
            className="input font-mono sm:flex-1"
          />
          <button type="submit" className="btn btn-primary w-full sm:w-32" disabled={loading}>
            {loading ? (
              <>
                <Spinner />
                Loading
              </>
            ) : (
              'Load stats'
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Paste the code or the full link copied from the Shorten tab. Try{' '}
          <span className="font-mono">uDI5wn</span> for the demo.
        </p>

        {recentLinks.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Recent links</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {recentLinks.slice(0, 5).map((link) => (
                <button
                  key={link.short_code}
                  type="button"
                  onClick={() => loadCode(link.short_code)}
                  disabled={loading}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="shrink-0 font-mono font-medium">{link.short_code}</span>
                  <span className="hidden max-w-[12rem] truncate text-muted-foreground sm:inline">
                    {compactUrl(link.original_url)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </form>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {loading && !stats ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          Loading analytics
        </div>
      ) : null}

      {stats ? (
        <>
          <div className="card grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Stat
              label="Total clicks"
              value={stats.totalClicks.toLocaleString()}
              hint={
                stats.lastClick
                  ? `last click ${formatDateTime(stats.lastClick)}`
                  : `for /${stats.code}`
              }
            />
            <Stat
              label="Unique IPs"
              value={stats.uniqueVisitors.toLocaleString()}
              hint="distinct source IPs"
            />
            <Stat label="Top rule" value={stats.topRule} hint="most common branch" />
          </div>

          {stats.totalClicks === 0 ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              No clicks recorded yet. Open the short link, then load stats again.
            </p>
          ) : null}

          <section className="card">
            <h3 className="text-sm font-medium text-foreground">Clicks per day</h3>
            <p className="mt-1 text-sm text-muted-foreground">Last 7 days</p>

            <div
              role="img"
              aria-label="Bar chart of clicks per day over the last 7 days. Values are listed below."
              className="mt-5 flex h-48 items-end gap-2"
            >
              {stats.daily.map((day) => (
                <div key={day.date} className="flex h-full flex-1 items-end">
                  <div
                    title={`${day.label}: ${day.clicks} clicks`}
                    style={{
                      height:
                        day.clicks === 0
                          ? '0%'
                          : `${Math.max(4, Math.round((day.clicks / maxClicks) * 100))}%`,
                    }}
                    className="w-full rounded-t bg-brand transition-[height] duration-300"
                  />
                </div>
              ))}
            </div>

            <div className="mt-2 flex gap-2">
              {stats.daily.map((day) => (
                <span key={day.date} className="flex-1 text-center text-xs text-muted-foreground">
                  {day.label}
                </span>
              ))}
            </div>

            <ul className="sr-only">
              {stats.daily.map((day) => (
                <li key={day.date}>
                  {day.label}: {day.clicks} clicks
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h3 className="text-sm font-medium text-foreground">Recent clicks</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Most recent clicks for this short link</caption>
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      When
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Rule
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Device
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Destination
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((click) => (
                    <tr key={click.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(click.timestamp)}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-foreground">
                        {click.matchedRule}
                      </td>
                      <td className="py-2.5 pr-4 text-foreground">{click.device}</td>
                      <td className="py-2.5 font-mono text-xs text-muted-foreground">
                        <span
                          className="block max-w-[16rem] truncate"
                          title={click.destination}
                        >
                          {click.destination}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stats.recent.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No clicks recorded yet.</p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  )
}
