// Hacker News "Ask HN: Who is hiring?" via the official Algolia HN API (no key, public).
// Each top-level comment in the monthly thread is a hiring post — often small companies,
// frequently remote/contract, and many include a real contact email. No scraping.
import { makeRecord, stripHtml } from "../normalize.mjs";

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;

async function j(url) { const r = await fetch(url, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }

export async function fetchHackerNews({ limit = 60 } = {}) {
  try {
    const search = await j("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=" + encodeURIComponent("who is hiring") + "&hitsPerPage=4");
    const story = (search.hits || []).find((h) => /who is hiring/i.test(h.title || ""));
    if (!story) { console.error("[hackernews] no who-is-hiring thread found"); return []; }
    const item = await j("https://hn.algolia.com/api/v1/items/" + story.objectID);
    const comments = (item.children || []).filter((c) => c && c.text && !c.deleted).slice(0, limit);
    const out = comments.map((c) => {
      const text = stripHtml(c.text);
      // "Who is hiring" posts are loosely "COMPANY | ROLE | LOCATION | TYPE | ..." (free text).
      const parts = text.split("|").map((s) => s.trim()).filter(Boolean);
      const company = (parts[0] || "Company").replace(/^https?:\/\//i, "").slice(0, 60);
      const rest = parts.slice(1).filter((p) => !/^https?:\/\//i.test(p));
      const ROLE_RE = /(develop|engineer|design|manager|scientist|devops|full[- ]?stack|back[- ]?end|front[- ]?end|architect|\blead\b|contractor|consultant|analyst|product|marketing|sales|support|writer|\bqa\b|data|founding|sre|security|mobile|ios|android|ml\b)/i;
      const role = (rest.find((p) => ROLE_RE.test(p)) || rest.find((p) => !/^(remote|onsite|hybrid|us|usa|eu|europe|anywhere|full[- ]?time|part[- ]?time)\b/i.test(p)) || rest[0] || company || "Open role").slice(0, 90);
      const email = (text.match(EMAIL_RE) || [])[0] || "";
      return makeRecord({
        source: "hackernews",
        sourceDetail: company,
        sourceUrl: "https://news.ycombinator.com/item?id=" + c.id,
        title: role,
        company: company,
        description: text,
        location: /\bremote\b/i.test(text) ? "Remote" : "",
        postedAt: c.created_at || null,
        foundViaQuery: "HN: " + (story.title || "who is hiring"),
        remote: /\bremote\b/i.test(text),
        contactRaw: email,
      });
    });
    console.error("[hackernews] →", out.length, "posts from", story.title);
    return out;
  } catch (e) { console.error("[hackernews]", e.message); return []; }
}
