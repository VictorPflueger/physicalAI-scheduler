// Agent console: renders the run-event stream as a logbook (time · mark · entry).
// Narration paragraphs that start with a label (Hypothesis:, Check:, Confirmed:, Not confirmed:,
// Revised:, Finding:, Recommendation:) get distinct styling; "Revised: old → new" is rendered as an
// amended entry with the superseded part struck through.

import { bus } from "./events.js";
import { h, clear, prefersReducedMotion } from "./dom.js";
import { icon } from "./icons.js";
import { renderInline, renderMarkdown } from "./md.js";
import { clock } from "./format.js";
import { auditRows } from "./audit.js";
import { computeRunFacts, describeRunFacts } from "./run_facts.js";
import { createProgressRail } from "./progress.js";
import { aiLabel } from "./ai_label.js";
import { runStateLabel } from "./handover.js";
import { LABELS, splitParagraphs } from "./labels.js";
import { STORAGE } from "./config.js";
import { DRAFT_LABEL } from "./drafts.js";

const PHASES = new Set(["diagnosing", "verifying", "simulating", "options", "awaiting_approval", "executing"]);
const TEXT_SIZE_KEY = STORAGE.consoleText;

export function createConsole(panel, { onOpenOptions, onOpenOutbox, onOpenReport, onSaveSimulation } = {}) {
  const count = h("span", { class: "count num" }, "");
  const jumpBtn = h("button", { class: "btn btn-sm", type: "button", hidden: true }, icon("chevronDown", 16), "Jump to latest");
  // Larger text for projectors, remembered per browser (a convenience; storage may be unavailable).
  const sizeBtn = h("button", { class: "btn btn-sm btn-ghost text-size", type: "button", "aria-pressed": "false", title: "Larger console text for projectors" }, "Larger text");
  const applySize = (large) => {
    panel.dataset.text = large ? "large" : "standard";
    sizeBtn.setAttribute("aria-pressed", String(large));
    pin();
  };
  sizeBtn.addEventListener("click", () => {
    const large = panel.dataset.text !== "large";
    applySize(large);
    try { localStorage.setItem(TEXT_SIZE_KEY, large ? "large" : "standard"); } catch { /* storage unavailable */ }
  });
  const SCRIPTED = "Scripted replay of a representative run. Not live data, no model calls.";
  const watermarkText = h("span", {}, SCRIPTED);
  const watermark = h("div", { class: "sim-watermark", hidden: true, role: "note" }, "SIMULATION", watermarkText);
  const log = h("div", { class: "log", role: "log", "aria-live": "polite", "aria-relevant": "additions" });
  // The agent's plan and progress, above the log (agentic UX: show the plan, show the hand-over).
  const rail = createProgressRail();
  rail.reset();

  panel.append(
    h("div", { class: "console-head" },
      h("div", { class: "console-title" }, h("h2", {}, "Agent console"), count),
      h("div", { class: "console-head-actions" }, jumpBtn, sizeBtn)),
    rail.el,
    watermark,
    log
  );

  const byMsg = new Map();
  const byCall = new Map();
  let entries = 0;
  let lastPhase = null;
  let runMeta = null;
  let sawReport = false;
  let optionsSeq = null; // the set of options on screen: a click on an older set is not logged as a decision
  // Auto-follow: the log stays pinned to the newest entry until the presenter scrolls up. Only
  // user input (wheel, touch, keys, scrollbar drag) can unpin it, so programmatic scrolling and
  // layout changes (the drawer opening) never stop the follow.
  let follow = true;
  let userIntentUntil = 0;
  const noteIntent = () => { userIntentUntil = performance.now() + 900; };
  for (const type of ["wheel", "touchmove", "pointerdown", "keydown"]) log.addEventListener(type, noteIntent, { passive: true });
  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const pin = () => { if (follow) log.scrollTop = log.scrollHeight; };

  log.addEventListener("scroll", () => {
    if (atBottom()) {
      follow = true;
      jumpBtn.hidden = true;
    } else if (performance.now() < userIntentUntil) {
      follow = false;
      if (entries > 0) jumpBtn.hidden = false;
    }
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(pin).observe(log);
  jumpBtn.addEventListener("click", () => {
    follow = true;
    jumpBtn.hidden = true;
    log.scrollTo({ top: log.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  });

  function showEmpty() {
    clear(log);
    log.appendChild(h("div", { class: "log-empty" },
      h("h3", {}, "Pick a scenario, then start the agent"),
      h("p", {}, "The five steps above are the agent's plan. It spots an operational change and finds the trains it touches, checks the source timetable against what passengers are told and against the physical layer, works out who would act on wrong information and when, then proposes three costed responses."),
      h("p", {}, "When it needs you, the step turns burgundy. Nothing is sent without your approval. You choose between a free simulation and the live agent on your own API key.")));
    count.textContent = "";
  }

  function add(el) {
    if (entries === 0) clear(log);
    log.appendChild(el);
    entries++;
    count.textContent = `${entries} ${entries === 1 ? "entry" : "entries"}`;
    if (follow) pin();
    else jumpBtn.hidden = false;
    return el;
  }

  function entry(type, t, mark, body, data = {}) {
    return h("div", { class: "entry", dataset: { type, ...data } },
      h("div", { class: "entry-time" }, t !== null && t !== undefined ? clock(t) : ""),
      h("div", { class: "entry-mark" }, mark ? icon(mark, 18) : null),
      h("div", { class: "entry-body" }, body));
  }

  // ---- event handlers ---------------------------------------------------------------------------

  bus.on("run_start", (ev) => {
    const p = ev.payload;
    reset(false);
    runMeta = p;
    const recorded = p.mode === "simulation" && p.sim_source === "recorded";
    watermark.hidden = p.mode !== "simulation";
    watermarkText.textContent = recorded
      ? `Replay of a live run recorded${p.recorded_on ? ` on ${p.recorded_on}` : ""}${p.recorded_model ? ` (${p.recorded_model})` : ""}. Not live data, no model calls.`
      : SCRIPTED;
    log.dataset.sim = String(p.mode === "simulation");
    const meta = p.mode === "simulation"
      ? recorded ? "Simulation: replay of a recorded live run, no API key, no cost." : "Simulation: scripted replay, no API key, no cost."
      : `Live agent on ${p.model_label || p.model || "Claude"}. Real model reasoning and real tool calls.`;
    add(entry("run", ev.t, "play", [
      h("div", { class: "run-title" }, p.title || "Agent run"),
      h("div", {}, meta),
      p.seed ? h("div", { class: "seed" }, renderInline(p.seed, h("span"))) : null
    ]));
  });

  bus.on("state_change", (ev) => {
    const s = ev.payload.state;
    rail.update(s);
    if (!PHASES.has(s) || s === lastPhase) return;
    lastPhase = s;
    add(entry("phase", ev.t, null, h("span", { class: "phase" }, `Phase: ${runStateLabel(s)}`)));
  });

  bus.on("narration", (ev) => {
    const { msg_id: id, text, done } = ev.payload;
    let el = byMsg.get(id);
    if (!el) {
      el = add(entry("narration", ev.t, "pulse", h("div", { class: "narration" })));
      byMsg.set(id, el);
    }
    const body = el.querySelector(".narration");
    clear(body);
    for (const para of splitParagraphs(text)) body.appendChild(renderParagraph(para));
    el.classList.toggle("streaming", !done);
    // Screen readers wait for the finished paragraph instead of announcing every partial update.
    if (done) el.removeAttribute("aria-busy"); else el.setAttribute("aria-busy", "true");
    pin();
  });

  bus.on("reasoning", (ev) => {
    const { msg_id: id, text } = ev.payload;
    let el = byMsg.get(`r:${id}`);
    if (!el) {
      const details = h("details", { class: "reasoning" },
        h("summary", {}, icon("chevronRight", 14), "Reasoning summary"),
        h("div", { class: "reasoning-text" }));
      el = add(entry("reasoning", ev.t, null, details));
      byMsg.set(`r:${id}`, el);
    }
    el.querySelector(".reasoning-text").textContent = text || "";
  });

  bus.on("tool_call", (ev) => {
    const p = ev.payload;
    if (isUiTool(p.name)) return; // ui_* tools are shown by their effect (alert, mirror, options, outbox)
    const line = p.name === "web_search"
      ? h("div", { class: "tool-line" }, h("strong", {}, "Web search"), h("span", { class: "tool-query" }, p.input?.query || ""))
      : h("div", { class: "tool-line" }, h("span", { class: "tool-name" }, p.name), h("span", { class: "tool-args" }, argsSummary(p.name, p.input)));
    const el = add(entry("tool_call", ev.t, p.server ? "globe" : "gear", line, { server: String(!!p.server) }));
    byCall.set(p.call_id, el);
  });

  bus.on("tool_result", (ev) => {
    const p = ev.payload;
    if (isUiTool(p.name)) {
      // A refused ui_* call is a guardrail at work (two sources, figures from tools, drafts only
      // after a decision): show it, so the presenter sees why the agent tries again.
      if (p.ok === false) {
        const why = String(p.result?.error || p.summary || "").replace(/^Error:\s*/, "");
        add(entry("notice", ev.t, "shield", h("span", {}, h("strong", {}, "Guardrail: "), `${GUARD_LABEL[p.name] || p.name} refused. `, why), { level: "warn", guard: p.name }));
      }
      return;
    }
    let el = byCall.get(p.call_id);
    if (!el) el = add(entry("tool_call", ev.t, p.server ? "globe" : "gear", h("div", { class: "tool-line" }, h("span", { class: "tool-name" }, p.name))));
    const body = el.querySelector(".entry-body");
    const result = h("div", { class: "result", dataset: { open: "false" } });
    const toggle = h("button", { class: "result-toggle", type: "button", "aria-expanded": "false" },
      icon("chevronRight", 14),
      h("span", { class: "result-summary", dataset: { ok: String(p.ok !== false) } }, p.summary || (p.ok === false ? "Tool error" : "Result")));
    const pre = h("pre", { class: "result-body" }, formatJson(p.result));
    toggle.addEventListener("click", () => {
      const open = result.dataset.open !== "true";
      result.dataset.open = String(open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    result.append(toggle);
    if (Array.isArray(p.sources) && p.sources.length) {
      result.append(h("div", { class: "result-sources" }, p.sources.slice(0, 5).map((s) => {
        const tag = s.representative ? " (representative)" : s.recorded ? ` (recorded${s.recorded_on ? ` ${s.recorded_on}` : ""})` : "";
        const label = `${s.title || s.url}${s.page_age ? `, ${s.page_age}` : ""}${tag}`;
        return s.url ? h("a", { href: safeUrl(s.url), target: "_blank", rel: "noopener noreferrer" }, label) : h("span", {}, label);
      })));
    }
    result.append(pre);
    body.appendChild(result);
    pin();
  });

  bus.on("alert", (ev) => {
    const p = ev.payload;
    const sev = String(p.severity || "high").toLowerCase();
    const whatIf = p.basis === "what_if";
    const card = h("div", { class: "alert-card", dataset: { severity: sev, basis: whatIf ? "what_if" : "verified" } },
      h("div", { class: "alert-sev" }, whatIf ? `What-if exercise (not a verified finding), severity ${sev}` : `Alert, severity ${sev}`),
      h("h3", {}, p.title || "Customer information alert"),
      p.summary ? renderInline(p.summary, h("div")) : null,
      Array.isArray(p.sources) && p.sources.length
        ? h("ul", {}, p.sources.slice(0, 6).map((s) => h("li", {}, s.url ? h("a", { href: safeUrl(s.url), target: "_blank", rel: "noopener noreferrer" }, s.title || s.url) : (s.title || String(s)))))
        : null,
      // What the run actually checked, from the tool results (the sources above are the agent's words).
      Array.isArray(p.evidence) && p.evidence.length
        ? h("p", { class: "alert-evidence" }, h("strong", {}, "Checked in this run: "), p.evidence.join("; "), ".")
        : null);
    add(entry("alert", ev.t, "alert", card));
  });

  // A response that was not kept (failed and retried, or cut off and redone): its entries stay
  // visible for the record, dimmed and marked, and nothing in them counts.
  bus.on("attempt_discarded", (ev) => {
    const p = ev.payload || {};
    const els = [...(p.msg_ids || []).flatMap((id) => [byMsg.get(id), byMsg.get(`r:${id}`)]), ...(p.call_ids || []).map((id) => byCall.get(id))].filter(Boolean);
    for (const el of new Set(els)) {
      if (el.dataset.discarded === "true") continue;
      el.dataset.discarded = "true";
      el.style.opacity = "0.55";
      el.classList.remove("streaming");
      el.removeAttribute("aria-busy");
      el.querySelector(".entry-body")?.prepend(h("div", { class: "discarded-note" }, h("em", {}, "Discarded: "), p.reason || "this part of the response was not used."));
    }
  });

  bus.on("options", (ev) => {
    optionsSeq = ev.payload.options_seq ?? null;
    const n = ev.payload.options?.length || 0;
    add(entry("narration", ev.t, "list", h("div", {},
      h("p", {}, `${n} costed options and the do-nothing baseline are ready for your decision.`),
      h("button", { class: "btn btn-sm btn-primary", type: "button", on: { click: () => onOpenOptions?.() } }, "Review options"))));
  });

  bus.on("option_decision", (ev) => {
    const p = ev.payload;
    if (p.options_seq !== undefined && (p.options_seq ?? null) !== optionsSeq) return;
    const approved = p.decision === "approved";
    add(entry("decision", ev.t, "user", h("p", {},
      h("strong", {}, approved ? "You approved " : "You rejected "), p.option_label || p.option_id, p.note ? `. ${p.note}` : "."),
    { decision: p.decision }));
  });

  bus.on("action_draft", (ev) => {
    const p = ev.payload;
    const verb = `Drafted ${(DRAFT_LABEL[p.type] || "draft").toLowerCase()}`;
    add(entry("narration", ev.t, DRAFT_ICON[p.type] || "memo", h("div", {},
      h("p", {}, `${verb} for ${p.recipient}: “${p.subject}”. Waiting for your approval in the Outbox.`),
      h("button", { class: "btn btn-sm", type: "button", on: { click: () => onOpenOutbox?.() } }, "Open outbox"))));
  });

  bus.on("action_decision", (ev) => {
    const p = ev.payload;
    add(entry("decision", ev.t, "user", h("p", {},
      h("strong", {}, p.decision === "approved" ? "You approved " : "You rejected "),
      p.label || p.action_id, p.decision === "approved" ? " (draft only; nothing was published or sent)." : "."), { decision: p.decision }));
  });

  bus.on("report", (ev) => {
    sawReport = true;
    const card = h("div", { class: "report-card" },
      aiLabel("report"),
      renderMarkdown(ev.payload.markdown),
      h("div", { class: "report-actions" },
        h("button", { class: "btn btn-sm btn-primary", type: "button", on: { click: () => onOpenReport?.(ev.payload.markdown) } }, icon("external", 16), "Open management summary")));
    add(entry("report", ev.t, "check", card));
  });

  bus.on("notice", (ev) => {
    const { level = "info", text } = ev.payload;
    add(entry("notice", ev.t, level === "error" ? "alert" : level === "warn" ? "alert" : "info", renderInline(text, h("span")), { level }));
  });

  bus.on("run_end", (ev) => {
    const { status, reason } = ev.payload;
    rail.finish(status);
    const text = {
      done: "Run complete.",
      aborted: "Run aborted.",
      error: "Run stopped because of an error.",
      no_findings: "Run complete: no material finding.",
      incomplete: "Run stopped before the workflow was complete."
    }[status] || "Run ended.";
    const canSave = status === "done" && sawReport && runMeta?.mode === "live" && runMeta?.entry === "scenario";
    // Facts for completed runs (the audit has every event up to this one).
    let facts = null;
    if (["done", "no_findings", "incomplete"].includes(status)) {
      try { facts = describeRunFacts(computeRunFacts(auditRows(), ev)); } catch (e) { console.error("[Timetable Translator] run facts failed:", e); }
    }
    add(entry("notice", ev.t, status === "done" || status === "no_findings" ? "check" : "stop", h("div", {},
      h("span", {}, h("strong", {}, text), reason ? ` ${reason}` : ""),
      facts ? h("div", { class: "run-facts" }, h("strong", {}, runMeta?.mode === "simulation" ? "Replay facts: " : "Run facts: "), facts) : null,
      canSave ? h("div", { class: "entry-actions" },
        h("button", { class: "btn btn-sm", type: "button", title: "Download this run as a simulation script that can replace the scripted replay of this scenario", on: { click: () => onSaveSimulation?.() } }, icon("download", 16), "Save run as simulation")) : null),
    { level: status === "error" ? "error" : "info" }));
    for (const el of byMsg.values()) { el.classList.remove("streaming"); el.removeAttribute("aria-busy"); }
  });

  function reset(empty = true) {
    byMsg.clear();
    byCall.clear();
    entries = 0;
    lastPhase = null;
    runMeta = null;
    sawReport = false;
    optionsSeq = null;
    follow = true;
    jumpBtn.hidden = true;
    watermark.hidden = true;
    log.dataset.sim = "false";
    rail.reset();
    if (empty) showEmpty(); else clear(log);
  }

  let storedSize = null;
  try { storedSize = localStorage.getItem(TEXT_SIZE_KEY); } catch { /* storage unavailable */ }
  applySize(storedSize === "large");
  showEmpty();
  return { reset };
}

// ---------------------------------------------------------------------------------------------

function renderParagraph(raw) {
  let text = raw.replace(/^\*\*([^*]+?:)\*\*\s*/, "$1 ");
  for (const rule of LABELS) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const rest = text.slice(m[0].length);
    const label = m[1][0].toUpperCase() + m[1].slice(1);
    const p = h("p", { class: "para", dataset: { kind: rule.kind } }, h("span", { class: "tag" }, `${label}:`));
    if (rule.kind === "revised") {
      const arrow = rest.search(/\s(→|->)\s/);
      if (arrow > 0) {
        const old = rest.slice(0, arrow);
        const after = rest.slice(arrow).replace(/^\s(→|->)\s/, "");
        p.append(renderInline(old, h("span", { class: "struck" })), h("span", { class: "arrow", "aria-label": "replaced by" }, "→"), renderInline(after, h("span", { class: "amended" })));
        return p;
      }
    }
    renderInline(rest, p);
    return p;
  }
  return renderInline(text, h("p", { class: "para" }));
}

function argsSummary(name, input) {
  if (!input || typeof input !== "object") return "";
  if (name === "sim_sync") {
    const trains = Array.isArray(input.train_ids) ? input.train_ids : [];
    const v = (input.variants || []).length;
    return [input.label ? `"${trim(input.label, 48)}"` : null, trains.length ? trim(trains.join(", "), 40) : null,
      input.channels?.length ? `channels ${input.channels.join(", ")}` : null, input.stops?.length ? `stops ${input.stops.join(", ")}` : null,
      input.what_if ? "what-if" : null, v ? `${v} variant${v > 1 ? "s" : ""}` : null].filter(Boolean).join(", ");
  }
  const parts = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || v === "") continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k}=${trim(s, 56)}`);
  }
  return parts.join(", ");
}

function trim(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatJson(value) {
  if (value === undefined) return "";
  let s;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    s = String(value);
  }
  return s.length > 9000 ? `${s.slice(0, 9000)}\n… (truncated for display; full result is in the audit log)` : s;
}

function isUiTool(name) {
  return String(name || "").startsWith("ui_");
}

const GUARD_LABEL = {
  ui_report_alert: "The alert was", ui_mark_mirror: "The mirror update was", ui_propose_options: "The options were",
  ui_await_decision: "The wait was", ui_draft_action: "The draft was", ui_await_approvals: "The wait was",
  ui_final_report: "The management summary was"
};

const DRAFT_ICON = {
  passenger_message: "megaphone", republish_order: "timetable", override_request: "hand",
  staff_brief: "users", hold_request: "clock", memo: "memo"
};

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "#";
  } catch {
    return "#";
  }
}
