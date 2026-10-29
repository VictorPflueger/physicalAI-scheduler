// Outbox tab: drafted passenger messages, re-publication orders, override and hold requests, staff
// briefings and internal memos. Every item is a draft that needs explicit approval; approval only
// changes its status here — nothing is ever published or sent. A draft shows what it is, for whom and
// its subject line; its full text opens with "Show draft".

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { aiLabel } from "./ai_label.js";
import { DRAFT_LABEL } from "./drafts.js";

const TYPE = {
  passenger_message: { icon: "megaphone", label: DRAFT_LABEL.passenger_message },
  republish_order: { icon: "timetable", label: `${DRAFT_LABEL.republish_order} (mock)` },
  override_request: { icon: "hand", label: `${DRAFT_LABEL.override_request} (mock)` },
  staff_brief: { icon: "users", label: DRAFT_LABEL.staff_brief },
  hold_request: { icon: "clock", label: `${DRAFT_LABEL.hold_request} (mock)` },
  memo: { icon: "memo", label: DRAFT_LABEL.memo }
};

export function createOutbox(panel, { onDecision, onCount } = {}) {
  const actions = new Map(); // id -> { draft, status: "pending" | "approved" | "rejected" | "expired" }
  let refocus = false;       // a decision was made in the panel: keep focus in it after the rebuild

  function counts() {
    const pending = [...actions.values()].filter((a) => a.status === "pending").length;
    onCount?.(actions.size, pending > 0);
  }

  function render() {
    clear(panel);
    const pending = [...actions.values()].filter((a) => a.status === "pending");
    panel.appendChild(h("div", { class: "outbox-head" },
      h("span", { class: "outbox-safety", title: "The Timetable Translator is connected to no passenger information, timetable or dispatch system; approving marks a draft as cleared for publication." }, icon("shield", 18), "Drafts only: connected to no system, nothing is sent."),
      pending.length > 1
        ? h("button", { class: "vc-button vc-button--secondary button-compact", type: "button", dataset: { action: "approve-all" }, on: { click: () => pending.forEach((a) => decide(a.draft, "approved")) } }, icon("check", 16), `Approve all ${pending.length} pending`)
        : null));

    if (!actions.size) {
      panel.appendChild(h("div", { class: "vc-empty empty" },
        h("strong", { class: "vc-empty__title" }, "Nothing drafted yet"),
        h("p", { class: "vc-empty__text" }, "After you approve an option, the agent drafts what it takes: the passenger message (German, then English), the re-publication order, override or hold requests, the staff briefing. Each draft waits here for your approval.")));
      return;
    }

    const list = h("div", { class: "outbox-list" });
    for (const { draft, status } of actions.values()) list.appendChild(card(draft, status));
    panel.appendChild(list);
    if (refocus) {
      // The list was rebuilt: focus the next pending draft's Approve, or the list itself.
      refocus = false;
      const next = panel.querySelector(".action-card[data-status=\"pending\"] [data-action=\"approve\"]");
      if (next) next.focus();
      else { list.setAttribute("tabindex", "-1"); list.focus(); }
    }
  }

  function card(d, status) {
    const t = TYPE[d.type] || TYPE.memo;
    // The status is a Vici tag: merlot while it waits for you, success once approved, plain otherwise.
    const tone = status === "pending" ? "vc-tag--accent" : status === "approved" ? "vc-tag--success" : "";
    const statusText = status === "pending" ? "Pending approval"
      : status === "approved" ? "Approved — draft, not published"
        : status === "expired" ? "Not decided: the run ended" : "Rejected";
    const bodyText = d.body || (d.payload ? JSON.stringify(d.payload, null, 2) : "");
    // The text stays closed until asked for: the subject line says what the draft does.
    const el = h("article", { class: "vc-card action-card", dataset: { status, expanded: "false", folded: "true" } },
      h("span", { class: "vc-cell action-type", "aria-hidden": "true" }, icon(t.icon, 20)),
      h("div", {},
        h("div", { class: "action-meta" },
          h("span", {}, t.label),
          h("span", {}, `To: ${d.recipient}`),
          h("span", { class: ["vc-tag", tone, "action-status"] }, statusText),
          Array.isArray(d.unchecked) && d.unchecked.length
            ? h("span", { class: "vc-tag vc-tag--warning", title: `Facts no tool returned: ${d.unchecked.join(", ")}` }, "Unchecked facts")
            : null,
          aiLabel("draft")),
        h("div", { class: "action-subject" }, d.subject),
        h("pre", { class: "action-body", id: `draft-${d.action_id}-body` }, bodyText),
        bodyText
          ? h("button", { class: "vc-button vc-button--ghost button-compact action-more", type: "button", "aria-expanded": "false", "aria-controls": `draft-${d.action_id}-body`, on: { click: (e) => {
            const open = el.dataset.expanded !== "true";
            el.dataset.expanded = String(open);
            e.currentTarget.setAttribute("aria-expanded", String(open));
            e.currentTarget.textContent = open ? "Hide draft" : "Show draft";
          } } }, "Show draft")
          : null),
      status === "pending"
        ? h("div", { class: "action-buttons" },
          h("button", { class: "vc-button", type: "button", dataset: { action: "approve" }, on: { click: () => decide(d, "approved") } }, icon("check", 18), "Approve"),
          h("button", { class: "vc-button vc-button--outline", type: "button", dataset: { action: "reject" }, on: { click: () => decide(d, "rejected") } }, "Reject"))
        : h("div", { class: "action-buttons" }));
    return el;
  }

  function decide(d, decision) {
    const a = actions.get(d.action_id);
    if (!a || a.status !== "pending") return;
    refocus = panel.contains(document.activeElement);
    const kind = (TYPE[d.type] || TYPE.memo).label;
    onDecision?.({ action_id: d.action_id, decision, kind, label: `${kind.toLowerCase()} “${d.subject}”` });
  }

  bus.on("action_draft", (ev) => {
    actions.set(ev.payload.action_id, { draft: ev.payload, status: "pending" });
    render();
    counts();
  });

  bus.on("action_decision", (ev) => {
    const a = actions.get(ev.payload.action_id);
    if (!a) return;
    a.status = ev.payload.decision;
    render();
    counts();
  });

  // Drafts still pending when a run ends (abort, error) can no longer be decided; nothing was sent.
  bus.on("run_end", () => {
    let changed = false;
    for (const a of actions.values()) if (a.status === "pending") { a.status = "expired"; changed = true; }
    if (changed) { render(); counts(); }
  });

  function reset() {
    actions.clear();
    render();
    counts();
  }

  render();
  return { reset };
}
