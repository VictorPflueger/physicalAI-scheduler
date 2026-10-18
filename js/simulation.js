// Simulation player: replays a run script (data/sim_runs.js) through the same run-event bus the
// live agent uses. Every lookup re-runs the real world-model query and every figure comes from the
// real sync engine, so a simulated run shows exactly what the live agent would compute for the same
// assumptions. Nothing is replayed from outside: the world model, its physical layer and the engine
// are all part of the app. A script captured from a live run ("Save run as simulation",
// js/recorder.js) replays the agent's own words and choices.
//
// Step types (one key per step):
//   state, say, think, tool (ops_*, kfp_*, phys_*: re-executed), recordedTool,
//   sync (reference-case name or {name, spec, label}), alert, mirror, options, awaitOption, draft,
//   awaitActions, report, notice, end

import { bus } from "./events.js";
import { getModel } from "./world.js";
import { simulateSync, compactForModel } from "./sync.js";
import { OPS_TOOLS } from "./ops.js";
import { summarizeToolResult } from "./summaries.js";
import { optionFigures, baselineFigures, decisionEffects, kpiFromResult } from "./payoff.js";
import { syncVars, fillTemplate } from "./sim_vars.js";
import { finalizeDraft, sourceReference } from "./drafts.js";
import { dateWithYear } from "./format.js";
import { EvidenceLog } from "./guards.js";
import { pinToday } from "./clock.js";

const ABORT = Symbol("abort");
const LETTERS = ["A", "B", "C"];

export function createSimulationPlayer({ getSpeed }) {
  let ctx = null;

  async function play(runDef, { scenario }) {
    const recorded = runDef.source === "recorded";
    const run = {
      model: getModel(), scenario, vars: {}, results: {}, lastWithVariants: null, cancelled: false, ended: false,
      msg: 0, call: 0, waiters: new Set(), drafts: new Map(), optionsCallId: null, optionsPayload: null, optionsSource: null,
      decisions: [], poke: null, calculations: 0, evidence: new EvidenceLog(), approvedId: null,
      recorded,
      recordedOn: recorded && runDef.recorded?.at ? dateWithYear(runDef.recorded.at) : null
    };
    ctx = run;
    // A recorded run replays on its recording day, so the operating day it names is the same.
    if (recorded && runDef.recorded?.at) pinToday(runDef.recorded.at);
    // Human decisions are captured from the start of the run, so none is lost while the player is
    // busy narrating (for example when "Approve all" sends several decisions in one go).
    const offs = ["option_decision", "action_decision"].map((type) => bus.on(type, (ev) => receiveDecision(run, ev)));
    try {
      bus.emit("cost_update", { simulated: true, eur: 0, usd: 0, input_tokens: 0, output_tokens: 0, web_searches: 0 });
      await runSteps(run, runDef.steps);
      if (!run.ended && !run.cancelled) end(run, "done");
    } catch (e) {
      if (e === ABORT) return;
      console.error(e);
      bus.emit("notice", { level: "error", text: `Simulation stopped: ${e.message}` });
      end(run, "error", e.message);
    } finally {
      offs.forEach((off) => off());
      if (recorded) pinToday(null);
      if (ctx === run) ctx = null;
    }
  }

  function abort(reason = "Stopped by the user.") {
    if (!ctx || ctx.ended) return;
    const run = ctx;
    run.cancelled = true;
    for (const w of run.waiters) w(ABORT);
    run.waiters.clear();
    end(run, "aborted", reason);
  }

  return { play, abort, isActive: () => !!ctx && !ctx.ended };

  // -------------------------------------------------------------------------------------------

  function end(run, status, reason) {
    if (run.ended) return;
    run.ended = true;
    const state = status === "done" || status === "no_findings" ? "done" : status === "aborted" ? "aborted" : "error";
    bus.emit("state_change", { state });
    bus.emit("run_end", { status, ...(reason ? { reason } : {}) });
  }

  function wait(run, ms) {
    if (run.cancelled) return Promise.reject(ABORT);
    const speed = Math.max(0.25, Number(getSpeed()) || 1);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { run.waiters.delete(cancel); resolve(); }, ms / speed);
      const cancel = () => { clearTimeout(t); reject(ABORT); };
      run.waiters.add(cancel);
    });
  }

  function receiveDecision(run, ev) {
    if (run.ended) return;
    if (ev.type === "action_decision") {
      const id = ev.payload.action_id;
      if (run.drafts.get(id) === "pending") run.drafts.set(id, ev.payload.decision);
    } else {
      run.decisions.push(ev);
    }
    run.poke?.();
  }

  /** Takes the oldest queued option decision that matches, or null. */
  function takeOptionDecision(run, predicate = () => true) {
    const i = run.decisions.findIndex((ev) => predicate(ev));
    return i >= 0 ? run.decisions.splice(i, 1)[0] : null;
  }

  /** Resolves with the first truthy value of test(), re-checked whenever a decision arrives. */
  function waitUntil(run, test) {
    if (run.cancelled) return Promise.reject(ABORT);
    const now = test();
    if (now) return Promise.resolve(now);
    return new Promise((resolve, reject) => {
      const check = () => {
        const v = test();
        if (!v) return;
        if (run.poke === check) run.poke = null;
        run.waiters.delete(cancel);
        resolve(v);
      };
      const cancel = () => {
        if (run.poke === check) run.poke = null;
        reject(ABORT);
      };
      run.poke = check;
      run.waiters.add(cancel);
    });
  }

  async function runSteps(run, steps = []) {
    for (const step of steps) {
      if (run.cancelled) throw ABORT;
      if (run.ended) return;
      await runStep(run, step);
    }
  }

  async function runStep(run, step) {
    if (step.pause) await wait(run, step.pause);

    if (step.state) {
      bus.emit("state_change", { state: step.state });
      await wait(run, 250);
    } else if (step.say) {
      await say(run, fill(run, step.say));
    } else if (step.think) {
      bus.emit("reasoning", { msg_id: `sim-r${++run.msg}`, text: fill(run, step.think), done: true });
      await wait(run, 300);
    } else if (step.tool) {
      await opsTool(run, step.tool, step.input || {});
    } else if (step.recordedTool) {
      await recordedTool(run, step.recordedTool);
    } else if (step.sync) {
      await sync(run, step.sync);
    } else if (step.alert) {
      await uiTool(run, "ui_report_alert", step.alert, () => bus.emit("alert", alertPayload(run, step.alert)));
    } else if (step.mirror) {
      const p = resolveObj(run, step.mirror);
      await uiTool(run, "ui_mark_mirror", p, () => bus.emit("mirror_update", p), 250);
    } else if (step.options) {
      await proposeOptions(run, step.options);
    } else if (step.awaitOption) {
      await awaitOption(run, step.awaitOption);
    } else if (step.draft) {
      await draft(run, step.draft);
    } else if (step.awaitActions) {
      await awaitActions(run);
    } else if (step.report) {
      const markdown = fill(run, step.report);
      // The outcome follows the decision, as in live mode.
      const outcome = step.outcome || (run.approvedId === "baseline" ? "risk_accepted" : run.approvedId ? "response_decided" : null);
      const out = { markdown, ...(outcome ? { outcome } : {}) };
      await uiTool(run, "ui_final_report", out, () => bus.emit("report", out), 600);
    } else if (step.notice) {
      bus.emit("notice", { level: step.notice.level || "info", text: fill(run, step.notice.text) });
      await wait(run, 300);
    } else if (step.end) {
      end(run, step.end === "no_findings" ? "no_findings" : "done");
    }
  }

  async function say(run, text) {
    const id = `sim-n${++run.msg}`;
    await wait(run, 350);
    const words = text.split(/(\s+)/);
    const chunk = 6;
    let out = "";
    for (let i = 0; i < words.length; i += chunk) {
      out += words.slice(i, i + chunk).join("");
      bus.emit("narration", { msg_id: id, text: out, done: false });
      await wait(run, Math.max(40, (words.slice(i, i + chunk).join("").length / 70) * 1000));
    }
    bus.emit("narration", { msg_id: id, text, done: true });
    await wait(run, 300);
  }

  async function opsTool(run, name, input) {
    const call_id = `sim-c${++run.call}`;
    bus.emit("tool_call", { call_id, name, input, server: false });
    await wait(run, 700);
    const fn = OPS_TOOLS[name];
    const result = fn ? fn(run.model, input) : { error: `Unknown tool ${name}` };
    run.evidence.note(name, input, result);
    bus.emit("tool_result", { call_id, name, ok: !result?.error, summary: summarizeToolResult(name, result), result, server: false });
    await wait(run, 350);
  }

  /** A tool call replayed exactly as recorded (used for calls that failed in the live run). */
  async function recordedTool(run, t) {
    const call_id = `sim-c${++run.call}`;
    bus.emit("tool_call", { call_id, name: t.name, input: t.input || {}, server: !!t.server });
    await wait(run, 600);
    bus.emit("tool_result", { call_id, name: t.name, ok: t.ok !== false, summary: t.summary || "Result", result: t.result ?? null, server: !!t.server });
    await wait(run, 300);
  }

  async function sync(run, def) {
    const isRef = typeof def === "string";
    const name = isRef ? def : def.name;
    const spec = isRef ? globalThis.REFERENCE_CASES?.[run.scenario]?.[def] : def.spec;
    if (!spec) throw new Error(`No sync specification "${name}" for ${run.scenario}`);
    const call_id = `sim-c${++run.call}`;
    bus.emit("state_change", { state: "simulating" });
    bus.emit("tool_call", { call_id, name: "sim_sync", input: spec, server: false });
    await wait(run, 1200);
    const res = simulateSync(run.model, structuredClone(spec));
    if (!res.ok) throw new Error(`The sync engine rejected "${name}": ${res.errors.join("; ")}`);
    run.results[name] = res;
    run.calculations += 1;
    if (res.variants?.length) run.lastWithVariants = name;
    Object.assign(run.vars, syncVars(name, res));
    bus.emit("tool_result", { call_id, name: "sim_sync", ok: true, summary: summarizeToolResult("sim_sync", res), result: compactForModel(res), server: false });
    const label = (!isRef && def.label) || (name === "hypothesis" ? "first estimate" : name === "finding" ? "verified" : "latest estimate");
    bus.emit("kpi_update", kpiFromResult(res, label));
    await wait(run, 400);
  }

  function alertPayload(run, a) {
    const p = resolveObj(run, a);
    const evidence = p.basis === "what_if" ? [] : run.evidence.describe(run.model);
    return { ...p, ...(evidence.length ? { evidence } : {}) };
  }

  async function proposeOptions(run, def) {
    const from = def.from || (run.results.finding ? "finding" : run.lastWithVariants);
    const res = run.results[from];
    if (!res || !res.variants?.length) throw new Error("Options need a costed sync result first");
    const call_id = `sim-c${++run.call}`;
    run.optionsCallId = call_id;
    run.optionsSource = res;
    // A recorded run keeps the agent's own order of options; an authored script uses V1–V3.
    const chosen = Array.isArray(def.order) && def.order.length
      ? def.order.map((id) => res.variants.find((v) => v.variant_id === id)).filter(Boolean)
      : res.variants.slice(0, 3);
    const options = chosen.map((v, i) => {
      const t = def.texts?.[v.variant_id] || {};
      return {
        id: v.variant_id, letter: LETTERS[i],
        title: fill(run, t.title || v.name), description: fill(run, t.description || v.actions.join("; ")),
        residual_risk: fill(run, t.residual_risk || ""),
        ...optionFigures(v),
        recommended: v.variant_id === def.recommended
      };
    });
    run.options = options;
    run.optionsSeq = (run.optionsSeq || 0) + 1;
    run.decisions.length = 0; // decisions queued for an earlier set do not count for this one
    run.optionsPayload = {
      call_id, options_seq: run.optionsSeq, horizon_min: res.horizon_min, train_ids: res.train_ids,
      recommended: def.recommended, options,
      baseline: baselineFigures(res, fill(run, def.baseline_description || ""))
    };
    bus.emit("state_change", { state: "options" });
    bus.emit("tool_call", {
      call_id, name: "ui_propose_options", server: false,
      input: { options: options.map((o) => ({ variant_id: o.id, title: o.title, description: o.description, residual_risk: o.residual_risk })), recommended_variant_id: def.recommended, baseline_description: run.optionsPayload.baseline.description }
    });
    await wait(run, 300);
    bus.emit("options", run.optionsPayload);
    await wait(run, 300);
  }

  async function awaitOption(run, def) {
    const rejected = new Set();
    for (;;) {
      bus.emit("state_change", { state: "awaiting_approval" });
      const valid = (e) => (e.payload.options_seq ?? run.optionsSeq) === run.optionsSeq && (e.payload.option_id === "baseline" || (run.options.some((o) => o.id === e.payload.option_id) && !rejected.has(e.payload.option_id)));
      const ev = await waitUntil(run, () => takeOptionDecision(run, valid));
      const { option_id: id, decision } = ev.payload;
      bus.emit("tool_result", { call_id: run.optionsCallId, name: "ui_propose_options", ok: true, server: false, summary: `Human decision: ${decision} ${id}`, result: { decision, option_id: id, decided_by: "user" } });
      if (decision === "approved") {
        const opt = run.options.find((o) => o.id === id);
        run.approvedId = id;
        run.vars["option.letter"] = opt ? opt.letter : "–";
        run.vars["option.title"] = opt ? opt.title : "Do nothing";
        for (const [type, payload] of decisionEffects(run.optionsPayload, id)) bus.emit(type, payload);
        await runSteps(run, def.approved?.[id] || def.approved?.default || []);
        return;
      }
      rejected.add(id);
      const line = def.rejected?.[id];
      if (line) await say(run, fill(run, line));
      if (rejected.size >= run.options.length) {
        await runSteps(run, def.allRejected || [
          { say: "All three options were rejected. Customer information stays as it is; the do-nothing risk stands. You can accept the risk, or reset and run a different analysis." }
        ]);
        if (!def.allRejected) {
          await waitUntil(run, () => takeOptionDecision(run, (e) => e.payload.option_id === "baseline" && e.payload.decision === "approved"));
          run.approvedId = "baseline";
          for (const [type, payload] of decisionEffects(run.optionsPayload, "baseline")) bus.emit(type, payload);
          await runSteps(run, def.approved?.baseline || def.approved?.default || []);
        }
        return;
      }
    }
  }

  async function draft(run, d) {
    const action_id = `sim-a${run.drafts.size + 1}`;
    const type = d.type || "passenger_message";
    // The same finalisation as the live tool: source reference, mock line and footer added in code.
    const p = {
      action_id, type, recipient: fill(run, d.recipient), subject: fill(run, d.subject),
      body: finalizeDraft(type, fill(run, d.body || ""), sourceReference(run.optionsSource)), status: "pending"
    };
    run.drafts.set(action_id, "pending");
    bus.emit("state_change", { state: "executing" });
    await uiTool(run, "ui_draft_action", { type: p.type, recipient: p.recipient, subject: p.subject, body: p.body }, () => bus.emit("action_draft", p), 500);
  }

  async function awaitActions(run) {
    const pending = () => [...run.drafts.values()].filter((s) => s === "pending").length;
    if (pending()) {
      bus.emit("state_change", { state: "awaiting_approval" });
      bus.emit("notice", { level: "info", text: `Waiting for your approval of ${pending()} draft${pending() === 1 ? "" : "s"} in the Outbox.` });
    }
    await waitUntil(run, () => pending() === 0);
    const all = [...run.drafts.values()];
    run.vars["actions.total"] = String(all.length);
    run.vars["actions.approved"] = String(all.filter((s) => s === "approved").length);
    run.vars["actions.rejected"] = String(all.filter((s) => s === "rejected").length);
    bus.emit("state_change", { state: "executing" });
    await wait(run, 300);
  }

  async function uiTool(run, name, input, effect, delay = 450) {
    const call_id = `sim-c${++run.call}`;
    bus.emit("tool_call", { call_id, name, input: resolveObj(run, input), server: false });
    await wait(run, delay);
    effect();
    bus.emit("tool_result", { call_id, name, ok: true, server: false, summary: "Done", result: { ok: true } });
    await wait(run, 250);
  }

  // ---- placeholders ---------------------------------------------------------------------------

  function fill(run, text) {
    return fillTemplate(run.vars, text);
  }

  function resolveObj(run, obj) {
    if (typeof obj === "string") return fill(run, obj);
    if (Array.isArray(obj)) return obj.map((x) => resolveObj(run, x));
    if (obj && typeof obj === "object") return Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, resolveObj(run, x)]));
    return obj;
  }
}
