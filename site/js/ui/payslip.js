// An interactive payslip: slide the trade size, pick a job, watch the fee split print out.
import { copy } from "../copy.js";
import { CONFIG } from "../config.js";
import { JOBS } from "../shared/jobs.js";
import { h } from "../lib/dom.js";
import { play } from "./sound.js";

const money = (n) => (n >= 1 ? n.toFixed(3) : n >= 0.001 ? n.toFixed(4) : n.toFixed(6));

export function createPayslip() {
  const f = copy.fx.slip;
  let size = 5, job = "payroll";
  const total = CONFIG.FEE_BPS / 10000;
  const protocol = total * (CONFIG.PROTOCOL_FEE_PERCENT / 100);
  const jobShare = total - protocol;

  const range = h("input", { id: "slip-size", type: "range", min: 0.1, max: 50, step: 0.1, value: size });
  const readout = h("output", { class: "dot slip-size", for: "slip-size" });
  const lines = h("ul", { class: "slip-lines" });
  const does = h("p", { class: "slip-does" });
  const picks = h("div", { class: "slip-picks", role: "radiogroup", "aria-label": f.job },
    JOBS.map((j) => h("button", { type: "button", role: "radio", class: "chip", dataset: { job: j } }, copy.jobs[j].name)));

  function draw(print = false) {
    readout.textContent = `${size.toFixed(1)} ${f.sizeUnit}`;
    for (const b of picks.children) { const on = b.dataset.job === job; b.setAttribute("aria-checked", String(on)); b.setAttribute("aria-pressed", String(on)); }
    const rows = [
      [f.feeTotal, size * total, false],
      [f.toJob, size * jobShare, true],
      [f.toCreator, 0, false],
      [f.toJob2, 0, false],
      [f.toProtocol, size * protocol, false],
    ];
    lines.replaceChildren(...rows.map(([label, v, hot], i) => {
      const li = h("li", { class: hot ? "hot" : "", style: `--i:${i}` }, h("span", {}, label), h("span", { class: "dot" }, `${money(v)} ${f.sizeUnit}`));
      return li;
    }));
    does.textContent = f.does[job];
    lines.classList.remove("print");
    if (print) { void lines.offsetWidth; lines.classList.add("print"); }
  }
  range.oninput = () => { size = Number(range.value); draw(false); };
  range.onchange = () => { draw(true); play("print"); };
  picks.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; job = b.dataset.job; draw(true); play("print"); };

  draw(true);
  return h("div", { class: "slip" },
    h("div", { class: "slip-ctl" }, h("label", { for: "slip-size", class: "slip-label" }, f.size), range, readout, picks),
    h("div", { class: "slip-paper" }, lines, does, h("p", { class: "stub-note" }, f.note)));
}
