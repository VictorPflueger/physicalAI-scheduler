// The live agent's tools: JSON Schemas sent to the model, and executors that run in the browser.
// Every UI effect is emitted on the run-event bus, exactly as the simulation player does it.
//
// Guardrails enforced in code, not only in the prompt (the policy lives in js/guards.js and the
// simulation script checker applies the same rules to every scripted replay):
//   - the AI keeps no timetable of its own: every fact comes from the world model (the source
//     timetable, the operations log, the published channels, the physical layer, the passengers) or
//     from the deterministic sync engine, which derives the customer view from the source;
//   - option figures come from the latest sim_sync result (by variant_id), never from a what-if or
//     a partial scope, and the recommendation must be one of the three options;
//   - a decision belongs to the options it was taken on: a click on an older set is ignored, and
//     options cannot be proposed again once one was approved;
//   - a verified alert needs two distinct sources and, for every train it names, the source record,
//     the published customer view and a corroborating physical observation, all read in this run;
//   - every outbound action is a draft carrying the AI footer and its source reference; drafts only
//     follow an approval and only of the kinds the approved option contains; the final report waits
//     for every draft and its outcome follows the decision;
//   - every timetable fact written into an alert, an option card, a draft or the report (times,
//     platforms, minutes, train numbers, passenger counts) must match a fact a tool returned, by
//     scope: a passenger message may quote only the world model and the result the options rest on.

import { ACTION_TYPES, MESSAGE_CHANNELS, OVERRIDE_CHANNELS, simulateSync, compactForModel } from "./sync.js";
import { OPS_TOOLS } from "./ops.js";
import { summarizeToolResult } from "./summaries.js";
import { optionFigures, baselineFigures, decisionEffects, kpiFromResult } from "./payoff.js";
import { finalizeDraft, sourceReference, DRAFT_TYPES } from "./drafts.js";
import { EVIDENCE_KIND, isEvidence, EvidenceLog, FactLedger, verifiedAlertError, draftError, reportOutcome, draftsForVariant, distinctSources, OUTCOMES } from "./guards.js";
import { isKnownId, findTrain, findPoint, DATA_CHANNELS } from "./world.js";

export { EVIDENCE_KIND, isEvidence, OUTCOMES };
export const LIVE_REPORT_FOOTER = "*Live agent run. The trains, times, passenger figures and sensor readings are fictional; the stations and lines are real; every figure comes from the deterministic sync engine and every fact was checked against the source.*";
const LETTERS = ["A", "B", "C"];
const ids = (description) => ({ type: "array", items: { type: "string" }, description });
const FACT_RETRIES = 2;

// ---- schemas ----------------------------------------------------------------------------------

const ACTION_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ACTION_TYPES },
    train_ids: ids("republish: which of the trains to re-publish (default: all in train_ids)."),
    channels: { type: "array", items: { type: "string", enum: [...new Set([...DATA_CHANNELS, ...MESSAGE_CHANNELS])] }, description: `republish: data channels (${DATA_CHANNELS.join(", ")}; default all). message: ${MESSAGE_CHANNELS.join(", ")}. override: ${OVERRIDE_CHANNELS.join(", ")} only.` },
    connection_id: { type: "string", description: "hold_request: the connection (from ops_get_passengers)." }
  },
  required: ["type"]
};

const DEFINITIONS = [
  {
    name: "ops_get_overview",
    description: "Operating snapshot: the time (frozen), the corridor's stations (Ril 100 codes) and lines, the trains in the window with their source version and the operational changes that touch them, today's operational changes, and the publication cycle. It does not say which customer channels are behind. Call first when you need ids.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "ops_list_changes",
    description: "The operations log (part of the source): dispatch decisions, construction timetable orders (Fplo), vehicle changes, each with its record text in operating language, the trains it touches and the source version it created. Filter by train, point, kind or since (HH:MM).",
    input_schema: {
      type: "object",
      properties: {
        train: { type: "string", description: "Train id (T-618) or number (\"ICE 618\")." },
        point: { type: "string", description: "Ril 100 code (KK) or station name." },
        kind: { type: "string", enum: ["platform", "diversion", "terminate", "consist", "fplo"] },
        since: { type: "string", description: "HH:MM" }
      }
    }
  },
  {
    name: "ops_get_timetable",
    description: "The source timetable (Betriebsfahrplan) of one train: every operating point with arrival, departure or pass time to a tenth of a minute, track, activity (passenger stop, operational stop/Betriebshalt, pass), remarks, the coach order, and the version history. Defaults to the current version.",
    input_schema: { type: "object", properties: { train: { type: "string" }, version: { type: "integer" } }, required: ["train"] }
  },
  {
    name: "kfp_get_published",
    description: "What passengers are told now: the published customer timetable (Kundenfahrplan) of one train per channel (planner = journey planner and app, displays, announcements, coach = coach order), with the source version each channel was generated from, when, and the publication note that explains a lag.",
    input_schema: { type: "object", properties: { train: { type: "string" }, channel: { type: "string", enum: DATA_CHANNELS } }, required: ["train"] }
  },
  {
    name: "phys_observe",
    description: "The physical layer, an independent second source: interlocking and point-machine diagnostics, routes set, train positions, door logs, platform lengths, coach-order readings and measured section times, for a train and/or a point; plus the train's position now and the point's platform lengths. Each observation says which operational change or timetable fact it corroborates (supports).",
    input_schema: { type: "object", properties: { train: { type: "string" }, point: { type: "string" } } }
  },
  {
    name: "ops_get_passengers",
    description: "Passengers of one train per stop (boarding, alighting, seat reservations) and its connections at stations (with connection ids for hold requests).",
    input_schema: { type: "object", properties: { train: { type: "string" } }, required: ["train"] }
  },
  {
    name: "ops_find_alternatives",
    description: "Alternative journeys on today's source timetable (diversions, cuts and replacement buses included): from a point, to a point, departing after a time, up to two changes. Use it for the routes a passenger message offers.",
    input_schema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" }, after: { type: "string", description: "HH:MM; default the snapshot time." } },
      required: ["from", "to"]
    }
  },
  {
    name: "sim_sync",
    description: [
      "Deterministic sync engine (no LLM maths). For the trains you name it derives what every customer channel should show from the source, compares it with what each channel published, and returns each contradiction (platform, time, stop not served, stop missing, terminus, coach order, connection) with the channels that show it wrong and right, the source version and change, the publication cause and the passengers who rely on it;",
      "then baseline.misinformed_pax (passengers who would act on wrong information if nothing is done; each passenger counted once per stop, so it can be less than the sum over contradictions), the first affected moment, alternatives for passengers whose stop is not served, and for each variant: misinformed_pax, protected_pax, correct_info_from_min, time_to_sync_min (null: not back in sync within the horizon), residual_contradictions, manual_overrides (hand-kept values: a second truth) and effort_min.",
      "Name every train an operational change touches whose customer information is wrong, and leave channels and stops open, or the result is partial (options cannot use it). what_if applies hypothetical changes to a copy of the source (a rumour you have not confirmed); options can never use a what-if.",
      "Action fields: republish (train_ids, channels), message (channels: app_push, displays, announcements, planner), override (channels: displays, announcements), staff, hold_request (connection_id). Errors come back with the field to fix."
    ].join(" "),
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Short description of what you assume." },
        train_ids: ids("Trains to check: ids (T-618) or numbers (\"ICE 618\")."),
        channels: { type: "array", items: { type: "string", enum: DATA_CHANNELS }, description: "Optional: limit to these channels (partial)." },
        stops: ids("Optional: limit to these points (Ril 100 codes; partial)."),
        what_if: {
          type: "object",
          description: "Hypothetical changes not in the source (the result is a labelled what-if).",
          properties: {
            changes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  train: { type: "string" },
                  op: { type: "string", enum: ["set_track", "consist", "shift_after", "terminate_at", "skip"] },
                  point: { type: "string" }, track: { type: "string" }, order: { type: "string", enum: ["standard", "reversed"] }, minutes: { type: "number" }
                },
                required: ["train", "op"]
              }
            }
          }
        },
        variants: {
          type: "array",
          maxItems: 6,
          description: "Response options for the same contradictions. For the decision, pass exactly three with variant_id V1, V2, V3.",
          items: {
            type: "object",
            properties: { variant_id: { type: "string" }, name: { type: "string" }, actions: { type: "array", items: ACTION_SCHEMA } },
            required: ["variant_id", "name", "actions"]
          }
        }
      },
      required: ["train_ids"]
    }
  },
  {
    name: "ui_report_alert",
    description: "Raise a finding alert in the console and mark the trains on the timetable mirror. basis \"verified\" needs two distinct sources and, for every train in train_ids, its source record (ops_get_timetable or ops_list_changes), its published view (kfp_get_published) and a physical observation that corroborates it (phys_observe), all read in this run; basis \"what_if\" labels the alert as an unverified exercise.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
        basis: { type: "string", enum: ["verified", "what_if"], description: "Default verified." },
        summary: { type: "string", description: "Two sentences: what passengers are told, what the source says, and why it matters." },
        sources: {
          type: "array",
          items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } }, required: ["title"] }
        },
        train_ids: ids("Trains concerned."),
        point_ids: ids("Points concerned (Ril 100 codes).")
      },
      required: ["title", "severity", "summary", "train_ids"]
    }
  },
  {
    name: "ui_mark_mirror",
    description: "Colour entities on the timetable mirror: affected (red, contradicts the source), at_risk (amber), resolved (green) or neutral. The mirror already follows your lookups, sim_sync results, alerts and decisions by itself: mark only what those do not show (for example at_risk while you check a train, neutral for a train you ruled out). focus: the train the mirror shows.",
    input_schema: {
      type: "object",
      properties: {
        train_ids: ids("Trains."),
        point_ids: ids("Points (Ril 100 codes)."),
        contradiction_ids: ids("Contradiction ids from sim_sync (e.g. T-618/KK/platform)."),
        state: { type: "string", enum: ["affected", "at_risk", "resolved", "neutral"] },
        focus: { type: "string", description: "Optional: show this train on the mirror." },
        view: { type: "string", enum: ["train", "monitor"], description: "Optional: the train view or the sync monitor of all trains." }
      },
      required: ["state"]
    }
  },
  {
    name: "ui_propose_options",
    description: "Show exactly three response options plus the do-nothing baseline and wait for the human decision. Passenger figures, minutes and overrides are filled in from your latest sim_sync result by variant_id, so run sim_sync with exactly these three variants first (from the source, the full scope, not a what-if). On screen the options appear as A, B and C in the order you pass them. Returns the decision.",
    input_schema: {
      type: "object",
      properties: {
        options: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              variant_id: { type: "string", description: "V1, V2 or V3 from the latest sim_sync call." },
              title: { type: "string", description: "Up to 6 words." },
              description: { type: "string", description: "One sentence of at most 20 words: what we would do. The card shows the engine's figures beside it." },
              residual_risk: { type: "string", description: "One sentence of at most 15 words: what can still go wrong." }
            },
            required: ["variant_id", "title", "description", "residual_risk"]
          }
        },
        recommended_variant_id: { type: "string" },
        baseline_description: { type: "string", description: "One sentence: what happens if we do nothing." }
      },
      required: ["options", "recommended_variant_id", "baseline_description"]
    }
  },
  {
    name: "ui_await_decision",
    description: "After an option was rejected, wait for the human's next decision on the remaining options or on accepting the risk. Returns the decision.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "ui_draft_action",
    description: "Queue one outbound action as a draft in the Outbox, pending human approval. Nothing is ever published or sent. Only the kinds of action the approved option contains; after the risk was accepted, only an internal memo. Use times, platforms, stops and passenger figures from tool results only. The source reference and the safety lines are added in code.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: DRAFT_TYPES, description: "passenger_message: the texts for the channels (app push, displays, announcements, journey-planner note), German first, then English; republish_order: to the timetable publication team, re-publish named trains from the source; override_request: hand-set values on displays and announcements; staff_brief: station staff and train crew; hold_request: ask dispatch to hold a connection; memo: internal note." },
        recipient: { type: "string", description: "Team and function, e.g. \"Passenger information desk\", \"Timetable publication team (customer timetable)\"." },
        subject: { type: "string" },
        body: { type: "string", description: "Plain text. Passenger messages: one block per channel; display texts short; announcements as spoken; German, then English." }
      },
      required: ["type", "recipient", "subject", "body"]
    }
  },
  {
    name: "ui_await_approvals",
    description: "Wait until the human has approved or rejected every draft in the Outbox. Returns each decision. Call after the last ui_draft_action and before ui_final_report.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "ui_final_report",
    description: "Publish the management summary (Markdown) and end the workflow. Every figure and timetable fact must come from tool results.",
    input_schema: {
      type: "object",
      properties: {
        markdown: { type: "string" },
        outcome: { type: "string", enum: OUTCOMES, description: "Follows the decision: response_decided after an approved option, risk_accepted after accepting the risk; without options, no_material_finding or monitoring." }
      },
      required: ["markdown"]
    }
  }
];

/** Tool list for a request (no web search: the world model and the physical layer are the sources). */
export function toolDefinitions() {
  return DEFINITIONS.map((d) => ({ ...d }));
}

export const UI_BLOCKING_TOOLS = new Set(["ui_propose_options", "ui_await_decision", "ui_await_approvals"]);

// ---- executors ----------------------------------------------------------------------------------

/**
 * Creates the executor for one run.
 * ctx: { model, emit, waitUntil(test) → Promise, takeOptionDecision(pred) → ev|null, drafts: Map, onPhase(state) }
 * execute() resolves { content (string for tool_result), isError, result (object for the UI), summary }.
 */
export function createToolbox(ctx) {
  const run = {
    calculations: 0,
    lastResult: null,          // latest successful sim_sync result
    lastWithVariants: null,    // latest successful result that costed variants
    optionsSource: null,       // the result the options on screen were costed on
    options: null,             // options shown to the human
    optionsPayload: null,      // the full "options" event payload (for the approval payoff)
    optionsSeq: 0,             // which set of options a decision belongs to
    rejected: new Set(),
    approvedOption: null,      // { id, label, letter }
    alertBasis: null,
    evidence: new EvidenceLog(),
    ledger: new FactLedger(ctx.model),
    factRejections: { draft: 0, report: 0, options: 0, alert: 0 },
    reported: false,
    outcome: null
  };

  const handlers = {
    ...Object.fromEntries(Object.entries(OPS_TOOLS).map(([name, fn]) => [name, (i) => fn(ctx.model, i || {})])),
    sim_sync: simSync,
    ui_report_alert: reportAlert,
    ui_mark_mirror: markMirror,
    ui_propose_options: proposeOptions,
    ui_await_decision: awaitDecision,
    ui_draft_action: draftAction,
    ui_await_approvals: awaitApprovals,
    ui_final_report: finalReport
  };

  async function execute(name, input = {}) {
    const fn = handlers[name];
    if (!fn) return done({ error: `Unknown tool "${name}".` }, true, name);
    let result;
    try {
      result = await fn(input || {});
    } catch (e) {
      // Cancellation (the agent's abort symbol or a fetch AbortError) ends the run, not the tool.
      if (typeof e === "symbol" || e?.name === "AbortError") throw e;
      console.error(`[Timetable Translator] tool ${name} failed:`, e);
      result = { error: `The tool failed unexpectedly (${String(e?.message || "unknown error")}). Try different input or another tool.` };
    }
    const isError = !!(result && (result.error || result.ok === false));
    if (!isError && !name.startsWith("ui_") && name !== "sim_sync") {
      run.ledger.addFacts(result);
      run.evidence.note(name, input, result);
    }
    return done(result, isError, name);
  }

  function done(result, isError, name) {
    const forModel = name === "sim_sync" && result?.ok ? compactForModel(result) : result;
    return {
      content: JSON.stringify(forModel),
      isError,
      result: forModel,
      summary: summarizeToolResult(name, forModel)
    };
  }

  // -- sim_sync -------------------------------------------------------------------------------------
  function simSync(spec) {
    const res = simulateSync(ctx.model, spec);
    if (!res.ok) return res;
    run.calculations += 1;
    run.lastResult = res;
    run.ledger.addEngine(res);
    if (res.variants?.length) run.lastWithVariants = res;
    ctx.emit("kpi_update", kpiFromResult(res, run.calculations === 1 ? "first estimate" : "verified"));
    return res;
  }

  // -- alerts and mirror ------------------------------------------------------------------------------
  function reportAlert(i) {
    const basis = i.basis === "what_if" ? "what_if" : "verified";
    if (basis === "verified") {
      const e = verifiedAlertError(ctx.model, i, run.evidence);
      if (e) return { error: e };
    }
    const scope = basis === "verified" ? "alert_verified" : "alert_what_if";
    let title = String(i.title || "Customer information contradicts the source").slice(0, 160);
    let summary = String(i.summary || "").slice(0, 600);
    const audit = factCheck(`${title}\n${summary}`, "alert", scope, "ui_report_alert");
    if (audit.reject) return audit.reject;
    if (audit.flag) { title = mark(title, audit.bad); summary = mark(summary, audit.bad); }
    run.alertBasis = basis;
    const sources = distinctSources(i.sources);
    const trainIds = knownTrains(i.train_ids);
    const pointIds = (Array.isArray(i.point_ids) ? i.point_ids : []).map((p) => findPoint(ctx.model, p)?.id).filter(Boolean).slice(0, 20);
    const unknown = (Array.isArray(i.train_ids) ? i.train_ids : []).filter((r) => !findTrain(ctx.model, r));
    ctx.emit("alert", {
      title, basis,
      severity: ["critical", "high", "medium", "low"].includes(i.severity) ? i.severity : "high",
      summary,
      sources: sources.slice(0, 6).map((s) => ({ title: String(s.title || s.url).slice(0, 200), url: safeHttpUrl(s.url) })),
      evidence: run.evidence.describe(ctx.model),
      train_ids: trainIds, point_ids: pointIds
    });
    return { ok: true, shown: true, evidence_kinds: run.evidence.kinds(), ...(unknown.length ? { ignored_unknown_trains: unknown } : {}) };
  }

  function markMirror(i) {
    const state = ["affected", "at_risk", "resolved", "neutral"].includes(i.state) ? i.state : "affected";
    const m = ctx.model;
    const p = {
      train_ids: knownTrains(i.train_ids),
      point_ids: (Array.isArray(i.point_ids) ? i.point_ids : []).map((x) => findPoint(m, x)?.id).filter(Boolean).slice(0, 40),
      contradiction_ids: (Array.isArray(i.contradiction_ids) ? i.contradiction_ids : []).map(String).filter((x) => /^T-[\w-]+\/[A-Z]+\/[a-z_]+$/.test(x)).slice(0, 60),
      state
    };
    if (i.focus) {
      const t = findTrain(m, i.focus);
      if (t) p.focus = t.id;
    }
    if (i.view === "monitor" || i.view === "train") p.view = i.view;
    ctx.emit("mirror_update", p);
    const asked = [...(i.train_ids || []), ...(i.point_ids || []), ...(i.contradiction_ids || [])].length;
    const marked = p.train_ids.length + p.point_ids.length + p.contradiction_ids.length;
    return { ok: true, marked, ...(marked < asked ? { hint: "Some ids were not recognised: train_ids take trains (T-618 or \"ICE 618\"), point_ids Ril 100 codes (KK), contradiction_ids the ids sim_sync returned." } : {}) };
  }

  function knownTrains(list) {
    return [...new Set((Array.isArray(list) ? list : []).map((r) => findTrain(ctx.model, r)?.id).filter(Boolean))].slice(0, 20);
  }

  // -- options and decisions --------------------------------------------------------------------------
  async function proposeOptions(i) {
    if (run.approvedOption) return { error: `A decision was already taken: ${run.approvedOption.label}. Continue with its drafts; the options cannot be proposed again.` };
    const src = run.lastWithVariants;
    const list = Array.isArray(i.options) ? i.options : [];
    if (list.length !== 3) return { error: "Exactly three options are required (plus the automatic do-nothing baseline)." };
    if (!src) return { error: "No costed variants yet. Call sim_sync with the trains concerned and exactly three variants (V1, V2, V3) first." };
    if (run.lastResult !== src) {
      return { error: "Your latest sim_sync call has no variants, so the options would be costed against an earlier position. Call sim_sync again with the current trains and exactly three variants (V1, V2, V3), then propose the options." };
    }
    if (src.basis === "what_if") {
      return { error: "Your latest sim_sync result is a what-if (hypothetical changes, not the source). Options must rest on the source: call sim_sync without what_if, then propose the options." };
    }
    if (src.basis === "partial") {
      return { error: `Your latest sim_sync result is partial: it leaves out ${(src.left_out || ["part of the scope"]).join("; ")}. Options must rest on the full scope: call sim_sync again with every affected train and no channel or stop limit, then propose the options.` };
    }
    if (!src.contradictions.length) return { error: "The latest sim_sync result finds no contradiction: customer information matches the source. Report that with ui_final_report (outcome no_material_finding) instead of proposing options." };
    const seen = new Set();
    const options = [];
    for (const [k, o] of list.entries()) {
      const v = src.variants.find((x) => x.variant_id === o.variant_id);
      if (!v) return { error: `variant_id "${o.variant_id}" is not in the latest sim_sync result (has: ${src.variants.map((x) => x.variant_id).join(", ")}).` };
      if (seen.has(v.variant_id)) return { error: `variant_id "${v.variant_id}" is used twice.` };
      seen.add(v.variant_id);
      options.push({
        id: v.variant_id, letter: LETTERS[k],
        title: String(o.title || v.name).slice(0, 90),
        description: String(o.description || v.actions.join("; ")).slice(0, 400),
        residual_risk: String(o.residual_risk || "").slice(0, 300),
        ...optionFigures(v),
        recommended: v.variant_id === i.recommended_variant_id
      });
    }
    if (!options.some((o) => o.recommended)) {
      return { error: `recommended_variant_id "${i.recommended_variant_id ?? ""}" is not one of the options (${options.map((o) => o.id).join(", ")}).` };
    }
    // The texts on the cards may quote only the facts and the figures of this result.
    run.ledger.setOptionsSource(src);
    let baselineText = String(i.baseline_description || "");
    const audit = factCheck([baselineText, ...options.flatMap((o) => [o.title, o.description, o.residual_risk])].join("\n"), "options", "options", "ui_propose_options");
    if (audit.reject) return audit.reject;
    if (audit.flag) {
      for (const o of options) { o.title = mark(o.title, audit.bad); o.description = mark(o.description, audit.bad); o.residual_risk = mark(o.residual_risk, audit.bad); }
      baselineText = mark(baselineText, audit.bad);
    }
    // Decisions queued for an earlier set of options (a click just before this one replaced them) are dropped.
    while (ctx.takeOptionDecision(() => true)) { /* discard stale decisions */ }
    run.optionsSeq += 1;
    run.optionsSource = src;
    run.options = options;
    run.rejected.clear();
    run.optionsPayload = {
      options_seq: run.optionsSeq,
      horizon_min: src.horizon_min,
      train_ids: src.train_ids,
      recommended: i.recommended_variant_id,
      options,
      baseline: baselineFigures(src, baselineText)
    };
    ctx.onPhase("options");
    ctx.emit("options", run.optionsPayload);
    return waitForDecision();
  }

  async function awaitDecision() {
    if (!run.options) return { error: "No options are on screen. Use ui_propose_options first." };
    if (run.approvedOption) return { error: `A decision was already taken: ${run.approvedOption.label}. Continue with the drafts.` };
    return waitForDecision();
  }

  /** A decision counts only for the options on screen, and only once per option. */
  function validDecision(ev) {
    const p = ev?.payload || {};
    if (p.options_seq !== run.optionsSeq) return false;
    if (p.option_id === "baseline") return true;
    return run.options.some((o) => o.id === p.option_id) && !run.rejected.has(p.option_id);
  }

  async function waitForDecision() {
    ctx.onPhase("awaiting_approval");
    const ev = await ctx.waitUntil(() => ctx.takeOptionDecision(validDecision));
    const { option_id: id, decision } = ev.payload;
    const opt = run.options.find((o) => o.id === id) || null;
    const label = id === "baseline" ? "Do nothing (accept the risk)" : `Option ${opt.letter}: ${opt.title}`;
    if (decision === "approved") {
      run.approvedOption = { id, label, letter: opt ? opt.letter : null };
      for (const [type, payload] of decisionEffects(run.optionsPayload, id)) ctx.emit(type, payload);
      ctx.onPhase("executing");
      if (id === "baseline") {
        return { decision: "approved", option_id: "baseline", option: label,
          next: "The human accepted the risk. Publish nothing and request nothing. Draft one internal memo to the passenger information desk recording the decision (ui_draft_action, type memo), then ui_await_approvals, then ui_final_report with outcome risk_accepted." };
      }
      const variant = run.optionsSource.variants.find((v) => v.variant_id === id);
      return { decision: "approved", option_id: id, option: label,
        figures: { still_misinformed: opt.misinformed_pax, protected: opt.protected_pax, correct_info_from_min: opt.correct_info_from_min, back_in_sync_min: opt.time_to_sync_min, manual_overrides: opt.manual_overrides, effort_min: opt.effort_min },
        next: `Call it "option ${opt.letter}" (as on screen), never ${id}. Draft what this option contains, and nothing else: ${draftsForVariant(variant)}. Then call ui_await_approvals, then ui_final_report with outcome response_decided.` };
    }
    run.rejected.add(id);
    const remaining = run.options.filter((o) => !run.rejected.has(o.id)).map((o) => `Option ${o.letter} (${o.id})`);
    return {
      decision: "rejected", option_id: id, option: label, ...(opt ? { refer_to_it_as: `option ${opt.letter}` } : {}),
      remaining_options: remaining,
      next: remaining.length
        ? "Acknowledge the rejection in one sentence and do not draft anything for it. Then call ui_await_decision to wait for the next decision."
        : "All three options were rejected. Say that customer information stays as it is unless the human accepts the risk, then call ui_await_decision once more."
    };
  }

  // -- drafts and approvals ----------------------------------------------------------------------------
  function draftAction(i) {
    const type = DRAFT_TYPES.includes(i.type) ? i.type : null;
    if (!type) return { error: `type must be ${DRAFT_TYPES.join(", ")}.` };
    const subject = String(i.subject || "").trim();
    const raw = String(i.body || "").trim();
    if (!subject || !raw) return { error: "subject and body are required." };
    const approved = run.approvedOption;
    const variant = approved && approved.id !== "baseline" ? run.optionsSource?.variants.find((v) => v.variant_id === approved.id) : null;
    const rule = draftError({ type, approved, variant });
    if (rule) return { error: rule };
    const ref = sourceReference(run.optionsSource);
    let body = finalizeDraft(type, raw, ref);
    const audit = factCheck(`${subject}\n${raw}`, "draft", "draft", "ui_draft_action");
    if (audit.reject) return audit.reject;
    if (audit.flag) body = finalizeDraft(type, `${raw}\n\nUnchecked facts: ${audit.flag}. Verify them against the source before approving.`, ref);
    const action_id = `act-${ctx.drafts.size + 1}`;
    ctx.drafts.set(action_id, { status: "pending", subject, recipient: String(i.recipient || "").slice(0, 160), type });
    ctx.onPhase("executing");
    ctx.emit("action_draft", { action_id, type, recipient: String(i.recipient || "").slice(0, 160), subject: subject.slice(0, 200), body, status: "pending", ...(audit.flag ? { unchecked: audit.bad } : {}) });
    return { action_id, status: "pending_approval", note: "Queued in the Outbox as a draft. Nothing is published or sent." };
  }

  async function awaitApprovals() {
    const pending = () => [...ctx.drafts.values()].filter((d) => d.status === "pending").length;
    if (!ctx.drafts.size) return { error: "There are no drafts. Use ui_draft_action first." };
    if (pending()) {
      ctx.onPhase("awaiting_approval");
      ctx.emit("notice", { level: "info", text: `Waiting for your approval of ${pending()} draft${pending() === 1 ? "" : "s"} in the Outbox.` });
      await ctx.waitUntil(() => pending() === 0);
    }
    ctx.onPhase("executing");
    const decisions = [...ctx.drafts.entries()].map(([id, d]) => ({ action_id: id, recipient: d.recipient, subject: d.subject, decision: d.status }));
    return {
      all_decided: true,
      approved: decisions.filter((d) => d.decision === "approved").length,
      rejected: decisions.filter((d) => d.decision === "rejected").length,
      decisions,
      next: "Write the management summary with ui_final_report. Approved drafts are cleared for publication by a human; nothing was published or sent."
    };
  }

  function finalReport(i) {
    const pendingCount = [...ctx.drafts.values()].filter((d) => d.status === "pending").length;
    if (pendingCount) return { error: `${pendingCount} draft(s) are still pending. Call ui_await_approvals first.` };
    const outcome = reportOutcome({ requested: i.outcome, optionsShown: !!run.options, approved: run.approvedOption });
    if (outcome.error) return { error: outcome.error };
    let markdown = String(i.markdown || "").trim().slice(0, 19000);
    if (markdown.length < 40) return { error: "The report is empty. Write a short Markdown management summary." };
    const audit = factCheck(markdown, "report", "report", "ui_final_report");
    if (audit.reject) return audit.reject;
    if (audit.flag) markdown = `${markdown}\n\n*Unchecked facts (no tool returned them): ${audit.flag}.*`;
    // Every live report states what it is, whatever the model wrote.
    if (!/live agent run/i.test(markdown)) markdown = `${markdown}\n\n${LIVE_REPORT_FOOTER}`;
    run.reported = true;
    run.outcome = outcome.outcome;
    ctx.emit("report", { markdown, outcome: run.outcome });
    return { ok: true, published: true, outcome: run.outcome, next: "End your turn now with one short closing sentence." };
  }

  /**
   * Fact audit for free text, by scope (js/guards.js): rejects up to FACT_RETRIES times with the facts
   * to fix, then lets the text through with the unchecked facts named (drafts, report) or marked
   * (alert, option cards), and says so in the console.
   */
  function factCheck(text, kind, scope, tool) {
    const bad = run.ledger.unknown(text, scope);
    if (!bad.length) return {};
    const list = bad.slice(0, 6).map((f) => f.raw).join(", ");
    if (run.factRejections[kind] < FACT_RETRIES) {
      run.factRejections[kind] += 1;
      const allowed = scope === "draft" || scope === "options"
        ? "the source timetable, the published view, the physical layer, the passenger figures, the alternatives, and the sim_sync result the options rest on (never a what-if)"
        : "what the world-model tools and sim_sync (not a what-if) returned";
      return { reject: { error: `These timetable facts match nothing this text may quote: ${list}. The AI keeps no timetable of its own: use ${allowed}, written as they are (or leave the fact out), then call ${tool} again.` } };
    }
    const where = { draft: "draft", report: "summary", options: "option cards", alert: "alert" }[kind];
    ctx.emit("notice", { level: "warn", text: `The ${where} quote${kind === "options" ? "" : "s"} facts no tool returned (${list}); they are marked as unchecked.` });
    return { flag: list, bad: bad.map((f) => f.raw) };
  }

  return {
    execute,
    state: () => ({ ...run, rejected: [...run.rejected], ledger: undefined, evidence: run.evidence.kinds() })
  };
}

/** Marks unchecked facts in a short text shown on a card: "07:45" → "07:45 (unchecked)". */
function mark(text, bad = []) {
  let out = String(text || "");
  for (const raw of bad) out = out.split(raw).join(`${raw} (unchecked)`);
  return out;
}

function safeHttpUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

export { isKnownId };
