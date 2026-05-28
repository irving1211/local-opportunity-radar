import * as store from "./store.js";
import { APP_VERSION, DB_SCHEMA_VERSION, SW_SCOPE } from "./config.js";
import { el, clear } from "./util.js";
import { icon, toast } from "./ui/components.js";
import { renderDashboard } from "./ui/dashboard.js";
import { renderInbox } from "./ui/inbox.js";
import { renderDetail } from "./ui/detail.js";
import { renderAdd } from "./ui/add.js";
import { renderPipeline } from "./ui/pipeline.js";
import { renderSettings } from "./ui/settings.js";
import { renderDiagnostics } from "./ui/diagnostics.js";

const ctx = {
  settings: null,
  flags: null,
  navigate, reload: render, toast,
  refreshSettings() { ctx.settings = store.loadSettings(); applyTheme(ctx.settings.theme); ctx.flags = store.loadFlags(); },
};

const ROUTES = [
  { re: /^#\/dashboard$/, render: (m) => renderDashboard(ctx) },
  { re: /^#\/inbox$/, render: (m) => renderInbox(ctx) },
  { re: /^#\/lead\/(.+)$/, render: (m) => renderDetail(ctx, m[1]) },
  { re: /^#\/add$/, render: (m) => renderAdd(ctx) },
  { re: /^#\/pipeline$/, render: (m) => renderPipeline(ctx) },
  { re: /^#\/settings$/, render: (m) => renderSettings(ctx) },
  { re: /^#\/diagnostics$/, render: (m) => renderDiagnostics(ctx) },
];

const NAV = [
  { href: "#/dashboard", icon: "dashboard", label: "Home", match: /^#\/dashboard$/ },
  { href: "#/inbox", icon: "inbox", label: "Inbox", match: /^#\/(inbox|lead)/ },
  { href: "#/add", icon: "plus", label: "Add", match: /^#\/add$/, fab: true },
  { href: "#/pipeline", icon: "board", label: "Pipeline", match: /^#\/pipeline$/ },
  { href: "#/settings", icon: "settings", label: "Settings", match: /^#\/(settings|diagnostics)$/ },
];

function navigate(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

function renderNav() {
  const nav = document.getElementById("nav");
  clear(nav);
  for (const item of NAV) {
    const active = item.match.test(location.hash);
    const btn = el("button", {
      class: "nav__btn" + (item.fab ? " nav__btn--fab" : "") + (active ? " is-active" : ""),
      type: "button", "aria-current": active ? "page" : null,
      onclick: () => navigate(item.href),
    }, [icon(item.icon, "ico"), el("span", { text: item.label })]);
    nav.appendChild(btn);
  }
  nav.hidden = false;
}

async function render() {
  const app = document.getElementById("app");
  if (!location.hash || location.hash === "#/" || location.hash === "#") { location.hash = "#/dashboard"; return; }
  let node;
  try {
    const route = ROUTES.find((r) => r.re.test(location.hash));
    const m = route ? location.hash.match(route.re) : null;
    node = route ? await route.render(m) : notFound();
  } catch (e) {
    store.logError("render", e.message, e.stack);
    node = el("div", { class: "card" }, [el("h2", { text: "Something went wrong on this screen." }), el("p", { class: "muted", text: e.message })]);
  }
  clear(app);
  app.appendChild(node);
  app.hidden = false;
  app.scrollTop = 0; window.scrollTo(0, 0);
  renderNav();
}

function notFound() {
  return el("div", { class: "empty" }, [el("div", { text: "Page not found." }), el("a", { href: "#/dashboard", text: "Go home" })]);
}

function banner(kind, text, actionLabel, onAction) {
  const host = document.getElementById("banner-host");
  const row = el("div", { class: "row grow" }, [el("span", { class: "grow", text })]);
  if (actionLabel) row.appendChild(el("button", { class: "btn btn--sm btn--secondary", text: actionLabel, onclick: onAction }));
  host.appendChild(el("div", { class: "banner banner--" + kind, role: kind === "error" ? "alert" : "status" }, [row]));
}

async function boot() {
  try {
    window.__lorBootProgress && window.__lorBootProgress(); // modules loaded — JS is running
    await store.initDB();
    window.__lorBootProgress && window.__lorBootProgress(); // DB open — past the slow part
    store.requestPersist();
    ctx.settings = store.loadSettings();
    ctx.flags = store.loadFlags();
    applyTheme(ctx.settings.theme);

    // Version-skew / safe-mode banner
    if (store.state.safeMode) banner("error", store.state.safeReason, "Export backup", () => exportBackup());
    if (store.state.settingsReset) banner("warning", "Your settings were from a newer version and were reset to defaults (a backup was kept).");

    // Storage-eviction detection
    if (await store.checkDataLoss()) {
      banner("error", "Your saved leads may have been cleared by the browser. If you have a backup file, import it from Settings.", "Open Settings", () => navigate("#/settings"));
    } else {
      await refreshSentinelSafe();
    }

    window.addEventListener("hashchange", render);
    await render();
    registerSW();
    window.__lorBootOk && window.__lorBootOk();
  } catch (e) {
    store.logError("boot", e.message, e.stack);
    window.__lorBootFail ? window.__lorBootFail("The app failed to start.", (e && e.stack) || e.message) : console.error(e);
  }
}

async function refreshSentinelSafe() {
  try { if (!store.state.safeMode) { const leads = await store.getAllLeads(); const ev = await store.countEvents(); store.writeSentinel(leads.length, ev, ctx.settings.lastBackupAt); } } catch {}
}

async function exportBackup() {
  const data = await store.exportData(ctx.settings);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `lor-backup-${Date.now()}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
ctx.exportBackup = exportBackup;

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol === "file:") return; // SW needs http(s)/localhost
  navigator.serviceWorker.register("sw.js", { scope: SW_SCOPE }).catch((e) => store.logError("sw", e.message, e.stack));
}

ctx.version = { appVersion: APP_VERSION, dbSchemaVersion: DB_SCHEMA_VERSION };
boot();
