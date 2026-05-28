import * as store from "../store.js";
import { el, clear, debounce } from "../util.js";
import { segmented, emptyState } from "./components.js";
import { leadRow } from "./dashboard.js";
import { GRADES } from "../schema.js";

const filt = { q: "", grade: "all", view: "open", sort: "score" };

export async function renderInbox(ctx) {
  const all = await store.getAllLeads();
  const wrap = el("div");
  wrap.appendChild(el("div", { class: "head" }, [el("h1", { text: "Inbox" }), el("div", { class: "head__sub", text: all.length + " leads" })]));

  const search = el("input", { class: "input", type: "search", placeholder: "Search leads…", value: filt.q, "aria-label": "Search leads" });
  const listHost = el("div", { class: "list" });

  const apply = () => {
    let rows = all.slice();
    if (filt.view === "open") rows = rows.filter((l) => !["booked", "lost", "ignored"].includes(l.stage));
    else if (filt.view === "archived") rows = rows.filter((l) => ["booked", "lost", "ignored"].includes(l.stage));
    if (filt.grade !== "all") rows = rows.filter((l) => l.analysis && l.analysis.grade === filt.grade);
    if (filt.q.trim()) {
      const q = filt.q.toLowerCase();
      rows = rows.filter((l) => (l.title + " " + l.rawText + " " + l.location).toLowerCase().includes(q));
    }
    rows.sort((a, b) => filt.sort === "newest"
      ? (b.createdAt || "").localeCompare(a.createdAt || "")
      : (b.analysis?.fitScore || 0) - (a.analysis?.fitScore || 0));
    clear(listHost);
    if (rows.length === 0) { listHost.appendChild(el("div", { class: "card" }, [emptyState("inbox", "No matching leads", "Try clearing filters or add a new lead.")])); return; }
    for (const lead of rows) listHost.appendChild(leadRow(lead, () => ctx.navigate("#/lead/" + lead.id)));
  };

  search.addEventListener("input", debounce((e) => { filt.q = e.target.value; apply(); }, 150));

  const filters = el("div", { class: "filters" }, [
    search,
    segmented([{ value: "open", label: "Open" }, { value: "all", label: "All" }, { value: "archived", label: "Archived" }], filt.view, (v) => { filt.view = v; apply(); }),
    el("div", { class: "row row--between" }, [
      segmented([{ value: "all", label: "All" }, ...GRADES.map((g) => ({ value: g, label: g }))], filt.grade, (v) => { filt.grade = v; apply(); }),
      segmented([{ value: "score", label: "Top" }, { value: "newest", label: "New" }], filt.sort, (v) => { filt.sort = v; apply(); }),
    ]),
  ]);

  wrap.appendChild(filters);
  wrap.appendChild(listHost);
  apply();
  return wrap;
}
