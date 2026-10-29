/**
 * Base URL of the API, e.g. https://go.devansharora.in (API Gateway custom
 * domain).
 *
 * Read from the VITE_API_URL environment variable (see .env.example). Any
 * trailing slashes are stripped so we can safely append paths below.
 */
const RAW_API_URL: string = import.meta.env.VITE_API_URL ?? ''
export const API_URL: string = RAW_API_URL.replace(/\/+$/, '')

export interface ShortenResult {
  short_code: string
  short_url: string
}

export interface ScheduleConfig {
  type: 'schedule'
  timezone: string
  weekday_url: string
  weekend_url: string
}

export interface RuleConfigResponse {
  short_code: string
  short_url: string
  original_url: string
  redirect_config: ScheduleConfig | null
  password_protected: boolean
}

export interface PasswordResponse {
  short_code: string
  short_url: string
  password_protected: boolean
}

export interface DailyClicks {
  date: string
  label: string
  clicks: number
}

export interface RecentClick {
  id: string
  timestamp: string
  country: string
  device: string
  matchedRule: string
  destination: string
}

export interface Stats {
  code: string
  totalClicks: number
  uniqueVisitors: number
  topRule: string
  lastClick: string | null
  daily: DailyClicks[]
  recent: RecentClick[]
}

export interface ResolvePreview {
  short_code: string
  short_url: string
  destination: string
  matched_rule: string
  original_url: string
  redirect_config: ScheduleConfig | null
  evaluated_at: string
  timezone: string
  day: string
  is_weekend: boolean
  simulate_time: string | null
  simulate_time_applied: boolean
  demo_forced: boolean
  demo_force_time: string | null
}

/**
 * Error thrown for every failure mode of the API (validation, network, 5xx).
 * `status` is 0 when the request never reached the server.
 */
export class ApiError extends Error {
  status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/** Turn an error response into a message we can show the user. */
function errorMessage(data: unknown, status: number): string {
  if (isRecord(data) && typeof data.error === 'string' && data.error.trim()) {
    return data.error
  }
  if (status === 400) return 'That URL was rejected by the API.'
  if (status === 403) return 'The API blocked this request. Wait a moment and try again.'
  if (status === 404) return 'That short link could not be found.'
  if (status === 429) return 'Too many requests. Wait a moment and try again.'
  if (status >= 500) return 'The API ran into a server error. Please try again.'
  // API Gateway / WAF error bodies use `message` rather than `error`.
  if (isRecord(data) && typeof data.message === 'string' && data.message.trim()) {
    return data.message
  }
  return `Request failed (HTTP ${status}).`
}

function isShortenResult(value: unknown): value is ShortenResult {
  return (
    isRecord(value) &&
    typeof value.short_code === 'string' &&
    typeof value.short_url === 'string'
  )
}

function isScheduleConfig(value: unknown): value is ScheduleConfig {
  return (
    isRecord(value) &&
    value.type === 'schedule' &&
    typeof value.timezone === 'string' &&
    typeof value.weekday_url === 'string' &&
    typeof value.weekend_url === 'string'
  )
}

function isRuleConfigResponse(value: unknown): value is RuleConfigResponse {
  return (
    isRecord(value) &&
    typeof value.short_code === 'string' &&
    typeof value.short_url === 'string' &&
    typeof value.original_url === 'string' &&
    (value.redirect_config === null || isScheduleConfig(value.redirect_config)) &&
    typeof value.password_protected === 'boolean'
  )
}

function isPasswordResponse(value: unknown): value is PasswordResponse {
  return (
    isRecord(value) &&
    typeof value.short_code === 'string' &&
    typeof value.short_url === 'string' &&
    typeof value.password_protected === 'boolean'
  )
}

function isResolvePreview(value: unknown): value is ResolvePreview {
  return (
    isRecord(value) &&
    typeof value.short_code === 'string' &&
    typeof value.short_url === 'string' &&
    typeof value.destination === 'string' &&
    typeof value.matched_rule === 'string' &&
    typeof value.original_url === 'string' &&
    (value.redirect_config === null || isScheduleConfig(value.redirect_config)) &&
    typeof value.evaluated_at === 'string' &&
    typeof value.timezone === 'string' &&
    typeof value.day === 'string' &&
    typeof value.is_weekend === 'boolean' &&
    (value.simulate_time === null || typeof value.simulate_time === 'string') &&
    typeof value.simulate_time_applied === 'boolean' &&
    typeof value.demo_forced === 'boolean' &&
    (value.demo_force_time === null || typeof value.demo_force_time === 'string')
  )
}

function isDailyClicks(value: unknown): value is DailyClicks {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    typeof value.label === 'string' &&
    typeof value.clicks === 'number'
  )
}

function isRecentClick(value: unknown): value is RecentClick {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.country === 'string' &&
    typeof value.device === 'string' &&
    typeof value.matchedRule === 'string' &&
    typeof value.destination === 'string'
  )
}

function isStats(value: unknown): value is Stats {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.totalClicks === 'number' &&
    typeof value.uniqueVisitors === 'number' &&
    typeof value.topRule === 'string' &&
    (value.lastClick === null || typeof value.lastClick === 'string') &&
    Array.isArray(value.daily) &&
    value.daily.every(isDailyClicks) &&
    Array.isArray(value.recent) &&
    value.recent.every(isRecentClick)
  )
}

async function apiRequest(path: string, init?: RequestInit): Promise<unknown> {
  if (!API_URL) {
    throw new ApiError(
      'The API URL is not configured. Add VITE_API_URL to your .env file and restart the dev server.',
    )
  }

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, init)
  } catch {
    throw new ApiError(
      'Could not reach the API. Check your connection and the API Gateway CORS configuration.',
    )
  }

  const data = await readJson(response)
  if (!response.ok) {
    throw new ApiError(errorMessage(data, response.status), response.status)
  }
  return data
}

function requestShorten(url: string, contentType: string): Promise<Response> {
  return fetch(`${API_URL}/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: JSON.stringify({ url }),
  })
}

/**
 * POST /shorten
 *
 * @throws {ApiError} on validation, network, or server errors.
 */
export async function shortenUrl(url: string): Promise<ShortenResult> {
  if (!API_URL) {
    throw new ApiError(
      'The API URL is not configured. Add VITE_API_URL to your .env file and restart the dev server.',
    )
  }

  let response: Response
  try {
    response = await requestShorten(url, 'application/json')
  } catch {
    // A JSON content type makes this a CORS "preflighted" request. If the API's
    // CORS config does not allow the `content-type` header, the browser blocks
    // the request before it is sent and fetch() rejects. (The
    // go.devansharora.in custom domain allows it; the raw execute-api URL does
    // not.) Retry as a CORS "simple request" (text/plain), which skips the
    // preflight entirely — the Lambda parses the body as JSON either way.
    // Against a correctly configured API the first request succeeds, so this is
    // never used.
    try {
      response = await requestShorten(url, 'text/plain;charset=UTF-8')
    } catch {
      throw new ApiError(
        'Could not reach the API. Check your connection and the API Gateway CORS configuration (allowed origin, POST/OPTIONS methods, content-type header).',
      )
    }
  }

  const data = await readJson(response)

  if (!response.ok) {
    throw new ApiError(errorMessage(data, response.status), response.status)
  }

  if (!isShortenResult(data)) {
    throw new ApiError('The API returned an unexpected response.')
  }

  return data
}

/**
 * GET /stats/{code}
 *
 * For now this returns deterministic mock data so the Stats tab can be demoed
 * before the analytics pipeline exists. Swapping in the real endpoint is a
 * one-function change:
 *
 *   const response = await fetch(`${API_URL}/stats/${encodeURIComponent(code)}`)
 *   const data = await readJson(response)
 *   if (!response.ok) throw new ApiError(errorMessage(data, response.status), response.status)
 *   return data as Stats
 */
export async function getStats(code: string): Promise<Stats> {
  const data = await apiRequest(`/stats/${encodeURIComponent(code)}`)
  if (!isStats(data)) {
    throw new ApiError('The API returned unexpected stats.')
  }
  return data
}

/**
 * GET /links/{code}/rules
 *
 * Returns the stored redirect configuration for a short link.
 */
export async function getRuleConfig(code: string): Promise<RuleConfigResponse> {
  const data = await apiRequest(`/links/${encodeURIComponent(code)}/rules`)
  if (!isRuleConfigResponse(data)) {
    throw new ApiError('The API returned an unexpected rule configuration.')
  }
  return data
}

/**
 * PUT /links/{code}/rules
 *
 * Persists a schedule rule to DynamoDB. No redeploy is required.
 */
export async function saveScheduleRule(
  code: string,
  config: ScheduleConfig,
): Promise<RuleConfigResponse> {
  const data = await apiRequest(`/links/${encodeURIComponent(code)}/rules`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_config: config }),
  })
  if (!isRuleConfigResponse(data)) {
    throw new ApiError('The API returned an unexpected rule configuration.')
  }
  return data
}

/**
 * GET /resolve/{code}?simulate_time=...
 *
 * Evaluates the rule without redirecting, so the simulator can show exactly
 * which destination would be chosen for a given moment.
 */
export async function resolvePreview(
  code: string,
  simulateTime?: string,
): Promise<ResolvePreview> {
  const query = simulateTime ? `?simulate_time=${encodeURIComponent(simulateTime)}` : ''
  const data = await apiRequest(`/resolve/${encodeURIComponent(code)}${query}`)
  if (!isResolvePreview(data)) {
    throw new ApiError('The API returned an unexpected preview.')
  }
  return data
}

/**
 * PUT /links/{code}/password
 *
 * Hashes the password in the Lambda (PBKDF2 + per-link salt). The plaintext is
 * never stored and the response only says whether protection is on.
 */
export async function setLinkPassword(
  code: string,
  password: string,
): Promise<PasswordResponse> {
  const data = await apiRequest(`/links/${encodeURIComponent(code)}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!isPasswordResponse(data)) {
    throw new ApiError('The API returned an unexpected password response.')
  }
  return data
}

/**
 * DELETE /links/{code}/password
 *
 * Removes the gate so the link redirects immediately again.
 */
export async function removeLinkPassword(code: string): Promise<PasswordResponse> {
  const data = await apiRequest(`/links/${encodeURIComponent(code)}/password`, {
    method: 'DELETE',
  })
  if (!isPasswordResponse(data)) {
    throw new ApiError('The API returned an unexpected password response.')
  }
  return data
}
