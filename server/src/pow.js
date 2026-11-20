// Proof of work on Generate (no third-party captcha): the browser finds a nonce such that
// sha256("<challenge>:<nonce>") starts with `bits` zero bits. Challenges are HMAC-signed and expire.
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function issueChallenge(secret, bits, now = Date.now()) {
  const body = `${now}.${randomBytes(12).toString("hex")}.${bits}`;
  const sig = createHmac("sha256", secret).update(body).digest("hex").slice(0, 32);
  return { challenge: `${body}.${sig}`, bits };
}

export function leadingZeroBits(buf) {
  let n = 0;
  for (const byte of buf) {
    if (byte === 0) { n += 8; continue; }
    n += Math.clz32(byte) - 24;
    break;
  }
  return n;
}

export function verifySolution(secret, challenge, nonce, { maxAgeMs = 10 * 60_000, now = Date.now(), used }) {
  const parts = String(challenge).split(".");
  if (parts.length !== 4) return false;
  const [ts, , bitsStr, sig] = parts;
  const expect = createHmac("sha256", secret).update(parts.slice(0, 3).join(".")).digest("hex").slice(0, 32);
  if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return false;
  if (now - Number(ts) > maxAgeMs || Number(ts) > now + 60_000) return false;
  if (used?.has(challenge)) return false;
  const digest = createHash("sha256").update(`${challenge}:${nonce}`).digest();
  if (leadingZeroBits(digest) < Number(bitsStr)) return false;
  used?.add(challenge);
  return true;
}
