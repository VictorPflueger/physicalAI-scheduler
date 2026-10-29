// Options tab: three costed options plus the do-nothing baseline, a comparison, and the approval
// gate. Card state follows option_decision events, so live and simulated runs behave alike. Each card
// carries its title, when every channel is aligned with the source again, the values it would keep by
// hand (a second truth the source does not know; the row only when there are any), a held connection
// when it has one, one big figure, the passengers still misinformed (fewer is better), and one line on
// who they are (the residual risk), which a room reads off a projector. What the option does in full,
// the staff effort and when the right information reaches passengers are in the card's tooltip.

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
/** Markdown emphasis out of a tooltip, which shows plain text. */
const plain = (x) => String(x || "").replace(/\*\*|__|`/g, "").trim();

export function createOptionsPanel(panel, { onDecision, onCount } = {}) {
  let current = null;           // last options payload
  const status = new Map();     // option id -> "approved" | "rejected" | "not_selected"
  let locked = false;           // true once an option has been approved
  let ended = false;            // the run ended (abort, error) before any option was approved
  let refocus = false;          // a keyboard or pointer decision was made in the panel: keep focus in it

  function empty() {
    clear(panel);
    panel.appendChild(h("div", { class: "vc-empty empty" },
      h("strong", { class: "vc-empty__title" }, "No options yet"),
      h("p", { class: "vc-empty__text" }, "Once the agent has checked the trains against the source, its three costed responses and the do-nothing baseline appear here for your decision.")));
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
      h("p", { title: `Passengers who would still act on wrong information within ${H} minutes, per option; ${rightInfoClause(options)}. All figures come from the deterministic sync engine.` }, "Who would still act on wrong information, per option. Figures from the sync engine."),
      h("div", { class: "compare", role: "img", "aria-label": `Passengers still misinformed per option compared with doing nothing: ${rows.map((r) => `${r.name} ${int(r.res)}`).join("; ")}` },
        rows.map((r) => h("div", { class: "compare-row", dataset: { recommended: String(!!r.recommended) }, title: r.name },
          h("span", { class: "compare-key", "aria-hidden": "true" }, r.key),
          h("span", { class: "compare-track" },
            r.base !== undefined
              ? h("span", { class: "compare-bar baseline", style: { width: `${(r.base / max) * 100}%` } })
              : h("span", { class: "compare-bar residual", style: { left: "0%", width: `${(r.res / max) * 100}%` } })),
          h("span", { class: "compare-value vc-tabular" }, int(r.res))))),
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
      const next = panel.querySelector(".option-actions button");
      const target = next || panel.querySelector(".option-status")?.closest(".option-card");
      if (target) {
        if (!next) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: false });
      }
    }
  }

  function optionCard(o, H) {
    const st = status.get(o.id) || (locked ? "not_selected" : ended ? "expired" : "");
    // What the option does, the staff effort and when the right information arrives are in the card's
    // tooltip; who is still misinformed, and why, stays on its face.
    const tip = [
      plain(o.description),
      `Staff effort ${int(o.effort_min)} min; the right information reaches passengers after ${plus(o.correct_info_from_min)}.`
    ].filter(Boolean).join("\n");
    const card = h("article", { class: "vc-card option-card", dataset: { recommended: String(!!o.recommended), status: st, kind: "option" }, "aria-label": `Option ${o.letter}: ${o.title}`, title: tip },
      h("div", { class: "option-top" },
        h("span", { class: "option-letter", "aria-hidden": "true" }, o.letter),
        h("h4", { class: "option-title" }, o.title),
        o.recommended ? h("span", { class: "vc-tag vc-tag--solid" }, "Recommended") : null),
      h("dl", { class: "option-figures" },
        h("dt", {}, "All channels aligned"), h("dd", { title: "When every channel shows what the source says again" }, after(o.time_to_sync_min, H)),
        ...(o.manual_overrides ? [h("dt", {}, "Kept by hand"), h("dd", { title: "Manual overrides: values kept by hand on displays or announcements, a second truth the source does not know" }, `${int(o.manual_overrides)} ${o.manual_overrides === 1 ? "value" : "values"} (second truth)`)] : []),
        ...(o.hold ? [h("dt", {}, "Connection held"), h("dd", { title: `${o.hold.train} waits ${int(o.hold.wait_min)} min if dispatch agrees: ${int(o.held_pax)} passengers keep the connection, ${int(o.hold.delayed_pax)} on ${o.hold.train} are delayed. ${o.hold.note || ""}`.trim() }, `${int(o.held_pax)} keep it, ${o.hold.train} +${int(o.hold.wait_min)} min`)] : [])),
      h("div", { class: "option-total", title: `${int(o.protected_pax)} passengers protected; the right information reaches them after ${plus(o.correct_info_from_min)}` },
        h("span", { class: "label" }, "Still misinformed"), h("span", { class: "value vc-tabular" }, int(o.misinformed_pax))),
      o.residual_risk ? renderInline(o.residual_risk, h("p", { class: "option-risk", title: "Residual risk: who is still misinformed with this option, and why" })) : null,
      actionsFor(o, st));
    return card;
  }

  function baselineCard(b, H) {
    const st = status.get("baseline") || (locked ? "not_selected" : ended ? "expired" : "");
    // When, on the card; where (the train and stop) in its tooltip, as the KPI tile above shows it too.
    const first = b?.first_event_min === null || b?.first_event_min === undefined ? `none within ${H} min` : `in ${int(b.first_event_min)} min`;
    return h("article", { class: "vc-card option-card", dataset: { kind: "baseline", status: st }, "aria-label": "Do nothing", title: plain(b?.description) || "Publish nothing and wait for the publication cycles." },
      h("div", { class: "option-top" },
        h("span", { class: "option-letter", "aria-hidden": "true" }, "–"),
        h("h4", { class: "option-title" }, "Do nothing")),
      // Two rows: when the first passenger acts, and whether the next publication cycle puts it right
      // (a short-notice change it does not take). Everyone relying on a wrong fact is in the tooltip.
      h("dl", { class: "option-figures", title: `${int(b?.affected_pax)} passengers rely on a wrong fact; every channel aligned ${after(b?.time_to_sync_min, H)}` },
        h("dt", {}, "First affected"), h("dd", b?.first_event_label ? { title: b.first_event_label } : {}, first),
        h("dt", {}, "Next cycle"), h("dd", b?.next_cycle_note ? { title: b.next_cycle_note } : {}, b?.next_cycle_label ? `${b.next_cycle_label}${b.time_to_sync_min === null || b.time_to_sync_min === undefined ? ", does not fix it" : ""}` : "—")),
      h("div", { class: "option-total" }, h("span", { class: "label" }, "Still misinformed"), h("span", { class: "value vc-tabular" }, int(b?.misinformed_pax))),
      actionsFor({ id: "baseline", letter: "–", title: "Do nothing" }, st, true));
  }

  function actionsFor(o, st, isBaseline = false) {
    // The decided state is a Vici tag in its tone, with its icon and its word: an accepted risk in the
    // warning tone with the hand, as on the mirror and in its legend.
    if (st === "approved") return h("div", { class: "option-status" }, isBaseline
      ? h("span", { class: "vc-tag vc-tag--warning" }, icon("hand", 20), "Risk accepted")
      : h("span", { class: "vc-tag vc-tag--success" }, icon("check", 20), "Approved"));
    if (st === "rejected") return h("div", { class: "option-status" }, h("span", { class: "vc-tag vc-tag--danger" }, icon("x", 20), "Rejected"));
    if (st === "not_selected") return h("div", { class: "option-status" }, h("span", { class: "vc-tag" }, "Not selected"));
    if (st === "expired") return h("div", { class: "option-status" }, h("span", { class: "vc-tag" }, "No decision: the run ended"));
    if (isBaseline) {
      return h("div", { class: "option-actions" },
        h("button", { class: "vc-button vc-button--outline", type: "button", dataset: { action: "approve" }, on: { click: () => decide(o, "approved") } }, "Accept the risk"));
    }
    return h("div", { class: "option-actions" },
      // The recommended option's Approve is the one solid merlot button; the others stay available as
      // Vici's secondary (soft merlot) buttons. Reject is a neutral decision, not an alarm.
      h("button", { class: `vc-button${o.recommended ? "" : " vc-button--secondary"}`, type: "button", dataset: { action: "approve" }, on: { click: () => decide(o, "approved") } }, icon("check", 18), "Approve"),
      h("button", { class: "vc-button vc-button--outline", type: "button", dataset: { action: "reject" }, on: { click: () => decide(o, "rejected") } }, "Reject"));
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
