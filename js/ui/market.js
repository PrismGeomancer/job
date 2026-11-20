// "Trading on Solana right now": a live ticker board of recent Solana tokens from DexScreener.
// These are other people's tokens, labeled as such. They are never mixed into JOB's own coins.
import { copy } from "../copy.js";
import { h, clear, reducedMotion } from "../lib/dom.js";
import { compact } from "../lib/format.js";

const PROFILES = "https://api.dexscreener.com/token-profiles/latest/v1";
const TOKENS = "https://api.dexscreener.com/tokens/v1/solana/";
const MAX = 18;

async function json(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function fetchMarket() {
  const profiles = await json(PROFILES);
  const addrs = [...new Set(profiles.filter((p) => p.chainId === "solana").map((p) => p.tokenAddress))].slice(0, 30);
  if (!addrs.length) return [];
  const pairs = await json(TOKENS + addrs.join(","));
  // best pair per token (most liquidity)
  const best = new Map();
  for (const p of pairs) {
    const a = p.baseToken?.address;
    if (!a || !addrs.includes(a)) continue;
    const cur = best.get(a);
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(a, p);
  }
  return [...best.values()]
    .filter((p) => p.priceUsd && p.baseToken?.symbol)
    .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
    .slice(0, MAX)
    .map((p) => ({
      symbol: String(p.baseToken.symbol).slice(0, 14),
      price: Number(p.priceUsd),
      change: typeof p.priceChange?.h24 === "number" ? p.priceChange.h24 : null,
      volume: p.volume?.h24 ?? null,
      icon: p.info?.imageUrl || null,
      url: p.url,
    }));
}

function price(v) {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  const s = v.toPrecision(3);
  return `$${Number(s).toFixed(Math.min(12, 2 - Math.floor(Math.log10(v))))}`;
}

function item(t) {
  const up = t.change !== null && t.change >= 0;
  return h("li", { class: "mk-item" },
    h("a", { href: t.url, target: "_blank", rel: "noopener noreferrer nofollow" },
      t.icon ? h("img", { src: t.icon, alt: "", width: 22, height: 22, loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => { e.target.hidden = true; } }) : null,
      h("span", { class: "mk-sym dot" }, `$${t.symbol}`),
      h("span", { class: "mk-price dot" }, price(t.price)),
      t.change !== null ? h("span", { class: `mk-chg dot ${up ? "up" : "down"}` }, `${up ? "▲" : "▼"}${Math.abs(t.change).toFixed(1)}%`) : null,
      t.volume !== null ? h("span", { class: "mk-vol" }, `${copy.market.vol} $${compact(t.volume)}`) : null));
}

export function createMarket({ timers }) {
  const track = h("div", { class: "mk-track" });
  const status = h("p", { class: "mk-status" });
  const board = h("div", { class: "mk-board", "aria-label": copy.market.heading }, track);
  const el = h("section", { id: "market", class: "market", "aria-labelledby": "market-h" },
    h("div", { class: "mk-head" },
      h("h2", { id: "market-h" }, copy.market.heading),
      h("p", { class: "mk-note" }, copy.market.note)),
    board, status);

  async function load() {
    try {
      const list = await fetchMarket();
      clear(status);
      if (!list.length) throw new Error("empty");
      const still = reducedMotion();
      const rows = [h("ul", { class: "mk-row" }, list.map(item))];
      // the moving board shows the list twice so the loop is seamless; the copy is hidden from screen readers
      if (!still) rows.push(h("ul", { class: "mk-row", "aria-hidden": "true" }, list.map((t) => { const li = item(t); li.querySelector("a").tabIndex = -1; return li; })));
      clear(track).append(...rows);
      board.classList.toggle("still", still);
      track.style.setProperty("--dur", `${Math.max(40, list.length * 4)}s`);
    } catch {
      if (!track.childElementCount) status.textContent = copy.market.unavailable;
    }
  }
  load();
  timers.push(setInterval(load, 90_000));
  return el;
}
