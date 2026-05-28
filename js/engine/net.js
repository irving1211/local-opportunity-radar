/* SINGLE AUDITED NETWORK MODULE (PLAN.md §2.6). The ONLY file permitted to call fetch().
   Every request goes through safeFetch, which allows ONLY same-origin (our own feed.json) and
   the official-API origins in NET_ALLOWLIST. No scraping: arbitrary origins are rejected.
   The build guardrail audit asserts no other file calls fetch directly. */
import { NET_ALLOWLIST } from "../config.js";

export async function safeFetch(input, opts = {}) {
  const u = new URL(input, location.href);
  const sameOrigin = u.origin === location.origin;
  if (!sameOrigin && !NET_ALLOWLIST.includes(u.origin)) {
    throw new Error("Blocked network origin: " + u.origin + " (not in allowlist)");
  }
  return fetch(u.href, opts);
}

export async function getJSON(url, { signal } = {}) {
  const res = await safeFetch(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status + " from " + new URL(url, location.href).host);
  return res.json();
}

export async function callAnthropic(path, payload, apiKey, { signal } = {}) {
  if (!apiKey) throw new Error("No API key set.");
  const res = await safeFetch("https://api.anthropic.com" + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = (j.error && j.error.message) || JSON.stringify(j); } catch { detail = await res.text().catch(() => ""); }
    throw new Error(`Anthropic ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}
