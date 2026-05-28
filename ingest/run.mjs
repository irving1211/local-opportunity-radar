// Scheduled ingestion runner (GitHub Actions). Pulls compliant OFFICIAL APIs only (no scraping),
// normalizes + dedupes, and writes a static feed.json the PWA consumes same-origin.
// Run locally: node ingest/run.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchRemotive } from "./connectors/remotive.mjs";
import { fetchGreenhouse } from "./connectors/greenhouse.mjs";
import { fetchLever } from "./connectors/lever.mjs";
import { fetchHackerNews } from "./connectors/hackernews.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = JSON.parse(readFileSync(join(here, "sources.json"), "utf8"));

const all = [];
if (src.remotive && (src.remotive.categories?.length || src.remotive.searches?.length)) all.push(...await fetchRemotive(src.remotive));
if (src.greenhouse?.boards?.length) all.push(...await fetchGreenhouse(src.greenhouse.boards, src.greenhouse.perBoard || 18));
if (src.lever?.companies?.length) all.push(...await fetchLever(src.lever.companies));
if (src.hackernews?.enabled) all.push(...await fetchHackerNews({ limit: src.hackernews.limit || 60 }));

// Drop major brands (Irving wants smaller / mid-tier companies he can realistically pitch).
const deny = (src.denylist || []).map((d) => String(d).toLowerCase());
const isMajorBrand = (r) => {
  const hay = ((r.company || "") + " " + (r.sourceDetail || "")).toLowerCase();
  return deny.some((d) => d && new RegExp("\\b" + d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(hay));
};

// Dedupe by canonical URL (fallback to source+title), drop major brands, keep newest first, cap.
const seen = new Set();
const records = [];
let dropped = 0;
for (const r of all) {
  if (!r.title) continue;
  if (isMajorBrand(r)) { dropped++; continue; }
  const key = (r.sourceUrl || r.source + "|" + r.title).toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  records.push(r);
}
if (dropped) console.error(`filtered out ${dropped} major-brand records`);
// Lead with contract / no-payroll roles (Irving's best fit), then newest.
records.sort((a, b) => {
  const c = (b.contractSignal ? 1 : 0) - (a.contractSignal ? 1 : 0);
  return c || String(b.postedAt || "").localeCompare(String(a.postedAt || ""));
});
const cap = (src.caps && src.caps.maxRecords) || 300;
const capped = records.slice(0, cap);

const feed = { generatedAt: new Date().toISOString(), version: 1, count: capped.length, records: capped };
writeFileSync(join(root, "feed.json"), JSON.stringify(feed));
console.error(`feed.json written: ${capped.length} records (deduped from ${all.length} fetched)`);
