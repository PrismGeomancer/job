// The time card: JOB's identity object. Every coin is a card with its one job ticked in red ink.
import { copy } from "../copy.js";
import { JOBS } from "../shared/jobs.js";
import { h, fill } from "../lib/dom.js";

export const pad = (n, w = 4) => String(n).padStart(w, "0");

// A small mark for each job, from the image prompts: an erased bar, payslip lines, rising blocks.
export function jobMark(job) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 48 24");
  svg.setAttribute("class", "jobmark");
  svg.setAttribute("aria-hidden", "true");
  const rect = (x, y, w, hh, cls) => {
    const r = document.createElementNS(ns, "rect");
    for (const [k, v] of Object.entries({ x, y, width: w, height: hh, rx: 1.5 })) r.setAttribute(k, v);
    if (cls) r.setAttribute("class", cls);
    svg.append(r);
  };
  if (job === "cleaner") { rect(2, 9, 26, 6); rect(31, 9, 6, 6, "faint"); rect(40, 9, 3, 6, "fainter"); }
  else if (job === "payroll") { rect(2, 3, 44, 4); rect(2, 10, 32, 4); rect(2, 17, 20, 4, "red"); }
  else { rect(2, 16, 8, 6); rect(13, 11, 8, 11); rect(24, 6, 8, 16); rect(35, 1, 8, 21, "red"); }
  return svg;
}

// The three job boxes printed on every card. As buttons they act as a radio group (hero, launch).
export function jobBoxes(active, { asButtons = false, onPick } = {}) {
  return h("div", { class: "tcard-jobs", role: asButtons ? "radiogroup" : null, "aria-label": copy.card.job },
    JOBS.map((j) => {
      const on = j === active;
      const content = [h("i", { class: "box", "aria-hidden": "true" }), copy.jobs[j].name];
      return asButtons
        ? h("button", { type: "button", role: "radio", class: `jobbox${on ? " on" : ""}`, "aria-checked": String(on), tabindex: on ? 0 : -1, dataset: { job: j }, onclick: () => onPick?.(j) }, ...content)
        : h("span", { class: `jobbox${on ? " on" : ""}` }, ...content);
    }));
}

// coin: public coin record. counter: { label, text }. no: the card's number.
export function timeCard(coin, counter, { no, large = false, href, stamp = true, stampText = copy.launch.stamp } = {}) {
  const body = [
    h("div", { class: "tcard-head" },
      h("span", { class: "tcard-hole", "aria-hidden": "true" }),
      h("span", { class: "tcard-co" }, copy.card.company),
      no ? h("span", { class: "tcard-no" }, fill(copy.card.no, { n: pad(no) })) : null),
    h("div", { class: "tcard-row" },
      h("span", { class: "tcard-label" }, copy.card.name),
      h("span", { class: "tcard-name" }, coin.name),
      coin.image ? h("img", { class: "tcard-img", src: coin.image, alt: "", loading: "lazy", width: 44, height: 44, onerror: (e) => { e.target.hidden = true; } }) : null),
    h("div", { class: "tcard-row" },
      h("span", { class: "tcard-label" }, copy.card.ticker),
      h("span", { class: "tcard-val mono" }, `$${coin.ticker}`)),
    jobBoxes(coin.job),
    h("div", { class: "tcard-total" },
      h("span", { class: "tcard-label" }, counter.label),
      h("span", { class: "dot tcard-amt" }, counter.text)),
    stamp ? h("span", { class: "ink-stamp", "aria-hidden": stampText === copy.launch.stamp ? "true" : null }, stampText) : null,
  ];
  const cls = `tcard tcard-${coin.job}${large ? " tcard-large" : ""}`;
  return href
    ? h("a", { class: cls, href, "aria-label": `${coin.name}, $${coin.ticker}, ${copy.jobs[coin.job].name}` }, ...body)
    : h("article", { class: cls }, ...body);
}
