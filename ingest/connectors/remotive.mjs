// Remotive official public API (https://remotive.com/api/remote-jobs). No key required.
// Remote tech / freelance / automation / web opportunities. Fetches by category (for variety)
// and by search term (for targeting); the runner dedupes across both by URL.
import { makeRecord } from "../normalize.mjs";

function toRecords(jobs, foundVia) {
  return (jobs || []).map((j) => makeRecord({
    source: "remotive",
    sourceDetail: j.category || j.company_name,
    sourceUrl: j.url,
    title: j.title,
    company: j.company_name,
    description: j.description,
    location: j.candidate_required_location || "Remote",
    postedAt: j.publication_date || null,
    foundViaQuery: foundVia,
    tags: j.tags,
    remote: true,
  }));
}

async function pull(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.json()).jobs || [];
}

export async function fetchRemotive({ categories = [], searches = [], limit = 14 } = {}) {
  const out = [];
  for (const c of categories) {
    try { const jobs = await pull(`https://remotive.com/api/remote-jobs?category=${encodeURIComponent(c)}&limit=${limit}`); out.push(...toRecords(jobs, "category:" + c)); console.error("[remotive] category", c, "→", jobs.length); }
    catch (e) { console.error("[remotive] category", c, e.message); }
  }
  for (const q of searches) {
    try { const jobs = await pull(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=${limit}`); out.push(...toRecords(jobs, q)); console.error("[remotive] search", q, "→", jobs.length); }
    catch (e) { console.error("[remotive] search", q, e.message); }
  }
  return out;
}
