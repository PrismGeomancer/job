# JOB ($JOB) — Claude Code build prompt

Build the website and a small worker for **JOB**, a Solana launchpad where every coin has exactly one job, chosen at launch and locked. Ticker: **$JOB** (confirm exact spelling with me before it goes into any file other than this one).

This is a **build from scratch**. Do not reuse any ASCII-art engine, mascot, agent or character system. The site has the same *functional skeleton* as asciipad.fun and solanatrashpanda.fun (live counters, how it works, launch page, coin list, coin page, public log, proof table, FAQ) but a plain, straight look.

Read `job-copy-deck.md` first. All visible text comes from it. Do not invent copy.

---

## 1. The idea (do not change)

- Every coin on JOB gets one **job**. The creator picks it at launch. It is written into the coin's metadata link and cannot change.
- Rule for every coin: **1% of every curve trade does that coin's one job. 0% to the creator. 0% to JOB.** (Verify this against Meteora's actual fee configuration before the site says it. See section 6.)
- Three jobs:

| Job | Glyph-free name | What the 1% does |
|---|---|---|
| Cleaner | `cleaner` | Buys the coin on the market and burns it |
| Payroll | `payroll` | Pays holders in SOL at a random hourly roll call, split by balance |
| Builder | `builder` | Adds to the coin's liquidity; LP is locked |

- The worker has **no sell path**. It only buys, burns, adds liquidity and sends SOL to roll-call holders. It keeps a small SOL reserve for transaction fees.

### 1b. The AI launch path ("AI solves everything") — default way to launch
- The visitor types an idea (or pastes the text of a public X post) and presses **Generate coin**. No wallet needed, about a minute.
- AI writes: coin name, ticker, a two-sentence description, an image (or a plain typographic badge as fallback), and **recommends one of the three jobs with a one-line reason**. The visitor can accept the job or switch it before launch. After launch the job is locked.
- The server creates the coin's creator and job wallets (keys encrypted at rest, never sent to a browser), pays the launch rent from an operator wallet, and launches on Meteora.
- The visitor gets a **one-time owner key** shown once. It controls only cosmetic things on that coin's page (description, image, social links). It cannot change the job and cannot withdraw anything.
- **The AI never moves funds.** Model output is parsed against a strict schema: name, ticker, description, image prompt and a job from the fixed enum `cleaner | payroll | builder`. Nothing else from the model is ever executed. All money movement is deterministic worker code with no sell path.
- Output checks before launch: ticker unique on JOB (each ticker exists once), length limits, no real brands, celebrities or copyrighted characters, profanity filter. On a failed check, regenerate once, then show an error.
- Abuse control (the operator pays rent): rate limit per IP and per day, a captcha or proof-of-work on Generate, a daily cap on launches (`MAX_LAUNCHES_PER_DAY`), and a kill switch in config.
- Optional second path, hidden unless `CONFIG.WALLET_LAUNCH` is true: launch from the user's own wallet with manual name, ticker, image and job.
- X post input: the text the visitor pastes is the input. Fetching a post by URL is best effort and may fail; show a clear message if it does.

### Payroll roll call (the hard part)
- One roll call per round (default 1 hour, config `ROUND_SECONDS`).
- The roll call moment is **random and not announced**: derive the slot from a blockhash of a slot after the round ends, so it cannot be known during the round. Publish: round id, round end slot, blockhash used, chosen slot.
- Balances at the chosen slot are rebuilt from transfer history (Helius). Eligible wallets hold at least `MIN_HOLD_BPS` (default 1 = 0.01%) of supply. Exclude the curve, pools, the worker and the creator's launch wallet.
- Pot is split pro rata by balance among eligible wallets. Round with no eligible wallets: pot carries to the next round.
- Everything above must be recomputable by anyone from the public log. If you cannot make the randomness verifiable, say so in the README and in the "Spec vs shipped" table; do not claim it.

---

## 2. Structure rules (what you may and may not touch)

- Stack: your choice, but static output that works on **GitHub Pages under a subpath** (`/<repo>/`). All asset and link paths must be relative or use a configurable base path. No server-side rendering at runtime.
- Backend (`/server`): a small Node API plus the worker, on a cheap always-on server. Endpoints: `POST /generate`, `POST /launch`, `GET /coins`, `GET /log`, `POST /owner/update`. The static site only calls these. GitHub Pages hosts the site; it cannot host the API.
- Key handling: coin wallet keys are encrypted at rest (envelope encryption with a master key from the environment) and are never sent to a browser. No private key or API key may appear in the site bundle, the repo or logs.
- Pages (hash or path routing that works on a subpath): Home, Launch, Coins, Coin detail, Log, FAQ. Keep section ids stable: `#hero`, `#jobs`, `#how`, `#roll-call`, `#coins`, `#proof`, `#faq`.
- Every string is read from one `copy` object loaded from `copy.js` (mirrors the copy deck), so text can change without touching layout.
- After building, run `grep -rniE "ascii|panda|scrap|asciipad|trash|\btick\b|\bclick\b" --exclude=README.md .` and remove every leftover. (The README may mention that the site has no ASCII art.)

---

## 3. Design (straight, black and white)

- Background `#000000`, text `#FFFFFF`, secondary text `#9A9A9A`, hairlines `#222222`.
- One subtle yellow tint, `#E8D96A`, used **only** for: the job badge accent bar, the active nav item underline, live-number highlights, and "armed/next round" states. Never as a large fill. A very faint tint `rgba(232,217,106,0.08)` is allowed for hover rows.
- Type: a neutral grotesk (Inter or system sans) for text; a monospace (JetBrains Mono or system mono) for all numbers, addresses and the log.
- Layout: dashboard-first. Tables, counters, a clean grid, generous spacing. No gradients, no glow, no 3D, no particle effects, no characters.
- Motion: restrained. Number count-ups on load, a 400 ms yellow-tint highlight on a new log row, smooth anchor scroll. Respect `prefers-reduced-motion` (disable all of it).
- **Job badge component** (the visual identity): a rectangular card with a small slot at the top, the coin name and ticker, the job name large, and one live counter for that job (burned so far, SOL paid out, SOL added to liquidity). The same component is used in the coin list and on the coin page.
- Mobile: must work at **320 px** width. Tables become stacked cards. No horizontal scroll.

---

## 4. Pages and behaviour

**Header:** logo, nav, contract address chip (hidden when `CONFIG.CA` is empty), "Launch a coin" button.

**Home:** hero with three live counters (coins launched, SOL put to work, tokens burned) read from the worker's public log file; jobs section (3 cards); how it works (3 steps); roll call explainer with a worked example (labelled as an example); proof table ("Spec vs shipped"); FAQ; closing call to action; footer.

**Launch:** one text box ("Describe your coin or paste an X post") and a **Generate coin** button. Result card: generated name, ticker, description, image, and the recommended job with its reason; a job switcher (three options); a **Launch** button. Before launching, show exactly what will be written on chain. After success: the one-time owner key (shown once, with a copy button and a warning that it cannot be recovered), the coin link and the transaction on Solscan. Refuse to launch if no job is selected. If `CONFIG.WALLET_LAUNCH` is true, add a secondary "Launch from my wallet" tab (Phantom, Solflare, Backpack; manual fields; one signature).

**Coins:** list of coins as job badges, filter by job, sort by newest and by job activity. Empty state when none.

**Coin detail:** job badge, key facts (supply, authorities, curve status), the job's live counter, trades, holder count, and that coin's job log. For payroll coins: next round countdown, last roll call (slot, blockhash, wallets paid).

**Log:** every worker action as a row: time, coin, job, amount, Solscan link, memo. Filter by job and by coin. Memo format: `job:<job>:<coin>:<amount>`.

---

## 5. Data and config

One config object at the top of `config.js`:

```js
export const CONFIG = {
  NAME: "JOB",
  TICKER: "JOB",            // confirm spelling before launch
  CA: "",                   // empty hides the chip
  X_URL: "",                // empty hides the X button
  TG_URL: "",               // empty hides the Telegram button
  REPO_URL: "",             // empty hides the code link
  PLATFORM: "meteora",
  FEE_BPS: 100,             // verify against the platform before showing "1%" anywhere
  ROUND_SECONDS: 3600,
  MIN_HOLD_BPS: 1,
  RPC_URL: "",              // public RPC by default
  HELIUS_KEY: "",           // worker only; never in the site bundle
  LAUNCH_COST_TEXT: "",     // e.g. "about 0.03 SOL" once verified
  API_URL: "",              // empty hides the AI launch box and shows the pre-launch state
  WALLET_LAUNCH: false,     // enables the secondary own-wallet launch tab
  MAX_LAUNCHES_PER_DAY: 50  // operator rent cap; server-side env, mirrored here for the UI
};
// Server-only environment: AI_PROVIDER, AI_API_KEY, IMAGE_API_KEY (optional), MASTER_KEY,
// OPERATOR_WALLET_KEY, HELIUS_KEY. Never in the bundle.
```

Rule: **an empty config value hides the button or field that uses it.** No dead links.

Site data comes from public, keyless sources where possible (Solana public RPC, DexScreener) plus one static `log.json` that the worker writes and publishes. Do not fabricate data. Pre-launch the counters show `0` and the coin list shows the empty state. Do not seed fake coins, holders or log rows.

---

## 6. Truth rules (non-negotiable)

- Say only what is verified. Read authority status (mint, freeze) from the chain; show "Renounced" only when the chain returns null.
- **Fee claim check:** confirm with Meteora's docs and a devnet launch which fee configuration routes 1% of trades to a per-coin job destination, and what the platform's own fee is. If the real numbers differ, change `FEE_BPS` and every fee line in the copy, and tell me. Do not ship "0% to JOB" or "1%" unless verified.
- Never promise price, returns or profit. Payroll pays from trading fees only. If a coin has no volume, the pot is empty and nothing is paid. Say that plainly in the FAQ (it is in the copy deck).
- No invented holder counts, partner names, listings or dates.
- The job is fixed at launch. Do not add any admin path that changes it, including for the operator and for owner keys.
- Server-held wallets are a real trust point. Say so plainly in the FAQ and README: the server holds each coin's wallet keys (encrypted), so users must trust the operator not to misuse them. Mitigate and document: no sell path, a public log of every action, balance reconciliation against the log, and a halt if they mismatch.
- "The AI can't move funds" is true only because model output is schema-validated text and nothing else; keep it that way and test it (a model output that tries to inject an instruction must have no effect).
- AI-generated names and images are fiction or branding, not facts about the token. Never let generated text claim fees, authorities or results.
- Footer risk line, always visible: not financial advice; meme coins can lose all their value; verify the contract on the official X.

---

## 7. Quality rules

- Tests: unit-test the roll call logic (pro rata split, minimum hold, exclusions, carry-over of an empty pot), the config empty-hides-element behaviour, and the memo format. Test the AI boundary: a model response containing extra fields, an unknown job, or instruction-like text must be rejected or ignored and must never change what the worker does. Include a replay test: given a recorded set of transfers and a chosen slot, the balances and payouts are reproducible.
- Accessibility: semantic HTML, visible focus, contrast AA on black, keyboard-operable job picker.
- Performance: no heavy libraries; the home page is usable without the log file (shows zeros).
- Packaging: a `dist/` folder that can be pushed to GitHub Pages as is; document the base-path setting.
- Worker: idempotent per round (a crash and restart must not pay a round twice); write each action to the log before and after sending; refuse any instruction that would sell tokens.
- README with real limitations: what runs on the site, what needs the worker, how randomness is derived, what is not decentralised, what a signature or log proves and does not prove.

---

## 8. Finish

When done, reply with a short summary of what was **verified live** (with the evidence: tx links or test output) versus **mocked or not yet verified** (for example fee routing, Helius history replay, the random slot derivation). Update the "Spec vs shipped" table in the site so each row's status matches that summary exactly.
