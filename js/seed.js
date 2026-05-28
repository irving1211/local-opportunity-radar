import * as store from "./store.js";
import { newLead } from "./schema.js";
import { analyzeAll } from "./leadops.js";

export const EXAMPLE_LEADS = [
  {
    source: "craigslist-alert", category: "home-service", urgency: "asap",
    title: "Need a plumber ASAP â€” kitchen sink leaking (Lawrence)",
    location: "Lawrence, MA",
    contactRaw: "(978) 555-0142",
    rawText: "Kitchen sink has been leaking under the cabinet since last night, getting worse. Need someone today or tomorrow morning if possible. Willing to pay for fast service. Located in Lawrence near the common.",
    budgetClue: "$150",
  },
  {
    source: "referral", category: "web", urgency: "this-week",
    title: "Local bakery needs website fixed + mobile menu",
    location: "Andover, MA",
    contactRaw: "owner@sweetcrumb.example",
    rawText: "Our website looks broken on phones and the menu PDF won't open. We're a small bakery in Andover. Would love it looking clean this week before the weekend rush. Budget is around $400-600.",
    budgetClue: "$400-600",
  },
  {
    source: "board", category: "automation", urgency: "flexible",
    title: "Small contractor wants to automate invoice follow-ups",
    location: "Methuen, MA",
    contactRaw: "mike.builds@example.com",
    rawText: "I spend hours every month chasing late invoices. Looking for someone to set up an automated reminder system that emails clients on a schedule. This would be ongoing/monthly if it works well. Open to suggestions.",
    budgetClue: "",
  },
  {
    source: "paste", category: "app", urgency: "flexible",
    title: "Custom scheduling tool for a cleaning company",
    location: "Boston, MA",
    contactRaw: "ops@brightclean.example",
    rawText: "We're a growing cleaning company and need a simple internal tool to assign jobs to crews, track which are done, and see the week at a glance. Nothing fancy but it has to be reliable. This is a real budget project â€” we know good software costs money.",
    budgetClue: "$3000-5000",
  },
  {
    source: "manual", category: "design", urgency: "flexible",
    title: "Looking for a cheap logo, basically free",
    location: "",
    contactRaw: "@quickflip_deals",
    rawText: "Starting a reselling side hustle, need a logo but honestly looking for the cheapest option or someone doing it for exposure. Not much budget right now.",
    budgetClue: "",
  },
];

const EXAMPLE_FINGERPRINTS = new Set(EXAMPLE_LEADS.map((sample) => newLead(sample).fingerprint));

export function isExampleLead(lead) {
  return !!lead && EXAMPLE_FINGERPRINTS.has(lead.fingerprint);
}

export function countExampleLeads(leads) {
  return (leads || []).filter(isExampleLead).length;
}

export async function loadExampleLeads(settings) {
  try {
    const existing = await store.getAllLeads();
    const existingFingerprints = new Set(existing.map((lead) => lead.fingerprint));
    const now = Date.now();
    let i = 0;
    let added = 0;
    for (const sample of EXAMPLE_LEADS) {
      const probe = newLead(sample);
      if (existingFingerprints.has(probe.fingerprint)) continue;
      const lead = newLead({ ...sample, createdAt: new Date(now - (i * 9 + 1) * 3600000).toISOString() });
      const computed = analyzeAll(lead, settings);
      await store.putLead(computed);
      added++;
      i++;
    }
    return added;
  } catch (e) {
    store.logError("seed", e.message, e.stack);
    return 0;
  }
}

export async function removeExampleLeads() {
  try {
    const existing = await store.getAllLeads();
    let removed = 0;
    for (const lead of existing) {
      if (!isExampleLead(lead)) continue;
      await store.deleteLead(lead.id);
      removed++;
    }
    return removed;
  } catch (e) {
    store.logError("seed-remove", e.message, e.stack);
    return 0;
  }
}
