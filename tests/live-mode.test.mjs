import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXAMPLE_LEADS, countExampleLeads, isExampleLead } from "../js/seed.js";
import { newLead } from "../js/schema.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error("FAIL:", msg); } };

const here = path.dirname(fileURLToPath(import.meta.url));
const appJs = fs.readFileSync(path.join(here, "..", "js", "app.js"), "utf8");

ok(!appJs.includes("seedIfEmpty("), "boot no longer auto-seeds example leads");

const exampleLead = newLead(EXAMPLE_LEADS[0]);
ok(isExampleLead(exampleLead), "known example lead is recognized");

const realLead = newLead({
  source: "manual",
  category: "home-service",
  title: "Need drywall patch repaired this week",
  location: "Lawrence, MA",
  contactRaw: "978-555-0123",
  rawText: "Need one bedroom wall patched and painted this week. Paying cash.",
});
ok(!isExampleLead(realLead), "real lead is not treated as an example");

ok(countExampleLeads([exampleLead, realLead, newLead(EXAMPLE_LEADS[1])]) === 2, "example lead counting is correct");

console.log(`\nlive mode tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
