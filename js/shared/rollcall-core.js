// Roll-call math shared by the worker and the site's simulator. Pure, no crypto, no I/O.
// BigInt amounts throughout.

// Rebuild owner balances (base units, BigInt) at the END of `atSlot` from balance history points.
// point: { slot, index, account, owner, amount } — `amount` is the token account's balance right
// after that transaction (postTokenBalances). An account's balance at a slot is its last point at or
// before that slot; an owner's balance is the sum over their accounts. Supply is the sum of all
// account balances (every token lives in some token account, including the curve vault).
// Returns { balances: Map<owner, bigint>, supply: bigint }.
export function balancesAt(points, atSlot) {
  const last = new Map();
  for (const p of points) {
    if (p.slot > atSlot) continue;
    const prev = last.get(p.account);
    if (!prev || p.slot > prev.slot || (p.slot === prev.slot && (p.index ?? 0) >= (prev.index ?? 0))) last.set(p.account, p);
  }
  const balances = new Map();
  let supply = 0n;
  for (const p of last.values()) {
    const amt = BigInt(p.amount);
    if (amt < 0n) throw new Error("rollcall: negative balance");
    supply += amt;
    if (amt > 0n) balances.set(p.owner, (balances.get(p.owner) ?? 0n) + amt);
  }
  return { balances, supply };
}

// Wallets on the roll: balance * 10000 >= supply * minHoldBps, minus excluded wallets.
export function eligibleHolders(balances, supply, { minHoldBps, exclude = [] }) {
  const ex = new Set(exclude);
  const out = [];
  for (const [wallet, bal] of balances) {
    if (ex.has(wallet)) continue;
    if (bal * 10000n >= supply * BigInt(minHoldBps)) out.push({ wallet, balance: bal });
  }
  out.sort((a, b) => (a.balance === b.balance ? (a.wallet < b.wallet ? -1 : 1) : a.balance > b.balance ? -1 : 1));
  return out;
}

// Split the pot pro rata by balance. Integer lamports, floor division.
// Remainder (dust) and the whole pot when nobody is eligible carry to the next round.
export function splitPot(potLamports, holders) {
  const pot = BigInt(potLamports);
  const total = holders.reduce((s, h) => s + h.balance, 0n);
  if (pot <= 0n || total === 0n) return { payouts: [], carry: pot > 0n ? pot : 0n };
  const payouts = [];
  let paid = 0n;
  for (const h of holders) {
    const lamports = (pot * h.balance) / total;
    if (lamports > 0n) {
      payouts.push({ wallet: h.wallet, lamports });
      paid += lamports;
    }
  }
  return { payouts, carry: pot - paid };
}


// Same formula as the worker's deriveChosenSlot, using Web Crypto (works in browsers and Node 20+):
// chosenSlot = startSlot + uint64(sha256("<blockhash>:<mint>:<roundId>")[0..8]) mod (endSlot - startSlot + 1)
export async function deriveChosenSlotAsync({ blockhash, mint, roundId, startSlot, endSlot }) {
  const data = new TextEncoder().encode(`${blockhash}:${mint}:${roundId}`);
  const digest = new DataView(await globalThis.crypto.subtle.digest("SHA-256", data));
  const n = digest.getBigUint64(0, false);
  return startSlot + Number(n % BigInt(endSlot - startSlot + 1));
}
