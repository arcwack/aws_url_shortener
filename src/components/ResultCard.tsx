import { Check, CircleCheck, Copy, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ShortenResult } from '../api'
import { copyToClipboard } from '../clipboard'
import Spinner from './Spinner'

const EXPIRY_DAYS = 90
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000

interface ResultCardProps {
  result: ShortenResult
  originalUrl: string
  /** ISO timestamp of when the link was created. */
  createdAt: string
}

export default function ResultCard({ result, originalUrl, createdAt }: ResultCardProps) {
  // Track which link was copied so the state resets when a new link arrives.
  const [copiedFor, setCopiedFor] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const resetTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    }
  }, [])

  const copied = copiedFor === result.short_url

  async function handleCopy() {
    setCopying(true)
    const succeeded = await copyToClipboard(result.short_url)
    setCopying(false)
    if (!succeeded) return

    setCopiedFor(result.short_url)
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setCopiedFor(null), 1800)
  }

  const expiresOn = new Date(new Date(createdAt).getTime() + EXPIRY_MS)

  return (
    <section role="status" aria-live="polite" className="card">
      <div className="flex items-center gap-2">
        <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
        <h2 className="text-sm font-medium text-foreground">Link created</h2>
      </div>

      <a
        href={result.short_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block font-mono text-base font-medium break-all text-brand underline-offset-4 hover:underline"
      >
        {result.short_url}
      </a>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={handleCopy}>
          {copying ? (
            <Spinner />
          ) : copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a
          href={result.short_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open link
        </a>
      </div>

      <dl className="mt-4 space-y-1.5 text-xs">
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="font-medium text-muted-foreground">Original</dt>
          <dd className="max-w-full truncate text-muted-foreground" title={originalUrl}>
            {originalUrl}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="font-medium text-muted-foreground">Expires</dt>
          <dd className="text-muted-foreground">
            in {EXPIRY_DAYS} days ·{' '}
            {expiresOn.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </dd>
        </div>
      </dl>
    </section>
  )
}
