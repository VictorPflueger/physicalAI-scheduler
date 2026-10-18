// Queries over the world model: the operations log, the source timetable (Betriebsfahrplan), the
// published customer timetable per channel (Kundenfahrplan), the physical layer, the passengers and
// alternative journeys. Pure functions of the model, shared by the live agent's tools, the
// simulation player (which re-runs them), the mirror's popovers and the integrity checks.
//
// Every result says where it comes from and which version it describes, so a fact can always be
// traced back to its source record.

import {
  DATA_CHANNELS, sourceState, publishedInfo, currentVersion, changesOf, findTrain, findPoint, pointName,
  tenthLabel, minuteLabel, nowLabel, minutesFromNow, runLabel
} from "./world.js";
import { customerView, findJourneys } from "./sync.js";
import { appToday } from "./clock.js";

const ACTIVITY = {
  start: { de: "Abfahrt (Zuganfang)", en: "first departure" },
  stop: { de: "Verkehrshalt", en: "passenger stop" },
  ops_stop: { de: "Betriebshalt", en: "operational stop (no passengers)" },
  pass: { de: "Durchfahrt", en: "passes without stopping" },
  end: { de: "Ankunft (Zugende)", en: "last arrival" }
};

const CHANNEL_IDS = DATA_CHANNELS;

function trainOrError(model, ref) {
  const t = findTrain(model, ref);
  return t ? { t } : { error: `Unknown train "${ref ?? ""}". Use ids like T-618 or numbers like "ICE 618" (ops_get_overview lists them).` };
}

/** Operating snapshot: time, network, the trains in the window, the publication cycle. */
export function opsOverview(model) {
  const H = model.horizonMin;
  const trains = [...model.trains.values()]
    .map((t) => {
      const st = sourceState(model, t.id);
      const first = st.rows[0];
      const last = st.rows[st.rows.length - 1];
      const firstT = first.dep ?? first.arr;
      const lastT = last.arr ?? last.dep;
      return { t, st, firstT, lastT };
    })
    .filter((x) => x.lastT >= model.now && x.firstT <= model.now + H * 60 && x.t.category !== "S")
    .sort((a, b) => a.firstT - b.firstT)
    .map(({ t, st, firstT, lastT }) => ({
      id: t.id, number: t.number, line: t.line, category: t.category,
      from: t.from, to: t.to,
      corridor_run: runLabel(model, t, st.rows),
      source_version: currentVersion(model, t.id),
      changes: changesOf(model, t.id).map((c) => c.id),
      ...(t.created_by ? { created_by: t.created_by } : {})
    }));
  return {
    operating_day: appToday().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    snapshot_time: nowLabel(model),
    snapshot_note: model.world.meta.snapshot_note,
    horizon_min: H,
    corridor: model.world.meta.title,
    stations: [...model.points.values()].map((p) => `${p.ril100} ${p.name}`),
    lines: model.world.lines.map((l) => l.name),
    trains_in_window: trains,
    s_bahn: "S 11 shuttles Köln Hbf – Köln Messe/Deutz – Köln-Mülheim every 10 minutes (not listed).",
    operational_changes_today: model.world.changes.map((c) => ({ id: c.id, time: minuteLabel(c.at), source: c.source, kind: c.kind, trains: c.trains.map((id) => model.trains.get(id)?.number || id) })),
    publication: {
      channels: Object.fromEntries(Object.entries(model.channels).map(([k, v]) => [k, v.label])),
      cycle: `every ${model.publication.cycle_min} minutes; next run ${minuteLabel(model.publication.next_cycle)}`,
      daily_generation: minuteLabel(model.publication.daily_run)
    },
    source_note: "The source (Betriebsfahrplan and operations log) is the single truth. Customer channels are derived from it and can lag behind; this overview does not say which ones do."
  };
}

/** The operations log: dispatch decisions, construction orders, vehicle changes. */
export function opsListChanges(model, { train = null, point = null, kind = null, since = null } = {}) {
  let list = model.world.changes;
  let t = null;
  if (train) {
    const r = trainOrError(model, train);
    if (r.error) return { error: r.error };
    t = r.t;
    list = list.filter((c) => c.trains.includes(t.id));
  }
  if (point) {
    const p = findPoint(model, point);
    if (!p) return { error: `Unknown point "${point}". Use a Ril 100 code such as KK or a station name.` };
    list = list.filter((c) => c.ops.some((op) => op.point === p.id || (op.rows || []).some((r) => r.point === p.id)) || c.text.includes(p.name));
  }
  if (kind) list = list.filter((c) => c.kind === kind);
  if (since) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(since));
    if (m) list = list.filter((c) => c.at >= Number(m[1]) * 3600 + Number(m[2]) * 60);
  }
  return {
    source: "Operations log (dispatch, construction orders, vehicle planning) — part of the source",
    count: list.length,
    changes: list.map((c) => ({
      id: c.id, time: minuteLabel(c.at), source: c.source, kind: c.kind,
      train_ids: c.trains, trains: c.trains.map((id) => model.trains.get(id)?.number || id),
      record: c.text,
      versions: c.trains.map((id) => `${model.trains.get(id)?.number || id}: version ${1 + changesOf(model, id).findIndex((x) => x.id === c.id) + 1}`),
      ...(c.creates_trips ? { creates_trips: c.creates_trips.map((id) => model.trains.get(id)?.number || id) } : {})
    })),
    ...(t && !list.length ? { note: `No operational change touches ${t.number}: its source timetable is the base timetable (version 1).` } : {})
  };
}

/** The source timetable of a train (Betriebsfahrplan), in its current or an earlier version. */
export function opsGetTimetable(model, { train, version = null } = {}) {
  const r = trainOrError(model, train);
  if (r.error) return { error: r.error };
  const t = r.t;
  const current = currentVersion(model, t.id);
  const v = version === null || version === undefined ? current : Number(version);
  if (!Number.isInteger(v) || v < 1 || v > current) return { error: `version must be between 1 and ${current} for ${t.number}.` };
  const st = sourceState(model, t.id, v);
  const history = [{ version: 1, what: "base timetable" }, ...changesOf(model, t.id).map((c, i) => ({ version: i + 2, change: c.id, time: minuteLabel(c.at), source: c.source, kind: c.kind }))];
  return {
    source: "Betriebsfahrplan (source timetable), operational depth: every operating point, tenths of a minute",
    train_id: t.id, number: t.number, line: t.line, from: t.from, to: t.to,
    version: v, current_version: current, history,
    rows: st.rows.map((row) => ({
      point: row.point, station: pointName(model, row.point),
      activity: row.activity, activity_de: ACTIVITY[row.activity]?.de, activity_en: ACTIVITY[row.activity]?.en,
      ...(row.arr !== null && row.arr !== undefined ? { arr: tenthLabel(row.arr) } : {}),
      ...(row.dep !== null && row.dep !== undefined ? { dep: tenthLabel(row.dep) } : {}),
      ...(row.pass !== null && row.pass !== undefined ? { pass: tenthLabel(row.pass) } : {}),
      ...(row.track ? { track: row.track } : {}),
      ...(row.remark ? { remark: row.remark } : {})
    })),
    ...(t.consist ? { consist: { order: st.order, leading_car: (st.order === "reversed" ? [...t.consist.cars].reverse() : t.consist.cars)[0].car, cars: t.consist.cars.length, length_m: t.consist.length_m } } : {})
  };
}

const CHANNEL_NOTE = {
  planner: "Journey planner and app (Reiseauskunft): timetable, platforms, connections",
  displays: "Station displays (departure boards, platform displays)",
  announcements: "Automatic announcements at stations and on board",
  coach: "Coach order (app and platform coach-position displays)"
};

/** What passengers are told: the published customer timetable per channel, with its version. */
export function kfpGetPublished(model, { train, channel = null } = {}) {
  const r = trainOrError(model, train);
  if (r.error) return { error: r.error };
  const t = r.t;
  if (channel && !CHANNEL_IDS.includes(channel)) return { error: `channel must be one of ${CHANNEL_IDS.join(", ")}.` };
  const chans = channel ? [channel] : CHANNEL_IDS.filter((c) => c !== "coach" || t.consist);
  const current = currentVersion(model, t.id);
  const channels = {};
  for (const ch of chans) {
    const info = publishedInfo(model, t.id, ch);
    const view = customerView(model, t.id, { version: info.version, faults: info.faults });
    const cause = info.cause ? model.causes[info.cause] : null;
    channels[ch] = {
      shows: CHANNEL_NOTE[ch],
      generated_from_version: info.version,
      generated_at: minuteLabel(info.at),
      ...(cause ? { publication_note: `${cause.title}: ${cause.text}` } : {}),
      ...(ch === "coach"
        ? { coach_order: Object.fromEntries(Object.entries(view.coach || {}).map(([p, c]) => [pointName(model, p), `1st class ${c.first}, restaurant ${c.restaurant}, 2nd class ${c.second}`])) }
        : {
          destination: view.destination,
          stops: view.rows.map((x) => ({
            station: x.station, point: x.point,
            ...(x.arr !== null ? { arr: minuteLabel(x.arr) } : {}),
            ...(x.dep !== null ? { dep: minuteLabel(x.dep) } : {}),
            ...(x.platform ? { platform: x.platform } : {}),
            ...(x.status !== "ok" ? { note: x.status === "added" ? "extra stop" : x.status } : {})
          })),
          ...(view.cancelled.length ? { cancelled_stops: view.cancelled.map((c) => c.station) } : {}),
          ...(view.diverted ? { note: "diversion" } : {})
        })
    };
  }
  return {
    source: "Published customer timetable (Kundenfahrplan) as the channels show it now",
    train_id: t.id, number: t.number, current_source_version: current,
    channels
  };
}

/** The physical layer: what sensors, interlockings and train systems observed. */
export function physObserve(model, { train = null, point = null } = {}) {
  let t = null;
  let p = null;
  if (train) {
    const r = trainOrError(model, train);
    if (r.error) return { error: r.error };
    t = r.t;
  }
  if (point) {
    p = findPoint(model, point);
    if (!p) return { error: `Unknown point "${point}". Use a Ril 100 code such as KK or a station name.` };
  }
  if (!t && !p) return { error: "Name a train, a point (Ril 100 code or station name), or both." };
  const changeIds = t ? changesOf(model, t.id).map((c) => c.id) : [];
  const list = model.world.observations.filter((o) => {
    if (t && p) return (o.trains.includes(t.id) || o.supports.some((s) => changeIds.includes(s) || s.startsWith(`${t.id}:`))) && (o.point === p.id || o.trains.includes(t.id));
    if (t) return o.trains.includes(t.id) || o.supports.some((s) => changeIds.includes(s) || s.startsWith(`${t.id}:`));
    return o.point === p.id;
  });
  const position = t ? positionOf(model, t) : null;
  return {
    source: "Physical layer: trackside and on-train sensing (interlocking, point diagnostics, train positioning, door logs, infrastructure register)",
    ...(t ? { train_id: t.id, number: t.number } : {}),
    ...(p ? { point: p.id, station: p.name, platforms: Object.fromEntries(Object.entries(p.tracks).filter(([, s]) => !s.bus).map(([k, s]) => [k, `${s.length_m} m`])) } : {}),
    ...(position ? { position_now: position } : {}),
    count: list.length,
    observations: list.map((o) => ({
      id: o.id, time: minuteLabel(o.at), kind: o.kind, source: o.source, station: pointName(model, o.point),
      reading: o.text, train_ids: o.trains, supports: o.supports
    })),
    ...(list.length ? {} : { note: "No observation found for this query." })
  };
}

function positionOf(model, t) {
  const st = sourceState(model, t.id);
  let last = null;
  for (const r of st.rows) {
    const tt = r.dep ?? r.pass ?? r.arr;
    if (tt !== null && tt !== undefined && tt <= model.now) last = r;
  }
  if (!last) {
    const first = st.rows[0];
    return `not yet departed; first departure ${pointName(model, first.point)} ${minuteLabel(first.dep)} (in ${minutesFromNow(model, first.dep)} min)`;
  }
  const end = st.rows[st.rows.length - 1];
  if (last === end) return `arrived at ${pointName(model, end.point)}`;
  return `between ${pointName(model, last.point)} and the next point (last seen ${tenthLabel(last.dep ?? last.pass ?? last.arr)})`;
}

/** Passengers per stop (boarding, alighting, seat reservations) and the connections from the train. */
export function opsGetPassengers(model, { train } = {}) {
  const r = trainOrError(model, train);
  if (r.error) return { error: r.error };
  const t = r.t;
  const stops = Object.entries(t.passengers || {}).map(([p, v]) => ({
    station: pointName(model, p), point: p, board: v.board || 0, alight: v.alight || 0, reserved_board: v.reserved_board || 0, ...(v.note ? { note: v.note } : {})
  }));
  const connections = model.connections.filter((c) => c.from_train === t.id).map((c) => {
    const to = model.trains.get(c.to_train);
    const row = sourceState(model, c.to_train).rows.find((x) => x.point === c.at);
    return { id: c.id, at: pointName(model, c.at), to: `${to.number} to ${to.to}`, to_dep: minuteLabel(Math.floor(row.dep / 60) * 60), min_transfer_min: c.min_transfer_min, passengers: c.passengers };
  });
  return {
    source: "Passenger figures: counts and bookings for today (estimates per stop)",
    train_id: t.id, number: t.number, stops, connections,
    note: "Boarding and alighting per stop as planned. For a stop the published timetable lists but the source does not serve, these are the passengers who rely on it."
  };
}

/** Alternative journeys on today's source timetable (diversions and cuts included). */
export function opsFindAlternatives(model, { from, to, after = null } = {}) {
  const a = findPoint(model, from);
  const b = findPoint(model, to);
  if (!a) return { error: `Unknown point "${from ?? ""}". Use a Ril 100 code such as KK or a station name.` };
  if (!b) return { error: `Unknown point "${to ?? ""}".` };
  let t0 = model.now;
  if (after) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(after));
    if (!m) return { error: "after must be a time like 08:07." };
    t0 = Number(m[1]) * 3600 + Number(m[2]) * 60;
  }
  const journeys = findJourneys(model, { from: a.id, to: b.id, after: t0, limit: 2 });
  return {
    source: "Journey search on the current source timetable (every diversion, cut and replacement bus included)",
    from: a.name, to: b.name, after: minuteLabel(t0),
    count: journeys.length,
    journeys: journeys.map((j) => ({
      arrival: j.arrival_label, transfers: j.transfers,
      legs: j.legs.map((l) => ({ train: l.number, line: l.line, from: l.from_station, dep: l.dep_label, platform: l.platform, to: l.to_station, arr: l.arr_label, ...(l.arr_platform ? { arr_platform: l.arr_platform } : {}) }))
    })),
    ...(journeys.length ? {} : { note: "No journey within two changes on today's timetable." })
  };
}

export const OPS_TOOLS = {
  ops_get_overview: (model) => opsOverview(model),
  ops_list_changes: (model, i) => opsListChanges(model, i),
  ops_get_timetable: (model, i) => opsGetTimetable(model, i),
  kfp_get_published: (model, i) => kfpGetPublished(model, i),
  phys_observe: (model, i) => physObserve(model, i),
  ops_get_passengers: (model, i) => opsGetPassengers(model, i),
  ops_find_alternatives: (model, i) => opsFindAlternatives(model, i)
};
