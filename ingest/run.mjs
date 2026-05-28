// Scheduled ingestion runner (GitHub Actions). Pulls compliant OFFICIAL APIs only (no scraping),
// normalizes + dedupes, and writes a static feed.json the PWA consumes same-origin.
// Run locally: node ingest/run.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchRemotive } from "./connectors/remotive.mjs";
import { fetchGreenhouse } from "./connectors/greenhouse.mjs";
import { fetchLever } from "./connectors/lever.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = JSON.parse(readFileSync(join(here, "sources.json"), "utf8"));

const all = [];
if (src.remotive && (src.remotive.categories?.length || src.remotive.searches?.length)) all.push(...await fetchRemotive(src.remotive));
if (src.greenhouse?.boards?.length) all.push(...await fetchGreenhouse(src.greenhouse.boards, src.greenhouse.perBoard || 18));
if (src.lever?.companies?.length) all.push(...await fetchLever(src.lever.companies));

// Dedupe by canonical URL (fallback to source+title), keep newest first, cap.
const seen = new Set();
const records = [];
for (const r of all) {
  if (!r.title) continue;
  const key = (r.sourceUrl || r.source + "|" + r.title).toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  records.push(r);
}
records.sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")));
const cap = (src.caps && src.caps.maxRecords) || 300;
const capped = records.slice(0, cap);

const feed = { generatedAt: new Date().toISOString(), version: 1, count: capped.length, records: capped };
writeFileSync(join(root, "feed.json"), JSON.stringify(feed));
console.error(`feed.json written: ${capped.length} records (deduped from ${all.length} fetched)`);
