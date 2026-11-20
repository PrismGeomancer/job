// Tiny DOM builder. Text always goes through textContent, so coin names and descriptions
// (written by AI or by owners) can never inject markup.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Fill {placeholders} in a copy string.
export function fill(str, vars = {}) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// Copy text with *accent* markers -> nodes (the accent is the yellow italic).
export function rich(str, vars) {
  const parts = fill(str, vars).split(/(\*[^*]+\*)/g);
  return parts.filter(Boolean).map((p) => (p.startsWith("*") && p.endsWith("*") ? h("em", { class: "accent" }, p.slice(1, -1)) : p));
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
