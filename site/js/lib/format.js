import { CONFIG } from "../config.js";
import { toDecimalString } from "../shared/units.js";

export const shortAddr = (a) => (a && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || "");

export function pct(bps) {
  const v = bps / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0+$/, "")}%`;
}

// Fee figures derived from config: the job gets the fee minus Meteora's protocol share.
export function feeVars() {
  const total = CONFIG.FEE_BPS;
  const protocol = (total * CONFIG.PROTOCOL_FEE_PERCENT) / 100;
  return { totalFee: pct(total), protocolFee: pct(protocol), jobFee: pct(total - protocol) };
}

export function sol(lamports, maxFrac = 4) {
  const s = toDecimalString(lamports || 0, 9);
  return trimFrac(s, maxFrac);
}

export function tokens(raw, decimals = 6) {
  const n = Number(toDecimalString(raw || 0, decimals));
  return compact(n);
}

export function compact(n) {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [v, u] of units) if (abs >= v) return `${trimFrac((n / v).toFixed(2), 2)}${u}`;
  return trimFrac(n.toFixed(abs < 1 ? 4 : 2), abs < 1 ? 4 : 2);
}

function trimFrac(s, maxFrac) {
  const [w, f = ""] = String(s).split(".");
  const ff = f.slice(0, maxFrac).replace(/0+$/, "");
  return ff ? `${w}.${ff}` : w;
}

export function grouped(n) {
  return Number(n).toLocaleString("en-US");
}

const cluster = () => (CONFIG.NETWORK === "mainnet" ? "" : `?cluster=${CONFIG.NETWORK}`);
export const solscanTx = (sig) => `https://solscan.io/tx/${sig}${cluster()}`;
export const solscanAccount = (a) => `https://solscan.io/account/${a}${cluster()}`;
export const solscanToken = (a) => `https://solscan.io/token/${a}${cluster()}`;

export function timeAgo(iso, now = Date.now()) {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toISOString().slice(0, 10);
}

export function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
