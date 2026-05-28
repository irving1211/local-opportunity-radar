/* SINGLE AUDITED NETWORK MODULE (PLAN.md §2.6). This is the ONLY file in the codebase
   permitted to call fetch(). It hard-codes the one allowed origin and throws on anything else.
   The build guardrail audit asserts no other file contains a network call. */

const ALLOWED_ORIGIN = "https://api.anthropic.com";

export async function callAnthropic(path, payload, apiKey, { signal } = {}) {
  const url = ALLOWED_ORIGIN + path;
  if (!url.startsWith(ALLOWED_ORIGIN + "/")) throw new Error("Blocked: only api.anthropic.com is permitted.");
  if (!apiKey) throw new Error("No API key set.");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Required for direct browser calls with a user-supplied key:
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
