// Memo format for every engine transaction: job:<job>:<coin>:<amount>
// <coin> is the token mint address, <amount> a plain decimal string (no exponent, no sign).
import { isJob } from "./jobs.js";

const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const AMOUNT = /^(0|[1-9]\d*)(\.\d+)?$/;
const MEMO_RE = new RegExp(`^job:(cleaner|payroll|builder):(${BASE58}{32,44}):((?:0|[1-9]\\d*)(?:\\.\\d+)?)$`);

export function formatMemo(job, mint, amount) {
  if (!isJob(job)) throw new Error(`memo: unknown job ${job}`);
  if (typeof mint !== "string" || !new RegExp(`^${BASE58}{32,44}$`).test(mint)) throw new Error("memo: bad mint");
  const a = String(amount);
  if (!AMOUNT.test(a)) throw new Error(`memo: bad amount ${a}`);
  return `job:${job}:${mint}:${a}`;
}

export function parseMemo(memo) {
  const m = typeof memo === "string" ? MEMO_RE.exec(memo) : null;
  if (!m) return null;
  return { job: m[1], mint: m[2], amount: m[3] };
}
