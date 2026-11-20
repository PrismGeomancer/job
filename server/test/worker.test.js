import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../src/store.js";
import { createWorker, engineChain } from "../src/worker.js";
import { parseMemo } from "../../site/js/shared/memo.js";

const MINT = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const JOBW = "JobWa11et11111111111111111111111111111111111";
const config = { minClaimLamports: 10n, minSpendLamports: 10n, reserveLamports: 1_000n, roundSeconds: 3600, minHoldBps: 1 };

function coin(job) {
  return {
    mint: MINT, pool: "Poo1", ticker: "TEST", job, decimals: 6, jobWallet: { address: JOBW },
    ledger: { seedLamports: "5000", txCount: 0, claims: 0, buys: 0, burns: 0, claimedLamports: "0", potLamports: "0", workLamports: "0", paidLamports: "0", burnedRaw: "0" },
    payroll: { currentRound: null, currentStartSlot: null, carryLamports: "0", knownAccounts: [] },
  };
}

// In-memory chain used only by these tests.
function fakeChain({ balance = 5_000n, unclaimed = 0n, crashAfterLanding = false } = {}) {
  const c = {
    bal: balance, unclaimed, tokens: 0n, landed: new Map(), sends: [], n: 0, crash: crashAfterLanding,
    jobBalance: async () => c.bal,
    unclaimedFees: async () => c.unclaimed,
    poolState: async () => ({ migrated: false }),
    tokenBalance: async () => c.tokens,
    prepareClaim: async () => ({ signature: `sig${++c.n}`, lastValidBlockHeight: 100, apply: () => { c.bal += c.unclaimed; c.unclaimed = 0n; } }),
    prepareBuy: async (_coin, lamports, memo) => ({ signature: `sig${++c.n}`, lastValidBlockHeight: 100, memo, apply: () => { c.bal -= lamports; c.tokens += 777n; } }),
    prepareBurn: async (_coin, amount, memo) => ({ signature: `sig${++c.n}`, lastValidBlockHeight: 100, memo, apply: () => { c.tokens -= amount; } }),
    preparePayout: async (_coin, payouts, memo) => ({ signature: `sig${++c.n}`, lastValidBlockHeight: 100, memo, apply: () => { for (const p of payouts) c.bal -= p.lamports; } }),
    async send(p) {
      c.sends.push(p);
      p.apply();
      c.landed.set(p.signature, "confirmed");
      if (c.crash) { c.crash = false; throw new Error("process killed after the tx landed"); }
      return "confirmed";
    },
    status: async (sig) => c.landed.get(sig) ?? "expired",
    slot: 5000,
    getSlot: async () => (c.slot += 1000),
    blockhashAtOrAfter: async (slot) => ({ slot, blockhash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" }),
    balancePoints: async () => ({ points: c.points ?? [], accounts: [] }),
    excludedOwners: async () => [JOBW],
    holderCount: async () => 0,
  };
  return c;
}

const freshStore = () => openStore(join(mkdtempSync(join(tmpdir(), "job-")), "store.json"));
const quiet = { warn() {}, error() {} };

test("the engine refuses any backend that exposes a sell path", () => {
  const chain = fakeChain();
  assert.throws(() => engineChain({ ...chain, sell: async () => {} }), /refused/);
  assert.throws(() => engineChain({ ...chain, prepareSell: async () => {} }), /refused/);
  const facade = engineChain(chain);
  assert.equal(facade.sell, undefined);
  assert.ok(Object.isFrozen(facade));
});

test("cleaner: claims fees, buys, burns, and memos follow job:<job>:<coin>:<amount>", async () => {
  const store = freshStore();
  store.update((s) => s.coins.push(coin("cleaner")));
  const chain = fakeChain({ unclaimed: 2_000n });
  await createWorker({ store, chain, config, log: quiet }).cycle();
  const kinds = store.state.actions.map((a) => a.kind);
  assert.deepEqual(kinds, ["claim", "buy", "burn"]);
  for (const a of store.state.actions.filter((a) => a.memo)) {
    const m = parseMemo(a.memo);
    assert.equal(m.job, "cleaner");
    assert.equal(m.mint, MINT);
  }
  assert.equal(chain.tokens, 0n);
  assert.equal(store.state.coins[0].ledger.burnedRaw, "777");
  assert.ok(store.state.actions.every((a) => a.status === "confirmed"));
});

test("idempotent: a crash after a tx lands does not send it again on restart", async () => {
  const store = freshStore();
  store.update((s) => s.coins.push(coin("cleaner")));
  const chain = fakeChain({ unclaimed: 2_000n, crashAfterLanding: true });
  await createWorker({ store, chain, config, log: quiet }).cycle(); // claim lands, then the process "dies"
  assert.equal(chain.sends.length, 1);
  assert.equal(store.state.intents[Object.keys(store.state.intents)[0]].status, "sent"); // logged before sending
  const restarted = openStore(store.state && join(mkdtempSync(join(tmpdir(), "job-")), "x.json"));
  Object.assign(restarted.state, JSON.parse(JSON.stringify(store.state)));
  await createWorker({ store: restarted, chain, config, log: quiet }).cycle();
  const claims = chain.sends.filter((p) => !p.memo);
  assert.equal(claims.length, 1, "the claim was not sent twice");
  assert.equal(restarted.state.actions.find((a) => a.kind === "claim").status, "confirmed");
});

test("reconciliation: SOL leaving the job wallet outside the log halts the engine", async () => {
  const store = freshStore();
  store.update((s) => s.coins.push(coin("cleaner")));
  const chain = fakeChain({ balance: 5_000n });
  const w = createWorker({ store, chain, config, log: quiet });
  await w.cycle();
  chain.bal -= 3_000n; // someone moved SOL without a logged action
  const r = await w.cycle();
  assert.equal(r.halted, true);
  assert.match(store.state.halted.reason, /balance mismatch/);
  const sendsBefore = chain.sends.length;
  chain.unclaimed = 5_000n;
  await w.cycle();
  assert.equal(chain.sends.length, sendsBefore, "a halted engine sends nothing");
});

test("payroll: round with nobody eligible carries the pot; next round pays it out once", async () => {
  const store = freshStore();
  store.update((s) => s.coins.push(coin("payroll")));
  const chain = fakeChain({ balance: 10_000n });
  let t = 3600_000 * 100;
  const w = createWorker({ store, chain, config, now: () => t, log: quiet });
  await w.cycle(); // opens round 100
  chain.unclaimed = 3_000n;
  await w.cycle(); // claims into the pot
  t += 3600_000; chain.points = [];
  await w.cycle(); // closes round 100: nobody on the roll
  const r100 = store.state.rounds.find((r) => r.roundId === 100);
  assert.equal(r100.status, "done");
  assert.equal(r100.payouts.length, 0);
  assert.equal(store.state.coins[0].payroll.carryLamports, "3000");

  chain.points = [
    { slot: 1, account: "a1", owner: "alice", amount: "300" },
    { slot: 1, account: "b1", owner: "bob", amount: "100" },
  ];
  t += 3600_000;
  await w.cycle(); // closes round 101 with the carried pot
  const r101 = store.state.rounds.find((r) => r.roundId === 101);
  assert.deepEqual(r101.payouts.map((p) => [p.wallet, p.lamports, p.status]), [["alice", "2250", "confirmed"], ["bob", "750", "confirmed"]]);
  await w.cycle();
  await w.cycle();
  assert.equal(chain.sends.filter((p) => p.memo?.startsWith("job:payroll")).length, 1, "paid exactly once");
  assert.equal(store.state.coins[0].ledger.paidLamports, "3000");
  for (const k of ["blockhash", "seedSlot", "chosenSlot", "startSlot", "endSlot"]) assert.ok(r101[k] !== null && r101[k] !== undefined, `round publishes ${k}`);
});

test("the worker acts only on the stored job; a tampered record is skipped", async () => {
  const store = freshStore();
  store.update((s) => s.coins.push({ ...coin("cleaner"), job: "sell everything" }));
  const chain = fakeChain({ unclaimed: 2_000n });
  await createWorker({ store, chain, config, log: quiet }).cycle();
  assert.equal(chain.sends.length, 0);
});
