import { Link2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { ShortenResult } from './api'
import ArchitectureView from './components/ArchitectureView'
import RecentLinks from './components/RecentLinks'
import ResultCard from './components/ResultCard'
import RulesView from './components/RulesView'
import ShortenForm from './components/ShortenForm'
import StatsView from './components/StatsView'
import Tabs from './components/Tabs'
import ThemeToggle from './components/ThemeToggle'
import { MAX_RECENT_LINKS, loadRecentLinks, saveRecentLinks } from './storage'
import type { RecentLink } from './storage'

type TabId = 'shorten' | 'architecture' | 'stats' | 'rules'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'shorten', label: 'Shorten' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'stats', label: 'Stats' },
  { id: 'rules', label: 'Smart Rules' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('shorten')
  const [recentLinks, setRecentLinks] = useState<RecentLink[]>(() => loadRecentLinks())
  const [created, setCreated] = useState<{
    result: ShortenResult
    originalUrl: string
    createdAt: string
  } | null>(null)

  const handleCreated = useCallback((result: ShortenResult, originalUrl: string) => {
    const createdAt = new Date().toISOString()
    setCreated({ result, originalUrl, createdAt })
    setRecentLinks((current) => {
      const next: RecentLink[] = [
        {
          short_code: result.short_code,
          short_url: result.short_url,
          original_url: originalUrl,
          created_at: createdAt,
        },
        ...current.filter((link) => link.short_code !== result.short_code),
      ].slice(0, MAX_RECENT_LINKS)
      saveRecentLinks(next)
      return next
    })
  }, [])

  const handleClearRecent = useCallback(() => {
    setRecentLinks([])
    saveRecentLinks([])
  }, [])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-foreground">
            <Link2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold text-foreground">SnipCloud</h1>
            <p className="truncate text-xs text-muted-foreground">
              Serverless URL shortener on AWS
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        <div
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="mt-6"
        >
          {activeTab === 'shorten' ? (
            <div className="space-y-6">
              <section className="card">
                <ShortenForm onCreated={handleCreated} />
              </section>

              {created ? (
                <ResultCard
                  result={created.result}
                  originalUrl={created.originalUrl}
                  createdAt={created.createdAt}
                />
              ) : null}

              <RecentLinks links={recentLinks} onClear={handleClearRecent} />
            </div>
          ) : null}

          {activeTab === 'architecture' ? <ArchitectureView /> : null}
          {activeTab === 'stats' ? <StatsView /> : null}
          {activeTab === 'rules' ? <RulesView /> : null}
        </div>
      </main>

      <footer className="border-t border-border py-6">
        <p className="mx-auto max-w-4xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          Built with AWS Lambda, API Gateway, DynamoDB, SQS, SNS, CloudWatch
        </p>
      </footer>
    </div>
  )
}
