# Local Opportunity Radar

A personal, phone-installable web app (PWA) that helps you **find local side-job opportunities, score them, and prepare your response** — while keeping all outreach fully manual.

It is a *decision + reply + pricing engine* for opportunities that arrive through allowed channels. It is **not** a scraper.

## What it does

For every lead you add (by manual entry or by pasting a post / forwarded alert email), the app gives you:

- a plain-language **summary** + an **A–D grade** with a 7-dimension breakdown that shows *why* it scored that way
- a **recommended action** (reply now / reply if slow / good-fit-low-budget / high-fit-premium / skip)
- a **suggested reply** in 3 tones × short/normal/premium + a follow-up, with copy / email / text actions
- a **suggested price** (floor / standard / stretch) with the reasoning and what's included/excluded
- ranked **ways to get it done** (do-it-yourself, no-code, AI-assisted, automation, full custom app, refer/subcontract)
- a **pipeline** (Kanban) to track each lead from new → booked/lost

## Guardrails (enforced by the code, not just policy)

- **No scraping / crawling / auto-fetch of any lead source.** A hardened Content-Security-Policy + a single audited network module (`js/engine/net.js`) make this true by construction. `tests/guardrail-audit.mjs` proves it.
- **No auto-send.** The app drafts messages and gives you copy / `mailto:` / `sms:` actions — *you* decide whether to send.
- **All lead data stays on your device** (IndexedDB). Nothing is uploaded.
- Network access is funnelled through one audited module (`js/engine/net.js`) with a hard allowlist: same-origin (`feed.json`), `api.anthropic.com` (opt-in AI Enhance, your key), and `www.googleapis.com` (opt-in Google search, your key). Arbitrary origins are rejected — no scraping is possible from the client.

## Automatic lead ingestion

Real opportunities populate from **official, compliant APIs only** — never scraping.

**Architecture:** a scheduled **GitHub Action** (`.github/workflows/ingest.yml`, every 6h) runs `ingest/run.mjs`, which calls official public APIs, normalizes + dedupes the results, and commits a static **`feed.json`**. GitHub Pages redeploys, and the PWA pulls that **same-origin** feed on open (throttled) and on the dashboard **"Find leads"** button. This keeps the app static, keeps any secrets server-side, and needs no CORS or client keys.

**Connectors** (`ingest/connectors/`, edit `ingest/sources.json` to tune):
- **Remotive** — official public API, no key. Remote tech/automation/web/freelance roles.
- **Greenhouse** — official board API, no key. Add company board tokens (`gitlab`, `figma`, …).
- **Lever** — official postings API, no key. Add company slugs.

**Google Programmable Search** (optional, on-device): add your own API key + engine id (cx) in **Settings → Google search**, then "Search Google now". Uses the official Custom Search JSON API (never scrapes google.com); the key lives only on your device.

**Craigslist / Facebook:** never scraped or crawled. Use the manual paste flow (Add → Smart paste) for Craigslist saved-search **alert emails** or anything you found yourself.

Every ingested lead shows its **source, source detail, original-posting link, the query that surfaced it, and posted/found dates** across the dashboard, inbox, pipeline, and detail views.

## Run it

### On your phone (the real target)
PWA install + offline need HTTPS, so deploy to **GitHub Pages** (free):
1. `git init && git add -A && git commit -m "Local Opportunity Radar"` (already done if you cloned this).
2. Create a GitHub repo and push.
3. Repo → Settings → Pages → deploy from the `main` branch root.
4. Open the Pages URL on your phone → browser menu → **Add to Home Screen**. It now runs full-screen and offline.

### Locally (desktop dev)
```
node tests/dev-server.mjs 8030      # no-cache dev server
# open http://127.0.0.1:8030
```
(`localhost` is a secure context, so the service worker / install work for dev. A phone hitting your PC's LAN IP over plain http will NOT install — that's expected; use Pages for the phone.)

## Tests
```
node tests/engine.test.mjs       # deterministic scoring/pricing/message/parse (63 assertions)
node tests/guardrail-audit.mjs   # no-scrape / no-auto-send / CSP audit (35 assertions)
```

## Tech
Vanilla JS (ES modules), plain CSS, IndexedDB, a service worker. **No framework, no build step.** Design system: linear-minimal. Offline-first, single-user, single-device (with JSON export/import to move devices).

## Layout
- `index.html` — app shell + CSP + boot-safe recovery screen
- `js/` — `app.js` (router), `store.js` (IndexedDB), `schema.js`, `leadops.js`, `seed.js`, `boot.js`
- `js/engine/` — `score`, `pricing`, `message`, `fulfillment`, `parse`, `net`, `ai`
- `js/ui/` — one module per screen + shared `components.js`
- `css/` — `tokens`, `base`, `components`, `screens`
- `docs/spec.md` — the full design spec (5 rounds of adversarial review baked in)
- `docs/RUNBOOK.md` — recovery procedures

The app starts empty on first run. Example leads are optional and can be loaded manually from the dashboard or settings.

See `docs/spec.md` for the complete design and the 32 review findings that shaped it.
