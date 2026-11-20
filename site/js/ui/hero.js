// Hero: a blank time card and the punch clock. Typing writes a preview name on the card, the job
// boxes switch the printed activity strip, and Generate punches the card in the clock.
// The activity strip is an illustration with no numbers, so it can't be read as data.
import { copy } from "../copy.js";
import { JOBS } from "../shared/jobs.js";
import { h, fill, clear, reducedMotion } from "../lib/dom.js";
import { jobBoxes, pad } from "./card.js";
import { play } from "./sound.js";
import { dust } from "./fx.js";

const STEP_MS = { cleaner: 650, payroll: 420, builder: 380 };
const CYCLE_MS = 5200;

export function previewName(idea) {
  const words = idea.replace(/[^\p{L}\p{N} ]+/gu, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ").slice(0, 28);
  return name || copy.hero.previewName;
}
export function previewTicker(idea) {
  const first = idea.replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).find((w) => w.length > 2) ?? "";
  return first.toUpperCase().slice(0, 6) || "TICKER";
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const hhmmss = (d) => `${hhmm(d)}:${String(d.getSeconds()).padStart(2, "0")}`;

// The punch clock. mode "time" shows the wall clock; mode "countdown" shows time left in the round.
export function punchClock({ timers, label, countdownMs }) {
  const face = h("span", { class: "dot clock-face", role: "timer", "aria-live": "off" }, "--:--:--");
  const show = (text) => {
    // digits stay plain text; colons get their own span so they can blink
    face.replaceChildren(...text.split(":").flatMap((part, i) => (i ? [h("span", { class: "colon", "aria-hidden": "true" }, ":"), part] : [part])));
    face.setAttribute("aria-label", text);
  };
  const bar = h("i", { class: "clock-fill" });
  const update = () => {
    if (countdownMs) {
      const into = Date.now() % countdownMs;
      const left = Math.floor((countdownMs - into) / 1000);
      show(`${pad(Math.floor(left / 60), 2)}:${pad(left % 60, 2)}`);
      bar.style.transform = `scaleX(${(into / countdownMs).toFixed(4)})`;
    } else show(hhmmss(new Date()));
  };
  update();
  timers.push(setInterval(update, 1000));
  const el = h("div", { class: "clock-machine" },
    h("div", { class: "clock-slot", "aria-hidden": "true" }),
    h("div", { class: "clock-window" }, face),
    h("div", { class: "clock-foot" },
      h("span", { class: "clock-label" }, label),
      countdownMs ? h("span", { class: "clock-bar", "aria-hidden": "true" }, bar) : h("span", { class: "clock-led", "aria-hidden": "true" })));
  return { el, punch: () => { el.classList.remove("thunk"); void el.offsetWidth; el.classList.add("thunk"); } };
}

export function createHero({ timers, nextNo, onGo }) {
  let job = "cleaner";
  let auto = !reducedMotion();
  let loop = null;

  const nameEl = h("span", { class: "tcard-name" }, copy.hero.previewName);
  const tickerEl = h("span", { class: "tcard-val mono" }, "$TICKER");
  const stage = h("div", { class: "stage", "aria-hidden": "true" });
  const stageLabel = h("span", { class: "tcard-label" });
  const inMark = h("span", { class: "punch-in dot", "aria-hidden": "true" });
  const boxes = jobBoxes(job, { asButtons: true, onPick: (j) => { auto = false; setJob(j); } });
  const card = h("div", { class: "tcard tcard-hero" },
    h("div", { class: "tcard-head" },
      h("span", { class: "tcard-hole", "aria-hidden": "true" }),
      h("span", { class: "tcard-co" }, copy.hero.eyebrow),
      h("span", { class: "tcard-no" }, fill(copy.card.no, { n: pad(nextNo) }))),
    h("div", { class: "tcard-row" }, h("span", { class: "tcard-label" }, copy.card.name), nameEl),
    h("div", { class: "tcard-row" }, h("span", { class: "tcard-label" }, copy.card.ticker), tickerEl),
    boxes,
    h("div", { class: "tcard-activity" }, stageLabel, stage),
    h("div", { class: "tcard-total" }, h("span", { class: "tcard-label" }, copy.card.in), inMark));
  const clock = punchClock({ timers, label: copy.card.clock });

  const btns = [...boxes.querySelectorAll("button")];
  for (const b of btns) {
    b.onkeydown = (e) => {
      const i = JOBS.indexOf(job);
      const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? JOBS[(i + 1) % 3] : e.key === "ArrowLeft" || e.key === "ArrowUp" ? JOBS[(i + 2) % 3] : null;
      if (next) { e.preventDefault(); auto = false; setJob(next); btns[JOBS.indexOf(next)].focus(); }
    };
  }

  function setJob(j) {
    job = j;
    card.className = `tcard tcard-hero tcard-${j}`;
    for (const b of btns) {
      const on = b.dataset.job === j;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    stageLabel.textContent = copy.jobs[j].line;
    play(j);
  }

  function play(j) {
    if (loop) clearInterval(loop);
    clear(stage);
    stage.className = `stage stage-${j}`;
    const still = reducedMotion();
    if (j === "cleaner") {
      const blocks = Array.from({ length: 12 }, () => h("i", {}));
      stage.append(h("div", { class: "blocks" }, blocks));
      let gone = 0;
      const step = () => {
        if (gone >= blocks.length - 3) { for (const b of blocks) b.className = ""; gone = 0; return; }
        blocks[blocks.length - 1 - gone].className = "gone";
        gone += 1;
      };
      if (still) for (let i = 0; i < 5; i++) step();
      else loop = setInterval(step, STEP_MS.cleaner);
    } else if (j === "payroll") {
      const pot = h("i", { class: "pot-fill" });
      const shares = [40, 30, 20, 10];
      const wallets = shares.map(() => h("i", { class: "w-fill" }));
      stage.append(h("div", { class: "pot" }, pot), h("div", { class: "wallets" }, wallets.map((w) => h("div", { class: "wallet" }, w))));
      let t = 0;
      const step = () => {
        t = (t + 1) % 14;
        const filled = Math.min(t, 7) / 7;
        const drain = t > 7 ? (t - 7) / 6 : 0;
        pot.style.transform = `scaleX(${(filled * (1 - drain)).toFixed(3)})`;
        wallets.forEach((w, i) => (w.style.transform = `scaleY(${((shares[i] / 40) * drain).toFixed(3)})`));
      };
      if (still) { t = 13; step(); } else loop = setInterval(step, STEP_MS.payroll);
    } else {
      const cols = Array.from({ length: 7 }, (_, i) => h("i", { class: i === 6 ? "top" : "", style: `--h:${(i + 2) * 11}%` }));
      stage.append(h("div", { class: "cols" }, cols));
      let n = 0;
      const step = () => {
        n = (n + 1) % (cols.length + 4);
        cols.forEach((c, i) => c.classList.toggle("up", i < n));
      };
      if (still) cols.forEach((c) => c.classList.add("up"));
      else loop = setInterval(step, STEP_MS.builder);
    }
    timers.push(loop);
  }

  // The one orchestrated moment: the card drops into the clock, gets stamped, comes back, then go.
  function punch(then) {
    auto = false;
    if (reducedMotion()) { inMark.textContent = hhmm(new Date()); return then(); }
    card.classList.remove("punching");
    void card.offsetWidth;
    card.classList.add("punching");
    setTimeout(() => { clock.punch(); play("thunk"); inMark.textContent = hhmm(new Date()); inMark.classList.add("inked"); }, 380);
    setTimeout(then, 1250);
  }

  const input = h("input", { id: "hero-idea", type: "text", maxlength: 1000, placeholder: copy.launch.placeholder, autocomplete: "off" });
  input.oninput = () => {
    nameEl.textContent = previewName(input.value);
    tickerEl.textContent = `$${previewTicker(input.value)}`;
    auto = false;
  };
  const form = h("form", { class: "hero-form" },
    h("label", { for: "hero-idea" }, copy.hero.inputLabel),
    h("div", { class: "hero-input" }, input, h("button", { class: "btn", type: "submit" }, copy.hero.primary)));
  form.onsubmit = (e) => {
    e.preventDefault();
    punch(() => onGo(input.value.trim()));
  };

  // Drag the card down into the clock to punch it. Past the threshold it submits the form.
  const MAX = 96, GO = 62;
  let drag = null;
  card.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.target.closest("button, input, a") || card.classList.contains("punching")) return;
    drag = { y: e.clientY, dy: 0 };
    card.setPointerCapture(e.pointerId);
    card.classList.add("dragging");
  });
  card.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, Math.min(MAX, e.clientY - drag.y));
    card.style.setProperty("--dy", `${drag.dy}px`);
  });
  const release = () => {
    if (!drag) return;
    const go = drag.dy >= GO;
    card.classList.remove("dragging");
    if (!go) card.style.setProperty("--dy", "0px");
    drag = null;
    if (go) form.requestSubmit();
  };
  card.addEventListener("pointerup", release);
  card.addEventListener("pointercancel", release);
  card.addEventListener("animationend", (e) => {
    if (e.animationName !== "punchcard") return;
    card.classList.remove("punching");
    card.style.setProperty("--dy", "0px");
  });

  const rig = h("div", { class: "rig" }, h("div", { class: "rig-lamp", "aria-hidden": "true" }), card, clock.el);
  const machine = h("div", { class: "hero-machine", "data-depth": "" }, rig,
    h("p", { class: "hero-slot-hint" }, copy.fx.slotHint),
    h("p", { class: "hero-note" }, copy.hero.previewNote));
  dust(machine);

  setJob(job);
  if (auto) {
    timers.push(setInterval(() => {
      if (!auto || document.hidden) return;
      setJob(JOBS[(JOBS.indexOf(job) + 1) % 3]);
    }, CYCLE_MS));
  }

  return {
    form,
    machine,
  };
}
