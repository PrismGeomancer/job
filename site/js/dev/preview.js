// Local preview data, for screenshots and design work only.
// Loaded only on localhost with ?preview in the URL, and the build leaves this folder out of dist/,
// so it can never appear on the published site. Times are relative to now so the page looks current.
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COINS = [
  { name: "Heist Crew", ticker: "HEIST", job: "payroll", description: "Four people, one plan, one payday. Whoever is holding at roll call gets a cut." },
  { name: "Wanted Level", ticker: "WANTED", job: "cleaner", description: "Every trade knocks a star off. The heat only goes down." },
  { name: "Getaway Driver", ticker: "GETAWAY", job: "builder", description: "Keeps the engine running. The road out gets wider every trip." },
  { name: "Side Hustle", ticker: "HUSTLE", job: "payroll", description: "Clocks in after the day job. Pays out on the hour." },
  { name: "Safehouse", ticker: "SAFE", job: "builder", description: "Somewhere to lie low. The walls get thicker with every visit." },
  { name: "Five Star Heat", ticker: "HEAT", job: "cleaner", description: "Too hot to hold for long. The supply cools off as it burns." },
  { name: "Night Shift", ticker: "NIGHT", job: "payroll", description: "Works while the city sleeps. Payroll still runs on the hour." },
];

export function previewLog(now = Date.now()) {
  const r = rng(20261118);
  const id = (n) => Array.from({ length: n }, () => B58[Math.floor(r() * 58)]).join("");
  const lam = (sol) => String(Math.round(sol * 1e9));
  const coins = [];
  const actions = [];
  const rounds = [];
  const hour = 3600_000;

  COINS.forEach((c, i) => {
    const mint = id(44);
    const created = now - (70 - i * 9) * hour - Math.floor(r() * hour);
    const coin = {
      ...c, mint, pool: id(44), config: id(44), image: null, links: {}, jobWallet: id(44), createdAt: new Date(created).toISOString(),
      launchTx: id(88), decimals: 6, supplyRaw: "1000000000000000",
      counters: { burnedRaw: "0", paidLamports: "0", workLamports: "0", claimedLamports: "0", addedLamports: "0" },
      curve: { migrated: false, progress: 0.05 + r() * 0.6 }, holders: 20 + Math.floor(r() * 400),
    };
    actions.push({ id: `launch:${mint}`, time: coin.createdAt, kind: "launch", mint, ticker: c.ticker, job: c.job, amount: null, unit: null, memo: null, tx: coin.launchTx, status: "confirmed" });

    let t = created + hour * (0.5 + r());
    let claimed = 0, work = 0, paid = 0, burned = 0n;
    let n = 0;
    while (t < now - 10 * 60_000 && n < 14) {
      const fee = +(0.02 + r() * 0.35).toFixed(3);
      claimed += fee;
      actions.push({ id: `claim:${mint}:${n}`, time: new Date(t).toISOString(), kind: "claim", mint, ticker: c.ticker, job: c.job, amount: String(fee), unit: "SOL", memo: null, tx: id(88), status: "confirmed" });
      const t2 = t + 40_000 + Math.floor(r() * 60_000);
      if (c.job === "cleaner") {
        const raw = BigInt(Math.floor(fee * (1.5e6 + r() * 3e6))) * 1_000_000n;
        work += fee;
        burned += raw;
        const ui = (Number(raw) / 1e6).toFixed(0);
        actions.push({ id: `buy:${mint}:${n}`, time: new Date(t2).toISOString(), kind: "buy", mint, ticker: c.ticker, job: "cleaner", amount: String(fee), unit: "SOL", memo: `job:cleaner:${mint}:${fee}`, tx: id(88), status: "confirmed" });
        actions.push({ id: `burn:${mint}:${n}`, time: new Date(t2 + 20_000).toISOString(), kind: "burn", mint, ticker: c.ticker, job: "cleaner", amount: ui, unit: c.ticker, memo: `job:cleaner:${mint}:${ui}`, tx: id(88), status: "confirmed" });
      } else if (c.job === "payroll") {
        const wallets = 3 + Math.floor(r() * 30);
        work += fee;
        paid += fee;
        const roundId = Math.floor(t / hour);
        const startSlot = 380_000_000 + Math.floor((t - 1e12) / 400);
        actions.push({ id: `payout:${mint}:${n}`, time: new Date(t2).toISOString(), kind: "payout", mint, ticker: c.ticker, job: "payroll", amount: String(fee), unit: "SOL", memo: `job:payroll:${mint}:${fee}`, tx: id(88), status: "confirmed", round: roundId, wallets });
        rounds.push({ mint, ticker: c.ticker, roundId, startSlot, endSlot: startSlot + 8999, seedSlot: startSlot + 9149, blockhash: id(44), chosenSlot: startSlot + Math.floor(r() * 9000), potLamports: lam(fee), status: "done", paidWallets: wallets, payouts: [] });
      }
      t += hour * (2 + r() * 5);
      n++;
    }
    coin.counters.claimedLamports = lam(claimed);
    coin.counters.workLamports = lam(work);
    coin.counters.paidLamports = lam(paid);
    coin.counters.burnedRaw = burned.toString();
    if (c.job === "builder") coin.counters.heldLamports = lam(claimed);
    coins.push(coin);
  });

  return { version: 1, network: "devnet", updated: new Date(now).toISOString(), roundSeconds: 3600, halted: null, coins, actions, rounds, preview: true };
}
