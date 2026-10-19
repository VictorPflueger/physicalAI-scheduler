// The deterministic sync engine (no LLM maths). It derives what every customer channel should show
// from the single source, compares that with what each channel has published, and works out which
// passengers would act on wrong information and how soon. For response variants it computes, from
// stated timings and reach, how many passengers would still be misinformed, when correct information
// reaches them, when every channel is back in sync with the source, how many manual overrides (a
// second, hand-kept truth) a variant creates, and the staff effort.
//
// The engine reads the world model; it never changes it. Hypothetical changes ("what_if") are
// applied to a copy and the result is labelled as such: options may not rest on them.
//
// Contract: simulateSync(model, spec) → { ok: true, … } or { ok: false, errors: [field-level texts] }.

import {
  DATA_CHANNELS, sourceState, publishedInfo, currentVersion, changesOf, customerArr, customerDep,
  minuteLabel, minutesFromNow, pointName, findTrain
} from "./world.js";

export const ENGINE_VERSION = "1.0.0";
export const ACTION_TYPES = ["republish", "message", "override", "staff", "hold_request"];
export const MESSAGE_CHANNELS = ["app_push", "displays", "announcements", "planner"];
export const OVERRIDE_CHANNELS = ["displays", "announcements"];
export const CONTRADICTION_TYPES = ["platform", "time", "stop_not_served", "stop_missing", "terminus", "coach_order", "connection"];
const TIMETABLE_CHANNELS = ["planner", "displays", "announcements"];
const MAX_VARIANTS = 6;

const TYPE_LABEL = {
  platform: "Platform", time: "Time", stop_not_served: "Stop not served", stop_missing: "Stop missing",
  terminus: "Terminus", coach_order: "Coach order", connection: "Connection"
};
export { TYPE_LABEL };

// ---------------------------------------------------------------------------------------------
// Customer projection
// ---------------------------------------------------------------------------------------------

const VISIBLE = new Set(["start", "stop", "end"]);

/**
 * The customer view of a train in a source version: passenger stops with times rounded to the
 * minute (arrivals up, departures down), platforms, cancelled and extra stops against the base
 * timetable, the destination and the coach order at each boarding stop. `faults` are a channel's
 * conversion faults (ops_stop_as_stop publishes a Betriebshalt as a passenger stop).
 */
export function customerView(model, trainId, { version = null, faults = [], extra = [] } = {}) {
  const t = model.trains.get(trainId);
  if (!t) return null;
  const st = sourceState(model, trainId, version, extra);
  const base = sourceState(model, trainId, 1);
  const visible = (r) => VISIBLE.has(r.activity) || (r.activity === "ops_stop" && faults.includes("ops_stop_as_stop"));
  const baseStops = base.rows.filter((r) => VISIBLE.has(r.activity));
  const rows = st.rows.filter(visible).map((r) => {
    const b = baseStops.find((x) => x.point === r.point);
    const dep = r.activity === "end" ? null : customerDep(r.dep);
    let arr = r.activity === "start" ? null : customerArr(r.arr);
    // A short stop can round to an arrival after the departure: the customer sees one minute.
    if (arr !== null && dep !== null && arr > dep) arr = dep;
    return {
      point: r.point,
      station: pointName(model, r.point),
      arr,
      dep,
      platform: r.track ?? null,
      status: !b && (st.version > 1 || st.hypothetical) ? "added" : "ok",
      ...(st.version > 1 && b && b.track && r.track && b.track !== r.track ? { platform_changed_from: b.track } : {}),
      kind: r.activity === "ops_stop" ? "ops_stop" : r.activity
    };
  });
  const present = new Set(rows.map((r) => r.point));
  const cancelled = st.version > 1 || st.hypothetical
    ? baseStops.filter((r) => !present.has(r.point)).map((r) => ({
      point: r.point, station: pointName(model, r.point),
      arr: r.activity === "start" ? null : customerArr(r.arr), dep: r.activity === "end" ? null : customerDep(r.dep),
      platform: r.track ?? null, status: "cancelled"
    }))
    : [];
  const baseLast = base.rows[base.rows.length - 1];
  const last = st.rows[st.rows.length - 1];
  const terminated = !t.continues_beyond && last && baseLast && last.activity === "end" && last.point !== baseLast.point && cancelled.some((c) => c.point === baseLast.point);
  const diverted = st.line !== t.route_line;
  return {
    train_id: trainId, number: t.number, line: t.line, version: st.version, hypothetical: st.hypothetical,
    destination: terminated ? pointName(model, last.point) : t.to,
    terminated: !!terminated, diverted, rows, cancelled,
    coach: coachView(model, t, st, rows)
  };
}

/** First-class, restaurant and second-class sectors at every boarding stop, from the coach order and the platform. */
function coachView(model, t, st, rows) {
  if (!t.consist) return null;
  const cars = st.order === "reversed" ? [...t.consist.cars].reverse() : t.consist.cars;
  const out = {};
  for (const r of rows) {
    if (r.dep === null || !r.platform) continue;
    const p = model.points.get(r.point);
    const spec = p?.tracks?.[r.platform];
    if (!spec || spec.bus) continue;
    const sectors = "ABCDEFGH";
    const frontAtA = spec.a_end === t.direction;
    const at = (i) => sectors[Math.max(0, Math.min(7, frontAtA ? spec.stop_offset + i : 7 - spec.stop_offset - i))];
    const where = (cls) => {
      const idx = cars.map((c, i) => (c.class === cls ? at(i) : null)).filter(Boolean).sort();
      return idx.length ? (idx.length === 1 ? idx[0] : `${idx[0]}–${idx[idx.length - 1]}`) : null;
    };
    out[r.point] = { first: where("1"), restaurant: where("BR"), second: where("2"), leading_car: cars[0].car };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Contradictions: published against derived
// ---------------------------------------------------------------------------------------------

const boardPax = (t, p) => t.passengers?.[p]?.board || 0;
const alightPax = (t, p) => t.passengers?.[p]?.alight || 0;
const reservedPax = (t, p) => t.passengers?.[p]?.reserved_board || 0;

/**
 * Every contradiction of one train across its customer channels. A contradiction is one wrong fact
 * (a platform, a time, a stop, the terminus, the coach order, a connection) at one point, with the
 * channels that show it wrong, the channels that already show it right, the source version and the
 * operational change behind it, the publication cause, and the passenger groups that rely on it.
 */
export function trainContradictions(model, trainId, { extra = [] } = {}) {
  const t = model.trains.get(trainId);
  if (!t) return [];
  const expected = customerView(model, trainId, { extra });
  const src = sourceState(model, trainId, null, extra);
  const found = new Map();
  const add = (key, base, channel, pubInfo) => {
    if (!found.has(key)) found.set(key, { ...base, channels_wrong: [], published_versions: {}, causes: [] });
    const c = found.get(key);
    if (!c.channels_wrong.includes(channel)) c.channels_wrong.push(channel);
    c.published_versions[channel] = pubInfo.version;
    if (pubInfo.cause && !c.causes.includes(pubInfo.cause)) c.causes.push(pubInfo.cause);
  };

  for (const channel of TIMETABLE_CHANNELS) {
    const info = publishedInfo(model, trainId, channel);
    if (info.current && !extra.length) continue;
    const pub = customerView(model, trainId, { version: info.version, faults: info.faults });
    const expRows = expected.rows;
    const pubLast = pub.rows[pub.rows.length - 1];
    for (const r of pub.rows) {
      const e = expRows.find((x) => x.point === r.point);
      if (!e) {
        const srcRow = src.rows.find((x) => x.point === r.point);
        const isTerminus = expected.terminated && pubLast && r.point === pubLast.point;
        if (isTerminus) {
          const end = expRows[expRows.length - 1];
          add(`${trainId}/${r.point}/terminus`, {
            train_id: trainId, point: r.point, type: "terminus",
            published: `${t.number} to ${pub.destination}, arrives ${r.station} ${minuteLabel(r.arr)}`,
            expected: `ends at ${end.station} (arrives ${minuteLabel(end.arr)}); ${r.station} not served`,
            published_value: pub.destination, expected_value: end.station, new_terminus: end.point,
            groups: [{ kind: "onboard", pax: alightPax(t, r.point), event: end.arr - 600, at: end.point, where: `on board before ${end.station}`, what: `passengers for ${r.station}` }]
          }, channel, info);
          continue;
        }
        const why = srcRow?.activity === "ops_stop" ? "ops_stop" : srcRow?.activity === "pass" ? "pass" : "absent";
        add(`${trainId}/${r.point}/stop_not_served`, {
          train_id: trainId, point: r.point, type: "stop_not_served", subtype: why,
          published: `stops at ${r.station}${r.arr ? ` ${minuteLabel(r.arr)}` : ""}${r.dep ? ` (dep ${minuteLabel(r.dep)})` : ""}${r.platform ? `, platform ${r.platform}` : ""}`,
          expected: why === "ops_stop" ? `operational stop only (Betriebshalt): no passengers, doors stay closed` : why === "pass" ? "passes without stopping" : "not on today's route",
          published_value: "stop", expected_value: why,
          groups: [
            { kind: "boarding", pax: boardPax(t, r.point), event: r.dep ?? r.arr, at: r.point, what: `passengers boarding at ${r.station}` },
            { kind: "onboard", ...onboardGroup(model, t, pub.rows, src.rows, r.point), what: `passengers for ${r.station}` }
          ]
        }, channel, info);
        continue;
      }
      if (r.platform && e.platform && r.platform !== e.platform) {
        add(`${trainId}/${r.point}/platform`, {
          train_id: trainId, point: r.point, type: "platform",
          published: `platform ${r.platform}`, expected: `platform ${e.platform}`,
          published_value: r.platform, expected_value: e.platform,
          groups: [{ kind: "boarding", pax: e.dep !== null ? boardPax(t, r.point) : 0, event: r.dep ?? r.arr, at: r.point, what: `passengers boarding at ${r.station}` }]
        }, channel, info);
      }
      const dArr = r.arr !== null && e.arr !== null && r.arr !== e.arr ? (e.arr - r.arr) / 60 : 0;
      const dDep = r.dep !== null && e.dep !== null && r.dep !== e.dep ? (e.dep - r.dep) / 60 : 0;
      if (dArr || dDep) {
        const parts = [];
        if (dArr) parts.push(`arr ${minuteLabel(r.arr)}`);
        if (dDep) parts.push(`dep ${minuteLabel(r.dep)}`);
        const partsE = [];
        if (dArr) partsE.push(`arr ${minuteLabel(e.arr)}`);
        if (dDep) partsE.push(`dep ${minuteLabel(e.dep)}`);
        const groups = [];
        if (dArr) groups.push({ kind: "onboard", ...onboardGroup(model, t, pub.rows, src.rows, r.point), what: `passengers for ${r.station}` });
        if (dDep) groups.push({ kind: "boarding", pax: boardPax(t, r.point), event: Math.min(r.dep, e.dep), at: r.point, what: `passengers boarding at ${r.station}` });
        add(`${trainId}/${r.point}/time`, {
          train_id: trainId, point: r.point, type: "time",
          published: parts.join(", "), expected: partsE.join(", "),
          published_value: { arr: r.arr, dep: r.dep }, expected_value: { arr: e.arr, dep: e.dep },
          delta_min: dArr || dDep, groups
        }, channel, info);
      }
    }
    for (const e of expRows) {
      if (pub.rows.some((x) => x.point === e.point)) continue;
      if (expected.terminated && e.point === expRows[expRows.length - 1].point) continue; // part of the terminus contradiction
      add(`${trainId}/${e.point}/stop_missing`, {
        train_id: trainId, point: e.point, type: "stop_missing",
        published: `not listed`, expected: `extra stop ${e.station}${e.arr ? ` arr ${minuteLabel(e.arr)}` : ""}${e.dep ? ` dep ${minuteLabel(e.dep)}` : ""}${e.platform ? `, platform ${e.platform}` : ""}`,
        published_value: null, expected_value: "stop",
        groups: [{ kind: "boarding", pax: boardPax(t, e.point), event: e.dep ?? e.arr, at: e.point, what: `passengers who could board at ${e.station}` }]
      }, channel, info);
    }
  }

  // Coach order (its own feed).
  const coachInfo = publishedInfo(model, trainId, "coach");
  if (t.consist && (!coachInfo.current || extra.length)) {
    const pub = customerView(model, trainId, { version: coachInfo.version, faults: coachInfo.faults });
    for (const e of expected.rows) {
      const pc = pub.coach?.[e.point];
      const ec = expected.coach?.[e.point];
      if (!pc || !ec || e.dep === null) continue;
      if (pc.first !== ec.first || pc.restaurant !== ec.restaurant) {
        add(`${trainId}/${e.point}/coach_order`, {
          train_id: trainId, point: e.point, type: "coach_order",
          published: `1st class ${pc.first}, restaurant ${pc.restaurant}, 2nd class ${pc.second}`,
          expected: `1st class ${ec.first}, restaurant ${ec.restaurant}, 2nd class ${ec.second}`,
          published_value: pc, expected_value: ec,
          groups: [{ kind: "boarding", pax: reservedPax(t, e.point), event: e.dep, at: e.point, what: `passengers with seat reservations boarding at ${e.station}`, coach: true }]
        }, "coach", coachInfo);
      }
    }
  }

  // Connections that the published times promise and the source no longer allows.
  for (const cx of model.connections.filter((c) => c.from_train === trainId)) {
    const info = publishedInfo(model, trainId, "planner");
    const pub = customerView(model, trainId, { version: info.version, faults: info.faults });
    const pr = pub.rows.find((r) => r.point === cx.at);
    const er = expected.rows.find((r) => r.point === cx.at);
    const toRow = sourceState(model, cx.to_train).rows.find((r) => r.point === cx.at);
    if (!pr || !toRow) continue;
    const need = cx.min_transfer_min * 60;
    const toDep = customerDep(toRow.dep);
    const okPub = pr.arr !== null && pr.arr + need <= toDep;
    const okExp = er && er.arr !== null && er.arr + need <= toDep;
    if (okPub && !okExp) {
      const to = model.trains.get(cx.to_train);
      for (const ch of ["planner", "announcements"]) {
        const inf = publishedInfo(model, trainId, ch);
        if (inf.current) continue;
        add(`${trainId}/${cx.at}/connection`, {
          train_id: trainId, point: cx.at, type: "connection", connection_id: cx.id, to_train: cx.to_train,
          published: `connection to ${to.number} (dep ${minuteLabel(toDep)}) shown as reachable`,
          expected: `arrival ${minuteLabel(er?.arr)} leaves ${er ? Math.round((toDep - er.arr) / 60) : "—"} min for a ${cx.min_transfer_min}-minute transfer: connection lost`,
          published_value: true, expected_value: false,
          groups: [{ kind: "onboard", pax: cx.passengers, event: (pr.arr ?? toDep) - 600, at: cx.at, what: `passengers changing to ${to.number} at ${pointName(model, cx.at)}`, connection: cx.id }]
        }, ch, inf);
      }
    }
  }

  const changes = changesOf(model, trainId).map((c) => c.id);
  return [...found.values()].map((c) => {
    // Every group belongs to one cell: the passengers boarding at the stop concerned, or those
    // travelling to it (alighting there, changing there). See distinctPax.
    const groups = c.groups.filter((g) => g.pax > 0).map((g) => ({ ...g, cell: `${c.train_id}/${c.point}/${g.kind === "boarding" ? "board" : "alight"}` }));
    const firstGroup = [...(groups.length ? groups : c.groups)].sort((x, y) => x.event - y.event)[0] || null;
    const firstEvent = firstGroup ? firstGroup.event : null;
    const pax = groups.reduce((s, g) => s + g.pax, 0);
    const minutes = firstEvent === null ? null : minutesFromNow(model, firstEvent);
    return {
      id: `${c.train_id}/${c.point}/${c.type}`,
      ...c,
      number: t.number,
      station: pointName(model, c.point),
      channels_right: DATA_CHANNELS.filter((ch) => (c.type === "coach_order" ? ch === "coach" : ch !== "coach") && !c.channels_wrong.includes(ch)),
      source_version: extra.length ? `${currentVersion(model, trainId)} + what-if` : currentVersion(model, trainId),
      source_changes: changes,
      groups,
      pax,
      first_event: firstEvent,
      first_event_point: firstGroup?.at || c.point,
      first_event_where: firstGroup?.where || null,
      minutes_to_event: minutes,
      severity: severity(minutes, pax)
    };
  }).sort((a, b) => (a.first_event ?? 1e9) - (b.first_event ?? 1e9) || a.id.localeCompare(b.id));
}

/**
 * When and where passengers already on the train act on what they were told: at the last stop
 * before the stop concerned that both the published and the source run still serve (there they can
 * still get off, change or stay), or at their boarding point if the train has not left it yet.
 */
function onboardDecision(model, pubRows, srcRows, point) {
  const idx = pubRows.findIndex((r) => r.point === point);
  const before = (idx >= 0 ? pubRows.slice(0, idx) : pubRows).filter((r) => r.dep !== null);
  const served = new Set(srcRows.filter((r) => VISIBLE.has(r.activity)).map((r) => r.point));
  const common = before.filter((r) => served.has(r.point));
  const last = common[common.length - 1] || before[0] || null;
  if (!last) return { event: model.now, at: point };
  return { event: last.dep, at: last.point };
}

/**
 * The passengers travelling to `point` who are on board when they act: those who boarded at a stop
 * the train still serves, up to the decision point. Passengers who planned to board at a stop the
 * train no longer serves are not on board; they count where they wanted to board. The snapshot has
 * counts per stop, not journeys, so the share is taken in proportion to the boardings.
 */
function onboardGroup(model, t, pubRows, srcRows, point) {
  const d = onboardDecision(model, pubRows, srcRows, point);
  const idx = pubRows.findIndex((r) => r.point === point);
  const before = idx >= 0 ? pubRows.slice(0, idx) : pubRows;
  const k = before.findIndex((r) => r.point === d.at);
  const served = new Set(srcRows.filter((r) => VISIBLE.has(r.activity)).map((r) => r.point));
  const all = before.reduce((sum, r) => sum + boardPax(t, r.point), 0);
  const onBoard = k < 0 ? all : before.slice(0, k + 1).filter((r) => served.has(r.point)).reduce((sum, r) => sum + boardPax(t, r.point), 0);
  const share = all ? onBoard / all : 1;
  return { pax: Math.round(alightPax(t, point) * share), event: d.event, at: d.at };
}

function severity(minutes, pax) {
  if (minutes === null) return "low";
  if (minutes <= 30 && pax >= 50) return "critical";
  if (minutes <= 60 || pax >= 100) return "high";
  return pax > 0 ? "medium" : "low";
}

// ---------------------------------------------------------------------------------------------
// Journeys (alternatives for passengers whose stop is not served)
// ---------------------------------------------------------------------------------------------

/**
 * Earliest-arrival journeys from `from` (departing at or after `after`) to `to`, with up to
 * `maxTransfers` changes of at least `minTransfer` minutes, on the current source timetable of
 * every train (a diverted train included, a cancelled leg excluded). Returns up to `limit` journeys.
 */
export function findJourneys(model, { from, to, after, maxTransfers = 2, minTransfer = 4, limit = 2, excludeTrains = [] }) {
  const legs = [];
  for (const t of model.trains.values()) {
    if (excludeTrains.includes(t.id)) continue;
    const rows = sourceState(model, t.id).rows.filter((r) => VISIBLE.has(r.activity));
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        if (a.dep === null || a.dep === undefined || b.arr === null || b.arr === undefined) continue;
        legs.push({ train: t, from: a.point, to: b.point, dep: customerDep(a.dep), arr: customerArr(b.arr), from_platform: a.track, to_platform: b.track });
      }
    }
  }
  const results = [];
  const search = (at, time, path) => {
    if (path.length > maxTransfers + 1) return;
    for (const leg of legs) {
      if (leg.from !== at) continue;
      const prev = path[path.length - 1];
      const wait = prev ? (prev.train.id === leg.train.id ? 0 : minTransfer * 60) : 0;
      if (prev && prev.train.id === leg.train.id) continue; // staying on a train is one leg
      if (leg.dep < time + wait) continue;
      if (path.some((p) => p.from === leg.to || p.train.id === leg.train.id)) continue;
      const next = [...path, leg];
      if (leg.to === to) { results.push(next); continue; }
      if (next.length <= maxTransfers) search(leg.to, leg.arr, next);
    }
  };
  search(from, after, []);
  results.sort((a, b) => a[a.length - 1].arr - b[b.length - 1].arr || a.length - b.length || a[0].dep - b[0].dep);
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const key = r.map((l) => `${l.train.id}@${l.from}`).join(">");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out.map((r) => ({
    arrival: r[r.length - 1].arr,
    arrival_label: minuteLabel(r[r.length - 1].arr),
    transfers: r.length - 1,
    legs: r.map((l) => ({
      train_id: l.train.id, number: l.train.number, line: l.train.line,
      from: l.from, from_station: pointName(model, l.from), dep: l.dep, dep_label: minuteLabel(l.dep), platform: l.from_platform,
      to: l.to, to_station: pointName(model, l.to), arr: l.arr, arr_label: minuteLabel(l.arr), arr_platform: l.to_platform
    }))
  }));
}

/** The alternative a passenger group needs, if any: where they are, where they wanted to go. */
function groupAlternative(model, c, g) {
  const t = model.trains.get(c.train_id);
  const src = sourceState(model, c.train_id);
  const info = publishedInfo(model, c.train_id, "planner");
  const pub = customerView(model, c.train_id, { version: info.version, faults: info.faults });
  let from, to, after, label;
  if (c.type === "connection") {
    const cx = model.connections.find((x) => x.id === c.connection_id);
    const to0 = model.trains.get(cx.to_train);
    const er = customerView(model, c.train_id).rows.find((r) => r.point === cx.at);
    const next = [...model.trains.values()]
      .filter((x) => x.line === to0.line && x.id !== to0.id)
      .map((x) => ({ x, row: sourceState(model, x.id).rows.find((r) => r.point === cx.at) }))
      .filter((o) => o.row && o.row.dep !== null && customerDep(o.row.dep) >= (er?.arr ?? 0) + cx.min_transfer_min * 60)
      .sort((a, b) => a.row.dep - b.row.dep)[0];
    if (!next) return null;
    return {
      for: g.what,
      arrival_label: null,
      transfers: 0,
      legs: [{ train_id: next.x.id, number: next.x.number, line: next.x.line, from: cx.at, from_station: pointName(model, cx.at), dep: customerDep(next.row.dep), dep_label: minuteLabel(customerDep(next.row.dep)), platform: next.row.track, to: null, to_station: next.x.to, arr: null, arr_label: null }]
    };
  }
  if (c.type === "terminus") {
    const end = sourceState(model, c.train_id).rows.find((r) => r.point === c.new_terminus);
    from = c.new_terminus; to = c.point; after = customerArr(end.arr) + 4 * 60; label = g.what;
  } else if (c.type === "stop_not_served" && g.kind === "onboard") {
    if (c.subtype === "ops_stop") {
      // Carried on to the next passenger stop, then back.
      const idx = src.rows.findIndex((r) => r.point === c.point);
      const next = src.rows.slice(idx + 1).find((r) => VISIBLE.has(r.activity));
      if (!next) return null;
      from = next.point; to = c.point; after = customerArr(next.arr) + 4 * 60; label = g.what;
    } else {
      const first = pub.rows[0];
      from = first.point; to = c.point; after = first.dep ?? model.now; label = g.what;
    }
  } else if (c.type === "stop_not_served" && g.kind === "boarding") {
    const pr = pub.rows.find((r) => r.point === c.point);
    const last = pub.rows[pub.rows.length - 1];
    if (!pr || !last || last.point === c.point) return null;
    from = c.point; to = last.point; after = pr.dep ?? pr.arr; label = g.what;
  } else {
    return null;
  }
  const j = findJourneys(model, { from, to, after: Math.max(after, model.now), limit: 1 })[0];
  if (!j) return { for: label, none: true, from_station: pointName(model, from), to_station: pointName(model, to) };
  return { for: label, ...j };
}

// ---------------------------------------------------------------------------------------------
// Exposure: who acts on wrong information
// ---------------------------------------------------------------------------------------------

const CH_FOR_TIMETABLE = ["planner", "displays", "announcements", "app_push", "staff"];
const CH_FOR_COACH = ["coach", "announcements", "app_push", "staff"];
// The journey planner is read when passengers plan. Every other channel reaches them in real time,
// up to the last moment they can still act: the app push on the phone, the displays and
// announcements at the station and on board, staff and crew, the coach-position displays.
const PLANNED = new Set(["planner"]);

/**
 * Expected number of passengers in a group who act on wrong information, given when each channel
 * shows them the right one (minutes from now; null: not within the horizon; negative: already).
 * Passengers plan evenly over the group's window [a, b] and can act on new information until b, the
 * last moment before the event. The journey planner informs the share `reach` of those who plan
 * after it is corrected; a real-time channel informs the share `reach` of everyone still to act if
 * the correction is in place `realtime_min` minutes before b (proportionally less if later).
 */
function groupMisinformed(model, group, times, windowMin) {
  const eventMin = (group.event - model.now) / 60;
  const [W, lead] = windowMin;
  const a = eventMin - W;
  const b = Math.max(a + 1, eventMin - lead);
  const R = model.publication.realtime_min || 5;
  const channels = group.coach ? CH_FOR_COACH : CH_FOR_TIMETABLE;
  let notReached = 1;
  for (const ch of channels) {
    const t = times[ch];
    if (t === null || t === undefined) continue;
    const since = Math.max(a, t);
    const f = PLANNED.has(ch)
      ? Math.max(0, b - since) / (b - a)
      : Math.min(1, Math.max(0, b - since) / R);
    const r = model.channels[ch]?.reach?.[group.kind] ?? 0;
    notReached *= 1 - r * f;
  }
  return group.pax * notReached;
}

function windowFor(model, c) {
  return model.publication.windows_min[c.type] || [30, 3];
}

/**
 * Passengers counted once. One passenger can rely on two wrong facts at the same stop: the platform
 * and the coach sectors (those with seat reservations are among those boarding there), the arrival
 * time and a connection (those who change are among those alighting), a platform and a departure
 * time. The groups of one cell (one train, one stop, boarding there or travelling to it) are nested:
 * a smaller group is part of every larger one. A passenger counts as misinformed if at least one of
 * the facts they rely on misleads them; the facts are taken as independent, so the shares not
 * misled multiply. Groups at different stops are counted separately (the snapshot has counts per
 * stop, not journeys).
 * entries: [{ cell, pax, mis }] with `mis` the group's expected misinformed passengers.
 */
function distinctPax(entries) {
  const cells = new Map();
  for (const e of entries) {
    if (!(e.pax > 0)) continue;
    if (!cells.has(e.cell)) cells.set(e.cell, []);
    cells.get(e.cell).push(e);
  }
  let affected = 0;
  let misinformed = 0;
  for (const list of cells.values()) {
    list.sort((a, b) => b.pax - a.pax);
    affected += list[0].pax;
    let notMisled = 1;
    list.forEach((g, j) => {
      notMisled *= 1 - Math.min(1, Math.max(0, g.mis / g.pax));
      misinformed += (g.pax - (list[j + 1]?.pax || 0)) * (1 - notMisled);
    });
  }
  return { affected, misinformed };
}

/** Baseline correction times of a contradiction's channels: already right, the next cycle, or never. */
function baselineTimes(model, c) {
  const times = {};
  for (const ch of DATA_CHANNELS) {
    if (c.channels_right.includes(ch)) {
      const info = publishedInfo(model, c.train_id, ch);
      times[ch] = (info.at - model.now) / 60;
    } else if (c.channels_wrong.includes(ch)) {
      const fix = autoFix(model, c, ch);
      times[ch] = fix === null ? null : (fix - model.now) / 60;
    }
  }
  return times;
}

function autoFix(model, c, channel) {
  const info = publishedInfo(model, c.train_id, channel);
  const cause = model.causes[info.cause];
  return cause?.auto_fix_at ?? null;
}

// ---------------------------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------------------------

function validateAction(model, a, scope, path) {
  const errors = [];
  if (!a || !ACTION_TYPES.includes(a.type)) {
    errors.push(`${path}.type must be one of ${ACTION_TYPES.join(", ")}.`);
    return errors;
  }
  if (a.type === "republish") {
    for (const id of a.train_ids || []) if (!scope.trainIds.includes(id)) errors.push(`${path}.train_ids: ${id} is not one of the trains in train_ids.`);
    for (const ch of a.channels || []) if (!DATA_CHANNELS.includes(ch)) errors.push(`${path}.channels: "${ch}" is not a data channel (${DATA_CHANNELS.join(", ")}).`);
  }
  if (a.type === "message") {
    if (!Array.isArray(a.channels) || !a.channels.length) errors.push(`${path}.channels: name at least one of ${MESSAGE_CHANNELS.join(", ")}.`);
    for (const ch of a.channels || []) if (!MESSAGE_CHANNELS.includes(ch)) errors.push(`${path}.channels: "${ch}" cannot carry a passenger message (${MESSAGE_CHANNELS.join(", ")}).`);
  }
  if (a.type === "override") {
    for (const ch of a.channels || OVERRIDE_CHANNELS) if (!OVERRIDE_CHANNELS.includes(ch)) errors.push(`${path}.channels: only ${OVERRIDE_CHANNELS.join(" and ")} can be overridden by hand; the journey planner and the coach order cannot.`);
  }
  if (a.type === "hold_request") {
    const cx = model.connections.find((x) => x.id === a.connection_id);
    if (!cx) errors.push(`${path}.connection_id: unknown connection "${a.connection_id ?? ""}" (connections come from ops_get_passengers).`);
    else if (!scope.trainIds.includes(cx.from_train)) errors.push(`${path}.connection_id: ${cx.id} belongs to ${cx.from_train}, which is not in train_ids.`);
  }
  return errors;
}

function costVariant(model, v, contradictions, baseline) {
  const pub = model.publication;
  const tm = pub.timings_min;
  const eff = pub.effort_min;
  const trainIds = [...new Set(contradictions.map((c) => c.train_id))];
  let effort = 0;
  let overrides = 0;
  const actionTypes = [];
  // Per contradiction: when each channel is right (information) and when its data is right (sync).
  const per = contradictions.map((c) => ({ c, times: { ...baselineTimes(model, c) }, dataFix: {}, held: false }));
  for (const p of per) for (const ch of p.c.channels_wrong) p.dataFix[ch] = p.times[ch];
  const setMin = (obj, k, t) => { obj[k] = obj[k] === null || obj[k] === undefined ? t : Math.min(obj[k], t); };

  for (const a of v.actions) {
    actionTypes.push(a.type);
    if (a.type === "republish") {
      const ids = a.train_ids?.length ? a.train_ids : trainIds;
      const chans = a.channels?.length ? a.channels : DATA_CHANNELS;
      const needsRelease = per.some((p) => ids.includes(p.c.train_id) && p.c.causes.some((k) => model.causes[k]?.needs_manual_release));
      const t0 = tm.republish + (needsRelease ? tm.manual_release : 0);
      effort += eff.republish + (needsRelease ? eff.manual_release : 0);
      for (const p of per) {
        if (!ids.includes(p.c.train_id)) continue;
        for (const ch of p.c.channels_wrong) {
          if (!chans.includes(ch)) continue;
          const t = ch === "planner" ? t0 : t0 + tm.display_lag;
          setMin(p.times, ch, t);
          setMin(p.dataFix, ch, t);
        }
      }
    } else if (a.type === "message") {
      effort += eff.message_per_channel * a.channels.length;
      for (const p of per) for (const ch of a.channels) setMin(p.times, ch, tm.message[ch]);
    } else if (a.type === "override") {
      const chans = a.channels?.length ? a.channels : OVERRIDE_CHANNELS;
      for (const p of per) {
        if (p.c.type === "coach_order" || p.c.type === "connection") continue;
        for (const ch of chans) {
          if (!p.c.channels_wrong.includes(ch)) continue;
          setMin(p.times, ch, tm.override);
          overrides += 1;
        }
      }
      effort += (eff.override_per_value + eff.override_cleanup_per_value) * overrides;
    } else if (a.type === "staff") {
      effort += eff.staff;
      for (const p of per) setMin(p.times, "staff", tm.staff);
    } else if (a.type === "hold_request") {
      effort += eff.hold_request;
      for (const p of per) if (p.c.type === "connection" && p.c.connection_id === a.connection_id) p.held = true;
    }
  }

  const exposure = [];
  let firstCorrect = null;
  let syncAt = 0;
  let residual = 0;
  let heldPax = 0;
  for (const p of per) {
    const w = windowFor(model, p.c);
    for (const g of p.c.groups) {
      if (p.held && g.connection) { heldPax += g.pax; continue; }
      exposure.push({ cell: g.cell, pax: g.pax, mis: groupMisinformed(model, g, p.times, w) });
    }
    for (const [ch, t] of Object.entries(p.times)) {
      const base = baseline.find((b) => b.c === p.c)?.times[ch];
      if (t !== null && t !== undefined && t >= 0 && t !== base) firstCorrect = firstCorrect === null ? t : Math.min(firstCorrect, t);
    }
    let synced = true;
    for (const ch of p.c.channels_wrong) {
      const t = p.dataFix[ch];
      if (t === null || t === undefined || t > model.horizonMin) synced = false;
      else syncAt = Math.max(syncAt, t);
    }
    if (p.held) synced = true;
    if (!synced) residual += 1;
  }
  const holdCx = v.actions.find((a) => a.type === "hold_request");
  let hold = null;
  if (holdCx) {
    const cx = model.connections.find((x) => x.id === holdCx.connection_id);
    const from = per.find((p) => p.c.connection_id === cx.id);
    const er = from ? customerView(model, cx.from_train).rows.find((r) => r.point === cx.at) : null;
    const toRow = sourceState(model, cx.to_train).rows.find((r) => r.point === cx.at);
    const needed = er ? Math.max(0, Math.round((er.arr + cx.min_transfer_min * 60 - customerDep(toRow.dep)) / 60)) : 0;
    const to = model.trains.get(cx.to_train);
    // Those boarding the connecting train at the connection point include the passengers who change
    // to it: the hold delays the others.
    const boarding = to.passengers?.[cx.at]?.board || 0;
    hold = { connection_id: cx.id, train: to.number, wait_min: needed, delayed_pax: Math.max(0, boarding - (cx.passengers || 0)), note: "If dispatch grants the wait. Dispatch decides; the request changes nothing by itself." };
  }
  return {
    variant_id: v.variant_id,
    name: String(v.name || v.variant_id).slice(0, 120),
    actions: v.actions.map(describeAction),
    action_types: [...new Set(actionTypes)],
    misinformed_pax: Math.round(distinctPax(exposure).misinformed),
    correct_info_from_min: firstCorrect === null ? null : round1(firstCorrect),
    time_to_sync_min: residual ? null : round1(syncAt),
    residual_contradictions: residual,
    manual_overrides: overrides,
    effort_min: effort,
    held_pax: heldPax,
    hold
  };
}

function describeAction(a) {
  switch (a.type) {
    case "republish": return `Re-publish ${a.train_ids?.length ? a.train_ids.join(", ") : "the trains"} from the source (${(a.channels?.length ? a.channels : DATA_CHANNELS).join(", ")})`;
    case "message": return `Passenger message on ${a.channels.join(", ")}`;
    case "override": return `Manual override on ${(a.channels?.length ? a.channels : OVERRIDE_CHANNELS).join(", ")}`;
    case "staff": return "Brief station staff and train crew";
    case "hold_request": return `Ask dispatch to hold the connection ${a.connection_id}`;
    default: return a.type;
  }
}

const round1 = (x) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------------------------------------
// The engine call
// ---------------------------------------------------------------------------------------------

/**
 * spec: { label?, train_ids: [...], channels?: [...], stops?: [...], what_if?: { changes: [ops] },
 *         variants?: [{ variant_id, name, actions: [...] }] }
 * basis: "source" (the world model as it is), "what_if" (hypothetical changes applied) or
 * "partial" (the scope leaves out trains, channels or stops that the same operational change or the
 * same contradiction involves). Options may rest only on "source".
 */
export function simulateSync(model, spec = {}) {
  const errors = [];
  const ids = Array.isArray(spec.train_ids) ? spec.train_ids.map(String) : [];
  if (!ids.length) errors.push("train_ids: name at least one train (ids like T-618, or numbers like \"ICE 618\").");
  const trainIds = [];
  for (const ref of ids) {
    const t = findTrain(model, ref);
    if (!t) errors.push(`train_ids: unknown train "${ref}".`);
    else if (!trainIds.includes(t.id)) trainIds.push(t.id);
  }
  const channelScope = spec.channels?.length ? spec.channels.map(String) : null;
  for (const ch of channelScope || []) if (!DATA_CHANNELS.includes(ch)) errors.push(`channels: "${ch}" is not a data channel (${DATA_CHANNELS.join(", ")}).`);
  const stopScope = spec.stops?.length ? spec.stops.map(String) : null;
  for (const p of stopScope || []) if (!model.points.has(p)) errors.push(`stops: unknown point "${p}" (use Ril 100 codes such as KK).`);
  // The specification is read, never changed: hypothetical changes and actions are normalised on copies
  // (the agent's tool input is echoed back to the API unchanged and recorded as it was sent).
  const extra = (Array.isArray(spec.what_if?.changes) ? spec.what_if.changes : []).map((op) => (op && typeof op === "object" ? { ...op } : {}));
  for (const [i, op] of extra.entries()) {
    const t = findTrain(model, op.train);
    if (!t) errors.push(`what_if.changes[${i}].train: unknown train "${op.train}".`);
    else op.train = t.id;
    if (!["set_track", "consist", "shift_after", "terminate", "terminate_at", "skip"].includes(op.op)) errors.push(`what_if.changes[${i}].op must be set_track, consist, shift_after, terminate_at or skip.`);
    if (op.point && !model.points.has(op.point)) errors.push(`what_if.changes[${i}].point: unknown point "${op.point}".`);
  }
  const copyAction = (a) => (a && typeof a === "object"
    ? { ...a, ...(Array.isArray(a.train_ids) ? { train_ids: a.train_ids.map((r) => findTrain(model, r)?.id || String(r)) } : {}), ...(Array.isArray(a.channels) ? { channels: a.channels.map(String) } : {}) }
    : a);
  const variants = (Array.isArray(spec.variants) ? spec.variants : []).map((v) => (v && typeof v === "object" ? { ...v, actions: Array.isArray(v.actions) ? v.actions.map(copyAction) : v.actions } : v));
  if (variants.length > MAX_VARIANTS) errors.push(`variants: at most ${MAX_VARIANTS}.`);
  const seen = new Set();
  for (const [i, v] of variants.entries()) {
    if (!v?.variant_id) errors.push(`variants[${i}].variant_id is required.`);
    if (seen.has(v?.variant_id)) errors.push(`variants[${i}].variant_id "${v.variant_id}" is used twice.`);
    seen.add(v?.variant_id);
    if (!Array.isArray(v?.actions) || !v.actions.length) errors.push(`variants[${i}].actions: at least one action.`);
    for (const [k, a] of (v?.actions || []).entries()) errors.push(...validateAction(model, a, { trainIds }, `variants[${i}].actions[${k}]`));
  }
  if (errors.length) return { ok: false, errors };

  // A "skip" what-if turns a stop into a pass (a rumour that a stop is cancelled).
  const ops = extra.map((op) => (op.op === "skip" ? { train: op.train, op: "skip", point: op.point } : op));
  const extraFor = (id) => ops.filter((op) => op.train === id).map((op) => (op.op === "skip" ? { ...op, op: "_skip" } : op));

  let all = [];
  for (const id of trainIds) {
    const list = extraFor(id).length ? whatIfContradictions(model, id, extraFor(id)) : trainContradictions(model, id);
    all.push(...list);
  }
  // Scope: channels and stops narrow the view; what they leave out makes the count partial.
  const full = all;
  // A channel-scoped estimate assumes the channels it leaves out show the right thing.
  if (channelScope) {
    all = all.map((c) => {
      const out = c.channels_wrong.filter((ch) => !channelScope.includes(ch));
      return { ...c, channels_wrong: c.channels_wrong.filter((ch) => channelScope.includes(ch)), channels_right: [...c.channels_right, ...out], assumed_right: out };
    }).filter((c) => c.channels_wrong.length);
  }
  if (stopScope) all = all.filter((c) => stopScope.includes(c.point));

  const leftOut = [];
  if (!extra.length) {
    if (channelScope && full.some((c) => c.channels_wrong.some((ch) => !channelScope.includes(ch)))) leftOut.push("channels that show the same contradictions wrong");
    if (stopScope && full.some((c) => !stopScope.includes(c.point))) leftOut.push("stops with contradictions");
    const related = new Set();
    for (const id of trainIds) for (const c of changesOf(model, id)) for (const other of c.trains) related.add(other);
    const missing = [...related].filter((id) => !trainIds.includes(id) && trainContradictions(model, id).length);
    if (missing.length) leftOut.push(`trains the same operational change affects and whose customer information is also wrong (${missing.map((id) => model.trains.get(id).number).join(", ")})`);
  }
  const basis = extra.length ? "what_if" : leftOut.length ? "partial" : "source";

  const baselinePer = all.map((c) => ({ c, times: baselineTimes(model, c) }));
  const { affected, misinformed } = distinctPax(baselinePer.flatMap((b) => b.c.groups.map((g) => ({ cell: g.cell, pax: g.pax, mis: groupMisinformed(model, g, b.times, windowFor(model, b.c)) }))));
  const events = all.filter((c) => c.groups.length && c.first_event !== null);
  const first = events.sort((a, b) => a.first_event - b.first_event)[0] || null;
  let syncAt = 0;
  let neverSync = false;
  for (const b of baselinePer) for (const ch of b.c.channels_wrong) {
    const t = b.times[ch];
    if (t === null || t === undefined || t > model.horizonMin) neverSync = true;
    else syncAt = Math.max(syncAt, t);
  }

  const alternatives = [];
  for (const c of all) {
    for (const g of c.groups) {
      if (!["stop_not_served", "terminus", "connection"].includes(c.type)) continue;
      const alt = groupAlternative(model, c, g);
      if (alt) alternatives.push({ contradiction: c.id, train: c.number, ...alt });
    }
  }

  const trains = trainIds.map((id) => {
    const t = model.trains.get(id);
    const list = all.filter((c) => c.train_id === id);
    return {
      train_id: id, number: t.number, from: t.from, to: t.to,
      source_version: currentVersion(model, id),
      channel_versions: Object.fromEntries(DATA_CHANNELS.map((ch) => {
        const info = publishedInfo(model, id, ch);
        return [ch, { version: info.version, cause: info.cause, current: info.current }];
      })),
      contradictions: list.length,
      pax: distinctPax(list.flatMap((c) => c.groups.map((g) => ({ cell: g.cell, pax: g.pax, mis: 0 })))).affected
    };
  });

  const baselineSummary = {
    affected_pax: affected,
    misinformed_pax: Math.round(misinformed),
    contradictions: all.length,
    first_event_min: first ? minutesFromNow(model, first.first_event) : null,
    first_event_label: first ? `${first.number}, ${first.first_event_where || pointName(model, first.first_event_point)} ${minuteLabel(first.first_event)}` : null,
    first_event_short: first ? `${first.number}, ${first.first_event_where || pointName(model, first.first_event_point)}` : null,
    time_to_sync_min: neverSync || !all.length ? (all.length ? null : 0) : round1(syncAt),
    next_cycle_label: minuteLabel(model.publication.next_cycle),
    next_cycle_note: `The half-hourly cycle runs at :00 and :30 and closes ${model.publication.cycle_closes_min ?? 15} minutes before: a change entered now goes with the ${minuteLabel(model.publication.next_cycle)} cycle. Changes the cycle does not take (short notice, rejected updates, the coach order, construction orders) stay wrong until someone re-publishes.`
  };

  const costed = variants.map((v) => costVariant(model, v, all, baselinePer));
  for (const v of costed) v.protected_pax = Math.max(0, baselineSummary.misinformed_pax - v.misinformed_pax);

  return {
    ok: true,
    engine_version: ENGINE_VERSION,
    label: String(spec.label || "").slice(0, 200),
    basis,
    ...(leftOut.length ? { left_out: leftOut } : {}),
    ...(extra.length ? { what_if: ops } : {}),
    now: model.now,
    now_label: minuteLabel(model.now),
    horizon_min: model.horizonMin,
    train_ids: trainIds,
    scope: { channels: channelScope, stops: stopScope },
    trains,
    contradictions: all,
    baseline: baselineSummary,
    alternatives,
    variants: costed
  };
}

/** Contradictions under hypothetical changes: the published view against a what-if source. */
function whatIfContradictions(model, trainId, ops) {
  const mapped = ops.map((op) => {
    if (op.op !== "_skip") return op;
    // a skipped stop becomes a pass at its arrival time
    return { train: trainId, op: "replace_rows", rows: sourceState(model, trainId).rows.map((r) => (r.point === op.point && VISIBLE.has(r.activity) && r.activity === "stop" ? { point: r.point, pass: r.arr, activity: "pass", track: null } : r)) };
  });
  return trainContradictions(model, trainId, { extra: mapped });
}

/** The engine result as the model sees it: no seconds, no internals; every figure the cards use. */
export function compactForModel(res) {
  if (!res?.ok) return res;
  return {
    ok: true,
    engine_version: res.engine_version,
    label: res.label,
    basis: res.basis,
    ...(res.left_out ? { left_out: res.left_out } : {}),
    // The channels and stops a scoped calculation looked at: what lies outside was not checked.
    ...(res.scope && (res.scope.channels || res.scope.stops) ? { scope: res.scope } : {}),
    snapshot_time: res.now_label,
    horizon_min: res.horizon_min,
    trains: res.trains,
    contradictions: res.contradictions.map((c) => ({
      id: c.id, train: c.number, station: c.station, point: c.point, type: c.type, ...(c.subtype ? { subtype: c.subtype } : {}),
      published: c.published, source_says: c.expected,
      channels_wrong: c.channels_wrong, channels_right: c.channels_right,
      published_versions: c.published_versions, source_version: c.source_version, source_changes: c.source_changes,
      causes: c.causes, passengers: c.pax, minutes_to_first_event: c.minutes_to_event, severity: c.severity,
      ...(c.delta_min ? { delta_min: c.delta_min } : {}),
      ...(c.connection_id ? { connection_id: c.connection_id } : {})
    })),
    baseline: res.baseline,
    alternatives: res.alternatives.map((a) => ({
      for: a.for, train: a.train, ...(a.none ? { none: true, from: a.from_station, to: a.to_station } : {
        arrival: a.arrival_label, transfers: a.transfers,
        legs: a.legs.map((l) => ({ train: l.number, line: l.line, from: l.from_station, dep: l.dep_label, platform: l.platform, to: l.to_station, arr: l.arr_label, ...(l.arr_platform ? { arr_platform: l.arr_platform } : {}) }))
      })
    })),
    variants: res.variants
  };
}
