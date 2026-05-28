/* Framework-based pricing (PLAN.md §6). Pure. Starts from category base rates, applies multipliers
   from the structured, user-reviewable pricingInputs so the price stays explainable. */

const roundNice = (n) => {
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 25) * 25;
  return Math.round(n / 50) * 50;
};

export function price(lead, analysis, settings) {
  const cat = lead.category || "other";
  const base = (settings.baseRates && settings.baseRates[cat]) || settings.baseRates.other || { floor: 150, standard: 400, stretch: 1000 };
  const pin = lead.pricingInputs || analysis.suggestedPricingInputs || {
    timeRequired: "multi-day", complexity: "medium", businessValue: "medium", recurring: false, productizable: false,
  };

  let mult = 1;
  const reasons = [];
  const cx = { low: 0.9, medium: 1.0, high: 1.25 }[pin.complexity] ?? 1;
  if (cx !== 1) { mult *= cx; reasons.push(pin.complexity === "high" ? "higher complexity" : "lower complexity"); }
  const bv = { low: 0.9, medium: 1.0, high: 1.2 }[pin.businessValue] ?? 1;
  if (bv !== 1) { mult *= bv; reasons.push(pin.businessValue === "high" ? "high business value to them" : "limited business value"); }
  const urgent = lead.urgency === "asap" || (analysis.dimensions && analysis.dimensions.urgency.value >= 85);
  if (urgent) { mult *= 1.15; reasons.push("urgency / fast turnaround"); }

  const floor = roundNice(base.floor * mult);
  const standard = roundNice(base.standard * mult);
  const stretch = roundNice(base.stretch * mult);

  let model = "flat";
  if (pin.recurring) model = "retainer";
  else if (pin.timeRequired === "project" || pin.complexity === "high") model = "milestone";
  else if (cat === "home-service") model = pin.timeRequired === "quick" ? "flat" : "hourly";

  const included = baseIncluded(cat, model);
  const excluded = baseExcluded(cat);
  const rationale = buildRationale(cat, model, reasons, pin);

  return { model, floor, standard, stretch, rationale, included, excluded, userOverride: false, computedAt: new Date().toISOString() };
}

const MODEL_LABELS = { flat: "flat fee", hourly: "hourly", retainer: "monthly retainer", milestone: "milestone-based" };

function buildRationale(cat, model, reasons, pin) {
  const parts = [`Anchored to your ${cat.replace("-", " ")} base rates`];
  if (reasons.length) parts.push("adjusted for " + reasons.join(", "));
  parts.push(`billed as a ${MODEL_LABELS[model]}`);
  if (pin.recurring) parts.push("recurring work → price the ongoing relationship, not one task");
  if (pin.productizable) parts.push("this could become a repeatable productized service");
  return parts.join("; ") + ".";
}
function baseIncluded(cat, model) {
  const common = ["Scope agreed in writing first", "One round of revisions"];
  const byCat = {
    web: ["The specific fix/build requested", "Basic mobile check", "Quick handoff walkthrough"],
    automation: ["Working automation for the stated trigger", "A short how-it-works note"],
    app: ["Agreed core features", "Basic data backup/export", "Deploy + handoff"],
    "home-service": ["Labor for the described job", "Cleanup after"],
    design: ["Source files", "Agreed deliverables"],
    other: ["The work as described"],
  };
  const extra = model === "retainer" ? ["Defined monthly hours/scope"] : model === "milestone" ? ["Payment split across milestones"] : [];
  return [...(byCat[cat] || byCat.other), ...common, ...extra];
}
function baseExcluded(cat) {
  const byCat = {
    web: ["Ongoing maintenance (separate)", "Paid plugins/hosting", "Content writing unless stated"],
    automation: ["Third-party subscription costs", "Ongoing monitoring (separate)"],
    app: ["App-store fees", "Ongoing hosting/maintenance (separate)", "Major scope changes"],
    "home-service": ["Materials unless quoted", "Permits", "Pre-existing issues found mid-job"],
    design: ["Printing costs", "Stock assets unless stated"],
    other: ["Anything not explicitly listed"],
  };
  return byCat[cat] || byCat.other;
}
