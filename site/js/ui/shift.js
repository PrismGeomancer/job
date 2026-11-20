// "My shift": a tiny local profile. Name, punch-ins, day streak and best punch live on this device only.
import { copy } from "../copy.js";
import { h, clear } from "../lib/dom.js";

const KEY = "job.shift";
const FRESH = { name: "", punches: 0, streak: 0, lastDay: "", best: 0, board: [] };

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && typeof v === "object") return { ...FRESH, ...v, board: Array.isArray(v.board) ? v.board.slice(0, 5) : [] };
  } catch {}
  return { ...FRESH };
}
let shift = load();
const listeners = new Set();
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(shift)); } catch {}
  for (const fn of listeners) fn(shift);
};

export const getShift = () => shift;
export const onShift = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function setName(name) { shift = { ...shift, name: String(name).slice(0, 28) }; save(); }
export function resetShift() { shift = { ...FRESH }; save(); }

const dayNo = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);

// A finished punch. score is 0..100 for one punch, or the 0..300 total of a shift.
export function recordPunch(score, { shiftTotal = false } = {}) {
  const today = dayNo();
  const last = shift.lastDay === "" ? null : Number(shift.lastDay);
  let streak = shift.streak;
  if (last === null || today - last > 1) streak = 1;
  else if (today - last === 1) streak += 1;
  else streak = Math.max(1, streak);
  const board = shiftTotal ? [...shift.board, score].sort((a, b) => b - a).slice(0, 5) : shift.board;
  shift = { ...shift, punches: shift.punches + 1, streak, lastDay: String(today), best: Math.max(shift.best, score), board };
  save();
}

export const bragText = () => copy.fx.shift.bragText.replace("{n}", shift.punches).replace("{s}", Math.max(1, shift.streak));

// Header button plus a small stub that opens under it.
export function createShiftBadge({ copyText, toast }) {
  const f = copy.fx.shift;
  const btn = h("button", { class: "chip shift-btn", type: "button", "aria-expanded": "false", "aria-controls": "shift-panel" });
  const panel = h("div", { class: "shift-panel", id: "shift-panel", role: "dialog", "aria-label": f.title, hidden: true });
  const wrap = h("div", { class: "shift-wrap" }, btn, panel);
  let quitting = false;

  const stat = (label, value) => h("div", { class: "shift-stat" }, h("dt", {}, label), h("dd", { class: "dot" }, value));
  function draw() {
    btn.replaceChildren(f.button, " ", h("span", { class: "dot shift-n" }, String(shift.punches)));
    clear(panel);
    const name = h("input", { type: "text", maxlength: 28, value: shift.name, placeholder: copy.fx.card.namePlaceholder, "aria-label": f.name, autocomplete: "off" });
    name.oninput = () => { shift = { ...shift, name: name.value.slice(0, 28) }; try { localStorage.setItem(KEY, JSON.stringify(shift)); } catch {} };
    name.onchange = () => setName(name.value);
    const quit = h("button", { class: "chip", type: "button" }, quitting ? f.quitSure : f.quit);
    quit.onclick = () => {
      if (!quitting) { quitting = true; quit.textContent = f.quitSure; return; }
      quitting = false;
      resetShift();
      toast(f.quitDone);
    };
    panel.append(
      h("div", { class: "shift-head" }, h("strong", {}, f.title), h("button", { class: "shift-x", type: "button", "aria-label": f.close, onclick: () => close() }, "×")),
      h("label", { class: "shift-label" }, f.name, name),
      h("dl", { class: "shift-stats" }, stat(f.punches, String(shift.punches)), stat(f.streak, String(shift.streak)), stat(f.best, shift.best ? String(shift.best) : "-")),
      shift.punches ? null : h("p", { class: "muted small" }, f.empty),
      h("div", { class: "shift-actions" },
        h("button", { class: "chip", type: "button", onclick: () => copyText(bragText(), f.copied) }, f.brag),
        h("a", { class: "chip", target: "_blank", rel: "noopener noreferrer", href: `https://x.com/intent/post?text=${encodeURIComponent(bragText())}` }, f.post),
        quit));
  }
  function open() { draw(); panel.hidden = false; btn.setAttribute("aria-expanded", "true"); }
  function close() { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); quitting = false; }
  btn.onclick = () => (panel.hidden ? open() : close());
  document.addEventListener("pointerdown", (e) => { if (!panel.hidden && !wrap.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { close(); btn.focus(); } });
  onShift(() => { if (panel.hidden) draw(); else { const keep = panel.querySelector("input"); if (document.activeElement !== keep) draw(); } });
  draw();
  return wrap;
}
