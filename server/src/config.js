// Server configuration, from the environment only. Secrets never leave this process.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const num = (v, d) => (v === undefined || v === "" ? d : Number(v));
const bool = (v, d = false) => (v === undefined || v === "" ? d : /^(1|true|yes)$/i.test(v));

export function loadConfig(env = process.env) {
  const network = env.NETWORK || "devnet";
  return {
    network,
    port: num(env.PORT, 8787),
    corsOrigin: env.CORS_ORIGIN || "*",
    rpcUrl: env.RPC_URL || (env.HELIUS_KEY ? `https://${network === "mainnet" ? "mainnet" : "devnet"}.helius-rpc.com/?api-key=${env.HELIUS_KEY}` : `https://api.${network === "mainnet" ? "mainnet-beta" : "devnet"}.solana.com`),
    aiApiKey: env.AI_API_KEY || env.ANTHROPIC_API_KEY || "",
    aiModel: env.AI_MODEL || "claude-opus-5-5",
    masterKey: env.MASTER_KEY || "",
    operatorKey: env.OPERATOR_WALLET_KEY || "", // base58 secret key or JSON array
    powSecret: env.POW_SECRET || env.MASTER_KEY || "",
    powBits: num(env.POW_BITS, 18),
    killSwitch: bool(env.KILL_SWITCH),
    maxLaunchesPerDay: num(env.MAX_LAUNCHES_PER_DAY, 50),
    generatePerIpPer10Min: num(env.GENERATE_PER_IP, 5),
    launchPerIpPerDay: num(env.LAUNCH_PER_IP_PER_DAY, 3),
    totalFeeBps: num(env.TOTAL_FEE_BPS, 100),
    migrationQuoteThresholdSol: num(env.MIGRATION_SOL, 85),
    roundSeconds: num(env.ROUND_SECONDS, 3600),
    minHoldBps: num(env.MIN_HOLD_BPS, 1),
    reserveLamports: BigInt(num(env.RESERVE_LAMPORTS, 20_000_000)),     // 0.02 SOL kept for tx fees
    minClaimLamports: BigInt(num(env.MIN_CLAIM_LAMPORTS, 10_000_000)),  // claim when at least 0.01 SOL
    minSpendLamports: BigInt(num(env.MIN_SPEND_LAMPORTS, 10_000_000)),
    jobWalletSeedLamports: BigInt(num(env.JOB_WALLET_SEED_LAMPORTS, 30_000_000)), // operator funds tx fees for the job wallet
    workerIntervalMs: num(env.WORKER_INTERVAL_MS, 30_000),
    storePath: env.STORE_PATH || join(here, "..", "data", "store.json"),
    siteBaseUrl: (env.SITE_BASE_URL || "").replace(/\/$/, ""), // e.g. https://you.github.io/job
    github: { token: env.GITHUB_TOKEN || "", repo: env.GITHUB_REPO || "", branch: env.GITHUB_BRANCH || "gh-pages", dir: env.GITHUB_DIR || "" },
    publicDir: env.PUBLIC_DIR || join(here, "..", "..", "dist"),
  };
}
