// Greenhouse Job Board API (https://boards-api.greenhouse.io). Public, no key.
// Pulls postings from configured company board tokens.
import { makeRecord } from "../normalize.mjs";

export async function fetchGreenhouse(boards, perBoard = 18) {
  const out = [];
  for (const token of boards || []) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) { console.error("[greenhouse]", token, "HTTP", r.status); continue; }
      const data = await r.json();
      const jobs = (data.jobs || []).slice().sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, perBoard);
      for (const j of jobs) {
        const loc = (j.location && j.location.name) || "";
        out.push(makeRecord({
          source: "greenhouse",
          sourceDetail: token,
          sourceUrl: j.absolute_url,
          title: j.title,
          company: token,
          description: j.content, // HTML/entity-encoded; normalize strips it
          location: loc,
          postedAt: j.updated_at || null,
          foundViaQuery: token,
          remote: /remote/i.test(loc + " " + (j.title || "")),
        }));
      }
      console.error("[greenhouse]", token, "→", (data.jobs || []).length);
    } catch (e) { console.error("[greenhouse]", token, e.message); }
  }
  return out;
}
