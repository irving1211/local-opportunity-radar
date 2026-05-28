import * as store from "../store.js";
import { el, clear } from "../util.js";
import { icon, gradeBadge, toast, emptyState, sourceChip } from "./components.js";
import { STAGES, STAGE_LABELS } from "../schema.js";
import { moveStage } from "../leadops.js";

export async function renderPipeline(ctx) {
  const wrap = el("div");
  wrap.appendChild(el("div", { class: "head" }, [el("h1", { text: "Pipeline" }), el("div", { class: "head__sub", text: "Swipe across · tap arrows to move" })]));

  const leads = await store.getAllLeads();
  if (leads.length === 0) { wrap.appendChild(el("div", { class: "card" }, [emptyState("board", "Nothing in the pipeline yet")])); return wrap; }

  const board = el("div", { class: "board" });
  wrap.appendChild(board);

  function build() {
    clear(board);
    for (let i = 0; i < STAGES.length; i++) {
      const stage = STAGES[i];
      const inStage = leads.filter((l) => l.stage === stage);
      const col = el("div", { class: "col" }, [
        el("div", { class: "col__head" }, [el("div", { class: "col__title", text: STAGE_LABELS[stage] }), el("div", { class: "col__count", text: String(inStage.length) })]),
      ]);
      for (const lead of inStage) col.appendChild(card(lead, i));
      if (inStage.length === 0) col.appendChild(el("div", { class: "hint", text: "—" }));
      board.appendChild(col);
    }
  }

  function card(lead, stageIdx) {
    const left = el("button", { class: "btn btn--ghost btn--sm", title: "Move left", disabled: stageIdx === 0 }, [icon("left", "btn__icon")]);
    const right = el("button", { class: "btn btn--ghost btn--sm", title: "Move right", disabled: stageIdx === STAGES.length - 1 }, [icon("right", "btn__icon")]);
    left.addEventListener("click", (e) => { e.stopPropagation(); move(lead, STAGES[stageIdx - 1]); });
    right.addEventListener("click", (e) => { e.stopPropagation(); move(lead, STAGES[stageIdx + 1]); });
    const c = el("div", { class: "kcard" }, [
      el("div", { class: "kcard__title", text: lead.title || "(untitled)" }),
      el("div", { style: { marginTop: "var(--sp-8)" } }, [sourceChip(lead)]),
      el("div", { class: "kcard__row" }, [
        gradeBadge(lead.analysis ? lead.analysis.grade : "D"),
        el("div", { class: "kcard__move" }, [left, right]),
      ]),
    ]);
    c.addEventListener("click", () => ctx.navigate("#/lead/" + lead.id));
    return c;
  }

  async function move(lead, toStage) {
    try {
      const saved = await moveStage(lead, toStage);
      const idx = leads.findIndex((l) => l.id === lead.id);
      if (idx >= 0) leads[idx] = saved;
      build();
      toast("Moved to " + STAGE_LABELS[toStage]);
    } catch (e) { toast(e.message, "error"); }
  }

  build();
  return wrap;
}
