// Guardrail policy shared by the live tools (js/tools.js) and the simulation script checker
// (js/sim_check.js), so a live run and a scripted replay are held to the same rules:
//   - evidence: which tool results count, and for what (a lookup that found nothing never counts);
//   - verified alerts: two distinct sources, and for every train the alert names its source record
//     (the timetable or the operational change), its published customer view and a physical
//     observation that corroborates the change, all checked in this run;
//   - facts: which tool results a text may quote, by where the text goes (a passenger message may
//     quote only the facts and the engine result the options rest on, never a what-if);
//   - drafts: only the kinds of action the approved option contains;
//   - the management summary's outcome follows the human decision.

import { FactSet, collectFacts, unknownFacts, baseFacts } from "./facts.js";
import { changesOf, findTrain } from "./world.js";

// ---- evidence --------------------------------------------------------------------------------------

// Tools whose successful results count as evidence, by kind.
export const EVIDENCE_KIND = {
  ops_list_changes: "operations", ops_get_timetable: "source", kfp_get_published: "published",
  phys_observe: "physical", ops_get_passengers: "passengers", ops_find_alternatives: "alternatives"
};

/** Does a successful result count as evidence? A lookup that found nothing does not. */
export function isEvidence(name, r) {
  if (!EVIDENCE_KIND[name] || !r || r.error || r.ok === false) return false;
  if (name === "ops_list_changes") return Array.isArray(r.changes) && r.changes.length > 0;
  if (name === "phys_observe") return Array.isArray(r.observations) && r.observations.length > 0;
  if (name === "ops_find_alternatives") return Array.isArray(r.journeys) && r.journeys.length > 0;
  return true;
}

/** The details of an evidence result that the alert rule needs. */
function evidenceDetail(name, input, r) {
  switch (name) {
    case "ops_list_changes": return { changes: (r.changes || []).map((c) => c.id), trains: [...new Set((r.changes || []).flatMap((c) => c.train_ids || []))] };
    case "ops_get_timetable": return { trains: r.train_id ? [r.train_id] : [] };
    case "kfp_get_published": return { trains: r.train_id ? [r.train_id] : [] };
    case "phys_observe": return { observations: (r.observations || []).map((o) => o.id), supports: [...new Set((r.observations || []).flatMap((o) => o.supports || []))], trains: [...new Set((r.observations || []).flatMap((o) => o.train_ids || []))] };
    case "ops_get_passengers": return { trains: r.train_id ? [r.train_id] : [] };
    default: return {};
  }
}

const KIND_TEXT = { operations: "operations log", source: "source timetable", published: "published customer view", physical: "physical layer", passengers: "passenger figures", alternatives: "alternative journeys" };

/** Evidence gathered in one run, in order. */
export class EvidenceLog {
  constructor() { this.entries = []; }
  note(name, input, result) {
    if (!isEvidence(name, result)) return false;
    this.entries.push({ kind: EVIDENCE_KIND[name], tool: name, detail: evidenceDetail(name, input || {}, result) });
    return true;
  }
  kinds() { return [...new Set(this.entries.map((e) => e.kind))]; }
  clone() { const c = new EvidenceLog(); c.entries = this.entries.slice(); return c; }
  /** Plain-language list of what was checked, for the alert card. */
  describe(model) {
    const out = [];
    const num = (id) => model.trains.get(id)?.number || id;
    for (const e of this.entries) {
      let text;
      if (e.tool === "ops_list_changes") text = `operations log: ${e.detail.changes.join(", ")}`;
      else if (e.tool === "ops_get_timetable") text = `source timetable: ${e.detail.trains.map(num).join(", ")}`;
      else if (e.tool === "kfp_get_published") text = `published customer view: ${e.detail.trains.map(num).join(", ")}`;
      else if (e.tool === "phys_observe") text = `physical layer: ${e.detail.observations.join(", ")}`;
      else text = KIND_TEXT[e.kind] || e.kind;
      if (!out.includes(text)) out.push(text);
    }
    return out;
  }
}

/** Sources that are really different: the same URL (or title, without a URL) counts once. */
export function distinctSources(list) {
  const seen = new Set();
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || !(s.title || s.url)) continue;
    let key = String(s.title || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "");
    try { if (s.url) { const u = new URL(String(s.url)); key = `${u.host}${u.pathname}`.replace(/\/+$/, "").toLowerCase(); } } catch { /* keep the title key */ }
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Checks a verified alert against the evidence of the run. Returns an error message, or null.
 * The finding is that customer information contradicts the source. For each train it names, the
 * run must have read the source (its timetable or the operational change), the published customer
 * view, and a physical observation that corroborates the change or the timetable fact.
 */
export function verifiedAlertError(model, alert, log) {
  const sources = distinctSources(alert.sources);
  if (sources.length < 2) {
    return "A verified alert needs at least two distinct sources (for example the operational change record and a physical observation, not one record cited twice). Gather the second source first, narrate \"Not confirmed:\" and state the uncertainty, or raise it with basis \"what_if\".";
  }
  const kinds = log.kinds();
  const need = ["physical", "published"];
  const missing = need.filter((k) => !kinds.includes(k));
  if (!kinds.includes("source") && !kinds.includes("operations")) missing.unshift("source");
  if (missing.length) {
    return `A verified alert needs the source (ops_get_timetable or ops_list_changes), the published customer view (kfp_get_published) and the physical layer (phys_observe), all checked in this run; missing: ${missing.map((k) => KIND_TEXT[k] || k).join(", ")}. Check them first, or raise it with basis "what_if".`;
  }
  const ids = (alert.train_ids || []).map((r) => findTrain(model, r)?.id).filter(Boolean);
  if (!ids.length) return "A verified alert names the trains it is about (train_ids).";
  for (const id of ids) {
    const t = model.trains.get(id);
    const changeIds = changesOf(model, id).map((c) => c.id);
    const sourceSeen = log.entries.some((e) => (e.tool === "ops_get_timetable" && e.detail.trains.includes(id))
      || (e.tool === "ops_list_changes" && (e.detail.trains.includes(id) || e.detail.changes.some((c) => changeIds.includes(c)))));
    if (!sourceSeen) return `${t.number}: its source record (ops_get_timetable, or the operational change in ops_list_changes) has not been read in this run.`;
    const pubSeen = log.entries.some((e) => e.tool === "kfp_get_published" && e.detail.trains.includes(id));
    if (!pubSeen) return `${t.number}: its published customer view has not been read in this run (kfp_get_published). Check what passengers are being told before you alert.`;
    const physSeen = log.entries.some((e) => e.tool === "phys_observe" && (e.detail.trains.includes(id)
      || e.detail.supports.some((s) => changeIds.includes(s) || s.startsWith(`${id}:`))));
    if (!physSeen) return `${t.number}: no physical observation corroborates it in this run. Call phys_observe for the train or the place concerned (a dispatch record alone is one source), or raise the alert with basis "what_if".`;
  }
  return null;
}

// ---- facts -----------------------------------------------------------------------------------------

/**
 * The facts a run's tools returned, kept apart by origin, so each kind of text can quote only what
 * it may: world-model facts (source, published view, physical layer, passengers, alternatives) and
 * engine results (from the source, partial or what-if).
 */
export class FactLedger {
  constructor(model) {
    this.facts = model ? baseFacts(model) : new FactSet();
    this.engine = [];          // { res, basis, set }
    this.optionsSource = null; // the engine result the options were costed on
  }
  addFacts(result) { collectFacts(result, this.facts); }
  clone() {
    const c = new FactLedger();
    c.facts = new FactSet().merge(this.facts);
    c.engine = this.engine.slice();
    c.optionsSource = this.optionsSource;
    return c;
  }
  addEngine(res) {
    const entry = { res, basis: res.basis, set: collectFacts(res) };
    this.engine.push(entry);
    return entry;
  }
  setOptionsSource(res) {
    this.optionsSource = this.engine.find((e) => e.res === res) || this.addEngine(res);
  }
  /**
   * narration and alert_what_if: anything a tool returned; alert_verified and report: facts and
   * every engine result that is not a what-if; options and draft: facts and the result the options
   * were costed on.
   */
  scope(kind) {
    const all = this.engine.map((e) => e.set);
    const notWhatIf = this.engine.filter((e) => e.basis !== "what_if").map((e) => e.set);
    switch (kind) {
      case "narration": case "alert_what_if": return [this.facts, ...all];
      case "alert_verified": case "report": return [this.facts, ...notWhatIf];
      case "options": case "draft": return [this.facts, ...(this.optionsSource ? [this.optionsSource.set] : notWhatIf.slice(-1))];
      default: return [this.facts];
    }
  }
  unknown(text, kind) {
    return [...new Map(unknownFacts(text, this.scope(kind)).map((f) => [`${f.kind}:${f.raw}`, f])).values()];
  }
}

// ---- drafts and the summary ------------------------------------------------------------------------

// Which action of an approved option each draft type carries out.
const DRAFT_NEEDS = {
  passenger_message: "message",
  republish_order: "republish",
  override_request: "override",
  staff_brief: "staff",
  hold_request: "hold_request"
};

/**
 * Which drafts an approval allows. approved: { id, letter? } or null; variant: the engine variant of
 * the approved option (with action_types). Returns an error message, or null.
 */
export function draftError({ type, approved, variant }) {
  if (!approved) return "Drafts follow a human decision. Propose options with ui_propose_options and wait for an approval first.";
  if (approved.id === "baseline") {
    return type === "memo" ? null : "The human accepted the risk: nothing is published and nothing is requested. Draft one internal memo recording the decision (type memo).";
  }
  if (type === "memo") return null;
  const acts = new Set(variant?.action_types || []);
  const name = approved.letter ? `Option ${approved.letter}` : "The approved option";
  const needs = DRAFT_NEEDS[type];
  if (needs && !acts.has(needs)) {
    return `${name} contains no ${ACTION_WORDS[needs]}, so there is no ${TYPE_WORDS[type]} to draft. Draft only what the option contains: ${describeActions(acts)}.`;
  }
  return null;
}

const ACTION_WORDS = { message: "passenger message", republish: "re-publication from the source", override: "manual override", staff: "staff briefing", hold_request: "connection-hold request" };
const TYPE_WORDS = { passenger_message: "passenger message", republish_order: "re-publication order", override_request: "override request", staff_brief: "staff briefing", hold_request: "hold request" };

/** What the approved option's drafts are, in words, for the agent's next step. */
export function draftsForVariant(variant) {
  return describeActions(new Set(variant?.action_types || []));
}

function describeActions(acts) {
  const words = {
    republish: "a re-publication order to the timetable publication team (republish_order)",
    message: "the passenger message for the channels the option names (passenger_message)",
    override: "a manual-override request for the station displays and announcements (override_request)",
    staff: "a briefing for station staff and train crew (staff_brief)",
    hold_request: "a connection-hold request to dispatch (hold_request)"
  };
  return [...acts].map((a) => words[a] || a).join(", ") || "nothing";
}

export const OUTCOMES = ["response_decided", "risk_accepted", "no_material_finding", "monitoring"];

/**
 * The outcome of the management summary, from the human decision. Returns { outcome } or { error }.
 * optionsShown: options were on screen; approved: { id } or null.
 */
export function reportOutcome({ requested, optionsShown, approved }) {
  const asked = OUTCOMES.includes(requested) ? requested : null;
  if (approved) {
    const outcome = approved.id === "baseline" ? "risk_accepted" : "response_decided";
    if (asked && asked !== outcome) {
      return { error: `The outcome is ${outcome}: the human ${approved.id === "baseline" ? "accepted the risk" : "approved an option"}. Write the summary for that decision and publish it with outcome "${outcome}".` };
    }
    return { outcome };
  }
  if (optionsShown) return { error: "The options are still waiting for a human decision. Call ui_await_decision first; the summary follows the decision." };
  if (asked === "no_material_finding" || asked === "monitoring") return { outcome: asked };
  return { error: "No options were proposed, so there is no decision to report. Publish the summary with outcome \"no_material_finding\" (customer information matches the source) or \"monitoring\" (a lead that is not confirmed yet), or verify, cost three options and propose them first." };
}
