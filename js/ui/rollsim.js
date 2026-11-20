// Roll-call simulator. Uses the engine's own split code (shared/rollcall-core.js) and the same
// slot formula, with a random blockhash made in the browser. Starts on the copy deck's example.
import { copy } from "../copy.js";
import { h, fill, clear, reducedMotion } from "../lib/dom.js";
import { balancesAt, eligibleHolders, splitPot, deriveChosenSlotAsync } from "../shared/rollcall-core.js";
import { sol } from "../lib/format.js";

const MINUTES = 60;
const LAMPORTS = 1_000_000_000;
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function randomBlockhash() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let n = BigInt("0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""));
  let out = "";
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  return out;
}

export function createRollSim() {
  const s = copy.rollCall.sim;
  const wallets = [
    { id: "A", holds: 40, sells: null },
    { id: "B", holds: 30, sells: null },
    { id: "C", holds: 20, sells: null },
    { id: "D", holds: 10, sells: null },
  ];
  let pot = 1.0;
  let runs = 0;
  let busy = false;

  // timeline
  const marker = h("span", { class: "rs-marker", "aria-hidden": "true" });
  const sellMarks = h("div", { class: "rs-sells", "aria-hidden": "true" });
  const track = h("div", { class: "rs-track" }, h("div", { class: "rs-ticks" }, Array.from({ length: MINUTES }, (_, i) => h("i", { class: i % 15 === 0 ? "major" : "" }))), sellMarks, marker);
  const status = h("p", { class: "mono small rs-status", "aria-live": "polite" });

  const rows = wallets.map((w, i) => {
    const out = h("output", { class: "mono" }, `${w.holds}%`);
    const result = h("span", { class: "rs-result mono" }, "");
    const bar = h("i", { class: "rs-bar" });
    const range = h("input", { type: "range", min: 0, max: 100, step: 5, value: w.holds, "aria-label": `${fill(s.wallet, { n: w.id })} ${s.holds}` });
    range.oninput = () => { w.holds = Number(range.value); out.textContent = `${w.holds}%`; reset(); };
    const sel = h("select", { "aria-label": `${fill(s.wallet, { n: w.id })} ${s.sells}` },
      h("option", { value: "" }, s.never),
      [15, 30, 45].map((m) => h("option", { value: m }, fill(s.minute, { m }))));
    sel.onchange = () => { w.sells = sel.value === "" ? null : Number(sel.value); drawSells(); reset(); };
    w.ui = { result, bar, row: null };
    const row = h("div", { class: "rs-row", dataset: { w: w.id } },
      h("span", { class: "rs-name" }, fill(s.wallet, { n: w.id })),
      h("label", { class: "rs-holds" }, h("span", { class: "muted small" }, s.holds), range, out),
      h("label", { class: "rs-sell" }, h("span", { class: "muted small" }, s.sells), sel),
      h("div", { class: "rs-pay" }, h("div", { class: "rs-barwrap" }, bar), result));
    w.ui.row = row;
    void i;
    return row;
  });

  const potOut = h("output", { class: "mono" }, `${pot.toFixed(1)} SOL`);
  const potRange = h("input", { type: "range", min: 0.1, max: 5, step: 0.1, value: pot, "aria-label": s.pot });
  potRange.oninput = () => { pot = Number(potRange.value); potOut.textContent = `${pot.toFixed(1)} SOL`; reset(); };
  const runBtn = h("button", { class: "btn", type: "button" }, s.run);

  function drawSells() {
    clear(sellMarks);
    for (const w of wallets) if (w.sells !== null) sellMarks.append(h("span", { style: `left:${(w.sells / (MINUTES - 1)) * 100}%` }, w.id));
  }
  function placeMarker(minute) {
    marker.style.left = `${(minute / (MINUTES - 1)) * 100}%`;
  }
  function reset() {
    if (busy) return;
    for (const w of wallets) {
      w.ui.result.textContent = "";
      w.ui.bar.style.transform = "scaleX(0)";
      w.ui.row.classList.remove("on", "off");
    }
    marker.classList.remove("landed");
    clear(status);
    runBtn.textContent = s.run;
  }

  function sweep(target) {
    return new Promise((resolve) => {
      if (reducedMotion()) { placeMarker(target); return resolve(); }
      const total = MINUTES * 2 + target; // two passes, then land
      const ms = 1700;
      const t0 = performance.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        placeMarker(target);
        resolve();
      };
      const frame = (t) => {
        if (done) return;
        const k = Math.min(1, (t - t0) / ms);
        const eased = 1 - Math.pow(1 - k, 3);
        placeMarker(Math.floor(eased * total) % MINUTES);
        if (k < 1) requestAnimationFrame(frame);
        else finish();
      };
      requestAnimationFrame(frame);
      // Browsers pause animation frames for hidden tabs and off-screen frames; never leave a run hanging.
      setTimeout(finish, ms + 250);
    });
  }

  async function run() {
    if (busy) return;
    reset();
    busy = true;
    runBtn.disabled = true;
    const blockhash = randomBlockhash();
    const chosen = await deriveChosenSlotAsync({ blockhash, mint: "SIMULATOR", roundId: runs++, startSlot: 0, endSlot: MINUTES - 1 });
    await sweep(chosen);
    marker.classList.add("landed");

    // the engine's math: balances at the chosen minute, eligibility, pro-rata split
    const points = [];
    for (const w of wallets) {
      points.push({ slot: -1, account: w.id, owner: w.id, amount: String(w.holds * 1_000_000) });
      if (w.sells !== null) points.push({ slot: w.sells, account: w.id, owner: w.id, amount: "0" });
    }
    const { balances, supply } = balancesAt(points, chosen);
    const holders = eligibleHolders(balances, supply, { minHoldBps: 1 });
    const { payouts } = splitPot(BigInt(Math.round(pot * LAMPORTS)), holders);
    const paid = new Map(payouts.map((p) => [p.wallet, p.lamports]));
    const max = payouts.reduce((m, p) => (p.lamports > m ? p.lamports : m), 1n);

    wallets.forEach((w, i) => {
      const lamports = paid.get(w.id);
      w.ui.row.style.setProperty("--d", reducedMotion() ? "0ms" : `${i * 140}ms`); // stagger via CSS
      if (lamports) {
        w.ui.row.classList.add("on");
        w.ui.result.textContent = fill(s.paid, { sol: sol(lamports, 3) });
        w.ui.bar.style.transform = `scaleX(${Number(lamports) / Number(max)})`;
      } else {
        w.ui.row.classList.add("off");
        w.ui.result.textContent = w.holds > 0 && w.sells !== null && w.sells <= chosen ? s.off : "—";
      }
    });
    status.append(fill(s.at, { m: chosen }), " · ", fill(s.hash, { hash: `${blockhash.slice(0, 6)}…${blockhash.slice(-4)}` }), payouts.length ? "" : ` · ${s.none}`);
    runBtn.textContent = s.again;
    runBtn.disabled = false;
    busy = false;
  }
  runBtn.onclick = run;
  placeMarker(0);

  return h("div", { class: "rollsim" },
    h("div", { class: "rs-head" },
      h("h3", {}, s.heading),
      h("p", { class: "muted small" }, copy.rollCall.exampleLabel, ": ", copy.rollCall.example)),
    h("div", { class: "rs-timeline" }, h("span", { class: "muted small" }, s.timeline), track, h("div", { class: "rs-scale mono small muted" }, ["0", "15", "30", "45", "60"].map((m) => h("span", {}, m)))),
    h("div", { class: "rs-rows" }, rows),
    h("div", { class: "rs-foot" },
      h("label", { class: "rs-potlabel" }, h("span", { class: "muted small" }, s.pot), potRange, potOut),
      runBtn),
    status,
    h("p", { class: "muted small" }, s.note));
}
