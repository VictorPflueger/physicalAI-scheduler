// Integrity checks for simulation scripts (data/sim_runs.js), run in Diagnostics and in
// tools/check_world.mjs. They make sure a scripted replay can never show an invented fact or a
// broken path on stage, and hold every script to the live agent's guardrails (js/guards.js):
//   - every step is a known type; tools, ids and sync specifications are valid;
//   - every {{placeholder}} resolves from an engine result at that point of the script, and every
//     timetable fact written (time, platform, minutes, train, passengers) matches a fact a tool
//     returned, by the same scopes as live mode (a passenger message may quote only the world model
//     and the result the options rest on, never a what-if);
//   - a verified alert passes the live rule: two distinct sources, and for every train the source,
//     the published view and a corroborating physical observation;
//   - the verification pattern is present (hypothesis, a visible "Revised:" self-correction) with at
//     least 8 visible tool calls;
//   - options have texts for exactly the engine's three variants of a result from the source, and
//     every approval path drafts only what the approved option contains, waits for the outbox
//     decisions, reports with the matching outcome and ends;
//   - reports are marked as simulated or recorded, never as live.
// Recorded scripts (captured live runs) are held to the same rules for what the live guardrails
// audited (alerts, options, drafts, reports); their narration is the model's own and is not
// audited. A recording made with another world or engine version is reported as stale.

import { simulateSync, ENGINE_VERSION } from "./sync.js";
import { syncVars, unresolvedKeys, fillTemplate } from "./sim_vars.js";
import { OPS_TOOLS } from "./ops.js";
import { findTrain, findPoint } from "./world.js";
import { DRAFT_TYPES } from "./drafts.js";
import { EvidenceLog, FactLedger, verifiedAlertError, draftError, reportOutcome } from "./guards.js";

const KINDS = ["state", "say", "think", "tool", "recordedTool", "sync", "alert", "mirror", "options", "awaitOption", "draft", "awaitActions", "report", "notice", "end"];
const STATES = new Set(["scanning", "diagnosing", "verifying", "simulating", "options", "awaiting_approval", "executing"]);
const MIRROR_STATES = new Set(["affected", "at_risk", "resolved", "neutral"]);
const BROKEN = /\b(undefined|NaN|null)\b/;

/** Checks for every preset scenario's script. Returns [{name, ok, detail}]. */
export function checkSimRuns(model, simRuns = {}, scenarios = [], referenceCases = {}) {
  const checks = [];
  for (const sc of scenarios) {
    const def = simRuns[sc.id];
    if (!def) {
      checks.push({ name: `Simulation ${sc.number}: script present`, ok: false, detail: `no script for ${sc.id}` });
      continue;
    }
    const r = checkSimRun(model, sc.id, def, referenceCases[sc.id] || {});
    checks.push({
      name: `Simulation ${sc.number}: script valid (${def.source === "recorded" ? "recorded live run" : "authored"})`,
      ok: r.errors.length === 0,
      detail: r.errors.length ? r.errors.slice(0, 3).join(" | ") : r.summary
    });
  }
  return checks;
}

/** Validates one script. Returns { errors: string[], summary }. */
export function checkSimRun(model, scenarioId, def, rc = {}) {
  const errors = [];
  const recorded = def?.source === "recorded";
  const stats = { visibleCalls: 0, evidenceAtAlert: null, alerts: 0, hypothesis: false, revised: false, branches: 0, drafts: 0 };
  if (!def || !Array.isArray(def.steps) || !def.steps.length) {
    return { errors: ["the script has no steps"], summary: "" };
  }
  if (recorded) {
    const rv = def.recorded || {};
    const wv = model.world?.meta?.world_version;
    if (rv.world_version && wv && rv.world_version !== wv) errors.push(`recorded with world ${rv.world_version}, this app has world ${wv}: record the run again`);
    if (rv.engine_version && rv.engine_version !== ENGINE_VERSION) errors.push(`recorded with engine ${rv.engine_version}, this app has engine ${ENGINE_VERSION}: record the run again`);
  }

  walk(def.steps, {
    vars: {}, results: {}, lastWithVariants: null, options: null, optionsSource: null,
    ledger: new FactLedger(model), evidence: new EvidenceLog(), approved: null, variant: null
  }, "main", true);

  if (!recorded) {
    if (stats.visibleCalls < 8) errors.push(`only ${stats.visibleCalls} visible tool calls before the decision (at least 8 expected)`);
    if (!stats.hypothesis) errors.push("no \"Hypothesis:\" narration");
    if (!stats.revised) errors.push("no visible \"Revised:\" self-correction");
  }
  if (!stats.branches) errors.push("no approval path");
  const evidence = stats.evidenceAtAlert || [];
  const summary = `${stats.visibleCalls} tool calls before the decision, evidence: ${evidence.join(", ") || "none"}, ${stats.branches} approval paths, ${stats.drafts} drafts`;
  return { errors, summary };

  function walk(steps, st, path, main) {
    for (const [i, step] of steps.entries()) {
      const where = `${path}[${i}]`;
      const kinds = KINDS.filter((k) => k in step);
      if (kinds.length !== 1) {
        errors.push(`${where}: expected one step type, found ${kinds.join(", ") || "none"}`);
        continue;
      }
      const kind = kinds[0];
      // Placeholders must resolve, and the filled text may only quote facts its scope allows.
      // audited: false for a recorded run's own narration (the live guardrails do not audit it).
      const text = (t, label, scope, { audited = true } = {}) => {
        if (t === undefined || t === null) return;
        const u = unresolvedKeys(st.vars, t);
        if (u.length) { errors.push(`${where} ${label}: {{${u[0]}}} does not resolve here`); return; }
        const filled = fillTemplate(st.vars, t);
        if (!recorded && BROKEN.test(filled)) errors.push(`${where} ${label}: contains "undefined", "NaN" or "null"`);
        // A recorded run's own narration is the model's and is not audited; authored narration is:
        // a script must not type a fact no tool returned.
        if (recorded && !audited) return;
        const bad = st.ledger.unknown(filled, scope);
        if (bad.length) {
          errors.push(recorded
            ? `${where} ${label}: ${bad[0].raw} matches no fact today's tools return (the recording is stale: record the run again)`
            : `${where} ${label}: ${bad[0].raw} is typed, not taken from a tool result it may quote (use a placeholder)`);
        }
      };
      switch (kind) {
        case "state":
          if (!STATES.has(step.state)) errors.push(`${where}: unknown state "${step.state}"`);
          break;
        case "say":
          text(step.say, "narration", "narration", { audited: !recorded });
          if (main && /(^|\n)\s*Hypothesis:/i.test(step.say)) stats.hypothesis = true;
          if (/(^|\n)\s*Revised:/i.test(step.say)) stats.revised = true;
          break;
        case "think":
          text(step.think, "reasoning", "narration", { audited: !recorded });
          break;
        case "tool": {
          const fn = OPS_TOOLS[step.tool];
          if (!fn) { errors.push(`${where}: unknown world-model tool "${step.tool}"`); break; }
          const res = fn(model, step.input || {});
          if (res?.error && !recorded) errors.push(`${where}: ${step.tool} returns an error (${res.error})`);
          if (!res?.error) st.ledger.addFacts(res);
          st.evidence.note(step.tool, step.input, res);
          if (main) stats.visibleCalls += 1;
          break;
        }
        case "recordedTool":
          if (!step.recordedTool?.name) errors.push(`${where}: recorded tool without a name`);
          if (main) stats.visibleCalls += 1;
          break;
        case "sync": {
          const isRef = typeof step.sync === "string";
          const name = isRef ? step.sync : step.sync?.name;
          const spec = isRef ? rc[step.sync] : step.sync?.spec;
          if (!name || !spec) { errors.push(`${where}: sync "${name}" has no specification`); break; }
          const res = simulateSync(model, structuredClone(spec));
          if (!res.ok) { errors.push(`${where}: the engine rejects "${name}": ${res.errors[0]}`); break; }
          st.results[name] = res;
          if (res.variants?.length) st.lastWithVariants = name;
          Object.assign(st.vars, syncVars(name, res));
          st.ledger.addEngine(res);
          if (main) stats.visibleCalls += 1;
          break;
        }
        case "alert": {
          const a = step.alert || {};
          const whatIf = a.basis === "what_if";
          if (!a.title || !a.summary) errors.push(`${where}: alert needs a title and a summary`);
          for (const id of a.train_ids || []) if (!findTrain(model, id)) errors.push(`${where}: unknown train ${id}`);
          for (const id of a.point_ids || []) if (!findPoint(model, id)) errors.push(`${where}: unknown point ${id}`);
          if (!whatIf) {
            const e = verifiedAlertError(model, a, st.evidence);
            if (e) errors.push(`${where}: the verified alert would be refused in live mode: ${e}`);
          }
          text(a.title, "alert title", whatIf ? "alert_what_if" : "alert_verified");
          text(a.summary, "alert summary", whatIf ? "alert_what_if" : "alert_verified");
          if (main && !stats.alerts) stats.evidenceAtAlert = st.evidence.kinds();
          if (main) stats.alerts += 1;
          break;
        }
        case "mirror": {
          const m = step.mirror || {};
          if (!MIRROR_STATES.has(m.state)) errors.push(`${where}: unknown mirror state "${m.state}"`);
          for (const id of m.train_ids || []) if (!findTrain(model, id)) errors.push(`${where}: unknown train ${id}`);
          for (const id of m.point_ids || []) if (!findPoint(model, id)) errors.push(`${where}: unknown point ${id}`);
          if (m.focus !== undefined && !findTrain(model, m.focus)) errors.push(`${where}: the mirror can only focus a train, not "${m.focus}"`);
          if (m.view !== undefined && !["train", "monitor"].includes(m.view)) errors.push(`${where}: unknown mirror view "${m.view}"`);
          break;
        }
        case "options": {
          const o = step.options || {};
          const from = o.from || (st.results.finding ? "finding" : st.lastWithVariants);
          const res = st.results[from];
          if (!res || !res.variants?.length) { errors.push(`${where}: options before a costed sync result`); break; }
          if (res.basis === "what_if") errors.push(`${where}: options from a what-if result (not the source)`);
          if (res.basis === "partial") errors.push(`${where}: options from a partial scope (${(res.left_out || []).join("; ")})`);
          const ids = Array.isArray(o.order) && o.order.length ? o.order : res.variants.slice(0, 3).map((v) => v.variant_id);
          if (!recorded && res.variants.length !== 3) errors.push(`${where}: the sync result has ${res.variants.length} variants, not 3`);
          if (ids.length !== 3) errors.push(`${where}: ${ids.length} options instead of 3`);
          for (const id of ids) if (!res.variants.some((v) => v.variant_id === id)) errors.push(`${where}: option ${id} is not a costed variant`);
          st.ledger.setOptionsSource(res);
          st.optionsSource = res;
          for (const id of ids) {
            const t = o.texts?.[id];
            if (!t?.title || !t?.description) errors.push(`${where}: option ${id} needs a title and a description`);
            text(t?.title, `option ${id} title`, "options");
            text(t?.description, `option ${id} description`, "options");
            text(t?.residual_risk, `option ${id} residual risk`, "options");
          }
          if (!ids.includes(o.recommended)) errors.push(`${where}: recommended "${o.recommended}" is not one of ${ids.join(", ")}`);
          text(o.baseline_description, "baseline description", "options");
          st.options = ids;
          break;
        }
        case "awaitOption": {
          const a = step.awaitOption || {};
          if (!st.options) { errors.push(`${where}: waiting for a decision before options are shown`); break; }
          const approved = a.approved || {};
          if (!recorded) {
            for (const id of [...st.options, "baseline"]) if (!approved[id] && !approved.default) errors.push(`${where}: no path for approving ${id}`);
            for (const id of st.options) if (!a.rejected?.[id]) errors.push(`${where}: no line for rejecting ${id}`);
          }
          for (const [id, line] of Object.entries(a.rejected || {})) text(line, `rejection line ${id}`, "narration", { audited: !recorded });
          for (const [id, branch] of Object.entries(approved)) {
            if (!Array.isArray(branch)) { errors.push(`${where}: approved.${id} is not a step list`); continue; }
            const idx = st.options.indexOf(id);
            const letter = id === "baseline" ? "–" : "ABC"[Math.max(0, idx)];
            const vars = { ...st.vars, "option.letter": letter, "option.title": id };
            const res = st.optionsSource;
            const sub = {
              vars, results: { ...st.results }, lastWithVariants: st.lastWithVariants, options: st.options, optionsSource: res,
              ledger: st.ledger.clone(), evidence: st.evidence.clone(),
              approved: id === "default" ? null : { id, letter: id === "baseline" ? null : letter },
              variant: res?.variants?.find((v) => v.variant_id === id) || null
            };
            walk(branch, sub, `${where}.approved.${id}`, false);
            checkBranch(branch, `${where}.approved.${id}`, id === "default");
          }
          stats.branches += Object.keys(approved).filter((k) => k !== "default").length;
          if (i < steps.length - 1) errors.push(`${where}: steps after the decision belong inside the approval paths`);
          return;
        }
        case "draft": {
          const d = step.draft || {};
          if (!DRAFT_TYPES.includes(d.type)) errors.push(`${where}: draft type "${d.type}"`);
          if (!d.recipient || !d.subject) errors.push(`${where}: draft needs a recipient and a subject`);
          const e = draftError({ type: d.type, approved: st.approved, variant: st.variant });
          if (e) errors.push(`${where}: the draft would be refused in live mode: ${e}`);
          text(d.subject, "draft subject", "draft");
          text(d.body, "draft body", "draft");
          stats.drafts += 1;
          break;
        }
        case "awaitActions":
          Object.assign(st.vars, { "actions.total": "n", "actions.approved": "n", "actions.rejected": "n" });
          break;
        case "report": {
          text(step.report, "report", "report");
          if (/Live agent run/i.test(step.report)) errors.push(`${where}: a simulated report must not call itself a live run`);
          if (!/Simulated run|Recorded live run/i.test(step.report)) errors.push(`${where}: report lacks the simulation marker`);
          const r = reportOutcome({ requested: step.outcome, optionsShown: !!st.options, approved: st.approved });
          if (r.error) errors.push(`${where}: ${r.error}`);
          break;
        }
        case "notice":
          text(step.notice?.text, "notice", "narration", { audited: !recorded });
          break;
        case "end":
          if (!["done", "no_findings"].includes(step.end)) errors.push(`${where}: end must be "done" or "no_findings"`);
          break;
        default:
          break;
      }
    }
  }

  function checkBranch(branch, where, isDefault) {
    const last = branch[branch.length - 1];
    if (!last || !("end" in last)) errors.push(`${where}: the path must end with an end step`);
    if (isDefault) return;
    const kinds = branch.map((s) => KINDS.find((k) => k in s));
    if (!kinds.includes("report")) errors.push(`${where}: the path publishes no report`);
    if (kinds.includes("draft") && kinds.indexOf("awaitActions") < kinds.lastIndexOf("draft")) errors.push(`${where}: drafts after the outbox wait`);
    if (kinds.includes("report") && kinds.includes("draft") && kinds.indexOf("report") < kinds.indexOf("awaitActions")) errors.push(`${where}: report before the outbox decisions`);
  }
}
