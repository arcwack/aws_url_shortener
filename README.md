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
- **Smart Rules** — live time-based routing. Edit weekday/weekend destinations
  and the timezone, save the rule to DynamoDB, and evaluate any moment with the
  built-in simulator. The same short URL resolves to the real 302.
- Geo/language, device and loot-box rules are the next rule types for the same
  engine.

The Stats tab is still a preview. Live analytics will arrive once the
SQS → AnalyticsProcessor pipeline is fixed and wired up.

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
  api.ts                     shorten + rule config + resolve preview calls
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
    RulesView.tsx            live schedule editor + simulator
    PreviewBanner.tsx        "mock data" banner
    Spinner.tsx              inline loading spinner
  App.tsx                    header, tabs, panels, footer
  index.css                  Tailwind import, theme tokens, component classes
```

`api.ts` reads `import.meta.env.VITE_API_URL`; the URL is never hardcoded in a
component.

### Smart-rule endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/links/{code}/rules` | Read the stored `redirect_config` |
| PUT | `/links/{code}/rules` | Validate and save a schedule rule to DynamoDB |
| GET | `/resolve/{code}?simulate_time=...` | Evaluate the rule without redirecting |

`simulate_time` is a naive local timestamp interpreted in the rule's timezone,
e.g. `2026-10-31T10:00`. The simulator uses this endpoint, so demoing a weekend
does not require changing the server clock.

### Demo clock

Set `DEMO_FORCE_TIME` on `RedirectFunction` to pin the server-side clock for a
no-query-parameter demo:

```bash
DEMO_FORCE_TIME=2026-10-31T10:00:00
```

The plain short link then resolves as that moment. An explicit
`?simulate_time=...` still takes precedence, and removing the variable returns
the Lambda to real time.

Toggle it from the repo:

```bash
./scripts/demo-clock.sh weekend   # plain URL -> weekend page
./scripts/demo-clock.sh weekday   # plain URL -> 2s notice -> VTOP
./scripts/demo-clock.sh off       # real time
```

The `demo/` folder contains the two destination pages: `weekday.html` shows the
2-second “Taking you to VTOP” notice, and `weekend.html` shows “Weekend closed
for service”. Both are uploaded to the demo S3 bucket.

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

