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

export interface ReliabilityItem {
  id: string
  title: string
  detail: string
}

export const reliabilityItems: ReliabilityItem[] = [
  {
    id: 'redirect-route',
    title: 'Redirect route wired',
    detail: 'GET /{short_code} is attached to RedirectFunction and deployed to the $default stage.',
  },
  {
    id: 'sqs-permission',
    title: 'SQS send permission',
    detail: 'RedirectRole can publish click events to ClickQueue (and its DLQ) only.',
  },
  {
    id: 'analytics-schema',
    title: 'Click schema fixed',
    detail: 'Analytics uses short_code + timestamp (String), matching what the processor writes.',
  },
  {
    id: 'node-processor',
    title: 'Node.js AnalyticsProcessor',
    detail: 'index.mjs with AWS SDK v3, UUID click IDs and a scoped IAM policy.',
  },
  {
    id: 'dlq-redrive',
    title: 'DLQ redrive',
    detail: 'ClickQueue moves a message to ClickQueue-DLQ after 3 failed receives.',
  },
  {
    id: 'alarm-email',
    title: 'Alarm + email',
    detail: 'CloudWatch alarms on DLQ depth and publishes to SNS DLQ-Alerts; the email is confirmed.',
  },
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
    detail: 'One item per click, keyed by short_code + timestamp.',
  },
  {
    id: 'create-url-lambda',
    title: 'CreateURL Lambda',
    detail: 'Validates the URL, generates a 7-char code and writes the item with a 90-day TTL.',
  },
  {
    id: 'redirect-lambda',
    title: 'Redirect Lambda + rule engine',
    detail:
      'Looks up the code, checks expiry, evaluates redirect_config and returns a 302 with the matched rule.',
  },
  {
    id: 'http-api',
    title: 'HTTP API',
    detail:
      'Shorten, redirect, rule config/preview and password set/remove/unlock routes.',
  },
  {
    id: 'smart-rules',
    title: 'Smart Rules — time-based',
    detail:
      'Weekday/weekend schedule saved to DynamoDB, evaluated in the Lambda and previewable from the UI.',
  },
  {
    id: 'password-rule',
    title: 'Smart Rules — password gate',
    detail:
      'PBKDF2 password hash, unlock form, signed HttpOnly unlock cookie and a create-link handoff.',
  },
  {
    id: 'analytics-pipeline',
    title: 'SQS ClickQueue + AnalyticsProcessor',
    detail: 'Every redirect publishes a click; the processor writes rule and destination to Analytics.',
  },
  {
    id: 'stats-endpoint',
    title: 'GET /stats/{code} + live Stats tab',
    detail: 'Aggregates totals, unique IPs, top rule, 7-day chart and recent clicks.',
  },
  {
    id: 'observability',
    title: 'SNS + CloudWatch alarm',
    detail: 'DLQ depth alarm publishes to DLQ-Alerts; the email subscription is confirmed.',
  },
  {
    id: 'security-lab',
    title: 'Security Lab + unlock rate limiting',
    detail:
      'Per-IP DynamoDB rate limit after 3 wrong passwords, 30-second lock, and an admin-gated attack simulator.',
  },
]

export const inProgressItems: StatusItem[] = []

export const plannedItems: StatusItem[] = [
  {
    id: 'smart-rules-extra',
    title: 'Geo, device and loot-box rules',
    detail: 'Reuse the same rule engine and DynamoDB config format as the schedule rule.',
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
  'sqs-click-queue': 'done',
  'analytics-processor': 'done',
  dlq: 'done',
  'cloudwatch-alarm': 'done',
  'sns-topic': 'done',
}

export function getDiagramStatus(id: string): StatusKey {
  return diagramStatus[id] ?? 'planned'
}
