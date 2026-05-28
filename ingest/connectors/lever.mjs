// Lever Postings API (https://api.lever.co/v0/postings/{company}). Public, no key.
import { makeRecord } from "../normalize.mjs";

export async function fetchLever(companies) {
  const out = [];
  for (const co of companies || []) {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(co)}?mode=json`;
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) { console.error("[lever]", co, "HTTP", r.status); continue; }
      const data = await r.json();
      for (const j of (Array.isArray(data) ? data : [])) {
        const loc = (j.categories && j.categories.location) || "";
        out.push(makeRecord({
          source: "lever",
          sourceDetail: co,
          sourceUrl: j.hostedUrl,
          title: j.text,
          company: co,
          description: j.descriptionPlain || j.description,
          location: loc,
          postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
          foundViaQuery: co,
          remote: /remote/i.test(loc + " " + (j.text || "")),
        }));
      }
      console.error("[lever]", co, "→", (Array.isArray(data) ? data.length : 0));
    } catch (e) { console.error("[lever]", co, e.message); }
  }
  return out;
}
