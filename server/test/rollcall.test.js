import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveChosenSlot, balancesAt, eligibleHolders, splitPot, runRollCall } from "../src/rollcall.js";

const BH = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const MINT = "JobMint1111111111111111111111111111111111111";

test("pot splits pro rata by balance (worked example from the site)", () => {
  const holders = [
    { wallet: "a", balance: 40n }, { wallet: "b", balance: 30n }, { wallet: "c", balance: 20n }, { wallet: "d", balance: 10n },
  ];
  const { payouts, carry } = splitPot(1_000_000_000n, holders);
  assert.deepEqual(payouts.map((p) => p.lamports), [400_000_000n, 300_000_000n, 200_000_000n, 100_000_000n]);
  assert.equal(carry, 0n);
});

test("rounding dust carries over, never overpays", () => {
  const holders = [{ wallet: "a", balance: 1n }, { wallet: "b", balance: 1n }, { wallet: "c", balance: 1n }];
  const { payouts, carry } = splitPot(100n, holders);
  const paid = payouts.reduce((s, p) => s + p.lamports, 0n);
  assert.equal(paid + carry, 100n);
  assert.equal(carry, 1n);
});

test("minimum hold: below 0.01% of supply is not on the roll", () => {
  const balances = new Map([["big", 9_999n * 100n], ["edge", 100n], ["tiny", 99n]]);
  const supply = 1_000_000n; // 0.01% = 100
  const on = eligibleHolders(balances, supply, { minHoldBps: 1 }).map((h) => h.wallet);
  assert.deepEqual(on.sort(), ["big", "edge"]);
});

test("exclusions: curve, pool, worker and creator are never paid", () => {
  const balances = new Map([["curve", 900n], ["worker", 50n], ["alice", 50n]]);
  const on = eligibleHolders(balances, 1000n, { minHoldBps: 1, exclude: ["curve", "worker"] });
  assert.deepEqual(on.map((h) => h.wallet), ["alice"]);
});

test("empty roll: the whole pot carries to the next round", () => {
  assert.deepEqual(splitPot(5_000n, []), { payouts: [], carry: 5_000n });
  assert.deepEqual(splitPot(0n, [{ wallet: "a", balance: 1n }]), { payouts: [], carry: 0n });
});

test("chosen slot is deterministic, inside the round, and depends on the blockhash", () => {
  const args = { blockhash: BH, mint: MINT, roundId: 7, startSlot: 1000, endSlot: 9999 };
  const s1 = deriveChosenSlot(args);
  assert.equal(deriveChosenSlot(args), s1);
  assert.ok(s1 >= 1000 && s1 <= 9999);
  const other = deriveChosenSlot({ ...args, blockhash: "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi" });
  assert.notEqual(other, s1);
});

test("balances at a slot use each account's last point at or before it", () => {
  const points = [
    { slot: 10, account: "A1", owner: "alice", amount: "100" },
    { slot: 20, account: "A1", owner: "alice", amount: "40" },
    { slot: 15, account: "B1", owner: "bob", amount: "60" },
    { slot: 30, account: "A2", owner: "alice", amount: "5" },
  ];
  const at19 = balancesAt(points, 19);
  assert.equal(at19.balances.get("alice"), 100n);
  assert.equal(at19.supply, 160n);
  const at30 = balancesAt(points, 30);
  assert.equal(at30.balances.get("alice"), 45n);
  assert.equal(at30.supply, 105n);
});

test("replay: recorded history + recorded blockhash reproduce the published payouts", () => {
  const fx = JSON.parse(readFileSync(new URL("./fixtures/round-replay.json", import.meta.url)));
  const run = () => runRollCall({ ...fx.input, exclude: fx.input.exclude });
  const a = run();
  const b = run();
  assert.equal(a.chosenSlot, fx.expected.chosenSlot);
  const got = a.payouts.map((p) => ({ wallet: p.wallet, lamports: p.lamports.toString() }));
  assert.deepEqual(got, fx.expected.payouts);
  assert.equal(a.carry.toString(), fx.expected.carry);
  assert.deepEqual(b.payouts, a.payouts);
});

test("the browser's slot derivation matches the worker's exactly", async () => {
  const { deriveChosenSlotAsync } = await import("../../site/js/shared/rollcall-core.js");
  for (let roundId = 0; roundId < 50; roundId++) {
    const args = { blockhash: BH, mint: MINT, roundId, startSlot: 300_000_000, endSlot: 300_008_999 };
    assert.equal(await deriveChosenSlotAsync(args), deriveChosenSlot(args));
  }
});
