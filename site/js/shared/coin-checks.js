// Pre-launch checks on generated (or manual) coin fields.
const BLOCKED_NAMES = [
  // brands and platforms
  "apple", "google", "microsoft", "amazon", "tesla", "spacex", "nike", "adidas", "coca", "pepsi", "mcdonald",
  "disney", "netflix", "meta", "facebook", "instagram", "tiktok", "twitter", "openai", "chatgpt", "anthropic",
  "claude", "solana", "phantom", "binance", "coinbase", "bitcoin", "ethereum", "pump", "raydium", "meteora", "jupiter",
  "gta", "grand theft", "grandtheftauto", "rockstar", "leonida", "vice city", "vicecity", "los santos", "lossantos", "nintendo", "pokemon", "pikachu", "mario", "sonic", "marvel", "spiderman", "batman", "superman", "star wars", "starwars",
  "yoda", "harry potter", "harrypotter", "simpsons", "shrek", "minecraft", "fortnite", "barbie", "hello kitty", "hellokitty", "pepe", "wojak",
  // public figures
  "trump", "biden", "obama", "elon", "musk", "bezos", "zuckerberg", "taylor swift", "taylorswift", "kanye", "drake", "putin",
  "xi", "modi", "macron", "beyonce", "rihanna", "messi", "ronaldo", "lebron", "satoshi", "vitalik", "cz", "saylor",
];
const PROFANITY = [
  "fuck", "shit", "cunt", "bitch", "nigg", "fag", "retard", "whore", "slut", "rape", "nazi", "hitler", "kike", "spic", "chink",
];

const squash = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const words = (s) => " " + s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim() + " ";
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", $: "s", "@": "a" };
const unleet = (s) => s.toLowerCase().replace(/[013457$@]/g, (c) => LEET[c] ?? c);

// Profanity: substring match (also after undoing leetspeak).
function hasProfanity(text) {
  const a = squash(text), b = squash(unleet(text));
  return PROFANITY.some((w) => a.includes(w) || b.includes(w));
}
// Names: whole-word match, plus a squashed match for long names ("elonmusk", "taylorswiftcoin").
// Short names stay whole-word so "melon" or "metal" don't trip "elon" or "meta".
function hasBlockedName(text) {
  const w = words(text), sq = squash(text);
  return BLOCKED_NAMES.some((n) => w.includes(` ${n} `) || (n.length >= 7 && sq.includes(n)));
}

// Returns null when fine, or an error code the API maps to copy: "blocked_name" | "ticker_taken".
export function checkCoin(coin, { tickerTaken }) {
  const fields = [coin.name, coin.ticker, coin.description, coin.job_reason ?? ""];
  for (const f of fields) if (hasProfanity(f) || hasBlockedName(f)) return "blocked_name";
  if (tickerTaken(coin.ticker)) return "ticker_taken";
  return null;
}
