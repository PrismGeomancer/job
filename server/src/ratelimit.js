// Fixed-window limits per key (IP) and a global daily launch counter.
export function createLimiter({ limit, windowMs }) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const e = hits.get(key);
    if (!e || now >= e.reset) {
      hits.set(key, { n: 1, reset: now + windowMs });
      if (hits.size > 50_000) for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
      return true;
    }
    if (e.n >= limit) return false;
    e.n += 1;
    return true;
  };
}

export function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}
