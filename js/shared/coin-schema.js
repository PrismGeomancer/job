// The AI boundary. Model output is untrusted text. Only these five fields survive, each checked
// against hard rules. Nothing from the model is ever executed or passed to the worker; the worker
// reads the job from the coin record, which can only hold one of the fixed enum values.
import { JOBS, isJob } from "./jobs.js";

export const COIN_FIELDS = Object.freeze(["name", "ticker", "description", "image_prompt", "job", "job_reason"]);

// JSON schema sent to the API as the structured-output format.
export const COIN_JSON_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Coin name, 2 to 32 characters" },
    ticker: { type: "string", description: "Ticker, 2 to 10 uppercase letters or digits, no $" },
    description: { type: "string", description: "Exactly two short sentences, at most 280 characters" },
    image_prompt: { type: "string", description: "A short prompt for a flat logo image, at most 300 characters" },
    job: { type: "string", enum: [...JOBS] },
    job_reason: { type: "string", description: "One line, at most 140 characters, why this job fits" },
  },
  required: [...COIN_FIELDS],
  additionalProperties: false,
};

const LIMITS = {
  name: [2, 32],
  ticker: [2, 10],
  description: [10, 280],
  image_prompt: [3, 300],
  job_reason: [3, 140],
};

// Claims generated text must never make about the token (fees, authorities, results, returns).
const CLAIM_PATTERNS = [
  /\b\d+(\.\d+)?\s?%/,
  /\bfees?\b/i,
  /\bauthorit(y|ies)\b/i,
  /\brenounc/i,
  /\b(guarantee|guaranteed|profit|returns?|apy|apr|moon|100x|1000x|risk[- ]free)\b/i,
  /\b(audited|rug[- ]?proof|safu)\b/i,
];

// Instruction-like content: rejected outright so it can't reach anything downstream.
const INJECTION_PATTERNS = [
  /ignore (all |any |the )?(previous|prior|above)/i,
  /\b(system prompt|developer message)\b/i,
  /\b(send|transfer|withdraw|sell|drain)\b.{0,40}\b(sol|funds|tokens?|wallet)\b/i,
  /\b(private key|secret key|seed phrase|mnemonic)\b/i,
  /```|<\/?script|javascript:/i,
];

export class SchemaError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "SchemaError";
    this.field = field;
  }
}

function cleanText(v) {
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

// Returns a fresh object holding only the allowed fields. Throws SchemaError on any violation,
// including extra fields (the response is not trusted to be what we asked for).
export function validateCoin(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SchemaError("not an object");
  const extra = Object.keys(raw).filter((k) => !COIN_FIELDS.includes(k));
  if (extra.length) throw new SchemaError(`unexpected fields: ${extra.join(", ")}`, extra[0]);

  const out = {};
  for (const f of COIN_FIELDS) {
    if (typeof raw[f] !== "string") throw new SchemaError(`${f} must be a string`, f);
    out[f] = cleanText(raw[f]);
  }
  out.ticker = out.ticker.replace(/^\$/, "").toUpperCase();

  for (const [f, [min, max]] of Object.entries(LIMITS)) {
    if (out[f].length < min || out[f].length > max) throw new SchemaError(`${f} length out of range`, f);
  }
  if (!/^[A-Z0-9]{2,10}$/.test(out.ticker)) throw new SchemaError("ticker must be A-Z or 0-9", "ticker");
  if (!/^[\p{L}\p{N} .'&-]+$/u.test(out.name)) throw new SchemaError("name has unsupported characters", "name");
  if (!isJob(out.job)) throw new SchemaError("unknown job", "job");

  for (const f of ["name", "description", "image_prompt", "job_reason"]) {
    for (const re of INJECTION_PATTERNS) if (re.test(out[f])) throw new SchemaError(`${f} looks like an instruction`, f);
  }
  // The one-line job reason may say "fees" (it explains what the job does with them); it may still
  // never state numbers, percentages, authorities or returns. Name and description get the full ban.
  const FEE_WORD = CLAIM_PATTERNS[1];
  for (const f of ["name", "description", "job_reason"]) {
    for (const re of CLAIM_PATTERNS) {
      if (f === "job_reason" && re === FEE_WORD) continue;
      if (re.test(out[f])) throw new SchemaError(`${f} makes a claim about the token`, f);
    }
  }
  return Object.freeze(out);
}

// Parse the model's text into a validated coin. Anything that isn't a single JSON object fails.
export function parseModelText(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new SchemaError("model output is not JSON");
  }
  return validateCoin(obj);
}
