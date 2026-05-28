/* Build + channel config. Channel namespacing (PLAN.md §3, Round 5 fix) keeps preview
   and production from ever sharing SW cache / IndexedDB / localStorage. */
export const CHANNEL = "prod"; // 'prod' | 'preview' — preview MUST also be a separate origin
export const APP_VERSION = "1.3.1";
export const DB_SCHEMA_VERSION = 3;
export const SETTINGS_SCHEMA_VERSION = 2;

/* Ingestion (PLAN: Actions pipeline → same-origin feed.json → PWA). */
export const INGEST = {
  feedPath: "feed.json",            // same-origin static feed produced by the scheduled Action
  throttleMs: 3 * 60 * 60 * 1000,   // auto-refresh at most every 3h on boot
  maxRecords: 1000,                 // cap feed size we will ingest in one pass
};

const ns = (k) => `lor:${CHANNEL}:${k}`;
export const DB_NAME = `lor-${CHANNEL}`;
export const SETTINGS_KEY = ns("settings");
export const SENTINEL_KEY = ns("sentinel");
export const ERR_KEY = ns("errlog");          // keep in sync with boot.js RING_KEY
export const FLAGS_KEY = ns("flags");
export const SW_SCOPE = "./";

/* Runtime-overridable feature flags (PLAN.md §13, Round 4 fix). Defaults here; user can
   toggle at runtime in Settings → Diagnostics; overrides persist in localStorage. */
export const FLAG_DEFAULTS = {
  parserCraigslist: true,
  parserGoogleAlert: true,
  aiEnhance: false,       // the network-touching feature is OFF by default
  feedIngest: true,       // pull the same-origin feed.json produced by the scheduled Action
  googleSearch: false,    // on-device Google Custom Search (needs BYO key) — OFF by default
};

// Origins the single audited network module (net.js) is allowed to reach. No scraping: official APIs only.
export const NET_ALLOWLIST = ["https://api.anthropic.com", "https://www.googleapis.com"];

/* Hard caps (PLAN.md §10, Round 2 fix) */
export const LIMITS = {
  rawTextBytes: 64 * 1024,
  shortFieldBytes: 2 * 1024,
  importBytes: 10 * 1024 * 1024,
  minFreeBytes: 10 * 1024 * 1024, // warn/block large writes under this
  lockHeartbeatStaleMs: 15000,
};
