# SnipCloud — Serverless URL Shortener (Frontend)

A polished React front end for a serverless URL shortener built on **AWS Lambda,
API Gateway and DynamoDB**. Built with **Vite + React + TypeScript + Tailwind
CSS v4**, it builds to plain static files so it can be hosted on S3 static
website hosting.

## Features

- **Shorten** — real calls to `POST /shorten`, client-side validation
  (`http`/`https` only, max 2048 chars), loading state, clear error handling,
  a success card with copy / open / expiry, and a "Recent links" list persisted
  in `localStorage` (capped at 10).
- **Architecture** — a dependency-free HTML/CSS diagram of the current request
  path and the planned async analytics path, plus Done / In progress / Planned
  status lists. All status data lives in `src/status.ts`.
- **Stats** — a clearly-labelled mock analytics preview: total clicks, a 7-day
  bar chart drawn with plain CSS, and a recent-clicks table.
- **Smart Rules** — a clearly-labelled, non-functional editor mock-up for
  time / geo / device / loot-box routing rules.

The Stats and Smart Rules tabs are previews. Live analytics will arrive once the
SQS → AnalyticsProcessor pipeline is deployed.

## Tech stack

| Concern    | Choice                                              |
| ---------- | --------------------------------------------------- |
| Build tool | Vite 8                                              |
| UI         | React 19 (function components + hooks)              |
| Language   | TypeScript                                          |
| Styling    | Tailwind CSS v4 (`@tailwindcss/vite` plugin)        |
| Icons      | Lucide (`lucide-react`) — the only icon set         |
| Routing    | None — simple tab state in `App.tsx`                |
| Charts     | None — hand-rolled CSS bars                         |

### Design system

Vercel-style minimalism: a neutral base, a single accent (blue) used sparingly,
borders instead of shadows for separation, and one Lucide icon set at a
consistent stroke weight. No emojis anywhere in the UI.

Colours are **semantic tokens** defined once in `src/index.css` (`background`,
`foreground`, `muted`, `border`, `primary`, `brand`, `destructive`, `success`,
`warning`, `ring`). Components only reference the tokens, so dark mode is a
single token remap under `.dark` rather than a separate design.

The app **defaults to dark**. A toggle in the header switches to light and the
choice is persisted; an inline script in `index.html` applies the saved theme
before first paint to avoid a flash. To change the default, edit
`getInitialTheme()` in `src/theme.ts`.

## Setup

Prerequisites: **Node.js 20+** and npm.

```bash
npm install
```


## Commands

```bash
npm run dev      # start the dev server at http://localhost:5173
npm run build    # type-check + build static files into dist/
npm run preview  # serve the production build locally
npm run lint     # run oxlint
```

## Project structure

```
src/
  api.ts                     shortenUrl(url) + getStats(code) (mock for now)
  status.ts                  architecture/build status data (single source of truth)
  mockStats.ts               deterministic mock analytics
  storage.ts                 localStorage helpers for "Recent links"
  clipboard.ts               copy-to-clipboard helper with fallback
  components/
    Tabs.tsx                 accessible tab bar (arrow-key navigation)
    ShortenForm.tsx          URL input + validation + submit
    ResultCard.tsx           short link, copy / open, expiry
    RecentLinks.tsx          persisted recent links list
    ArchitectureView.tsx     diagram + status lists
    StatsView.tsx            mock stats + CSS bar chart
    RulesView.tsx            mock smart-rules editor
    PreviewBanner.tsx        "mock data" banner
    Spinner.tsx              inline loading spinner
  App.tsx                    header, tabs, panels, footer
  index.css                  Tailwind import, theme tokens, component classes
```

`api.ts` reads `import.meta.env.VITE_API_URL`; the URL is never hardcoded in a
component.

## Deploying `dist/` to S3 static website hosting

1. **Build** (make sure `.env` points at the right API stage):

   ```bash
   npm run build
   ```

2. **Create a bucket** (bucket names are globally unique):

   ```bash
   aws s3 mb s3://YOUR_BUCKET_NAME --region ap-south-1
   ```

3. **Enable static website hosting** with `index.html` as the index document:

   ```bash
   aws s3 website s3://YOUR_BUCKET_NAME --index-document index.html
   ```

4. **Allow public read** with a bucket policy (this is required for a public
   static website). Save as `bucket-policy.json` and apply it:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
       }
     ]
   }
   ```

   ```bash
   aws s3api put-bucket-policy \
     --bucket YOUR_BUCKET_NAME \
     --policy file://bucket-policy.json
   ```

   You may also need to turn off "Block all public access" for the bucket.

5. **Upload the build output**:

   ```bash
   aws s3 sync dist/ s3://YOUR_BUCKET_NAME --delete
   ```

6. Your site is available at the website endpoint, e.g.
   `http://YOUR_BUCKET_NAME.s3-website.ap-south-1.amazonaws.com`.

> The app uses tab state, not URL routing, so no SPA rewrite rule is needed. If
> you host the site under a sub-path instead of a bucket root, set
> [`base`](https://vite.dev/config/shared-options.html#base) in `vite.config.ts`
> and rebuild.

## API Gateway CORS configuration

The browser calls the API from a different origin, so CORS must allow:

- **Allowed origins:** `http://localhost:5173` (dev) and your S3 website URL
  (e.g. `http://YOUR_BUCKET_NAME.s3-website.ap-south-1.amazonaws.com`) for prod.
- **Allowed methods:** `POST` and `OPTIONS`.
- **Allowed headers:** `content-type`.

Without this the browser blocks the request and the UI shows
_"Could not reach the API…"_.

### Status

The custom domain this app uses (`https://go.devansharora.in`) is configured
correctly — a preflight returns `Access-Control-Allow-Origin`,
`Access-Control-Allow-Methods: OPTIONS,POST` and
`Access-Control-Allow-Headers: content-type`.

The raw API Gateway invoke URL
(`https://<api-id>.execute-api.<region>.amazonaws.com`) does **not** allow the
`content-type` header, so a JSON `POST` sent directly to it is blocked by the
browser. If you ever point `VITE_API_URL` at that URL instead of the custom
domain, add `content-type` under
**API Gateway → your HTTP API → CORS → Access-Control-Allow-Headers**.

As a safety net, `shortenUrl()` sends a normal `application/json` request first
and, only if the browser blocks it (a network-level failure), transparently
retries as a CORS "simple request" (`text/plain`), which skips the preflight. The
Lambda parses the JSON body regardless of content type. Against the custom domain
the first request succeeds, so the fallback is never used.

