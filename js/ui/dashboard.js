import * as store from "../store.js";
import { el } from "../util.js";
import { icon, gradeBadge, chip, emptyState, sourceChip } from "./components.js";
import { STAGE_LABELS, RECOMMENDATIONS } from "../schema.js";
import { fmtRelative } from "../util.js";
import { countExampleLeads, loadExampleLeads, removeExampleLeads } from "../seed.js";

const isDue = (iso) => iso && new Date(iso).getTime() <= Date.now() + 86400000;

export function needsAction(lead) {
  if (["booked", "lost", "ignored"].includes(lead.stage)) return false;
  if (lead.stage === "new") return true;
  if (lead.analysis && ["reply-now", "high-fit-premium"].includes(lead.analysis.recommendation)) return true;
  if (lead.stage === "follow-up" && isDue(lead.followUpAt)) return true;
  if (isDue(lead.followUpAt)) return true;
  return false;
}

export async function renderDashboard(ctx) {
  const leads = await store.getAllLeads();
  const exampleCount = countExampleLeads(leads);
  const allExamples = leads.length > 0 && exampleCount === leads.length;
  const wrap = el("div");

  wrap.appendChild(el("div", { class: "head" }, [
    el("div", {}, [
      el("div", { class: "eyebrow", text: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) }),
      el("h1", { class: "display", text: "Radar", style: { marginTop: "var(--sp-4)" } }),
    ]),
    el("div", { class: "row", style: { gap: "var(--sp-8)" } }, [gradeBadgeLogo()]),
  ]));

  // Backup nudge
  const stale = leads.length > 0 && (!ctx.settings.lastBackupAt || (Date.now() - new Date(ctx.settings.lastBackupAt).getTime() > 14 * 86400000));
  if (stale) {
    wrap.appendChild(el("div", { class: "card", style: { borderColor: "var(--accent)", marginBottom: "var(--sp-16)" } }, [
      el("div", { class: "row row--between" }, [
        el("div", {}, [el("div", { style: { fontWeight: "500" }, text: "Back up your data" }), el("div", { class: "hint", text: "Your leads live on this device only. Export a copy." })]),
        el("button", { class: "btn btn--primary btn--sm", text: "Backup now", onclick: async () => { await ctx.exportBackup(); ctx.settings.lastBackupAt = new Date().toISOString(); store.saveSettings(ctx.settings); ctx.toast("Backup downloaded", "success"); ctx.reload(); } }),
      ]),
    ]));
  }

  if (leads.length === 0) {
    wrap.appendChild(el("div", { class: "card" }, [emptyState("radar", "No leads yet", "Add your first opportunity to get a score, a reply, and a price.")]));
    wrap.appendChild(el("button", { class: "btn btn--primary btn--full", style: { marginTop: "var(--sp-16)" }, text: "Add a lead", onclick: () => ctx.navigate("#/add") }));
    wrap.appendChild(el("button", {
      class: "btn btn--secondary btn--full",
      style: { marginTop: "var(--sp-8)" },
      text: "Load example leads",
      onclick: async () => {
        const added = await loadExampleLeads(ctx.settings);
        ctx.toast(added ? `Loaded ${added} example leads` : "Example leads are already loaded", added ? "success" : "");
        ctx.reload();
      },
    }));
    return wrap;
  }

  if (exampleCount > 0) {
    wrap.appendChild(el("div", { class: "card", style: { marginBottom: "var(--sp-16)", borderColor: "var(--accent)" } }, [
      el("div", { class: "stack" }, [
        el("div", { style: { fontWeight: "500" }, text: allExamples ? "These are example leads" : `${exampleCount} example lead${exampleCount === 1 ? "" : "s"} still in this app` }),
        el("div", { class: "hint", text: allExamples ? "The app is working, but you're still looking at demo data. Add your own lead or remove these examples to start using it for real." : "You can keep these for testing or remove them now." }),
        el("div", { class: "row", style: { gap: "var(--sp-8)", flexWrap: "wrap" } }, [
          el("button", { class: "btn btn--primary btn--sm", text: "Add a real lead", onclick: () => ctx.navigate("#/add") }),
          el("button", {
            class: "btn btn--secondary btn--sm",
            text: "Remove example leads",
            onclick: async () => {
              const removed = await removeExampleLeads();
              ctx.toast(removed ? `Removed ${removed} example leads` : "No example leads found", removed ? "success" : "");
              ctx.reload();
            },
          }),
        ]),
      ]),
    ]));
  }

  // Stats
  const open = leads.filter((l) => !["booked", "lost", "ignored"].includes(l.stage));
  const na = leads.filter(needsAction);
  const booked = leads.filter((l) => l.stage === "booked");
  const stat = (num, label) => el("div", { class: "stat" }, [el("div", { class: "stat__num", text: String(num) }), el("div", { class: "stat__label", text: label })]);
  wrap.appendChild(el("div", { class: "stat-grid", style: { marginBottom: "var(--sp-16)" } }, [
    stat(leads.length, "Total"), stat(open.length, "Open"), stat(na.length, "To do"), stat(booked.length, "Booked"),
  ]));

  // Grade distribution
  const byGrade = (g) => leads.filter((l) => l.analysis && l.analysis.grade === g).length;
  const gcell = (g, label, color) => {
    const cell = el("div", { class: "gcell" }, [
      el("div", { class: "gcell__top" }, [el("span", { class: "gcell__tag", text: g }), el("b", { text: String(byGrade(g)) })]),
      el("small", { text: label }),
    ]);
    cell.style.setProperty("--g", color);
    return cell;
  };
  wrap.appendChild(el("div", { class: "eyebrow", style: { marginBottom: "var(--sp-8)" }, text: "Grade mix" }));
  wrap.appendChild(el("div", { class: "grade-bar", style: { marginBottom: "var(--sp-32)" } }, [
    gcell("A", "High value", "var(--grade-a)"),
    gcell("B", "Pursue", "var(--grade-b)"),
    gcell("C", "If slow", "var(--grade-c)"),
    gcell("D", "Skip", "var(--grade-d)"),
  ]));

  // Needs action
  wrap.appendChild(el("h2", { style: { marginBottom: "var(--sp-8)" }, text: "Needs your attention" }));
  if (na.length === 0) {
    wrap.appendChild(el("div", { class: "card muted", text: "You're all caught up. Nice." }));
  } else {
    const list = el("div", { class: "list" });
    na.sort((a, b) => (b.analysis?.fitScore || 0) - (a.analysis?.fitScore || 0));
    for (const lead of na.slice(0, 8)) list.appendChild(leadRow(lead, () => ctx.navigate("#/lead/" + lead.id)));
    wrap.appendChild(list);
  }
  return wrap;
}

function gradeBadgeLogo() {
  return el("div", { class: "row", style: { gap: "6px", color: "var(--accent)" } }, [icon("radar", "ico")]);
}

export function leadRow(lead, onClick) {
  const a = lead.analysis || {};
  const reco = a.recommendation ? RECOMMENDATIONS[a.recommendation] : null;
  const meta = el("div", { class: "lrow__meta" }, [
    sourceChip(lead),
    el("span", { class: "dot-sep", text: "·" }),
    el("span", { text: STAGE_LABELS[lead.stage] || lead.stage }),
    el("span", { class: "dot-sep", text: "·" }),
    el("span", { text: fmtRelative(lead.createdAt) }),
  ]);
  const main = el("div", { class: "lrow__main" }, [
    el("div", { class: "lrow__title", text: lead.title || "(untitled lead)" }),
    reco ? el("div", { style: { marginTop: "6px" } }, [chip(reco.label, reco.tone)]) : null,
    meta,
  ]);
  return el("button", { class: "lrow", type: "button", onclick: onClick }, [
    gradeBadge(a.grade || "D"), main, icon("right", "ico lrow__chev"),
  ]);
}
