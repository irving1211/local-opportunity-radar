import * as store from "../store.js";
import { el, fmtDate } from "../util.js";
import { icon, segmented, field, toast, confirmSheet, openSheet } from "./components.js";
import { CATEGORIES, CATEGORY_LABELS, SCORE_DIMENSIONS, DIMENSION_LABELS, validateImport } from "../schema.js";
import { analyzeAll } from "../leadops.js";

const csv = (arr) => (arr || []).join(", ");
const fromCsv = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

export async function renderSettings(ctx) {
  const s = ctx.settings;
  const wrap = el("div");
  wrap.appendChild(el("div", { class: "head" }, [el("h1", { text: "Settings" }), el("div", { class: "head__sub", text: "All saved on this device" })]));
  const persist = () => store.saveSettings(s);

  // Theme
  wrap.appendChild(group("Appearance", [
    field("Theme", segmented([{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }], s.theme, (v) => { s.theme = v; persist(); ctx.refreshSettings(); ctx.reload(); })),
  ]));

  // Skills profile
  const skillToggles = [["homeService", "Home / handyman"], ["web", "Websites"], ["automation", "Automation"], ["app", "Custom apps"], ["design", "Design"]]
    .map(([k, label]) => toggleRow(label, s.skillsProfile[k], (v) => { s.skillsProfile[k] = v; persist(); }));
  const customSkills = el("input", { class: "input", value: csv(s.skillsProfile.customSkills), placeholder: "e.g. wordpress, zapier, drywall" });
  customSkills.addEventListener("blur", () => { s.skillsProfile.customSkills = fromCsv(customSkills.value); persist(); });
  wrap.appendChild(group("Your skills", [...skillToggles, field("Other skills (comma-separated)", customSkills, "Used to boost the Skills-fit score when a lead mentions them.")]));

  // Service area
  const homeBase = el("input", { class: "input", value: s.serviceArea.homeBase, placeholder: "City, State" });
  homeBase.addEventListener("blur", () => { s.serviceArea.homeBase = homeBase.value.trim(); persist(); });
  const nearby = el("input", { class: "input", value: csv(s.serviceArea.nearbyKeywords) });
  nearby.addEventListener("blur", () => { s.serviceArea.nearbyKeywords = fromCsv(nearby.value.toLowerCase()); persist(); });
  wrap.appendChild(group("Service area", [field("Home base", homeBase), field("Nearby places (comma-separated)", nearby, "A lead mentioning any of these scores higher on proximity.")]));

  // Keywords
  const hv = el("input", { class: "input", value: csv(s.keywords.highValue) });
  hv.addEventListener("blur", () => { s.keywords.highValue = fromCsv(hv.value.toLowerCase()); persist(); });
  const skip = el("input", { class: "input", value: csv(s.keywords.skip) });
  skip.addEventListener("blur", () => { s.keywords.skip = fromCsv(skip.value.toLowerCase()); persist(); });
  wrap.appendChild(group("Keywords", [field("High-value words", hv), field("Skip words", skip)]));

  // Base rates
  const rateRows = CATEGORIES.map((cat) => {
    const r = s.baseRates[cat] || { floor: 0, standard: 0, stretch: 0 };
    const mk = (key) => { const i = el("input", { class: "input", type: "number", inputmode: "numeric", value: r[key] }); i.addEventListener("blur", () => { s.baseRates[cat] = { ...s.baseRates[cat], [key]: parseInt(i.value, 10) || 0 }; persist(); }); return i; };
    return el("div", { class: "rate-grid" }, [el("label", { text: CATEGORY_LABELS[cat] }), mk("floor"), mk("standard"), mk("stretch")]);
  });
  wrap.appendChild(group("Base rates ($)", [el("div", { class: "rate-grid" }, [el("label", { class: "hint", text: "Category" }), el("label", { class: "hint", text: "Floor" }), el("label", { class: "hint", text: "Std" }), el("label", { class: "hint", text: "Stretch" })]), ...rateRows]));

  // Weights (advanced)
  const weightRows = SCORE_DIMENSIONS.map((d) => {
    const i = el("input", { class: "input", type: "number", step: "0.1", value: s.weights[d] ?? 1 });
    i.addEventListener("blur", () => { s.weights[d] = parseFloat(i.value) || 0; persist(); });
    return el("div", { class: "row row--between" }, [el("label", { text: DIMENSION_LABELS[d] }), el("div", { style: { width: "84px" } }, [i])]);
  });
  wrap.appendChild(el("details", { class: "set-group" }, [el("summary", { text: "Score weights (advanced)" }), el("div", { class: "stack", style: { marginTop: "var(--sp-12)" } }, weightRows)]));

  const rescore = el("button", { class: "btn btn--secondary btn--full" }, [icon("refresh", "btn__icon"), "Re-score all leads with current settings"]);
  rescore.addEventListener("click", () => onRescore(ctx));
  wrap.appendChild(el("div", { class: "set-group" }, [rescore]));

  // AI (off by default)
  wrap.appendChild(aiGroup(ctx, s, persist));

  // Allowed sources note
  wrap.appendChild(group("Allowed sources", [allowedSourcesNote()]));

  // Data
  wrap.appendChild(dataGroup(ctx, s));

  // Diagnostics link
  wrap.appendChild(el("button", { class: "btn btn--ghost btn--full", style: { marginTop: "var(--sp-8)" }, onclick: () => ctx.navigate("#/diagnostics") }, [icon("settings", "btn__icon"), "Diagnostics & recovery"]));
  wrap.appendChild(el("div", { class: "center hint", style: { marginTop: "var(--sp-24)" }, text: "Local Opportunity Radar v" + ctx.version.appVersion + " · runs offline · no tracking" }));

  return wrap;
}

function group(title, children) { return el("div", { class: "set-group" }, [el("h2", { text: title }), el("div", { class: "card stack" }, children)]); }

function toggleRow(label, checked, onChange) {
  const input = el("input", { type: "checkbox", checked });
  input.addEventListener("change", () => onChange(input.checked));
  return el("div", { class: "toggle-row" }, [el("span", { text: label }), el("span", { class: "switch" }, [input, el("span", { class: "switch__track" })])]);
}

function aiGroup(ctx, s, persist) {
  const enable = el("input", { type: "checkbox", checked: !!(s.ai && s.ai.enabled) });
  const key = el("input", { class: "input", type: "password", value: (s.ai && s.ai.apiKey) || "", placeholder: "sk-ant-…", autocomplete: "off" });
  const model = el("input", { class: "input", type: "text", value: (s.ai && s.ai.model) || "claude-haiku-4-5-20251001" });
  const testBtn = el("button", { class: "btn btn--secondary btn--sm" }, [icon("spark", "btn__icon"), "Test key"]);
  enable.addEventListener("change", () => { s.ai.enabled = enable.checked; store.setFlag("aiEnhance", enable.checked); persist(); ctx.refreshSettings(); });
  key.addEventListener("blur", () => { s.ai.apiKey = key.value.trim(); persist(); ctx.refreshSettings(); });
  model.addEventListener("blur", () => { s.ai.model = model.value.trim(); persist(); });
  testBtn.addEventListener("click", async () => {
    if (!key.value.trim()) { toast("Enter a key first", "error"); return; }
    testBtn.disabled = true; testBtn.textContent = "Testing…";
    try { const { testKey } = await import("../engine/ai.js"); s.ai.apiKey = key.value.trim(); persist(); const ok = await testKey(s); toast(ok ? "Key works" : "Key responded oddly", ok ? "success" : "error"); }
    catch (e) { toast(e.message, "error"); }
    finally { testBtn.disabled = false; testBtn.textContent = "Test key"; }
  });
  return el("div", { class: "set-group" }, [
    el("h2", { text: "AI enhance (optional)" }),
    el("div", { class: "card stack" }, [
      el("div", { class: "banner banner--warning", style: { borderRadius: "var(--r-sm)" }, text: "Off by default. When on, the lead's text is sent to Anthropic using YOUR key. The key is stored on this device and anyone with device access can read it. Everything else in the app works fully offline without this." }),
      el("div", { class: "toggle-row" }, [el("span", { text: "Enable AI enhance" }), el("span", { class: "switch" }, [enable, el("span", { class: "switch__track" })])]),
      field("Anthropic API key", key, "Excluded from normal backups."),
      field("Model", model),
      testBtn,
    ]),
  ]);
}

function allowedSourcesNote() {
  const ok = ["Manual entry", "Pasting a post you found", "Craigslist saved-search ALERT EMAIL (forwarded to yourself, then pasted)", "Google Alert email (pasted)", "Referrals from your own site/form", "Community boards with email/RSS you subscribe to"];
  const no = ["Automated Facebook collection", "Automated Craigslist scraping", "Login bots that mine posts", "Mass contact extraction"];
  return el("div", {}, [
    el("div", { class: "card__title", text: "Allowed" }),
    el("ul", { style: { marginBottom: "var(--sp-12)" } }, ok.map((x) => el("li", { class: "hint", text: "✓ " + x }))),
    el("div", { class: "card__title", text: "Never (by design)" }),
    el("ul", {}, no.map((x) => el("li", { class: "hint", text: "✕ " + x }))),
    el("p", { class: "hint", style: { marginTop: "var(--sp-8)" }, text: "Outreach is always manual — the app drafts, you decide whether to send." }),
  ]);
}

function dataGroup(ctx, s) {
  const exportBtn = el("button", { class: "btn btn--secondary btn--full" }, [icon("download", "btn__icon"), "Export backup (JSON)"]);
  exportBtn.addEventListener("click", async () => { await ctx.exportBackup(); s.lastBackupAt = new Date().toISOString(); store.saveSettings(s); toast("Backup downloaded", "success"); ctx.reload(); });

  const fileInput = el("input", { type: "file", accept: "application/json", style: { display: "none" } });
  const importBtn = el("button", { class: "btn btn--secondary btn--full" }, [icon("upload", "btn__icon"), "Import backup"]);
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => onImport(ctx, fileInput));

  const clearBtn = el("button", { class: "btn btn--danger btn--full" }, [icon("trash", "btn__icon"), "Delete all data"]);
  clearBtn.addEventListener("click", async () => {
    const ok = await confirmSheet("Delete ALL leads and history on this device? Export a backup first if unsure.", { okLabel: "Delete everything", danger: true });
    if (!ok) return;
    await store.clearAll(); store.writeSentinel(0, 0, s.lastBackupAt); toast("All data deleted"); ctx.navigate("#/dashboard");
  });

  return el("div", { class: "set-group" }, [
    el("h2", { text: "Your data" }),
    el("div", { class: "card stack" }, [
      el("div", { class: "hint", text: s.lastBackupAt ? "Last backup: " + new Date(s.lastBackupAt).toLocaleString() : "No backup yet — export one to be safe." }),
      exportBtn, importBtn, fileInput, clearBtn,
    ]),
  ]);
}

async function onImport(ctx, fileInput) {
  const file = fileInput.files[0]; fileInput.value = "";
  if (!file) return;
  const { LIMITS } = await import("../config.js");
  if (file.size > LIMITS.importBytes) { toast("That file is too large to import.", "error"); return; }
  let text; try { text = await file.text(); } catch { toast("Couldn't read the file.", "error"); return; }
  let obj; try { obj = JSON.parse(text); } catch { toast("That isn't valid JSON.", "error"); return; }
  const res = validateImport(obj);
  if (!res.ok) { toast("Import rejected: " + res.errors[0], "error"); return; }

  const mode = await modeSheet(res.data.leads.length);
  if (mode === "cancel") return;
  // Pre-import external backup before a destructive replace (PLAN.md §3, Round 3)
  if (mode === "replace") { await ctx.exportBackup(); toast("Saved a safety backup first"); }
  try {
    await store.importData(res.data, mode);
    if (res.data.settings) { const merged = { ...ctx.settings, ...res.data.settings, ai: ctx.settings.ai }; store.saveSettings(merged); ctx.refreshSettings(); }
    const leads = await store.getAllLeads(); const ev = await store.countEvents();
    store.writeSentinel(leads.length, ev, ctx.settings.lastBackupAt);
    toast(`Imported ${res.data.leads.length} leads`, "success");
    ctx.navigate("#/dashboard");
  } catch (e) { toast("Import failed: " + e.message, "error"); }
}

function modeSheet(n) {
  return new Promise((resolve) => {
    const body = el("div", { class: "stack" }, [
      el("p", { text: `Import ${n} leads. Merge keeps your current leads; Replace deletes them first (a safety backup is saved automatically).` }),
      el("button", { class: "btn btn--primary btn--full", text: "Merge", onclick: () => { resolve("merge"); close(); } }),
      el("button", { class: "btn btn--danger btn--full", text: "Replace everything", onclick: () => { resolve("replace"); close(); } }),
    ]);
    const close = openSheet("Import backup", body, { onClose: () => resolve("cancel") });
  });
}

async function onRescore(ctx) {
  const leads = await store.getAllLeads();
  let n = 0;
  for (const l of leads) { try { await store.putLead(analyzeAll(l, ctx.settings)); n++; } catch {} }
  toast(`Re-scored ${n} leads`, "success");
  ctx.reload();
}
