/* Build + channel config. Channel namespacing (PLAN.md §3, Round 5 fix) keeps preview
   and production from ever sharing SW cache / IndexedDB / localStorage. */
export const CHANNEL = "prod"; // 'prod' | 'preview' — preview MUST also be a separate origin
export const APP_VERSION = "1.0.0";
export const DB_SCHEMA_VERSION = 1;
export const SETTINGS_SCHEMA_VERSION = 1;

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
  aiEnhance: false, // the network-touching feature is OFF by default
};

/* Hard caps (PLAN.md §10, Round 2 fix) */
export const LIMITS = {
  rawTextBytes: 64 * 1024,
  shortFieldBytes: 2 * 1024,
  importBytes: 10 * 1024 * 1024,
  minFreeBytes: 10 * 1024 * 1024, // warn/block large writes under this
  lockHeartbeatStaleMs: 15000,
};
