// Builds the public log (log.json) from the store. Strips every secret: wallet key envelopes,
// owner key hashes, drafts, IPs and worker intents never appear in it.
export function publicCoin(c) {
  return {
    mint: c.mint, pool: c.pool, config: c.config, name: c.name, ticker: c.ticker, description: c.description,
    image: c.image, links: c.links ?? {}, job: c.job, jobWallet: c.jobWallet.address, createdAt: c.createdAt,
    launchTx: c.launchTx, decimals: c.decimals, supplyRaw: c.supplyRaw, metadataUri: c.metadataUri,
    counters: {
      burnedRaw: c.ledger.burnedRaw, paidLamports: c.ledger.paidLamports, workLamports: c.ledger.workLamports,
      claimedLamports: c.ledger.claimedLamports, addedLamports: "0",
      heldLamports: c.job === "builder" ? c.ledger.potLamports : undefined,
    },
    curve: c.curve ?? null,
    holders: typeof c.holders === "number" ? c.holders : null,
    payroll: c.job === "payroll" ? { currentRound: c.payroll.currentRound, carryLamports: c.payroll.carryLamports } : undefined,
  };
}

export function buildPublicLog(state, { network, roundSeconds, now = Date.now() }) {
  return {
    version: 1,
    network,
    updated: new Date(now).toISOString(),
    roundSeconds,
    halted: state.halted,
    coins: state.coins.map(publicCoin),
    actions: state.actions.map(({ intentId, ...a }) => a),
    rounds: state.rounds.map((r) => ({ ...r })),
  };
}

export function createLogPublisher({ store, publisher, config, minIntervalMs = 5 * 60_000 }) {
  let last = 0;
  let lastBody = "";
  return async function publish({ force = false } = {}) {
    const log = buildPublicLog(store.state, config);
    const body = JSON.stringify({ ...log, updated: undefined });
    if (!force && (body === lastBody || Date.now() - last < minIntervalMs)) return false;
    await publisher.put("data/log.json", JSON.stringify(log, null, 2), "log: update");
    last = Date.now();
    lastBody = body;
    return true;
  };
}
