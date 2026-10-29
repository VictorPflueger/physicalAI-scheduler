// The sync monitor: every train in the window (the S-Bahn shuttles aside), first departure first,
// with the source version it runs on, the channels that still show an older version or a conversion
// fault, and what the agent's check found. A version behind is a fact of the data, not yet a
// finding: only the engine says whether it contradicts what passengers need, so the channels turn
// red only for the trains the agent checked. A row opens the train in the train view.

import { h } from "./dom.js";
import { icon } from "./icons.js";

export function createMonitor({ onRow }) {
  const head = h("div", { class: "mon-head", "aria-hidden": "true" },
    h("span", {}, "Train"), h("span", {}, "Runs"), h("span", {}, "Source"), h("span", {}, "Channels behind the source"), h("span", {}, "Agent's check"));
  const list = h("div", { class: "mon-list", role: "list", "aria-label": "Trains in the window" });
  const element = h("div", { class: "monitor" }, head, list);
  const buttons = new Map();
  element.addEventListener("scroll", () => markMore(), { passive: true });

  function markMore() {
    element.dataset.more = String(element.scrollTop + element.clientHeight < element.scrollHeight - 4);
  }

  /**
   * rows: mirror_data.monitorTrains(); ctx: { stateOf(id), resultOf(id) → { n, pax, wrong: Set(channel) } | null,
   * checking: Set(id), decisionOf(id) → { label, state } | null, focus }.
   */
  function render(rows, ctx) {
    const keep = new Set(rows.map((r) => r.id));
    for (const [id, b] of buttons) if (!keep.has(id)) { b.remove(); buttons.delete(id); }
    rows.forEach((r, i) => {
      let b = buttons.get(r.id);
      if (!b) {
        b = h("button", { class: "mon-row", type: "button", role: "listitem" });
        b.addEventListener("click", () => onRow?.(r.id));
        buttons.set(r.id, b);
      }
      const res = ctx.resultOf(r.id);
      const decision = ctx.decisionOf(r.id);
      const checking = ctx.checking.has(r.id);
      const state = ctx.stateOf(r.id);
      // The channels behind the source (or generated with a fault), summed up in one chip; after the
      // agent's check, the ones the engine found wrong in a red chip of their own.
      const lagging = r.channels.filter((c) => c.behind || c.faulty);
      const wrong = r.channels.filter((c) => res?.wrong.has(c.channel));
      const rest = lagging.filter((c) => !res?.wrong.has(c.channel));
      const describe = (list) => list.map((c) => `${c.label} v${c.version}${c.faulty ? " (conversion fault)" : ""}`).join(", ");
      // A Vici tag: plain for a channel behind the source (a fact), danger for one the check found wrong.
      const chip = (list, isWrong) => h("span", { class: ["vc-tag", isWrong ? "vc-tag--danger" : "", "mon-chip"], dataset: { wrong: String(isWrong) }, title: describe(list) },
        isWrong
          ? (list.length === 1 ? `${list[0].label} wrong` : `${list.length} channels wrong`)
          : list.every((c) => !c.behind)
            ? (list.length === 1 ? `${list[0].label}: conversion fault` : `${list.length} channels: conversion fault`)
            : (list.length === 1 ? `${list[0].label} v${list[0].version}${list[0].faulty ? "*" : ""}` : `${list.length} channels behind${list.some((c) => c.faulty) ? "*" : ""}`));
      const chips = [
        wrong.length ? chip(wrong, true) : null,
        rest.length ? chip(rest, false) : null,
        !lagging.length && !wrong.length ? h("span", { class: "mon-none" }, `all at v${r.source_version}`) : null
      ].filter(Boolean);
      let check;
      if (checking) check = h("span", { class: "mon-check", dataset: { tone: "checking" } }, "Checking…");
      else if (decision) check = h("span", { class: "mon-check", dataset: { tone: decision.state } }, icon(decision.state === "resolved" ? "check" : "alert", 16), decision.label);
      else if (res && res.n) check = h("span", { class: "mon-check", dataset: { tone: "affected" } }, `${res.n} contradiction${res.n === 1 ? "" : "s"} · ${res.pax} pax`);
      else if (res) check = h("span", { class: "mon-check", dataset: { tone: "sync" } }, icon("check", 16), "In sync with the source");
      else check = h("span", { class: "mon-check", dataset: { tone: "none" } }, "Not checked");
      b.replaceChildren(
        h("span", { class: "mon-train" }, h("strong", {}, r.number), h("span", {}, r.line && r.line !== r.number ? r.line : r.category)),
        h("span", { class: "mon-run" }, h("span", {}, r.run), h("span", { class: "mon-when" }, r.first_min >= 0 ? `first departure in ${r.first_min} min` : "running")),
        h("span", { class: "mon-src" }, h("strong", {}, `v${r.source_version}`), h("span", {}, r.source_version > 1 ? r.changes.join(", ") : r.created_by ? `created by ${r.created_by}` : "base timetable")),
        h("span", { class: "mon-chans" }, chips),
        check);
      b.dataset.state = state || "";
      if (!state) delete b.dataset.state;
      b.dataset.checking = String(checking);
      b.dataset.focus = String(r.id === ctx.focus);
      // The train in focus is the current one (its frame is ink: css/mirror.css).
      if (r.id === ctx.focus) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      b.setAttribute("aria-label", `${r.number}, ${r.run}; source version ${r.source_version}; ${lagging.length ? `behind: ${describe(lagging)}` : "all channels current"}${wrong.length ? `; wrong: ${describe(wrong)}` : ""}; ${check.textContent}`);
      if (list.children[i] !== b) list.insertBefore(b, list.children[i] || null);
    });
    markMore();
  }

  /** Scrolls a row into view inside the card (the train the agent works on). */
  function reveal(id) {
    const b = buttons.get(id);
    if (!b) return;
    const top = b.offsetTop - head.offsetHeight;
    if (top < element.scrollTop || b.offsetTop + b.offsetHeight > element.scrollTop + element.clientHeight) element.scrollTop = Math.max(0, top - 8);
  }

  return { element, render, reveal, rowButton: (id) => buttons.get(id) || null };
}
