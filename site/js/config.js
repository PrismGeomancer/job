// Site configuration. Rule: an empty value hides the button or field that uses it.
export const CONFIG = {
  NAME: "JOB",
  TICKER: "JOB",
  CA: "8PYmeT7x1JFG9F8xF1nUDQYFXvx3UxQfrVsqd7ovpump",                 // empty hides the chip ("CA: soon" is shown instead)
  X_URL: "https://x.com/Jobgent", // empty hides the X button
  TG_URL: "",               // empty hides the Telegram button
  REPO_URL: "",             // empty hides the code link
  PLATFORM: "meteora",
  NETWORK: "devnet",        // "devnet" | "mainnet"; also sets Solscan links and the public RPC
  FEE_BPS: 100,             // total trading fee on every JOB coin's curve (set in the server's curve config)
  PROTOCOL_FEE_PERCENT: 20, // Meteora's share of that fee (PROTOCOL_FEE_PERCENT in the DBC SDK)
  FEES_VERIFIED: false,     // set true after a devnet launch confirms the split; until then fee lines carry a "not verified" tag
  ROUND_SECONDS: 3600,
  MIN_HOLD_BPS: 1,
  RPC_URL: "",              // empty uses the public RPC for NETWORK
  LAUNCH_COST_TEXT: "",     // e.g. "about 0.03 SOL" once measured; empty hides the line
  API_URL: "",              // empty hides the AI launch box and shows the pre-launch state
  WALLET_LAUNCH: false,     // enables the secondary own-wallet launch tab
  MAX_LAUNCHES_PER_DAY: 50, // mirrors the server's cap, for the UI
  LOG_URL: "data/log.json", // static log the worker publishes next to the site
};
// Server-only environment (never in this bundle): AI_API_KEY, MASTER_KEY, OPERATOR_WALLET_KEY,
// HELIUS_KEY, GITHUB_TOKEN, POW_SECRET.
