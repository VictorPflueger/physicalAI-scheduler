// What the presenter sees for each step: the heading with its finding, what the step does, the one
// thing to look at (the lead, the alert and its sources, the first estimate against the count, the
// options, the drafts), the agent's own words, and the four key figures. It reads the run digest
// (js/run.js) through js/story.js, so a replay and a live run look the same.

import { h, icon } from "./dom.js";
import { STEPS, words, firstWhere } from "./story.js";
import { results, approved } from "./run.js";
import { plain, names } from "./plain.js";
import { toolPlain } from "./tool_plain.js";
import { DRAFT_LABEL } from "./drafts.js";
import { int } from "./format.js";

const $ = (id) => document.getElementById(id);
/** What a guardrail refused, by the agent's own step. */
const REFUSED = { ui_draft_action: "A draft was refused", ui_report_alert: "An alert was refused", ui_propose_options: "The options were refused", ui_final_report: "The summary was refused", ui_mark_mirror: "A mark was refused" };
/** The agent's labels, bold at the start of a paragraph: "Revised: …". */
const LABEL = /^(Lead|Finding|Hypothesis|First estimate|Check|Confirmed|Not confirmed|Revised|Impact|Recommendation|Option [ABC] (?:approved|rejected)|You accepted the risk)([:.])/;

/** Draws one step into the story panel. handlers: { decide(optionId, decision), decideDraft(id, decision) }. */
export function renderStory(r, view, at, { scenario, model, mode, handlers }) {
  const step = view.steps[at];
  $("story-title").textContent = step.title;
  $("story-lead").textContent = step.lead;
  $("story-card").replaceChildren(...card(r, view, at, { scenario, handlers }));
  $("agent-note").textContent = mode === "live" ? "Claude, live on your key. You are interacting with an AI system" : "replayed, not live";
  $("agent-words").replaceChildren(...agentWords(r, at, { model, mode }));
}

function agentWords(r, at, { model, mode }) {
  const out = [];
  const lines = [
    ...r.said.filter((m) => m.step === at).map((m) => ({ kind: "say", m })),
    ...r.calls.filter((c) => c.step === at && !c.name.startsWith("ui_")).map((c) => ({ kind: "did", c })),
    // A guardrail that refused one of the agent's own steps (a draft quoting a time no tool returned).
    ...r.calls.filter((c) => c.step === at && c.name.startsWith("ui_") && c.done && c.ok === false).map((c) => ({ kind: "refused", c })),
    ...r.notices.filter((n) => n.step === at && !/^Waiting for your approval/.test(n.text || "")).map((n) => ({ kind: "notice", n }))
  ];
  // In the order they happened (the digest numbers every event it reads).
  const seq = (l) => (l.m || l.c || l.n).seq;
  for (const l of lines.sort((a, b) => seq(a) - seq(b))) {
    if (l.kind === "say") {
      for (const para of plain(l.m.text).split(/\n\s*\n/)) {
        const m = LABEL.exec(para);
        out.push(m ? h("p", {}, h("strong", {}, m[1] + m[2]), para.slice(m[0].length)) : h("p", {}, para));
      }
    } else if (l.kind === "refused") {
      const what = REFUSED[l.c.name] || "A step of the agent was refused";
      const why = plain(String(l.c.result?.error || l.c.summary || "")).split(/(?<=\.)\s+/)[0].replace(/^The (draft|alert|summary|options?) (was|were) refused\.?\s*/i, "");
      out.push(h("p", { class: "notice", dataset: { level: "warn" } }, icon("shield"), h("strong", {}, "Guardrail: "), `${what}. ${why}`.trim()));
    } else if (l.kind === "did") {
      const line = toolPlain(l.c.name, l.c.input, model);
      if (line) out.push(h("p", { class: "did", dataset: { done: String(l.c.done), ok: String(l.c.ok) } }, icon(l.c.name === "phys_observe" ? "radar" : l.c.name === "sim_sync" ? "chart-bar" : "list"), plain(line)));
    } else {
      out.push(h("p", { class: "notice", dataset: { level: l.n.level || "info" } }, plain(l.n.text)));
    }
  }
  if (mode === "live" && r.reached === at && !r.end && !lines.length) out.push(h("p", { class: "working" }, h("span", { class: "vc-spinner vc-spinner--sm", "aria-hidden": "true" }), "Claude is working on this step…"));
  if (!out.length) out.push(h("p", { class: "did empty" }, "The agent has not reached this step yet."));
  return out;
}

function card(r, view, at, { scenario, handlers }) {
  switch (STEPS[at].id) {
    case "spot":
      return [h("div", { class: "card" },
        h("p", { class: "card-title" }, icon("warning"), "The lead, not yet confirmed"),
        h("blockquote", {}, plain(scenario?.seed || "")))];
    case "check": {
      const a = r.alert;
      if (!a) return [];
      const n = (a.sources || []).length;
      return [h("div", { class: "card card--alert", role: "status" },
        h("p", { class: "card-title" }, icon("error"), a.basis === "what_if" ? "What-if alert: not confirmed" : `Alert, confirmed by ${words(Math.max(2, n))} sources`),
        h("p", {}, plain(a.summary)),
        n ? h("ul", { class: "sources" }, a.sources.map((s) => h("li", {}, icon("check"), plain(s.title)))) : null)];
    }
    case "calculate": {
      const { first, last } = results(r, null, 2);
      if (!last) return [];
      const b = last.result.baseline;
      const figs = [];
      if (first && first !== last) {
        const fb = first.result.baseline;
        figs.push(fig("First estimate", int(fb.misinformed_pax), coveredOf(first), "at_risk"));
        figs.push(fig("After every channel", int(b.misinformed_pax), last.basisKey === "verified" ? "verified against the source" : "still an estimate", "affected"));
      } else figs.push(fig("Misinformed passengers", int(b.misinformed_pax), "if nothing is done", "affected"));
      figs.push(fig("First passenger acts in", b.first_event_min === null ? "None" : `${int(b.first_event_min)} min`, firstWhere(b.first_event_label) || "within three hours"));
      return [h("div", { class: "impact" }, figs)];
    }
    case "propose": {
      if (!r.options) return [];
      const rows = [...r.options.options, { id: "baseline", letter: "–", title: "Do nothing", ...r.options.baseline }];
      const out = [h("ul", { class: "options" }, rows.map((o) => optionRow(r, o, handlers)))];
      if (r.decision) out.push(h("p", { class: "decision" }, r.decision.id === "baseline"
        ? "You accepted the risk. The agent records it in a memo; nothing is published."
        : `You approved option ${approved(r)?.letter}. The agent drafts what it needs; nothing is published until you approve each draft.`));
      return out;
    }
    case "prepare": {
      if (!r.decision) return [h("div", { class: "card" }, h("p", { class: "card-title" }, icon("info"), "No decision yet"), h("p", {}, "The agent drafts only for an option you approve."))];
      const drafts = r.drafts;
      const open = drafts.filter((d) => d.status === "pending");
      const out = [];
      if (drafts.length) out.push(h("div", { class: "drafts-bar" }, h("span", { class: "vc-tag vc-tag--feature vc-tag--sm" }, icon("sparkle"), "Drafted by the agent"), h("p", {}, icon("shield"), " Approving publishes nothing.")));
      if (r.report && !open.length) out.push(summary(r));
      out.push(h("ul", { class: "drafts" }, drafts.map((d) => draftRow(d, handlers))));
      if (r.log.length) out.push(decisionLog(r));
      return out;
    }
    default:
      return [];
  }
}

/** What a first estimate looked at: "journey planner and app only". */
function coveredOf(s) {
  const ch = s.result.scope?.channels;
  if (Array.isArray(ch) && ch.length) return `${ch.map((c) => ({ planner: "journey planner and app", displays: "station displays", announcements: "announcements", coach: "coach order" })[c] || c).join(", ")} only`;
  if ((s.result.left_out || []).length) return "not everything checked yet";
  return "a first look";
}

const fig = (label, value, note, tone) => h("div", { class: "impact-fig", dataset: tone ? { tone } : {} }, h("p", { class: "impact-label" }, label), h("p", { class: "impact-value" }, value), h("p", { class: "impact-note" }, note));

function optionRow(r, o, hd) {
  const decided = r.decision?.id;
  const state = decided === o.id ? "approved" : r.rejected.includes(o.id) ? "rejected" : decided ? "passed" : "open";
  const isBase = o.id === "baseline";
  const m = (x) => `${int(x)} min`;
  const figs = isBase
    ? h("p", { class: "option-figs" }, "Leaves ", h("strong", {}, int(o.misinformed_pax)), " misinformed", o.first_event_min === null ? "" : `, the first in ${m(o.first_event_min)}`, o.next_cycle_label ? `; the next publication at ${o.next_cycle_label} does not fix it` : "")
    : h("p", { class: "option-figs" }, "Leaves ", h("strong", {}, int(o.misinformed_pax)), " misinformed",
      o.correct_info_from_min === null || o.correct_info_from_min === undefined ? "" : [", right information after ", h("strong", {}, m(o.correct_info_from_min))],
      o.time_to_sync_min === null || o.time_to_sync_min === undefined ? ", data stays wrong" : [", every channel aligned after ", h("strong", {}, m(o.time_to_sync_min))],
      o.manual_overrides ? `, ${o.manual_overrides} ${o.manual_overrides === 1 ? "value" : "values"} set by hand` : "",
      o.held_pax ? `, ${int(o.held_pax)} keep their connection` : "");
  let actions;
  if (state === "approved") actions = h("span", { class: "option-tag" }, icon("check"), " Approved");
  else if (state === "rejected") actions = h("span", { class: "option-tag" }, "Rejected");
  else if (state === "passed") actions = h("span", { class: "option-tag" }, "Not chosen");
  else actions = h("div", { class: "option-actions" },
    h("button", { type: "button", class: "vc-button vc-button--secondary", dataset: { option: o.id, action: "approve" }, on: { click: () => hd.decide(o.id, "approved") } }, icon("check"), isBase ? "Accept the risk" : "Approve"),
    isBase ? null : h("button", { type: "button", class: "vc-button vc-button--ghost", dataset: { option: o.id, action: "reject" }, on: { click: () => hd.decide(o.id, "rejected") } }, "Reject"));
  return h("li", { class: "option", dataset: { option: o.id, recommended: String(!!o.recommended), state } },
    h("span", { class: "option-letter", "aria-hidden": "true" }, o.letter),
    h("div", { class: "option-body" },
      h("p", { class: "option-title" }, isBase ? "Do nothing" : `Option ${o.letter}: ${plain(o.title)}`, o.recommended ? h("span", { class: "vc-tag vc-tag--feature vc-tag--sm rec-tag" }, icon("sparkle"), "Recommended") : null),
      !isBase && o.description ? h("p", { class: "option-desc" }, plain(o.description)) : null,
      figs),
    actions);
}

function draftRow(d, hd) {
  const status = d.status === "approved" ? h("span", { class: "draft-status" }, icon("check"), " Approved, not published")
    : d.status === "rejected" ? h("span", { class: "draft-status" }, "Rejected")
      : h("span", { class: "draft-actions" },
        h("button", { type: "button", class: "vc-button vc-button--secondary", dataset: { draft: d.action_id, action: "approve" }, on: { click: () => hd.decideDraft(d.action_id, "approved") } }, "Approve"),
        h("button", { type: "button", class: "vc-button vc-button--ghost", dataset: { draft: d.action_id, action: "reject" }, on: { click: () => hd.decideDraft(d.action_id, "rejected") } }, "Reject"));
  const kind = DRAFT_LABEL[d.type] || "Draft";
  return h("li", { class: "draft", dataset: { status: d.status } },
    h("div", { class: "draft-head" }, icon(d.type === "passenger_message" ? "megaphone" : d.type === "memo" ? "memo" : "mail"),
      h("div", { class: "draft-what" }, h("p", { class: "draft-to" }, `${kind} to ${plain(d.recipient)}`), h("p", { class: "draft-subject" }, plain(d.subject))),
      status),
    h("details", {}, h("summary", {}, "Read the draft"), h("pre", {}, names(d.body))));
}

/** The management summary, from the report's Markdown: headings, paragraphs, bold, a table. */
function summary(r) {
  const box = h("details", { class: "summary", open: true }, h("summary", {}, h("strong", {}, "Management summary"), h("span", { class: "vc-tag vc-tag--feature vc-tag--sm" }, icon("sparkle"), "Written by the agent")));
  const inline = (text) => text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean).map((t) => (t.startsWith("**") ? h("strong", {}, t.slice(2, -2)) : t.startsWith("*") ? h("em", {}, t.slice(1, -1)) : t));
  for (const b of plain(r.report.markdown).split(/\n\s*\n/)) {
    if (/^#+\s/.test(b)) box.append(h("h4", {}, b.replace(/^#+\s*/, "")));
    else if (/^\|/.test(b)) {
      const rows = b.split("\n").filter((x) => !/^\|\s*-/.test(x)).map((x) => x.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      box.append(h("div", { class: "vc-table-wrap" }, h("table", { class: "vc-table vc-table--compact" },
        h("thead", {}, h("tr", {}, rows[0].map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", {}, rows.slice(1).map((x) => h("tr", {}, x.map((c, i) => (i ? h("td", { class: "vc-num" }, c) : h("th", { scope: "row" }, c)))))))));
    } else box.append(h("p", {}, inline(b)));
  }
  return box;
}

/** Who approved or rejected what, and when: every decision on this page, in order. */
function decisionLog(r) {
  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
  return h("details", { class: "log", open: true }, h("summary", {}, `Decision log: ${r.log.length} ${r.log.length === 1 ? "entry" : "entries"}`),
    h("ol", {}, r.log.map((e) => h("li", {}, h("time", { datetime: e.at || "" }, time(e.at)), ` ${e.who} ${plain(e.what)}`))));
}

// ---- the key figures -----------------------------------------------------------------------------------

/** Writes js/story.js keyFigures() into the tiles. setKpi(name, { value, was, note, tone }) is the shell's. */
export function renderKpis(figs, setKpi) {
  setKpi("Misinformed passengers", figs.pax);
  setKpi("First passenger acts in", figs.first);
  setKpi("Session cost", { ...figs.cost, tone: "" });
}

