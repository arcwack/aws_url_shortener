import { Check, Copy, ExternalLink, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { copyToClipboard } from '../clipboard'
import type { RecentLink } from '../storage'

interface RecentLinksProps {
  links: RecentLink[]
  onClear: () => void
}

function formatRelative(iso: string): string {
  const timestamp = new Date(iso).getTime()
  if (Number.isNaN(timestamp)) return ''

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export default function RecentLinks({ links, onClear }: RecentLinksProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const resetTimer = useRef<number | null>(null)

  async function handleCopy(link: RecentLink) {
    const succeeded = await copyToClipboard(link.short_url)
    if (!succeeded) return

    setCopiedCode(link.short_code)
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setCopiedCode(null), 1800)
  }

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">Recent links</h2>
        {links.length > 0 ? (
          <button type="button" onClick={onClear} className="btn btn-ghost px-2 py-1 text-xs">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </button>
        ) : null}
      </div>

      {links.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No links yet. Shorten one above and it will show up here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {links.map((link) => (
            <li
              key={link.short_code}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <a
                  href={link.short_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-mono text-sm font-medium text-brand underline-offset-4 hover:underline"
                >
                  {link.short_url}
                </a>
                <p className="mt-0.5 truncate text-xs text-muted-foreground" title={link.original_url}>
                  {link.original_url}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="mr-1 text-xs text-muted-foreground">
                  {formatRelative(link.created_at)}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(link)}
                  className="icon-btn"
                  aria-label={copiedCode === link.short_code ? 'Copied' : 'Copy short link'}
                  title={copiedCode === link.short_code ? 'Copied' : 'Copy short link'}
                >
                  {copiedCode === link.short_code ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <a
                  href={link.short_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="icon-btn"
                  aria-label="Open short link in a new tab"
                  title="Open short link in a new tab"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
