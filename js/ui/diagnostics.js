import * as store from "../store.js";
import { el } from "../util.js";
import { icon, toast, confirmSheet } from "./components.js";
import { APP_VERSION, DB_SCHEMA_VERSION, SETTINGS_SCHEMA_VERSION, CHANNEL } from "../config.js";

const fmtBytes = (n) => n == null ? "—" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB";

export async function renderDiagnostics(ctx) {
  const wrap = el("div");
  wrap.appendChild(el("div", { class: "row", style: { marginBottom: "var(--sp-12)" } }, [
    el("button", { class: "btn btn--ghost btn--sm", onclick: () => ctx.navigate("#/settings") }, [icon("back", "btn__icon"), "Settings"]),
  ]));
  wrap.appendChild(el("div", { class: "head" }, [el("h1", { text: "Diagnostics" }), el("div", { class: "head__sub", text: "Status & recovery" })]));

  const est = await store.storageEstimate();
  const leads = store.state.safeMode ? [] : await store.getAllLeads().catch(() => []);
  const events = await store.countEvents().catch(() => 0);
  const lock = await store.lockInfo();
  const errors = store.readErrors();
  const sentinel = store.readSentinel();
  const flags = store.loadFlags();

  const row = (k, v) => el("div", { class: "diag-row" }, [el("span", { text: k }), el("span", { class: "mono", text: String(v) })]);
  wrap.appendChild(el("div", { class: "card" }, [
    row("Channel", CHANNEL),
    row("App version", APP_VERSION),
    row("DB schema", DB_SCHEMA_VERSION),
    row("Settings schema", SETTINGS_SCHEMA_VERSION),
    row("Mode", store.state.safeMode ? "READ-ONLY (safe mode)" : "normal"),
    row("Leads", leads.length),
    row("Events", events),
    row("Storage used", fmtBytes(est.usage)),
    row("Storage quota", fmtBytes(est.quota)),
    row("Write lock held", lock.held ? ("yes (" + (lock.owner || "other") + ")") : "no"),
    row("Last backup", sentinel && sentinel.lastBackupAt ? new Date(sentinel.lastBackupAt).toLocaleString() : "never"),
    row("Recent errors", errors.length),
  ]));

  // Feature flags
  wrap.appendChild(el("h2", { style: { marginTop: "var(--sp-24)", marginBottom: "var(--sp-8)" }, text: "Feature flags" }));
  const flagCard = el("div", { class: "card stack" });
  [["parserCraigslist", "Craigslist alert parser"], ["parserGoogleAlert", "Google Alert parser"], ["aiEnhance", "AI enhance"]].forEach(([k, label]) => {
    const input = el("input", { type: "checkbox", checked: !!flags[k] });
    input.addEventListener("change", () => { store.setFlag(k, input.checked); ctx.refreshSettings(); toast("Flag updated"); });
    flagCard.appendChild(el("div", { class: "toggle-row" }, [el("span", { text: label }), el("span", { class: "switch" }, [input, el("span", { class: "switch__track" })])]));
  });
  wrap.appendChild(flagCard);

  // Recovery actions
  wrap.appendChild(el("h2", { style: { marginTop: "var(--sp-24)", marginBottom: "var(--sp-8)" }, text: "Recovery" }));
  const actions = el("div", { class: "stack" });
  actions.appendChild(actionBtn("download", "Backup now", async () => { await ctx.exportBackup(); ctx.settings.lastBackupAt = new Date().toISOString(); store.saveSettings(ctx.settings); toast("Backup downloaded", "success"); }));
  actions.appendChild(actionBtn("download", "Export debug bundle", () => exportDebug(est, leads.length, events, lock, errors, flags)));
  actions.appendChild(actionBtn("refresh", "Force-release lock (reload)", () => { toast("Reloading…"); setTimeout(() => location.reload(), 400); }));
  actions.appendChild(actionBtn("refresh", "Clear app cache & reload", () => clearCachesReload()));
  wrap.appendChild(actions);

  // Error log
  if (errors.length) {
    wrap.appendChild(el("h2", { style: { marginTop: "var(--sp-24)", marginBottom: "var(--sp-8)" }, text: "Recent errors" }));
    const log = el("div", { class: "stack" });
    for (const e of errors.slice().reverse().slice(0, 10)) {
      log.appendChild(el("div", { class: "card" }, [
        el("div", { class: "hint", text: new Date(e.at).toLocaleString() + " · " + e.kind }),
        el("div", { class: "mono", style: { fontSize: "var(--fs-12)", overflowWrap: "anywhere" }, text: e.msg }),
      ]));
    }
    wrap.appendChild(log);
  }

  return wrap;
}

function actionBtn(ic, label, onClick) {
  return el("button", { class: "btn btn--secondary btn--full", onclick: onClick }, [icon(ic, "btn__icon"), label]);
}

function exportDebug(est, leadCount, events, lock, errors, flags) {
  const bundle = {
    kind: "lor-debug-bundle", at: new Date().toISOString(),
    appVersion: APP_VERSION, dbSchemaVersion: DB_SCHEMA_VERSION, settingsSchemaVersion: SETTINGS_SCHEMA_VERSION, channel: CHANNEL,
    safeMode: store.state.safeMode, leadCount, events, storage: est, lock, flags,
    userAgent: navigator.userAgent, errors,
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: "lor-debug-" + Date.now() + ".json" });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast("Debug bundle downloaded", "success");
}

async function clearCachesReload() {
  const ok = await confirmSheet("Clear the app's cached code and reload? Your leads are NOT affected.", { okLabel: "Clear & reload" });
  if (!ok) return;
  try {
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
    if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); }
  } catch {}
  location.reload();
}
