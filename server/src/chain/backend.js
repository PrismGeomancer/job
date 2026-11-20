// The real chain backend for the worker: Solana RPC + Meteora DBC. Only the engine methods exist.
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { deriveDbcPoolAuthority } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { createSolana } from "./solana.js";
import { createMeteora, TOKEN_DECIMALS } from "./meteora.js";
import { createTokens } from "./tokens.js";
import { createHistory } from "./history.js";
import { loadKeypair } from "../keys.js";

// DAMM v2 (cp-amm) pool authority, which holds migrated pool vaults. Override with DAMM_V2_POOL_AUTHORITY.
const DAMM_V2_POOL_AUTHORITY = process.env.DAMM_V2_POOL_AUTHORITY || "HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC";

export function createBackend(config, { operatorPublicKey } = {}) {
  const solana = createSolana(config.rpcUrl);
  const meteora = createMeteora(solana, config);
  const tokens = createTokens(solana.connection, TOKEN_DECIMALS);
  const history = createHistory(solana.connection);
  const kp = (coin) => loadKeypair(coin.jobWallet, config.masterKey);

  return {
    solana, meteora,
    jobBalance: (coin) => solana.getBalance(coin.jobWallet.address),
    unclaimedFees: (coin) => meteora.unclaimedFeeLamports(coin.pool),
    poolState: (coin) => meteora.poolState(coin.pool),
    tokenBalance: (coin) => tokens.balance(coin.mint, new PublicKey(coin.jobWallet.address)),
    async prepareClaim(coin) {
      const w = kp(coin);
      const tx = await meteora.prepareClaim({ pool: coin.pool, jobWallet: w });
      return solana.prepare(tx, { feePayer: w, signers: [] });
    },
    async prepareBuy(coin, lamports, memo) {
      const w = kp(coin);
      const { tx } = await meteora.prepareBuy({ pool: coin.pool, wallet: w, lamports });
      return solana.prepare(tx, { feePayer: w, signers: [], memo });
    },
    async prepareBurn(coin, amount, memo) {
      const w = kp(coin);
      return solana.prepare([tokens.burnIx(coin.mint, w.publicKey, amount)], { feePayer: w, signers: [], memo });
    },
    async preparePayout(coin, payouts, memo) {
      const w = kp(coin);
      const ixs = payouts.map((p) => solana.transferIx(w.publicKey, p.wallet, p.lamports));
      return solana.prepare(ixs, { feePayer: w, signers: [], memo });
    },
    send: (prepared) => solana.send(prepared),
    status: (sig, lvbh) => solana.status(sig, lvbh),
    getSlot: () => solana.getSlot(),
    blockhashAtOrAfter: (slot) => solana.blockhashAtOrAfter(slot),
    balancePoints: (coin, untilSlot, known) => history.mintPoints(coin.mint, untilSlot, known),
    // Wallets holding a non-zero balance, excluding curve/pool vaults and the worker.
    async holderCount(coin) {
      const accs = await solana.connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
        filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: coin.mint } }],
      });
      const skip = new Set(await this.excludedOwners(coin));
      const owners = new Set();
      for (const a of accs) {
        const info = a.account.data?.parsed?.info;
        if (info && info.tokenAmount?.amount !== "0" && !skip.has(info.owner)) owners.add(info.owner);
      }
      return owners.size;
    },
    async excludedOwners(coin) {
      return [
        deriveDbcPoolAuthority().toBase58(), // curve vaults
        DAMM_V2_POOL_AUTHORITY,              // migrated pool vaults
        coin.pool, coin.jobWallet.address,   // the worker
        coin.creatorWallet,                  // launch wallet (same as the job wallet for AI launches)
        operatorPublicKey,
      ].filter(Boolean);
    },
  };
}
