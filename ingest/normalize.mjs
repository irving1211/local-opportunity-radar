// Shared normalization for the Node ingestion pipeline. Produces the feed-record shape that the
// PWA's js/ingest.js consumes. Reuses the app's category classifier (single source of truth).
import { classifyCategory } from "../js/engine/parse.js";

export function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}
export const truncate = (s, n = 1400) => (String(s || "").length > n ? String(s).slice(0, n) + "…" : String(s || ""));

export function makeRecord({ source, sourceDetail, sourceUrl, title, company, description, location, postedAt, foundViaQuery, tags = [], remote }) {
  const text = (title || "") + ". " + stripHtml(description);
  return {
    source,
    sourceDetail: sourceDetail || company || "",
    sourceUrl: sourceUrl || "",
    title: String(title || "").trim().slice(0, 140),
    company: company || "",
    rawText: truncate(stripHtml(description)),
    location: location || (remote ? "Remote" : ""),
    category: classifyCategory(text),
    remote: !!remote,
    postedAt: postedAt || null,
    fetchedAt: new Date().toISOString(),
    foundViaQuery: foundViaQuery || "",
    tags: (tags || []).filter(Boolean).slice(0, 8),
    budgetClue: "",
  };
}
