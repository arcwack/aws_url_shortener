import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { shortenUrl } from '../api'
import type { ShortenResult } from '../api'
import Spinner from './Spinner'

const MAX_URL_LENGTH = 2048

interface ShortenFormProps {
  onCreated: (result: ShortenResult, originalUrl: string) => void
}

/** Client-side validation mirroring the Lambda's rules. */
function validateUrl(value: string): string | null {
  if (!value) return 'Enter a URL to shorten.'
  if (value.length > MAX_URL_LENGTH) {
    return `URLs can be at most ${MAX_URL_LENGTH.toLocaleString()} characters.`
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return 'Enter a valid URL, including the http:// or https:// prefix.'
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http:// and https:// URLs are supported.'
  }

  return null
}

export default function ShortenForm({ onCreated }: ShortenFormProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = url.trim()
    const validationError = validateUrl(trimmed)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await shortenUrl(trimmed)
      onCreated(result, trimmed)
      setUrl('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const errorId = 'shorten-error'
  const helpId = 'shorten-help'

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="shorten-url" className="label">
        Long URL
      </label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="shorten-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="https://example.com/a/very/long/link"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={loading}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${helpId} ${errorId}` : helpId}
          className="input sm:flex-1"
        />
        <button type="submit" className="btn btn-primary w-full sm:w-36" disabled={loading}>
          {loading ? (
            <>
              <Spinner />
              Shortening
            </>
          ) : (
            'Shorten URL'
          )}
        </button>
      </div>

      <p id={helpId} className="mt-2 text-xs text-muted-foreground">
        http:// or https:// · up to 2,048 characters · links expire after 90 days
      </p>

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </form>
  )
}
