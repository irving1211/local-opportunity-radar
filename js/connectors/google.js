import { getJSON } from "../engine/net.js";
import { ingestRecords } from "../ingest.js";
import { classifyCategory } from "../engine/parse.js";
import { nowISO } from "../util.js";

/* On-device Google Programmable Search (Custom Search JSON API) connector (PLAN: query-driven
   discovery). Uses the user's own key+cx from Settings. Official API only — never scrapes google.com.
   The request goes through net.safeFetch, which only permits the googleapis.com origin. */

export function googleItemToRecord(item, query, geo) {
  const text = (item.title || "") + ". " + (item.snippet || "");
  return {
    source: "google-search",
    sourceDetail: item.displayLink || "",
    sourceUrl: item.link || "",
    foundViaQuery: query,
    fetchedAt: nowISO(),
    postedAt: null,
    title: item.title || "(untitled)",
    rawText: item.snippet || "",
    location: geo || "",
    category: classifyCategory(text),
    remote: false,
  };
}

export async function runGoogleSearch(settings) {
  const g = settings.google || {};
  if (!g.apiKey || !g.cx) throw new Error("Add your Google API key and Search engine ID (cx) in Settings first.");
  const queries = (g.queries || []).filter(Boolean);
  if (!queries.length) throw new Error("Add at least one saved search query in Settings.");
  const records = [];
  const errors = [];
  for (const q of queries) {
    const full = g.location && !g.remoteOnly ? `${q} ${g.location}` : q;
    const url = "https://www.googleapis.com/customsearch/v1"
      + "?key=" + encodeURIComponent(g.apiKey)
      + "&cx=" + encodeURIComponent(g.cx)
      + "&q=" + encodeURIComponent(full)
      + "&num=10";
    try {
      const data = await getJSON(url);
      for (const item of (data.items || [])) records.push(googleItemToRecord(item, q, g.location));
    } catch (e) { errors.push(q + ": " + e.message); }
  }
  const res = await ingestRecords(records, settings);
  return { ...res, queriesRun: queries.length, errors };
}
