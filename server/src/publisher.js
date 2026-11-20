// Publishes public files (log.json, token metadata, coin images) to the GitHub Pages repo through
// the GitHub contents API (free). Without GITHUB_TOKEN it writes them to a local folder instead.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function createPublisher({ token, repo, branch = "main", dir = "", localDir }) {
  const api = (p) => `https://api.github.com/repos/${repo}/contents/${encodeURI(p)}`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "job-launchpad-worker",
  };

  async function put(path, content, message) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
    if (!token || !repo) {
      const out = join(localDir, path);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, buf);
      return { local: out };
    }
    const full = dir ? `${dir.replace(/\/$/, "")}/${path}` : path;
    let sha;
    const head = await fetch(`${api(full)}?ref=${branch}`, { headers });
    if (head.ok) sha = (await head.json()).sha;
    const res = await fetch(api(full), {
      method: "PUT",
      headers,
      body: JSON.stringify({ message, content: buf.toString("base64"), branch, ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) throw new Error(`publish ${full}: ${res.status} ${await res.text()}`);
    return { path: full };
  }
  return { put };
}
