// What a scenario's run costs live, before anyone runs it live.
//   playHeadless  plays the scenario's script through the real simulation player (js/simulation.js) at
//                 full speed, with an automatic person who approves the recommended option, or the one
//                 given, and every draft; returns the run's events. It shares the bus with the page's
//                 own run, so the page never plays two runs at once.
//   estimateCost  prices that run at list price, from its own prompts and replies: about four characters
//                 a token, the system prompt and the tools cached after the first call, every new message
//                 written to the cache once and read back on later calls, parallel reads in one call, and
//                 300 thinking tokens a call (the agent thinks before it acts).
// The page and the tests share this module.

import { bus, newRunId } from "./events.js";
import { createSimulationPlayer } from "./simulation.js";
import { toolDefinitions } from "./tools.js";
import { buildSystemPrompt, buildOpeningMessage } from "./prompt.js";
import { usageCostUsd } from "./cost.js";
import { FX_USD_EUR, DEFAULT_MODEL } from "./config.js";
import { getModel } from "./world.js";
import { appToday } from "./clock.js";

export const CHARS_PER_TOKEN = 4;
export const THINKING_PER_CALL = 300;
const ORDER_FREE = (name) => name.startsWith("ops_") || name.startsWith("kfp_") || name.startsWith("phys_");
const tokens = (s) => Math.ceil(String(s || "").length / CHARS_PER_TOKEN);

/**
 * Plays a scenario's script to its end. pick: the option to approve (the recommended one by default),
 * "baseline" to accept the risk, or { reject: [ids], then: id } to reject first; drafts: "approved" or
 * "rejected" for every draft.
 */
export async function playHeadless(scenario, { pick = null, drafts = "approved" } = {}) {
  const player = createSimulationPlayer({ getSpeed: () => Infinity });
  const events = [];
  const runId = newRunId();
  const plan = typeof pick === "object" && pick ? { reject: [...(pick.reject || [])], then: pick.then } : { reject: [], then: pick };
  bus.beginRun({ run_id: runId, mode: "simulation" });
  const off = bus.onAny((ev) => {
    if (ev.run_id !== runId) return;
    events.push(ev);
    const p = ev.payload || {};
    const decide = (id, decision) => setTimeout(() => bus.emit("option_decision", { options_seq: p.options_seq, option_id: id, decision, by: "user" }), 0);
    if (ev.type === "options") {
      plan.seq = p.options_seq;
      plan.recommended = p.recommended;
      if (plan.reject.length) decide(plan.reject.shift(), "rejected");
      else decide(plan.then || p.recommended, "approved");
    }
    // After a rejection the player says so and waits again: the next decision follows.
    if (ev.type === "option_decision" && ev.payload.decision === "rejected") {
      setTimeout(() => {
        const next = plan.reject.length ? [plan.reject.shift(), "rejected"] : [plan.then || plan.recommended, "approved"];
        bus.emit("option_decision", { options_seq: plan.seq, option_id: next[0], decision: next[1], by: "user" });
      }, 0);
    }
    if (ev.type === "action_draft") setTimeout(() => bus.emit("action_decision", { action_id: p.action_id, decision: drafts, by: "user" }), 0);
  });
  bus.emit("run_start", { run_id: runId, mode: "simulation", entry: "scenario", scenario_id: scenario.id, title: scenario.title, seed: scenario.seed });
  try {
    await player.play(globalThis.SIM_RUNS[scenario.id], { scenario: scenario.id });
  } finally {
    off();
    bus.endRun();
  }
  return events;
}

/** The estimated cost of a run in euros, with its usage, at the list price of modelId. */
export function estimateCost(events, scenario, modelId = DEFAULT_MODEL) {
  const model = getModel();
  const today = appToday().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const prefix = tokens(buildSystemPrompt({ model, today })) + tokens(JSON.stringify(toolDefinitions()));
  const opening = tokens(buildOpeningMessage({ entry: "scenario", model, today, seed: scenario.seed, scenarioTitle: scenario.title }));
  // One model call per turn: what the agent says, then its tool calls (independent reads together).
  const turns = [];
  let turn = null;
  const pending = new Map();
  for (const e of events) {
    const p = e.payload || {};
    if (e.type === "narration" && p.done) {
      if (!turn || turn.calls.length) turns.push((turn = { out: 0, calls: [], back: 0 }));
      turn.out += tokens(p.text);
    } else if (e.type === "tool_call") {
      const parallel = turn && turn.calls.length && ORDER_FREE(p.name) && turn.calls.every(ORDER_FREE);
      if (!turn || (turn.calls.length && !parallel)) turns.push((turn = { out: 0, calls: [], back: 0 }));
      turn.calls.push(p.name);
      turn.out += tokens(p.name) + tokens(JSON.stringify(p.input || {}));
      pending.set(p.call_id, turn);
    } else if (e.type === "tool_result") {
      const t = pending.get(p.call_id);
      if (t) t.back += tokens(JSON.stringify(p.result ?? {}));
    }
  }
  turns.push({ out: tokens("The summary is filed; nothing was published."), calls: [], back: 0 });
  let cached = 0;
  let fresh = prefix + opening;
  let usd = 0;
  const total = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, calls: turns.length };
  for (const t of turns) {
    const usage = { input_tokens: 0, cache_creation_input_tokens: fresh, cache_read_input_tokens: cached, output_tokens: t.out + THINKING_PER_CALL };
    usd += usageCostUsd(modelId, usage);
    for (const k of ["cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"]) total[k] += usage[k];
    cached += fresh;
    fresh = t.out + t.back;
  }
  return { ...total, usd, eur: usd * FX_USD_EUR, model: modelId };
}
