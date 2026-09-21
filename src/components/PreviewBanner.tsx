import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

interface PreviewBannerProps {
  children?: ReactNode
}

/**
 * Banner marking mock/preview content. Used on the Stats and Smart Rules tabs
 * until the real backend features are deployed.
 */
export default function PreviewBanner({ children }: PreviewBannerProps) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="leading-relaxed">
        {children ??
          'Preview: mock data. Live analytics arrive once the SQS pipeline is deployed.'}
      </p>
    </div>
  )
}
