// Local static server for dist/ (or site/ with --src). Serves under /job/ to mimic a Pages subpath.
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = join(root, process.argv.includes("--src") ? "site" : "dist");
const base = "/job/";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const firstPort = Number(process.env.PORT || 5055);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") return res.writeHead(302, { location: base }).end();
  if (!url.pathname.startsWith(base)) return res.writeHead(404).end();
  let rel = normalize(decodeURIComponent(url.pathname.slice(base.length))).replace(/^(\.\.[/\\])+/, "");
  if (!rel || rel === "." || rel.endsWith("/")) rel = (rel === "." ? "" : rel) + "index.html";
  try {
    const body = await readFile(join(dir, rel));
    res.writeHead(200, { "content-type": types[extname(rel)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

// If the port is busy (another dev server), try the next one.
function listen(port) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && port < firstPort + 20) {
      console.log(`port ${port} is in use, trying ${port + 1}`);
      listen(port + 1);
    } else throw err;
  });
  const q = process.argv.includes("--preview") ? "?preview" : "";
  server.listen(port, () => console.log(`\n  JOB site: http://localhost:${port}${base}${q}\n  serving ${dir}\n`));
}
listen(firstPort);
