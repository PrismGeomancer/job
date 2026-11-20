// Payroll roll call. Pure functions only: given the same inputs, anyone gets the same output.
//
// Randomness: the roll-call slot is derived from the blockhash of a "seed slot" that is produced
// after the round has ended, so nobody can know the chosen slot while the round is running.
//   seedSlot   = first produced slot >= endSlot + SEED_DELAY_SLOTS
//   chosenSlot = startSlot + (first 8 bytes of sha256("<blockhash>:<mint>:<roundId>") as uint64) mod (endSlot - startSlot + 1)
// Limit (documented in README): the leader that produces the seed slot sees its blockhash first and
// could, in theory, skip its slot to re-roll once. That leader would need to hold the coin and care.
import { createHash } from "node:crypto";

export const SEED_DELAY_SLOTS = 150; // about one minute after the round ends

export function deriveChosenSlot({ blockhash, mint, roundId, startSlot, endSlot }) {
  if (!Number.isSafeInteger(startSlot) || !Number.isSafeInteger(endSlot) || endSlot < startSlot) {
    throw new Error("rollcall: bad slot range");
  }
  if (typeof blockhash !== "string" || blockhash.length < 32) throw new Error("rollcall: bad blockhash");
  const digest = createHash("sha256").update(`${blockhash}:${mint}:${roundId}`).digest();
  const n = digest.readBigUInt64BE(0);
  const span = BigInt(endSlot - startSlot + 1);
  return startSlot + Number(n % span);
}

import { balancesAt, eligibleHolders, splitPot } from "../../site/js/shared/rollcall-core.js";
export { balancesAt, eligibleHolders, splitPot };

// The whole roll call in one call, as the worker and any verifier would run it.
export function runRollCall({ points, blockhash, mint, roundId, startSlot, endSlot, potLamports, minHoldBps, exclude }) {
  const chosenSlot = deriveChosenSlot({ blockhash, mint, roundId, startSlot, endSlot });
  const { balances, supply } = balancesAt(points, chosenSlot);
  const holders = eligibleHolders(balances, supply, { minHoldBps, exclude });
  const { payouts, carry } = splitPot(potLamports, holders);
  return { chosenSlot, supply, holders, payouts, carry };
}
