// One small illustrated scene per job, drawn in the card's ink with a single red accent.
import { copy } from "../copy.js";

const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.append(...kids);
  return n;
}
const rect = (x, y, w, hh, extra = {}) => el("rect", { x, y, width: w, height: hh, rx: 1.5, fill: "currentColor", ...extra });

const SCENES = {
  cleaner: () => {
    const g = el("g");
    g.append(rect(0, 92, 300, 3, { opacity: 0.5 }));
    [34, 66, 98, 130].forEach((x, i) => g.append(rect(x, 66, 26, 26, { class: `sc-block sc-b${i}`, fill: i === 0 ? "var(--red)" : "currentColor" })));
    g.append(el("g", { class: "sc-broom" },
      el("line", { x1: 240, y1: 26, x2: 190, y2: 84, stroke: "currentColor", "stroke-width": 4, "stroke-linecap": "round" }),
      el("path", { d: "M176 84 L206 84 L212 96 L170 96 Z", fill: "currentColor" })));
    [0, 1, 2].forEach((i) => g.append(el("circle", { class: `sc-dust sc-d${i}`, cx: 178 - i * 10, cy: 88, r: 2.4, fill: "currentColor", opacity: 0.6 })));
    return g;
  },
  payroll: () => {
    const g = el("g");
    g.append(rect(0, 94, 300, 3, { opacity: 0.5 }));
    g.append(rect(40, 26, 118, 68, { fill: "none", stroke: "currentColor", "stroke-width": 3 }));
    [38, 50, 62].forEach((y, i) => g.append(rect(54, y, 90 - i * 22, 5)));
    g.append(rect(54, 76, 32, 5, { fill: "var(--red)" }));
    [0, 1, 2, 3].forEach((i) => g.append(el("ellipse", { cx: 224, cy: 88 - i * 9, rx: 22, ry: 6, fill: i === 3 ? "var(--red)" : "currentColor", stroke: "var(--manila)", "stroke-width": 1.5 })));
    g.append(el("g", { class: "sc-stamp" },
      rect(176, 22, 26, 8, { fill: "currentColor" }),
      el("line", { x1: 189, y1: 8, x2: 189, y2: 22, stroke: "currentColor", "stroke-width": 7, "stroke-linecap": "round" })));
    return g;
  },
  builder: () => {
    const g = el("g");
    g.append(rect(0, 94, 300, 3, { opacity: 0.5 }));
    [0, 1, 2, 3, 4].forEach((i) => g.append(rect(30 + i * 20, 94 - (i + 1) * 12, 16, (i + 1) * 12, { opacity: 0.9, fill: i === 4 ? "var(--red)" : "currentColor" })));
    g.append(rect(228, 14, 6, 80));
    g.append(el("g", { class: "sc-crane" },
      rect(150, 14, 120, 5),
      el("line", { x1: 168, y1: 19, x2: 168, y2: 54, stroke: "currentColor", "stroke-width": 2 }),
      rect(158, 54, 20, 14, { fill: "var(--red)" })));
    return g;
  },
};

export function jobScene(job) {
  const svg = el("svg", { viewBox: "0 0 300 100", class: `scene scene-${job}`, role: "img", "aria-label": copy.fx.scenes[job] });
  svg.append(SCENES[job]());
  return svg;
}
