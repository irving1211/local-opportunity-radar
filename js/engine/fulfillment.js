/* "Ways To Get It Done" recommender (PLAN.md §8). Pure. Ranks 6 fulfilment paths by
   category + difficulty + skills fit. */

const PATHS = {
  manual: { label: "Do it yourself, by hand", note: "Straightforward, full control, no tooling overhead." },
  "no-code": { label: "No-code tools", note: "Use existing platforms/builders — fast, low maintenance." },
  "ai-assisted-coding": { label: "AI-assisted coding", note: "You build it faster with coding assistance — your sweet spot." },
  automation: { label: "Lightweight automation", note: "Wire up a small automated workflow that runs itself." },
  "full-custom-app": { label: "Full custom app", note: "Build a tailored application — highest effort, highest ceiling." },
  "referral-subcontract": { label: "Refer / subcontract", note: "Outside your lane — hand off or partner and take a cut." },
};

// base suitability 0-100 by category
const SUIT = {
  "home-service":     { manual: 95, "no-code": 10, "ai-assisted-coding": 5,  automation: 10, "full-custom-app": 5,  "referral-subcontract": 55 },
  web:                { manual: 40, "no-code": 75, "ai-assisted-coding": 90, automation: 35, "full-custom-app": 55, "referral-subcontract": 40 },
  automation:         { manual: 30, "no-code": 70, "ai-assisted-coding": 80, automation: 92, "full-custom-app": 50, "referral-subcontract": 40 },
  app:                { manual: 20, "no-code": 55, "ai-assisted-coding": 88, automation: 45, "full-custom-app": 90, "referral-subcontract": 45 },
  design:             { manual: 70, "no-code": 72, "ai-assisted-coding": 45, automation: 20, "full-custom-app": 25, "referral-subcontract": 55 },
  other:             { manual: 60, "no-code": 55, "ai-assisted-coding": 50, automation: 40, "full-custom-app": 35, "referral-subcontract": 65 },
};

const SPEED = { manual: "fast", "no-code": "fast", "ai-assisted-coding": "medium", automation: "medium", "full-custom-app": "slow", "referral-subcontract": "fast" };
const DIFF  = { manual: "low", "no-code": "low", "ai-assisted-coding": "medium", automation: "medium", "full-custom-app": "high", "referral-subcontract": "low" };
const PROFIT = { manual: "medium", "no-code": "medium", "ai-assisted-coding": "high", automation: "high", "full-custom-app": "high", "referral-subcontract": "low" };
const RISK  = { manual: "low", "no-code": "medium", "ai-assisted-coding": "medium", automation: "medium", "full-custom-app": "high", "referral-subcontract": "low" };

export function fulfillment(lead, analysis, settings) {
  const cat = lead.category || "other";
  const suit = SUIT[cat] || SUIT.other;
  const skills = analysis && analysis.dimensions ? analysis.dimensions.skillsMatch.value : 60;
  const out = Object.keys(PATHS).map((key) => {
    let score = suit[key];
    // If it's outside your skills, nudge referral up and DIY paths down.
    if (skills < 45) {
      if (key === "referral-subcontract") score += 25;
      if (key === "ai-assisted-coding" || key === "full-custom-app") score -= 15;
    } else {
      if (key === "referral-subcontract") score -= 10;
    }
    return {
      path: key, label: PATHS[key].label, note: PATHS[key].note,
      speed: SPEED[key], difficulty: DIFF[key], likelyProfit: PROFIT[key], deliveryRisk: RISK[key],
      score: Math.max(0, Math.min(100, score)),
    };
  }).sort((a, b) => b.score - a.score);
  out.forEach((p, i) => { p.rank = i + 1; });
  return out;
}
