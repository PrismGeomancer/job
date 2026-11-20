// Devnet verification of the fee claim. Needs a funded devnet wallet:
//   1. get test SOL at https://faucet.solana.com (about 2 SOL)
//   2. OPERATOR_WALLET_KEY=<base58 or JSON array> node scripts/devnet-check.js
// It launches one coin with the real JOB curve config, buys 0.5 SOL of it from a second wallet,
// reads the pool's fee counters and claims the job wallet's share. It prints every signature so
// you can check them on Solscan (devnet). Nothing here touches mainnet.
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createSolana } from "../src/chain/solana.js";
import { createMeteora, PROTOCOL_FEE_PERCENT } from "../src/chain/meteora.js";
import { parseSecretKey } from "../src/launch.js";

const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const BUY = BigInt(Math.round(Number(process.env.BUY_SOL || 0.5) * LAMPORTS_PER_SOL));
const solana = createSolana(RPC);
const meteora = createMeteora(solana, { totalFeeBps: Number(process.env.TOTAL_FEE_BPS || 100), migrationQuoteThresholdSol: 85 });
const link = (sig) => `https://solscan.io/tx/${sig}?cluster=devnet`;

const operator = parseSecretKey(process.env.OPERATOR_WALLET_KEY);
const job = Keypair.generate();
const trader = Keypair.generate();
const mint = Keypair.generate();
console.log("operator", operator.publicKey.toBase58(), "balance", Number(await solana.getBalance(operator.publicKey.toBase58())) / 1e9, "SOL");

// 1. launch
const l = await meteora.prepareLaunch({ operator, jobWallet: job, mint, name: "Job Check", symbol: "JOBCHK", uri: "https://example.com/job-check.json" });
let p = await solana.prepare(l.tx, { feePayer: operator, signers: l.signers });
console.log("launch", await solana.send(p), link(p.signature));
console.log("mint", mint.publicKey.toBase58(), "pool", l.pool);

// 2. fund the trader and the job wallet from the operator
p = await solana.prepare([
  solana.transferIx(operator.publicKey, trader.publicKey.toBase58(), BUY + 50_000_000n),
  solana.transferIx(operator.publicKey, job.publicKey.toBase58(), 20_000_000n),
], { feePayer: operator, signers: [] });
console.log("fund", await solana.send(p), link(p.signature));

// 3. a trade
const b = await meteora.prepareBuy({ pool: l.pool, wallet: trader, lamports: BUY });
p = await solana.prepare(b.tx, { feePayer: trader, signers: [] });
console.log("buy", await solana.send(p), link(p.signature));

// 4. fee counters from the pool
const unclaimed = await meteora.unclaimedFeeLamports(l.pool);
const expectedTotal = (BUY * BigInt(process.env.TOTAL_FEE_BPS || 100)) / 10_000n;
console.log(`trade ${Number(BUY) / 1e9} SOL -> partner (job wallet) unclaimed fee: ${unclaimed} lamports`);
console.log(`expected if ${PROTOCOL_FEE_PERCENT}% goes to protocol: ~${(expectedTotal * BigInt(100 - PROTOCOL_FEE_PERCENT)) / 100n} of ${expectedTotal} total fee`);
console.log(`job share of the trade: ${((Number(unclaimed) / Number(BUY)) * 100).toFixed(4)}%`);

// 5. the job wallet claims it
const before = await solana.getBalance(job.publicKey.toBase58());
const ctx = await meteora.prepareClaim({ pool: l.pool, jobWallet: job });
p = await solana.prepare(ctx, { feePayer: job, signers: [] });
console.log("claim", await solana.send(p), link(p.signature));
const after = await solana.getBalance(job.publicKey.toBase58());
console.log(`job wallet balance change: ${after - before} lamports (claim minus tx fee)`);
process.exit(0);
