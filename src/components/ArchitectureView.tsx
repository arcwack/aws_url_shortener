import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  doneItems,
  getDiagramStatus,
  inProgressItems,
  legend,
  plannedItems,
  statusLabels,
} from '../status'
import type { StatusItem, StatusKey } from '../status'

const statusCardStyles: Record<StatusKey, string> = {
  done: 'border-solid border-success/40 bg-success/10',
  'in-progress': 'border-solid border-warning/40 bg-warning/10',
  planned: 'border-dashed border-border bg-muted',
}

const statusTextStyles: Record<StatusKey, string> = {
  done: 'text-success',
  'in-progress': 'text-warning',
  planned: 'text-muted-foreground',
}

const statusDotStyles: Record<StatusKey, string> = {
  done: 'bg-success',
  'in-progress': 'bg-warning',
  planned: 'bg-muted-foreground',
}

function StatusTag({ status }: { status: StatusKey }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusTextStyles[status]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${statusDotStyles[status]}`} />
      {statusLabels[status]}
    </span>
  )
}

function Node({ title, subtitle, status }: { title: string; subtitle?: string; status: StatusKey }) {
  return (
    <div className={`flex-1 rounded-lg border px-3 py-2.5 text-center ${statusCardStyles[status]}`}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      <span className="mt-1.5 flex justify-center">
        <StatusTag status={status} />
      </span>
    </div>
  )
}

function Arrow({ label }: { label?: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col items-center justify-center gap-1 text-muted-foreground"
    >
      <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
      {label ? (
        <span className="text-center text-xs leading-tight whitespace-nowrap">{label}</span>
      ) : null}
    </div>
  )
}

function DiagramRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
      {children}
    </div>
  )
}

function StatusList({
  title,
  status,
  items,
}: {
  title: string
  status: StatusKey
  items: StatusItem[]
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${statusDotStyles[status]}`} />
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className={`rounded-lg border p-3 ${statusCardStyles[status]}`}>
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            Nothing here yet.
          </li>
        ) : null}
      </ul>
    </div>
  )
}

export default function ArchitectureView() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-foreground">Architecture</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The request path is live end-to-end. The async click-analytics path is designed but not
          deployed yet.
        </p>
      </header>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border px-4 py-3 text-sm">
        {legend.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-3 rounded-sm border-2 ${statusCardStyles[entry.key]}`}
            />
            <span className="font-medium text-foreground">{entry.label}</span>
            <span className="text-xs text-muted-foreground">{entry.description}</span>
          </li>
        ))}
      </ul>

      <section className="card space-y-6">
        <div>
          <h3 className="text-sm font-medium text-foreground">Request path</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            POST /shorten creates a code; GET /&#123;short_code&#125; redirects to the original URL.
          </p>
          <div className="mt-4">
            <DiagramRow>
              <Node title="Client" subtitle="React SPA" status={getDiagramStatus('client')} />
              <Arrow />
              <Node
                title="API Gateway"
                subtitle="HTTP API + CORS"
                status={getDiagramStatus('api-gateway')}
              />
              <Arrow />
              <Node
                title="Lambda"
                subtitle="CreateURL / Redirect"
                status={getDiagramStatus('lambda')}
              />
              <Arrow />
              <Node
                title="DynamoDB"
                subtitle="URLs table"
                status={getDiagramStatus('dynamodb-urls')}
              />
            </DiagramRow>
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">Click analytics</h3>
            <span className="text-xs text-muted-foreground">Async · planned</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The Redirect Lambda will enqueue a click event instead of writing analytics inline, so
            redirects stay fast.
          </p>

          <div className="mt-4 space-y-2">
            <DiagramRow>
              <Node
                title="Redirect Lambda"
                subtitle="enqueue click"
                status={getDiagramStatus('lambda')}
              />
              <Arrow label="click event" />
              <Node
                title="SQS"
                subtitle="ClickQueue"
                status={getDiagramStatus('sqs-click-queue')}
              />
              <Arrow />
              <Node
                title="AnalyticsProcessor"
                subtitle="Lambda"
                status={getDiagramStatus('analytics-processor')}
              />
              <Arrow />
              <Node
                title="DynamoDB"
                subtitle="Analytics table"
                status={getDiagramStatus('dynamodb-analytics')}
              />
            </DiagramRow>

            <DiagramRow>
              <Node
                title="SQS"
                subtitle="ClickQueue"
                status={getDiagramStatus('sqs-click-queue')}
              />
              <Arrow label="after 3 retries" />
              <Node title="DLQ" subtitle="dead-letter queue" status={getDiagramStatus('dlq')} />
              <Arrow />
              <Node
                title="CloudWatch"
                subtitle="alarm on DLQ depth"
                status={getDiagramStatus('cloudwatch-alarm')}
              />
              <Arrow />
              <Node title="SNS" subtitle="email alert topic" status={getDiagramStatus('sns-topic')} />
            </DiagramRow>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-foreground">Build status</h3>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          <StatusList title="Done" status="done" items={doneItems} />
          <StatusList title="In progress" status="in-progress" items={inProgressItems} />
          <StatusList title="Planned" status="planned" items={plannedItems} />
        </div>
      </section>
    </div>
  )
}
