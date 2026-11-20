// Meteora Dynamic Bonding Curve adapter. Every coin gets its own config whose fee claimer is that
// coin's job wallet, so trading fees (after Meteora's protocol share) can only flow to the job wallet.
// Exposes only what the worker is allowed to do: launch, read fees, claim fees, BUY, read pool state.
// There is deliberately no sell function here.
import {
  DynamicBondingCurveClient, buildCurve, deriveDbcPoolAddress, U64_MAX, PROTOCOL_FEE_PERCENT,
  TokenType, TokenDecimal, TokenAuthorityOption, BaseFeeMode, CollectFeeMode, MigrationOption, MigrationFeeOption, ActivationType,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

export const TOKEN_DECIMALS = 6;
export const TOTAL_SUPPLY = 1_000_000_000;
export { PROTOCOL_FEE_PERCENT };

// Curve settings for every JOB coin. Fixed in code so every coin is launched the same way.
export function jobCurveConfig({ totalFeeBps, migrationQuoteThresholdSol }) {
  return buildCurve({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: 9,
      tokenAuthorityOption: TokenAuthorityOption.Immutable, // no update or mint authority
      totalTokenSupply: TOTAL_SUPPLY,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: { startingFeeBps: totalFeeBps, endingFeeBps: totalFeeBps, numberOfPeriod: 0, totalDuration: 0 },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken, // fees accrue in SOL
      creatorTradingFeePercentage: 0,            // partner (= job wallet) gets the whole non-protocol share
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps100,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 100, // all LP from migration is locked forever
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: 20,
    migrationQuoteThreshold: migrationQuoteThresholdSol,
  });
}

export function createMeteora(solana, { totalFeeBps, migrationQuoteThresholdSol }) {
  const client = new DynamicBondingCurveClient(solana.connection, "confirmed");
  const pk = (v) => (v instanceof PublicKey ? v : new PublicKey(v));

  // Build (not send) the launch: one transaction that creates the coin's config and pool.
  async function prepareLaunch({ operator, jobWallet, mint, name, symbol, uri }) {
    const config = Keypair.generate();
    const params = jobCurveConfig({ totalFeeBps, migrationQuoteThresholdSol });
    const tx = await client.partner.createConfigAndPool({
      ...params,
      config: config.publicKey,
      feeClaimer: jobWallet.publicKey,
      leftoverReceiver: jobWallet.publicKey,
      quoteMint: NATIVE_MINT,
      payer: operator.publicKey,
      preCreatePoolParam: { name, symbol, uri, poolCreator: jobWallet.publicKey, baseMint: mint.publicKey },
    });
    const pool = deriveDbcPoolAddress(NATIVE_MINT, mint.publicKey, config.publicKey);
    return { tx, signers: [operator, config, mint, jobWallet], mint: mint.publicKey.toBase58(), config: config.publicKey.toBase58(), pool: pool.toBase58() };
  }

  async function unclaimedFeeLamports(pool) {
    const m = await client.state.getPoolFeeMetrics(pk(pool));
    return BigInt(m.current.partnerQuoteFee.toString());
  }

  async function prepareClaim({ pool, jobWallet }) {
    return client.partner.claimPartnerTradingFee({
      feeClaimer: jobWallet.publicKey, payer: jobWallet.publicKey, pool: pk(pool),
      maxBaseAmount: U64_MAX, maxQuoteAmount: U64_MAX, receiver: jobWallet.publicKey,
    });
  }

  async function poolState(pool) {
    const p = await client.state.getPool(pk(pool));
    if (!p) return null;
    const progress = await client.state.getPoolQuoteTokenCurveProgress(pk(pool)).catch(() => null);
    return { migrated: Number(p.isMigrated) === 1, progress, raw: p };
  }

  // Buy the coin with SOL on the curve (pre-migration only). Slippage-bounded.
  async function prepareBuy({ pool, wallet, lamports, slippageBps = 300 }) {
    const virtualPool = await client.state.getPool(pk(pool));
    if (!virtualPool) throw new Error("buy: pool not found");
    if (Number(virtualPool.isMigrated) === 1) throw new Error("buy: pool migrated; curve buy not available");
    const config = await client.state.getPoolConfig(virtualPool.config);
    const slot = await solana.connection.getSlot("confirmed");
    const time = await solana.connection.getBlockTime(slot);
    const amountIn = new BN(lamports.toString());
    const quote = client.pool.swapQuote({
      virtualPool, config, swapBaseForQuote: false, amountIn, slippageBps,
      hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint: new BN(time ?? Math.floor(Date.now() / 1000)),
    });
    const tx = await client.pool.swap({
      owner: wallet.publicKey, pool: pk(pool), amountIn, minimumAmountOut: quote.minimumAmountOut,
      swapBaseForQuote: false, referralTokenAccount: null,
    });
    return { tx, expectedOut: BigInt((quote.outputAmount ?? quote.minimumAmountOut).toString()) };
  }

  return { prepareLaunch, unclaimedFeeLamports, prepareClaim, poolState, prepareBuy };
}
