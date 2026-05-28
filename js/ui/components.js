import { el, clear } from "../util.js";

const SVGNS = "http://www.w3.org/2000/svg";
const ICONS = {
  dashboard: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  inbox: ["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"],
  plus: ["M12 5v14", "M5 12h14"],
  board: ["M3 3h18v18H3z", "M9 3v18", "M15 3v18"],
  settings: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  search: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "M21 21l-4.35-4.35"],
  copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
  mail: ["M4 4h16v16H4z", "M4 6l8 6 8-6"],
  message: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  back: ["M19 12H5", "M12 19l-7-7 7-7"],
  right: ["M9 18l6-6-6-6"],
  left: ["M15 18l-6-6 6-6"],
  alert: ["M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  check: ["M20 6L9 17l-5-5"],
  x: ["M18 6L6 18", "M6 6l12 12"],
  dollar: ["M12 1v22", "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  pin: ["M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z", "M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0"],
  spark: ["M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"],
  upload: ["M12 21V9", "M7 14l5-5 5 5", "M5 3h14"],
  refresh: ["M21 12a9 9 0 1 1-3-6.7L21 8", "M21 3v5h-5"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 14h10l1-14"],
  radar: ["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0", "M12 12m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0", "M12 12L18 6"],
  flag: ["M4 22V4", "M4 4h13l-2 4 2 4H4"],
};

export function icon(name, cls = "ico") {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  for (const d of (ICONS[name] || [])) {
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}

let toastTimer = null;
export function toast(msg, type = "") {
  const host = document.getElementById("toast-host");
  if (!host) return;
  clear(host);
  const t = el("div", { class: "toast" + (type ? " toast--" + type : ""), role: "status", text: msg });
  host.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => clear(host), 2600);
}

export function openSheet(title, contentNode, { onClose } = {}) {
  const prevFocus = document.activeElement;
  const sheet = el("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title });
  sheet.appendChild(el("div", { class: "sheet__handle" }));
  if (title) sheet.appendChild(el("h2", { text: title, style: { marginBottom: "var(--sp-16)" } }));
  sheet.appendChild(contentNode);
  const scrim = el("div", { class: "scrim" }, [sheet]);
  const close = () => {
    scrim.remove();
    document.removeEventListener("keydown", onKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(scrim);
  sheet.querySelector("button, [tabindex], input, textarea, select")?.focus();
  return close;
}

export function confirmSheet(message, { okLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const okBtn = el("button", { class: "btn " + (danger ? "btn--danger" : "btn--primary"), text: okLabel });
    const cancel = el("button", { class: "btn btn--ghost", text: "Cancel" });
    const body = el("div", { class: "stack" }, [
      el("p", { text: message }),
      el("div", { class: "row", style: { justifyContent: "flex-end", gap: "var(--sp-8)", marginTop: "var(--sp-16)" } }, [cancel, okBtn]),
    ]);
    const close = openSheet("", body, { onClose: () => resolve(false) });
    okBtn.addEventListener("click", () => { resolve(true); close(); });
    cancel.addEventListener("click", () => { resolve(false); close(); });
  });
}

export function gradeBadge(grade, lg = false) {
  return el("div", { class: `grade grade--${grade}` + (lg ? " grade--lg" : ""), text: grade, title: `Grade ${grade}` });
}
export function chip(text, variant = "") {
  return el("span", { class: "chip" + (variant ? " chip--" + variant : ""), text });
}

export function segmented(options, value, onChange, { wrap = false } = {}) {
  const seg = el("div", { class: "seg" + (wrap ? " seg--wrap" : ""), role: "group" });
  for (const o of options) {
    const b = el("button", {
      class: "seg__btn", type: "button", text: o.label,
      "aria-pressed": String(o.value === value),
      onclick: () => onChange(o.value),
    });
    if (o.value === value) b.classList.add("is-active");
    seg.appendChild(b);
  }
  return seg;
}

export function field(labelText, control, hint) {
  return el("div", { class: "field" }, [
    el("label", { text: labelText }),
    control,
    hint ? el("div", { class: "hint", text: hint }) : null,
  ]);
}

export function emptyState(iconName, title, sub) {
  return el("div", { class: "empty" }, [icon(iconName, "ico"), el("div", { style: { fontWeight: "500", color: "var(--text-2)" }, text: title }), sub ? el("div", { text: sub }) : null]);
}

export const meter = (pct, color) => {
  const fill = el("div", { class: "meter__fill" });
  fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
  if (color) fill.style.background = color;
  return el("div", { class: "meter" }, [fill]);
};
