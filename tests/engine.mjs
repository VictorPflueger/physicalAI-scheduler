// Golden-figure tests for the domain core (Node.js 20 or later; no browser needed):
//   engine      the six reference cases give the frozen figures below: passengers misinformed and
//               affected, the first affected moment, and every variant's figures; a passenger who
//               relies on two wrong facts at one stop is counted once
//   projection  the customer view rounds arrivals up and departures down, keeps short stops in order,
//               hides operational stops (unless a conversion fault publishes them), lists cancelled
//               and extra stops, and names the new terminus
//   sweep       every train outside the six scenarios matches the source (honest negatives)
//   refusals    the engine refuses unknown trains, channels and points, invalid actions and variant
//               sets, and labels partial scopes and what-ifs
//   facts       the fact audit reads times, platforms, minutes, trains and passengers in English and
//               German, learns tool results (a tenth-minute time stands for both minutes around it),
//               and names what no tool returned
//   guards      verified alerts, fact scopes, drafts per option, report outcomes
//   tools       the live toolbox: options only from a full-scope result from the source with three
//               variants, drafts only after a decision and only of what the option contains, the
//               fact audit on texts, the evidence rule on alerts
//   mirror      the mirror's data: links between the timetables, row placement, published rows with
//               cancelled stops, the corridor strip, the sync monitor, and what a lookup touches
//   texts       placeholders, journeys in German and English, draft safety lines, decision payoff
// A change that moves a figure must be deliberate: update the golden value and say why in the commit.
// Usage: node tests/engine.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./lib/harness.mjs";

const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ["data/world.js", "data/scenarios.js", "data/reference_cases.js"]) vm.runInContext(fs.readFileSync(path.join(APP_ROOT, f), "utf8"), sandbox);
// The data files hold plain JSON values; copied into this realm, so arrays compare with assert.deepEqual.
const { WORLD, SCENARIOS, REFERENCE_CASES: REF } = JSON.parse(JSON.stringify(sandbox.window));

const { buildModel, sourceState, customerArr, customerDep, minuteLabel, tenthLabel, findTrain, findPoint } = await mod("js/world.js");
const { simulateSync, customerView, trainContradictions, compactForModel, findJourneys } = await mod("js/sync.js");
const { OPS_TOOLS } = await mod("js/ops.js");
const { extractFacts, collectFacts, unknownFacts, FactSet } = await mod("js/facts.js");
const { EvidenceLog, FactLedger, verifiedAlertError, draftError, reportOutcome, distinctSources } = await mod("js/guards.js");
const { createToolbox } = await mod("js/tools.js");
const { mirrorLinks, placeRight, channelRows, stripData, monitorTrains, sourceRows, positionNow } = await mod("js/mirror_data.js");
const { callTrains, callPoints, resultChecks, contradictionsOf } = await mod("js/mirror.js");
const { syncVars, journeyText, fillTemplate, unresolvedKeys } = await mod("js/sim_vars.js");
const { finalizeDraft, sourceReference, DRAFT_FOOTER, MOCK_LINES } = await mod("js/drafts.js");
const { decisionEffects, optionFigures, baselineFigures } = await mod("js/payoff.js");

const model = buildModel(WORLD);
let passed = 0;
const ok = (label) => { passed += 1; console.log(`ok: ${label}`); };

// ---- engine: golden figures -------------------------------------------------------------------------
// Per variant: [misinformed, protected, correct information from (min), back in sync (min), residual
// contradictions, manual overrides, staff effort (min), passengers who keep a held connection].
const GOLDEN = {
  "SC-PLATFORM": {
    hypothesis: { basis: "partial", contradictions: 1, misinformed: 8, affected: 312, first: 14 },
    finding: { contradictions: 2, misinformed: 312, affected: 312, first: 14, ids: ["T-618/KK/coach_order", "T-618/KK/platform"] },
    variants: { V1: [7, 305, 2, 8, 0, 0, 9, 0], V2: [15, 297, 2, null, 2, 0, 10, 0], V3: [72, 240, 2, null, 2, 2, 10, 0] }
  },
  "SC-DIVERSION": {
    hypothesis: { basis: "partial", contradictions: 5, misinformed: 454, affected: 454, first: 19 },
    finding: { contradictions: 10, misinformed: 856, affected: 856, first: 19, ids: ["T-1022/EHG/stop_not_served", "T-1022/KK/time", "T-1022/KW/stop_not_served", "T-1022/EE/stop_missing", "T-1022/KD/stop_missing", "T-1026/EHG/stop_not_served", "T-1026/KK/time", "T-1026/KW/stop_not_served", "T-1026/EE/stop_missing", "T-1026/KD/stop_missing"] },
    variants: { V1: [7, 849, 2, 20, 0, 0, 21, 0], V2: [7, 849, 2, null, 10, 0, 12, 0], V3: [40, 816, 2, null, 10, 20, 82, 0] }
  },
  "SC-OPSSTOP": {
    hypothesis: { basis: "partial", contradictions: 1, misinformed: 6, affected: 58, first: 57 },
    finding: { contradictions: 1, misinformed: 58, affected: 58, first: 57, ids: ["T-1027/KKM/stop_not_served"] },
    variants: { V1: [2, 56, 2, 8, 0, 0, 9, 0], V2: [3, 55, 2, null, 1, 2, 10, 0], V3: [1, 57, 2, null, 1, 0, 10, 0] }
  },
  "SC-TERMINUS": {
    hypothesis: { basis: "partial", contradictions: 1, misinformed: 24, affected: 268, first: 98 },
    finding: { contradictions: 1, misinformed: 157, affected: 268, first: 98, ids: ["T-1025/KK/terminus"] },
    variants: { V1: [13, 144, 2, 8, 0, 0, 7, 0], V2: [17, 140, 2, null, 1, 0, 6, 0], V3: [13, 144, 2, null, 1, 1, 6, 0] }
  },
  "SC-COACH": {
    hypothesis: { basis: "partial", contradictions: 1, misinformed: 112, affected: 112, first: 44 },
    finding: { contradictions: 5, misinformed: 225, affected: 225, first: 44, ids: ["T-516/KK/coach_order", "T-516/KD/coach_order", "T-516/EDG/coach_order", "T-516/EE/coach_order", "T-516/EBO/coach_order"] },
    variants: { V1: [7, 218, 2, 8, 0, 0, 7, 0], V2: [26, 199, 2, null, 5, 0, 8, 0], V3: [56, 169, 3, null, 5, 0, 2, 0] }
  },
  "SC-FPLO": {
    hypothesis: { basis: "partial", contradictions: 2, misinformed: 118, affected: 118, first: 137 },
    finding: { contradictions: 3, misinformed: 234, affected: 234, first: 126, ids: ["T-612/EDO/time", "T-612/EDO/connection", "T-10109/EDO/time"] },
    variants: { V1: [11, 223, 2, 8, 0, 0, 10, 46], V2: [13, 221, 2, 8, 0, 0, 7, 0], V3: [15, 219, 2, null, 3, 0, 6, 0] }
  }
};
{
  assert.equal(SCENARIOS.length, 6);
  for (const sc of SCENARIOS) {
    const g = GOLDEN[sc.id];
    const h = simulateSync(model, structuredClone(REF[sc.id].hypothesis));
    assert.ok(h.ok, sc.id);
    assert.deepEqual({ basis: h.basis, contradictions: h.baseline.contradictions, misinformed: h.baseline.misinformed_pax, affected: h.baseline.affected_pax, first: h.baseline.first_event_min }, g.hypothesis, `${sc.id} hypothesis`);
    const f = simulateSync(model, structuredClone(REF[sc.id].finding));
    assert.ok(f.ok && f.basis === "source" && !f.left_out, `${sc.id} finding from the source, full scope`);
    assert.deepEqual({ contradictions: f.baseline.contradictions, misinformed: f.baseline.misinformed_pax, affected: f.baseline.affected_pax, first: f.baseline.first_event_min, ids: f.contradictions.map((c) => c.id) }, g.finding, `${sc.id} finding`);
    const variants = Object.fromEntries(f.variants.map((v) => [v.variant_id, [v.misinformed_pax, v.protected_pax, v.correct_info_from_min, v.time_to_sync_min, v.residual_contradictions, v.manual_overrides, v.effort_min, v.held_pax]]));
    assert.deepEqual(variants, g.variants, `${sc.id} variants`);
    for (const v of f.variants) assert.equal(v.protected_pax, f.baseline.misinformed_pax - v.misinformed_pax, `${sc.id} ${v.variant_id}: protected = baseline − misinformed`);
    // The recommended option of every authored script (V1) brings every channel back in sync.
    assert.ok(f.variants[0].time_to_sync_min !== null && f.variants[0].manual_overrides === 0, `${sc.id}: V1 is in sync without overrides`);
  }
  ok("six reference cases: golden figures for the first estimate, the finding and every variant");
}

{
  // Each passenger counted once: the 104 with seat reservations are among the 312 boarding ICE 618 at
  // Köln Hbf, the 46 who change to RE 57 among those travelling to Dortmund on ICE 612.
  const p = simulateSync(model, structuredClone(REF["SC-PLATFORM"].finding));
  const pk = Object.fromEntries(p.contradictions.map((c) => [c.type, c.pax]));
  assert.deepEqual(pk, { platform: 312, coach_order: 104 });
  assert.equal(model.trains.get("T-618").passengers.KK.board, 312);
  assert.equal(p.baseline.affected_pax, 312);
  assert.equal(p.trains[0].pax, 312);
  const f = simulateSync(model, structuredClone(REF["SC-FPLO"].finding));
  const fk = Object.fromEntries(f.contradictions.map((c) => [c.id, c.pax]));
  assert.deepEqual(fk, { "T-612/EDO/time": 118, "T-612/EDO/connection": 46, "T-10109/EDO/time": 116 });
  assert.deepEqual(f.trains.map((t) => [t.train_id, t.pax]), [["T-612", 118], ["T-10109", 116]]);
  assert.equal(f.baseline.affected_pax, 118 + 116);
  // Passengers who planned to board at a stop the diverted train no longer serves are not on board
  // for Köln: of the 247 travelling to Köln Hbf on ICE 1022, the share boarding at Dortmund (186 of
  // the 356 boarding before Köln on the published run) is on board; Hagen and Wuppertal count there.
  const dv = simulateSync(model, structuredClone(REF["SC-DIVERSION"].finding));
  assert.equal(dv.contradictions.find((c) => c.id === "T-1022/KK/time").pax, Math.round(247 * 186 / 356));
  assert.equal(dv.trains.find((t) => t.train_id === "T-1022").pax, 74 + 52 + 96 + Math.round(81 * 186 / 260) + Math.round(247 * 186 / 356) + 18 + 27);
  // Nobody is misinformed twice: neither the baseline nor any variant leaves more passengers
  // misinformed than rely on a wrong fact.
  for (const sc of SCENARIOS) {
    const r = simulateSync(model, structuredClone(REF[sc.id].finding));
    assert.ok(r.baseline.misinformed_pax <= r.baseline.affected_pax, `${sc.id}: misinformed ≤ affected`);
    for (const v of r.variants) assert.ok(v.misinformed_pax <= r.baseline.affected_pax, `${sc.id} ${v.variant_id}: misinformed ≤ affected`);
  }
  ok("passengers counted once where two wrong facts concern the same people (reservations, changers)");
}

{
  // The connection hold: RE 57 waits for ICE 612 if dispatch agrees; who keeps it and who is delayed.
  const f = simulateSync(model, structuredClone(REF["SC-FPLO"].finding));
  const v1 = f.variants.find((v) => v.variant_id === "V1");
  assert.deepEqual({ wait: v1.hold.wait_min, delayed: v1.hold.delayed_pax, held: v1.held_pax, train: v1.hold.train }, { wait: 3, delayed: 98, held: 46, train: "RE 57" });
  assert.match(v1.hold.note, /Dispatch decides/);
  const cx = f.contradictions.find((c) => c.type === "connection");
  assert.equal(cx.expected, "arrival 10:00 leaves 1 min for a 4-minute transfer: connection lost");
  // Alternatives for every stranded group of the diversion, on today's source timetable.
  const d = simulateSync(model, structuredClone(REF["SC-DIVERSION"].finding));
  const alt = (c, kind) => d.alternatives.find((a) => a.contradiction === c && (kind === "boarding" ? /boarding/.test(a.for) : !/boarding/.test(a.for)));
  assert.equal(journeyText(alt("T-1022/KW/stop_not_served", "boarding"), "en"), "RB 30473 from Wuppertal Hbf 08:51, platform 2, arriving Köln Hbf 09:27");
  assert.equal(journeyText(alt("T-1022/EHG/stop_not_served", "boarding"), "de"), "Bus SEV 3 ab Hagen Hbf 08:15 (Ersatzbus), an Wuppertal Hbf 08:54; weiter mit RE 10723 ab Wuppertal Hbf 09:21, Gleis 1, an Köln Hbf 09:57");
  assert.ok(d.alternatives.every((a) => !a.none), "no stranded group without an alternative");
  ok("connection hold (RE 57 waits 3 min: 46 keep it, the 98 others boarding it are delayed) and alternatives for every stranded group");
}

// ---- projection ------------------------------------------------------------------------------------------
{
  assert.equal(customerArr(8 * 3600 + 5 * 60 + 24), 8 * 3600 + 6 * 60, "arrival 08:05.4 → 08:06");
  assert.equal(customerDep(8 * 3600 + 7 * 60 + 12), 8 * 3600 + 7 * 60, "departure 08:07.2 → 08:07");
  assert.equal(customerArr(8 * 3600), 8 * 3600, "a whole minute stays");
  assert.equal(tenthLabel(8 * 3600 + 5 * 60 + 24), "08:05.4");
  assert.equal(minuteLabel(9 * 3600 + 2 * 60), "09:02");
  // Bochum: arrival 08:45.2, departure 08:46.6 → the customer sees 08:46 / 08:46, never an arrival after the departure.
  const v618 = customerView(model, "T-618");
  const ebo = v618.rows.find((r) => r.point === "EBO");
  assert.deepEqual([minuteLabel(ebo.arr), minuteLabel(ebo.dep)], ["08:46", "08:46"]);
  for (const t of WORLD.trains) for (const r of customerView(model, t.id).rows) if (r.arr !== null && r.dep !== null) assert.ok(r.arr <= r.dep, `${t.id} ${r.point}`);
  // Operational stops stay out of the customer view, unless a conversion fault publishes them.
  assert.equal(customerView(model, "T-1027").rows.some((r) => r.point === "KKM"), false);
  assert.equal(customerView(model, "T-1027", { version: 1, faults: ["ops_stop_as_stop"] }).rows.some((r) => r.point === "KKM"), true);
  // A diverted train: cancelled stops against the base timetable, extra stops marked as added.
  const v1022 = customerView(model, "T-1022");
  assert.deepEqual(v1022.cancelled.map((c) => c.point), ["EHG", "KW"]);
  assert.deepEqual(v1022.rows.filter((r) => r.status === "added").map((r) => r.point), ["EE", "KD"]);
  assert.equal(v1022.diverted, true);
  // A train that ends early names its new terminus.
  const v1025 = customerView(model, "T-1025");
  assert.equal(v1025.terminated, true);
  assert.equal(v1025.destination, "Köln Messe/Deutz");
  // The coach order turns with the set: first class at the other end at every boarding stop.
  const cv = customerView(model, "T-516");
  assert.equal(cv.coach.KK.first, "B–C");
  assert.equal(customerView(model, "T-516", { version: 1 }).coach.KK.first, "G–H");
  ok("customer projection: minute rounding, short stops, operational stops, cancelled and extra stops, terminus, coach order");
}

// ---- sweep: honest negatives ---------------------------------------------------------------------------
{
  const scenarioTrains = new Set(SCENARIOS.flatMap((s) => s.exposure_check.train_ids));
  const strays = WORLD.trains.filter((t) => !scenarioTrains.has(t.id) && trainContradictions(model, t.id).length);
  assert.deepEqual(strays.map((t) => t.id), []);
  assert.equal(WORLD.trains.length - scenarioTrains.size, 74);
  // ICE 1023 is diverted too, but published automatically: in sync.
  assert.equal(trainContradictions(model, "T-1023").length, 0);
  const res = simulateSync(model, { train_ids: ["T-1023"] });
  assert.equal(res.baseline.misinformed_pax, 0);
  assert.equal(res.baseline.time_to_sync_min, 0);
  // In sync itself, but the same diversion leaves two other trains wrong: the result says so.
  assert.equal(res.basis, "partial");
  assert.match(res.left_out.join(" "), /same operational change.*ICE 1022, ICE 1026/);
  ok("sweep: 74 trains outside the scenarios match the source; ICE 1023's diversion is published correctly and points to its siblings");
}

// ---- refusals and labels --------------------------------------------------------------------------------
{
  const err = (spec) => { const r = simulateSync(model, spec); assert.equal(r.ok, false); return r.errors.join(" | "); };
  assert.match(err({}), /train_ids: name at least one train/);
  assert.match(err({ train_ids: ["ICE 999"] }), /unknown train "ICE 999"/);
  assert.match(err({ train_ids: ["ICE 618"], channels: ["radio"] }), /"radio" is not a data channel/);
  assert.match(err({ train_ids: ["ICE 618"], stops: ["XX"] }), /unknown point "XX"/);
  assert.match(err({ train_ids: ["ICE 618"], variants: [{ variant_id: "V1", actions: [{ type: "override", channels: ["planner"] }] }] }), /only displays and announcements can be overridden/);
  assert.match(err({ train_ids: ["ICE 618"], variants: [{ variant_id: "V1", actions: [{ type: "teleport" }] }] }), /type must be one of/);
  assert.match(err({ train_ids: ["ICE 618"], variants: [{ variant_id: "V1", actions: [{ type: "hold_request", connection_id: "CX-01" }] }] }), /CX-01 belongs to T-612/);
  assert.match(err({ train_ids: ["ICE 618"], variants: [{ variant_id: "V1", actions: [{ type: "staff" }] }, { variant_id: "V1", actions: [{ type: "staff" }] }] }), /used twice/);
  assert.match(err({ train_ids: ["ICE 618"], variants: Array.from({ length: 7 }, (_, i) => ({ variant_id: `V${i}`, actions: [{ type: "staff" }] })) }), /at most 6/);
  assert.match(err({ train_ids: ["ICE 618"], variants: [{ variant_id: "V1", actions: [{ type: "message", channels: ["coach"] }] }] }), /cannot carry a passenger message/);
  // Partial scopes say what they leave out; a what-if is labelled and changes nothing in the model.
  const partial = simulateSync(model, { train_ids: ["ICE 1022"] });
  assert.equal(partial.basis, "partial");
  assert.match(partial.left_out.join(" "), /ICE 1026/);
  const ch = simulateSync(model, { train_ids: ["ICE 618"], channels: ["planner"] });
  assert.equal(ch.basis, "partial");
  assert.deepEqual(ch.contradictions[0].assumed_right, ["displays", "announcements"]);
  const before = JSON.stringify(sourceState(model, "T-10109"));
  const wi = simulateSync(model, { train_ids: ["RE 10109"], what_if: { changes: [{ train: "RE 10109", op: "skip", point: "KLMI" }] } });
  assert.equal(wi.basis, "what_if");
  assert.ok(wi.contradictions.some((c) => c.point === "KLMI" && c.type === "stop_not_served"));
  assert.equal(JSON.stringify(sourceState(model, "T-10109")), before, "a what-if never changes the source");
  // Trains by number or id; points by Ril 100 code or name.
  assert.equal(findTrain(model, "ice 618")?.id, "T-618");
  assert.equal(findPoint(model, "Köln-Mülheim")?.id, "KKM");
  ok("refusals: unknown trains, channels and points, invalid actions and variant sets; partial scopes and what-ifs labelled");
}

// ---- facts ----------------------------------------------------------------------------------------------------
{
  const kinds = (t) => extractFacts(t).map((f) => `${f.kind}:${f.value}`);
  assert.deepEqual(kinds("ICE 618 leaves at 07:42 from platform 7 instead of Gleis 5."), ["train:ICE 618", "time:07:42", "platform:7", "platform:5"]);
  assert.deepEqual(kinds("Abfahrt 7.42 Uhr, Gl. 7; 312 Reisende, +12 Min"), ["time:07:42", "platform:7", "pax:312", "minutes:12"]);
  assert.deepEqual(kinds("Gleise 5 und 6 gesperrt, 1,6 bis 2,1 Minuten"), ["platform:5", "platform:6", "minutes:2.1"]);
  assert.deepEqual(kinds("a 4-minute transfer, 1,122 passengers, RE 57"), ["minutes:4", "pax:1122", "train:RE 57"]);
  assert.deepEqual(kinds("leaves at 07:44, not 07:42. Rejected at 07:10: extra stops"), ["time:07:44", "time:07:42", "time:07:10"], "a time before punctuation is a time");
  assert.deepEqual(kinds("passes 08:37.6, costs 12.345 and 3.5 %"), [], "tenths of a minute, thousands and percentages are not times");
  // Tool results teach the ledger: a tenth-minute time stands for the minute passengers are shown
  // (an arrival rounded up, a departure down); in a record or remark, for the minutes on either side.
  const known = collectFacts({ rows: [{ arr: "09:02.8", dep: "09:04.6", track: "2" }], remark: "since 07:12.4", passengers: 247, minutes_to_first_event: 19 });
  assert.ok(known.has("time", "09:03") && !known.has("time", "09:02"), "an arrival is shown rounded up");
  assert.ok(known.has("time", "09:04") && !known.has("time", "09:05"), "a departure is shown rounded down");
  assert.ok(known.has("time", "07:12") && known.has("time", "07:13"), "a time in a record stands for both minutes");
  assert.ok(known.has("platform", "2") && known.has("pax", 247) && known.has("minutes", 19));
  assert.deepEqual(unknownFacts("arrives 09:03 on platform 2, 247 passengers, in 19 minutes", known), []);
  assert.deepEqual(unknownFacts("arrives 09:05 on platform 4", known).map((f) => f.raw), ["09:05", "platform 4"]);
  ok("fact audit: English and German forms, tenth-minute times, unknown facts named");
}

// ---- guards ------------------------------------------------------------------------------------------------------
{
  const log = new EvidenceLog();
  const run = (name, input) => { const r = OPS_TOOLS[name](model, input); log.note(name, input, r); return r; };
  const alert = { train_ids: ["T-618"], sources: [{ title: "Operations log OPS-05" }, { title: "Route store ESTW Köln Hbf" }] };
  assert.match(verifiedAlertError(model, { ...alert, sources: [{ title: "a" }, { title: "A" }] }, log), /two distinct sources/);
  run("ops_list_changes", { train: "ICE 618" });
  assert.match(verifiedAlertError(model, alert, log), /published customer view.*physical layer/);
  run("kfp_get_published", { train: "ICE 618" });
  assert.match(verifiedAlertError(model, alert, log), /physical layer/);
  run("phys_observe", { point: "KK" });
  assert.equal(verifiedAlertError(model, alert, log), null);
  // A physical reading that supports another change does not corroborate this train.
  const log2 = new EvidenceLog();
  for (const [n, i] of [["ops_list_changes", { train: "ICE 1027" }], ["ops_get_timetable", { train: "ICE 1027" }], ["kfp_get_published", { train: "ICE 1027" }], ["phys_observe", { point: "EBO" }]]) log2.note(n, i, OPS_TOOLS[n](model, i));
  assert.match(verifiedAlertError(model, { train_ids: ["ICE 1027"], sources: alert.sources }, log2), /no physical observation corroborates/);
  // A lookup that found nothing is not evidence.
  assert.equal(new EvidenceLog().note("ops_list_changes", { train: "ICE 1027" }, OPS_TOOLS.ops_list_changes(model, { train: "ICE 1027" })), false);
  assert.equal(distinctSources([{ title: "X" }, { title: "x " }, { url: "https://a.example/p" }, { url: "https://a.example/p/" }]).length, 2);

  // Scopes: a draft may quote the result the options rest on, never a what-if.
  const ledger = new FactLedger(model);
  const what = simulateSync(model, { train_ids: ["RE 10109"], what_if: { changes: [{ train: "RE 10109", op: "shift_after", point: "EBO", minutes: 9 }] } });
  ledger.addEngine(what);
  // The what-if moves RE 10109's arrival in Dortmund to 10:00 (the source says 09:47).
  assert.equal(ledger.unknown("arrival 10:00", "draft").length, 1, "a what-if time is not a fact for a draft");
  assert.equal(ledger.unknown("arrival 10:00", "narration").length, 0, "narration may discuss the what-if");
  assert.equal(ledger.unknown("arrival 10:00", "report").length, 1, "nor for the summary");
  // Drafts per approved option, and the summary's outcome.
  const v = { action_types: ["republish", "message"] };
  assert.equal(draftError({ type: "passenger_message", approved: { id: "V1", letter: "A" }, variant: v }), null);
  assert.match(draftError({ type: "override_request", approved: { id: "V1", letter: "A" }, variant: v }), /Option A contains no manual override/);
  assert.match(draftError({ type: "passenger_message", approved: null }), /Drafts follow a human decision/);
  assert.match(draftError({ type: "republish_order", approved: { id: "baseline" } }), /accepted the risk/);
  assert.equal(draftError({ type: "memo", approved: { id: "baseline" } }), null);
  assert.deepEqual(reportOutcome({ requested: "response_decided", optionsShown: true, approved: { id: "V2" } }), { outcome: "response_decided" });
  assert.match(reportOutcome({ requested: "response_decided", optionsShown: true, approved: { id: "baseline" } }).error, /risk_accepted/);
  assert.match(reportOutcome({ optionsShown: true, approved: null }).error, /still waiting/);
  assert.deepEqual(reportOutcome({ requested: "no_material_finding", optionsShown: false, approved: null }), { outcome: "no_material_finding" });
  ok("guards: verified alerts need source, published view and a corroborating reading; fact scopes; drafts per option; outcomes");
}

// ---- tools: the live toolbox -------------------------------------------------------------------------------------------
{
  const events = [];
  const decisions = [];
  let onOptions = null;
  const ctx = {
    model, drafts: new Map(),
    emit: (type, payload) => { events.push({ type, payload }); if (type === "options") onOptions?.(payload); },
    waitUntil: async (test) => { const v = test(); if (!v) throw new Error("the test would wait for a human decision"); return v; },
    takeOptionDecision: (pred) => { const i = decisions.findIndex(pred); return i >= 0 ? decisions.splice(i, 1)[0] : null; },
    onPhase: () => {}
  };
  const box = createToolbox(ctx);
  const call = async (name, input) => JSON.parse((await box.execute(name, input)).content);

  // Drafts and options before anything is costed are refused.
  assert.match((await call("ui_draft_action", { type: "passenger_message", recipient: "Desk", subject: "S", body: "B" })).error, /follow a human decision/);
  assert.match((await call("ui_propose_options", { options: [{}, {}, {}], recommended_variant_id: "V1" })).error, /No costed variants/);
  // A verified alert without evidence is refused; the lookups then make it pass.
  assert.match((await call("ui_report_alert", { title: "ICE 618", severity: "high", summary: "Platform 7.", train_ids: ["T-618"], sources: [{ title: "A" }, { title: "B" }] })).error, /needs the source/);
  for (const [n, i] of [["ops_list_changes", { train: "ICE 618" }], ["kfp_get_published", { train: "ICE 618" }], ["phys_observe", { point: "KK" }], ["ops_get_passengers", { train: "ICE 618" }]]) await call(n, i);
  // The fact audit: a time no tool returned is refused twice, then let through and marked as unchecked.
  const badAlert = { title: "ICE 618 leaves at 07:44", severity: "high", summary: "Platform 7.", train_ids: ["T-618"], sources: [{ title: "OPS-05" }, { title: "ESTW Köln Hbf" }] };
  assert.match((await call("ui_report_alert", badAlert)).error, /match nothing this text may quote: 07:44/);
  assert.match((await call("ui_report_alert", badAlert)).error, /07:44/);
  assert.equal((await call("ui_report_alert", badAlert)).ok, true);
  assert.equal(events.filter((e) => e.type === "alert").at(-1).payload.title, "ICE 618 leaves at 07:44 (unchecked)");
  assert.ok(events.some((e) => e.type === "notice" && /alert quotes facts no tool returned for these trains, or an outdated value without the source's \(07:44\)/.test(e.payload.text)));
  const good = await call("ui_report_alert", { title: "ICE 618 leaves from platform 7", severity: "high", summary: "The app shows platform 5 for the departure at 07:42.", train_ids: ["T-618"], sources: [{ title: "OPS-05" }, { title: "ESTW Köln Hbf" }] });
  assert.equal(good.ok, true);
  assert.ok(events.some((e) => e.type === "alert" && e.payload.evidence.length >= 3));
  // Options need a full-scope result from the source with three variants.
  await call("sim_sync", { train_ids: ["ICE 618"], channels: ["planner"], variants: REF["SC-PLATFORM"].finding.variants });
  assert.match((await call("ui_propose_options", { options: [{ variant_id: "V1" }, { variant_id: "V2" }, { variant_id: "V3" }], recommended_variant_id: "V1" })).error, /partial/);
  await call("sim_sync", { train_ids: ["ICE 618"], what_if: { changes: [{ train: "ICE 618", op: "set_track", point: "KK", track: "9" }] }, variants: REF["SC-PLATFORM"].finding.variants });
  assert.match((await call("ui_propose_options", { options: [{ variant_id: "V1" }, { variant_id: "V2" }, { variant_id: "V3" }], recommended_variant_id: "V1" })).error, /what-if/);
  await call("sim_sync", structuredClone(REF["SC-PLATFORM"].finding));
  assert.ok(events.some((e) => e.type === "kpi_update" && e.payload.pax_at_risk === 312 && e.payload.stage === "verified"));
  assert.match((await call("ui_propose_options", { options: [{ variant_id: "V1", title: "A", description: "a", residual_risk: "r" }, { variant_id: "V2", title: "B", description: "b", residual_risk: "r" }, { variant_id: "V2", title: "C", description: "c", residual_risk: "r" }], recommended_variant_id: "V1" })).error, /used twice/);
  assert.match((await call("ui_propose_options", { options: [{ variant_id: "V1", title: "A", description: "a", residual_risk: "r" }, { variant_id: "V2", title: "B", description: "b", residual_risk: "r" }, { variant_id: "V3", title: "C", description: "c", residual_risk: "r" }], recommended_variant_id: "V9" })).error, /not one of the options/);
  // A click queued before the options appeared is dropped, a decision on an older set is ignored; the current one counts.
  decisions.push({ payload: { option_id: "V3", decision: "approved", options_seq: 1 } });
  onOptions = (p) => {
    decisions.push({ payload: { option_id: "V2", decision: "approved", options_seq: p.options_seq - 1 } });
    decisions.push({ payload: { option_id: "V1", decision: "approved", options_seq: p.options_seq } });
  };
  const dec = await call("ui_propose_options", { options: [{ variant_id: "V1", title: "Re-publish ICE 618", description: "Re-publish from the source.", residual_risk: "Late passengers." }, { variant_id: "V2", title: "Messages", description: "Messages.", residual_risk: "Data stays wrong." }, { variant_id: "V3", title: "Override", description: "Hand-set platform 7.", residual_risk: "A second truth." }], recommended_variant_id: "V1" });
  assert.equal(dec.decision, "approved");
  assert.equal(dec.option_id, "V1");
  assert.ok(events.some((e) => e.type === "mirror_update" && e.payload.state === "resolved" && e.payload.contradiction_ids.length === 2));
  // Only what the approved option contains; the draft's facts are checked against the source and the options' result.
  assert.match((await call("ui_draft_action", { type: "override_request", recipient: "Station", subject: "Override", body: "Set platform 7." })).error, /contains no manual override/);
  assert.match((await call("ui_draft_action", { type: "passenger_message", recipient: "Desk", subject: "ICE 618", body: "ICE 618 leaves at 07:45 from platform 7." })).error, /07:45/);
  const d = await call("ui_draft_action", { type: "passenger_message", recipient: "Desk", subject: "ICE 618", body: "ICE 618 nach Hamburg-Altona, 07:42 Uhr, heute von Gleis 7. / ICE 618 to Hamburg-Altona, 07:42, leaves from platform 7 today." });
  assert.equal(d.status, "pending_approval");
  const draftEvent = events.find((e) => e.type === "action_draft");
  assert.match(draftEvent.payload.body, /Source reference: ICE 618: source v2 \(OPS-05\)/);
  assert.ok(draftEvent.payload.body.endsWith(DRAFT_FOOTER));
  // The summary waits for the Outbox and follows the decision.
  assert.match((await call("ui_final_report", { markdown: "## ICE 618\n\nA summary that is long enough to count as one.", outcome: "response_decided" })).error, /still pending/);
  ctx.drafts.get("act-1").status = "approved";
  assert.match((await call("ui_final_report", { markdown: "## ICE 618\n\nA summary that is long enough to count as one.", outcome: "risk_accepted" })).error, /response_decided/);
  const rep = await call("ui_final_report", { markdown: "## ICE 618\n\nWhat we found: every channel shows platform 5; the source says platform 7.", outcome: "response_decided" });
  assert.equal(rep.outcome, "response_decided");
  assert.match(events.find((e) => e.type === "report").payload.markdown, /Live agent run/);
  ok("tools: options only from a full-scope source result, stale decisions ignored, drafts per option and fact-checked, summary after the Outbox");
}

// ---- audit: facts by train, outdated values, sectors, marks, retries ------------------------------------------------
{
  const events = [];
  const decisions = [];
  const ctx = {
    model, drafts: new Map(),
    emit: (type, payload) => {
      events.push({ type, payload });
      if (type === "options") decisions.push({ payload: { option_id: "V1", decision: "approved", options_seq: payload.options_seq } });
    },
    waitUntil: async (test) => { const v = test(); if (!v) throw new Error("the test would wait for a human decision"); return v; },
    takeOptionDecision: (pred) => { const i = decisions.findIndex(pred); return i >= 0 ? decisions.splice(i, 1)[0] : null; },
    onPhase: () => {}
  };
  const box = createToolbox(ctx);
  const call = async (name, input) => JSON.parse((await box.execute(name, input)).content);
  for (const [n, i] of [["ops_list_changes", { train: "ICE 618" }], ["kfp_get_published", { train: "ICE 618" }], ["ops_get_timetable", { train: "ICE 618" }],
    ["phys_observe", { point: "KK" }], ["ops_get_passengers", { train: "ICE 618" }], ["kfp_get_published", { train: "ICE 1022" }]]) await call(n, i);
  await call("sim_sync", structuredClone(REF["SC-PLATFORM"].finding));
  const alert = (title, summary = "OPS-05 at 07:21.") => call("ui_report_alert", { title, severity: "high", summary, train_ids: ["T-618"], sources: [{ title: "OPS-05" }, { title: "ESTW Köln Hbf" }] });

  // The mirror's green and amber follow a human decision; the agent cannot set them on a contradiction.
  assert.match((await call("ui_mark_mirror", { contradiction_ids: ["T-618/KK/platform"], state: "resolved" })).error, /Only a human decision/);
  assert.match((await call("ui_mark_mirror", { contradiction_ids: ["T-618/KK/platform"], state: "at_risk" })).error, /only an approved option/);
  assert.equal((await call("ui_mark_mirror", { train_ids: ["T-618"], state: "at_risk" })).ok, true);
  // Options follow a verified alert.
  const texts = (k) => ({ variant_id: `V${k}`, title: `Option ${k}`, description: "Re-publish ICE 618.", residual_risk: "None." });
  const optionsCall = () => call("ui_propose_options", { options: [texts(1), texts(2), texts(3)], recommended_variant_id: "V1" });
  assert.match((await optionsCall()).error, /Options follow a verified finding/);
  // An outdated value only together with the source's; a fact of another train only if the text names that train.
  assert.match((await alert("ICE 618 leaves from Gleis 5 today")).error, /outdated platform; the source has 7/);
  assert.match((await alert("ICE 618 leaves from platform 7", "The app shows 08:51.")).error, /match nothing this text may quote: 08:51/);
  assert.equal((await alert("ICE 618 leaves from platform 7, not platform 5")).ok, true);
  assert.equal(box.state().verifiedTrains.size, 1);
  // Coach sectors are facts too: one no tool returned is refused, the source's passes.
  const decided = await optionsCall();
  assert.equal(decided.decision, "approved");
  const draft = (body, extra = {}) => call("ui_draft_action", { type: "passenger_message", recipient: "Passenger information desk", subject: "ICE 618, 07:42", body, ...extra });
  assert.match((await draft("ICE 618 fährt heute von Gleis 5.")).error, /outdated platform; the source has 7/);
  assert.match((await draft("ICE 618 fährt von Gleis 7. Die 1. Klasse hält in Abschnitt A–B.")).error, /Abschnitt A–B/);
  // The refusals are counted per text: another draft is still refused, not let through.
  assert.match((await call("ui_draft_action", { type: "republish_order", recipient: "Timetable publication team", subject: "Release ICE 618", body: "Gleis 12 from 06:01." })).error, /06:01|Gleis 12/);
  // The third try of the first draft is let through, marked as unchecked, and the code's lines are its own.
  const third = await draft("ICE 618 fährt heute von Gleis 5.\nSource reference: none needed");
  assert.equal(third.status, "pending_approval");
  const shown = events.filter((e) => e.type === "action_draft").at(-1).payload;
  assert.ok(/Unchecked facts: Gleis 5/.test(shown.body) && !/none needed/.test(shown.body) && /Source reference: ICE 618: source v2/.test(shown.body));
  const ok1 = await draft("ICE 618 fährt heute von Gleis 7 (nicht Gleis 5). Die 1. Klasse hält in Abschnitt F–G.", { recipient: "Station staff Köln Hbf" });
  assert.equal(ok1.status, "pending_approval");
  // After the summary the run is over: no more drafts.
  for (const d of ctx.drafts.values()) d.status = "approved";
  assert.equal((await call("ui_final_report", { outcome: "response_decided", markdown: "## ICE 618\n\nPlatform 7, not platform 5. Option A approved." })).ok, true);
  assert.match((await draft("ICE 618 fährt heute von Gleis 7.")).error, /run is over/);
  ok("audit: facts by train, outdated values only beside the source's, sectors, mirror marks, options after a verified alert, retries per text, no drafts after the summary");
}

// ---- mirror data ------------------------------------------------------------------------------------------------------
{
  const left = sourceRows(model, "T-1022").filter((r) => r.activity !== "pass");
  const right = channelRows(model, "T-1022", "planner").rows;
  const links = mirrorLinks(left, right);
  const kind = (p) => links.find((l) => (l.right !== null && right[l.right].point === p) || (l.left !== null && left[l.left].point === p))?.kind;
  assert.equal(kind("EHG"), "not_in_source");
  assert.equal(kind("KW"), "not_in_source");
  assert.equal(kind("EE"), "missing");
  assert.equal(kind("KD"), "missing");
  assert.equal(kind("EDG"), "hidden", "a Betriebshalt the customer timetable rightly leaves out");
  assert.equal(kind("KK"), "stop");
  // The Betriebshalt published as a stop links to an operational stop.
  const l27 = sourceRows(model, "T-1027");
  const r27 = channelRows(model, "T-1027", "planner").rows;
  assert.equal(mirrorLinks(l27, r27).find((l) => l.right !== null && r27[l.right].point === "KKM").kind, "ops_stop");
  // Placement: in order, never closer than a row, as close as possible to the source row.
  const tops = placeRight(left.map((_, i) => i * 44), links, right.length, 44, left.length * 44);
  for (let j = 1; j < tops.length; j++) assert.ok(tops[j] - tops[j - 1] >= 44, "rows never overlap");
  const anchored = links.filter((l) => l.left !== null && l.right !== null);
  for (const l of anchored) if (right[l.right].point === "EDO") assert.equal(tops[l.right], l.left * 44);
  // Published rows include the stops a channel shows as cancelled, in time order.
  assert.deepEqual(channelRows(model, "T-1025", "displays").rows.map((r) => `${r.point}:${r.status}`).slice(-2), ["KKDZ:added", "KK:cancelled"]);
  // The strip: today's route (main line) and the published one (Wuppertal line) for ICE 1022.
  const strip = stripData(model, "T-1022");
  assert.ok(strip.route.includes("EE") && !strip.route.includes("KW") && strip.published.includes("KW") && strip.opsStops.includes("EDG"));
  assert.deepEqual(positionNow(model, sourceState(model, "T-1022").rows), { at: "EDO", between: null, state: "waiting" });
  // The monitor: no S-Bahn shuttles, first departure first, created trips named.
  const mon = monitorTrains(model);
  assert.ok(mon.length === 34 && mon.every((r) => r.category !== "S"));
  for (let i = 1; i < mon.length; i++) assert.ok(mon[i].first_min >= mon[i - 1].first_min);
  assert.equal(mon.find((r) => r.id === "T-SEV1").created_by, "OPS-03");
  // What a lookup touches, and what its result confirmed.
  assert.deepEqual(callTrains(model, "sim_sync", { train_ids: ["ICE 1022", "T-1026", "nope"] }), ["T-1022", "T-1026"]);
  assert.deepEqual(callPoints(model, "ops_find_alternatives", { from: "Wuppertal Hbf", to: "KK" }), ["KW", "KK"]);
  const rc = resultChecks(model, "phys_observe", OPS_TOOLS.phys_observe(model, { train: "ICE 1022" }));
  assert.deepEqual(rc.checks, [{ train: "T-1022", kind: "physical" }]);
  assert.deepEqual(rc.points.sort(), ["EDO", "KWO"]);
  assert.deepEqual(resultChecks(model, "phys_observe", OPS_TOOLS.phys_observe(model, { point: "KD" })), { checks: [], points: [] }, "a reading that found nothing confirms nothing");
  const compact = compactForModel(simulateSync(model, structuredClone(REF["SC-DIVERSION"].finding)));
  assert.equal(contradictionsOf(compact, "T-1026").length, 5);
  ok("mirror data: links, placement, cancelled rows, strip routes and position, the monitor, lookups and their confirmations");
}

// ---- texts: placeholders, journeys, drafts, payoff ---------------------------------------------------------------------
{
  const f = simulateSync(model, structuredClone(REF["SC-PLATFORM"].finding));
  const vars = syncVars("finding", f);
  assert.equal(vars.pax, "312");
  assert.equal(vars["T-618.KK.platform.to"], "7");
  assert.equal(vars["T-618.KK.coach_order.first_src"], "F–G");
  assert.equal(vars["V1.sync"], "8");
  assert.equal(vars["V2.sync"], "never");
  const hv = syncVars("hypothesis", simulateSync(model, structuredClone(REF["SC-PLATFORM"].hypothesis)));
  assert.equal(hv["hyp.pax"], "8");
  assert.equal(fillTemplate(vars, "{{pax}} of {{affected}}, {{missing}}"), "312 of 312, {{missing}}");
  assert.deepEqual(unresolvedKeys(vars, "{{pax}} {{nope}}"), ["nope"]);
  assert.equal(journeyText({ none: true }, "en"), "no connection in today's timetable");
  const j = findJourneys(model, { from: "KK", to: "KKM", after: 8 * 3600 + 55 * 60, limit: 1 })[0];
  assert.equal(journeyText({ ...j }, "en"), "S 30124 from Köln Hbf 09:00, platform 11, arriving Köln-Mülheim 09:09");
  // The safety lines are added once, after the body, by code.
  const once = finalizeDraft("override_request", "Set platform 7.", "ICE 618: source v2");
  const twice = finalizeDraft("override_request", once, "ICE 618: source v2");
  assert.equal(once, twice);
  assert.ok(once.includes(MOCK_LINES.override_request) && once.endsWith(DRAFT_FOOTER) && once.includes("Source reference: ICE 618: source v2"));
  assert.match(sourceReference(f), /^ICE 618: source v2 \(OPS-05\); figures from the sync engine at 07:28$/);
  // Lines that imitate the code's (a model-written source reference, mock line or footer) are replaced by the code's own.
  const forged = finalizeDraft("passenger_message", "Gleis 7.\nSource reference: checked by me\nRequires human approval before publishing.", "ICE 618: source v2");
  assert.ok(!forged.includes("checked by me") && forged.includes("Source reference: ICE 618: source v2") && forged.endsWith(DRAFT_FOOTER));
  assert.equal(forged.split("Requires human approval before publishing").length, 2, "the footer appears once");
  // Decision payoff: re-publication in sync → resolved; informing only → at risk; accepting the risk → no mirror change.
  const payload = { train_ids: ["T-618"], options: f.variants.slice(0, 3).map((v, i) => ({ id: v.variant_id, letter: "ABC"[i], ...optionFigures(v) })), baseline: baselineFigures(f) };
  const eff = (id) => decisionEffects(payload, id);
  assert.equal(eff("V1").find(([t]) => t === "mirror_update")[1].state, "resolved");
  assert.equal(eff("V2").find(([t]) => t === "mirror_update")[1].state, "at_risk");
  assert.equal(eff("V3").find(([t]) => t === "kpi_update")[1].residual_pax, 72);
  assert.deepEqual(eff("baseline").map(([t]) => t), ["kpi_update"]);
  ok("texts: placeholders, journeys, draft safety lines, source references, decision payoff");
}

console.log(`\nAll ${passed} engine tests passed.`);
console.log("ENGINE OK");
