// HTTP API. The static site calls only these endpoints.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { openStore } from "./store.js";
import { createLimiter, utcDay } from "./ratelimit.js";
import { issueChallenge, verifySolution } from "./pow.js";
import { checkCoin } from "./checks.js";
import { SchemaError } from "./ai/schema.js";
import { isJob } from "../../site/js/shared/jobs.js";
import { buildPublicLog, publicCoin } from "./publiclog.js";
import { ownerKeyMatches } from "./keys.js";
import { imageUrl } from "./images.js";
import { LaunchError } from "./launch.js";

const MAX_BODY = 8 * 1024;
const DRAFT_TTL_MS = 30 * 60_000;

export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// Best effort: turn a public X post URL into its text through the free oEmbed endpoint.
export async function fetchXPostText(url) {
  const res = await fetch(`https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new ApiError(422, "x_post_failed");
  const { html } = await res.json();
  const m = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html || "");
  if (!m) throw new ApiError(422, "x_post_failed");
  return m[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

const X_URL = /^https?:\/\/(www\.)?(x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/i;

export function createApp({ config, store, writeCoin, launcher, fetchXPost = fetchXPostText, now = () => Date.now() }) {
  const genLimit = createLimiter({ limit: config.generatePerIpPer10Min, windowMs: 10 * 60_000 });
  const launchLimit = createLimiter({ limit: config.launchPerIpPerDay, windowMs: 24 * 3600_000 });
  const usedChallenges = new Set();

  async function generate(body, ip) {
    if (config.killSwitch) throw new ApiError(503, "api_down");
    if (!genLimit(ip)) throw new ApiError(429, "rate_limited");
    if (!verifySolution(config.powSecret, body?.pow?.challenge, body?.pow?.nonce, { used: usedChallenges, now: now() })) throw new ApiError(400, "pow_failed");
    let idea = typeof body.idea === "string" ? body.idea.trim().slice(0, 1000) : "";
    if (X_URL.test(idea)) idea = await fetchXPost(idea.split(/\s/)[0]);
    if (idea.length < 3) throw new ApiError(400, "generate_failed");

    let lastErr = "generate_failed";
    for (let attempt = 0; attempt < 2; attempt++) {
      let coin;
      try {
        coin = await writeCoin(idea);
      } catch (err) {
        if (!(err instanceof SchemaError)) throw err;
        lastErr = "generate_failed";
        continue;
      }
      const bad = checkCoin(coin, { tickerTaken: store.tickerTaken });
      if (bad) { lastErr = bad; continue; }
      const draftId = randomBytes(12).toString("hex");
      const seed = randomBytes(4).readUInt32BE(0);
      const img = imageUrl(coin.image_prompt, seed);
      store.update((s) => {
        for (const [id, d] of Object.entries(s.drafts)) if (now() - d.createdAt > DRAFT_TTL_MS) delete s.drafts[id];
        s.drafts[draftId] = { coin, imageUrl: img, createdAt: now() };
      });
      return { draftId, name: coin.name, ticker: coin.ticker, description: coin.description, job: coin.job, jobReason: coin.job_reason, imageUrl: img };
    }
    throw new ApiError(422, lastErr);
  }

  async function launch(body, ip) {
    if (config.killSwitch) throw new ApiError(503, "api_down");
    if (!isJob(body?.job)) throw new ApiError(400, "no_job");
    const draft = store.state.drafts[body.draftId];
    if (!draft || now() - draft.createdAt > DRAFT_TTL_MS) throw new ApiError(404, "generate_failed");
    if ((store.state.launches[utcDay(now())] ?? 0) >= config.maxLaunchesPerDay) throw new ApiError(429, "daily_cap");
    if (!launchLimit(ip)) throw new ApiError(429, "rate_limited");
    try {
      const { coin, ownerKey } = await launcher.launch({ draft, job: body.job });
      store.update((s) => delete s.drafts[body.draftId]);
      return { coin: publicCoin(coin), ownerKey, tx: coin.launchTx };
    } catch (err) {
      if (err instanceof LaunchError) throw new ApiError(err.code === "api_down" ? 503 : 422, err.code);
      throw err;
    }
  }

  // Cosmetic edits only. The job (and anything else) is not an accepted field.
  const OWNER_FIELDS = ["mint", "ownerKey", "description", "image", "links"];
  function ownerUpdate(body) {
    const extra = Object.keys(body || {}).filter((k) => !OWNER_FIELDS.includes(k));
    if (extra.length) throw new ApiError(400, "field_not_allowed");
    const coin = store.coinByMint(body.mint);
    if (!coin || !ownerKeyMatches(body.ownerKey, coin.ownerKeyHash)) throw new ApiError(403, "bad_owner_key");
    const patch = {};
    if (body.description !== undefined) {
      const d = String(body.description).replace(/\s+/g, " ").trim();
      if (d.length < 10 || d.length > 280) throw new ApiError(400, "bad_description");
      patch.description = d;
    }
    if (body.image !== undefined) {
      if (!/^https:\/\/[^\s"'<>]{4,300}$/.test(body.image)) throw new ApiError(400, "bad_image");
      patch.image = body.image;
    }
    if (body.links !== undefined) {
      const links = {};
      for (const [k, v] of Object.entries(body.links || {})) {
        if (!["x", "telegram", "website"].includes(k)) throw new ApiError(400, "bad_links");
        if (v && !/^https:\/\/[^\s"'<>]{4,200}$/.test(v)) throw new ApiError(400, "bad_links");
        if (v) links[k] = v;
      }
      patch.links = links;
    }
    store.update(() => Object.assign(coin, patch));
    return { coin: publicCoin(coin) };
  }

  const routes = {
    "GET /health": () => ({ ok: true, launchReady: launcher.ready(), killSwitch: config.killSwitch }),
    "GET /pow": () => issueChallenge(config.powSecret, config.powBits, now()),
    "POST /generate": (b, ip) => generate(b, ip),
    "POST /launch": (b, ip) => launch(b, ip),
    "GET /coins": () => ({ coins: store.state.coins.map(publicCoin) }),
    "GET /log": () => buildPublicLog(store.state, { network: config.network, roundSeconds: config.roundSeconds, now: now() }),
    "POST /owner/update": (b) => ownerUpdate(b),
  };

  return async function handle(req, res) {
    res.setHeader("access-control-allow-origin", config.corsOrigin);
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("cache-control", "no-store");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    const path = new URL(req.url, "http://x").pathname.replace(/\/$/, "") || "/";
    const route = routes[`${req.method} ${path}`];
    const send = (status, obj) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (!route) return send(404, { error: "not_found" });
    try {
      let body = {};
      if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > MAX_BODY) throw new ApiError(413, "too_large");
        }
        try { body = raw ? JSON.parse(raw) : {}; } catch { throw new ApiError(400, "bad_json"); }
      }
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
      send(200, await route(body, ip));
    } catch (err) {
      if (err instanceof ApiError) return send(err.status, { error: err.code });
      console.error(`api ${path}: ${err.message}`); // message only; never request bodies or keys
      send(500, { error: path === "/launch" ? "launch_failed" : "generate_failed" });
    }
  };
}

// Entry point: API + worker in one process.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { createClaudeWriter } = await import("./ai/claude.js");
  const { createBackend } = await import("./chain/backend.js");
  const { createLauncher, parseSecretKey } = await import("./launch.js");
  const { createPublisher } = await import("./publisher.js");
  const { createLogPublisher } = await import("./publiclog.js");
  const { createWorker } = await import("./worker.js");

  const config = loadConfig();
  const store = openStore(config.storePath);
  const operatorPublicKey = config.operatorKey ? parseSecretKey(config.operatorKey).publicKey.toBase58() : undefined;
  const backend = createBackend(config, { operatorPublicKey });
  const publisher = createPublisher({ ...config.github, localDir: config.publicDir });
  const publish = createLogPublisher({ store, publisher, config });
  const launcher = createLauncher({ store, backend, publisher, config });
  const writeCoin = createClaudeWriter({ apiKey: config.aiApiKey, model: config.aiModel });
  const app = createApp({ config, store, writeCoin, launcher });

  createServer(app).listen(config.port, () => console.log(`JOB api on :${config.port} (${config.network}), launch ${launcher.ready() ? "ready" : "not configured"}`));

  const worker = createWorker({ store, chain: backend, config, publish });
  const loop = async () => {
    try { await worker.cycle(); } catch (e) { console.error(`worker: ${e.message}`); }
    setTimeout(loop, config.workerIntervalMs);
  };
  if (config.masterKey) loop();
}
