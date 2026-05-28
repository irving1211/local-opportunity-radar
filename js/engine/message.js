import { fmtMoney } from "../util.js";

/* Slot-based, lead-specific message generator (PLAN.md §7). Pure.
   No AI-keyword language anywhere (external-framing rule) so every variant is platform-safe. */

export const TONES = ["local-friendly", "casual", "professional"];
export const TONE_LABELS = { "local-friendly": "Local-friendly", casual: "Casual", professional: "Professional" };

function need(lead, analysis) {
  const t = (lead.title || analysis.serviceType || "your project").trim();
  return t.replace(/\.$/, "");
}
function credibility(settings, lead) {
  const p = settings.skillsProfile;
  const cat = lead.category;
  const lines = {
    "home-service": "I do this kind of work locally and take care to leave it clean and done right.",
    web: "I build and fix websites for local businesses and keep it straightforward — no jargon.",
    automation: "I set up simple systems that save you time on the repetitive stuff.",
    app: "I build small, practical tools tailored to how you actually work.",
    design: "I handle clean, on-brand design without the agency overhead.",
    other: "I help local folks get this kind of thing handled without the runaround.",
  };
  return lines[cat] || lines.other;
}
function greeting(tone) {
  return { "local-friendly": "Hey!", casual: "Hi there,", professional: "Hello," }[tone];
}
function signoff(tone) {
  return { "local-friendly": "Talk soon,\nIrving", casual: "Thanks,\nIrving", professional: "Best regards,\nIrving" }[tone];
}
function cta(tone) {
  return {
    "local-friendly": "Want me to take a quick look and give you a straight answer on cost and timing?",
    casual: "Happy to give you a quick quote if you want to share a couple more details.",
    professional: "If you'd like, I can provide a clear quote and timeline once I understand the details.",
  }[tone];
}

const JOB_SOURCES = ["remotive", "greenhouse", "lever", "hackernews"];
export function isHiringLead(lead) { return !!lead && !!lead.ingested && JOB_SOURCES.includes(lead.source); }

export function buildMessages(lead, analysis, pricing, settings, tone = "local-friendly") {
  if (!TONES.includes(tone)) tone = "local-friendly";
  const n = need(lead, analysis);
  const cred = credibility(settings, lead);
  const g = greeting(tone), sign = signoff(tone);
  const priceHint = pricing ? `Most engagements like this land around ${fmtMoney(pricing.standard)} depending on scope.` : "";

  // Hiring-company pitch: they posted a JOB (need an extra person) — offer to cover it on contract.
  const hiring = isHiringLead(lead);
  const role = (lead.title || "this role").replace(/\.$/, "");
  const co = lead.sourceDetail ? ` at ${lead.sourceDetail}` : "";
  const close = hiring
    ? ({ "local-friendly": "Worth a quick chat about handling some of this on contract?", casual: "Open to a quick call about taking this on freelance?", professional: "If helpful, I'd welcome a brief conversation about supporting this on a contract basis." }[tone])
    : cta(tone);

  const opener = hiring
    ? ({
        "local-friendly": `Saw you're hiring for ${role}${co}. I take on this kind of work on a contract basis and could help right away.`,
        casual: `Noticed you're hiring for ${role}${co}. I do this work freelance and can jump in quickly.`,
        professional: `I saw your opening for ${role}${co}. I provide this work on a contract/freelance basis and may be able to help.`,
      }[tone])
    : ({
        "local-friendly": `Saw you're looking for help with ${n.toLowerCase()} — I'm local and can help.`,
        casual: `I saw your post about ${n.toLowerCase()} and I can help with that.`,
        professional: `I'm reaching out regarding your request for ${n.toLowerCase()}.`,
      }[tone]);

  const value = hiring
    ? "Bringing someone on contract can cover the workload immediately — useful for overflow, a backlog, or getting moving before a full-time hire is in place — without the ramp time and overhead of a permanent role."
    : cred;

  const first_short = `${g} ${opener} ${close}`;
  const first_normal = `${g}\n\n${opener}\n\n${value}\n\n${close}\n\n${sign}`;
  const first_premium = hiring
    ? `${g}\n\n${opener}\n\n${value} ${cred}\n\nI can scope a clear, fixed deliverable so it's lower-risk than an open-ended hire. ${priceHint}\n\n${close}\n\n${sign}`
    : `${g}\n\n${opener}\n\n${value} I focus on doing it properly the first time so you're not dealing with it again later. ${priceHint}\n\nIf it helps, I can walk you through exactly what's involved and what it would include — no pressure.\n\n${close}\n\n${sign}`;
  const follow_up = hiring
    ? `${g} circling back on ${role} — if you're still covering that workload, I'm happy to take a piece of it on contract. No worries if you've filled it.\n\n${sign}`
    : `${g} just circling back on ${n.toLowerCase()} — still happy to help if it's useful. No worries at all if you've already sorted it out.\n\n${sign}`;

  const subject = hiring ? `Contract help with ${role.slice(0, 50)}` : `Re: ${lead.title ? lead.title.slice(0, 60) : analysis.serviceType}`;
  const email_version = `Subject: ${subject}\n\n${first_normal}`;
  const text_version = `${opener} ${close} — Irving`.slice(0, 320);

  return {
    tone,
    first_short, first_normal, first_premium, follow_up,
    platform_safe: first_normal, // already free of AI keywords
    email_version, text_version, subject,
    computedAt: new Date().toISOString(),
  };
}
