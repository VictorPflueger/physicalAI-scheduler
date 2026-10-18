// Options tab: three costed options plus the do-nothing baseline, a comparison, and the approval
// gate. Card state follows option_decision events, so live and simulated runs behave alike. Fewer
// passengers still misinformed is better; the cards also say when every channel is back in sync with
// the source, how many values would be kept by hand (a second truth the source does not know) and the
// staff effort. When the right information reaches passengers is nearly the same for every option, so
// the comparison says it once, next to the bars.

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { int } from "./format.js";
import { renderInline } from "./md.js";
import { aiLabel } from "./ai_label.js";

const plus = (x) => (x === null || x === undefined ? "—" : `+${Math.round(Number(x) * 10) / 10} min`);

/** When the right information reaches passengers, per option, in one clause: "after +2 min with every option". */
export function rightInfoClause(options) {
  const groups = new Map();
  for (const o of options) {
    const k = plus(o.correct_info_from_min);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o.letter);
  }
  if (!options.length) return "";
  if (groups.size === 1) return `the right information reaches them ${[...groups.keys()][0] === "—" ? "with no option" : `after ${[...groups.keys()][0]} with every option`}`;
  return `the right information reaches them after ${[...groups].map(([k, letters]) => `${k} (${letters.join(", ")})`).join(" or ")}`;
}
const after = (x, H) => (x === null || x === undefined ? `not within ${H} min` : `after ${Math.round(Number(x) * 10) / 10} min`);

export function createOptionsPanel(panel, { onDecision, onCount } = {}) {
  let current = null;           // last options payload
  const status = new Map();     // option id -> "approved" | "rejected" | "not_selected"
  let locked = false;           // true once an option has been approved
  let ended = false;            // the run ended (abort, error) before any option was approved
  let refocus = false;          // a keyboard or pointer decision was made in the panel: keep focus in it

  function empty() {
    clear(panel);
    panel.appendChild(h("div", { class: "empty" },
      h("strong", {}, "No options yet"),
      h("span", {}, "Once the agent has checked the trains against the source, its three costed responses and the do-nothing baseline appear here for your decision.")));
  }

  function render() {
    clear(panel);
    if (!current) return empty();
    const { baseline, options = [], horizon_min: H = 180 } = current;
    const pending = !locked && !ended && options.some((o) => !status.has(o.id));
    const max = Math.max(1, baseline?.misinformed_pax || 0, ...options.map((o) => o.misinformed_pax || 0));

    // Summary column: what to decide and how the options compare. Cards carry the detail.
    const rows = [
      ...options.map((o) => ({ key: o.letter, name: `Option ${o.letter}: ${o.title}`, res: o.misinformed_pax || 0, recommended: !!o.recommended })),
      { key: "–", name: "Do nothing", base: baseline?.misinformed_pax || 0, res: baseline?.misinformed_pax || 0 }
    ];
    const summary = h("div", { class: "options-summary" },
      h("div", { class: "options-summary-head" },
        h("h3", {}, pending ? "Decide how to respond" : locked ? "Decision taken" : ended ? "Run ended before a decision" : "Options"),
        aiLabel("options")),
      h("p", {}, `Passengers who would still act on wrong information within ${H} minutes, per option; ${rightInfoClause(options)}. All figures come from the deterministic sync engine.`),
      h("div", { class: "compare", role: "img", "aria-label": `Passengers still misinformed per option compared with doing nothing: ${rows.map((r) => `${r.name} ${int(r.res)}`).join("; ")}` },
        rows.map((r) => h("div", { class: "compare-row", dataset: { recommended: String(!!r.recommended) }, title: r.name },
          h("span", { class: "compare-key", "aria-hidden": "true" }, r.key),
          h("span", { class: "compare-track" },
            r.base !== undefined
              ? h("span", { class: "compare-bar baseline", style: { width: `${(r.base / max) * 100}%` } })
              : h("span", { class: "compare-bar residual", style: { left: "0%", width: `${(r.res / max) * 100}%` } })),
          h("span", { class: "compare-value num" }, int(r.res))))),
      h("div", { class: "compare-legend" },
        h("span", { class: "k-res" }, "Still misinformed"),
        h("span", { class: "k-base" }, "Do nothing")));

    const grid = h("div", { class: "options-grid" });
    for (const o of options) grid.appendChild(optionCard(o, H));
    grid.appendChild(baselineCard(baseline, H));
    panel.appendChild(h("div", { class: "options-layout" }, summary, grid));
    if (refocus) {
      // The cards were rebuilt: put focus on the next decision, or on the decided card's status.
      refocus = false;
      const next = panel.querySelector(".option-actions .btn");
      const target = next || panel.querySelector(".option-status")?.closest(".option-card");
      if (target) {
        if (!next) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: false });
      }
    }
  }

  function optionCard(o, H) {
    const st = status.get(o.id) || (locked ? "not_selected" : ended ? "expired" : "");
    const card = h("article", { class: "option-card", dataset: { recommended: String(!!o.recommended), status: st, kind: "option" }, "aria-label": `Option ${o.letter}: ${o.title}` },
      h("div", { class: "option-top" },
        h("span", { class: "option-letter", "aria-hidden": "true" }, o.letter),
        h("h4", { class: "option-title" }, o.title),
        o.recommended ? h("span", { class: "chip", dataset: { tone: "recommended" } }, "Recommended") : null),
      o.description ? renderInline(o.description, h("p", { class: "option-desc" })) : null,
      h("dl", { class: "option-figures" },
        h("dt", {}, "Still misinformed"), h("dd", { title: `The right information reaches passengers after ${plus(o.correct_info_from_min)}` }, int(o.misinformed_pax)),
        h("dt", {}, "Back in sync"), h("dd", { title: "When every channel shows what the source says" }, after(o.time_to_sync_min, H)),
        h("dt", {}, "Hand-kept values"), h("dd", { title: "Manual overrides: values kept by hand on displays or announcements, a second truth the source does not know" }, o.manual_overrides ? `${int(o.manual_overrides)} (second truth)` : "none"),
        h("dt", {}, "Staff effort"), h("dd", {}, `${int(o.effort_min)} min`),
        ...(o.hold ? [h("dt", {}, "Connection held"), h("dd", { title: `${o.hold.train} waits ${int(o.hold.wait_min)} min if dispatch agrees: ${int(o.held_pax)} passengers keep the connection, ${int(o.hold.delayed_pax)} on ${o.hold.train} are delayed. ${o.hold.note || ""}`.trim() }, `${int(o.held_pax)} keep it, ${o.hold.train} +${int(o.hold.wait_min)} min`)] : [])),
      h("div", { class: "option-total" }, h("span", { class: "label" }, "Protected passengers"), h("span", { class: "value num" }, int(o.protected_pax))),
      o.residual_risk ? h("p", { class: "option-risk" }, h("strong", {}, "Residual risk: "), o.residual_risk) : null,
      actionsFor(o, st));
    return card;
  }

  function baselineCard(b, H) {
    const st = status.get("baseline") || (locked ? "not_selected" : ended ? "expired" : "");
    const first = b?.first_event_min === null || b?.first_event_min === undefined
      ? `none within ${H} min`
      : `in ${int(b.first_event_min)} min${b.first_event_label ? `, ${b.first_event_label}` : ""}`;
    return h("article", { class: "option-card", dataset: { kind: "baseline", status: st }, "aria-label": "Do nothing" },
      h("div", { class: "option-top" },
        h("span", { class: "option-letter", "aria-hidden": "true" }, "–"),
        h("h4", { class: "option-title" }, "Do nothing")),
      h("p", { class: "option-desc" }, b?.description || "Publish nothing and wait for the publication cycles."),
      h("dl", { class: "option-figures" },
        h("dt", {}, "Misinformed"), h("dd", {}, `${int(b?.misinformed_pax)} of ${int(b?.affected_pax)}`),
        h("dt", {}, "First affected"), h("dd", {}, first),
        h("dt", {}, "Back in sync"), h("dd", {}, after(b?.time_to_sync_min, H)),
        h("dt", {}, "Next cycle"), h("dd", {}, b?.next_cycle_label || "—")),
      h("div", { class: "option-total" }, h("span", { class: "label" }, "Still misinformed"), h("span", { class: "value num" }, int(b?.misinformed_pax))),
      actionsFor({ id: "baseline", letter: "–", title: "Do nothing" }, st, true));
  }

  function actionsFor(o, st, isBaseline = false) {
    if (st === "approved") return h("div", { class: "option-status mark-pass" }, icon("check", 20), isBaseline ? "Risk accepted" : "Approved");
    if (st === "rejected") return h("div", { class: "option-status mark-fail" }, icon("x", 20), "Rejected");
    if (st === "not_selected") return h("div", { class: "option-status mark-skip" }, "Not selected");
    if (st === "expired") return h("div", { class: "option-status mark-skip" }, "No decision: the run ended");
    if (isBaseline) {
      return h("div", { class: "option-actions" },
        h("button", { class: "btn", type: "button", on: { click: () => decide(o, "approved") } }, "Accept the risk"));
    }
    return h("div", { class: "option-actions" },
      // The recommended option's Approve is the one solid brand button; the others stay available
      // as outlined brand buttons. Reject is a neutral decision, not an alarm.
      h("button", { class: `btn btn-approve${o.recommended ? "" : " btn-brand-outline"}`, type: "button", on: { click: () => decide(o, "approved") } }, icon("check", 18), "Approve"),
      h("button", { class: "btn btn-reject", type: "button", on: { click: () => decide(o, "rejected") } }, "Reject"));
  }

  function decide(o, decision) {
    if (locked || !current) return;
    refocus = panel.contains(document.activeElement);
    // The decision names the set of options it was taken on, so a click on a set the agent has just
    // replaced is ignored instead of counting for the new one.
    onDecision?.({ option_id: o.id, option_label: o.id === "baseline" ? "Do nothing (accept the risk)" : `Option ${o.letter}: ${o.title}`, options_seq: current.options_seq ?? null, decision });
  }

  bus.on("options", (ev) => {
    current = ev.payload;
    status.clear();
    locked = false;
    ended = false;
    render();
    onCount?.(current.options?.length || 0, true);
  });

  bus.on("option_decision", (ev) => {
    const { option_id: id, decision, options_seq: seq } = ev.payload;
    if (current && seq !== undefined && seq !== (current.options_seq ?? null)) return; // a decision on an older set
    status.set(id, decision);
    if (decision === "approved") {
      locked = true;
      for (const o of current?.options || []) if (o.id !== id) status.set(o.id, "not_selected");
      if (id !== "baseline") status.set("baseline", "not_selected");
    }
    render();
    onCount?.(current?.options?.length || 0, !locked);
  });

  // An aborted or failed run cannot take a decision any more: say so instead of offering buttons.
  bus.on("run_end", () => {
    if (!current || locked) return;
    ended = true;
    render();
    onCount?.(current.options?.length || 0, false);
  });

  function reset() {
    current = null;
    status.clear();
    locked = false;
    ended = false;
    empty();
    onCount?.(0, false);
  }

  empty();
  return { reset };
}
