// The Timetable Translator's story for the presenter: the five steps, what each says, the key figures
// and the figures the guide quotes. It reads the run digest (js/run.js), so a replay and a live run read
// alike; every figure comes from the engine's results in the run, and this module only chooses and
// words them. Pure module (no DOM): the page and the tests share it.

import { STEP_IDS, results, finding, approved, waitsFor } from "./run.js";
import { int, eurCents } from "./format.js";
import { plain } from "./plain.js";
import { changesOf, minuteLabel } from "./world.js";

export const STEPS = [
  { id: "spot", label: "Spot", hint: "the lead",
    lead: "A lead reaches the agent. It goes to the source, the operations log, before it trusts the lead.",
    next: "The agent follows the lead to the source.", doing: "following the lead to the source" },
  { id: "check", label: "Check", hint: "every channel",
    lead: "The agent reads what every channel tells passengers and asks the sensors on the track what the train will really do.",
    next: "The agent reads every channel and asks the track's sensors.", doing: "reading every channel and the sensors" },
  { id: "calculate", label: "Calculate", hint: "who is misled",
    lead: "An engine, not the AI, counts who would act on the wrong information and when the first of them does.",
    next: "The engine counts who would act on wrong information.", doing: "counting who acts on wrong information" },
  { id: "propose", label: "Propose", hint: "your decision",
    lead: "The engine prices three responses next to doing nothing. The agent recommends one; you decide.",
    next: "The engine prices three responses, and you decide.", doing: "pricing three responses" },
  { id: "prepare", label: "Prepare", hint: "the drafts",
    lead: "The agent drafts what the option you approved needs. Each draft waits for your approval, and nothing is published.",
    next: "The agent drafts what your decision needs.", doing: "drafting what passengers should be told" }
];
STEPS.forEach((s, i) => { s.index = i; });

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const words = (n) => WORDS[n] ?? int(n);
export const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const minutes = (m) => (m === null || m === undefined ? "none within three hours" : `${int(m)} min`);
const passengers = (n) => `${int(n)} ${n === 1 ? "passenger" : "passengers"}`;
const textWords = (s) => String(s || "").split(/\s+/).filter(Boolean).length;

/** What part of the data a first estimate counted, for its value: "on 1 of 4 channels", or "so far". */
function partOf(result) {
  const ch = result.scope?.channels;
  return Array.isArray(ch) && ch.length ? `on ${ch.length} of 4 channels` : "so far";
}

/** Where the first passenger acts, as a tile's note: "at Köln Hbf", or "on board the train". */
export function atWhere(where) {
  if (!where) return "";
  return /^on board\b/.test(where) ? "on board the train" : `at ${where}`;
}

/** The station of the first affected moment, without the train: "ICE 618, Köln Hbf" gives "Köln Hbf". */
export function firstWhere(label) {
  const s = String(label || "").replace(/\s\d{2}:\d{2}$/, "");
  return s.includes(", ") ? s.split(", ").slice(1).join(", ") : s;
}

/** The option the bar offers: the recommended one, or after its rejection the open one that leaves fewest misinformed. */
export function offered(r) {
  if (!r.options) return null;
  const open = r.options.options.filter((o) => !r.rejected.includes(o.id));
  return open.find((o) => o.recommended) || [...open].sort((a, b) => a.misinformed_pax - b.misinformed_pax)[0] || null;
}

/**
 * The five steps as the page shows them now. scenario: the scenario played; mode: "simulation" or
 * "live". Each step: { id, label, hint, title, lead, ready, waits, turn, read } where read is how long
 * Play stays on it (the time to read its title and lead, 7 to 14 seconds).
 */
export function story(r, { scenario, mode = "simulation" } = {}) {
  const train = scenario?.train_id || null;
  const { first, last } = results(r, null);
  const f = finding(r) || last;
  const opt = approved(r);
  const rec = r.options?.options.find((o) => o.recommended) || null;
  const base = r.options?.baseline || f?.result?.baseline || null;
  const waits = waitsFor(r);
  const drafts = r.drafts;
  const pending = drafts.filter((d) => d.status === "pending");
  const titles = [
    plain(scenario?.title || "The lead"),
    r.alert ? plain(r.alert.title) : mode === "live" ? "Is the lead true?" : "Every channel against the source",
    f ? impactTitle(f) : "Who would act on wrong information?",
    r.decision?.id === "baseline" ? `You accepted the risk: ${passengers(base?.misinformed_pax ?? 0)} stay misinformed`
      : opt ? `You approved option ${opt.letter}: ${int(opt.misinformed_pax)} of ${int(base?.misinformed_pax ?? 0)} still misinformed`
        : rec ? `Option ${rec.letter} leaves ${int(rec.misinformed_pax)} of ${int(base?.misinformed_pax ?? 0)} misinformed${rec.time_to_sync_min !== null && rec.time_to_sync_min !== undefined ? " and aligns every channel" : ""}`
          : "Three responses, and you decide",
    !r.decision ? "The drafts follow your decision"
      : !drafts.length ? "The agent is drafting"
        : pending.length ? `${capital(words(pending.length))} ${pending.length === 1 ? "draft waits" : "drafts wait"} for your approval`
          : `${drafts.filter((d) => d.status === "approved").length} of ${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"} approved, nothing published`
  ];
  const ready = (i) => (mode === "live" ? i <= r.reached : i <= Math.max(r.reached, 3) && (i < 4 || !!r.decision));
  const steps = STEPS.map((s, i) => ({
    ...s,
    title: titles[i],
    ready: ready(i),
    waits: (i === 3 && waits === "propose") || (i === 4 && waits === "prepare"),
    train
  }));
  for (const s of steps) {
    s.read = Math.min(14000, Math.max(7000, 3000 + 230 * textWords(`${s.title} ${s.lead}`)));
    s.turn = s.waits ? turn(s.id) : null;
  }
  return { steps, first, last: f, approved: opt, recommended: rec, baseline: base, waits };

  function turn(id) {
    if (id === "propose") {
      const o = offered(r);
      if (!o) return { text: "Approve one of the options above, or accept the risk.", action: null };
      const aligned = o.time_to_sync_min !== null && o.time_to_sync_min !== undefined ? `, every channel aligned after ${int(o.time_to_sync_min)} min` : "";
      const lead = o.recommended ? `The agent recommends option ${o.letter}` : `Option ${o.letter} leaves the fewest misinformed`;
      return { text: `${lead}: ${int(o.misinformed_pax)} instead of ${int(base?.misinformed_pax ?? 0)} misinformed${aligned}. Approve it, or choose another option above.`, action: { id: "approve", label: `Approve option ${o.letter}`, option: o.id } };
    }
    const n = pending.length;
    return {
      text: `${capital(words(n))} ${n === 1 ? "draft waits" : "drafts wait"} for your approval. Approving publishes nothing.`,
      action: { id: "approve-drafts", label: n === 1 ? "Approve the draft" : n === 2 ? "Approve both drafts" : `Approve all ${words(n)} drafts` }
    };
  }
}

function impactTitle(s) {
  const b = s.result.baseline || {};
  const trains = (s.result.trains || []).length;
  const who = trains > 1 ? `${passengers(b.misinformed_pax)} on ${words(trains)} trains` : passengers(b.misinformed_pax);
  const when = b.first_event_min === null || b.first_event_min === undefined ? "none of them within three hours" : `the first in ${int(b.first_event_min)} min`;
  return `${capital(who)} would act on wrong information, ${when}`;
}

/** What the AI translator's card says it did in a step (a replay shows every step done). */
export function aiLine(r, step) {
  const at = STEP_IDS[step];
  if (at === "spot") return "Followed the lead to the source";
  if (at === "check") return "Read every channel and the sensors";
  if (at === "calculate") return results(r, null, 2).last ? "Counted who would act on it" : "Counting who would act on it";
  if (at === "propose") return r.options ? `Proposed ${words(r.options.options.length)} options` : "Pricing three responses";
  const pending = r.drafts.filter((d) => d.status === "pending").length;
  if (!r.decision) return "Waiting for your decision";
  if (pending) return `${capital(words(pending))} ${pending === 1 ? "draft" : "drafts"} ready`;
  return r.report ? "Done: the summary is written" : "Drafting";
}

// ---- the key figures ---------------------------------------------------------------------------------

/**
 * The four tiles as the run stands: { pax, first, cost } with { value, was?, note, tone } each (the
 * clock is the page's). estimate: the session cost a live run of this scenario would have.
 */
export function keyFigures(r, { mode = "simulation", estimate = null, model = "Sonnet 5.5" } = {}) {
  const f = finding(r) || results(r).last;
  const opt = approved(r);
  const out = {};
  if (!f) {
    // Figures that need the engine's count show "…" until it is in (a live run before step 3).
    out.pax = { value: "…", note: "counted in step 3", tone: "muted" };
    out.first = { value: "…", note: "worked out in step 3", tone: "muted" };
  } else {
    const b = f.result.baseline;
    const where = firstWhere(b.first_event_short || b.first_event_label);
    const estimateNote = f.basisKey !== "verified" ? "first estimate" : null;
    const urgent = b.first_event_min !== null && b.first_event_min <= 30 ? "affected" : "at_risk";
    if (r.decision?.id === "baseline") {
      out.pax = { value: int(b.misinformed_pax), note: "risk accepted", tone: "affected" };
      out.first = { value: minutes(b.first_event_min), note: "risk accepted", tone: "affected" };
    } else if (opt) {
      const right = opt.correct_info_from_min;
      out.pax = { value: int(opt.misinformed_pax), was: int(b.misinformed_pax), note: `with option ${opt.letter}`, tone: opt.misinformed_pax > 0 ? "at_risk" : "resolved" };
      out.first = { value: minutes(b.first_event_min), note: right === null || right === undefined ? `${atWhere(where) || "first"}, still wrong` : `right information in ${int(right)} min`, tone: right !== null && right !== undefined && (b.first_event_min === null || right < b.first_event_min) ? "resolved" : "at_risk" };
    } else {
      // A first estimate counts part of the data, and its value says so: "8 on 1 of 4 channels".
      const part = estimateNote ? partOf(f.result) : null;
      out.pax = { value: int(b.misinformed_pax), part, note: estimateNote || "if nothing is done", tone: b.misinformed_pax ? "affected" : "resolved" };
      out.first = { value: minutes(b.first_event_min), note: where ? atWhere(where) : "if nothing is done", tone: b.first_event_min === null ? "resolved" : urgent };
    }
  }
  out.cost = mode === "live"
    ? { value: eurCents(r.cost?.eur || 0), note: `measured, Claude ${model}` }
    : { value: estimate === null ? "…" : `≈ ${eurCents(estimate)}`, note: "estimated for a live run" };
  return out;
}

// ---- the guide's figures -----------------------------------------------------------------------------

/** The figures How it works quotes, from the default scenario's run, as data-fig names. */
export function guideFigures(r, { model, scenario, estimate }) {
  const f = finding(r);
  const { first } = results(r);
  const rec = r.options?.options.find((o) => o.recommended) || null;
  const b = f?.result.baseline || {};
  const figs = {
    pax: int(b.misinformed_pax ?? 0),
    first: minutes(b.first_event_min),
    "first-where": firstWhere(b.first_event_short || b.first_event_label),
    "hyp-pax": first && first !== f ? int(first.result.baseline.misinformed_pax) : int(b.misinformed_pax ?? 0),
    rec: rec?.letter || "",
    "rec-left": rec ? int(rec.misinformed_pax) : "",
    estimate: estimate === null || estimate === undefined ? "" : eurCents(estimate)
  };
  // The platform the source gives and the one passengers are told, at the stop the diagram shows.
  const train = scenario?.train_id;
  const c = (f?.result.contradictions || []).find((x) => x.type === "platform" && String(x.id).startsWith(`${train}/`));
  if (c) {
    figs["platform-source"] = (String(c.source_says ?? c.expected ?? "").match(/platform\s+(\S+)/i) || [])[1] || "";
    figs["platform-told"] = (String(c.published ?? "").match(/platform\s+(\S+)/i) || [])[1] || "";
  }
  const ch = model && train ? changesOf(model, train).at(-1) : null;
  if (ch) figs.changed = minuteLabel(ch.at);
  return figs;
}
