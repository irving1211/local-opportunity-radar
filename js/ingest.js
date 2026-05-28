import * as store from "./store.js";
import { getJSON } from "./engine/net.js";
import { INGEST } from "./config.js";
import { newLead, normalizeContact } from "./schema.js";
import { analyzeAll } from "./leadops.js";
import { nowISO } from "./util.js";

/* Normalize one feed/connector record into a lead (PLAN: ingestion). The record shape is shared
   with the Node pipeline (ingest/normalize.mjs) and the on-device Google connector. */
export function recordToLead(rec) {
  return newLead({
    source: rec.source || "other",
    sourceDetail: rec.sourceDetail || rec.company || "",
    sourceUrl: rec.sourceUrl || "",
    foundViaQuery: rec.foundViaQuery || "",
    postedAt: rec.postedAt || null,
    fetchedAt: rec.fetchedAt || nowISO(),
    ingested: true,
    title: rec.title || "(untitled)",
    rawText: rec.rawText || "",
    location: rec.location || (rec.remote ? "Remote" : ""),
    category: rec.category || "other",
    urgency: rec.urgency || "unknown",
    budgetClue: rec.budgetClue || "",
    // For job postings there's no personal email — the apply/posting URL IS the contact path.
    contact: rec.contact || normalizeContact(rec.contactRaw || rec.sourceUrl || ""),
  });
}

/* Import an array of records: analyze + dedupe (by URL-aware fingerprint) + persist new ones. */
export async function ingestRecords(records, settings) {
  const existing = await store.getAllLeads();
  const seen = new Set(existing.map((l) => l.fingerprint));
  let added = 0, skipped = 0, count = 0;
  for (const rec of records || []) {
    if (count++ >= INGEST.maxRecords) break;
    let lead;
    try { lead = recordToLead(rec); } catch { skipped++; continue; }
    if (!lead.title || lead.title === "(untitled)") { skipped++; continue; }
    if (seen.has(lead.fingerprint)) { skipped++; continue; }
    seen.add(lead.fingerprint);
    try { await store.putLead(analyzeAll(lead, settings)); added++; } catch { skipped++; }
  }
  return { added, skipped, total: (records || []).length };
}

/* Pull the same-origin static feed produced by the scheduled Action and ingest it. */
export async function ingestFeed(settings, { force = false } = {}) {
  const last = settings.feed && settings.feed.lastFetchAt ? new Date(settings.feed.lastFetchAt).getTime() : 0;
  if (!force && Date.now() - last < INGEST.throttleMs) return { skippedThrottle: true, added: 0, skipped: 0 };
  let data;
  try { data = await getJSON(INGEST.feedPath); } // SW is network-first for feed.json — no cache-buster needed
  catch (e) { store.logError("ingest-feed", e.message, e.stack); return { error: e.message, added: 0, skipped: 0 }; }
  const res = await ingestRecords((data && data.records) || [], settings);
  settings.feed = { ...(settings.feed || {}), lastFetchAt: nowISO() };
  store.saveSettings(settings);
  try { const leads = await store.getAllLeads(); const ev = await store.countEvents(); store.writeSentinel(leads.length, ev, settings.lastBackupAt); } catch {}
  return { ...res, generatedAt: data && data.generatedAt };
}
