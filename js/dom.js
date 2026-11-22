// Two small DOM helpers for the presenter's modules. h() builds an element, with every text set
// through text nodes, never as markup; icon() is one of Vici's icons, hidden from screen readers.

/**
 * h("p", { class, dataset: {}, on: { click }, any attribute }, ...children). Children may be strings,
 * nodes, arrays, or null and false, which are skipped.
 */
export function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : String(kid));
  return n;
}

/** One of Vici's icons by name (vici/dist/vici.min.css paints it in the text colour). */
export const icon = (name) => h("span", { class: `vc-icon vc-icon--${name}`, "aria-hidden": "true" });
