# Local Opportunity Radar — Personal Side-Job Lead Hub (Phone PWA)

## 1. Context & Goal

Irving wants a personal tool that helps him **find local side-money opportunities, score them, and prepare his response — while keeping all outreach fully manual.** The end deliverable is **an installable app he can open on his phone**, with a clean, "open"/minimal look that is impeccable.

The product is NOT a scraper or a search-the-whole-internet crawler. It is a **decision + reply + pricing engine for opportunities that arrive through allowed channels** (alerts, feeds, email he forwards/pastes, forms, manual entry). Per the brief: *"Do not build the search-the-whole-internet version first. Build the best decision and reply engine for incoming opportunities first."*

It serves two horizons: (1) Irving's own side-money operating system now; (2) a later SaaS for contractors/freelancers/local service businesses. **V1 scope = horizon 1 only.**

## 2. Non-Negotiable Guardrails (product-enforced, not just policy)

These are enforced by *architecture*, so the app cannot violate them even by accident:

1. **No scraping / crawling / auto-fetch of any third-party site.** In V1 the app makes **zero outbound network requests to lead sources.** It cannot fetch Facebook, Craigslist, job boards, or anything else. *(Any future RSS/API/email-forward ingestion is explicitly out of V1 and would require re-reviewing this invariant and the network allowlist before it ships — see §2.6 and §14.)*
2. **No automated email mining and no auto-DM / auto-send.** The app never logs into an inbox or any platform.
3. **Outreach is always manual.** The app drafts messages and offers copy-to-clipboard + `mailto:` / `sms:` deep links, but the user is the one who chooses to send. There is no send button that contacts a third party.
4. **The only outbound network call the app can ever make** is an *optional, off-by-default, user-initiated* "AI Enhance" request to the Anthropic API using **the user's own API key** that the user pastes into Settings. This is clearly labeled as sending the lead text to Anthropic. Default OFF. No key ships with the app.
5. **Allowed input channels only:** manual form entry, smart-paste of text the user personally copied (a post, or a Craigslist saved-search / Google Alert email the user forwarded to himself and pasted), and (future) RSS/API/email-forward that the *user* configures. Pasting text the user already has is not scraping.
6. **Hardened Content Security Policy + single audited network layer.** CSP meta tag covers *all* outbound and navigation surfaces, not just `fetch`:
   `default-src 'self'`; `connect-src 'self' https://api.anthropic.com`; `img-src 'self' data:`; `script-src 'self'`; `style-src 'self'`; `font-src 'self'`; `worker-src 'self'`; `object-src 'none'`; `frame-src 'none'`; `child-src 'none'`; `base-uri 'none'`; `form-action 'none'` (the app has no HTML form that posts to the network — all input is JS-handled into local storage). This closes the non-`fetch` paths Round 1 flagged: beacons, `<form>` posts, workers, iframes, `<base>` hijack.
   **All network access funnels through ONE module `js/engine/net.js`** — the only file in the codebase permitted to call `fetch`. It hard-codes the single allowed origin (`https://api.anthropic.com`) and throws on anything else. No other module may import `fetch`. The build-time guardrail audit (§13) greps the whole tree for `fetch(`, `XMLHttpRequest`, `navigator.sendBeacon`, `EventSource`, `WebSocket`, `import(` of remote URLs, and `<form action`, and asserts the only hit is inside `net.js`. `mailto:`/`sms:` are *user-initiated navigations*, not background sends, and are documented as such.
7. **All lead data stays on the device** (localStorage). Nothing is uploaded anywhere except the optional AI Enhance call above.

A short "Allowed sources" note renders in Settings so the rules are visible to the user, including the explicitly-avoided sources (automated Facebook collection, automated Craigslist collection, login bots, mass contact extraction).

## 3. Platform & Tech Stack (LOCKED)

- **Installable PWA**, mobile-first, offline-capable. Opens on the phone via browser → "Add to Home Screen" → runs full-screen like a native app.
- **Vanilla JS (ES modules) + plain CSS + HTML. No framework, no bundler, no build step.** Rationale: maximum portability (GitHub Pages, any static host, even local `http.server`), zero toolchain rot, trivially auditable, fast on a phone, and aligns with the html-artifact-builder / design-system skills. Karpathy "basics first": a multi-screen app does not need React to be excellent.
- **Persistence (revised per Round 1):** **IndexedDB is the primary datastore** for leads, raw text, history, generated drafts, and immutable sent-snapshots — chosen because it is async (no main-thread jank), has a far larger quota than localStorage, and is less prone to silent eviction on mobile. A thin promise-based wrapper `js/store.js` (one object store `leads`, keyed by `id`, plus a `meta` store for schema version) hides the IndexedDB API. **`localStorage` holds only tiny settings** (skills profile, weights, base rates, theme, the BYO key) — small, synchronous, fine. Both carry a schema `version` with a migration step on load.
- **Backup/restore is a first-class, transactional flow (Round 2 fix):** **Export** downloads JSON of leads+settings but **excludes `settings.ai.apiKey` by default** (the key is a billable secret; export must not become an exfiltration channel — restoring requires re-entering the key, or opting into a separate passphrase-encrypted key backup). **Import** stages into a temp object store, validates the *entire* payload (shape + schema version + size), and only then commits via a **single IndexedDB transaction / atomic swap** — so a crash or a repeated import can never leave the store half-written. Import is **idempotent**: every lead and every event carries a stable ID, so re-importing the same backup is a no-op, not a duplicator. **A pre-import / pre-migration backup is an EXTERNAL, verified artifact (Round 3 fix):** before any destructive import/replace OR schema upgrade, the app produces a **downloadable backup file** and verifies it parses back to the expected record count — so quota pressure or IndexedDB corruption during the operation cannot destroy the only rollback copy (an in-IDB-only backup could die with the primary data). Plus a one-tap "Backup now" on the dashboard when the last export is stale. A storage-health line warns on quota pressure or if IndexedDB is unavailable (private-mode fallback: degrade to in-memory + nag to export).
- **Concurrency (Round 2 + 4 fix):** the same origin can be open as a browser tab *and* the installed PWA simultaneously. A **single-writer lock** (Web Locks API, falling back to a BroadcastChannel election) serializes writes; every lead carries a `rev` counter for **optimistic compare-and-swap** (stale-base writes rejected → UI reloads). The lock record carries an **owner id + heartbeat timestamp**; a stuck owner (heartbeat stale > N s, e.g. a crashed/hung tab) can be **stolen after timeout**, and Diagnostics shows the current owner + heartbeat so contention is visible and breakable. Append-only events are written **in the same transaction** as the state change they record.
- **Storage-eviction detection (Round 4 fix):** a small **sentinel in localStorage** records expected lead/event counts + last-backup timestamp. On boot, if IndexedDB is empty/missing but the sentinel says data existed, the app raises a prominent **"your data may have been cleared by the browser — restore from backup"** banner instead of silently looking like a fresh install (mobile browsers can evict IndexedDB). `navigator.storage.persist()` is requested to reduce eviction risk.
- **Boot-safe failure screen + error ring buffer (Round 4 fix):** a top-level boot guard catches startup/migration/storage errors and renders a **minimal failure screen that does NOT depend on the app shell**, offering Export-backup / Restore / Unregister-SW / Clear-data. A persisted **error ring buffer** (last N errors + last-known-good `appVersion`/`dbSchemaVersion`) lives in localStorage so failures that prevent boot remain diagnosable.
- **No server, no database service, no accounts.** Single-user, single-device by design (manual export/import to move devices).
- **Service worker + caching strategy (Round 3 + 4 fix):** **network-first (or no-store) for entry documents** — `index.html`, `manifest.webmanifest`, and a tiny `version.json` — so a new deploy is picked up and a stale bootstrap can't be pinned; **cache-first only for content-hashed JS/CSS/icons** (immutable by hash). Cache name embeds build `appVersion`; old caches purge on `activate`. App data never goes over the network. SW `skip-waiting` only after the new shell passes a startup self-check.
- **Release-channel isolation (Round 5 fix):** preview and production must NOT share client state. Preview runs on a **separate origin** (localhost for dev, or a separate repo/Pages site for preview) — and as defense-in-depth, the **SW scope, IndexedDB database name, and all localStorage keys are namespaced by a `CHANNEL` constant** (`lor:prod:*` vs `lor:preview:*`). So even if served from a related origin, preview testing can never mutate or poison production's SW cache, DB, or settings.
- **Version-skew gates + live recheck (Round 3 + 4 + 5 fix):** the app records `appVersion`, `dbSchemaVersion`, and `settingsSchemaVersion`. Boot gates: DB schema newer than app → **read-only safe mode**; settings schema newer than app → back up + reset settings to defaults. **Beyond boot (Round 5):** schema/build generation is **broadcast to all open clients** (BroadcastChannel), and **every mutation re-checks the current schema generation before writing** — an already-open older tab/PWA that has fallen behind a newer build is immediately forced into read-only **"refresh required"** mode rather than issuing incompatible writes (no CAS churn / corruption during a rollout or rollback). A user-visible **"Update / Recover"** control resets the shell without touching lead data.
- **Schema upgrades are an explicit user-gesture maintenance flow (Round 5 fix):** migrations are **NOT auto-applied silently on boot** (creating + verifying a downloadable backup needs a user gesture and could fail mid-startup). Instead, when the app detects "migration needed," it shows a **maintenance screen** and stays **read-only** until the user taps **"Back up & upgrade"** — that gesture creates + verifies the external backup file, then runs the migration, then commits. If backup or migration fails, the app stays read-only on the old schema with the data intact.
- **Migration safety + upgrade matrix (Round 3 fix):** migrations run N-1 → N on load; the **previous schema stays readable until the new version passes startup checks**, then the upgrade commits. **Imports with a schema newer than the running app are rejected** with a clear message (never silently downgraded). Verification covers upgrade from N-1 and rollback N → N-1.
- **Hosting for "open on phone" (revised per Round 1):** PWA install + service worker require a **secure context (HTTPS)** on a phone — a plain `http.server` over a LAN IP will NOT install or run the SW on mobile. Therefore the **real V1 target is GitHub Pages** (free, HTTPS, install-capable); that is the phone path. Local `http.server` / `localhost` is treated as **desktop-development only** (browsers grant `localhost` a secure context, so SW works there for dev, but a phone hitting the dev machine's LAN IP over http will not). Full phone delivery = deploy to Pages (requires Irving's go — §13).

## 4. Data Model

**Two orthogonal axes (Round 1 fix — qualification vs workflow are separated):**
- **Qualification** ("should I pursue this?") = `analysis.grade` (A/B/C/D) + `analysis.recommendation`. Computed, lives in `analysis`.
- **Stage** ("where is this in my pipeline?") = the workflow position, used by the Kanban. These are the 8 user-requested columns. They no longer carry qualification meaning.

### Lead record (schema v1)
```
id            string (uuid-ish, stable — survives export/import for idempotency)
rev           int               (revision counter for optimistic compare-and-swap — Round 2 fix)
createdAt     ISO datetime (date found)
updatedAt     ISO datetime
source        enum: manual | paste | craigslist-alert | google-alert | referral | board | other
title         string
rawText       string            (the original post / email body — rendered as TEXT, never HTML)
location      string            (free text; used for proximity heuristic)
contact       object            (TYPED + validated — Round 2 fix): { type: email|phone|url|handle|none, value, raw }
                                // value is normalized+allowlisted; mailto:/sms: links built ONLY from value, never raw
category      enum: home-service | web | automation | app | design | other
urgency       enum: asap | this-week | flexible | unknown
budgetClue    string            (any $ or budget language found; free text)

stage         enum: new | reviewed | worth-replying | replied | follow-up | booked | lost | ignored   // pipeline/workflow only
followUpAt    ISO date | null    (when to follow up; powers "needs action")
lastContactedAt ISO datetime | null
nextAction    string             (free-text or templated next step)

pricingInputs object             (user-reviewable factors that drive pricing — see §6; pre-filled from analysis, editable)
fingerprint   string             (stable hash for dedupe — see below)

analysis      object  (see §5, computed)
pricing       object  (see §6, computed from pricingInputs, user-overridable)
messages      object  (see §7, generated drafts, regenerable)
fulfillment   array   (see §8, recommended paths, computed)
notes         string  (manual contact notes)
aiEnhanced    bool    (whether the optional AI pass was applied)
```

**Append-only events live in a SEPARATE store (Round 3 fix):** rather than unbounded arrays inside each lead (which make active leads write-hotspots — large transactions, long lock holds, big UI reloads on mobile), history + sent-snapshots are rows in a dedicated IndexedDB `events` object store, keyed by `eventId`, **indexed by `leadId`**, read **paginated** (newest-first, capped per render). Each event: `{eventId, idempotencyKey, leadId, kind: stage-change|snapshot, at, ...payload}`, dedup-on-write and on-import by `idempotencyKey`. The lead's timeline reads the latest page from this store; the lead record itself stays small.

**Dedupe (Round 1 fix):** `fingerprint = hash(normalize(title) + normalize(first ~120 chars of rawText) + normalize(contactMethod))`. On add/paste, if an existing lead shares the fingerprint (or a high text-similarity match), the app shows a **"possible duplicate"** prompt offering: open existing / merge into existing (appends rawText + keeps both contacts, preserves history & snapshots) / save as new anyway. This stops the inbox and pipeline from fragmenting one opportunity into many.

### Settings record
```
schemaVersion       int
skillsProfile        { homeService:bool, web:bool, automation:bool, app:bool, design:bool, customSkills:[string] }
serviceArea          { homeBase:string, nearbyKeywords:[string] }   // proximity heuristic
keywords             { highValue:[string], skip:[string] }
baseRates            map category -> { floor, standard, stretch }    // seeded, editable
weights              map scoreDimension -> number                    // editable, defaults provided
ai                   { enabled:bool=false, apiKey:string="", model:string }
theme                enum: system | light | dark
}
```

## 5. Analysis & Lead Scoring (deterministic, explainable)

A pure function `score(lead, settings) -> analysis`. **Deterministic** (no randomness) so results are reproducible and explainable. Seven dimensions, each scored 0–100, then a weighted blend → overall 0–100 → grade.

| Dimension | Signal (heuristic) |
|---|---|
| proximity | location text matched against `serviceArea` (home base + nearby keywords); unknown = neutral midpoint, not zero |
| urgency | `urgency` enum + urgency words in rawText (asap/today/urgent/emergency) |
| budgetSignal | $ amounts / budget language parsed from rawText + budgetClue |
| skillsMatch | category + keyword overlap vs `skillsProfile` |
| easeOfClosing | contact method directness, clarity of ask, single-decision-maker cues |
| repeatPotential | recurring-work cues (monthly, ongoing, maintenance, retainer) |
| portfolioValue | category prestige + "showcase-able" cues |

Output:
```
analysis = {
  summary:        string   (1-2 sentence plain-language summary, template-built from parsed fields)
  serviceType:    string
  fitScore:       int 0-100
  grade:          A | B | C | D
  difficulty:     low | medium | high
  turnaround:     string   (rough estimate band)
  riskNotes:      [string]
  recommendation: enum (reply-now | reply-if-slow | low-value-skip | good-fit-low-budget | high-fit-premium)
  worthReplying:  bool
  dimensions:     map dimension -> { value:0-100, why:string }   // explainability: every score shows its reason
}
```
Grade bands: A ≥ 78, B ≥ 60, C ≥ 42, else D (bands editable later; fixed for V1). Recommendation derives from grade × budgetSignal × skillsMatch via a small decision table. **Every dimension carries a `why` string** so the user can see *why* a lead scored as it did and correct the inputs.

## 6. Pricing Engine (framework-based, not random)

Pure function `price(lead, analysis, settings) -> pricing`. Starts from the category's `baseRates` (seeded below, editable in Settings), then applies multipliers from **structured, user-reviewable `pricingInputs`** (Round 1 fix — these factors are now real fields on the lead, not vibes). `pricingInputs` is pre-filled from analysis on first compute, then editable by the user; every override persists and re-pricing respects it.

```
pricingInputs = {
  timeRequired:   quick | half-day | multi-day | project   // pre-filled from analysis.difficulty
  complexity:     low | medium | high                       // pre-filled from analysis.difficulty
  businessValue:  low | medium | high                       // pre-filled from category + budgetSignal
  recurring:      bool                                       // pre-filled from analysis repeatPotential
  productizable:  bool                                       // pre-filled from category
}
```
Because the factors are explicit fields the user can see and adjust, the price stays **explainable** (the rationale string cites which factors moved the number).

Seed base rates (editable):
- web (website fix): 250 / 450 / 800
- automation (automation setup): 300 / 750 / 1500
- app (custom small internal tool): 1500 / 3500 / 7500
- home-service: 120 / 250 / 600
- design: 150 / 400 / 900
- other: 150 / 400 / 1000

Factors (each nudges the multiplier): urgency, time required (from difficulty), complexity, business value, one-time vs recurring, productizable. Output:
```
pricing = {
  model:      flat | hourly | retainer | milestone   (recommended)
  floor:      number
  standard:   number
  stretch:    number
  rationale:  string         (why this price makes sense)
  included:   [string]
  excluded:   [string]
  userOverride: bool
}
```
User can override any number; override is persisted and never recomputed over.

## 7. Message Generator

Pure function `messages(lead, analysis, pricing, settings) -> messages`. Slot-based, lead-specific. Slots: opener (built from their exact stated need), credibility (1 line from skillsProfile), solution (plain), optional next step, non-pushy CTA.

```
messages = {
  tone:            casual | professional | local-friendly   (selectable; default from category)
  first_short:     string
  first_normal:    string
  first_premium:   string
  follow_up:       string
  platform_safe:   string   (no AI-keyword language; safe for 3rd-party platforms per external-framing)
  email_version:   string   (with subject line)
  text_version:    string   (SMS-length)
}
```
The platform-safe / external versions never mention AI, automation-by-AI, or model names (reuses the external-framing rule). Each variant has **copy-to-clipboard**; email has a `mailto:` link, text has an `sms:` link — these *prepare* the message; the user sends.

**Safe deep links (Round 2 fix):** `mailto:`/`sms:` links are built **only from `lead.contact.value`** after normalization + allowlisting (valid email or E.164-ish phone), with subject/body passed as properly `encodeURIComponent`-escaped params. The untrusted `contact.raw` is never used to build a link. This blocks header/recipient/param injection (extra `?cc=`, `&bcc=`, alternate schemes) via a crafted lead. Invalid/unknown contact types show "copy message + contact manually" instead of a link.

**Immutable sent-snapshots (Round 1 + 2 fix):** the generated drafts in `messages` are regenerable. The moment the user **copies** a variant or **launches** a `mailto:`/`sms:` link, the app appends a frozen entry to `lead.sentSnapshots` `{eventId, idempotencyKey, at, channel, tone, variant, text}` **in the same transaction** as any state change, with **dedup-on-write** keyed by `idempotencyKey` (double-taps / resumed intents do not create duplicate timeline entries). Snapshots are append-only and shown in the detail timeline. (Copy/launch is still a *manual user action* — this does not auto-send.)

## 8. Fulfillment Recommender ("Ways To Get It Done")

Pure function `fulfillment(lead, analysis, settings) -> paths[]`. Six candidate paths, each rated; filtered/ranked by category + difficulty.

Paths: `manual`, `no-code`, `ai-assisted-coding`, `automation`, `full-custom-app`, `referral-subcontract`.
Each: `{ path, speed, difficulty, likelyProfit, deliveryRisk, note }`. Ranked best-first with a one-line "why this path."

## 9. Screens (mobile-first, bottom nav)

1. **Dashboard** — counts by grade + by stage, **"needs action" list driven by structured fields** (stage `new`, or `analysis.recommendation` is reply-now/high-fit, or `followUpAt` is due/overdue), quick "Add lead" FAB, A/B/C/D snapshot, and a "Backup now" nudge when the last export is stale.
2. **Lead Inbox** — filterable/sortable list (by grade, status, source, category, date), search, status chips. Tap → detail.
3. **Lead Detail** — the core screen. Sections: raw post (as text), AI summary + fit score + grade with per-dimension explainability, recommended action, message generator (tone toggle + variants + copy), pricing generator (editable `pricingInputs` + floor/standard/stretch + rationale + override), fulfillment options, manual contact notes, `followUpAt`/`nextAction` controls, and a **timeline** merging stage-history + immutable sent-snapshots. Optional "AI Enhance" button (only if enabled in Settings).
4. **Add / Smart-Paste** — two modes: structured form, or paste-a-blob → parse → review extracted fields → save. Source picker including Craigslist-alert / Google-Alert which run the specific text parsers.
5. **Pipeline** — Kanban board across the 8 **stages** (workflow only, not qualification); tap-to-move on mobile (drag on desktop) between columns; `history` updated on move, `lastContactedAt` set when entering `replied`, `followUpAt` prompted when entering `follow-up`. Cards show grade chip so qualification is still visible without conflating the two axes.
6. **Settings** — skills profile, service area, keywords (high-value / skip), base rates, score weights, theme, AI key (off by default, with the privacy warning), feature flags (risky subsystems default-off, §13), allowed-sources reference note, export / import / clear-data.
7. **Settings → Diagnostics (Round 3 + 4 fix)** — shows `appVersion`/`dbSchemaVersion`/`settingsSchemaVersion`, last-known-good versions, active cache/SW version + `version.json` build, storage headroom (`storage.estimate()`), **write-lock owner + heartbeat**, parser-confidence failure count, last-backup freshness, recent AI failures, and the **error ring buffer**. **Runtime feature-flag toggles** (turn a shipped subsystem off without redeploy). Recovery **escape hatches**: "Export debug bundle", "Backup now", "Restore previous backup", "Force-release lock", "Unregister SW + reload", "Clear data" (guarded). The same actions are reachable from the **boot-safe failure screen** if the app can't fully start.

Navigation: persistent bottom nav (Dashboard · Inbox · Add · Pipeline · Settings). Add is a center FAB-style action.

## 10. Smart-Paste Parsers

- **Generic paste:** detect title (first strong line), location (city/zip/neighborhood patterns), contact (email/phone/url regex), budget ($ patterns), urgency words, category (keyword classifier). User reviews before save.
- **Craigslist saved-search alert email (pasted text):** parse the listing blocks (title, area in parens, posting body, reply link) from the *pasted email body the user forwarded to himself.* No fetching.
- **Google Alert email (pasted text):** parse the result blocks (title, snippet, source link).
- All parsers operate purely on pasted text. They never open a URL. Parsed links are shown as plain text the user can tap manually.
- **Parser confidence + failure states (Round 1 fix):** Craigslist/Google-Alert email layouts change over time, so each parser returns `{fields, confidence: high|low, perFieldConfidence}`. The **manual field-review screen is always the path** — parsing only *pre-fills* it. Low confidence (or a layout the parser doesn't recognize) shows a clear "couldn't auto-read this — please check the fields" banner and falls back to the generic parser, never a silent/opaque failure. The user confirms every field before save.
- **Size caps (Round 2 fix):** hard per-field caps (e.g. rawText ≤ 64 KB, each short field ≤ 2 KB) and a per-import file cap (e.g. ≤ 10 MB), with a storage-quota preflight (`navigator.storage.estimate()`) before any large write. Oversize paste/import is rejected *before* parsing/writing with a clear message — a giant blob can't exhaust memory/quota mid-operation and leave recovery to guesswork.

## 11. Security & Privacy

- Untrusted text (rawText, notes, parsed fields) is **always rendered with `textContent`, never `innerHTML`.** No template injection. A single `safeText`/`el()` helper is the only DOM-write path for dynamic content.
- CSP meta tag locks the full network/navigation surface (see §2.6); all `fetch` funnels through `net.js`.
- **Deep-link safety:** `mailto:`/`sms:` built only from normalized+allowlisted `contact.value` with encoded params — no header/recipient injection (§7).
- **Secret handling:** API key in localStorage (not IndexedDB export set). Settings warns the key is device-readable and that enabling AI sends lead text to Anthropic. Key field masked; "test key" makes one minimal call. **Standard export/import excludes the key** (§3) — restore re-prompts for it.
- **Transactional, idempotent import** with a pre-import auto-backup and atomic commit; never partially applied; re-import is a no-op via stable IDs (§3).
- **Concurrency-safe writes:** single-writer lock + per-lead `rev` compare-and-swap; append-only events written in the same transaction (§3).
- **Event idempotency:** every history/snapshot entry has `eventId` + `idempotencyKey`, dedup-on-write and on-import (§4, §7).
- **Size caps + quota preflight** before large writes (§10).
- No secrets in the repo. No analytics. No external fonts/CDNs (system font stack) so CSP stays tight and the app works offline.

## 12. Design System (clean / open / minimal — "impeccable")

Locked via the `design-system-constraints` skill (linear-minimal base, adapted "open" airy spacing):
- **Type:** system font stack (San Francisco / Segoe / Roboto) — crisp, native, zero network. Clear type scale.
- **Color:** near-monochrome neutral surface + one restrained accent; full light + dark via `prefers-color-scheme` and a manual toggle. WCAG AA contrast.
- **Layout:** generous whitespace, 8px spacing grid, card-based, max content width on large screens, thumb-reachable controls, ≥44px tap targets.
- **Motion:** subtle, fast (≤150ms), respects `prefers-reduced-motion`.
- **Components:** button, chip/tag, card, list-row, segmented control (tone/grade), bottom-nav, modal/sheet, toast, score ring/bar, kanban column/card, form controls.
- Accessibility: semantic HTML, labelled controls, focus-visible, keyboard usable, aria for nav and status; passes a frontend-quality-review "experience" pass with Playwright screenshots at phone + desktop widths.

## 13. Build Order & Verification

**Phase 1 (this build, core):** schema + store + design tokens → analysis/pricing/message/fulfillment engines (pure, unit-checkable) → screens (dashboard, inbox, detail, add, pipeline, settings) → PWA shell (manifest, SW, icons) → seed sample leads.
**Phase 2 (this build, included):** smart-paste + Craigslist/Google-Alert text parsers, score weights + base rates editable, export/import.
**Phase 3 (stubs/docs):** per-category playbooks, follow-up reminders, win-rate analytics — scaffolded as a documented "next" section, not fully built.

**Verification:**
- Pure engines: a tiny in-repo test harness (`tests/engine.test.mjs`, run with `node`) asserts deterministic scoring/pricing on fixture leads (≥6 fixtures incl. empty/garbage input).
- UI: served locally, driven with Playwright — screenshots at 390px (phone) and 1280px (desktop), light + dark; verify all 6 screens render, add-lead flow works, score/price/message generate, pipeline move persists, reload restores from storage, export/import round-trips.
- frontend-quality-review (experience mode) → SHIP/FIX verdict before "done."
- Guardrail audit (automated, part of `tests/`): grep the whole tree for `fetch(`, `XMLHttpRequest`, `sendBeacon`, `EventSource`, `WebSocket`, remote `import(`, and `<form action` → the ONLY permitted network hit is inside `js/engine/net.js` (hard-coded to `api.anthropic.com`); assert CSP meta present with all §2.6 directives. Fails the build if violated.
- Data-integrity checks: import is transactional + idempotent (re-import = no-op); newer-schema import rejected; migration N-1 → N applies and N → N-1 rollback is survivable (read-only safe mode); export excludes the API key; event dedup-on-write holds under double-tap.
- Large-dataset soak: seed ~2k leads + events; confirm inbox list, scroll, scoring, and pipeline stay responsive (paginated event reads).

**Deploy (phone delivery path, Round 1 fix):** PWA install + SW on a phone require HTTPS, so the real target is **GitHub Pages** (free, HTTPS). Prepare a git repo (`git init` inside the project folder, separate from the vault) + Pages config + correct relative paths/`start_url`/`scope` for a project-page subpath. **Pushing to a public repo/Pages requires Irving's explicit go** (standing-auth: publish/public). For desktop development before deploy, run from `localhost` (a secure context, so SW/install work for dev); a phone hitting the dev box's LAN IP over http will NOT install — that's expected and documented.

**Release staging — right-sized for single-user (Round 3 + 4, scaled down):** ladder is `localhost (dev) → optional preview branch on Pages → production Pages`. Risky subsystems (Craigslist/Google-Alert parsers, AI Enhance) ship behind feature flags whose **defaults live in `js/config.js` but are overridable at RUNTIME** via Settings/Diagnostics and persisted in localStorage — so an already-shipped subsystem can be turned OFF without a redeploy (Round 4 fix; static-only flags could not). **Promotion gates (concrete):** before promoting preview → production, the engine tests + guardrail audit + a smoke pass of add-lead/score/message/pricing/pipeline must be green, and the build must show 0 unhandled errors across a real-lead soak. **Abort/revert trigger:** any guardrail-audit failure, any data-integrity test failure, or repeated parser/AI failures → disable the flag (runtime) and/or roll back the Pages deploy. (Full canary/cohort infrastructure is intentionally NOT built — this is a personal single-user tool.)

**Client rollback (Round 4 fix):** because `unregister SW + reload` only re-fetches the *current* Pages deploy, real rollback is a **documented Pages procedure**: each production deploy is tagged; rolling back = re-publishing the previous tagged build (revert the Pages publish / `git revert` + redeploy). `version.json` (network-first) lets the running app display which build it's on so a bad build is identifiable. Combined with runtime flags, most bad-subsystem incidents are recoverable without a redeploy; a fully bad shell is recovered by republishing the last-good tag.

**Operator recovery runbook (Round 3 + 4 fix):** `docs/RUNBOOK.md` lists each likely incident as symptom → action → expected result: stale SW cache → "Unregister SW + reload" (network-first HTML means new deploy is picked up); **stuck writer lock across tab + installed PWA → close the other client, or use Diagnostics "force-release lock" (steal-after-timeout); runbook spells out tab-vs-installed-app steps**; failed migration → app stays in read-only safe mode → "Restore previous backup"; suspected storage eviction (data-loss banner) → "Restore previous backup"; quota exhaustion → export + prune; bad production build → republish last-good tag (above). Boot failure → boot-safe failure screen actions.

**Capacity envelope + degraded mode (Round 3 + 5 fix):** **supported envelope = what is actually soaked: ~2,000 leads** (and their events). Verification soaks 2k leads and confirms list/scroll/score/pipeline stay responsive. **Degraded behaviors** when limits are approached: lead/event counts are **lazy/cached recounts** (not full scans on every render), timeline hydration is **capped/paginated** (newest page only), and the app shows a **maintenance-mode suggestion** ("export + archive old leads") when startup latency, migration time, or storage usage cross defined thresholds (below). Hard retention/compaction is offered as a manual "archive booked/lost older than N months" action rather than auto-deletion.

**Concrete abort/maintenance thresholds (Round 5 fix) — mapped to actions in `docs/RUNBOOK.md`:**
| Signal | Threshold | Action |
|---|---|---|
| Parser confidence failures | ≥3 in a session OR layout unrecognized | flag-off the specific parser (runtime), fall back to generic paste |
| AI Enhance failures | ≥2 consecutive | disable AI Enhance (runtime), surface error in Diagnostics |
| Writer-lock contention | heartbeat stale > 15 s | offer "force-release lock" |
| Storage headroom | < 10 MB free (`storage.estimate`) | block large writes, prompt export + archive |
| Migration time | > 5 s or any failure | stay read-only on old schema, "Restore previous backup" |
| Startup latency | > 3 s sustained | show maintenance-mode suggestion (archive old leads) |

**Release-drill gate (Round 5 fix, documented):** before relying on production rollback, run the drill once: install the PWA on a phone, deploy build N, roll back to N-1 by republishing the last-good tag, and confirm an open + a backgrounded client both recover via the runbook steps. Documented in `docs/RUNBOOK.md` as a one-time pre-trust checklist (not automated — single-user).

## 14. Out of Scope (V1, YAGNI)

Multi-user/accounts, cloud sync, any server, automated ingestion of any kind, real-time source polling, payments, the SaaS multi-tenant version, push notifications (Phase 3+), native app-store builds.

## 15. Success Criteria

- Opens on Irving's phone, installable, works offline.
- Add a lead (form or paste) → get summary, A–D grade with explainable dimensions, recommended action, 3-tone messages, floor/standard/stretch pricing with rationale, ranked fulfillment paths — in seconds, with zero network by default.
- Pipeline tracks a lead new → booked/lost.
- No code path can scrape, auto-fetch a lead source, or auto-send. CSP + code audit prove it.
- Look is clean, open, minimal, and passes the frontend quality review at phone + desktop.
- All data local; export/import works; nothing leaks except the explicit, opt-in AI Enhance.

## Changelog

### Round 1 (senior-engineer) — 3 high, 4 medium, 1 low — ALL ACCEPTED
- **[H] HTTPS for phone PWA:** local `http.server` over LAN is desktop-dev only; phone install/SW needs HTTPS → GitHub Pages is the real V1 phone target (§3, §13). Accepted.
- **[H] Storage brittleness:** moved primary datastore from localStorage → **IndexedDB** (leads, raw text, history, snapshots); localStorage now holds only tiny settings; backup/restore promoted to a first-class flow (§3, §4). Accepted.
- **[H] Guardrail overstatement:** narrowed the "zero lead-source network" invariant to V1; hardened CSP to cover forms/beacons/workers/iframes/base; added a **single audited network module `net.js`** as the only fetch site; broadened the build audit to all network/navigation surfaces (§2.1, §2.6, §13). Accepted.
- **[M] Status model conflation:** split **qualification** (`analysis.grade` + recommendation) from **stage** (the 8 Kanban columns, workflow only); added `followUpAt`, `lastContactedAt`, `nextAction` (§4, §9). Accepted — kept the user's 8 statuses as `stage`, moved qualification onto grade.
- **[M] Pricing inputs not captured:** added structured, user-reviewable `pricingInputs` (timeRequired, complexity, businessValue, recurring, productizable) pre-filled then editable, keeping pricing explainable (§4, §6). Accepted.
- **[M] No dedupe:** added a stable `fingerprint` + "possible duplicate" review flow (open/merge/save-new) (§4). Accepted.
- **[M] No sent-record:** added immutable `sentSnapshots` captured on copy/launch, shown in the detail timeline (§4, §7). Accepted.
- **[L] Parser fragility:** parsers now return confidence + per-field confidence; manual field-review is always the path; low confidence → clear banner + generic fallback, never silent failure (§10). Accepted.

### Round 2 (security & data-integrity) — 2 high, 3 medium, 1 low — ALL ACCEPTED
- **[H] Import not transactional:** import now stages in a temp store, validates fully, commits in one IndexedDB transaction/atomic swap, takes a pre-import auto-backup, and is idempotent via stable IDs (§3, §11). Accepted.
- **[H] No concurrency strategy:** added single-writer lock (Web Locks → BroadcastChannel fallback) + per-lead `rev` compare-and-swap; append-only events in same transaction (§3, §4, §11). Accepted.
- **[M] mailto/sms injection:** `contact` is now typed + normalized + allowlisted; deep links built only from normalized value with encoded params (§4, §7, §11). Accepted.
- **[M] API key in export:** standard export/import now excludes `settings.ai.apiKey`; restore re-prompts; optional passphrase-encrypted key backup (§3, §11). Accepted.
- **[M] Audit-log dup risk:** every history/snapshot entry carries `eventId` + `idempotencyKey`, dedup-on-write and on-import (§4, §7, §11). Accepted.
- **[L] No size caps:** added per-field + per-import size caps and a storage-quota preflight before large writes (§10, §11). Accepted.

> Process note: round 2 was re-run after the first attempt's Codex process was cut off mid-review (turn ended before the runner finished). State was rolled back to round 2 and the review re-run in the foreground to completion.

### Round 3 (ops & SRE) — 2 high, 6 medium, 1 low — ALL ACCEPTED (2 right-sized for single-user)
- **[H] SW/migration version-skew:** added content-hashed assets, `appVersion`/`dbSchemaVersion` compatibility gate, read-only safe mode on newer-DB, and an "Update/Recover" escape hatch that resets the shell without touching data (§3, §9.7). Accepted.
- **[H] Rollback artifact fragility:** pre-import/pre-migration backup is now an EXTERNAL downloadable + verified file; previous schema stays readable until the upgrade passes startup checks (§3). Accepted.
- **[M] No staged rollout:** added default-off feature flags in `js/config.js` + localhost→preview→prod ladder; full canary infra intentionally NOT built (single-user) (§13). Accepted, right-sized.
- **[M] No observability:** added Settings → Diagnostics view + exportable debug bundle (versions, storage headroom, lock state, parser failures, backup freshness, AI failures) (§9.7). Accepted.
- **[M] Upgrade matrix underspecified:** defined N-1→N migration, reject newer-schema imports, keep a backward-compatible reader, test N-1 upgrade + N→N-1 rollback (§3, §13). Accepted.
- **[M] Unbounded event arrays:** moved history + sentSnapshots into a separate indexed `events` store with paginated reads (§4). Accepted.
- **[M] No recovery runbook/escape hatches:** added `docs/RUNBOOK.md` + Diagnostics recovery actions (unregister SW, restore backup, clear data) (§9.7, §13). Accepted.
- **[L] Capacity planning:** documented operating envelope (~few-thousand leads) + large-dataset perf soak in verification; hard retention deferred until usage approaches envelope (§13). Accepted, right-sized.

### Round 4 (ops & SRE, deeper) — 2 high, 5 medium, 0 low — ALL ACCEPTED (rollback right-sized)
- **[H] No real client rollback:** feature flags are now RUNTIME-overridable (off without redeploy); real shell rollback is a documented "republish last-good tag" Pages procedure; `version.json` exposes the running build (§13, §3). Accepted, right-sized (no in-app multi-build switcher).
- **[H] Entry-doc caching:** SW is now network-first for `index.html`/manifest/`version.json`, cache-first only for content-hashed assets (§3). Accepted.
- **[M] No promotion/abort criteria:** defined concrete promotion gates (tests + guardrail + smoke green, 0 unhandled errors) and abort/revert triggers (§13). Accepted.
- **[M] Boot-dependent observability:** added a boot-safe failure screen + persisted error ring buffer with last-known-good versions, independent of the app shell (§3, §9.7). Accepted.
- **[M] Settings version-skew:** added a separate `settingsSchemaVersion` gate with safe backup+reset (§3). Accepted.
- **[M] Lock recovery too optimistic:** lock now has owner+heartbeat, steal-after-timeout, Diagnostics visibility + "force-release", and tab-vs-app runbook steps (§3, §9.7, §13). Accepted.
- **[M] Silent data loss:** added a localStorage sentinel (expected counts + last backup) + a prominent data-loss banner when IDB unexpectedly empties; request `storage.persist()` (§3). Accepted.

### Round 5 (ops & SRE, final) — 3 high, 3 medium, 0 low — ALL ACCEPTED (preview-isolation + capacity right-sized)
- **[H] Preview/prod shared state:** preview now requires a separate origin AND channel-namespaced SW scope / DB name / localStorage keys (`lor:prod:*` vs `lor:preview:*`) so preview can't poison production (§3). Accepted.
- **[H] Version-skew only on boot:** schema/build generation is broadcast to all clients and re-checked before every mutation; stale open clients are forced into read-only "refresh required" (§3). Accepted.
- **[H] Backup-during-auto-migration fragile:** schema upgrades are now an explicit user-gesture "Back up & upgrade" maintenance flow; read-only until the verified external backup + migration succeed; never silent auto-migrate on boot (§3). Accepted.
- **[M] Installed-PWA rollback untested:** added a one-time release-drill checklist (install on phone, deploy N, roll back to N-1, prove open + backgrounded clients recover) to RUNBOOK (§13). Accepted, documented.
- **[M] Vague abort triggers:** added a concrete thresholds table (parser/AI/lock/storage/migration/startup) mapped to prescribed actions (§13). Accepted.
- **[M] Capacity overclaim:** supported envelope lowered to the soaked ~2k leads; added degraded-mode behaviors (lazy recounts, capped timeline hydration, maintenance-mode trigger) (§13). Accepted.

---

## Review Summary

**5 adversarial Codex rounds complete — 32 material findings, ALL absorbed** (9 high, 19 medium, 4 low; round angles: senior-eng → security/data-integrity → ops/SRE ×3). Two ops items (full canary infra, hard capacity ceilings) were deliberately **right-sized** for a single-user personal tool rather than rejected. The plan is now build-ready: clean offline-first PWA, IndexedDB with transactional/idempotent import + external verified backups + version-skew + storage-eviction detection + concurrency safety, deterministic explainable scoring/pricing/messaging/fulfillment engines, hardened single-network-module guardrails (no scraping / no auto-send by construction), and an operational Diagnostics + recovery surface — proportionate to the actual user and risk.
