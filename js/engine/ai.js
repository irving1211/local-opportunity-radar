import { callAnthropic } from "./net.js";

/* OPTIONAL, opt-in AI Enhance (PLAN.md §2.4). Off by default. Sends the lead text to Anthropic
   using the USER'S own key. Refines the summary + reply drafts; the deterministic engines remain
   the source of truth and always run first. */

export async function testKey(settings) {
  const j = await callAnthropic("/v1/messages", {
    model: settings.ai.model || "claude-haiku-4-5-20251001",
    max_tokens: 8,
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
  }, settings.ai.apiKey);
  const text = (j.content && j.content[0] && j.content[0].text) || "";
  return /ok/i.test(text);
}

export async function enhance(lead, analysis, messages, settings) {
  const prompt = [
    "You are helping a local tradesperson/freelancer respond to a potential side-job lead.",
    "Rewrite ONLY the reply messages to sound warmer and more natural, keeping them honest and non-pushy.",
    "Do NOT mention AI, automation-by-AI, or that this was generated. Keep it human and local.",
    "Return STRICT JSON: {\"summary\": string, \"first_normal\": string, \"first_premium\": string, \"follow_up\": string}.",
    "",
    "Lead title: " + (lead.title || ""),
    "Category: " + lead.category,
    "Lead text: " + (lead.rawText || "").slice(0, 1500),
    "Current summary: " + analysis.summary,
    "Current normal reply: " + messages.first_normal,
  ].join("\n");

  const j = await callAnthropic("/v1/messages", {
    model: settings.ai.model || "claude-haiku-4-5-20251001",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  }, settings.ai.apiKey);

  const text = (j.content && j.content[0] && j.content[0].text) || "{}";
  let parsed;
  try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)[0]); }
  catch { throw new Error("AI returned an unexpected format — kept your local drafts."); }
  return parsed;
}
