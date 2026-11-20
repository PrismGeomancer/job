// Launch flow: the server creates the coin's job wallet, publishes its metadata (with the job),
// pays the launch rent from the operator wallet and creates the pool on Meteora.
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { isJob } from "../../site/js/shared/jobs.js";
import { newWallet, newOwnerKey, loadKeypair } from "./keys.js";
import { TOKEN_DECIMALS, TOTAL_SUPPLY } from "./chain/meteora.js";
import { downloadImage } from "./images.js";

export function parseSecretKey(value) {
  const v = String(value || "").trim();
  if (!v) throw new Error("OPERATOR_WALLET_KEY is not set");
  const bytes = v.startsWith("[") ? Uint8Array.from(JSON.parse(v)) : bs58.decode(v);
  return Keypair.fromSecretKey(bytes);
}

export class LaunchError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

export function createLauncher({ store, backend, publisher, config, now = () => Date.now() }) {
  const ready = () => !!(config.masterKey && config.operatorKey && config.siteBaseUrl);

  async function launch({ draft, job }) {
    if (!isJob(job)) throw new LaunchError("no_job");
    if (!ready()) throw new LaunchError("api_down", "launch is not configured");
    if (store.tickerTaken(draft.coin.ticker)) throw new LaunchError("ticker_taken");
    const operator = parseSecretKey(config.operatorKey);
    const mint = Keypair.generate();
    const mintAddr = mint.publicKey.toBase58();
    const wallet = newWallet(config.masterKey);
    const jobKp = loadKeypair(wallet, config.masterKey);

    // Image + metadata, published next to the site. The job is written into the metadata.
    let image = null;
    const img = draft.imageUrl ? await downloadImage(draft.imageUrl) : null;
    if (img) {
      await publisher.put(`meta/${mintAddr}.${img.ext}`, img.buf, `meta: image ${draft.coin.ticker}`);
      image = `${config.siteBaseUrl}/meta/${mintAddr}.${img.ext}`;
    }
    const metadata = {
      name: draft.coin.name,
      symbol: draft.coin.ticker,
      description: draft.coin.description,
      ...(image ? { image } : {}),
      external_url: `${config.siteBaseUrl}/#/coin/${mintAddr}`,
      attributes: [{ trait_type: "job", value: job }],
      job,
    };
    const metadataUri = `${config.siteBaseUrl}/meta/${mintAddr}.json`;
    await publisher.put(`meta/${mintAddr}.json`, JSON.stringify(metadata, null, 2), `meta: ${draft.coin.ticker}`);

    const { tx, signers, config: cfg, pool } = await backend.meteora.prepareLaunch({
      operator, jobWallet: jobKp, mint, name: draft.coin.name, symbol: draft.coin.ticker, uri: metadataUri,
    });
    const prepared = await backend.solana.prepare(tx, { feePayer: operator, signers });
    const st = await backend.solana.send(prepared);
    if (st !== "confirmed") throw new LaunchError("launch_failed", `launch tx ${st}`);

    // Seed the job wallet with a little SOL from the operator for its transaction fees.
    const seed = await backend.solana.prepare([backend.solana.transferIx(operator.publicKey, wallet.address, config.jobWalletSeedLamports)], { feePayer: operator, signers: [] });
    const seedSt = await backend.solana.send(seed).catch(() => "failed");

    const owner = newOwnerKey();
    const coin = {
      mint: mintAddr, pool, config: cfg, name: draft.coin.name, ticker: draft.coin.ticker, description: draft.coin.description,
      image, links: {}, job, jobWallet: wallet, creatorWallet: wallet.address, ownerKeyHash: owner.hash,
      createdAt: new Date(now()).toISOString(), launchTx: prepared.signature, decimals: TOKEN_DECIMALS,
      supplyRaw: (BigInt(TOTAL_SUPPLY) * 10n ** BigInt(TOKEN_DECIMALS)).toString(), metadataUri,
      ledger: {
        seedLamports: seedSt === "confirmed" ? config.jobWalletSeedLamports.toString() : "0", txCount: 0,
        claims: 0, buys: 0, burns: 0, claimedLamports: "0", potLamports: "0", workLamports: "0", paidLamports: "0", burnedRaw: "0", migrated: false,
      },
      payroll: { currentRound: null, currentStartSlot: null, carryLamports: "0", knownAccounts: [] },
    };
    store.update((s) => {
      s.coins.push(coin);
      const day = new Date(now()).toISOString().slice(0, 10);
      s.launches[day] = (s.launches[day] ?? 0) + 1;
      s.actions.push({ id: `launch:${mintAddr}`, time: coin.createdAt, kind: "launch", mint: mintAddr, ticker: coin.ticker, job, amount: null, unit: null, memo: null, tx: prepared.signature, status: "confirmed" });
    });
    return { coin, ownerKey: owner.key };
  }

  return { launch, ready };
}
