/**
 * Single source of truth for the build status shown on the Architecture tab.
 *
 * To mark something as finished, move it from `plannedItems` to `doneItems`
 * (or change its value in `diagramStatus`) — the UI updates automatically.
 */

export type StatusKey = 'done' | 'in-progress' | 'planned'

export interface StatusItem {
  id: string
  title: string
  detail: string
}

export interface LegendEntry {
  key: StatusKey
  label: string
  description: string
}

export const statusLabels: Record<StatusKey, string> = {
  done: 'Done',
  'in-progress': 'In progress',
  planned: 'Planned',
}

export const legend: LegendEntry[] = [
  { key: 'done', label: 'Done', description: 'Deployed and working' },
  { key: 'in-progress', label: 'In progress', description: 'Partially built' },
  { key: 'planned', label: 'Planned', description: 'Not started yet' },
]

export const doneItems: StatusItem[] = [
  {
    id: 'iam-budget',
    title: 'IAM users + budget alert',
    detail: 'Least-privilege IAM users and a monthly AWS budget alarm.',
  },
  {
    id: 'dynamodb-urls',
    title: 'DynamoDB — URLs table',
    detail: 'Stores short_code, original_url, created_at, expires_at, click_count.',
  },
  {
    id: 'dynamodb-analytics',
    title: 'DynamoDB — Analytics table',
    detail: 'Provisioned for aggregated click events (analytics is not written yet).',
  },
  {
    id: 'create-url-lambda',
    title: 'CreateURL Lambda',
    detail: 'Validates the URL, generates a 7-char code and writes the item with a 90-day TTL.',
  },
  {
    id: 'redirect-lambda',
    title: 'Redirect Lambda',
    detail: 'Looks up the code, checks expiry and returns a 302 to the original URL.',
  },
  {
    id: 'http-api',
    title: 'HTTP API (POST /shorten, GET /{short_code})',
    detail: 'API Gateway HTTP API routing to the two Lambdas, with CORS enabled.',
  },
]

export const inProgressItems: StatusItem[] = [
  {
    id: 'analytics-schema',
    title: 'Click event schema',
    detail: 'Designing the Analytics item shape (code, timestamp, country, device).',
  },
]

export const plannedItems: StatusItem[] = [
  {
    id: 'sqs-clickqueue',
    title: 'SQS ClickQueue + DLQ',
    detail: 'Buffer click events; failed messages go to a dead-letter queue after 3 retries.',
  },
  {
    id: 'analytics-processor',
    title: 'AnalyticsProcessor Lambda',
    detail: 'Consumes the queue and aggregates clicks into the Analytics table.',
  },
  {
    id: 'observability',
    title: 'SNS + CloudWatch alarms & dashboard',
    detail: 'Alarm on DLQ depth and Lambda errors, publish to an SNS topic.',
  },
  {
    id: 'stats-endpoint',
    title: 'GET /stats/{code} endpoint',
    detail: 'Serves live click metrics to the Stats tab.',
  },
  {
    id: 'smart-rules',
    title: 'Smart Redirect Rules',
    detail: 'Time, geo/language, device and loot-box routing in the Redirect Lambda.',
  },
]

/**
 * Status for each node drawn in the architecture diagram, keyed by node id.
 * Anything missing falls back to "planned".
 */
export const diagramStatus: Record<string, StatusKey> = {
  client: 'done',
  'api-gateway': 'done',
  lambda: 'done',
  'dynamodb-urls': 'done',
  'dynamodb-analytics': 'done',
  'sqs-click-queue': 'planned',
  'analytics-processor': 'planned',
  dlq: 'planned',
  'cloudwatch-alarm': 'planned',
  'sns-topic': 'planned',
}

export function getDiagramStatus(id: string): StatusKey {
  return diagramStatus[id] ?? 'planned'
}
