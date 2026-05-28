import * as store from "../store.js";
import { el, byteLen } from "../util.js";
import { icon, segmented, field, toast, openSheet } from "./components.js";
import { CATEGORIES, CATEGORY_LABELS, SOURCES, SOURCE_LABELS, URGENCY, URGENCY_LABELS, SOURCE_DETAIL_HINT, newLead, normalizeContact } from "../schema.js";
import { parse } from "../engine/parse.js";
import { analyzeAll } from "../leadops.js";
import { LIMITS } from "../config.js";

export async function renderAdd(ctx) {
  const wrap = el("div");
  wrap.appendChild(el("div", { class: "head" }, [el("h1", { text: "Add a lead" }), el("div", { class: "head__sub", text: "Paste a post or fill it in" })]));

  let mode = "paste";
  const modeSeg = segmented([{ value: "paste", label: "Smart paste" }, { value: "form", label: "Manual form" }], mode, (v) => { mode = v; pasteBox.hidden = v !== "paste"; render(); });
  wrap.appendChild(modeSeg);

  // Paste area
  const blob = el("textarea", { class: "textarea", placeholder: "Paste the post or the forwarded alert email here…" });
  const confBanner = el("div");
  const analyzeBtn = el("button", { class: "btn btn--primary btn--full" }, [icon("spark", "btn__icon"), "Read & pre-fill"]);
  const pasteBox = el("div", { class: "stack", style: { marginTop: "var(--sp-12)" } }, [
    field("Pasted text", blob, "This stays on your device. Nothing is fetched or scraped."),
    analyzeBtn, confBanner,
  ]);
  wrap.appendChild(pasteBox);

  // Review form
  const f = {
    source: el("select", { class: "select" }, SOURCES.map((s) => el("option", { value: s, text: SOURCE_LABELS[s], selected: s === "paste" }))),
    sourceDetail: el("input", { class: "input", type: "text", placeholder: SOURCE_DETAIL_HINT.paste }),
    title: el("input", { class: "input", type: "text", placeholder: "Short title" }),
    category: el("select", { class: "select" }, CATEGORIES.map((c) => el("option", { value: c, text: CATEGORY_LABELS[c] }))),
    urgency: el("select", { class: "select" }, URGENCY.map((u) => el("option", { value: u, text: URGENCY_LABELS[u] }))),
    location: el("input", { class: "input", type: "text", placeholder: "City / area" }),
    contact: el("input", { class: "input", type: "text", placeholder: "Email, phone, or @handle" }),
    budgetClue: el("input", { class: "input", type: "text", placeholder: "Any budget hint, e.g. $400-600" }),
    rawText: el("textarea", { class: "textarea", placeholder: "The full post text" }),
  };
  const sourceDetailField = field("Where it came from", f.sourceDetail, "Helps you triage at a glance.");
  f.source.addEventListener("change", () => { f.sourceDetail.placeholder = SOURCE_DETAIL_HINT[f.source.value] || ""; });
  const formCard = el("div", { class: "card stack" }, [
    el("div", { class: "eyebrow", text: "Source" }),
    el("div", { class: "row", style: { gap: "var(--sp-8)", alignItems: "flex-end" } }, [el("div", { class: "grow" }, [field("Channel", f.source)]), el("div", { class: "grow" }, [sourceDetailField])]),
    el("div", { class: "divider" }),
    field("Title", f.title),
    el("div", { class: "row", style: { gap: "var(--sp-8)" } }, [el("div", { class: "grow" }, [field("Category", f.category)]), el("div", { class: "grow" }, [field("Urgency", f.urgency)])]),
    field("Location", f.location),
    field("Contact", f.contact, "Used only to build a tap-to-send link. You still send manually."),
    field("Budget hint", f.budgetClue),
    field("Full text", f.rawText),
  ]);

  const saveBtn = el("button", { class: "btn btn--primary btn--full", style: { marginTop: "var(--sp-16)" } }, [icon("check", "btn__icon"), "Save & analyze"]);

  const formWrap = el("div", { style: { marginTop: "var(--sp-16)" } }, [formCard, saveBtn]);
  wrap.appendChild(formWrap);

  function render() { /* mode visibility handled inline; review form always visible so paste pre-fills it */ }

  analyzeBtn.addEventListener("click", () => {
    const text = blob.value.trim();
    if (!text) { toast("Paste some text first"); return; }
    if (byteLen(text) > LIMITS.rawTextBytes) { toast("That text is too large — trim it down.", "error"); return; }
    const res = parse(text, f.source.value, ctx.flags);
    if (res.source) { f.source.value = res.source; f.sourceDetail.placeholder = SOURCE_DETAIL_HINT[res.source] || ""; }
    f.title.value = res.fields.title || "";
    f.category.value = res.fields.category || "other";
    f.urgency.value = res.fields.urgency || "unknown";
    f.location.value = res.fields.location || "";
    f.contact.value = res.fields.contactRaw || "";
    f.budgetClue.value = res.fields.budgetClue || "";
    f.rawText.value = res.fields.rawText || text;
    confBanner.replaceChildren(el("div", {
      class: "banner banner--" + (res.confidence === "high" ? "info" : "warning"),
      style: { borderRadius: "var(--r-sm)", marginTop: "var(--sp-8)" },
      text: res.confidence === "high"
        ? "Pre-filled the fields below — please check them before saving."
        : (res.note || "Couldn't confidently read this — please check every field below."),
    }));
    f.title.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  saveBtn.addEventListener("click", () => onSave());

  async function onSave() {
    const title = f.title.value.trim();
    const rawText = f.rawText.value;
    if (!title && !rawText) { toast("Add at least a title or some text", "error"); return; }
    if (byteLen(rawText) > LIMITS.rawTextBytes) { toast("Text too large.", "error"); return; }
    for (const k of ["title", "location", "budgetClue", "sourceDetail"]) if (byteLen(f[k].value) > LIMITS.shortFieldBytes) { toast(k + " is too long.", "error"); return; }

    const partial = {
      source: f.source.value,
      sourceDetail: f.sourceDetail.value.trim(),
      title, rawText,
      category: f.category.value, urgency: f.urgency.value,
      location: f.location.value.trim(), budgetClue: f.budgetClue.value.trim(),
      contact: normalizeContact(f.contact.value),
    };
    const candidate = newLead(partial);

    // Dedupe check (PLAN.md §4)
    const existing = await store.getAllLeads();
    const dup = existing.find((l) => l.fingerprint === candidate.fingerprint);
    if (dup) {
      const action = await dupSheet(dup);
      if (action === "cancel") return;
      if (action === "open") { ctx.navigate("#/lead/" + dup.id); return; }
      if (action === "merge") {
        const merged = { ...dup, rawText: (dup.rawText + "\n\n— merged —\n" + rawText).slice(0, LIMITS.rawTextBytes), notes: dup.notes };
        const computed = analyzeAll(merged, ctx.settings);
        const saved = await store.putLead(computed);
        toast("Merged into existing lead", "success");
        ctx.navigate("#/lead/" + saved.id); return;
      }
      // action === 'new' falls through to save
    }

    try {
      const computed = analyzeAll(candidate, ctx.settings);
      const saved = await store.putLead(computed);
      const ev = await store.countEvents();
      store.writeSentinel(existing.length + 1, ev, ctx.settings.lastBackupAt);
      toast("Lead saved & analyzed", "success");
      ctx.navigate("#/lead/" + saved.id);
    } catch (e) { toast(e.message, "error"); }
  }

  return wrap;
}

function dupSheet(dup) {
  return new Promise((resolve) => {
    const mk = (label, val, cls) => el("button", { class: "btn " + cls + " btn--full", text: label, onclick: () => { resolve(val); close(); } });
    const body = el("div", { class: "stack" }, [
      el("p", { text: "This looks like a possible duplicate of an existing lead:" }),
      el("div", { class: "card", text: dup.title || "(untitled)" }),
      mk("Open the existing lead", "open", "btn--secondary"),
      mk("Merge into existing", "merge", "btn--secondary"),
      mk("Save as a new lead anyway", "new", "btn--primary"),
    ]);
    const close = openSheet("Possible duplicate", body, { onClose: () => resolve("cancel") });
  });
}
