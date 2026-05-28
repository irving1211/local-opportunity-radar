import { analyze } from "./engine/score.js";
import { price } from "./engine/pricing.js";
import { fulfillment } from "./engine/fulfillment.js";
import { buildMessages } from "./engine/message.js";
import { fingerprint } from "./schema.js";
import * as store from "./store.js";
import { uid, nowISO } from "./util.js";

/* Run all engines over a lead (pure compute). Does NOT persist. */
export function analyzeAll(lead, settings, tone) {
  const analysis = analyze(lead, settings);
  const pricingInputs = lead.pricingInputs || analysis.suggestedPricingInputs;
  const next = { ...lead, pricingInputs, analysis, fingerprint: fingerprint(lead) };
  next.pricing = lead.pricing && lead.pricing.userOverride ? lead.pricing : price(next, analysis, settings);
  next.fulfillment = fulfillment(next, analysis, settings);
  next.messages = buildMessages(next, analysis, next.pricing, settings, tone || (next.messages && next.messages.tone));
  return next;
}

/* Analyze + persist (CAS) + refresh sentinel. */
export async function saveAnalyzed(lead, settings) {
  const computed = analyzeAll(lead, settings);
  const saved = await store.putLead(computed);
  await refreshSentinel(settings);
  return saved;
}

export async function refreshSentinel(settings) {
  const leads = await store.getAllLeads();
  const events = await store.countEvents();
  store.writeSentinel(leads.length, events, settings ? settings.lastBackupAt : null);
}

/* Move pipeline stage, recording an event in the same logical step (PLAN.md §9). */
export async function moveStage(lead, toStage, note = "") {
  const from = lead.stage;
  if (from === toStage) return lead;
  const patch = { ...lead, stage: toStage };
  if (toStage === "replied") patch.lastContactedAt = nowISO();
  const saved = await store.putLead(patch);
  await store.addEvent({
    eventId: uid("evt"), idempotencyKey: `stage_${lead.id}_${from}_${toStage}_${Date.now()}`,
    leadId: lead.id, kind: "stage-change", at: nowISO(), from, to: toStage, note,
  });
  return saved;
}

/* Record an immutable snapshot of what was copied/launched (PLAN.md §7), dedup by idempotencyKey. */
export async function recordSnapshot(lead, { channel, tone, variant, text }) {
  return store.addEvent({
    eventId: uid("evt"),
    idempotencyKey: `snap_${lead.id}_${channel}_${variant}_${hashish(text)}`,
    leadId: lead.id, kind: "snapshot", at: nowISO(), channel, tone, variant, text,
  });
}
function hashish(s) { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

/* Build a safe deep link from typed contact (PLAN.md §7, Round 2). Returns null if not safely linkable. */
export function deepLink(contact, subject, body) {
  if (!contact) return null;
  if (contact.type === "email" && contact.value) {
    const q = [];
    if (subject) q.push("subject=" + encodeURIComponent(subject));
    if (body) q.push("body=" + encodeURIComponent(body));
    return { href: "mailto:" + encodeURIComponent(contact.value).replace(/%40/g, "@") + (q.length ? "?" + q.join("&") : ""), kind: "email" };
  }
  if (contact.type === "phone" && contact.value) {
    const digits = contact.value.replace(/[^\d+]/g, "");
    const q = body ? "?&body=" + encodeURIComponent(body) : "";
    return { href: "sms:" + digits + q, kind: "sms" };
  }
  return null;
}
