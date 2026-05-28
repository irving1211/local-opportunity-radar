/* Smart-paste parsers (PLAN.md §10). Pure text parsing of content the USER pasted.
   Never fetches a URL. Returns confidence so the manual review screen can flag low-confidence reads. */

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
const URL_RE = /https?:\/\/[^\s)]+/i;
const ZIP_RE = /\b\d{5}\b/;
const STATE_RE = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),?\s?(MA|NH|RI|CT|VT|ME|NY)\b/;
const MONEY_RE = /\$\s?\d[\d,]*/;

const CAT_WORDS = {
  "home-service": ["plumb", "leak", "faucet", "drain", "toilet", "handyman", "paint", "fence", "deck", "lawn", "mow", "haul", "move ", "moving", "hvac", "appliance", "electrical", "carpentry", "remodel", "clean"],
  web: ["website", "web site", "landing page", "wordpress", "squarespace", "shopify", "wix", "seo", "web design", "webpage", "site "],
  automation: ["automat", "zapier", "make.com", "workflow", "integration", "spreadsheet", "crm", "sync", "bot ", "scrape", "no-code", "no code"],
  app: ["app ", "application", "software", "internal tool", "dashboard", "custom tool", "mobile app", "saas", "platform"],
  design: ["logo", "brand", "flyer", "graphic", "banner", "poster", "design "],
};
const URGENT = ["asap", "urgent", "today", "tonight", "emergency", "right away", "immediately"];
const SOON = ["this week", "this weekend", "soon", "by friday", "by monday"];

function classify(text) {
  const t = (text || "").toLowerCase();
  let best = "other", bestN = 0;
  for (const [cat, words] of Object.entries(CAT_WORDS)) {
    const n = words.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0);
    if (n > bestN) { bestN = n; best = cat; }
  }
  return { category: best, confident: bestN > 0 };
}
// Shared category classifier (used by the PWA ingest + the Node ingestion pipeline).
export function classifyCategory(text) { return classify(text).category; }
export function urgencyOf2(text) { return urgencyOf(text); }
function urgencyOf(text) {
  const t = text.toLowerCase();
  if (URGENT.some((w) => t.includes(w))) return "asap";
  if (SOON.some((w) => t.includes(w))) return "this-week";
  return "unknown";
}

function makeTitle(lines) {
  let t = (lines[0] || "").trim();
  if (t.length > 70) {
    const m = t.match(/^.{20,80}?[.!?](\s|$)/); // first sentence, no lookbehind (older mobile Safari safe)
    if (m) t = m[0].trim().replace(/[.!?]$/, "");
    else t = t.slice(0, 70).replace(/\s+\S*$/, "") + "…";
  }
  return t.slice(0, 100);
}

export function parseGeneric(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = makeTitle(lines);
  const email = (text.match(EMAIL_RE) || [])[0] || "";
  const phone = (text.match(PHONE_RE) || [])[0] || "";
  const url = (text.match(URL_RE) || [])[0] || "";
  const zip = (text.match(ZIP_RE) || [])[0] || "";
  const cityState = (text.match(STATE_RE) || [])[0] || "";
  const money = (text.match(MONEY_RE) || [])[0] || "";
  const cls = classify(text);
  const contactRaw = email || phone || url || "";
  const location = cityState || zip || "";

  const perFieldConfidence = {
    title: title ? "high" : "low",
    location: location ? "high" : "low",
    contactRaw: contactRaw ? "high" : "low",
    category: cls.confident ? "high" : "low",
    budgetClue: money ? "high" : "low",
  };
  const known = Object.values(perFieldConfidence).filter((c) => c === "high").length;
  const confidence = known >= 2 ? "high" : "low";

  return {
    source: "paste",
    confidence, perFieldConfidence,
    fields: { title, rawText: text, location, contactRaw, category: cls.category, urgency: urgencyOf(text), budgetClue: money },
  };
}

/* Craigslist saved-search alert email body (pasted). Titles often look like:
   "Need plumber for leak (Lawrence)" with an area in parens. */
export function parseCraigslist(text) {
  const g = parseGeneric(text);
  const areaMatch = text.match(/\(([^)]{2,40})\)/);
  if (areaMatch && !g.fields.location) { g.fields.location = areaMatch[1].trim(); g.perFieldConfidence.location = "high"; }
  const looksCl = /craigslist|cl\.|reply to:|posting id|\bcl\b/i.test(text) || !!areaMatch;
  g.source = "craigslist-alert";
  g.confidence = looksCl && g.fields.title ? "high" : "low";
  if (!looksCl) g.note = "Didn't clearly look like a Craigslist alert — please check the fields.";
  return g;
}

/* Google Alert email body (pasted): result blocks of "Title\nsnippet\nsource link". */
export function parseGoogleAlert(text) {
  const g = parseGeneric(text);
  const looksGa = /google alert|googlealerts|news\.google|flag as irrelevant/i.test(text);
  g.source = "google-alert";
  g.confidence = looksGa && g.fields.title ? "high" : "low";
  if (!looksGa) g.note = "Didn't clearly look like a Google Alert — please check the fields.";
  return g;
}

export function parse(text, sourceHint = "paste", flags = {}) {
  if (sourceHint === "craigslist-alert" && flags.parserCraigslist !== false) return parseCraigslist(text);
  if (sourceHint === "google-alert" && flags.parserGoogleAlert !== false) return parseGoogleAlert(text);
  const g = parseGeneric(text);
  if (sourceHint && sourceHint !== "paste") g.source = sourceHint;
  return g;
}
