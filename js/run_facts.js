// Run facts: a short, factual summary of a finished run, shown on the console's last line and
// included in the audit export. It doubles as the acceptance self-check for a run: time,
// at least 8 visible tool calls, at least one visible verification step, and cost.

import { EVIDENCE_KIND, isEvidence } from "./tools.js";
import { splitParagraphs, labelKind } from "./labels.js";

/**
 * rows: audit rows of the run (events and model_call rows) in order.
 * end: the run_end envelope (its `t` is the run time in ms).
 */
export function computeRunFacts(rows, end = null) {
  const events = rows.filter((r) => r.type !== "model_call");
  const start = events.find((e) => e.type === "run_start");
  const mode = start?.payload?.mode || null;
  const finish = end || [...events].reverse().find((e) => e.type === "run_end") || null;
  const totalMs = Math.max(0, finish?.t ?? events[events.length - 1]?.t ?? 0);

  // Visible tool calls: everything the console lists (ui_* tools show as their effects).
  const calls = events.filter((e) => e.type === "tool_call" && !String(e.payload?.name || "").startsWith("ui_"));
  const byKind = { source: 0, published: 0, physical: 0, engine: 0 };
  for (const c of calls) {
    const n = String(c.payload.name);
    if (n.startsWith("ops_")) byKind.source += 1;
    else if (n.startsWith("kfp_")) byKind.published += 1;
    else if (n.startsWith("phys_")) byKind.physical += 1;
    else if (n === "sim_sync") byKind.engine += 1;
  }

  // Narration paragraphs, once per message (a retried stream repeats a message id).
  const finalText = new Map();
  for (const e of events) if (e.type === "narration" && e.payload?.done) finalText.set(e.payload.msg_id || e.id, String(e.payload.text || ""));
  const paragraphs = [...finalText.values()].flatMap((t) => splitParagraphs(t));
  const kinds = paragraphs.map(labelKind);
  const verificationSteps = kinds.filter((k) => k === "check" || k === "confirmed" || k === "unconfirmed").length;
  const revisions = kinds.filter((k) => k === "revised").length;

  // Evidence gathered before the alert (or in the whole run if there was none), by the same rule the
  // live alert tool applies: a successful lookup of the operations log, the source timetable, the
  // published view, the physical layer, the passengers or the alternatives that found something.
  const alertIdx = events.findIndex((e) => e.type === "alert");
  const evidenceEvents = events.filter((e, i) => (alertIdx < 0 || i < alertIdx) && e.type === "tool_result" && e.payload?.ok !== false &&
    isEvidence(e.payload?.name, e.payload?.result));
  const evidence = evidenceEvents.length;
  const evidenceKinds = [...new Set(evidenceEvents.map((e) => EVIDENCE_KIND[e.payload.name]))];
  const alert = alertIdx >= 0 ? events[alertIdx].payload : null;

  // Time spent waiting for the human (run state awaiting_approval: "Awaiting your decision" or
  // "Awaiting your approval") is not agent time.
  let waitingMs = 0;
  let waitStart = null;
  for (const e of events) {
    if (e.type !== "state_change" && e.type !== "run_end") continue;
    const awaiting = e.type === "state_change" && e.payload?.state === "awaiting_approval";
    if (awaiting && waitStart === null) waitStart = e.t ?? 0;
    else if (!awaiting && waitStart !== null) { waitingMs += Math.max(0, (e.t ?? 0) - waitStart); waitStart = null; }
  }
  if (waitStart !== null) waitingMs += Math.max(0, totalMs - waitStart);
  const agentMs = Math.max(0, totalMs - waitingMs);

  // Refused ui_* calls: a guardrail in code sent the agent back (alert evidence, fact audit …).
  const guardrails = events.filter((e) => e.type === "tool_result" && e.payload?.ok === false && String(e.payload?.name || "").startsWith("ui_")).length;

  const approved = events.find((e) => e.type === "option_decision" && e.payload?.decision === "approved");
  const drafts = events.filter((e) => e.type === "action_draft").length;
  const decisions = events.filter((e) => e.type === "action_decision");
  const cost = [...events].reverse().find((e) => e.type === "cost_update")?.payload || null;

  return {
    mode,
    status: finish?.payload?.status || "running",
    run_time_s: Math.round(totalMs / 1000),
    agent_time_s: Math.round(agentMs / 1000),
    waiting_time_s: Math.round(waitingMs / 1000),
    model_calls: rows.filter((r) => r.type === "model_call").length,
    tool_calls: calls.length,
    tool_calls_by_kind: byKind,
    verification_steps: verificationSteps,
    revisions,
    guardrail_refusals: guardrails,
    evidence_before_alert: evidence,
    evidence_kinds: evidenceKinds,
    alert_basis: alert ? (alert.basis || "verified") : null,
    approved_option: approved?.payload?.option_id || null,
    drafts,
    drafts_approved: decisions.filter((e) => e.payload?.decision === "approved").length,
    drafts_rejected: decisions.filter((e) => e.payload?.decision === "rejected").length,
    cost_eur: cost && !cost.simulated ? Math.round((Number(cost.eur) || 0) * 100) / 100 : 0,
    checks: {
      agent_time_under_4_min: agentMs < 240000,
      at_least_8_tool_calls: calls.length >= 8,
      verification_visible: verificationSteps >= 1 && evidence >= 1
    }
  };
}

/** One readable sentence for the console. */
export function describeRunFacts(f) {
  const mins = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
  const kinds = [
    f.tool_calls_by_kind.source ? `${f.tool_calls_by_kind.source} source` : null,
    f.tool_calls_by_kind.published ? `${f.tool_calls_by_kind.published} published view` : null,
    f.tool_calls_by_kind.physical ? `${f.tool_calls_by_kind.physical} physical layer` : null,
    f.tool_calls_by_kind.engine ? `${f.tool_calls_by_kind.engine} sync calculation${f.tool_calls_by_kind.engine === 1 ? "" : "s"}` : null
  ].filter(Boolean).join(", ");
  const time = f.mode === "simulation"
    ? `${mins(f.run_time_s)} replay`
    : `${mins(f.agent_time_s)} agent time${f.waiting_time_s ? ` plus ${mins(f.waiting_time_s)} waiting for your decisions` : ""}`;
  const verify = `${f.verification_steps} verification step${f.verification_steps === 1 ? "" : "s"}, ${f.revisions} revision${f.revisions === 1 ? "" : "s"}${f.guardrail_refusals ? `, ${f.guardrail_refusals} guardrail refusal${f.guardrail_refusals === 1 ? "" : "s"}` : ""}`;
  const cost = f.mode === "simulation" ? "no cost (simulated)" : `cost €${f.cost_eur.toFixed(2)}`;
  return `${time}; ${f.tool_calls} tool call${f.tool_calls === 1 ? "" : "s"}${kinds ? ` (${kinds})` : ""}; ${verify}; ${cost}.`;
}
