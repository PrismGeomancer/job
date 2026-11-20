// Rule: an empty config value hides the button or field that uses it.
// Elements declare their dependency with data-requires="KEY" (or "KEY1 KEY2", all required).
export function isFilled(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "boolean") return value;
  return true;
}

export function applyVisibility(root, config) {
  const nodes = root.querySelectorAll("[data-requires]");
  for (const el of nodes) {
    const keys = el.getAttribute("data-requires").split(/\s+/).filter(Boolean);
    const show = keys.every((k) => isFilled(config[k]));
    el.hidden = !show;
  }
  return nodes.length;
}
