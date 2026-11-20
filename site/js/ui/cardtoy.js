// "Your time card": a card you can tilt with the pointer, flip, print a name on, re-stock and download.
import { copy } from "../copy.js";
import { JOBS } from "../shared/jobs.js";
import { h, reducedMotion } from "../lib/dom.js";
import { jobBoxes, pad } from "./card.js";
import { getShift, setName } from "./shift.js";
import { play } from "./sound.js";

const STOCKS = {
  manila: { bg: "#e4d3a6", ink: "#2a2112", red: "#c3352a" },
  hivis: { bg: "#d9f03a", ink: "#1a2005", red: "#b3261e" },
  blueprint: { bg: "#1e4f8e", ink: "#e9f2ff", red: "#ff8272" },
  night: { bg: "#1c1c21", ink: "#e8d96a", red: "#ff6b5e" },
};
const STOCK_KEY = "job.stock";
const loadStock = () => { try { const v = localStorage.getItem(STOCK_KEY); return STOCKS[v] ? v : "manila"; } catch { return "manila"; } };

// The week on the back of the card is made from the name, so the same name always gets the same week.
function week(name) {
  let seed = 0;
  for (const ch of name || "x") seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  return copy.fx.card.days.map(() => {
    const inH = 8 + Math.floor(rnd() * 2), inM = Math.floor(rnd() * 55);
    const out = 16 + Math.floor(rnd() * 3), outM = Math.floor(rnd() * 55);
    const mins = (out * 60 + outM) - (inH * 60 + inM);
    return { inT: `${pad(inH, 2)}:${pad(inM, 2)}`, outT: `${pad(out, 2)}:${pad(outM, 2)}`, mins };
  });
}

function cardPng({ name, job, stock }) {
  const S = STOCKS[stock];
  const W = 1200, H = 675;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
  const cw = 560, ch = 560, cx = (W - cw) / 2, cy = (H - ch) / 2;
  x.save(); x.translate(W / 2, H / 2); x.rotate(-0.025); x.translate(-W / 2, -H / 2);
  x.fillStyle = S.bg; x.beginPath(); x.roundRect(cx, cy, cw, ch, 8); x.fill();
  x.fillStyle = "#000"; x.beginPath(); x.roundRect(W / 2 - 40, cy + 20, 80, 14, 7); x.fill();
  x.fillStyle = S.ink;
  x.font = '900 34px "Big Shoulders Display", Impact, sans-serif'; x.fillText("JOB", cx + 40, cy + 92);
  x.font = '800 22px Doto, monospace'; x.textAlign = "right"; x.fillText(`No. ${pad(getShift().punches + 1)}`, cx + cw - 40, cy + 90); x.textAlign = "left";
  x.fillRect(cx + 40, cy + 106, cw - 80, 3);
  x.globalAlpha = 0.6; x.font = '500 20px Archivo, sans-serif'; x.fillText(copy.card.name, cx + 40, cy + 160); x.globalAlpha = 1;
  let size = 64;
  const nm = (name || copy.fx.card.namePlaceholder).toUpperCase();
  do { x.font = `900 ${size}px "Big Shoulders Display", Impact, sans-serif`; size -= 2; } while (x.measureText(nm).width > cw - 80 && size > 22);
  x.fillText(nm, cx + 40, cy + 225);
  x.globalAlpha = 0.28; x.fillRect(cx + 40, cy + 248, cw - 80, 2); x.globalAlpha = 1;
  JOBS.forEach((j, i) => {
    const bx = cx + 40 + i * 168, by = cy + 310;
    x.strokeStyle = S.ink; x.lineWidth = 4; x.strokeRect(bx, by - 24, 28, 28);
    x.font = `${j === job ? 700 : 500} 26px Archivo, sans-serif`; x.fillStyle = S.ink; x.fillText(copy.jobs[j].name, bx + 40, by);
    if (j === job) { x.strokeStyle = S.red; x.lineWidth = 8; x.lineCap = "round"; x.beginPath(); x.moveTo(bx + 4, by - 8); x.lineTo(bx + 13, by + 4); x.lineTo(bx + 34, by - 38); x.stroke(); }
  });
  x.save(); x.translate(cx + cw - 170, cy + ch - 90); x.rotate(-0.17);
  x.strokeStyle = S.red; x.fillStyle = S.red; x.lineWidth = 6; x.beginPath(); x.roundRect(-120, -42, 240, 78, 6); x.stroke();
  x.font = '900 52px "Big Shoulders Display", Impact, sans-serif'; x.textAlign = "center"; x.fillText(copy.launch.stamp, 0, 16);
  x.restore(); x.restore();
  return new Promise((r) => c.toBlob(r, "image/png"));
}

export function createCardToy() {
  const shift = getShift();
  let name = shift.name, job = "cleaner", stock = loadStock(), flipped = false;

  const nameOut = h("span", { class: "tcard-name" });
  const front = h("div", { class: "face face-front tcard" },
    h("div", { class: "tcard-head" }, h("span", { class: "tcard-hole", "aria-hidden": "true" }), h("span", { class: "tcard-co" }, copy.card.company), h("span", { class: "tcard-no" }, `No. ${pad(shift.punches + 1)}`)),
    h("div", { class: "tcard-row" }, h("span", { class: "tcard-label" }, copy.card.name), nameOut),
    h("div", { class: "toy-jobs" }),
    h("p", { class: "toy-line" }),
    h("span", { class: "ink-stamp", "aria-hidden": "true" }, copy.launch.stamp));
  const jobsHost = front.querySelector(".toy-jobs");
  const line = front.querySelector(".toy-line");
  const back = h("div", { class: "face face-back tcard", "aria-hidden": "true" });
  const flipper = h("div", { class: "flipper" }, front, back);
  const shine = h("span", { class: "toy-shine", "aria-hidden": "true" });
  const card = h("div", { class: "toy-card", role: "button", tabindex: "0", "aria-pressed": "false", "aria-label": copy.fx.card.flip }, flipper, shine);

  function drawJobs() {
    jobsHost.replaceChildren(jobBoxes(job, { asButtons: true, onPick: (j) => { job = j; drawJobs(); refreshDl(); } }));
    line.textContent = copy.jobs[job].line;
  }
  function drawBack() {
    const w = week(name);
    const total = w.reduce((a, d) => a + d.mins, 0);
    back.replaceChildren(
      h("div", { class: "tcard-head" }, h("span", { class: "tcard-hole", "aria-hidden": "true" }), h("span", { class: "tcard-co" }, copy.fx.card.hours)),
      h("table", { class: "toy-week" }, h("tbody", {}, copy.fx.card.days.map((d, i) =>
        h("tr", {}, h("th", { scope: "row" }, d), h("td", { class: "dot" }, w[i].inT), h("td", { class: "dot" }, w[i].outT))))),
      h("div", { class: "tcard-total" }, h("span", { class: "tcard-label" }, copy.fx.card.total), h("span", { class: "dot tcard-amt" }, `${Math.floor(total / 60)}h ${pad(total % 60, 2)}m`)),
      h("p", { class: "toy-sign" }, h("span", { class: "tcard-label" }, copy.fx.card.approved), h("i", { class: "scrawl" }, "J. Boss")));
  }
  function paint() {
    nameOut.textContent = name || copy.fx.card.namePlaceholder;
    nameOut.classList.toggle("ghost", !name);
    drawBack();
    refreshDl();
  }
  function applyStock() {
    const S = STOCKS[stock];
    card.style.setProperty("--manila", S.bg);
    card.style.setProperty("--ink", S.ink);
    card.style.setProperty("--ink-soft", `color-mix(in srgb, ${S.ink} 66%, transparent)`);
    card.style.setProperty("--ink-line", `color-mix(in srgb, ${S.ink} 26%, transparent)`);
    card.style.setProperty("--red", S.red);
    try { localStorage.setItem(STOCK_KEY, stock); } catch {}
  }
  function flip() {
    flipped = !flipped;
    card.classList.toggle("flipped", flipped);
    card.setAttribute("aria-pressed", String(flipped));
    back.setAttribute("aria-hidden", String(!flipped));
    front.setAttribute("aria-hidden", String(flipped));
    play("thunk");
  }

  // pointer tilt with a moving highlight
  const stage = h("div", { class: "toy-stage" }, card);
  stage.addEventListener("pointermove", (e) => {
    if (reducedMotion() || e.pointerType === "touch") return;
    const r = stage.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
    stage.style.setProperty("--ry", `${((nx - 0.5) * 26).toFixed(2)}deg`);
    stage.style.setProperty("--rx", `${((0.5 - ny) * 20).toFixed(2)}deg`);
    stage.style.setProperty("--sx", `${(nx * 100).toFixed(1)}%`);
    stage.style.setProperty("--sy", `${(ny * 100).toFixed(1)}%`);
  });
  stage.addEventListener("pointerleave", () => { for (const k of ["--ry", "--rx"]) stage.style.setProperty(k, "0deg"); });
  card.onclick = (e) => { if (!e.target.closest("button")) flip(); };
  card.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === card) { e.preventDefault(); flip(); } };

  // controls
  const input = h("input", { id: "toy-name", type: "text", maxlength: 28, value: name, placeholder: copy.fx.card.namePlaceholder, autocomplete: "off" });
  input.oninput = () => { name = input.value; paint(); play("key"); };
  input.onchange = () => setName(name);
  const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": copy.fx.card.stockLabel },
    Object.keys(STOCKS).map((k) => h("button", { type: "button", role: "radio", class: "swatch", style: `--sw:${STOCKS[k].bg};--swi:${STOCKS[k].ink}`, dataset: { stock: k }, title: copy.fx.card.stocks[k], "aria-label": copy.fx.card.stocks[k] })));
  const markSwatches = () => { for (const b of swatches.children) { const on = b.dataset.stock === stock; b.setAttribute("aria-checked", String(on)); b.classList.toggle("on", on); } };
  swatches.onclick = (e) => { const b = e.target.closest(".swatch"); if (!b) return; stock = b.dataset.stock; applyStock(); markSwatches(); refreshDl(); };
  // The PNG is redrawn a moment after each change, so the link downloads natively on the first press.
  const dl = h("a", { class: "btn btn-ghost", download: copy.fx.card.file, "aria-disabled": "true" }, copy.fx.card.download);
  let dlTimer = 0, dlUrl = "";
  const refreshDl = () => {
    clearTimeout(dlTimer);
    dlTimer = setTimeout(async () => {
      await document.fonts?.ready;
      const blob = await cardPng({ name, job, stock });
      if (!blob) return;
      if (dlUrl) URL.revokeObjectURL(dlUrl);
      dlUrl = URL.createObjectURL(blob);
      dl.href = dlUrl;
      dl.removeAttribute("aria-disabled");
    }, 160);
  };
  const flipBtn = h("button", { class: "btn", type: "button" }, copy.fx.card.flip);
  flipBtn.onclick = flip;

  drawJobs(); paint(); applyStock(); markSwatches();
  return h("div", { class: "toy" }, stage,
    h("div", { class: "toy-controls" },
      h("label", { for: "toy-name", class: "toy-label" }, copy.fx.card.nameLabel), h("div", { class: "toy-input" }, input),
      h("p", { class: "toy-label" }, copy.fx.card.stockLabel), swatches,
      h("div", { class: "actions" }, flipBtn, dl)));
}
