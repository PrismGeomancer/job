// Builds dist/ for GitHub Pages. All paths in the site are relative and routing is hash based,
// so dist/ works at the domain root or under any subpath (/<repo>/) with no base-path setting.
// Optional: SITE_URL=https://you.github.io/job sets absolute og:url / og:image.
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const site = join(root, "site");
const dist = process.env.DIST_DIR || join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
// js/dev/ holds local-only preview data; it never goes into the published site.
const devDir = join(site, "js", "dev");
cpSync(site, dist, { recursive: true, filter: (src) => !src.startsWith(devDir) });
writeFileSync(join(dist, ".nojekyll"), "");

// Meta tags from copy.js, so link previews work without JavaScript.
const { copy } = await import(pathToFileURL(join(site, "js", "copy.js")).href);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const indexPath = join(dist, "index.html");
writeFileSync(indexPath, readFileSync(indexPath, "utf8")
  .replace(/<title>.*<\/title>/, `<title>${esc(copy.meta.title)}</title>`)
  .replace('<meta name="description" content="">', `<meta name="description" content="${esc(copy.meta.description)}">`)
  .replace('<meta property="og:title" content="">', `<meta property="og:title" content="${esc(copy.meta.ogTitle)}">`)
  .replace('<meta property="og:description" content="">', `<meta property="og:description" content="${esc(copy.meta.description)}">`));

const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
if (siteUrl) {
  const p = indexPath;
  const html = readFileSync(p, "utf8").replace(
    '<meta property="og:type" content="website">',
    `<meta property="og:type" content="website">\n  <meta property="og:url" content="${siteUrl}/">` +
      (existsSync(join(site, "assets", "share.png")) ? `\n  <meta property="og:image" content="${siteUrl}/assets/share.png">` : ""),
  );
  writeFileSync(p, html);
}
if (!existsSync(join(dist, "data", "log.json"))) throw new Error("dist/data/log.json missing");
if (existsSync(join(dist, "js", "dev"))) throw new Error("local preview data leaked into dist/");
console.log(`built ${dist}`);
