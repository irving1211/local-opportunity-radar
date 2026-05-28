/* Boot guard (classic script, CSP script-src 'self').
   Runs before the app module. Catches fatal startup/migration/storage errors and renders the
   boot-safe recovery screen (PLAN.md §3, Round 4 fix) — independent of the app shell modules. */
(function () {
  "use strict";
  var DB_NAME = "lor-prod";        // keep in sync with js/config.js DB_NAME
  var RING_KEY = "lor:prod:errlog"; // keep in sync with config ERR_KEY
  var booted = false;
  var timer = null;

  function pushErr(kind, msg, stack) {
    try {
      var ring = JSON.parse(localStorage.getItem(RING_KEY) || "[]");
      ring.push({ at: new Date().toISOString(), kind: kind, msg: String(msg).slice(0, 500), stack: (stack || "").slice(0, 1200) });
      while (ring.length > 25) ring.shift();
      localStorage.setItem(RING_KEY, JSON.stringify(ring));
    } catch (e) { /* localStorage may be unavailable */ }
  }

  function show(msg, detail) {
    if (booted) return;
    var host = document.getElementById("boot-fail");
    if (!host) return;
    var m = document.getElementById("boot-fail__msg");
    if (m && msg) m.textContent = msg;
    var d = document.getElementById("bf-detail");
    if (d && detail) d.textContent = detail;
    host.hidden = false;
    var app = document.getElementById("app"); if (app) app.hidden = true;
    var nav = document.getElementById("nav"); if (nav) nav.hidden = true;
  }

  // Minimal vanilla-IndexedDB export so a user can rescue data even if modules failed.
  function exportBackup() {
    var req = indexedDB.open(DB_NAME);
    req.onerror = function () { alert("Could not open the database to export."); };
    req.onsuccess = function () {
      var db = req.result;
      var out = { kind: "local-opportunity-radar-backup", at: new Date().toISOString(), recovery: true, leads: [], events: [], settings: null };
      try { out.settings = JSON.parse(localStorage.getItem("lor:prod:settings") || "null"); } catch (e) {}
      var names = Array.prototype.slice.call(db.objectStoreNames);
      var pending = 0;
      function dump(storeName, key) {
        if (names.indexOf(storeName) === -1) return;
        pending++;
        var tx = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
        tx.onsuccess = function () { out[key] = tx.result || []; if (--pending === 0) save(); };
        tx.onerror = function () { if (--pending === 0) save(); };
      }
      function save() {
        var blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "lor-backup-recovery-" + Date.now() + ".json";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      }
      dump("leads", "leads"); dump("events", "events");
      if (pending === 0) save();
    };
  }

  function clearCachesAndReload() {
    var done = function () { location.reload(); };
    var jobs = [];
    if (window.caches && caches.keys) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
    Promise.all(jobs).then(done, done);
  }

  window.addEventListener("error", function (e) {
    pushErr("error", e.message || "error", (e.error && e.error.stack) || "");
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason || {};
    pushErr("rejection", r.message || String(r), r.stack || "");
  });

  // Public hooks for the app module.
  // Progress pings push the watchdog out so a slow FIRST network load (many module files on a
  // slow phone connection) doesn't false-trigger recovery — only a true JS hang does.
  window.__lorBootProgress = function () { if (booted) return; if (timer) clearTimeout(timer); timer = setTimeout(function () { if (!booted) show("The app is taking too long to start.", "Boot watchdog timed out."); }, 20000); };
  window.__lorBootOk = function () { booted = true; if (timer) clearTimeout(timer); var h = document.getElementById("boot-fail"); if (h) h.hidden = true; };
  window.__lorBootFail = function (msg, detail) { pushErr("fatal", msg, detail); show(msg, detail); };

  // Watchdog: if the app never reports a successful boot, show recovery.
  timer = setTimeout(function () { if (!booted) show("The app is taking too long to start.", "Boot watchdog timed out after 12s."); }, 20000);

  document.addEventListener("DOMContentLoaded", function () {
    var b;
    if ((b = document.getElementById("bf-export"))) b.addEventListener("click", exportBackup);
    if ((b = document.getElementById("bf-unsw"))) b.addEventListener("click", clearCachesAndReload);
    if ((b = document.getElementById("bf-retry"))) b.addEventListener("click", function () { location.reload(); });
  });
})();
