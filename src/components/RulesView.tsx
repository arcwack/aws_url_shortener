import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  Copy,
  ExternalLink,
  Play,
  Save,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { getRuleConfig, resolvePreview, saveScheduleRule } from '../api'
import type { ResolvePreview, ScheduleConfig } from '../api'
import { copyToClipboard } from '../clipboard'
import { loadRecentLinks } from '../storage'
import Spinner from './Spinner'

const DEMO_CODE = 'uDI5wn'
const HISTORY_LIMIT = 4

const DEFAULT_CONFIG: ScheduleConfig = {
  type: 'schedule',
  timezone: 'Asia/Kolkata',
  weekday_url:
    'https://snipcloud-weekend-460047017901.s3.ap-south-1.amazonaws.com/weekday.html',
  weekend_url:
    'https://snipcloud-weekend-460047017901.s3.ap-south-1.amazonaws.com/weekend.html',
}

const TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
]

const DAYS = [
  { index: 1, short: 'Mon', name: 'Monday' },
  { index: 2, short: 'Tue', name: 'Tuesday' },
  { index: 3, short: 'Wed', name: 'Wednesday' },
  { index: 4, short: 'Thu', name: 'Thursday' },
  { index: 5, short: 'Fri', name: 'Friday' },
  { index: 6, short: 'Sat', name: 'Saturday' },
  { index: 0, short: 'Sun', name: 'Sunday' },
]

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function destinationError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Enter a destination URL.'
  if (trimmed.length > 2048) return 'URLs can be at most 2,048 characters.'

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return 'Enter a valid URL, including http:// or https://.'
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http:// and https:// URLs are supported.'
  }

  return null
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toDateTimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function nextOccurrence(dayIndex: number, hour: number): string {
  const now = new Date()
  const date = new Date(now)
  let delta = (dayIndex - now.getDay() + 7) % 7
  if (delta === 0 && now.getHours() >= hour) delta = 7
  date.setDate(date.getDate() + delta)
  date.setHours(hour, 0, 0, 0)
  return toDateTimeLocal(date)
}

function formatInZone(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

function formatClock(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date)
  } catch {
    return date.toLocaleTimeString()
  }
}

function compactUrl(value: string): string {
  const withoutProtocol = value.replace(/^https?:\/\//, '')
  return withoutProtocol.length > 42 ? `${withoutProtocol.slice(0, 41)}…` : withoutProtocol
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" />
      Live
    </span>
  )
}

function DestinationField({
  id,
  label,
  caption,
  tone,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string
  label: string
  caption: string
  tone: 'weekday' | 'weekend'
  value: string
  onChange: (value: string) => void
  error: string | null
  disabled: boolean
}) {
  const toneClasses =
    tone === 'weekday' ? 'border-brand/25 bg-brand/5' : 'border-warning/30 bg-warning/5'
  const labelClasses = tone === 'weekday' ? 'text-brand' : 'text-warning'

  return (
    <div className={`rounded-lg border p-3 ${toneClasses}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <span className={`text-[11px] font-medium uppercase tracking-wide ${labelClasses}`}>
          {caption}
        </span>
      </div>
      <input
        id={id}
        type="url"
        inputMode="url"
        spellCheck={false}
        className="input mt-2 bg-background"
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default function RulesView() {
  const recentLinks = useState(() => loadRecentLinks())[0]

  const [code, setCode] = useState(DEMO_CODE)
  const [shortUrl, setShortUrl] = useState('')
  const [originalUrl, setOriginalUrl] = useState('')

  const [timezone, setTimezone] = useState(DEFAULT_CONFIG.timezone)
  const [weekdayUrl, setWeekdayUrl] = useState(DEFAULT_CONFIG.weekday_url)
  const [weekendUrl, setWeekendUrl] = useState(DEFAULT_CONFIG.weekend_url)
  const [loadedConfig, setLoadedConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG)
  const [hasRule, setHasRule] = useState(false)

  const [loadingRule, setLoadingRule] = useState(true)
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const [simulateTime, setSimulateTime] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<ResolvePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [history, setHistory] = useState<ResolvePreview[]>([])

  const [now, setNow] = useState(() => new Date())
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await getRuleConfig(code)
        if (cancelled) return

        setShortUrl(data.short_url)
        setOriginalUrl(data.original_url)

        const config = data.redirect_config ?? DEFAULT_CONFIG
        setLoadedConfig(config)
        setTimezone(config.timezone)
        setWeekdayUrl(config.weekday_url)
        setWeekendUrl(config.weekend_url)
        setHasRule(Boolean(data.redirect_config))
        setLoadingRule(false)

        try {
          const result = await resolvePreview(code)
          if (cancelled) return
          setPreview(result)
          setHistory([result])
        } catch (caught) {
          if (cancelled) return
          setPreviewError(
            caught instanceof Error ? caught.message : 'Could not evaluate this link.',
          )
        }
      } catch (caught) {
        if (cancelled) return
        setRuleError(caught instanceof Error ? caught.message : 'Could not load this link.')
      } finally {
        if (!cancelled) setLoadingRule(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [code])

  const weekdayError = destinationError(weekdayUrl)
  const weekendError = destinationError(weekendUrl)
  const dirty =
    !hasRule ||
    timezone !== loadedConfig.timezone ||
    weekdayUrl.trim() !== loadedConfig.weekday_url ||
    weekendUrl.trim() !== loadedConfig.weekend_url
  const canSave = !saving && !loadingRule && !weekdayError && !weekendError && dirty

  const activeDayIndex = preview
    ? DAY_NAMES.indexOf(preview.day)
    : now.getDay()
  const clockIsPinned = Boolean(
    preview && (preview.demo_forced || preview.simulate_time_applied),
  )
  const clockMoment = clockIsPinned && preview ? new Date(preview.evaluated_at) : now
  const clockTimezone = clockIsPinned && preview ? preview.timezone : timezone
  const clockLabel = preview?.demo_forced
    ? 'Demo clock'
    : preview?.simulate_time_applied
      ? 'Simulated clock'
      : 'Live clock'
  const clockTime = formatClock(clockMoment, clockTimezone)
  const clockDate = new Intl.DateTimeFormat('en-IN', {
    timeZone: clockTimezone,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(clockMoment)

  const linkOptions = [
    { code: DEMO_CODE, label: `Demo link · ${DEMO_CODE}` },
    ...recentLinks
      .filter((link) => link.short_code !== DEMO_CODE)
      .map((link) => ({
        code: link.short_code,
        label: `${link.short_code} · ${compactUrl(link.original_url)}`,
      })),
  ]
  if (!linkOptions.some((option) => option.code === code)) {
    linkOptions.push({ code, label: code })
  }

  function addHistory(result: ResolvePreview) {
    setHistory((current) =>
      [
        result,
        ...current.filter(
          (item) =>
            item.evaluated_at !== result.evaluated_at || item.destination !== result.destination,
        ),
      ].slice(0, HISTORY_LIMIT),
    )
  }

  async function runPreview(when: string) {
    setPreviewing(true)
    setPreviewError(null)

    try {
      const result = await resolvePreview(code, when || undefined)
      setPreview(result)
      addHistory(result)
    } catch (caught) {
      setPreviewError(
        caught instanceof Error ? caught.message : 'Could not evaluate this moment.',
      )
    } finally {
      setPreviewing(false)
    }
  }

  function handleCodeChange(nextCode: string) {
    if (nextCode === code) return
    setCode(nextCode)
    setLoadingRule(true)
    setRuleError(null)
    setPreviewError(null)
    setPreview(null)
    setHistory([])
    setSavedAt(null)
    setSimulateTime('')
  }

  function handleScenario(dayIndex: number) {
    const when = nextOccurrence(dayIndex, 10)
    setSimulateTime(when)
    void runPreview(when)
  }

  function handleNow() {
    setSimulateTime('')
    void runPreview('')
  }

  function handleTestMoment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runPreview(simulateTime)
  }

  async function handleSave() {
    if (weekdayError || weekendError) {
      setSaveError('Fix the destination URLs before saving.')
      return
    }

    setSaving(true)
    setSaveError(null)
    setSavedAt(null)

    const config: ScheduleConfig = {
      type: 'schedule',
      timezone,
      weekday_url: weekdayUrl.trim(),
      weekend_url: weekendUrl.trim(),
    }

    try {
      const result = await saveScheduleRule(code, config)
      setShortUrl(result.short_url)
      setLoadedConfig(config)
      setHasRule(true)
      setSavedAt(new Date())
      await runPreview(simulateTime)
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not save the rule.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    if (!shortUrl) return
    const succeeded = await copyToClipboard(shortUrl)
    if (!succeeded) return

    setCopied(true)
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">Smart Rules</h2>
            <LiveBadge />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One short link, two destinations. The Redirect Lambda picks weekday or weekend from
            the timezone stored with the link — configuration lives in DynamoDB, not code.
          </p>
        </div>
        <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-3 py-2 text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {clockLabel}
          </p>
          <p className="font-mono text-sm font-medium tabular-nums text-foreground">{clockTime}</p>
          <p className="text-[11px] text-muted-foreground">
            {clockDate} · {clockTimezone}
          </p>
        </div>
      </header>

      <section className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="rule-link" className="label">
              Demo link
            </label>
            <select
              id="rule-link"
              className="input"
              value={code}
              onChange={(event) => handleCodeChange(event.target.value)}
              disabled={loadingRule}
            >
              {linkOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              {loadingRule ? (
                'Loading rule from DynamoDB…'
              ) : (
                <>
                  <a
                    href={shortUrl || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-brand underline-offset-4 hover:underline"
                  >
                    {shortUrl || code}
                  </a>
                  {originalUrl ? (
                    <>
                      {' '}
                      <span aria-hidden="true">·</span> fallback {compactUrl(originalUrl)}
                    </>
                  ) : null}
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCopy}
              disabled={!shortUrl}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a
              href={shortUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              aria-disabled={!shortUrl}
              onClick={(event) => {
                if (!shortUrl) event.preventDefault()
              }}
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open
            </a>
          </div>
        </div>

        {ruleError ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {ruleError}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-medium text-foreground">Routing schedule</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Weekday runs Monday–Friday; weekend runs Saturday–Sunday.
              </p>
            </div>
            {hasRule && !dirty ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                <CircleCheck className="h-3 w-3" aria-hidden="true" />
                Saved
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                {hasRule ? 'Unsaved changes' : 'No rule yet'}
              </span>
            )}
          </div>

          <div className="mt-5 space-y-3">
            <DestinationField
              id="rule-weekday"
              label="Weekday URL (Mon–Fri)"
              caption="Weekday branch"
              tone="weekday"
              value={weekdayUrl}
              onChange={setWeekdayUrl}
              error={weekdayError}
              disabled={loadingRule || saving}
            />
            <DestinationField
              id="rule-weekend"
              label="Weekend URL (Sat–Sun)"
              caption="Weekend branch"
              tone="weekend"
              value={weekendUrl}
              onChange={setWeekendUrl}
              error={weekendError}
              disabled={loadingRule || saving}
            />

            <div>
              <label htmlFor="rule-timezone" className="label">
                Timezone
              </label>
              <select
                id="rule-timezone"
                className="input"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                disabled={loadingRule || saving}
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                The evaluation uses this zone, so the same link behaves correctly for IST
                visitors.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!canSave}
              >
                {saving ? <Spinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
                {saving ? 'Saving' : hasRule && !dirty ? 'Saved' : 'Save to DynamoDB'}
              </button>
              <p className="text-xs text-muted-foreground">
                No Lambda redeploy — the config is a DynamoDB item.
              </p>
            </div>

            <details className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-foreground">
                Show config stored in DynamoDB
              </summary>
              <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
                {JSON.stringify(
                  {
                    short_code: code,
                    redirect_config: {
                      type: 'schedule',
                      timezone,
                      weekday_url: weekdayUrl.trim(),
                      weekend_url: weekendUrl.trim(),
                    },
                  },
                  null,
                  2,
                )}
              </pre>
            </details>

            {saveError ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {saveError}
              </p>
            ) : null}

            {savedAt && !dirty ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
              >
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Saved to DynamoDB at {savedAt.toLocaleTimeString()}. The live short link now uses
                this rule.
              </p>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-medium text-foreground">Live simulator</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Evaluates the saved rule without redirecting the browser.
              </p>
            </div>
            {preview?.simulate_time_applied ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                <Zap className="h-3 w-3" aria-hidden="true" />
                Simulated
              </span>
            ) : preview?.demo_forced ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                <Zap className="h-3 w-3" aria-hidden="true" />
                Demo clock
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Real clock
              </span>
            )}
          </div>

          {preview?.demo_forced ? (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Server demo clock is pinned to {formatInZone(preview.evaluated_at, preview.timezone)}.
              Opening the plain short link resolves with this clock.
            </p>
          ) : null}

          {dirty ? (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Unsaved edits — the simulator still tests the saved rule. Save to apply them.
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-7 gap-1.5" aria-label="Pick a day to simulate">
            {DAYS.map((day) => {
              const weekend = day.index === 0 || day.index === 6
              const active = day.index === activeDayIndex
              return (
                <button
                  key={day.short}
                  type="button"
                  onClick={() => handleScenario(day.index)}
                  title={`Simulate ${day.name} at 10:00`}
                  disabled={loadingRule || previewing}
                  className={`flex flex-col items-center rounded-lg border px-1 py-2 text-[11px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : weekend
                        ? 'border-warning/30 bg-warning/5 text-warning hover:bg-warning/10'
                        : 'border-brand/25 bg-brand/5 text-brand hover:bg-brand/10'
                  }`}
                >
                  <span className="font-medium">{day.short}</span>
                  <span
                    className={`mt-1 h-1 w-1 rounded-full ${
                      active
                        ? 'bg-background'
                        : weekend
                          ? 'bg-warning'
                          : 'bg-brand'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleScenario(1)}
              disabled={loadingRule || previewing}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Run weekday
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleScenario(6)}
              disabled={loadingRule || previewing}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Run weekend
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleNow}
              disabled={loadingRule || previewing}
            >
              Now
            </button>
          </div>

          <form onSubmit={handleTestMoment} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="datetime-local"
              className="input font-mono text-xs sm:flex-1"
              value={simulateTime}
              onChange={(event) => setSimulateTime(event.target.value)}
              aria-label="Simulated date and time"
            />
            <button
              type="submit"
              className="btn btn-secondary shrink-0 whitespace-nowrap"
              disabled={loadingRule || previewing}
            >
              {previewing ? <Spinner /> : <Clock3 className="h-4 w-4" aria-hidden="true" />}
              Test moment
            </button>
          </form>

          <div className="mt-4" aria-live="polite">
            {loadingRule || (previewing && !preview) ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
                <Spinner />
                Evaluating the rule…
              </div>
            ) : previewError ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {previewError}
              </p>
            ) : preview ? (
              <div
                className={`rounded-xl border p-4 ${
                  preview.is_weekend
                    ? 'border-warning/30 bg-warning/5'
                    : 'border-brand/25 bg-brand/5'
                } ${previewing ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-[11px] font-medium uppercase tracking-wide ${
                      preview.is_weekend ? 'text-warning' : 'text-brand'
                    }`}
                  >
                    {preview.is_weekend ? 'Weekend branch' : 'Weekday branch'}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatInZone(preview.evaluated_at, preview.timezone)}
                  </span>
                </div>

                <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Destination
                </p>
                <a
                  href={preview.destination}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block font-mono text-sm break-all text-foreground underline-offset-4 hover:underline"
                >
                  {preview.destination}
                </a>

                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="font-mono">{preview.short_code}</span>
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  <span className="font-mono">{compactUrl(preview.destination)}</span>
                  <span aria-hidden="true">·</span>
                  <span>rule: {preview.matched_rule}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {preview.simulate_time_applied
                      ? 'simulated moment'
                      : preview.demo_forced
                        ? 'demo clock'
                        : 'current moment'}
                  </span>
                </div>

                {shortUrl ? (
                  <a
                    href={`${shortUrl}${
                      preview.simulate_time
                        ? `?simulate_time=${encodeURIComponent(preview.simulate_time)}`
                        : ''
                    }`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand underline-offset-4 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    Open via short link
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          {history.length > 0 ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Recent evaluations
              </p>
              <ul className="mt-2 space-y-2">
                {history.slice(0, 3).map((item) => (
                  <li
                    key={`${item.evaluated_at}-${item.destination}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                  >
                    <span className="font-mono text-muted-foreground">
                      {formatInZone(item.evaluated_at, item.timezone)}
                    </span>
                    <span
                      className={
                        item.is_weekend
                          ? 'font-medium text-warning'
                          : 'font-medium text-brand'
                      }
                    >
                      {item.is_weekend ? 'Weekend' : 'Weekday'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right font-mono text-muted-foreground">
                      {compactUrl(item.destination)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Presenter notes
        </summary>
        <p className="mt-3 text-sm text-muted-foreground">
          The server demo clock is pinned to Saturday, so the plain short URL opens the weekend
          page. Weekdays route through the 2-second notice page to VTOP.
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            Open the plain demo link. It lands on the &ldquo;Weekend closed for service&rdquo;
            page with no query parameter.
          </li>
          <li>
            Click <span className="font-medium text-foreground">Run weekday</span>, then{' '}
            <span className="font-medium text-foreground">Open via short link</span>. The 2-second
            notice page appears, then VTOP loads.
          </li>
          <li>
            Click <span className="font-medium text-foreground">Run weekend</span> to return to
            the weekend page using the same short code.
          </li>
          <li>
            Change one destination and click <span className="font-medium text-foreground">Save</span>.
            The DynamoDB JSON updates immediately; no deployment happens.
          </li>
        </ol>
      </details>

      <p className="text-xs text-muted-foreground">
        Next in the same rule engine: geo/language, device and weighted loot-box routing.
      </p>
    </div>
  )
}
