import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { getStats } from '../api'
import type { Stats } from '../mockStats'
import PreviewBanner from './PreviewBanner'
import Spinner from './Spinner'

const DEFAULT_CODE = 'abc1234'

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = inputCode.trim()
    if (!trimmed) {
      setError('Enter a short code to preview.')
      return
    }
    setLoading(true)
    setError(null)
    setRequest((current) => ({ code: trimmed, nonce: current.nonce + 1 }))
  }

  const topCountry = useMemo(() => {
    if (!stats) return '—'
    const counts = new Map<string, number>()
    for (const click of stats.recent) {
      counts.set(click.country, (counts.get(click.country) ?? 0) + 1)
    }
    let best = '—'
    let bestCount = 0
    for (const [country, count] of counts) {
      if (count > bestCount) {
        best = country
        bestCount = count
      }
    }
    return best
  }, [stats])

  const maxClicks = stats ? Math.max(...stats.daily.map((day) => day.clicks), 1) : 1

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-foreground">Stats</h2>
        <p className="mt-1 text-sm text-muted-foreground">Click analytics for a short link.</p>
      </header>

      <PreviewBanner />

      <form onSubmit={handleSubmit} className="card">
        <label htmlFor="stats-code" className="label">
          Short code
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="stats-code"
            name="code"
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="abc1234"
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
          Try <span className="font-mono">abc1234</span> — every code returns a different preview.
        </p>
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
              hint={`for /${stats.code}`}
            />
            <Stat
              label="Unique visitors"
              value={stats.uniqueVisitors.toLocaleString()}
              hint="estimated"
            />
            <Stat label="Top country" value={topCountry} hint="from recent clicks" />
          </div>

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
                    style={{ height: `${Math.max(4, Math.round((day.clicks / maxClicks) * 100))}%` }}
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
                      Country
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Device
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((click) => (
                    <tr key={click.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(click.timestamp)}
                      </td>
                      <td className="py-2.5 pr-4 text-foreground">{click.country}</td>
                      <td className="py-2.5 text-foreground">{click.device}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
