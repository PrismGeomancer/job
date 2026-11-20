// Quick drafts, written in the browser from the words of the idea. Used until the JOB API (and its
// AI writer) is connected. No network calls at all: the time card is the visual, images come with the API.
// The draft goes through the same schema and content checks as AI output (shared/*).
import { validateCoin } from "../shared/coin-schema.js";
import { checkCoin } from "../shared/coin-checks.js";

const STOP = new Set(("a an the coin coins token for of who that people person about with and to is are be never always " +
  "every just like my our your their this it its in on at from by as or but so who's whos when what").split(" "));

// Which job fits the idea: keyword hints, else the idea's length decides (stable for the same text).
const HINTS = {
  cleaner: /\b(clean|tidy|burn|burns|heat|fire|wanted|erase|delete|sweep|wash|scrub|vanish|ghost|shred|less|shrink)\w*/i,
  payroll: /\b(pay|paid|salary|wage|crew|split|share|cut|heist|payday|hustle|shift|job|work|boss|team|gang|union|tip|bonus)\w*/i,
  builder: /\b(build|house|home|road|drive|driver|getaway|garage|safe|wall|bridge|tower|stack|grow|garden|deep|base|city|car)\w*/i,
};
const JOB_ORDER = ["cleaner", "payroll", "builder"];

const LINES = {
  cleaner: [
    ["{name} keeps the place clean.", "Every trade makes a little more of it disappear."],
    ["{name} does not leave a mess.", "What it buys back, it burns."],
  ],
  payroll: [
    ["{name} pays the people who show up.", "Hold it at roll call and you get your cut."],
    ["{name} runs on payday energy.", "Whoever is on the roll splits the take."],
  ],
  builder: [
    ["{name} keeps building while everyone talks.", "Every trade adds another brick to the pool."],
    ["{name} is in it for the long road.", "The pool only gets deeper."],
  ],
};
const REASONS = {
  cleaner: "It sounds like something that should shrink over time.",
  payroll: "It sounds like a crew that splits the take.",
  builder: "It sounds like something that should keep growing.",
};

function words(idea) {
  return idea.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}

const title = (w) => w[0].toUpperCase() + w.slice(1);

export function draftCoin(idea, variant = 0) {
  const ws = words(idea);
  const key = ws.slice(0, 2);
  const name = (key.length ? key.map(title).join(" ") : "Day Job").slice(0, 32);
  // ticker: the first strong word of the idea, up to 8 letters
  const main = ws.find((w) => w.length >= 4) ?? ws[0] ?? "dayjob";
  const ticker = main.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "JOBCOIN";
  const job = JOB_ORDER.find((j) => HINTS[j].test(idea)) ?? JOB_ORDER[idea.length % 3];
  const [l1, l2] = LINES[job][variant % 2];
  return {
    name,
    ticker: ticker.length < 2 ? `${ticker}X` : ticker,
    description: `${l1.replace("{name}", name)} ${l2}`,
    image_prompt: `${key.join(" ") || "a work badge"}, bold simple symbol`,
    job,
    job_reason: REASONS[job],
  };
}

export class DraftError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Returns a draft shaped like the API's /generate response (draftId is null: nothing is stored).
export function writeQuickDraft(idea, { tickerTaken = () => false, variant = 0 } = {}) {
  let coin;
  try {
    coin = validateCoin(draftCoin(idea, variant));
  } catch {
    throw new DraftError("generate_failed");
  }
  const bad = checkCoin(coin, { tickerTaken });
  if (bad) throw new DraftError(bad);
  return {
    draftId: null, name: coin.name, ticker: coin.ticker, description: coin.description, job: coin.job,
    jobReason: coin.job_reason, imageUrl: null,
  };
}
