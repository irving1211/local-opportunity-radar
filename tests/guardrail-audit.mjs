// Guardrail audit (PLAN.md §2.6/§13). Asserts the app cannot scrape or auto-send by construction.
// Run: node tests/guardrail-audit.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };

function walk(dir) {
  let out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!["node_modules", ".git"].includes(name)) out = out.concat(walk(p)); }
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

const NET_PATTERNS = [
  { re: /\bfetch\s*\(/, name: "fetch(" },
  { re: /XMLHttpRequest/, name: "XMLHttpRequest" },
  { re: /navigator\.sendBeacon/, name: "sendBeacon" },
  { re: /new\s+EventSource/, name: "EventSource" },
  { re: /new\s+WebSocket/, name: "WebSocket" },
  { re: /import\s*\(\s*['"`]https?:/, name: "remote import()" },
];

const ALLOWED_NET_FILE = join(root, "js", "engine", "net.js");
const files = walk(join(root, "js"));

for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const { re, name } of NET_PATTERNS) {
    if (re.test(src)) {
      const isAllowed = (f === ALLOWED_NET_FILE && name === "fetch(");
      ok(isAllowed, `network call '${name}' found in ${relative(root, f)} (only net.js may call fetch)`);
    }
  }
}
// net.js MUST contain exactly the one allowed fetch + hard-coded origin
const netSrc = readFileSync(ALLOWED_NET_FILE, "utf8");
ok(/api\.anthropic\.com/.test(netSrc), "net.js hard-codes api.anthropic.com");
ok(/fetch\s*\(/.test(netSrc), "net.js is the single network module");

// sw.js may fetch (it's a service worker, same-origin only) — verify it refuses cross-origin
const sw = readFileSync(join(root, "sw.js"), "utf8");
ok(/url\.origin\s*!==\s*self\.location\.origin/.test(sw), "sw.js skips cross-origin requests");

// index.html CSP must lock the surface
const html = readFileSync(join(root, "index.html"), "utf8");
const csp = (html.match(/Content-Security-Policy"[\s\S]*?content="([\s\S]*?)"/) || [])[1] || "";
for (const dir of ["default-src 'self'", "connect-src 'self' https://api.anthropic.com", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'", "script-src 'self'"]) {
  ok(csp.includes(dir), `CSP contains: ${dir}`);
}
ok(!/<form\b/i.test(html), "no <form> elements that could POST to the network");

// No untrusted innerHTML in the codebase
for (const f of files) {
  const src = readFileSync(f, "utf8");
  ok(!/\.innerHTML\s*=/.test(src), `no innerHTML assignment in ${relative(root, f)}`);
}

console.log(`\nguardrail audit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
