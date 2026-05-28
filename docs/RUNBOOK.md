# Operator Runbook — Local Opportunity Radar

Recovery procedures for the likely incidents. Most actions live in **Settings → Diagnostics** or on the **boot-safe recovery screen** (shown automatically if the app can't start). Each entry: symptom → action → expected result.

## Incidents

| Symptom | Action | Expected result |
|---|---|---|
| App shows a stale version after a deploy | Reload (the service worker is network-first for `index.html`/`version.json`). If still stale: Diagnostics → **Clear app cache & reload** | New build loads; lead data untouched |
| App won't start (boot-safe "Recovery mode" screen) | Tap **Export backup** first, then **Clear app cache & reload**, then **Try again** | App restarts; if not, restore from the exported backup |
| "Read-only safe mode" banner | Your data is from a newer app version than this shell. **Export backup**, then update/redeploy the app to the latest build | Newer shell migrates and returns to read-write |
| "Your data may have been cleared" banner | The browser evicted local storage. Settings → **Import backup** and pick your latest export | Leads restored |
| Stuck write lock (rare, tab + installed app both open) | Close the other window, or Diagnostics → **Force-release lock (reload)** | Writes work again |
| Failed migration | App stays read-only on the old schema; Diagnostics → **Restore previous backup** | Data intact on old schema |
| Storage almost full | Settings → **Export backup**, then archive old booked/lost leads (move them to those stages and delete if desired) | Headroom restored |
| A parser misreads alert emails after a layout change | Diagnostics → turn the parser flag **off** (falls back to generic paste); always review fields before saving | No silent bad data |
| AI Enhance failing | Diagnostics → turn **aiEnhance** off, or fix the key in Settings; everything else works offline without it | App fully usable |

## Bad production build → rollback

`Clear app cache & reload` only re-fetches the *current* deploy. To truly roll back:
1. Each production deploy should be a tagged commit.
2. Roll back = re-publish the previous good tag (revert the Pages publish / `git revert` + redeploy).
3. `version.json` (shown in Diagnostics) tells you which build is running.
4. For a bad *subsystem* (not the whole shell), prefer turning its feature flag off at runtime (Diagnostics) — no redeploy needed.

## Promotion gates (preview → production)
Before promoting a new build:
- `node tests/engine.test.mjs` green
- `node tests/guardrail-audit.mjs` green
- smoke pass: add a lead, see score/message/price, move it in the pipeline, reload (data persists), export/import round-trips
- 0 unhandled errors in Diagnostics after a short real-lead soak

Abort/revert trigger: any guardrail or data-integrity failure, or repeated parser/AI errors → flag off and/or roll back.

## One-time release drill (do before trusting rollback)
Install the PWA on a phone, deploy build N, roll back to N-1 by re-publishing the previous tag, and confirm an open tab and a backgrounded install both recover using the steps above.

## Thresholds (mapped from the spec)
- Parser confidence failures ≥3/session or unrecognized layout → flag off that parser
- AI failures ≥2 consecutive → disable AI Enhance
- Write-lock heartbeat stale >15s → offer force-release
- Storage headroom <10 MB → block large writes, prompt export + archive
- Migration >5s or any failure → stay read-only, restore backup
- Startup latency >3s sustained → maintenance-mode suggestion (archive old leads)
