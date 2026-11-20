# JOB ($JOB) — copy deck

Voice: plain, short, specific. No hype words, no price talk, no emoji. Italic accent phrase is marked with *asterisks* (rendered in the yellow tint). Items in [VERIFY] must be confirmed against the platform before shipping. All strings live in `copy.js`.

---

## Meta
- title: `JOB — give your coin one job`
- description: `A Solana launchpad where every coin has exactly one job, chosen at launch and locked: burn, payroll or liquidity.`
- og:title: `JOB — one coin, one job`

## Nav
Home · Launch · Coins · Log · How it works · FAQ
Button: `Launch a coin`
Contract chip: `CA: {short}` (hidden when empty) · Pre-launch: `CA: soon`

## Hero
- eyebrow: `Solana launchpad`
- H1: `Give your coin one *job*.`
- sub: `Describe a coin. AI writes it and recommends its job. 1% of every trade does that job. Nobody can change it later.`
- primary button: `Generate coin`
- secondary button: `See the jobs`
- hint under the box: `No wallet needed. About a minute.`
- counters (labels): `Coins launched` · `SOL put to work` · `Tokens burned` · `SOL paid to holders`
- counter footnote: `Read from the public log. Zero until the first coin.`

## Jobs section (`#jobs`)
- heading: `Three jobs. Pick one.`
- lede: `The job is written when the coin launches. It can't be changed, not by the creator and not by us.`

**Cleaner**
- line: `Buys the coin back and burns it.`
- detail: `Every fee buys the coin on the market. What it buys is burned. The supply only goes down.`
- counter label: `Burned so far`

**Payroll**
- line: `Pays holders at a random roll call.`
- detail: `Once an hour the site takes a roll call at a moment nobody knows in advance. Everyone holding then splits the fee pot by balance.`
- counter label: `Paid out so far`

**Builder**
- line: `Adds to the liquidity. Locks it.`
- detail: `Every fee goes into the coin's liquidity pool. The liquidity tokens are locked. The pool only gets deeper.`
- counter label: `Added to liquidity`

- footnote: `Every coin does one job and nothing else.`

## How it works (`#how`)
- heading: `How it works`
1. **Describe it.** `Type an idea or paste an X post. No wallet needed.`
2. **AI builds it.** `AI writes the name, ticker, description and image, and recommends one job. You can switch the job before launch.`
3. **It goes to work.** `The coin launches on Solana. 1% of every trade does its job. Every action lands in the public log.`

- fee box heading: `Where the 1% goes` [VERIFY fee numbers]
  - `1% → the coin's job`
  - `0% → the creator`
  - `0% → JOB`
  - note: `The platform's own protocol fee is separate. [VERIFY amount]`

## Roll call (`#roll-call`)
- heading: `Payroll, explained`
- lede: `Holding means being on the clock.`
- steps:
  1. `Each round lasts one hour. The fee pot fills as the coin trades.`
  2. `After the round ends, a random moment inside it is chosen from a blockhash nobody could know during the round.`
  3. `Everyone holding at least 0.01% of the supply at that moment is on the roll.`
  4. `The pot is split by balance and paid in SOL. An empty pot carries over.`
- worked example label: `Example (numbers made up to show the split)`
  - `Pot: 1.0 SOL. Four wallets on the roll hold 40%, 30%, 20% and 10% of the eligible balance. They are paid 0.4, 0.3, 0.2 and 0.1 SOL.`
- verify line: `Every round publishes its slot, blockhash and payout list, so anyone can recompute it.`
- honesty line: `If a coin has no trading, the pot is empty and nothing is paid.`

## Launch page (`#launch`)
- heading: `Launch a coin`
- box label: `Describe your coin or paste an X post`
- placeholder: `A coin for people who always say five more minutes`
- button: `Generate coin` · loading: `Writing your coin…` · button after: `Regenerate`
- result labels: `Name` · `Ticker` · `Description` · `Image` · `Recommended job` · `Why`
- job switcher label: `Job (locked after launch)`
- review heading: `What will be written on chain`
- review lines: `Supply: 1,000,000,000` · `Mint authority: none` · `Freeze authority: none` · `Job: {job}` · `Fee: 1% to the job, 0% creator, 0% JOB` [VERIFY]
- cost line: `Launch cost: {LAUNCH_COST_TEXT}. We pay the launch rent.` [VERIFY]
- button: `Launch` · launching: `Launching…`
- success heading: `Your coin is live`
- owner key box: `Your owner key`
  - `Shown once. Copy it now. We can't recover it.`
  - `It lets you edit this coin's page (description, image, links). It can't change the job and can't move any funds.`
  - buttons: `Copy key` · `I saved it`
- tabs (only if own-wallet launch is on): `Generate with AI` · `Launch from my wallet`
- wallet tab button: `Connect wallet`

## Coins (`#coins`)
- heading: `Coins`
- filters: `All` · `Cleaner` · `Payroll` · `Builder`
- sort: `Newest` · `Most active`
- empty state: `No coins yet. The first one is yours.`
- empty state button: `Generate coin`

## Coin page
- badge slot labels: `{NAME}` · `${TICKER}` · `JOB: {JOB}`
- facts: `Supply` · `Mint authority` · `Freeze authority` · `Curve` · `Holders`
- authority values: `Renounced` (only when the chain returns null) · `Not renounced` · `Checking…`
- job counters: `Burned so far` · `Paid out so far` · `Added to liquidity`
- payroll extras: `Next roll call window ends in {time}` · `Last roll call: slot {slot}` · `Wallets paid: {n}`
- tabs: `Trades` · `Holders` · `Job log`
- job line: `This coin's job is {job}. It was written at launch and can't change.`

## Log (`#log`)
- heading: `Job log`
- lede: `Every action the engine takes, as a Solana transaction.`
- columns: `Time` · `Coin` · `Job` · `Amount` · `Memo` · `Tx`
- empty state: `Nothing here yet. Rows appear after the first coin launches.`
- note: `The engine can't sell. Memo format: job:<job>:<coin>:<amount>`

## Proof: Spec vs shipped (`#proof`)
- heading: `Spec vs shipped`
- lede: `What we say JOB does, and what is live. Statuses are updated from what was verified.`
- columns: `Claim` · `Status`
- rows (all start as `Building` until verified):
  1. `1% of every trade does the coin's job`
  2. `0% to the creator and 0% to JOB`
  3. `The job can't change after launch`
  4. `The engine has no sell path`
  5. `Payroll roll call is random and recomputable`
  6. `Liquidity from Builder coins is locked`
  7. `Every engine action is in the public log`
- status values: `Live` · `Building` · `Not built`

## FAQ (`#faq`)
- heading: `Questions`
1. **Do I need a wallet to launch?**
   `No. JOB creates the coin's wallets on the server (encrypted, never sent to a browser) and pays the launch rent. You get a one-time owner key to edit the coin's page.`
2. **Can I trust the server with the wallets?**
   `That is a real trust point. The server holds each coin's keys, so you trust us not to misuse them. We limit it: the engine has no sell path, every action is in the public log, and it halts if balances stop matching the log.`
3. **Where does the money for the job come from?**
   `Only from the 1% fee on that coin's trades. Nothing else funds it. If a coin has no trading, there is nothing to spend.`
4. **Can the AI move funds?**
   `No. AI writes the name, ticker, description and image and suggests a job. That is all. Everything that touches money is fixed code.`
5. **Can I change a coin's job after launch?**
   `No. Not you, and not us.`
6. **Does Payroll guarantee I get paid?**
   `No. Payroll pays from trading fees only, to wallets that are holding at the random moment. If you are not holding then, or the coin has no volume, nothing is paid.`
7. **Is this real SOL on mainnet?**
   `Yes. [VERIFY before launch: remove this line if the site is still on devnet.]`
8. **Why one job?**
   `A coin that does one thing is easy to check. You can read its job, see its log and know what the fee does.`

## Closing call to action
- H2: `One coin. One *job*.`
- sub: `Launch takes about a minute. No wallet needed.`
- button: `Generate coin`

## Toasts
- `Copied.`
- `Owner key copied. Keep it safe.`
- `Coin launched.`
- `Job locked.`
- `Link copied.`

## Errors and edge states
- generate failed: `Couldn't write the coin. Try again.`
- ticker taken: `That ticker is taken on JOB. Regenerating.`
- blocked name: `That name can't be used. Try a different idea.`
- rate limited: `Too many tries. Wait a few minutes.`
- daily cap: `Today's launches are used up. Come back tomorrow.`
- launch failed: `Launch failed. Nothing was spent from your side. Try again.`
- no job chosen: `Pick a job first.`
- log unavailable: `The log is unavailable right now. Counters may be out of date.`
- API down: `Launching is paused. You can still browse coins.`
- wallet not found: `No wallet found. Install Phantom, Solflare or Backpack.`
- pre-launch state: `JOB opens soon. Counters show zero until the first coin.`

## Footer
- line: `JOB — one coin, one job.`
- links: `Code` (hidden when empty) · `Log` · `X` (hidden when empty) · `Telegram` (hidden when empty)
- risk: `Meme coins are high risk and can lose all their value. Nothing here is financial advice. Verify the contract on the official X.`
