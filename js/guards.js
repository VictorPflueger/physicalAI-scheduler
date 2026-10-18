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

import { FactSet, collectFacts, collectFactsBy, unknownFacts, baseFacts, extractFacts } from "./facts.js";
import { changesOf, findTrain, minuteLabel } from "./world.js";

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
 * it may: world-model facts by the train they are about (source, published view, physical layer,
 * passengers, alternatives), facts about no train, and engine results (from the source, partial or
 * what-if). A text may quote a world-model fact only for a train it is about: the trains its tool
 * call names (the alert's trains, the trains the options were costed on) and the trains it names
 * itself (a line name such as "RE 57" counts for every train of that line).
 */
export class FactLedger {
  constructor(model) {
    this.model = model || null;
    this.facts = model ? baseFacts(model) : new FactSet(); // the base facts and facts about no train
    this.byTrain = new Map();  // train id → FactSet
    this.engine = [];          // { res, basis, set }
    this.optionsSource = null; // the engine entry the options were costed on
  }
  /** The trains a result object is about: train_id, train_ids, or a train number. */
  trainsOf(o) {
    const m = this.model;
    if (!m || !o) return null;
    const ids = [];
    if (typeof o.train_id === "string" && m.trains.has(o.train_id)) ids.push(o.train_id);
    if (Array.isArray(o.train_ids)) for (const x of o.train_ids) if (m.trains.has(x)) ids.push(x);
    if (!ids.length && typeof o.number === "string") { const t = findTrain(m, o.number); if (t) ids.push(t.id); }
    if (!ids.length && typeof o.train === "string") { const t = findTrain(m, o.train); if (t) ids.push(t.id); }
    return ids.length ? ids : null;
  }
  setOf(id) {
    if (!this.byTrain.has(id)) this.byTrain.set(id, new FactSet());
    return this.byTrain.get(id);
  }
  addFacts(result) {
    collectFactsBy(result, (o) => this.trainsOf(o), (ctx) => (ctx ? ctx.map((id) => this.setOf(id)) : [this.facts]));
  }
  clone() {
    const c = new FactLedger();
    c.model = this.model;
    c.facts = new FactSet().merge(this.facts);
    for (const [id, set] of this.byTrain) c.byTrain.set(id, new FactSet().merge(set));
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
   * The engine results a text may quote. narration and alert_what_if: every result; alert_verified
   * and report: every result that is not a what-if; options and draft: the result the options were
   * costed on.
   */
  engineEntries(kind) {
    const notWhatIf = this.engine.filter((e) => e.basis !== "what_if");
    switch (kind) {
      case "narration": case "alert_what_if": return this.engine;
      case "alert_verified": case "report": return notWhatIf;
      case "options": case "draft": return this.optionsSource ? [this.optionsSource] : notWhatIf.slice(-1);
      default: return [];
    }
  }
  /** The trains a text is about: the trains of its scope and the trains (or lines) it names. */
  trainsFor(text, scopeTrains = []) {
    const ids = new Set((scopeTrains || []).map((r) => (this.model ? findTrain(this.model, r)?.id : null) || r));
    if (!this.model) return ids;
    for (const f of extractFacts(text)) {
      if (f.kind !== "train") continue;
      const t = findTrain(this.model, f.value);
      if (t) ids.add(t.id);
      for (const x of this.model.trains.values()) if (x.line && x.line.replace(/\s+/, " ") === f.value) ids.add(x.id);
    }
    return ids;
  }
  /** The known-fact sets for a text (trains: a Set of train ids, or null for every train). */
  scope(kind, trains = null) {
    const own = trains === null ? [...this.byTrain.values()] : [...trains].map((id) => this.byTrain.get(id)).filter(Boolean);
    return [this.facts, ...own, ...this.engineEntries(kind).map((e) => e.set)];
  }
  /**
   * Facts written in `text` that it may not quote. scopeTrains: the trains of the tool call (an
   * array), or null for no train restriction; narration and what-if alerts are never restricted.
   */
  unknown(text, kind, scopeTrains = null) {
    const free = kind === "narration" || kind === "alert_what_if" || scopeTrains === null;
    const trains = free ? null : this.trainsFor(text, scopeTrains);
    return [...new Map(unknownFacts(text, this.scope(kind, trains)).map((f) => [`${f.kind}:${f.raw}`, f])).values()];
  }
  /**
   * Outdated values named without the source's value: a platform, a time or coach sectors that the
   * channels publish and the source no longer has, for a train the text is about, written without
   * the value the source has instead ("Gleis 5" alone, where "Gleis 7, not Gleis 5" is right).
   * Returns [{ raw, train, station, what, old, source }].
   */
  outdated(text, kind, scopeTrains = []) {
    if (!["alert_verified", "options", "draft", "report"].includes(kind)) return [];
    const trains = this.trainsFor(text, scopeTrains || []);
    const facts = extractFacts(text);
    const find = (k, v) => facts.find((f) => f.kind === k && String(f.value) === String(v));
    // The same value can belong to another train the text names: "08:51" is ICE 1022's old arrival
    // and also the departure of the RB that replaces it. Such a value is that train's fact.
    const entries = this.engineEntries(kind);
    const legs = entries.flatMap((e) => (e.res.alternatives || []).flatMap((a) => a.legs || []));
    const otherTrainHas = (k, v, exceptId) => {
      for (const id of trains) if (id !== exceptId && this.byTrain.get(id)?.has(k, v)) return true;
      if (k === "time") return legs.some((l) => l.train_id !== exceptId && (l.dep_label === v || l.arr_label === v));
      if (k === "platform") return legs.some((l) => l.train_id !== exceptId && (String(l.platform) === v || String(l.arr_platform) === v));
      return false;
    };
    const out = [];
    const seen = new Set();
    for (const e of entries) {
      for (const c of e.res.contradictions || []) {
        if (!trains.has(c.train_id)) continue;
        for (const p of outdatedPairs(c)) {
          const key = `${c.id}:${p.kind}:${p.old}`;
          const hit = find(p.kind, p.old);
          if (seen.has(key) || !hit || p.source.some((v) => find(p.kind, v)) || otherTrainHas(p.kind, p.old, c.train_id)) continue;
          seen.add(key);
          out.push({ raw: hit.raw, train: c.number, station: c.station, what: p.what, old: p.old, source: p.source[0] });
        }
      }
    }
    return out;
  }
}

/** The published (old) and source values of one contradiction, by fact kind. */
export function outdatedPairs(c) {
  const out = [];
  if (c.type === "platform") out.push({ kind: "platform", old: String(c.published_value), source: [String(c.expected_value)], what: "platform" });
  if (c.type === "time") {
    const pv = c.published_value || {};
    const ev = c.expected_value || {};
    for (const [k, what] of [["arr", "arrival"], ["dep", "departure"]]) {
      if (pv[k] === null || pv[k] === undefined || ev[k] === null || ev[k] === undefined || pv[k] === ev[k]) continue;
      out.push({ kind: "time", old: minuteLabel(pv[k]), source: [minuteLabel(ev[k])], what });
    }
  }
  if (c.type === "coach_order") {
    const pv = c.published_value || {};
    const ev = c.expected_value || {};
    if (pv.first && pv.first !== ev.first) out.push({ kind: "sector", old: pv.first, source: [ev.first], what: "first-class sectors" });
    if (pv.restaurant && pv.restaurant !== ev.restaurant) out.push({ kind: "sector", old: pv.restaurant, source: [ev.restaurant], what: "restaurant sector" });
  }
  return out;
}

// ---- the mirror and the options --------------------------------------------------------------------

/**
 * What the agent may mark on the mirror. Green ("re-publication approved") and amber on a
 * contradiction ("informed, data behind") follow a human decision, and the mirror sets them by
 * itself when an option is approved; the agent marks contradictions affected or neutral, and
 * trains or points it is checking at_risk. Returns an error message, or null.
 */
export function markError({ state, contradictionIds = [] }) {
  if (state === "resolved") return "Only a human decision marks a contradiction resolved: when an option with a re-publication is approved, the mirror shows it by itself. Mark affected, neutral, or at_risk for a train or point you are checking.";
  if (state === "at_risk" && contradictionIds.length) return "On a contradiction, at_risk means passengers are informed while the data is still behind, which only an approved option makes true. Mark contradictions affected or neutral; use at_risk for a train or point you are checking.";
  return null;
}

/** Options follow a verified finding: a verified alert for at least one of the trains they are costed on. */
export function optionsEvidenceError({ verifiedTrains, trainIds }) {
  if ((trainIds || []).some((id) => verifiedTrains.has(id))) return null;
  return "Options follow a verified finding. Raise a verified alert (ui_report_alert) for these trains first: the source record, the published view and a physical observation behind it. If the physical layer cannot confirm it, say so and stop at a what-if alert.";
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
