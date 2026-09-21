import { getMockStats } from './mockStats'
import type { Stats } from './mockStats'

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
  // Small delay so the loading state is visible, like a real request.
  await new Promise((resolve) => setTimeout(resolve, 400))
  return getMockStats(code)
}
