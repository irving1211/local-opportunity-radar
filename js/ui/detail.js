import * as store from "../store.js";
import { el, clear, fmtMoney, fmtDate, copyToClipboard } from "../util.js";
import { icon, gradeBadge, chip, segmented, confirmSheet, toast, meter, field } from "./components.js";
import {
  STAGES, STAGE_LABELS, CATEGORY_LABELS, DIMENSION_LABELS, RECOMMENDATIONS, SCORE_DIMENSIONS,
} from "../schema.js";
import { analyzeAll, moveStage, recordSnapshot, deepLink } from "../leadops.js";
import { buildMessages, TONES, TONE_LABELS } from "../engine/message.js";
import { price } from "../engine/pricing.js";

export async function renderDetail(ctx, id) {
  let lead = await store.getLead(id);
  const wrap = el("div");
  if (!lead) { wrap.appendChild(el("div", { class: "empty" }, [el("div", { text: "Lead not found." }), el("a", { href: "#/inbox", text: "Back to inbox" })])); return wrap; }

  // back bar
  wrap.appendChild(el("div", { class: "row row--between", style: { marginBottom: "var(--sp-12)" } }, [
    el("button", { class: "btn btn--ghost btn--sm", onclick: () => ctx.navigate("#/inbox") }, [icon("back", "btn__icon"), "Inbox"]),
    el("button", { class: "btn btn--ghost btn--sm", onclick: () => onDelete(), title: "Delete lead" }, [icon("trash", "btn__icon")]),
  ]));

  const body = el("div");
  wrap.appendChild(body);

  async function save(patch) {
    try { lead = await store.putLead({ ...lead, ...patch }); }
    catch (e) { toast(e.message, "error"); throw e; }
  }
  async function reanalyze(extra = {}) {
    const computed = analyzeAll({ ...lead, ...extra }, ctx.settings);
    lead = await store.putLead(computed);
    rebuild();
  }

  async function rebuild() {
    clear(body);
    const a = lead.analysis || {};
    // Header
    body.appendChild(el("div", { class: "detail-head" }, [
      gradeBadge(a.grade || "D", true),
      el("div", { class: "detail-head__main" }, [
        el("h1", { text: lead.title || "(untitled lead)" }),
        el("div", { class: "lrow__meta", style: { marginTop: "6px" } }, [
          chip(CATEGORY_LABELS[lead.category] || lead.category),
          lead.location ? chip(lead.location) : null,
          chip(STAGE_LABELS[lead.stage]),
        ]),
      ]),
    ]));

    // Recommendation
    if (a.recommendation) {
      const r = RECOMMENDATIONS[a.recommendation];
      body.appendChild(el("div", { class: "reco", style: { marginBottom: "var(--sp-8)" } }, [
        icon(a.worthReplying ? "check" : "alert", "ico"),
        el("div", {}, [el("div", { style: { fontWeight: "500" }, text: r.label }), el("div", { class: "hint", text: a.summary || "" })]),
      ]));
    }

    body.appendChild(sectionScore(a));
    body.appendChild(sectionStage());
    body.appendChild(sectionMessages());
    body.appendChild(sectionPricing());
    body.appendChild(sectionFulfillment());
    body.appendChild(sectionNotes());
    body.appendChild(await sectionTimeline());
    body.appendChild(sectionRaw());
  }

  // ---------- Score + dimensions ----------
  function sectionScore(a) {
    const sec = el("div", { class: "section" }, [el("h2", { text: "Fit analysis" })]);
    const ring = el("div", { class: "ring" }, [el("div", { class: "ring__inner" }, [el("div", { class: "ring__num", text: String(a.fitScore ?? 0) })])]);
    ring.style.setProperty("--pct", String(a.fitScore ?? 0));
    ring.style.setProperty("--ring-color", a.grade === "A" ? "var(--success)" : a.grade === "D" ? "var(--text-3)" : "var(--accent)");
    const head = el("div", { class: "row", style: { gap: "var(--sp-16)", marginBottom: "var(--sp-12)" } }, [
      ring,
      el("div", { class: "grow" }, [
        el("div", { class: "row row--wrap", style: { gap: "var(--sp-8)" } }, [
          chip("Difficulty: " + (a.difficulty || "—")),
          chip("Turnaround: " + (a.turnaround || "—")),
        ]),
        ...(a.riskNotes && a.riskNotes.length ? [el("ul", { class: "stack", style: { marginTop: "var(--sp-8)" } }, a.riskNotes.map((n) => el("li", { class: "hint", text: "⚠ " + n })))] : []),
      ]),
    ]);
    sec.appendChild(head);
    const dims = el("div", { class: "card" });
    for (const d of SCORE_DIMENSIONS) {
      const dd = (a.dimensions && a.dimensions[d]) || { value: 0, why: "" };
      dims.appendChild(el("div", { class: "dim" }, [
        el("div", { class: "dim__name", text: DIMENSION_LABELS[d] }),
        meter(dd.value, dd.value >= 70 ? "var(--success)" : dd.value <= 35 ? "var(--text-3)" : "var(--accent)"),
        el("div", { class: "mono tertiary", text: String(dd.value) }),
        el("div", { class: "dim__why", text: dd.why }),
      ]));
    }
    sec.appendChild(dims);
    return sec;
  }

  // ---------- Stage + workflow ----------
  function sectionStage() {
    const sec = el("div", { class: "section" }, [el("h2", { text: "Status & follow-up" })]);
    const stageSel = el("select", { class: "select" }, STAGES.map((s) => el("option", { value: s, text: STAGE_LABELS[s], selected: s === lead.stage })));
    stageSel.addEventListener("change", async () => { try { lead = await moveStage(lead, stageSel.value); rebuild(); } catch (e) { toast(e.message, "error"); } });

    const fu = el("input", { class: "input", type: "date", value: lead.followUpAt ? lead.followUpAt.slice(0, 10) : "" });
    fu.addEventListener("change", () => save({ followUpAt: fu.value ? new Date(fu.value).toISOString() : null }).then(() => toast("Saved")));

    const next = el("input", { class: "input", type: "text", value: lead.nextAction || "", placeholder: "e.g. send quote, call back Tuesday" });
    next.addEventListener("blur", () => { if (next.value !== lead.nextAction) save({ nextAction: next.value }).then(() => toast("Saved")); });

    sec.appendChild(el("div", { class: "card stack" }, [
      field("Pipeline stage", stageSel),
      field("Follow up on", fu),
      field("Next action", next),
    ]));
    return sec;
  }

  // ---------- Messages ----------
  function sectionMessages() {
    const sec = el("div", { class: "section" }, [el("h2", { text: "Suggested reply" })]);
    let tone = (lead.messages && lead.messages.tone) || "local-friendly";
    let variant = "first_normal";
    const VARIANTS = [
      { key: "first_short", label: "Short" },
      { key: "first_normal", label: "Normal" },
      { key: "first_premium", label: "Premium" },
      { key: "follow_up", label: "Follow-up" },
    ];
    const msgHost = el("div");

    const renderMsg = () => {
      const m = lead.messages || buildMessages(lead, lead.analysis, lead.pricing, ctx.settings, tone);
      clear(msgHost);
      const text = m[variant] || "";
      const box = el("div", { class: "msg-box" }, [el("pre", { text })]);
      const actions = el("div", { class: "row row--wrap", style: { marginTop: "var(--sp-8)", gap: "var(--sp-8)" } });
      // Copy
      actions.appendChild(el("button", { class: "btn btn--secondary btn--sm", onclick: async () => {
        const ok = await copyToClipboard(text);
        await recordSnapshot(lead, { channel: "copy", tone, variant, text });
        toast(ok ? "Copied — and logged to timeline" : "Copy failed", ok ? "success" : "error");
      } }, [icon("copy", "btn__icon"), "Copy"]));
      // Email / Text deep links
      const dlEmail = deepLink(lead.contact, m.subject, text);
      if (dlEmail && dlEmail.kind === "email") {
        const a = el("a", { class: "btn btn--secondary btn--sm", href: dlEmail.href }, [icon("mail", "btn__icon"), "Email"]);
        a.addEventListener("click", () => recordSnapshot(lead, { channel: "email", tone, variant, text }));
        actions.appendChild(a);
      }
      const dlSms = deepLink(lead.contact, "", text);
      if (dlSms && dlSms.kind === "sms") {
        const a = el("a", { class: "btn btn--secondary btn--sm", href: dlSms.href }, [icon("message", "btn__icon"), "Text"]);
        a.addEventListener("click", () => recordSnapshot(lead, { channel: "sms", tone, variant, text }));
        actions.appendChild(a);
      }
      msgHost.appendChild(box);
      msgHost.appendChild(actions);
      if (lead.contact && (lead.contact.type === "none" || lead.contact.type === "other"))
        msgHost.appendChild(el("div", { class: "hint", style: { marginTop: "var(--sp-8)" }, text: "No tappable contact — copy the message and reach out manually. Outreach is always your call." }));
    };

    const toneSeg = segmented(TONES.map((t) => ({ value: t, label: TONE_LABELS[t] })), tone, async (v) => {
      tone = v;
      lead = await store.putLead({ ...lead, messages: buildMessages(lead, lead.analysis, lead.pricing, ctx.settings, tone) });
      toneSeg.querySelectorAll(".seg__btn").forEach((b) => { const on = b.textContent === TONE_LABELS[v]; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); });
      renderMsg();
    });
    const varSeg = segmented(VARIANTS.map((v) => ({ value: v.key, label: v.label })), variant, (v) => {
      variant = v;
      varSeg.querySelectorAll(".seg__btn").forEach((b) => { const lbl = VARIANTS.find((x) => x.key === v).label; const on = b.textContent === lbl; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); });
      renderMsg();
    }, { wrap: true });

    sec.appendChild(el("div", { class: "stack" }, [toneSeg, varSeg, msgHost]));

    // AI enhance (opt-in)
    if (ctx.flags.aiEnhance && ctx.settings.ai && ctx.settings.ai.enabled && ctx.settings.ai.apiKey) {
      const btn = el("button", { class: "btn btn--secondary btn--sm", style: { marginTop: "var(--sp-8)" } }, [icon("spark", "btn__icon"), "AI enhance reply"]);
      btn.addEventListener("click", () => onAIEnhance(btn));
      sec.appendChild(btn);
      sec.appendChild(el("div", { class: "hint", style: { marginTop: "4px" }, text: "Sends this lead's text to Anthropic with your key." }));
    }
    renderMsg();
    return sec;
  }

  async function onAIEnhance(btn) {
    btn.disabled = true; btn.textContent = "Enhancing…";
    try {
      const { enhance } = await import("../engine/ai.js");
      const out = await enhance(lead, lead.analysis, lead.messages, ctx.settings);
      const m = { ...lead.messages };
      if (out.first_normal) m.first_normal = out.first_normal;
      if (out.first_premium) m.first_premium = out.first_premium;
      if (out.follow_up) m.follow_up = out.follow_up;
      m.platform_safe = m.first_normal;
      const a = { ...lead.analysis }; if (out.summary) a.summary = out.summary;
      lead = await store.putLead({ ...lead, messages: m, analysis: a, aiEnhanced: true });
      toast("Reply enhanced", "success"); rebuild();
    } catch (e) { toast(e.message, "error"); btn.disabled = false; btn.textContent = "AI enhance reply"; }
  }

  // ---------- Pricing ----------
  function sectionPricing() {
    const sec = el("div", { class: "section" }, [el("h2", { text: "Suggested price" })]);
    const p = lead.pricing || {};
    const pin = lead.pricingInputs || {};
    const tiers = el("div", { class: "price-tier" }, [
      tier("Floor", p.floor), tier("Standard", p.standard, true), tier("Stretch", p.stretch),
    ]);
    sec.appendChild(tiers);
    sec.appendChild(el("div", { class: "card", style: { marginTop: "var(--sp-8)" } }, [
      el("div", { class: "hint", text: "Model: " + (p.model || "flat") }),
      el("p", { style: { marginTop: "var(--sp-4)" }, text: p.rationale || "" }),
      el("div", { class: "row row--wrap", style: { marginTop: "var(--sp-8)", gap: "var(--sp-16)" } }, [
        listCol("Included", p.included || []),
        listCol("Not included", p.excluded || []),
      ]),
    ]));

    // Editable factors → re-price
    const sel = (label, key, opts) => {
      const s = el("select", { class: "select" }, opts.map((o) => el("option", { value: o, text: o, selected: pin[key] === o })));
      s.addEventListener("change", async () => { const np = { ...pin, [key]: s.value }; lead = await store.putLead({ ...lead, pricingInputs: np, pricing: price({ ...lead, pricingInputs: np }, lead.analysis, ctx.settings) }); rebuild(); });
      return field(label, s);
    };
    const recurChk = el("input", { type: "checkbox", checked: !!pin.recurring });
    recurChk.addEventListener("change", async () => { const np = { ...pin, recurring: recurChk.checked }; lead = await store.putLead({ ...lead, pricingInputs: np, pricing: price({ ...lead, pricingInputs: np }, lead.analysis, ctx.settings) }); rebuild(); });

    const det = el("details", { class: "card", style: { marginTop: "var(--sp-8)" } }, [
      el("summary", { text: "Adjust pricing factors" }),
      el("div", { class: "stack", style: { marginTop: "var(--sp-12)" } }, [
        sel("Time required", "timeRequired", ["quick", "half-day", "multi-day", "project"]),
        sel("Complexity", "complexity", ["low", "medium", "high"]),
        sel("Business value to them", "businessValue", ["low", "medium", "high"]),
        el("label", { class: "row", style: { gap: "var(--sp-8)" } }, [recurChk, el("span", { text: "Recurring / ongoing work" })]),
      ]),
    ]);
    sec.appendChild(det);
    return sec;
  }

  // ---------- Fulfillment ----------
  function sectionFulfillment() {
    const sec = el("div", { class: "section" }, [el("h2", { text: "Ways to get it done" })]);
    const list = el("div", { class: "stack" });
    for (const f of (lead.fulfillment || []).slice(0, 4)) {
      list.appendChild(el("div", { class: "path" }, [
        el("div", { class: "path__name", text: f.label }),
        el("div", { class: "path__rank", text: "#" + f.rank }),
        el("div", { class: "path__note", text: f.note }),
        el("div", { class: "path__stats" }, [
          chip("speed: " + f.speed), chip("effort: " + f.difficulty),
          chip("profit: " + f.likelyProfit, f.likelyProfit === "high" ? "success" : ""),
          chip("risk: " + f.deliveryRisk, f.deliveryRisk === "high" ? "error" : ""),
        ]),
      ]));
    }
    sec.appendChild(list);
    return sec;
  }

  // ---------- Notes ----------
  function sectionNotes() {
    const sec = el("div", { class: "section" }, [el("h2", { text: "Your notes" })]);
    const ta = el("textarea", { class: "textarea", placeholder: "Private notes — call outcomes, details, reminders…", value: lead.notes || "" });
    ta.addEventListener("blur", () => { if (ta.value !== lead.notes) save({ notes: ta.value }).then(() => toast("Notes saved")); });
    sec.appendChild(ta);
    return sec;
  }

  // ---------- Timeline ----------
  async function sectionTimeline() {
    const sec = el("div", { class: "section" }, [el("h2", { text: "Timeline" })]);
    const events = await store.getEventsForLead(lead.id, 50);
    if (!events.length) { sec.appendChild(el("div", { class: "hint", text: "Stage changes and copied/sent messages will appear here." })); return sec; }
    const tl = el("div", { class: "timeline" });
    for (const ev of events) {
      let label = "";
      if (ev.kind === "stage-change") label = `Moved ${STAGE_LABELS[ev.from] || ev.from} → ${STAGE_LABELS[ev.to] || ev.to}`;
      else if (ev.kind === "snapshot") label = `${ev.channel === "copy" ? "Copied" : ev.channel === "email" ? "Emailed" : "Texted"} ${ev.variant.replace("first_", "").replace("_", " ")} reply`;
      const item = el("div", { class: "tl-item" }, [
        el("div", { text: label }),
        el("div", { class: "tl-item__when", text: new Date(ev.at).toLocaleString() }),
      ]);
      if (ev.kind === "snapshot" && ev.text) {
        const d = el("details", { style: { marginTop: "4px" } }, [el("summary", { class: "hint", text: "view sent text" }), el("div", { class: "rawbox", style: { marginTop: "4px" }, text: ev.text })]);
        item.appendChild(d);
      }
      tl.appendChild(item);
    }
    sec.appendChild(tl);
    return sec;
  }

  // ---------- Raw post ----------
  function sectionRaw() {
    const sec = el("div", { class: "section" }, [el("h2", { text: "Original post" })]);
    sec.appendChild(el("div", { class: "rawbox", text: lead.rawText || "(no text)" }));
    if (lead.contact && lead.contact.raw) sec.appendChild(el("div", { class: "hint", style: { marginTop: "var(--sp-8)" }, text: "Contact: " + lead.contact.raw + " (" + lead.contact.type + ")" }));
    const re = el("button", { class: "btn btn--ghost btn--sm", style: { marginTop: "var(--sp-12)" }, onclick: () => reanalyze() }, [icon("refresh", "btn__icon"), "Re-run analysis"]);
    sec.appendChild(re);
    return sec;
  }

  async function onDelete() {
    const ok = await confirmSheet("Delete this lead and its history? This can't be undone.", { okLabel: "Delete", danger: true });
    if (!ok) return;
    await store.deleteLead(lead.id);
    toast("Lead deleted");
    ctx.navigate("#/inbox");
  }

  await rebuild();
  return wrap;
}

function tier(label, val, mid = false) {
  return el("div", { class: "tier" + (mid ? " tier--mid" : "") }, [el("div", { class: "tier__label", text: label }), el("div", { class: "tier__val", text: fmtMoney(val) })]);
}
function listCol(title, items) {
  return el("div", { class: "grow", style: { minWidth: "140px" } }, [
    el("div", { class: "card__title", style: { marginBottom: "var(--sp-4)" }, text: title }),
    el("ul", {}, items.map((i) => el("li", { class: "hint", text: "· " + i }))),
  ]);
}
