import {
  DB_NAME, DB_SCHEMA_VERSION, SETTINGS_KEY, SETTINGS_SCHEMA_VERSION,
  SENTINEL_KEY, FLAGS_KEY, ERR_KEY, FLAG_DEFAULTS, APP_VERSION, LIMITS,
} from "./config.js";
import { defaultSettings, newLead, validateImport } from "./schema.js";
import { uid, nowISO } from "./util.js";

let _db = null;
export const state = { safeMode: false, safeReason: "", dataLoss: false, settingsReset: false };

/* ---------- IndexedDB open + version-skew gate (PLAN.md §3) ---------- */
export function openDB() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_SCHEMA_VERSION); }
    catch (e) { return reject(e); }
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("leads")) db.createObjectStore("leads", { keyPath: "id" });
      if (!db.objectStoreNames.contains("events")) {
        const es = db.createObjectStore("events", { keyPath: "eventId" });
        es.createIndex("byLead", "leadId", { unique: false });
        es.createIndex("byIdem", "idempotencyKey", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => {/* another tab holds an older connection */};
  });
}

/* If the on-disk DB is NEWER than this build, indexedDB.open(lowerVersion) throws VersionError.
   Catch it → read-only safe mode (don't migrate data we don't understand). */
export async function initDB() {
  try {
    await openDB();
  } catch (e) {
    if (e && (e.name === "VersionError")) {
      state.safeMode = true;
      state.safeReason = "Your saved data is from a newer version of the app. Running read-only until you update. Use Export to back up.";
      // open without a version to read existing data read-only
      _db = await new Promise((res, rej) => { const r = indexedDB.open(DB_NAME); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    } else {
      throw e;
    }
  }
  return _db;
}

function tx(stores, mode) { return _db.transaction(stores, mode); }
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/* ---------- Single-writer lock (PLAN.md §3, Round 2/4) ---------- */
let _memChain = Promise.resolve();
export async function withWriteLock(fn) {
  if (state.safeMode) throw new Error("Read-only safe mode: writes are disabled.");
  if (navigator.locks && navigator.locks.request) {
    return navigator.locks.request("lor-writer", { mode: "exclusive" }, async () => fn());
  }
  // Fallback single-tab serialization
  const run = _memChain.then(fn, fn);
  _memChain = run.catch(() => {});
  return run;
}

export async function lockInfo() {
  try {
    if (navigator.locks && navigator.locks.query) {
      const q = await navigator.locks.query();
      const held = (q.held || []).find((l) => l.name === "lor-writer");
      return held ? { held: true, owner: held.clientId || "another client" } : { held: false };
    }
  } catch {}
  return { held: false, owner: "" };
}

/* ---------- Leads CRUD ---------- */
export async function getAllLeads() {
  return reqP(tx("leads", "readonly").objectStore("leads").getAll());
}
export async function getLead(id) {
  return reqP(tx("leads", "readonly").objectStore("leads").get(id));
}

/* Optimistic compare-and-swap on rev (PLAN.md §3). */
export async function putLead(lead) {
  return withWriteLock(() => new Promise((res, rej) => {
    const t = tx("leads", "readwrite");
    const os = t.objectStore("leads");
    const getR = os.get(lead.id);
    getR.onsuccess = () => {
      const cur = getR.result;
      if (cur && typeof cur.rev === "number" && typeof lead.rev === "number" && cur.rev !== lead.rev) {
        return rej(new Error("conflict: this lead was changed in another tab. Reload to see the latest."));
      }
      const next = { ...lead, rev: (cur ? cur.rev : (lead.rev || 0)) + 1, updatedAt: nowISO() };
      os.put(next);
      t.oncomplete = () => res(next);
      t.onerror = () => rej(t.error);
    };
    getR.onerror = () => rej(getR.error);
  }));
}

export async function deleteLead(id) {
  return withWriteLock(() => new Promise((res, rej) => {
    const t = tx(["leads", "events"], "readwrite");
    t.objectStore("leads").delete(id);
    const idx = t.objectStore("events").index("byLead");
    const cur = idx.openCursor(IDBKeyRange.only(id));
    cur.onsuccess = () => { const c = cur.result; if (c) { c.delete(); c.continue(); } };
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  }));
}

/* ---------- Events (append-only, dedup-on-write) PLAN.md §4 ---------- */
export async function addEvent(evt) {
  const e = { eventId: evt.eventId || uid("evt"), idempotencyKey: evt.idempotencyKey || uid("idem"), at: evt.at || nowISO(), ...evt };
  return withWriteLock(() => new Promise((res, rej) => {
    const t = tx("events", "readwrite");
    const os = t.objectStore("events");
    const dup = os.index("byIdem").get(e.idempotencyKey);
    dup.onsuccess = () => {
      if (dup.result) { res(dup.result); return; } // idempotent: already recorded
      os.add(e);
    };
    dup.onerror = () => rej(dup.error);
    t.oncomplete = () => res(e);
    t.onerror = () => rej(t.error);
  }));
}

export async function getEventsForLead(leadId, limit = 50) {
  const out = [];
  return new Promise((res, rej) => {
    const idx = tx("events", "readonly").objectStore("events").index("byLead");
    const cur = idx.openCursor(IDBKeyRange.only(leadId), "prev");
    cur.onsuccess = () => { const c = cur.result; if (c && out.length < limit) { out.push(c.value); c.continue(); } else res(out.sort((a, b) => (b.at || "").localeCompare(a.at || ""))); };
    cur.onerror = () => rej(cur.error);
  });
}
export async function countEvents() { return reqP(tx("events", "readonly").objectStore("events").count()); }

/* ---------- Settings (localStorage) + schema gate (PLAN.md §3 Round 4) ---------- */
export function loadSettings() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch {}
  if (!raw) { const d = defaultSettings(); saveSettings(d); return d; }
  const v = raw.settingsSchemaVersion || 1;
  if (v > SETTINGS_SCHEMA_VERSION) {
    // newer settings than this app understands → back up + reset (Round 4 fix)
    try { localStorage.setItem(SETTINGS_KEY + ":backup", JSON.stringify(raw)); } catch {}
    state.settingsReset = true;
    const d = defaultSettings(); saveSettings(d); return d;
  }
  return { ...defaultSettings(), ...raw, settingsSchemaVersion: SETTINGS_SCHEMA_VERSION };
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

/* ---------- Feature flags (runtime-overridable) ---------- */
export function loadFlags() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(FLAGS_KEY) || "{}"); } catch {}
  return { ...FLAG_DEFAULTS, ...o };
}
export function setFlag(name, val) {
  const f = loadFlags(); f[name] = val;
  try { localStorage.setItem(FLAGS_KEY, JSON.stringify(f)); } catch {}
  return f;
}

/* ---------- Error ring buffer ---------- */
export function readErrors() { try { return JSON.parse(localStorage.getItem(ERR_KEY) || "[]"); } catch { return []; } }
export function logError(kind, msg, stack) {
  try {
    const ring = readErrors();
    ring.push({ at: nowISO(), kind, msg: String(msg).slice(0, 500), stack: (stack || "").slice(0, 1200) });
    while (ring.length > 25) ring.shift();
    localStorage.setItem(ERR_KEY, JSON.stringify(ring));
  } catch {}
}

/* ---------- Storage sentinel + eviction detection (PLAN.md §3 Round 4) ---------- */
export function readSentinel() { try { return JSON.parse(localStorage.getItem(SENTINEL_KEY) || "null"); } catch { return null; } }
export function writeSentinel(leadCount, eventCount, lastBackupAt) {
  try { localStorage.setItem(SENTINEL_KEY, JSON.stringify({ leadCount, eventCount, lastBackupAt: lastBackupAt || null, at: nowISO() })); } catch {}
}
export async function checkDataLoss() {
  const s = readSentinel();
  if (!s) return false;
  const n = (await getAllLeads()).length;
  if (s.leadCount > 0 && n === 0) { state.dataLoss = true; return true; }
  return false;
}

export async function storageEstimate() {
  try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch {}
  return { usage: null, quota: null };
}
export async function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch {}
  return false;
}

/* ---------- Export / Import (transactional, idempotent) PLAN.md §3 ---------- */
export async function exportData(settings, { includeKey = false } = {}) {
  const leads = await getAllLeads();
  const events = await reqP(tx("events", "readonly").objectStore("events").getAll());
  // exclude the billable API key from standard exports (Round 2 fix)
  const safeSettings = JSON.parse(JSON.stringify(settings || {}));
  if (!includeKey && safeSettings.ai) safeSettings.ai.apiKey = "";
  return {
    kind: "local-opportunity-radar-backup",
    at: nowISO(), appVersion: APP_VERSION, dbSchemaVersion: DB_SCHEMA_VERSION,
    leads, events, settings: safeSettings,
  };
}

/* Replace or merge in a SINGLE transaction; idempotent via stable ids/eventIds. */
export async function importData(parsed, mode = "merge") {
  return withWriteLock(() => new Promise((res, rej) => {
    const t = tx(["leads", "events"], "readwrite");
    const ls = t.objectStore("leads");
    const es = t.objectStore("events");
    if (mode === "replace") { ls.clear(); es.clear(); }
    for (const l of parsed.leads) ls.put(l);                  // put = idempotent upsert by id
    for (const e of parsed.events) es.put(e);                 // put = idempotent upsert by eventId
    t.oncomplete = () => res({ leads: parsed.leads.length, events: parsed.events.length });
    t.onerror = () => rej(t.error);
  }));
}

export async function clearAll() {
  return withWriteLock(() => new Promise((res, rej) => {
    const t = tx(["leads", "events"], "readwrite");
    t.objectStore("leads").clear(); t.objectStore("events").clear();
    t.oncomplete = () => res(true); t.onerror = () => rej(t.error);
  }));
}
