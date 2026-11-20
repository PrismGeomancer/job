// "Punch in": a timing game on a machine panel. A needle sweeps the dial; stop it in the green.
// Three cards per shift, faster and tighter each time. Scores stay on this device.
import { copy } from "../copy.js";
import { h, fill, reducedMotion } from "../lib/dom.js";
import { getShift, onShift, recordPunch } from "./shift.js";
import { play } from "./sound.js";

const ROUNDS = 3;
const SPEEDS = [0.55, 0.8, 1.1];   // sweeps per second
const WIDTHS = [0.22, 0.15, 0.1];  // green zone as a fraction of the dial

export function createPunchGame() {
  const f = copy.fx.punch;
  let round = 0, running = false, pos = 0, dir = 1, zone = 0.4, scores = [], raf = 0, last = 0;

  const green = h("i", { class: "pg-zone" });
  const needle = h("i", { class: "pg-needle" });
  const dial = h("div", { class: "pg-dial", role: "img", "aria-label": f.zone }, green, needle);
  const holes = h("div", { class: "pg-holes", "aria-hidden": "true" }, Array.from({ length: ROUNDS }, () => h("i", {})));
  const status = h("p", { class: "pg-status dot", "aria-live": "polite" }, f.ready);
  const tape = h("ol", { class: "pg-tape" });
  const best = h("p", { class: "pg-best muted small" });
  const btn = h("button", { class: "btn pg-btn", type: "button" }, f.start);
  const machine = h("div", { class: "pg-machine" }, h("div", { class: "pg-window" }, dial), holes, status);
  const board = h("ol", { class: "pg-board" });
  const boardWrap = h("aside", { class: "stub pg-boardwrap", "aria-labelledby": "pg-board-h" }, h("h3", { id: "pg-board-h" }, f.board), board, h("p", { class: "stub-note" }, f.boardNote));

  function drawBoard() {
    const b = getShift().board;
    board.replaceChildren(...(b.length ? b.map((n, i) => h("li", {}, h("span", {}, `${i + 1}.`), h("span", { class: "dot" }, String(n)))) : [h("li", { class: "muted" }, f.boardEmpty)]));
    best.textContent = getShift().best ? fill(f.best, { n: getShift().best }) : "";
  }

  function setZone() {
    const w = WIDTHS[round];
    zone = 0.08 + Math.random() * (0.84 - w);
    green.style.left = `${zone * 100}%`;
    green.style.width = `${w * 100}%`;
  }
  function loop(now) {
    if (!running) return;
    if (!dial.isConnected) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const speed = SPEEDS[round] * (reducedMotion() ? 0.5 : 1);
    pos += dir * speed * dt * 2;
    if (pos >= 1) { pos = 1; dir = -1; } else if (pos <= 0) { pos = 0; dir = 1; }
    needle.style.left = `${pos * 100}%`;
    raf = requestAnimationFrame(loop);
  }
  function begin() {
    scores = []; round = 0;
    tape.replaceChildren();
    for (const i of holes.children) i.className = "";
    nextCard();
    btn.textContent = f.go;
  }
  function nextCard() {
    setZone();
    pos = 0; dir = 1; running = true; last = performance.now();
    status.textContent = fill(f.round, { n: round + 1 });
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  function punch() {
    running = false;
    cancelAnimationFrame(raf);
    const w = WIDTHS[round];
    const centre = zone + w / 2;
    const off = pos - centre;
    const inZone = Math.abs(off) <= w / 2;
    const score = Math.max(0, Math.round(100 - (Math.abs(off) / 0.5) * 140 - (inZone ? 0 : 12)));
    scores.push(score);
    const label = Math.abs(off) <= 0.012 ? f.dot : off < 0 ? f.early : f.late;
    holes.children[round].className = inZone ? "hit" : "miss";
    play(inZone ? "ding" : "miss");
    machine.classList.remove("thunk"); void machine.offsetWidth; machine.classList.add("thunk");
    tape.append(h("li", { class: "dot" }, `${round + 1}. ${label}  ${score}`));
    round += 1;
    if (round < ROUNDS) {
      status.textContent = `${label} ${score}`;
      setTimeout(nextCard, 650);
      btn.disabled = true;
      setTimeout(() => { btn.disabled = false; }, 650);
    } else finish();
  }
  function finish() {
    const total = scores.reduce((a, b) => a + b, 0);
    recordPunch(total, { shiftTotal: true });
    const avg = total / ROUNDS;
    status.textContent = `${fill(f.score, { n: total })} · ${f.verdicts[avg >= 85 ? 2 : avg >= 55 ? 1 : 0]}`;
    play("print");
    btn.textContent = f.again;
    drawBoard();
  }
  btn.onclick = () => { if (running) punch(); else begin(); };
  // Space and Enter work through the focused button. Space anywhere on the panel punches too.
  machine.tabIndex = -1;
  onShift(drawBoard);
  drawBoard();
  return h("div", { class: "pg" }, h("div", { class: "pg-main" }, machine, h("div", { class: "pg-controls" }, btn, best), tape), boardWrap);
}
