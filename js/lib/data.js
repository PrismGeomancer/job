// Data sources: the worker's public log, the Solana public RPC and DexScreener. All keyless.
// Nothing here is ever made up: a missing source shows as empty or zero.
import { CONFIG } from "../config.js";
import { toDecimalString } from "../shared/units.js";

export const EMPTY_LOG = Object.freeze({ version: 1, coins: [], actions: [], rounds: [], halted: null, updated: null });

const apiBase = () => CONFIG.API_URL.replace(/\/$/, "");

async function getJson(url, { timeoutMs = 10_000, ...init } = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    let code = "generate_failed";
    try { code = (await res.json()).error || code; } catch {}
    const err = new Error(code);
    err.code = code;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Local preview data (see js/dev/preview.js): only on localhost, only with ?preview in the URL.
export function previewMode(loc = globalThis.location) {
  if (!loc) return false;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(loc.hostname);
  return local && new URLSearchParams(loc.search).has("preview");
}

// The live log from the API when it is configured, else the static log.json next to the site.
// Returns { log, ok }: ok=false means no source answered (the page then shows zeros and a notice).
export async function loadLog() {
  if (previewMode()) {
    try {
      const { previewLog } = await import("../dev/preview.js");
      return { log: previewLog(), ok: true };
    } catch {}
  }
  const sources = [];
  if (CONFIG.API_URL) sources.push(`${apiBase()}/log`);
  if (CONFIG.LOG_URL) sources.push(`${CONFIG.LOG_URL}?t=${Math.floor(Date.now() / 30_000)}`);
  for (const url of sources) {
    try {
      const log = await getJson(url);
      if (log && Array.isArray(log.coins) && Array.isArray(log.actions)) return { log, ok: true };
    } catch {}
  }
  return { log: EMPTY_LOG, ok: false };
}

export function totals(log) {
  let work = 0n, paid = 0n, burned = 0;
  for (const c of log.coins) {
    work += BigInt(c.counters?.workLamports ?? 0);
    paid += BigInt(c.counters?.paidLamports ?? 0);
    burned += Number(toDecimalString(c.counters?.burnedRaw ?? 0, c.decimals ?? 6));
  }
  return { coins: log.coins.length, workLamports: work, paidLamports: paid, burned };
}

// ---- API (launching) ----
export const api = {
  pow: () => getJson(`${apiBase()}/pow`),
  generate: (body) => getJson(`${apiBase()}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs: 120_000 }),
  launch: (body) => getJson(`${apiBase()}/launch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs: 180_000 }),
  health: () => getJson(`${apiBase()}/health`, { timeoutMs: 6000 }),
};

// ---- Solana public RPC ----
const rpcUrl = () => CONFIG.RPC_URL || (CONFIG.NETWORK === "mainnet" ? "https://api.mainnet-beta.solana.com" : `https://api.${CONFIG.NETWORK}.solana.com`);
let rpcId = 0;
export async function rpc(method, params) {
  const body = await getJson(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (body.error) throw new Error(body.error.message || "rpc error");
  return body.result;
}

// Mint facts straight from the chain. Authorities are null only when the chain says so.
export async function mintInfo(mint) {
  const r = await rpc("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
  const info = r?.value?.data?.parsed?.info;
  if (!info) return null;
  return { supply: info.supply, decimals: info.decimals, mintAuthority: info.mintAuthority ?? null, freezeAuthority: info.freezeAuthority ?? null };
}

export async function largestHolders(mint) {
  const r = await rpc("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
  return r?.value ?? [];
}

export async function recentTxs(address, limit = 20) {
  return (await rpc("getSignaturesForAddress", [address, { limit, commitment: "confirmed" }])) ?? [];
}

// ---- DexScreener (free, no key) ----
export async function dexPair(mint) {
  try {
    const r = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const pairs = (r.pairs || []).filter((p) => p.chainId === "solana");
    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    return pairs[0] ?? null;
  } catch {
    return null;
  }
}
