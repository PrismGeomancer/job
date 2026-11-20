// Exact integer <-> decimal string conversion. Amounts move as BigInt base units.
export const LAMPORTS_PER_SOL = 1_000_000_000n;

export function toDecimalString(raw, decimals) {
  const v = BigInt(raw);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "");
}

export function fromDecimalString(str, decimals) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(str));
  if (!m) throw new Error(`bad decimal ${str}`);
  const frac = (m[2] || "").padEnd(decimals, "0");
  if (frac.length > decimals) throw new Error(`too many decimals in ${str}`);
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}
