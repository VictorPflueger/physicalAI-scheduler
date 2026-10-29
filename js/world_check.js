// Integrity checks for the synthetic operating snapshot, the scenarios and the reference cases.
// Runs in the browser (Diagnostics panel) and in Node (tools/check_world.mjs).

import { buildModel, sourceState, currentVersion, publishedInfo, DATA_CHANNELS } from "./world.js";
import { simulateSync, trainContradictions, customerView } from "./sync.js";
import { checkSimRuns } from "./sim_check.js";

const RIL100 = /^[A-Z]{2,5}$/;

/**
 * @returns {{ok: boolean, checks: Array<{name: string, ok: boolean, detail: string}>, stats: object}}
 */
export function checkWorld(world, scenarios = [], referenceCases = {}, simRuns = null) {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });
  const model = buildModel(world);

  add("Model builds without structural problems", model.problems.length === 0, model.problems.slice(0, 5).join(" | ") || "no problems");

  // ---- counts ---------------------------------------------------------------------------------
  add("20 operating points with Ril 100 codes (16 in the corridor, 4 beyond it), 4 lines, 7 injectable scenarios",
    world.points.length === 20 && world.points.filter((p) => p.beyond).length === 4 && world.points.every((p) => RIL100.test(p.ril100) && p.ril100 === p.id) && world.lines.length === 4 && scenarios.length === 7,
    `${world.points.length} operating points, ${world.lines.length} lines, ${scenarios.length} scenarios`);

  // ---- trips: network, times, tracks ------------------------------------------------------------------
  const net = new Set(world.segments.flatMap((s) => [`${s.a}-${s.b}`, `${s.b}-${s.a}`]));
  const bus = new Set(["EHG-KWO", "KWO-KW", "KWO-EHG", "KW-KWO"]);
  const trip = [];
  for (const t of world.trains) {
    for (let v = 1; v <= currentVersion(model, t.id); v++) {
      const rows = sourceState(model, t.id, v).rows;
      let last = -1;
      rows.forEach((r, i) => {
        if (i && !net.has(`${rows[i - 1].point}-${r.point}`) && !(t.category === "Bus" && bus.has(`${rows[i - 1].point}-${r.point}`))) trip.push(`${t.id} v${v}: no line ${rows[i - 1].point}–${r.point}`);
        for (const k of ["arr", "dep", "pass"]) {
          const x = r[k];
          if (x === null || x === undefined) continue;
          if (x % 6) trip.push(`${t.id} v${v} ${r.point}: ${k} not a tenth of a minute`);
          if (x < last) trip.push(`${t.id} v${v} ${r.point}: time runs backwards`);
          last = Math.max(last, x);
        }
        if (r.activity !== "pass" && r.track && !model.points.get(r.point)?.tracks?.[r.track]) trip.push(`${t.id} v${v} ${r.point}: unknown track ${r.track}`);
      });
      if (!t.continues_beyond && rows.length > 1 && rows[rows.length - 1].activity !== "end") trip.push(`${t.id} v${v}: last row is not an end`);
      if (rows[0].activity !== "start") trip.push(`${t.id} v${v}: first row is not a start`);
    }
  }
  add("Every trip runs on the network, forwards in time, in tenths of a minute, on existing tracks", trip.length === 0, trip.slice(0, 5).join(" | ") || `${world.trains.length} trips in every version`);

  // ---- operational changes, observations, publication ------------------------------------------------
  const ops = [];
  for (const c of world.changes) {
    if (!c.text || !c.source) ops.push(`${c.id}: no record text or source`);
    for (const id of c.trains) if (!model.trains.has(id)) ops.push(`${c.id}: unknown train ${id}`);
    for (const op of c.ops) if (!c.trains.includes(op.train)) ops.push(`${c.id}: operates on ${op.train}, which it does not list`);
  }
  add("Operational changes: a record, a source, and only the trains they list", ops.length === 0, ops.slice(0, 5).join(" | ") || `${world.changes.length} changes`);

  const obs = [];
  for (const o of world.observations) {
    if (!model.points.has(o.point)) obs.push(`${o.id}: unknown point ${o.point}`);
    for (const id of o.trains) if (!model.trains.has(id)) obs.push(`${o.id}: unknown train ${id}`);
    for (const s of o.supports) if (!model.changes.has(s) && !/^T-[\w-]+:[A-Z]+:[a-z_]+$/.test(s)) obs.push(`${o.id}: supports unknown ${s}`);
  }
  const uncorroborated = world.changes.filter((c) => !world.observations.some((o) => o.supports.includes(c.id))).map((c) => c.id);
  add("Physical layer: every observation is placed, and every operational change is corroborated by one", obs.length === 0 && uncorroborated.length === 0,
    [...obs, ...uncorroborated.map((id) => `${id}: no observation`)].slice(0, 5).join(" | ") || `${world.observations.length} observations corroborate ${world.changes.length} changes`);

  const pub = [];
  for (const [id, chans] of Object.entries(world.published || {})) {
    if (!model.trains.has(id)) { pub.push(`unknown train ${id}`); continue; }
    for (const [ch, e] of Object.entries(chans)) {
      if (!e) continue;
      if (ch !== "all" && !DATA_CHANNELS.includes(ch) && ch !== "app_push") pub.push(`${id}: unknown channel ${ch}`);
      if (!(e.version >= 1 && e.version <= currentVersion(model, id))) pub.push(`${id} ${ch}: version ${e.version} outside 1–${currentVersion(model, id)}`);
      if (e.cause && !world.causes[e.cause]) pub.push(`${id} ${ch}: unknown cause ${e.cause}`);
    }
  }
  add("Publication states name existing versions and causes", pub.length === 0, pub.slice(0, 5).join(" | ") || `${Object.keys(world.published).length} trains with a publication lag or fault`);

  const cx = [];
  for (const c of world.connections) {
    const from = sourceState(model, c.from_train, 1)?.rows.find((r) => r.point === c.at);
    const to = sourceState(model, c.to_train, 1)?.rows.find((r) => r.point === c.at);
    if (!from || !to) { cx.push(`${c.id}: trains do not meet at ${c.at}`); continue; }
    if (Math.ceil(from.arr / 60) * 60 + c.min_transfer_min * 60 > Math.floor(to.dep / 60) * 60) cx.push(`${c.id}: not reachable even in the base timetable`);
  }
  add("Connections are reachable in the base timetable", cx.length === 0, cx.join(" | ") || `${world.connections.length} connection(s)`);

  // The engine counts each passenger once: those with seat reservations are among those boarding,
  // those who change among those alighting (js/sync.js, distinctPax).
  const nest = [];
  for (const t of world.trains) {
    for (const [p, n] of Object.entries(t.passengers || {})) {
      if ((n.reserved_board || 0) > (n.board || 0)) nest.push(`${t.id} ${p}: ${n.reserved_board} reservations, ${n.board || 0} boarding`);
    }
  }
  for (const c of world.connections) {
    const alight = model.trains.get(c.from_train)?.passengers?.[c.at]?.alight || 0;
    if (c.passengers > alight) nest.push(`${c.id}: ${c.passengers} changing, ${alight} alighting`);
  }
  add("Passenger groups nest: reservations within boarding, changers within alighting", nest.length === 0, nest.slice(0, 5).join(" | ") || "every subset within its stop's count");

  // ---- the customer projection ---------------------------------------------------------------------------
  const proj = [];
  for (const t of world.trains) {
    const v = customerView(model, t.id);
    if (!v.rows.length) proj.push(`${t.id}: no customer stop`);
    for (const r of v.rows) {
      for (const k of ["arr", "dep"]) if (r[k] !== null && r[k] % 60) proj.push(`${t.id} ${r.point}: customer ${k} not a whole minute`);
      if (r.arr !== null && r.dep !== null && r.arr > r.dep) proj.push(`${t.id} ${r.point}: arrives after it departs`);
    }
  }
  add("The customer view of every trip has whole-minute times in order", proj.length === 0, proj.slice(0, 5).join(" | ") || `${world.trains.length} customer views`);

  // ---- scenarios bite, and only they --------------------------------------------------------------------------
  const scenarioTrains = new Set(scenarios.flatMap((s) => s.exposure_check?.train_ids || []));
  for (const sc of scenarios) {
    const ex = sc.exposure_check || {};
    const found = (ex.train_ids || []).flatMap((id) => trainContradictions(model, id));
    const types = new Set(found.map((c) => c.type));
    const ok = (ex.train_ids || []).length && ex.train_ids.every((id) => model.trains.has(id)) && (ex.types || []).every((ty) => types.has(ty));
    add(`Scenario ${sc.number}: its trains show the contradictions it is about`, ok, `${(ex.train_ids || []).join(", ")}: ${[...types].join(", ") || "none"}`);
  }
  const strays = world.trains.filter((t) => !scenarioTrains.has(t.id) && trainContradictions(model, t.id).length).map((t) => t.number);
  add("Every train outside the scenarios matches the source (honest sweep negatives)", strays.length === 0, strays.join(", ") || `${world.trains.length - scenarioTrains.size} trains in sync`);

  // ---- reference cases run and bite ------------------------------------------------------------------
  const stats = {};
  for (const sc of scenarios) {
    const rc = referenceCases[sc.id];
    if (!rc) { add(`Reference case for scenario ${sc.number}`, false, "missing"); continue; }
    const res = simulateSync(model, structuredClone(rc.finding));
    if (!res.ok) { add(`Reference case ${sc.number} runs`, false, res.errors.join(" | ")); continue; }
    const b = res.baseline;
    stats[sc.id] = { pax: b.misinformed_pax, first_min: b.first_event_min, variants: res.variants.map((v) => ({ id: v.variant_id, mis: v.misinformed_pax, sync: v.time_to_sync_min })) };
    const alts = res.contradictions.flatMap((c) => c.groups.filter((g) => ["stop_not_served", "terminus", "connection"].includes(c.type)).map((g) => ({ c, g })));
    const missingAlt = alts.filter(({ c, g }) => !res.alternatives.some((a) => a.contradiction === c.id && a.for === g.what && !a.none));
    add(`Reference case ${sc.number}: passengers at risk from the source, 3 options, an alternative for every stranded group`,
      b.misinformed_pax > 0 && res.variants.length === 3 && res.basis === "source" && missingAlt.length === 0,
      `${b.misinformed_pax} of ${b.affected_pax} passengers, first in ${b.first_event_min} min${missingAlt.length ? `; no alternative for ${missingAlt.map(({ g }) => g.what).join(", ")}` : ""}`);
    const synced = res.variants.filter((v) => v.time_to_sync_min !== null);
    add(`Reference case ${sc.number}: at least one option brings every channel back in sync`, synced.length >= 1, synced.map((v) => `${v.variant_id} in ${v.time_to_sync_min} min`).join(", ") || "none");
    if (rc.hypothesis) {
      const h = simulateSync(model, structuredClone(rc.hypothesis));
      add(`Reference case ${sc.number}: first estimate runs, is labelled, and differs from the finding`,
        h.ok && h.basis !== "source" && (h.baseline.misinformed_pax !== b.misinformed_pax || h.baseline.contradictions !== b.contradictions || h.trains.length !== res.trains.length),
        h.ok ? `first estimate ${h.baseline.contradictions} contradiction(s), ${h.baseline.misinformed_pax} passengers (${h.basis})` : h.errors.join(" | "));
    }
  }

  // ---- channels publish what the source had at some version ------------------------------------------------
  const lag = [];
  for (const t of world.trains) {
    for (const ch of DATA_CHANNELS) {
      const info = publishedInfo(model, t.id, ch);
      if (info.version > currentVersion(model, t.id)) lag.push(`${t.id} ${ch}: ahead of the source`);
    }
  }
  add("No channel is ahead of the source", lag.length === 0, lag.slice(0, 5).join(" | ") || "channels at or behind the source");

  // ---- simulation scripts ------------------------------------------------------------------------
  if (simRuns) checks.push(...checkSimRuns(model, simRuns, scenarios, referenceCases));

  return { ok: checks.every((c) => c.ok), checks, stats };
}
