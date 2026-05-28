// Ingestion tests: connector normalization, record→lead, URL-aware dedupe, source metadata.
// Run: node tests/ingest.test.mjs
import { makeRecord } from "../ingest/normalize.mjs";
import { recordToLead } from "../js/ingest.js";
import { INGESTED_SOURCES, SOURCE_META, SOURCES, validateImport, safeUrl, newLead } from "../js/schema.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };

// 1. makeRecord normalizes a Remotive-like job (HTML stripped, category classified, capped)
const rec = makeRecord({
  source: "remotive", sourceDetail: "Software Development",
  sourceUrl: "https://remotive.com/remote-jobs/x-123",
  title: "Senior Automation Engineer", company: "Acme",
  description: "<p>Build <b>automation</b> workflows &amp; internal tools.</p>",
  location: "USA only", postedAt: "2026-05-20T00:00:00", foundViaQuery: "automation",
  tags: ["python", "zapier"], remote: true,
});
ok(rec.source === "remotive", "record keeps source");
ok(rec.sourceUrl.includes("remotive.com"), "record keeps url");
ok(!/[<>]/.test(rec.rawText), "HTML tags stripped from description");
ok(rec.rawText.includes("automation"), "description text preserved");
ok(rec.rawText.includes("&") && !rec.rawText.includes("&amp;"), "HTML entities decoded");
ok(rec.category === "automation", "category classified from text");
ok(rec.remote === true, "remote flag preserved");
ok(rec.fetchedAt, "fetchedAt stamped");

// 2. recordToLead → a proper ingested lead
const lead = recordToLead(rec);
ok(lead.ingested === true, "lead marked ingested");
ok(lead.source === "remotive", "lead source preserved");
ok(lead.sourceUrl === rec.sourceUrl, "lead sourceUrl preserved");
ok(lead.foundViaQuery === "automation", "lead foundViaQuery preserved");
ok(lead.postedAt === rec.postedAt, "lead postedAt preserved");
ok(!!lead.fetchedAt, "lead fetchedAt set");

// 3. URL-aware dedupe: same sourceUrl → same fingerprint regardless of title differences
const a = recordToLead({ ...rec, title: "Title A" });
const b = recordToLead({ ...rec, title: "Completely Different Title" });
ok(a.fingerprint === b.fingerprint, "same sourceUrl → identical fingerprint (dedupe across refreshes)");
const c = recordToLead({ ...rec, sourceUrl: "https://remotive.com/remote-jobs/y-999" });
ok(c.fingerprint !== a.fingerprint, "different sourceUrl → different fingerprint");

// 4. connector source metadata completeness
for (const sname of ["remotive", "greenhouse", "lever", "google-search"]) {
  ok(SOURCES.includes(sname), "SOURCES includes " + sname);
  ok(!!SOURCE_META[sname], "SOURCE_META has " + sname);
  ok(INGESTED_SOURCES.has(sname), "INGESTED_SOURCES has " + sname);
}

// 5. garbage/empty record doesn't throw
ok(recordToLead({}).title === "(untitled)", "empty record → untitled lead (no throw)");
ok(recordToLead({}).ingested === true, "empty record still flagged ingested");

// 6. contract signal + contact passthrough (HN-style record with an email)
const hn = makeRecord({ source: "hackernews", sourceDetail: "TinyCo (YC)", sourceUrl: "https://news.ycombinator.com/item?id=1", title: "TinyCo | Backend | Remote | Contract", description: "Looking for a freelance backend dev on contract. Email jobs@tinyco.example", remote: true, contactRaw: "jobs@tinyco.example" });
ok(hn.contractSignal === true, "contract/freelance text → contractSignal");
ok(hn.contactRaw === "jobs@tinyco.example", "contactRaw passthrough (real email from HN)");
ok(makeRecord({ source: "remotive", title: "Full-time Manager", description: "permanent role" }).contractSignal === false, "non-contract → no signal");
{
  const lead = recordToLead(hn);
  ok(lead.contact.type === "email" && lead.contact.value === "jobs@tinyco.example", "HN email becomes the lead's contact");
}
for (const sname of ["hackernews"]) { ok(SOURCES.includes(sname), "SOURCES has " + sname); ok(!!SOURCE_META[sname], "SOURCE_META has " + sname); ok(INGESTED_SOURCES.has(sname), "INGESTED_SOURCES has " + sname); }

// 7. backup round-trip: a current-version export must validate on import (Codex HIGH fix)
ok(validateImport({ kind: "local-opportunity-radar-backup", dbSchemaVersion: 3, leads: [], events: [] }).ok, "current-schema backup imports OK");
ok(!validateImport({ kind: "local-opportunity-radar-backup", dbSchemaVersion: 99, leads: [] }).ok, "newer-than-app backup rejected");

// 8. sourceUrl sanitization (Codex MED fix): only http/https survive
ok(safeUrl("https://x.com/y") === "https://x.com/y", "https url kept");
ok(safeUrl("javascript:alert(1)") === "", "javascript: url stripped");
ok(safeUrl("data:text/html,x") === "", "data: url stripped");
ok(newLead({ sourceUrl: "javascript:alert(1)" }).sourceUrl === "", "lead never stores a javascript: sourceUrl");

console.log(`\ningest tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
