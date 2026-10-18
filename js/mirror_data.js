// What the timetable mirror draws, from the world model and the engine: the source rows of a train
// (Betriebsfahrplan), what a customer channel has published for it (Kundenfahrplan), the links
// between the two, the corridor strip and the monitor of all trains. Pure functions (no DOM), so the
// tests can check them in Node.

import {
  DATA_CHANNELS, sourceState, publishedInfo, currentVersion, changesOf, pointName, tenthLabel, minuteLabel, minutesFromNow, runLabel
} from "./world.js";
import { customerView } from "./sync.js";

export const CHANNEL_SHORT = { planner: "Planner", displays: "Displays", announcements: "Announcements", coach: "Coach order" };
const PASSENGER = new Set(["start", "stop", "end"]);

/** The source rows of a train with what changed against the base timetable. */
export function sourceRows(model, trainId) {
  const st = sourceState(model, trainId);
  const base = sourceState(model, trainId, 1);
  const baseBy = new Map(base.rows.map((r) => [r.point, r]));
  return st.rows.map((r) => {
    const b = baseBy.get(r.point);
    const changed = [];
    if (st.version > 1) {
      if (!b) changed.push("new on this route");
      else {
        if (r.track && b.track && r.track !== b.track) changed.push(`track was ${b.track}`);
        if (b.activity !== r.activity && !(b.activity === "start" && r.activity === "start")) changed.push(`was ${ACT_SHORT[b.activity] || b.activity}`);
        const t = r.arr ?? r.dep ?? r.pass;
        const bt = b.arr ?? b.dep ?? b.pass;
        if (t !== null && bt !== null && t !== undefined && bt !== undefined && Math.abs(t - bt) >= 60) changed.push(`${t > bt ? "+" : "−"}${Math.round(Math.abs(t - bt) / 6) / 10} min`);
      }
    }
    return {
      point: r.point, ril100: model.points.get(r.point)?.ril100 || r.point, station: pointName(model, r.point),
      activity: r.activity, passenger: PASSENGER.has(r.activity),
      arr: tenthLabel(r.arr), dep: tenthLabel(r.dep), pass: tenthLabel(r.pass),
      track: r.track || null, remark: r.remark || null, changed
    };
  });
}

export const ACT_SHORT = { start: "first departure", stop: "passenger stop", ops_stop: "operational stop", pass: "pass", end: "last arrival" };
export const ACT_DE = { start: "Abfahrt", stop: "Verkehrshalt", ops_stop: "Betriebshalt", pass: "Durchfahrt", end: "Ankunft" };

/**
 * What one channel publishes for a train: its rows (or coach sectors), version, cause. Stops the
 * channel shows as cancelled ("Halt entfällt") are rows too, in time order with the others.
 */
export function channelRows(model, trainId, channel) {
  const info = publishedInfo(model, trainId, channel);
  const view = customerView(model, trainId, { version: info.version, faults: info.faults });
  const row = (r, status) => ({
    point: r.point, station: r.station,
    arr: minuteLabel(r.arr), dep: minuteLabel(r.dep), platform: r.platform,
    status, kind: status === "cancelled" ? "cancelled" : r.kind,
    coach: status === "cancelled" ? null : view.coach?.[r.point] || null,
    at: r.dep ?? r.arr
  });
  const rows = [...view.rows.map((r) => row(r, r.status)), ...view.cancelled.map((r) => row(r, "cancelled"))]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.at ?? 0) - (b.r.at ?? 0) || a.i - b.i)
    .map(({ r }) => { delete r.at; return r; });
  return {
    channel, version: info.version, at: minuteLabel(info.at), cause: info.cause, faults: info.faults,
    current: info.current, destination: view.destination, rows
  };
}

/** The channels of a train with their versions, for the chips above the customer column. */
export function channelStates(model, trainId) {
  const t = model.trains.get(trainId);
  const cur = currentVersion(model, trainId);
  return DATA_CHANNELS.filter((ch) => ch !== "coach" || t?.consist).map((ch) => {
    const info = publishedInfo(model, trainId, ch);
    return { channel: ch, label: CHANNEL_SHORT[ch], version: info.version, behind: info.version < cur, faulty: info.faults.length > 0, cause: info.cause };
  });
}

/** The caption of a train: its run and the versions of the source and the channels. */
export function trainCaption(model, trainId) {
  const t = model.trains.get(trainId);
  const st = sourceState(model, trainId);
  const changes = changesOf(model, trainId);
  const last = changes[changes.length - 1];
  return {
    title: `${t.number} · ${t.from} → ${t.to}`,
    source: `Source v${st.version}${last ? ` (${minuteLabel(last.at)}, ${last.id})` : t.created_by ? ` (created by ${t.created_by})` : " (base timetable)"}`,
    channels: channelStates(model, trainId)
  };
}

/**
 * Links between the source rows and a channel's rows: for every customer row, the source row of its
 * point (or none: the source does not stop there), and for every source passenger stop without a
 * customer row, a missing stop. Returns { links: [{ left, right, kind }] } with indexes.
 */
export function mirrorLinks(left, right) {
  const links = [];
  const leftBy = new Map(left.map((r, i) => [r.point, i]));
  const rightBy = new Map(right.map((r, i) => [r.point, i]));
  right.forEach((r, j) => {
    const i = leftBy.get(r.point);
    if (i === undefined) links.push({ left: null, right: j, kind: "not_in_source" });
    else if (!left[i].passenger) links.push({ left: i, right: j, kind: left[i].activity === "ops_stop" ? "ops_stop" : "pass" });
    else links.push({ left: i, right: j, kind: "stop" });
  });
  left.forEach((r, i) => {
    if (rightBy.has(r.point)) return;
    links.push({ left: i, right: null, kind: r.passenger ? "missing" : "hidden" });
  });
  return links;
}

/**
 * Vertical places for the customer rows: each as close as possible to the source row of its point,
 * in order, never overlapping (rowH apart), inside [0, height]. Rows without a source row sit
 * between their neighbours. Returns the top of each row.
 */
export function placeRight(leftTops, links, count, rowH, height) {
  const target = new Array(count).fill(null);
  for (const l of links) if (l.right !== null && l.left !== null) target[l.right] = leftTops[l.left];
  // Rows without an anchor: spread between the anchored neighbours.
  for (let j = 0; j < count; j++) {
    if (target[j] !== null) continue;
    let a = j - 1;
    while (a >= 0 && target[a] === null) a--;
    let b = j + 1;
    while (b < count && target[b] === null) b++;
    const ya = a >= 0 ? target[a] : null;
    const yb = b < count ? target[b] : null;
    if (ya !== null && yb !== null) target[j] = ya + ((yb - ya) * (j - a)) / (b - a);
    else if (ya !== null) target[j] = ya + rowH * (j - a);
    else if (yb !== null) target[j] = Math.max(0, yb - rowH * (b - j));
    else target[j] = rowH * j;
  }
  const top = target.slice();
  for (let j = 1; j < count; j++) top[j] = Math.max(top[j], top[j - 1] + rowH);
  const limit = Math.max(height, rowH * count);
  if (count && top[count - 1] + rowH > limit) {
    top[count - 1] = limit - rowH;
    for (let j = count - 2; j >= 0; j--) top[j] = Math.min(top[j], top[j + 1] - rowH);
  }
  for (let j = 0; j < count; j++) top[j] = Math.max(0, top[j]);
  for (let j = 1; j < count; j++) top[j] = Math.max(top[j], top[j - 1] + rowH);
  return top;
}

/** The corridor strip: stations, lines, the train's source route and its published route. */
export function stripData(model, trainId) {
  const nodes = [...model.points.values()].map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, hub: !!p.hub }));
  const edges = model.world.segments.map((s) => ({ a: s.a, b: s.b }));
  if (!trainId || !model.trains.has(trainId)) return { nodes, edges, route: [], stops: [], published: [], publishedStops: [], position: null };
  const st = sourceState(model, trainId);
  const info = publishedInfo(model, trainId, "planner");
  const pub = sourceState(model, trainId, info.version);
  const t = model.trains.get(trainId);
  return {
    nodes, edges,
    route: st.rows.map((r) => r.point),
    stops: st.rows.filter((r) => PASSENGER.has(r.activity)).map((r) => r.point),
    opsStops: st.rows.filter((r) => r.activity === "ops_stop").map((r) => r.point),
    published: pub.rows.map((r) => r.point),
    publishedStops: customerView(model, trainId, { version: info.version, faults: info.faults }).rows.map((r) => r.point),
    position: positionNow(model, st.rows),
    direction: t.direction
  };
}

/** Where a train is at the snapshot: { at: point, between: [a, b] | null, state }. */
export function positionNow(model, rows) {
  let last = -1;
  rows.forEach((r, i) => {
    const t = r.dep ?? r.pass ?? r.arr;
    if (t !== null && t !== undefined && t <= model.now) last = i;
  });
  if (last < 0) return { at: rows[0].point, between: null, state: "waiting" };
  if (last === rows.length - 1) return { at: rows[last].point, between: null, state: "arrived" };
  return { at: rows[last].point, between: [rows[last].point, rows[last + 1].point], state: "running" };
}

/** The trains the sync monitor lists: everything in the window except the S-Bahn shuttles. */
export function monitorTrains(model) {
  const H = model.horizonMin;
  return [...model.trains.values()]
    .filter((t) => t.category !== "S")
    .map((t) => {
      const st = sourceState(model, t.id);
      const first = st.rows[0];
      const last = st.rows[st.rows.length - 1];
      const firstT = first.dep ?? first.arr;
      const lastT = last.arr ?? last.dep;
      return { t, st, firstT, lastT };
    })
    .filter((x) => x.lastT >= model.now && x.firstT <= model.now + H * 60)
    .sort((a, b) => a.firstT - b.firstT)
    .map(({ t, st, firstT, lastT }) => ({
      id: t.id, number: t.number, line: t.line, category: t.category,
      run: runLabel(model, t, st.rows),
      first_min: minutesFromNow(model, firstT),
      source_version: st.version,
      changes: changesOf(model, t.id).map((c) => c.id),
      created_by: t.created_by || null,
      channels: channelStates(model, t.id)
    }));
}
