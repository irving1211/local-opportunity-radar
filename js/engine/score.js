import { SCORE_DIMENSIONS } from "../schema.js";

/* Deterministic, explainable lead analysis (PLAN.md §5). Pure function: same inputs → same output.
   Every dimension returns { value:0-100, why } so the user can see WHY a lead scored as it did. */

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const has = (text, words) => words.some((w) => text.includes(w));
const URGENT_WORDS = ["asap", "urgent", "today", "tonight", "emergency", "right away", "immediately", "this weekend"];
const RECUR_WORDS = ["monthly", "weekly", "ongoing", "recurring", "retainer", "maintenance", "regular", "every month", "long-term", "long term"];
const SHOWCASE_WORDS = ["redesign", "brand", "launch", "new website", "rebuild", "from scratch", "portfolio", "showcase"];
const LOWBUDGET_WORDS = ["cheap", "low budget", "tight budget", "free", "exposure", "not much", "small budget", "beer money"];
const CLEAR_WORDS = ["need", "looking for", "want", "help with", "fix", "build", "install", "repair", "set up", "setup"];

export function extractBudget(text) {
  const m = [...text.matchAll(/\$\s?([0-9][0-9,]*)(?:\s?[-–]\s?\$?\s?([0-9][0-9,]*))?/g)];
  const nums = [];
  for (const x of m) {
    nums.push(parseInt(x[1].replace(/,/g, ""), 10));
    if (x[2]) nums.push(parseInt(x[2].replace(/,/g, ""), 10));
  }
  const valid = nums.filter((n) => !isNaN(n) && n > 0 && n < 1e7);
  return valid.length ? { min: Math.min(...valid), max: Math.max(...valid), found: true } : { min: 0, max: 0, found: false };
}

function dProximity(lead, s) {
  const loc = (lead.location || "").toLowerCase();
  const blob = (loc + " " + lead.rawText).toLowerCase();
  if (!loc && !lead.rawText) return { value: 50, why: "No location given — treated as neutral." };
  const kws = (s.serviceArea.nearbyKeywords || []).map((k) => k.toLowerCase());
  if (kws.some((k) => k && blob.includes(k))) return { value: 90, why: "Mentions a place in your service area." };
  if (loc) return { value: 35, why: "Has a location but not in your usual area." };
  return { value: 50, why: "Location unclear — neutral." };
}
function dUrgency(lead) {
  const t = lead.rawText.toLowerCase();
  if (lead.urgency === "asap") return { value: 92, why: "Marked ASAP." };
  if (lead.urgency === "this-week") return { value: 72, why: "Needed this week." };
  if (lead.urgency === "flexible") return { value: 42, why: "Flexible timing — less pressure to reply fast." };
  if (has(t, URGENT_WORDS)) return { value: 80, why: "Urgent language in the post." };
  return { value: 52, why: "No clear urgency signal." };
}
function dBudget(lead, s) {
  const t = (lead.rawText + " " + lead.budgetClue).toLowerCase();
  const b = extractBudget(t);
  const skipHit = (s.keywords && s.keywords.skip || []).some((k) => k && t.includes(k));
  const hvHit = (s.keywords && s.keywords.highValue || []).some((k) => k && t.includes(k));
  let r;
  if (has(t, LOWBUDGET_WORDS) && !b.found) r = { value: 22, why: "Low-budget language, no real number." };
  else if (!b.found) r = { value: 48, why: "No budget stated — unknown." };
  else {
    const top = b.max;
    if (top >= 2000) r = { value: 95, why: `Strong budget signal (~$${top.toLocaleString()}).` };
    else if (top >= 700) r = { value: 80, why: `Solid budget (~$${top.toLocaleString()}).` };
    else if (top >= 250) r = { value: 62, why: `Modest budget (~$${top.toLocaleString()}).` };
    else r = { value: 38, why: `Small budget (~$${top.toLocaleString()}).` };
  }
  if (skipHit) { r = { value: Math.min(r.value, 16), why: r.why + " Contains a skip keyword (free/exposure/etc.)." }; }
  else if (hvHit) { r = { value: clamp(r.value + 8), why: r.why + " Mentions a high-value signal." }; }
  return r;
}
function dSkills(lead, s) {
  const map = { "home-service": "homeService", web: "web", automation: "automation", app: "app", design: "design" };
  const key = map[lead.category];
  const enabled = key ? s.skillsProfile[key] : false;
  const t = lead.rawText.toLowerCase();
  const custom = (s.skillsProfile.customSkills || []).map((c) => c.toLowerCase());
  const overlap = custom.filter((c) => c && t.includes(c)).length;
  if (lead.category === "other") return { value: 45, why: "Category is 'other' — fit unclear." };
  if (!enabled) return { value: 25, why: `${lead.category} isn't in your skills profile.` };
  let v = 72 + Math.min(overlap * 8, 24);
  return { value: clamp(v), why: overlap ? "Matches your skills + specific keywords." : "Matches a service you offer." };
}
function dEase(lead) {
  const t = lead.rawText.toLowerCase();
  let v = 50;
  const why = [];
  if (lead.contact && (lead.contact.type === "email" || lead.contact.type === "phone")) { v += 22; why.push("direct contact available"); }
  if (has(t, CLEAR_WORDS)) { v += 14; why.push("clear ask"); }
  if (t.length > 600) { v -= 10; why.push("long/complex post"); }
  if (/\b(quote|estimate|how much|price)\b/.test(t)) { v += 8; why.push("already price-shopping"); }
  return { value: clamp(v), why: why.length ? why.join(", ") + "." : "Average ease to close." };
}
function dRepeat(lead) {
  const t = lead.rawText.toLowerCase();
  if (has(t, RECUR_WORDS)) return { value: 85, why: "Mentions ongoing/recurring work." };
  if (lead.category === "automation" || lead.category === "app") return { value: 55, why: "This type of work often leads to repeat business." };
  return { value: 35, why: "Looks like a one-off." };
}
function dPortfolio(lead) {
  const t = lead.rawText.toLowerCase();
  const prestige = { app: 80, web: 70, automation: 68, design: 65, "home-service": 40, other: 45 }[lead.category] || 45;
  const bump = has(t, SHOWCASE_WORDS) ? 12 : 0;
  return { value: clamp(prestige + bump), why: bump ? "Showcase-worthy scope." : "Typical portfolio value for this type." };
}

function difficultyFrom(lead, dims) {
  const len = lead.rawText.length;
  if (lead.category === "app") return len > 400 ? "high" : "medium";
  if (lead.category === "automation") return "medium";
  if (lead.category === "home-service") return dims.easeOfClosing.value > 60 ? "low" : "medium";
  return len > 500 ? "high" : len > 200 ? "medium" : "low";
}
const TURNAROUND = { low: "a few hours – 1 day", medium: "2–5 days", high: "1–3 weeks" };

function recommend(grade, dims, skipHit) {
  const budget = dims.budgetSignal.value, skills = dims.skillsMatch.value;
  if (skipHit && grade !== "A") return "low-value-skip";
  if ((grade === "A") && budget >= 75 && skills >= 70) return "high-fit-premium";
  if ((grade === "A" || grade === "B") && budget <= 40) return "good-fit-low-budget";
  if (grade === "A" || grade === "B") return "reply-now";
  if (grade === "C") return "reply-if-slow";
  return "low-value-skip";
}

export function analyze(lead, settings) {
  const dims = {
    proximity: dProximity(lead, settings),
    urgency: dUrgency(lead),
    budgetSignal: dBudget(lead, settings),
    skillsMatch: dSkills(lead, settings),
    easeOfClosing: dEase(lead),
    repeatPotential: dRepeat(lead),
    portfolioValue: dPortfolio(lead),
  };
  const w = settings.weights || {};
  let wsum = 0, num = 0;
  for (const d of SCORE_DIMENSIONS) { const weight = w[d] != null ? w[d] : 1; num += dims[d].value * weight; wsum += weight; }
  const fitScore = clamp(num / (wsum || 1));
  const grade = fitScore >= 78 ? "A" : fitScore >= 60 ? "B" : fitScore >= 42 ? "C" : "D";
  const difficulty = difficultyFrom(lead, dims);

  const riskNotes = [];
  if (dims.budgetSignal.value < 35) riskNotes.push("Budget may be too low to be worth it.");
  if (dims.skillsMatch.value < 40) riskNotes.push("Outside your core skills — consider referring it out.");
  if (dims.proximity.value < 40 && lead.location) riskNotes.push("Outside your usual service area.");
  if (!lead.contact || lead.contact.type === "none" || lead.contact.type === "other") riskNotes.push("No clear way to contact them yet.");

  const blob = (lead.rawText + " " + lead.budgetClue).toLowerCase();
  const skipHit = (settings.keywords && settings.keywords.skip || []).some((k) => k && blob.includes(k));
  const recommendation = recommend(grade, dims, skipHit);
  const worthReplying = recommendation !== "low-value-skip";

  const summary = buildSummary(lead, dims, grade);
  const serviceType = serviceTypeFrom(lead);

  const suggestedPricingInputs = {
    timeRequired: difficulty === "high" ? "project" : difficulty === "medium" ? "multi-day" : "quick",
    complexity: difficulty,
    businessValue: dims.budgetSignal.value >= 75 ? "high" : dims.budgetSignal.value >= 45 ? "medium" : "low",
    recurring: dims.repeatPotential.value >= 70,
    productizable: lead.category === "automation" || lead.category === "app",
  };

  return { summary, serviceType, fitScore, grade, difficulty, turnaround: TURNAROUND[difficulty], riskNotes, recommendation, worthReplying, dimensions: dims, suggestedPricingInputs, computedAt: new Date().toISOString() };
}

function serviceTypeFrom(lead) {
  const labels = { "home-service": "Home / handyman service", web: "Website work", automation: "Automation / workflow setup", app: "Custom app or internal tool", design: "Design work", other: "General service" };
  return labels[lead.category] || "General service";
}
function buildSummary(lead, dims, grade) {
  const what = serviceTypeFrom(lead).toLowerCase();
  const where = dims.proximity.value >= 80 ? " in your area" : "";
  const budget = dims.budgetSignal.value >= 75 ? "with a solid budget" : dims.budgetSignal.value <= 35 ? "but budget looks thin" : "with an unclear budget";
  const urgency = dims.urgency.value >= 80 ? "They need it soon" : dims.urgency.value <= 45 ? "Timing is flexible" : "Timing is moderate";
  return `Grade ${grade}: ${what}${where}, ${budget}. ${urgency}.`;
}
