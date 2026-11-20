// Browser side of the proof of work on Generate (see server/src/pow.js).
function zeroBits(bytes) {
  let n = 0;
  for (const b of bytes) {
    if (b === 0) { n += 8; continue; }
    return n + Math.clz32(b) - 24;
  }
  return n;
}

export async function solve(challenge, bits, { signal } = {}) {
  const enc = new TextEncoder();
  for (let nonce = 0; ; nonce++) {
    if (signal?.aborted) throw new Error("aborted");
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`${challenge}:${nonce}`)));
    if (zeroBits(d) >= bits) return String(nonce);
    if (nonce % 2000 === 0) await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
  }
}
