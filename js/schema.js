import { uid, hash, normalize, nowISO } from "./util.js";
import { SETTINGS_SCHEMA_VERSION } from "./config.js";

export const CATEGORIES = ["home-service", "web", "automation", "app", "design", "other"];
export const CATEGORY_LABELS = {
  "home-service": "Home service", web: "Website", automation: "Automation",
  app: "Custom app", design: "Design", other: "Other",
};
export const SOURCES = ["manual", "paste", "craigslist-alert", "google-alert", "referral", "facebook-group", "board", "other"];
export const SOURCE_LABELS = {
  manual: "Manual entry", paste: "Pasted post", "craigslist-alert": "Craigslist alert",
  "google-alert": "Google Alert", referral: "Referral", "facebook-group": "Facebook group", board: "Community board", other: "Other",
};
// Per-source display metadata (PLAN.md §9 source visibility). icon = key in ui/components icon set; tint = chip color var.
export const SOURCE_META = {
  manual: { short: "Manual", icon: "pencil", tint: "var(--text-3)" },
  paste: { short: "Pasted", icon: "clipboard", tint: "var(--accent)" },
  "craigslist-alert": { short: "Craigslist", icon: "tag", tint: "#7C5CFF" },
  "google-alert": { short: "Google Alert", icon: "bell", tint: "#EA8600" },
  referral: { short: "Referral", icon: "user", tint: "var(--success)" },
  "facebook-group": { short: "FB group", icon: "users", tint: "#3B6FE0" },
  board: { short: "Board", icon: "community", tint: "#0EA5A5" },
  other: { short: "Other", icon: "tag", tint: "var(--text-3)" },
};
// What to show as the source line: prefer the user's specific detail, else the label.
export function sourceText(lead) {
  const meta = SOURCE_META[lead.source] || SOURCE_META.other;
  const detail = (lead.sourceDetail || "").trim();
  return { short: detail || meta.short, full: detail ? `${SOURCE_LABELS[lead.source]} · ${detail}` : SOURCE_LABELS[lead.source], icon: meta.icon, tint: meta.tint };
}
// Placeholder hint for the source-detail field, by source.
export const SOURCE_DETAIL_HINT = {
  "facebook-group": "Which group? e.g. 'Lawrence Buy/Sell/Trade'",
  referral: "Who referred it? e.g. 'Mike (plumbing)'",
  "craigslist-alert": "Which search/section? e.g. 'gigs — labor'",
  "google-alert": "Which alert? e.g. 'website help near me'",
  board: "Which board? e.g. 'Framingham community board'",
  paste: "Where did you find it? (optional)",
  manual: "Any note on where this came from (optional)",
  other: "Where did this come from? (optional)",
};
export const STAGES = ["new", "reviewed", "worth-replying", "replied", "follow-up", "booked", "lost", "ignored"];
export const STAGE_LABELS = {
  new: "New", reviewed: "Reviewed", "worth-replying": "Worth replying", replied: "Replied",
  "follow-up": "Follow up", booked: "Booked", lost: "Lost", ignored: "Ignored",
};
export const URGENCY = ["asap", "this-week", "flexible", "unknown"];
export const URGENCY_LABELS = { asap: "ASAP", "this-week": "This week", flexible: "Flexible", unknown: "Unknown" };
export const GRADES = ["A", "B", "C", "D"];

export const SCORE_DIMENSIONS = [
  "proximity", "urgency", "budgetSignal", "skillsMatch", "easeOfClosing", "repeatPotential", "portfolioValue",
];
export const DIMENSION_LABELS = {
  proximity: "Proximity", urgency: "Urgency", budgetSignal: "Budget", skillsMatch: "Skills fit",
  easeOfClosing: "Ease", repeatPotential: "Repeat", portfolioValue: "Portfolio",
};

export const RECOMMENDATIONS = {
  "reply-now": { label: "Reply now", tone: "success" },
  "high-fit-premium": { label: "High-fit premium opportunity", tone: "success" },
  "good-fit-low-budget": { label: "Good fit, likely low budget", tone: "warning" },
  "reply-if-slow": { label: "Reply if schedule opens", tone: "accent" },
  "low-value-skip": { label: "Low value — skip", tone: "error" },
};

export function defaultSettings() {
  return {
    settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
    skillsProfile: { homeService: true, web: true, automation: true, app: true, design: false, customSkills: [] },
    serviceArea: { homeBase: "Lawrence, MA", nearbyKeywords: ["lawrence", "framingham", "andover", "methuen", "haverhill", "lowell", "boston", "ma", "massachusetts"] },
    keywords: { highValue: ["recurring", "monthly", "ongoing", "retainer", "business", "commercial"], skip: ["free", "exposure", "volunteer", "unpaid"] },
    baseRates: {
      web: { floor: 250, standard: 450, stretch: 800 },
      automation: { floor: 300, standard: 750, stretch: 1500 },
      app: { floor: 1500, standard: 3500, stretch: 7500 },
      "home-service": { floor: 120, standard: 250, stretch: 600 },
      design: { floor: 150, standard: 400, stretch: 900 },
      other: { floor: 150, standard: 400, stretch: 1000 },
    },
    weights: { proximity: 1, urgency: 1, budgetSignal: 1.3, skillsMatch: 1.5, easeOfClosing: 1, repeatPotential: 1.1, portfolioValue: 0.8 },
    ai: { enabled: false, apiKey: "", model: "claude-haiku-4-5-20251001" },
    theme: "system",
    lastBackupAt: null,
  };
}

export function newLead(partial = {}) {
  const t = nowISO();
  const lead = {
    id: partial.id || uid("lead"),
    rev: 0,
    createdAt: partial.createdAt || t,
    updatedAt: t,
    source: SOURCES.includes(partial.source) ? partial.source : "manual",
    sourceDetail: (partial.sourceDetail || "").trim(),
    title: (partial.title || "").trim(),
    rawText: partial.rawText || "",
    location: (partial.location || "").trim(),
    contact: partial.contact || normalizeContact(partial.contactRaw || ""),
    category: CATEGORIES.includes(partial.category) ? partial.category : "other",
    urgency: URGENCY.includes(partial.urgency) ? partial.urgency : "unknown",
    budgetClue: (partial.budgetClue || "").trim(),
    stage: STAGES.includes(partial.stage) ? partial.stage : "new",
    followUpAt: partial.followUpAt || null,
    lastContactedAt: partial.lastContactedAt || null,
    nextAction: partial.nextAction || "",
    pricingInputs: partial.pricingInputs || null,   // filled by engine on first analyze
    analysis: partial.analysis || null,
    pricing: partial.pricing || null,
    messages: partial.messages || null,
    fulfillment: partial.fulfillment || null,
    notes: partial.notes || "",
    aiEnhanced: !!partial.aiEnhanced,
    fingerprint: "",
  };
  lead.fingerprint = fingerprint(lead);
  return lead;
}

/* Typed + allowlisted contact (PLAN.md §4/§7/§11, Round 2 security fix). Deep links are
   built ONLY from .value, never .raw. */
export function normalizeContact(raw) {
  const r = (raw || "").trim();
  if (!r) return { type: "none", value: "", raw: "" };
  const email = r.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i);
  if (email) return { type: "email", value: email[0].toLowerCase(), raw: r };
  const digits = r.replace(/[^\d+]/g, "");
  const dcount = digits.replace(/\D/g, "").length;
  if (dcount >= 10 && dcount <= 15 && /^[+]?[\d]+$/.test(digits)) return { type: "phone", value: digits, raw: r };
  const url = r.match(/^https?:\/\/[^\s]+$/i);
  if (url) return { type: "url", value: url[0], raw: r };
  const handle = r.match(/^@[a-z0-9._]+$/i);
  if (handle) return { type: "handle", value: handle[0], raw: r };
  return { type: "other", value: "", raw: r };
}

export function fingerprint(lead) {
  const c = lead.contact ? (lead.contact.value || lead.contact.raw || "") : "";
  return hash(normalize(lead.title) + "|" + normalize((lead.rawText || "").slice(0, 120)) + "|" + normalize(c));
}

/* Validate an imported backup payload before any write (PLAN.md §3, Round 2 fix). */
export function validateImport(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") return { ok: false, errors: ["Not a JSON object."] };
  if (obj.kind && obj.kind !== "local-opportunity-radar-backup") errors.push("Unrecognized backup file.");
  if (!Array.isArray(obj.leads)) errors.push("Missing 'leads' array.");
  if (obj.events && !Array.isArray(obj.events)) errors.push("'events' must be an array.");
  if (typeof obj.dbSchemaVersion === "number" && obj.dbSchemaVersion > 1) errors.push("Backup is from a newer app version (schema " + obj.dbSchemaVersion + ") — update the app before importing.");
  if (errors.length) return { ok: false, errors };
  // sanitize leads to known shape
  const leads = obj.leads.map((l) => newLead({ ...l, id: l.id }));
  const events = (obj.events || []).filter((e) => e && e.eventId && e.leadId);
  return { ok: true, errors: [], data: { leads, events, settings: obj.settings || null } };
}
