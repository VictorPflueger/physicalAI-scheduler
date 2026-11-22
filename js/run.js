// A run as the presenter needs it. The simulation player (js/simulation.js) and the live agent
// (js/agent.js) emit the same events on the bus (js/events.js); digest() reads them in order and sorts
// what happened into the five steps. Pure module: the page feeds it the bus, the tests the events of a
// headless run.
//
// A step follows the run's phase and only moves forward: following the lead is Spot, the physical layer
// Check, the engine Calculate, the options and the decision Propose, the drafts Prepare. A scripted first
// estimate stays in Check, where the simulation player keeps it. Every decision a person takes goes into
// the log, with its time: who approved or rejected what.

import { findPoint } from "./world.js";
import { alignmentData, sensorReadings } from "./align_data.js";

export const STEP_IDS = ["spot", "check", "calculate", "propose", "prepare"];
const PHASE_STEP = { scanning: 0, diagnosing: 0, verifying: 1, simulating: 2, options: 3, awaiting_approval: 3, executing: 4 };

/** The stage of an engine result: a what-if, a first estimate (partial scope), or verified from the source. */
export function basisKeyOf(basis, stage) {
  if (basis === "what_if") return "what_if";
  if (basis === "partial") return "partial";
  return stage === "estimate" ? "estimate" : "verified";
}

export function digest(events) {
  const r = {
    mode: null, scenarioId: null, said: [], calls: [], syncs: [], alert: null, options: null, decision: null,
    rejected: [], drafts: [], report: null, cost: null, end: null, notices: [], log: [], reached: 0, phase: null
  };
  const said = new Map();
  const calls = new Map();
  const dropped = new Set();
  let cursor = 0;
  let pendingKpi = null;
  for (const [seq, e] of events.entries()) {
    const p = e.payload || {};
    switch (e.type) {
      case "run_start":
        r.mode = p.mode;
        r.scenarioId = p.scenario_id || null;
        break;
      case "state_change": {
        const k = PHASE_STEP[p.state];
        // Waiting for the drafts' approval comes after the decision: it stays in Prepare.
        if (k !== undefined && !(p.state === "awaiting_approval" && cursor >= 4)) cursor = Math.max(cursor, k);
        r.phase = p.state;
        break;
      }
      case "narration": {
        let m = said.get(p.msg_id);
        if (!m) { m = { step: cursor, id: p.msg_id, seq }; said.set(p.msg_id, m); r.said.push(m); }
        m.text = p.text;
        m.done = !!p.done;
        break;
      }
      case "tool_call": {
        const c = { step: cursor, id: p.call_id, name: p.name, input: p.input || {}, done: false, ok: false, result: null, seq };
        calls.set(p.call_id, c);
        r.calls.push(c);
        break;
      }
      case "tool_result": {
        const c = calls.get(p.call_id);
        if (!c) break;
        Object.assign(c, { done: true, ok: p.ok !== false && !p.result?.error && p.result?.ok !== false, result: p.result, summary: p.summary || "" });
        if (c.name === "sim_sync" && c.ok && Array.isArray(p.result?.contradictions)) {
          const s = { step: c.step, id: c.id, result: p.result, basisKey: basisKeyOf(p.result.basis, null), kpi: null };
          // The live agent names the stage just before the result; the simulation just after.
          if (pendingKpi) { s.kpi = pendingKpi; s.basisKey = basisKeyOf(pendingKpi.basis, pendingKpi.stage); pendingKpi = null; }
          r.syncs.push(s);
        }
        break;
      }
      case "kpi_update": {
        if (p.decided) break;
        const inFlight = r.calls.some((c) => c.name === "sim_sync" && !c.done);
        const last = r.syncs[r.syncs.length - 1];
        if (inFlight) pendingKpi = p;
        else if (last && !last.kpi) { last.kpi = p; last.basisKey = basisKeyOf(p.basis, p.stage); }
        break;
      }
      case "alert":
        r.alert = { ...p, step: cursor };
        break;
      case "options":
        r.options = p;
        r.rejected = [];
        r.decision = null;
        cursor = Math.max(cursor, 3);
        break;
      case "option_decision": {
        const opt = r.options?.options.find((o) => o.id === p.option_id) || null;
        if (p.decision === "approved") r.decision = { id: p.option_id, letter: opt?.letter || null, at: e.ts || null };
        else r.rejected.push(p.option_id);
        r.log.push({ at: e.ts || null, who: "You", what: p.option_id === "baseline" ? "accepted the risk: nothing is published" : `${p.decision === "approved" ? "approved" : "rejected"} option ${opt?.letter || "?"}: ${opt?.title || ""}` });
        break;
      }
      case "action_draft":
        r.drafts.push({ ...p, status: "pending", step: cursor });
        cursor = Math.max(cursor, 4);
        break;
      case "action_decision": {
        const d = r.drafts.find((x) => x.action_id === p.action_id);
        if (!d || d.status !== "pending") break;
        d.status = p.decision;
        r.log.push({ at: e.ts || null, who: "You", what: `${p.decision} the draft “${d.subject}”` });
        break;
      }
      case "report":
        r.report = { ...p, step: cursor };
        break;
      case "cost_update":
        r.cost = p;
        break;
      case "notice":
        r.notices.push({ ...p, step: cursor, seq });
        break;
      case "attempt_discarded":
        for (const id of [...(p.msg_ids || []), ...(p.call_ids || [])]) dropped.add(id);
        break;
      case "run_end":
        r.end = p;
        break;
      default:
        break;
    }
    r.reached = Math.max(r.reached, cursor);
  }
  r.said = r.said.filter((m) => !dropped.has(m.id) && String(m.text || "").trim());
  r.calls = r.calls.filter((c) => !dropped.has(c.id));
  return r;
}

// ---- what a step shows ------------------------------------------------------------------------------

/** The engine's first and latest results for a train (a first estimate, then the verified one). */
export function results(r, trainId = null, upTo = 4) {
  const own = r.syncs.filter((s) => s.step <= upTo && (!trainId || (s.result.trains || []).some((t) => t.train_id === trainId)));
  return { first: own[0] || null, last: own[own.length - 1] || null };
}

/** The verified result the options rest on: the latest from the source, or the latest of all. */
export function finding(r) {
  const verified = r.syncs.filter((s) => s.basisKey === "verified");
  return verified[verified.length - 1] || null;
}

/** The approved option, or null (also for the accepted risk). */
export const approved = (r) => (r.decision && r.decision.id !== "baseline" ? r.options?.options.find((o) => o.id === r.decision.id) || null : null);

/** Where the run waits for a person: the decision in Propose, the drafts in Prepare, or nowhere. */
export function waitsFor(r) {
  if (r.end) return null;
  if (r.options && !r.decision) return "propose";
  if (r.drafts.some((d) => d.status === "pending")) return "prepare";
  return null;
}

/** The trains a lookup's result is about, and the stations the physical layer was read at. */
function about(model, c) {
  const res = c.result || {};
  if (c.name === "ops_list_changes") return { trains: (res.changes || []).flatMap((ch) => ch.train_ids || []), points: [] };
  if (c.name === "phys_observe") {
    const obs = res.observations || [];
    if (!obs.length) return { trains: [], points: [] };
    return {
      trains: [res.train_id, ...obs.flatMap((o) => o.train_ids || [])].filter(Boolean),
      points: [res.point, ...obs.map((o) => findPoint(model, o.station)?.id)].filter(Boolean)
    };
  }
  return { trains: [res.train_id].filter(Boolean), points: [] };
}

/**
 * The three-column diagram of one train as it stands at the end of a step (js/diagram.js draws it):
 * what the AI has read, what it is reading now, the sensor readings, the engine's latest result and,
 * from Propose on, your decision. Every value comes from js/align_data.js (world model and engine).
 */
export function diagramAt(r, model, trainId, step) {
  const calls = r.calls.filter((c) => c.step <= step);
  const read = { source: false, physical: false, channels: new Set() };
  const reading = { source: false, physical: false, calculating: false, channels: new Set() };
  const observed = new Set();
  for (const c of calls) {
    const input = c.input || {};
    if (!c.done) {
      if (c.name === "sim_sync") reading.calculating = true;
      if (c.name === "ops_get_timetable" || c.name === "ops_list_changes") reading.source = true;
      if (c.name === "phys_observe") reading.physical = true;
      if (c.name === "kfp_get_published") { if (input.channel) reading.channels.add(input.channel); else reading.channels = "all"; }
      continue;
    }
    if (!c.ok) continue;
    const { trains, points } = about(model, c);
    for (const p of points) observed.add(p);
    if (!trains.includes(trainId)) continue;
    if (c.name === "ops_get_timetable" || c.name === "ops_list_changes") read.source = true;
    if (c.name === "phys_observe") read.physical = true;
    if (c.name === "kfp_get_published" && c.result?.channels) for (const ch of Object.keys(c.result.channels)) read.channels.add(ch);
  }
  const sensors = sensorReadings(model, trainId, [...observed]);
  if (sensors.length) read.physical = true;
  const sync = [...r.syncs].reverse().find((s) => s.step <= step && (s.result.trains || []).some((t) => t.train_id === trainId)) || null;
  const data = alignmentData(model, trainId, { result: sync?.result || null, basisKey: sync?.basisKey || null });
  return { data, read, reading, sensors, sync, decision: decisionAt(r, trainId, step), gate: gateAt(r, trainId, step) };
}

/** What your decision did to the train's channels, from Propose on. */
function decisionAt(r, trainId, step) {
  if (step < 3 || !r.decision || !r.options || !(r.options.train_ids || []).includes(trainId)) return null;
  if (r.decision.id === "baseline") return { state: "accepted" };
  const opt = approved(r);
  if (!opt) return null;
  return {
    state: opt.residual_contradictions > 0 ? "at_risk" : "resolved",
    letter: opt.letter,
    residual: opt.misinformed_pax,
    before: r.options.baseline?.misinformed_pax ?? null,
    fromMin: opt.correct_info_from_min,
    syncMin: opt.time_to_sync_min,
    overrides: opt.manual_overrides || 0
  };
}

/** The "You decide" card: nothing yet, your decision, your approval, or what you decided. */
function gateAt(r, trainId, step) {
  if (step < 3 || !r.options) return { state: "idle", text: "Nothing goes out without your approval" };
  if (!r.decision) {
    if (r.end) return { state: "idle", text: "No decision: the run ended" };
    return { state: "yours", text: `Your decision: ${r.options.options.length} options` };
  }
  if (r.decision.id === "baseline") return { state: "accepted", text: "Risk accepted: nothing goes out" };
  const head = `Option ${r.decision.letter} approved`;
  const drafts = r.drafts;
  const pending = drafts.filter((d) => d.status === "pending").length;
  const yes = drafts.filter((d) => d.status === "approved").length;
  if (step >= 4 && pending) return { state: "yours", text: `${head}: ${pending} ${pending === 1 ? "draft waits" : "drafts wait"} for you` };
  if (step >= 4 && drafts.length) return { state: "approved", text: `${head}, ${yes} of ${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"} approved` };
  return { state: "approved", text: head };
}
