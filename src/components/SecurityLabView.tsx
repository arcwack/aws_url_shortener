import {
  Ban,
  CircleCheck,
  CircleX,
  KeyRound,
  LockKeyhole,
  LogOut,
  Play,
  RotateCcw,
  Shield,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  attemptLabPassword,
  getLabStatus,
  resetLab,
  setLabProtection,
} from '../api'
import type { LabAttemptResult, LabStatus } from '../api'
import Spinner from './Spinner'

const SESSION_KEY = 'snipcloud.labAdminKey'
const ATTACK_DELAY_MS = 100

const COMMON_PASSWORDS = [
  '123456',
  'password',
  '12345678',
  'qwerty',
  '123456789',
  'welcome1',
  '12345',
  '1234',
  '111111',
  '1234567',
  'dragon',
  '123123',
  'abc123',
  'letmein',
  'monkey',
  'sunshine',
  'princess',
  'football',
  'charlie',
  'aa123456',
  'donald',
  'password1',
  'qwerty123',
  'welcome',
  'login',
  'passw0rd',
  'starwars',
  'whatever',
  'trustno1',
  'master',
  'shadow',
  'superman',
  'michael',
  'jennifer',
  'hunter',
  'freedom',
  'secret',
  'hello123',
  'ninja',
  'mustang',
  'access',
  'flower',
  'summer',
  'winter',
  'spring',
  'autumn',
  'loveyou',
  'lovely',
  'test1234',
  'admin123',
]

interface AttemptRow {
  password: string
  statusCode: number
  result: LabAttemptResult['result']
  at: Date
}

type Banner =
  | { kind: 'cracked'; password: string; attempts: number }
  | { kind: 'blocked'; attempts: number; retryAfter?: number }
  | { kind: 'finished' }
  | null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resultLabel(result: LabAttemptResult['result']): string {
  if (result === 'cracked') return 'Cracked'
  if (result === 'blocked') return 'Blocked'
  return 'Wrong password'
}

export default function SecurityLabView() {
  const [adminKey, setAdminKey] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY)
    } catch {
      return null
    }
  })
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(adminKey))
  const [status, setStatus] = useState<LabStatus | null>(null)
  const [toggling, setToggling] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [running, setRunning] = useState(false)
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
  const [banner, setBanner] = useState<Banner>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const runId = useRef(0)

  useEffect(() => {
    return () => {
      runId.current += 1
    }
  }, [])

  useEffect(() => {
    if (!adminKey) return

    let cancelled = false

    async function load() {
      try {
        const data = await getLabStatus(adminKey as string)
        if (cancelled) return
        setStatus(data)
        setKeyError(null)
        setActionError(null)
      } catch (caught) {
        if (cancelled) return
        if (caught instanceof ApiError && caught.status === 401) {
          try {
            sessionStorage.removeItem(SESSION_KEY)
          } catch {
            // Storage can be unavailable.
          }
          setAdminKey(null)
          setStatus(null)
          setKeyError('Admin key invalid or expired. Enter it again.')
        } else {
          setKeyError(caught instanceof Error ? caught.message : 'Could not load the lab.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [adminKey])

  function handleLock() {
    runId.current += 1
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // Storage can be unavailable.
    }
    setAdminKey(null)
    setStatus(null)
    setKeyInput('')
    setKeyError(null)
    setAttempts([])
    setBanner(null)
    setRunning(false)
    setToggling(false)
    setResetting(false)
    setActionError(null)
  }

  function handleAuthError(caught: unknown): boolean {
    if (caught instanceof ApiError && caught.status === 401) {
      handleLock()
      setKeyError('Admin key invalid or expired. Enter it again.')
      return true
    }
    return false
  }

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const key = keyInput.trim()
    if (!key) {
      setKeyError('Enter the admin key.')
      return
    }

    setLoading(true)
    setKeyError(null)

    try {
      const data = await getLabStatus(key)
      try {
        sessionStorage.setItem(SESSION_KEY, key)
      } catch {
        // Session persistence is best-effort.
      }
      setAdminKey(key)
      setStatus(data)
      setKeyInput('')
      setActionError(null)
    } catch (caught) {
      setKeyError(
        caught instanceof ApiError && caught.status === 401
          ? 'Invalid admin key.'
          : caught instanceof Error
            ? caught.message
            : 'Could not verify the admin key.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle() {
    if (!adminKey || !status || running) return

    setToggling(true)
    setActionError(null)

    try {
      const data = await setLabProtection(adminKey, !status.protection_enabled)
      setStatus(data)
      setAttempts([])
      setBanner(null)
    } catch (caught) {
      if (!handleAuthError(caught)) {
        setActionError(caught instanceof Error ? caught.message : 'Could not update protection.')
      }
    } finally {
      setToggling(false)
    }
  }

  async function handleReset() {
    if (!adminKey || running) return

    setResetting(true)
    setActionError(null)

    try {
      const data = await resetLab(adminKey)
      setStatus(data)
      setAttempts([])
      setBanner(null)
    } catch (caught) {
      if (!handleAuthError(caught)) {
        setActionError(caught instanceof Error ? caught.message : 'Could not reset the lab.')
      }
    } finally {
      setResetting(false)
    }
  }

  async function handleLaunch() {
    if (!adminKey || !status || running) return

    const currentRun = runId.current + 1
    runId.current = currentRun
    setRunning(true)
    setAttempts([])
    setBanner(null)
    setActionError(null)

    let wrongCount = 0
    let finalBanner: Banner = null

    try {
      for (let index = 0; index < COMMON_PASSWORDS.length; index += 1) {
        if (runId.current !== currentRun) return
        const password = COMMON_PASSWORDS[index]
        if (!password) continue

        const result = await attemptLabPassword(adminKey, password)
        if (runId.current !== currentRun) return

        const at = new Date()
        setAttempts((current) => [
          ...current,
          {
            password,
            statusCode: result.statusCode,
            result: result.result,
            at,
          },
        ])

        if (result.result === 'cracked') {
          finalBanner = { kind: 'cracked', password, attempts: index + 1 }
          break
        }

        if (result.result === 'blocked') {
          finalBanner = {
            kind: 'blocked',
            attempts: wrongCount,
            retryAfter: result.retryAfter,
          }
          break
        }

        if (result.result === 'wrong') wrongCount += 1
        await sleep(ATTACK_DELAY_MS)
      }

      setBanner(finalBanner ?? { kind: 'finished' })
    } catch (caught) {
      if (!handleAuthError(caught)) {
        setActionError(caught instanceof Error ? caught.message : 'Attack stopped unexpectedly.')
      }
    } finally {
      if (runId.current === currentRun) setRunning(false)
    }
  }

  const protectionOn = Boolean(status?.protection_enabled)

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground">Security Lab</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
            <Shield className="h-3 w-3" aria-hidden="true" />
            Admin only
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Attempt a controlled dictionary attack against the dedicated{' '}
          <span className="font-mono">labdemo</span> link. No other short link or URL can be
          targeted from this page.
        </p>
      </header>

      {!status ? (
        loading ? (
          <section className="card flex items-center gap-3 text-sm text-muted-foreground">
            <Spinner />
            Verifying admin key…
          </section>
        ) : (
          <section className="card">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-sm font-medium text-foreground">Admin key required</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              The attack endpoints are locked with a key that exists only in the Lambda
              environment, never in this bundle.
            </p>

            <form onSubmit={handleUnlock} className="mt-4">
              <label htmlFor="lab-admin-key" className="label">
                Admin key
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="lab-admin-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="input font-mono sm:flex-1"
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="btn btn-primary shrink-0"
                  disabled={loading || !keyInput.trim()}
                >
                  {loading ? <Spinner /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                  Unlock lab
                </button>
              </div>
            </form>

            {keyError ? (
              <p
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {keyError}
              </p>
            ) : null}

            <p className="mt-3 text-xs text-muted-foreground">
              Get the key with <span className="font-mono">./scripts/lab-admin-key.sh</span>.
            </p>
          </section>
        )
      ) : (
        <>
          <section className="card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                  <h3 className="text-sm font-medium text-foreground">Attack target</h3>
                </div>
                <a
                  href={status.short_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block font-mono text-sm break-all text-brand underline-offset-4 hover:underline"
                >
                  {status.short_url}
                </a>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dedicated lab link only. Normal short links are never attacked from this page.
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  protectionOn
                    ? 'border-success/30 bg-success/10 text-success'
                    : 'border-warning/30 bg-warning/10 text-warning'
                }`}
              >
                {protectionOn ? (
                  <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Ban className="h-3 w-3" aria-hidden="true" />
                )}
                Protection {protectionOn ? 'ON' : 'OFF'}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Rate limiting</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  After {status.max_failures} wrong passwords from one IP, unlock returns 429 for{' '}
                  {status.lock_seconds} seconds. A correct password resets the counter.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={protectionOn}
                aria-label="Toggle unlock rate limiting"
                onClick={() => void handleToggle()}
                disabled={toggling || running || resetting}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                  protectionOn ? 'bg-success' : 'bg-border-strong'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform duration-150 ${
                    protectionOn ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleReset()}
                disabled={resetting || running || toggling}
              >
                {resetting ? <Spinner /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                {resetting ? 'Resetting' : 'Reset demo'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleLock}
                disabled={running}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Lock lab
              </button>
            </div>

            {actionError ? (
              <p
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <CircleX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {actionError}
              </p>
            ) : null}
          </section>

          <section className="card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-sm font-medium text-foreground">Try to hack me</h3>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Tries up to {COMMON_PASSWORDS.length} common passwords against{' '}
                  <span className="font-mono">labdemo</span>. It stops on success or on the first
                  429.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary shrink-0"
                onClick={() => void handleLaunch()}
                disabled={running || toggling || resetting}
              >
                {running ? <Spinner /> : <Play className="h-4 w-4" aria-hidden="true" />}
                {running ? 'Attacking…' : 'Launch attack'}
              </button>
            </div>

            {banner?.kind === 'cracked' ? (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive"
              >
                <div className="flex items-center gap-2">
                  <CircleX className="h-4 w-4" aria-hidden="true" />
                  <p className="text-sm font-semibold">PASSWORD CRACKED</p>
                </div>
                <p className="mt-1 text-sm">
                  <span className="font-mono font-medium">{banner.password}</span> worked on
                  attempt {banner.attempts}. Protection is off for this demo.
                </p>
              </div>
            ) : null}

            {banner?.kind === 'blocked' ? (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-success"
              >
                <div className="flex items-center gap-2">
                  <CircleCheck className="h-4 w-4" aria-hidden="true" />
                  <p className="text-sm font-semibold">ATTACK BLOCKED</p>
                </div>
                <p className="mt-1 text-sm">
                  Stopped after {banner.attempts} wrong attempts. The next request returned 429
                  {banner.retryAfter
                    ? ` and stays locked for ${banner.retryAfter} more seconds.`
                    : '.'}
                </p>
              </div>
            ) : null}

            {banner?.kind === 'finished' ? (
              <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Attack finished. None of the listed common passwords matched.
              </p>
            ) : null}

            {attempts.length > 0 ? (
              <div className="mt-4 max-h-[24rem] overflow-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Live password attempts</caption>
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th scope="col" className="px-3 py-2 font-medium">
                        #
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Password
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Result
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt, index) => {
                      const tone =
                        attempt.result === 'cracked'
                          ? 'text-success'
                          : attempt.result === 'blocked'
                            ? 'text-warning'
                            : 'text-destructive'
                      return (
                        <tr
                          key={`${attempt.password}-${index}`}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-foreground">
                            {attempt.password}
                          </td>
                          <td className={`px-3 py-2 font-mono text-xs ${tone}`}>
                            {attempt.statusCode}
                          </td>
                          <td className={`px-3 py-2 ${tone}`}>
                            {resultLabel(attempt.result)}
                          </td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                            {attempt.at.toLocaleTimeString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                No attempts yet. Turn protection off to show a successful crack, or on to show
                the 429 block.
              </p>
            )}
          </section>

          <p className="text-xs text-muted-foreground">
            Normal links keep rate limiting. This toggle and the reset action only affect{' '}
            <span className="font-mono">labdemo</span>.
          </p>
        </>
      )}
    </div>
  )
}
