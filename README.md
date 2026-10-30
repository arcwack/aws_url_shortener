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
- **Stats** — live clicks from the SQS → AnalyticsProcessor → DynamoDB
  pipeline: total clicks, unique source IPs, top rule, a 7-day bar chart and
  recent clicks with their matched rule and destination.
- **Smart Rules** — live time-based routing. Edit weekday/weekend destinations
  and the timezone, save the rule to DynamoDB, and evaluate any moment with the
  built-in simulator. The same short URL resolves to the real 302.
- **Password gate** — tick “Password protect this link” while shortening and the
  app opens Smart Rules for password setup. Protected links show an unlock form;
  only a PBKDF2 hash with a per-link salt is stored. It composes with the
  schedule rule.
- **Security Lab** — an admin-only “Try to hack me” tab that attacks only the
  dedicated `labdemo` link with 50 common passwords, shows attempts live, and
  demonstrates the 3-attempt / 30-second per-IP unlock rate limit.
- Geo/language, device and loot-box rules are the next rule types for the same
  engine.

Every redirect publishes a click event to SQS; AnalyticsProcessor writes it to
the `Analytics` table with the matched rule and destination. StatsFunction
aggregates those items for the Stats tab.

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
  api.ts                     shorten, rules, password, preview and stats calls
  status.ts                  architecture/build status data (single source of truth)
  storage.ts                 localStorage helpers for "Recent links"
  clipboard.ts               copy-to-clipboard helper with fallback
  components/
    Tabs.tsx                 accessible tab bar (arrow-key navigation)
    ShortenForm.tsx          URL input + validation + submit
    ResultCard.tsx           short link, copy / open, expiry
    RecentLinks.tsx          persisted recent links list
    ArchitectureView.tsx     diagram + status lists
    StatsView.tsx            live stats + CSS bar chart
    RulesView.tsx            live schedule editor + simulator
    SecurityLabView.tsx      admin-gated attack simulator
    Spinner.tsx              inline loading spinner
  App.tsx                    header, tabs, panels, footer
  index.css                  Tailwind import, theme tokens, component classes
```

`api.ts` reads `import.meta.env.VITE_API_URL`; the URL is never hardcoded in a
component.

### Smart-rule endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/links/{code}/rules` | Read the stored `redirect_config` and password flag |
| PUT | `/links/{code}/rules` | Validate and save a schedule rule to DynamoDB |
| PUT | `/links/{code}/password` | Hash and store a PBKDF2 password |
| DELETE | `/links/{code}/password` | Remove the password gate |
| POST | `/{code}/unlock` | Verify the password and set the unlock cookie |
| GET | `/resolve/{code}?simulate_time=...` | Evaluate the rule without redirecting |
| GET | `/stats/{code}` | Live click aggregates for the Stats tab |
| GET | `/lab/status` | Admin-only lab status |
| PUT | `/lab/protection` | Admin-only rate-limit toggle for labdemo |
| POST | `/lab/attempt` | Admin-only password attempt against labdemo |
| POST | `/lab/reset` | Admin-only reset to welcome1, protection off |

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

### Password storage

`password_hash` is `pbkdf2_sha256$600000$<salt>$<digest>` with a random 16-byte
salt per link. Wrong passwords are compared in constant time and add a short
delay. Successful unlocks receive a signed `HttpOnly; Secure; SameSite=Lax`
cookie valid for one hour, signed with `UNLOCK_COOKIE_SECRET` and the link’s
`password_version`. Changing or removing the password invalidates old cookies.

### Security Lab

`UnlockRateLimits` stores per-link, per-IP failure counts with a TTL. After 3
wrong passwords the unlock endpoint returns 429 for 30 seconds; a correct
password clears the counter. The Security Lab toggle only affects the hardcoded
`labdemo` link.

Seed the lab and get the admin key:

```bash
./scripts/seed-labdemo.sh
./scripts/lab-admin-key.sh
```

The lab password is `welcome1`. Demo sequence: protection **off** → Launch
attack → cracked; toggle protection **on** → Launch attack → blocked after 3
wrong attempts. The attack API is hardcoded to `labdemo` and cannot target any
other link.

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

