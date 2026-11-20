// Server state in one JSON file, written atomically (tmp file + rename). Holds encrypted keys;
// never served as is. The public view is built by publiclog.js.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const EMPTY = () => ({
  version: 1,
  coins: [],        // private coin records (with encrypted wallets and owner key hash)
  drafts: {},       // draftId -> { coin, imageUrl, createdAt, ip }
  launches: {},     // "YYYY-MM-DD" -> count
  actions: [],      // public action rows
  rounds: [],       // payroll rounds (public)
  intents: {},      // worker idempotency: intentId -> { status, signature, lastValidBlockHeight, ... }
  halted: null,     // { reason, at } when reconciliation failed
});

export function openStore(path) {
  let state = EMPTY();
  if (existsSync(path)) state = { ...EMPTY(), ...JSON.parse(readFileSync(path, "utf8")) };
  const save = () => {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(tmp, path);
  };
  return {
    get state() { return state; },
    save,
    update(fn) { const r = fn(state); save(); return r; },
    coinByMint: (mint) => state.coins.find((c) => c.mint === mint),
    tickerTaken: (ticker) => state.coins.some((c) => c.ticker.toUpperCase() === String(ticker).toUpperCase()),
  };
}
