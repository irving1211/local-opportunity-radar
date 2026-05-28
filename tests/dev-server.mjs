// Dev-only static server with no-store headers (so iterating on the UI never serves stale files).
// NOT part of the shipped app. Run: node tests/dev-server.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const port = Number(process.argv[2] || 8030);
const MIME = { ".html": "text/html", ".woff2": "font/woff2", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const full = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    const s = await stat(full);
    if (s.isDirectory()) { res.writeHead(403); return res.end("forbidden"); }
    const body = await readFile(full);
    res.writeHead(200, { "Content-Type": MIME[extname(full)] || "application/octet-stream", "Cache-Control": "no-store, max-age=0" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`dev server (no-store) on http://127.0.0.1:${port}`));
