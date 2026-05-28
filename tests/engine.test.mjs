// Deterministic engine tests (PLAN.md §13). Run: node tests/engine.test.mjs
import { analyze } from "../js/engine/score.js";
import { price } from "../js/engine/pricing.js";
import { buildMessages } from "../js/engine/message.js";
import { fulfillment } from "../js/engine/fulfillment.js";
import { parseGeneric, parse } from "../js/engine/parse.js";
import { defaultSettings, newLead, normalizeContact, fingerprint } from "../js/schema.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error("FAIL:", msg); } };
const S = defaultSettings();

const fixtures = {
  plumbing: newLead({ category: "home-service", urgency: "asap", title: "Plumber needed ASAP leak", location: "Lawrence, MA", contactRaw: "(978) 555-0142", rawText: "Kitchen leak getting worse, need today. Can pay $150.", budgetClue: "$150" }),
  lowLogo: newLead({ category: "design", title: "cheap logo basically free", rawText: "need a logo for exposure, no budget, free if possible" }),
  emptyLead: newLead({}),
  garbage: newLead({ rawText: "asdf;;;; \n\n ### $$$ qq" }),
  bigApp: newLead({ category: "app", title: "Custom scheduling tool", location: "Boston, MA", contactRaw: "ops@x.example", rawText: "Need a reliable internal scheduling app, real budget, $3000-5000 ongoing maintenance after.", budgetClue: "$3000-5000" }),
  web: newLead({ category: "web", title: "Fix bakery website mobile", location: "Andover, MA", contactRaw: "owner@b.example", rawText: "Website broken on phones, budget $400-600 this week.", budgetClue: "$400-600" }),
};

// 1. analyze never throws + produces grade
for (const [k, lead] of Object.entries(fixtures)) {
  const a = analyze(lead, S);
  ok(["A", "B", "C", "D"].includes(a.grade), `${k}: grade valid (${a.grade})`);
  ok(typeof a.fitScore === "number" && a.fitScore >= 0 && a.fitScore <= 100, `${k}: fitScore in range`);
  ok(a.dimensions && Object.keys(a.dimensions).length === 7, `${k}: 7 dimensions with why`);
  ok(Object.values(a.dimensions).every((d) => d.why), `${k}: every dimension has a 'why'`);
}

// 2. determinism
const a1 = analyze(fixtures.bigApp, S), a2 = analyze(fixtures.bigApp, S);
ok(JSON.stringify(a1) === JSON.stringify(a2), "analyze is deterministic");

// 3. scoring direction: strong lead beats junk lead
ok(analyze(fixtures.bigApp, S).fitScore > analyze(fixtures.lowLogo, S).fitScore, "strong app lead scores higher than free-logo lead");
ok(analyze(fixtures.lowLogo, S).recommendation === "low-value-skip" || analyze(fixtures.lowLogo, S).grade === "D", "free-logo lead is skip/D");

// 4. pricing monotonic + positive
for (const [k, lead] of Object.entries(fixtures)) {
  const a = analyze(lead, S);
  const p = price({ ...lead, pricingInputs: a.suggestedPricingInputs }, a, S);
  ok(p.floor > 0 && p.standard >= p.floor && p.stretch >= p.standard, `${k}: floor<=standard<=stretch, all >0 (${p.floor}/${p.standard}/${p.stretch})`);
  ok(typeof p.rationale === "string" && p.rationale.length > 0, `${k}: pricing rationale present`);
}
// recurring app → retainer model
{
  const a = analyze(fixtures.bigApp, S);
  const p = price({ ...fixtures.bigApp, pricingInputs: { ...a.suggestedPricingInputs, recurring: true } }, a, S);
  ok(p.model === "retainer", "recurring → retainer model");
}

// 5. messages: present + no AI keyword
for (const [k, lead] of Object.entries(fixtures)) {
  const a = analyze(lead, S);
  const m = buildMessages(lead, a, price({ ...lead, pricingInputs: a.suggestedPricingInputs }, a, S), S, "local-friendly");
  ok(m.first_normal && m.first_short && m.first_premium && m.follow_up, `${k}: all message variants present`);
  ok(!/\b(AI|A\.I\.|ChatGPT|Claude|GPT|artificial intelligence|generated)\b/i.test(m.first_normal + m.first_premium + m.follow_up + m.email_version), `${k}: messages contain no AI keywords`);
}

// 6. fulfillment: 6 ranked
{
  const a = analyze(fixtures.web, S);
  const f = fulfillment(fixtures.web, a, S);
  ok(f.length === 6, "fulfillment returns 6 paths");
  ok(f[0].rank === 1 && f[5].rank === 6, "fulfillment ranked 1..6");
  ok(f.every((p, i) => i === 0 || f[i - 1].score >= p.score), "fulfillment sorted best-first");
}

// 7. parse extracts contact + budget
{
  const r = parseGeneric("Need handyman in Lawrence MA\nCall me at 978-555-0199 or email bob@test.example\nBudget around $300");
  ok(r.fields.contactRaw.includes("@") || /\d/.test(r.fields.contactRaw), "parse finds a contact");
  ok(/\$/.test(r.fields.budgetClue), "parse finds a budget");
  ok(["home-service", "other"].includes(r.fields.category), "parse classifies category");
}

// 8. contact normalization + injection safety
{
  ok(normalizeContact("bob@x.com").type === "email", "email normalized");
  ok(normalizeContact("(978) 555-0142").type === "phone", "phone normalized");
  ok(normalizeContact("evil@x.com?cc=victim@y.com").value === "evil@x.com", "email value strips injected params");
}

// 9. fingerprint stability + dedupe
{
  const l1 = newLead({ title: "Plumber leak", rawText: "kitchen leak today", contactRaw: "978-555-0142" });
  const l2 = newLead({ title: "Plumber leak", rawText: "kitchen leak today", contactRaw: "978-555-0142" });
  ok(l1.fingerprint === l2.fingerprint, "identical leads share fingerprint (dedupe works)");
  ok(newLead({ title: "Different" }).fingerprint !== l1.fingerprint, "different leads differ");
}

console.log(`\nengine tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
