import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyVisibility, isFilled } from "../site/js/shared/visibility.js";
import { formatMemo, parseMemo } from "../site/js/shared/memo.js";
import { toDecimalString, fromDecimalString } from "../site/js/shared/units.js";
import { CONFIG } from "../site/js/config.js";
import { copy } from "../site/js/copy.js";
import { feeVars } from "../site/js/lib/format.js";

// Minimal stand-in for a DOM subtree: elements with data-requires and a hidden flag.
function fakeRoot(requires) {
  const nodes = requires.map((r) => ({ hidden: false, getAttribute: () => r }));
  return { nodes, querySelectorAll: () => nodes };
}

test("empty config values hide the elements that use them", () => {
  const root = fakeRoot(["X_URL", "TG_URL", "REPO_URL", "CA", "API_URL WALLET_LAUNCH"]);
  applyVisibility(root, { X_URL: "https://x.com/job", TG_URL: "", REPO_URL: "   ", CA: undefined, API_URL: "https://api", WALLET_LAUNCH: false });
  assert.deepEqual(root.nodes.map((n) => n.hidden), [false, true, true, true, true]);
  applyVisibility(root, { X_URL: "", TG_URL: "t", REPO_URL: "r", CA: "c", API_URL: "a", WALLET_LAUNCH: true });
  assert.deepEqual(root.nodes.map((n) => n.hidden), [true, false, false, false, false]);
  assert.equal(isFilled(0), true);
  assert.equal(isFilled(null), false);
});

test("the shipped index.html ties every optional link to its config key", () => {
  const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
  for (const key of ["REPO_URL", "X_URL", "TG_URL"]) assert.ok(html.includes(`data-requires="${key}"`), key);
  assert.ok(!/href="https?:\/\/(x|twitter)\.com/.test(html), "no hard-coded social links");
});

test("memo format is job:<job>:<coin>:<amount> and round-trips", () => {
  const mint = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
  const m = formatMemo("payroll", mint, "0.125");
  assert.equal(m, `job:payroll:${mint}:0.125`);
  assert.deepEqual(parseMemo(m), { job: "payroll", mint, amount: "0.125" });
  assert.throws(() => formatMemo("seller", mint, "1"));
  assert.throws(() => formatMemo("cleaner", "not-a-mint", "1"));
  assert.throws(() => formatMemo("cleaner", mint, "-1"));
  assert.throws(() => formatMemo("cleaner", mint, "1e9"));
  assert.equal(parseMemo(`job:builder:${mint}:01`), null);
  assert.equal(parseMemo("sell:all"), null);
});

test("decimal conversion is exact", () => {
  assert.equal(toDecimalString(1_500_000_000n, 9), "1.5");
  assert.equal(toDecimalString(1n, 9), "0.000000001");
  assert.equal(fromDecimalString("0.000000001", 9), 1n);
  assert.equal(fromDecimalString("1000000000", 6), 1_000_000_000_000_000n);
});

test("fee lines come from config: job share = fee minus Meteora's protocol share", () => {
  const v = feeVars();
  assert.equal(CONFIG.FEE_BPS, 100);
  assert.equal(v.totalFee, "1%");
  assert.equal(v.protocolFee, "0.2%");
  assert.equal(v.jobFee, "0.8%");
  // No copy string hard-codes a fee percentage; they all go through {jobFee}/{totalFee}/{protocolFee}.
  const all = JSON.stringify(copy);
  const hard = all.match(/\b\d+(\.\d+)?% (of every trade|to the job|→ the coin)/g);
  assert.equal(hard, null, `hard-coded fee: ${hard}`);
});

test("pre-launch defaults: no API, no fake data in the static log", () => {
  assert.match(CONFIG.CA, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  const log = JSON.parse(readFileSync(new URL("../site/data/log.json", import.meta.url), "utf8"));
  assert.deepEqual([log.coins.length, log.actions.length, log.rounds.length], [0, 0, 0]);
});

test("local preview data never reaches the published build", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const out = join(mkdtempSync(join(tmpdir(), "job-dist-")), "dist");
  execFileSync(process.execPath, [new URL("../scripts/build.mjs", import.meta.url).pathname.replace(/%20/g, " ")], { env: { ...process.env, DIST_DIR: out } });
  assert.ok(existsSync(join(out, "index.html")));
  assert.ok(!existsSync(join(out, "js", "dev")), "js/dev must not be published");
});

test("preview mode only turns on for localhost with ?preview", async () => {
  const { previewMode } = await import("../site/js/lib/data.js");
  assert.equal(previewMode({ hostname: "localhost", search: "?preview" }), true);
  assert.equal(previewMode({ hostname: "127.0.0.1", search: "?preview=1" }), true);
  assert.equal(previewMode({ hostname: "localhost", search: "" }), false);
  assert.equal(previewMode({ hostname: "you.github.io", search: "?preview" }), false);
});

test("quick drafts pass the same checks as AI output, and respect taken tickers and the brand filter", async () => {
  const { writeQuickDraft, draftCoin } = await import("../site/js/lib/draft.js");
  const d = writeQuickDraft("a getaway driver who never stops at red lights");
  assert.equal(d.job, "builder");
  assert.ok(d.name.length >= 2 && /^[A-Z0-9]{2,10}$/.test(d.ticker));
  assert.equal(draftCoin("a heist crew that splits the take").job, "payroll");
  assert.equal(draftCoin("wanted level heat").job, "cleaner");
  assert.throws(() => writeQuickDraft("gta heist crew"), /blocked_name/);
  const t = writeQuickDraft("night shift").ticker;
  assert.throws(() => writeQuickDraft("night shift", { tickerTaken: (x) => x === t }), /ticker_taken/);
});

test("the content filter keeps game trademarks off JOB coins", async () => {
  const { checkCoin } = await import("../site/js/shared/coin-checks.js");
  const base = { ticker: "HEIST", description: "Four people and one plan. Payday on the hour.", job_reason: "Holders split the take." };
  const no = () => false;
  for (const name of ["GTA Heist", "Grand Theft Coin", "Vice City Nights", "Los Santos Crew", "Leonida Dreams"]) assert.equal(checkCoin({ ...base, name }, { tickerTaken: no }), "blocked_name", name);
  assert.equal(checkCoin({ ...base, name: "Heist Crew" }, { tickerTaken: no }), null);
});
