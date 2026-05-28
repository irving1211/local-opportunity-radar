/* Safe DOM + small helpers. el()/text() are the ONLY dynamic-DOM write path (PLAN.md §11):
   untrusted text always goes through textContent, never innerHTML. */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;             // safe text
    else if (k === "html") throw new Error("html attr is forbidden — use text");
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style") Object.assign(node.style, v);    // CSSOM, not a markup style attr
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k in node && k !== "list") { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };
export const mount = (node, ...kids) => { kids.flat().forEach((k) => k && node.appendChild(typeof k === "string" ? document.createTextNode(k) : k)); return node; };

export function uid(prefix = "id") {
  const r = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  return `${prefix}_${r}`;
}

/* Stable, non-crypto fingerprint hash (FNV-1a) for dedupe (PLAN.md §4). */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const normalize = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
export const byteLen = (s) => new Blob([s || ""]).size;
export const nowISO = () => new Date().toISOString();

export function fmtMoney(n) {
  if (n == null || isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtRelative(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const day = 86400000;
  if (diff < 0) return "in " + Math.ceil(-diff / day) + "d";
  if (diff < 3600000) return Math.max(1, Math.round(diff / 60000)) + "m ago";
  if (diff < day) return Math.round(diff / 3600000) + "h ago";
  return Math.round(diff / day) + "d ago";
}

export const debounce = (fn, ms = 200) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  // Fallback: temporary textarea
  try {
    const ta = el("textarea", { value: text, style: { position: "fixed", opacity: "0", top: "0" } });
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}
