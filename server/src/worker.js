// The engine. For each coin it claims the coin's trading fees into the coin's job wallet and does
// that coin's one job with them. It can only: claim fees, buy, burn, pay SOL to roll-call holders.
// There is no sell path. Every transaction is logged before it is sent and again after.
import { formatMemo } from "../../site/js/shared/memo.js";
import { toDecimalString } from "../../site/js/shared/units.js";
import { isJob } from "../../site/js/shared/jobs.js";
import { runRollCall, SEED_DELAY_SLOTS } from "./rollcall.js";

const ENGINE_METHODS = Object.freeze([
  "jobBalance", "unclaimedFees", "poolState", "prepareClaim", "prepareBuy", "prepareBurn", "tokenBalance",
  "preparePayout", "send", "status", "getSlot", "blockhashAtOrAfter", "balancePoints", "excludedOwners", "holderCount",
]);

// Wrap a chain backend so the worker can reach only the allowed methods. Anything that sells, or
// any method not on the list, does not exist from the worker's point of view.
export function engineChain(backend) {
  const facade = {};
  for (const name of Object.keys(backend)) {
    if (/sell|swapbaseforquote|withdraw/i.test(name)) throw new Error(`engine: refused method ${name}`);
  }
  for (const name of ENGINE_METHODS) {
    if (typeof backend[name] !== "function") throw new Error(`engine: backend missing ${name}`);
    facade[name] = backend[name].bind(backend);
  }
  return Object.freeze(facade);
}

const SOL = (l) => toDecimalString(l, 9);
const PAYOUTS_PER_TX = 12;

export function createWorker({ store, chain, config, publish = async () => {}, now = () => Date.now(), log = console }) {
  const engine = engineChain(chain);

  function addRow(row) {
    store.state.actions.push({ id: `${row.kind}:${row.intentId}`, time: new Date(now()).toISOString(), ...row });
  }
  function setRow(intentId, kind, patch) {
    const r = store.state.actions.find((a) => a.id === `${kind}:${intentId}`);
    if (r) Object.assign(r, patch);
  }

  // Idempotent send. A crash at any point resumes from the stored intent.
  //   build()      -> prepared tx with .result, or null when there is nothing to do
  //   rowOf(res)   -> the public log row fields
  //   apply(res)   -> ledger effects, applied exactly once, in the same save that marks it confirmed
  async function execute(coin, intentId, kind, build, rowOf, apply = () => {}) {
    const intents = store.state.intents;
    const it = intents[intentId];
    if (it?.status === "confirmed") return it;
    if (it?.status === "sent") {
      const st = await engine.status(it.signature, it.lastValidBlockHeight);
      if (st === "confirmed") return finish(intentId, kind, "confirmed", apply);
      if (st === "pending") return it;
      // failed or expired: the transaction moved nothing, so a fresh one is safe.
      it.status = st;
      setRow(intentId, kind, { status: st });
      store.save();
      if (st === "failed") return it;
    }
    const prepared = await build();
    if (!prepared) return null;
    const result = prepared.result ?? null;
    intents[intentId] = { coin: coin.mint, status: "sent", signature: prepared.signature, lastValidBlockHeight: prepared.lastValidBlockHeight, result };
    const row = { ...rowOf(result), status: "pending", tx: prepared.signature };
    if (!store.state.actions.some((a) => a.id === `${kind}:${intentId}`)) addRow({ intentId, kind, ...row });
    else setRow(intentId, kind, row);
    store.save(); // logged BEFORE sending
    // If send throws, the outcome is unknown: the intent stays "sent" and the next cycle checks the signature.
    const st = await engine.send(prepared);
    return finish(intentId, kind, st, apply);
  }

  function finish(intentId, kind, st, apply) {
    const it = store.state.intents[intentId];
    if (st === "pending") return it;
    it.status = st;
    if (st === "confirmed" && !it.applied) {
      apply(it.result);
      it.applied = true;
      coinOf(it).ledger.txCount = (coinOf(it).ledger.txCount ?? 0) + 1;
    }
    setRow(intentId, kind, { status: st });
    store.save(); // logged AFTER sending
    return it;
  }
  const coinOf = (it) => store.coinByMint(it.coin);
  const add = (a, b) => (BigInt(a) + BigInt(b)).toString();

  // Balance check against the log. The job wallet's SOL can only come from the seed and claimed fees,
  // and only leave through logged actions plus transaction fees. If the chain shows less than the log
  // explains, halt everything. (More than expected is fine: anyone can send SOL to a wallet.)
  const FEE_ALLOWANCE = 100_000n;      // per transaction, base + priority fee, generous
  const ATA_RENT = 2_100_000n;         // one token account for the coin, created on the first buy
  function expectedMin(coin) {
    const l = coin.ledger;
    let v = BigInt(l.seedLamports ?? 0) + BigInt(l.claimedLamports) - BigInt(l.workLamports) - FEE_ALLOWANCE * BigInt(l.txCount ?? 0);
    if (l.buys > 0) v -= ATA_RENT;
    return v;
  }
  async function reconcile(coin) {
    const inFlight = Object.values(store.state.intents).some((i) => i.coin === coin.mint && i.status === "sent");
    if (inFlight) return true; // can't judge a balance while a transaction's outcome is unknown
    const bal = await engine.jobBalance(coin);
    const min = expectedMin(coin);
    if (bal < min) {
      store.state.halted = { reason: `balance mismatch on ${coin.ticker}: chain ${SOL(bal)} SOL < log ${SOL(min > 0n ? min : 0n)} SOL`, at: new Date(now()).toISOString() };
      store.save();
      return false;
    }
    return true;
  }

  async function claim(coin) {
    await execute(coin, `claim:${coin.mint}:${coin.ledger.claims}`, "claim",
      async () => {
        const unclaimed = await engine.unclaimedFees(coin);
        if (unclaimed < config.minClaimLamports) return null;
        return { ...(await engine.prepareClaim(coin)), result: { lamports: unclaimed.toString() } };
      },
      (r) => ({ mint: coin.mint, ticker: coin.ticker, job: coin.job, amount: SOL(r.lamports), unit: "SOL", memo: null }),
      (r) => {
        coin.ledger.claims += 1;
        coin.ledger.claimedLamports = add(coin.ledger.claimedLamports, r.lamports);
        coin.ledger.potLamports = add(coin.ledger.potLamports, r.lamports);
      });
  }

  // The amount the job may spend now: the claimed-fee pot, capped by the wallet balance minus the reserve.
  async function spendable(coin) {
    const bal = await engine.jobBalance(coin);
    const free = bal - config.reserveLamports;
    const pot = BigInt(coin.ledger.potLamports);
    const v = pot < free ? pot : free;
    return v > 0n ? v : 0n;
  }

  async function cleaner(coin) {
    await burnHeld(coin); // anything already bought (covers a crash between buy and burn)
    const r = await execute(coin, `buy:${coin.mint}:${coin.ledger.buys}`, "buy",
      async () => {
        const amount = await spendable(coin);
        if (amount < config.minSpendLamports) return null;
        const pool = await engine.poolState(coin);
        if (!pool || pool.migrated) return null; // post-migration buys: not built yet
        const memo = formatMemo("cleaner", coin.mint, SOL(amount));
        return { ...(await engine.prepareBuy(coin, amount, memo)), result: { lamports: amount.toString(), memo } };
      },
      (r) => ({ mint: coin.mint, ticker: coin.ticker, job: "cleaner", amount: SOL(r.lamports), unit: "SOL", memo: r.memo }),
      (r) => {
        coin.ledger.buys += 1;
        coin.ledger.potLamports = add(coin.ledger.potLamports, -BigInt(r.lamports));
        coin.ledger.workLamports = add(coin.ledger.workLamports, r.lamports);
      });
    if (r?.status === "confirmed") await burnHeld(coin);
  }

  async function burnHeld(coin) {
    await execute(coin, `burn:${coin.mint}:${coin.ledger.burns}`, "burn",
      async () => {
        const held = await engine.tokenBalance(coin);
        if (held <= 0n) return null;
        const ui = toDecimalString(held, coin.decimals);
        const memo = formatMemo("cleaner", coin.mint, ui);
        return { ...(await engine.prepareBurn(coin, held, memo)), result: { raw: held.toString(), ui, memo } };
      },
      (r) => ({ mint: coin.mint, ticker: coin.ticker, job: "cleaner", amount: r.ui, unit: coin.ticker, memo: r.memo }),
      (r) => {
        coin.ledger.burns += 1;
        coin.ledger.burnedRaw = add(coin.ledger.burnedRaw, r.raw);
      });
  }

  async function builder() {
    // Adding fees to the DAMM v2 pool after migration is not built yet. Until then the pot stays in
    // the job wallet (visible on chain). Liquidity created at migration is permanently locked by the
    // curve config (partnerPermanentLockedLiquidityPercentage: 100).
  }

  // Public facts for the coin page, refreshed every few minutes.
  async function refreshFacts(coin) {
    const due = !coin.factsAt || now() - coin.factsAt > 5 * 60_000;
    if (!due) return;
    const pool = await engine.poolState(coin).catch(() => null);
    if (pool) coin.curve = { migrated: pool.migrated, progress: typeof pool.progress === "number" ? pool.progress : null };
    const holders = await engine.holderCount(coin).catch(() => null);
    if (typeof holders === "number") coin.holders = holders;
    coin.factsAt = now();
    store.save();
  }

  // Payroll rounds. Boundaries are recorded as finalized slots when the worker sees the round change.
  async function payroll(coin, slotNow) {
    const roundId = Math.floor(now() / 1000 / config.roundSeconds);
    const pr = coin.payroll;
    if (pr.currentRound === null) {
      pr.currentRound = roundId;
      pr.currentStartSlot = slotNow;
      store.save();
      return;
    }
    if (roundId > pr.currentRound) {
      // Close the round: freeze its slot range and pot. The pot is what was claimed into the job wallet.
      const pot = BigInt(coin.ledger.potLamports) + BigInt(pr.carryLamports);
      store.state.rounds.push({
        mint: coin.mint, ticker: coin.ticker, roundId: pr.currentRound, startSlot: pr.currentStartSlot, endSlot: slotNow - 1,
        potLamports: pot.toString(), status: "waiting_seed", seedSlot: null, blockhash: null, chosenSlot: null, payouts: [], carryLamports: "0",
      });
      coin.ledger.potLamports = "0";
      pr.carryLamports = "0";
      pr.currentRound = roundId;
      pr.currentStartSlot = slotNow;
      store.save();
    }
    for (const round of store.state.rounds.filter((r) => r.mint === coin.mint && r.status !== "done")) {
      await settleRound(coin, round);
    }
  }

  async function settleRound(coin, round) {
    if (round.status === "waiting_seed") {
      const seed = await engine.blockhashAtOrAfter(round.endSlot + SEED_DELAY_SLOTS);
      if (!seed) return; // seed slot not finalized yet
      const { points, accounts } = await engine.balancePoints(coin, round.endSlot, coin.payroll.knownAccounts);
      coin.payroll.knownAccounts = accounts;
      const exclude = await engine.excludedOwners(coin);
      const res = runRollCall({
        points, blockhash: seed.blockhash, mint: coin.mint, roundId: round.roundId, startSlot: round.startSlot, endSlot: round.endSlot,
        potLamports: round.potLamports, minHoldBps: config.minHoldBps, exclude,
      });
      Object.assign(round, {
        seedSlot: seed.slot, blockhash: seed.blockhash, chosenSlot: res.chosenSlot, supplyRaw: res.supply.toString(),
        eligible: res.holders.length, excluded: exclude,
        payouts: res.payouts.map((p) => ({ wallet: p.wallet, lamports: p.lamports.toString(), status: "planned" })),
        carryLamports: res.carry.toString(), status: "paying",
      });
      store.save(); // the full payout list is fixed and logged before any SOL moves
    }
    if (round.status === "paying") {
      const batches = [];
      for (let i = 0; i < round.payouts.length; i += PAYOUTS_PER_TX) batches.push(round.payouts.slice(i, i + PAYOUTS_PER_TX));
      let failedLamports = 0n;
      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        if (batch.every((p) => p.status === "confirmed")) continue;
        const total = batch.reduce((sum, p) => sum + BigInt(p.lamports), 0n);
        const memo = formatMemo("payroll", coin.mint, SOL(total));
        const r = await execute(coin, `payroll:${coin.mint}:${round.roundId}:${b}`, "payout",
          async () => ({
            ...(await engine.preparePayout(coin, batch.map((p) => ({ wallet: p.wallet, lamports: BigInt(p.lamports) })), memo)),
            result: { lamports: total.toString(), batch: b },
          }),
          () => ({ mint: coin.mint, ticker: coin.ticker, job: "payroll", amount: SOL(total), unit: "SOL", memo, round: round.roundId, wallets: batch.length }),
          () => {
            for (const p of batch) p.status = "confirmed";
            coin.ledger.paidLamports = add(coin.ledger.paidLamports, total);
            coin.ledger.workLamports = add(coin.ledger.workLamports, total);
          });
        if (!r || r.status === "sent") return; // still in flight; resume next cycle
        if (r.status !== "confirmed") {
          for (const p of batch) p.status = "failed";
          failedLamports += total;
          store.save();
        }
      }
      // Dust, an empty roll and failed batches carry to the next round.
      coin.payroll.carryLamports = (BigInt(coin.payroll.carryLamports) + BigInt(round.carryLamports) + failedLamports).toString();
      round.status = "done";
      round.paidWallets = round.payouts.filter((p) => p.status === "confirmed").length;
      store.save();
    }
  }

  async function cycle() {
    if (store.state.halted) {
      log.warn?.(`worker halted: ${store.state.halted.reason}`);
      return { halted: true };
    }
    const slotNow = await engine.getSlot();
    for (const coin of store.state.coins) {
      if (!isJob(coin.job)) continue; // never act on a record without a valid job
      try {
        if (!(await reconcile(coin))) return { halted: true };
        await claim(coin);
        if (coin.job === "cleaner") await cleaner(coin);
        else if (coin.job === "payroll") await payroll(coin, slotNow);
        else if (coin.job === "builder") await builder(coin);
        await refreshFacts(coin);
        if (!(await reconcile(coin))) return { halted: true };
      } catch (err) {
        log.error?.(`worker ${coin.ticker}: ${err.message}`);
      }
    }
    await publish();
    return { halted: false };
  }

  return { cycle, execute, settleRound };
}
