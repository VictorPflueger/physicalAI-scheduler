// The alignment view's data (js/mirror_align.js draws it): one train at one stop, what the source
// timetable says there and what each customer channel tells passengers about the same facts, with
// the agent's verdict once one of its engine results covers the channel. Before the agent has checked
// anything, the values are shown as they are, without a verdict: the data differ, but only the
// engine says whether passengers act on it. Pure functions (no DOM), so the tests can check them in
// Node. Every value comes from the world model and the sync engine.

import { DATA_CHANNELS, changesOf, minuteLabel, pointName, publishedInfo } from "./world.js";
import { customerView, trainContradictions } from "./sync.js";

/** The customer channels in plain words, with the German name a passenger-information team uses. */
export const CHANNEL_PLAIN = {
  planner: { label: "Journey planner & app", de: "Reiseauskunft und App" },
  displays: { label: "Station displays", de: "Anzeiger" },
  announcements: { label: "Announcements", de: "Ansagen" },
  coach: { label: "Coach order", de: "Wagenreihung in App und Wagenstandsanzeiger" }
};

const FACT_LABEL = {
  platform: "Platform", time: "Time", stop_not_served: "Stop", stop_missing: "Stop",
  terminus: "Destination", coach_order: "Coach order", connection: "Connection"
};

/**
 * A fact can be shown on a channel: the coach order on its own feed, a connection in the journey
 * planner and the announcements (the station displays show none), everything else on the three
 * timetable channels.
 */
export const appliesTo = (type, channel) => (type === "coach_order" ? channel === "coach"
  : type === "connection" ? channel === "planner" || channel === "announcements"
    : channel !== "coach");

/**
 * The short form of one side of a contradiction, as a channel card shows it ("Platform 5",
 * "1st class G–H", "Arrives 08:51", "Not served today"). `side` is "source" or "published".
 * The full text stays available as the card's tooltip.
 */
export function shortFact(type, text, side) {
  const s = String(text || "").trim();
  let m;
  switch (type) {
    case "platform":
      m = s.match(/platform\s+(\S+)/i);
      return m ? `Platform ${m[1]}` : s;
    case "coach_order":
      m = s.match(/1st class\s+([A-H](?:–[A-H])?)/);
      return m ? `1st class ${m[1]}` : s;
    case "time": {
      const out = s.split(/,\s*/).map((p) => p.replace(/^arr\s+/, "arrives ").replace(/^dep\s+/, "departs ")).join(", ");
      return out.charAt(0).toUpperCase() + out.slice(1);
    }
    case "stop_not_served":
      if (side === "published") {
        m = s.match(/stops at .*?(\d{2}:\d{2})/);
        return m ? `Stop at ${m[1]}` : "Stop shown";
      }
      if (/operational stop/i.test(s)) return "No passenger stop";
      if (/passes without stopping/i.test(s)) return "Passes without stopping";
      return "Not served today";
    case "stop_missing":
      if (side === "published") return "Not listed";
      m = s.match(/\barr (\d{2}:\d{2})/) || s.match(/\bdep (\d{2}:\d{2})/);
      return m ? `Extra stop ${m[1]}` : "Extra stop";
    case "terminus":
      if (side === "published") {
        m = s.match(/\bto ([^,]+),/);
        return m ? `To ${m[1].trim()}` : s;
      }
      m = s.match(/ends at ([^(;]+)/);
      return m ? `Ends at ${m[1].trim()}` : s;
    case "connection":
      if (side === "published") {
        m = s.match(/connection to (\S+ \S+)/);
        return m ? `${m[1]} reachable` : "Connection shown";
      }
      return /lost/.test(s) ? "Connection lost" : s;
    default:
      return s;
  }
}

/** A contradiction in one shape: from the engine's full record (raw data) or the compact form a tool result carries. */
function normalize(c) {
  return {
    id: String(c.id), point: c.point, station: c.station, type: c.type, subtype: c.subtype || null,
    published: c.published, source: c.source_says ?? c.expected,
    wrong: c.channels_wrong || [], right: c.channels_right || [],
    pax: c.passengers ?? c.pax ?? 0,
    minutes: c.minutes_to_first_event ?? c.minutes_to_event ?? null
  };
}

const urgency = (a, b) => (a.minutes ?? 1e9) - (b.minutes ?? 1e9) || b.pax - a.pax || a.id.localeCompare(b.id);

/** The channels a train has: the coach order only for trains with a published consist. */
export function trainChannels(model, trainId) {
  const t = model.trains.get(trainId);
  return DATA_CHANNELS.filter((ch) => ch !== "coach" || t?.consist);
}

/** The stop a train's alignment shows when nothing contradicts the source: its first passenger stop. */
function firstStop(model, trainId) {
  const view = customerView(model, trainId);
  return view.rows[0]?.point || null;
}

/**
 * "Köln Hbf · departs 07:42": the stop and the time the source gives passengers there. A stop the
 * source no longer serves (the facts say why) is named without a time.
 */
function stopLine(model, trainId, point) {
  const row = customerView(model, trainId).rows.find((r) => r.point === point);
  const station = pointName(model, point);
  if (!row) return { point, station, text: station };
  const when = row.dep !== null && row.dep !== undefined ? `departs ${minuteLabel(row.dep)}` : row.arr !== null && row.arr !== undefined ? `arrives ${minuteLabel(row.arr)}` : null;
  return { point, station, text: when ? `${station} · ${when}` : station };
}

/** The facts of a train that is in sync at a stop: the platform there (and first class, for a train with a consist). */
function syncFacts(model, trainId, point) {
  const view = customerView(model, trainId);
  const row = view.rows.find((r) => r.point === point);
  const facts = [];
  if (row?.platform) facts.push({ id: `${trainId}/${point}/platform`, type: "platform", label: FACT_LABEL.platform, source: `Platform ${row.platform}`, sourceFull: `platform ${row.platform}` });
  const coach = view.coach?.[point];
  if (coach?.first) facts.push({ id: `${trainId}/${point}/coach_order`, type: "coach_order", label: FACT_LABEL.coach_order, source: `1st class ${coach.first}`, sourceFull: `1st class ${coach.first}` });
  return facts;
}

/** The operational change behind the train's current source version, in one line. */
export function changeLine(model, trainId) {
  const t = model.trains.get(trainId);
  const list = changesOf(model, trainId);
  const last = list[list.length - 1];
  if (last) return { id: last.id, at: minuteLabel(last.at), by: last.source || "", text: `Changed ${minuteLabel(last.at)} · ${last.id}${last.source ? ` · ${last.source}` : ""}` };
  if (t?.created_by && model.changes.has(t.created_by)) {
    const c = model.changes.get(t.created_by);
    return { id: c.id, at: minuteLabel(c.at), by: c.source || "", text: `Created ${minuteLabel(c.at)} · ${c.id}` };
  }
  return { id: null, at: null, by: "", text: "No change today: base timetable" };
}

/**
 * The alignment of one train.
 *   result    the agent's latest engine result that covers the train (compact form, as a tool result
 *             carries it) or null: before it, values are shown without a verdict
 *   basisKey  the stage of that result: "estimate", "verified", "partial" or "what_if"
 * Returns { train, stop, change, facts, channels, more, checked, whatIf, impact }:
 *   facts     [{ id, type, label, source, sourceFull }] at the stop, the source's side
 *   channels  [{ channel, label, de, asOf, values: [{ id, type, text, full, ok }], verdict }]
 *             verdict: null (not checked), "wrong", "right", "na" (no fact here concerns the channel),
 *             "what_if" (wrong only under the agent's assumption)
 *   more      contradictions at other stops (the timetable view shows them all)
 *   impact    { pax, affected, trains, contradictions, minutes, where, stage, notChecked, covered }
 *             from the agent's result (the passengers who would act on wrong information, as on the KPI
 *             tile; notChecked: "channel", "stop" or "train" for what a first estimate left out;
 *             covered: what it did look at, in words, e.g. "journey planner & app only"), or null
 */
export function alignmentData(model, trainId, { result = null, basisKey = null } = {}) {
  const t = model.trains.get(trainId);
  if (!t) return null;
  const whatIf = basisKey === "what_if";
  const raw = trainContradictions(model, trainId).map(normalize);
  const agentAll = result ? (result.contradictions || []).filter((c) => String(c.id).startsWith(`${trainId}/`)).map(normalize) : null;
  const scope = Array.isArray(result?.scope?.channels) && result.scope.channels.length ? result.scope.channels : null;
  const inScope = (ch) => !scope || scope.includes(ch);
  const pool = agentAll && agentAll.length ? agentAll : raw;
  const key = [...pool].sort(urgency)[0] || null;
  const point = key ? key.point : firstStop(model, trainId);
  const channels = trainChannels(model, trainId);

  // The facts at the stop: the agent's where it has them (a what-if exists only there), else the data's.
  const atPoint = (list) => (list || []).filter((c) => c.point === point);
  const agentHere = atPoint(agentAll);
  const rawHere = atPoint(raw);
  const ids = [...new Set([...(whatIf ? [] : rawHere.map((c) => c.id)), ...agentHere.map((c) => c.id)])];
  const rawBy = new Map(rawHere.map((c) => [c.id, c]));
  const agentBy = new Map(agentHere.map((c) => [c.id, c]));
  const order = { platform: 0, time: 1, stop_not_served: 2, stop_missing: 3, terminus: 4, connection: 5, coach_order: 6 };
  const items = ids.map((id) => ({ id, raw: rawBy.get(id) || null, agent: agentBy.get(id) || null }))
    .sort((a, b) => (order[(a.agent || a.raw).type] ?? 9) - (order[(b.agent || b.raw).type] ?? 9));

  let facts;
  let valueOf;
  if (items.length) {
    facts = items.map(({ id, raw: r, agent: a }) => {
      const c = whatIf ? a : r || a;
      return { id, type: c.type, label: FACT_LABEL[c.type] || c.type, source: shortFact(c.type, c.source, "source"), sourceFull: c.source };
    });
    // What a channel shows for one fact: the agent's record where its result covers the channel, else
    // the data's (a first estimate checks one channel only; the others still show what they show).
    valueOf = (item, ch) => {
      const rec = whatIf ? item.agent : item.agent && inScope(ch) ? item.agent : item.raw || item.agent;
      if (!rec || !appliesTo(rec.type, ch)) return null;
      const wrong = rec.wrong.includes(ch);
      return { id: item.id, type: rec.type, text: shortFact(rec.type, wrong ? rec.published : rec.source, wrong ? "published" : "source"), full: wrong ? rec.published : rec.source, ok: !wrong };
    };
  } else {
    facts = syncFacts(model, trainId, point);
    valueOf = (fact, ch) => (appliesTo(fact.type, ch) ? { id: fact.id, type: fact.type, text: fact.source, full: fact.sourceFull, ok: true } : null);
  }
  const sourceItems = items.length ? items : facts;

  const checkedTrain = !!(agentAll && result);
  const list = channels.map((ch) => {
    const values = sourceItems.map((it) => valueOf(it, ch)).filter(Boolean);
    let verdict = null;
    if (checkedTrain && (whatIf || inScope(ch))) {
      if (!values.length) verdict = "na";
      else if (values.some((v) => !v.ok)) verdict = whatIf ? "what_if" : "wrong";
      else verdict = whatIf ? null : "right";
    }
    const info = publishedInfo(model, trainId, ch);
    return {
      channel: ch, label: CHANNEL_PLAIN[ch]?.label || ch, de: CHANNEL_PLAIN[ch]?.de || "",
      asOf: info.current ? null : minuteLabel(info.at),
      values, verdict
    };
  });

  // The impact as the agent's engine result states it: the passengers who would act on wrong
  // information (the KPI tile's figure), for every train the result covers.
  let impact = null;
  if (checkedTrain) {
    const base = result.baseline || {};
    impact = {
      pax: typeof base.misinformed_pax === "number" ? base.misinformed_pax : agentAll.reduce((sum, c) => sum + (c.pax || 0), 0),
      affected: typeof base.affected_pax === "number" ? base.affected_pax : null,
      trains: (result.trains || []).length,
      contradictions: (result.contradictions || []).length,
      minutes: base.first_event_min ?? null,
      where: base.first_event_label || null,
      stage: whatIf ? "what_if" : basisKey === "partial" || basisKey === "estimate" ? "estimate" : "verified",
      // What a first estimate left out, as the engine names it: other channels, stops or trains.
      notChecked: [...new Set((result.left_out || []).map((s) => (/^channels/.test(s) ? "channel" : /^stops/.test(s) ? "stop" : /^trains/.test(s) ? "train" : null)).filter(Boolean))]
    };
    impact.covered = coveredText(model, result, impact.notChecked);
  }

  return {
    train: { id: trainId, number: t.number, from: t.from, to: t.to },
    stop: point ? stopLine(model, trainId, point) : null,
    change: changeLine(model, trainId),
    facts,
    channels: list,
    more: new Set(pool.filter((c) => c.point !== point).map((c) => c.point)).size,
    checked: checkedTrain,
    whatIf,
    impact
  };
}

/**
 * What a first estimate looked at, in the words of the impact line: "journey planner & app only",
 * "ICE 1022 only", "Köln Hbf only", or "not everything checked" when it left out several kinds.
 */
function coveredText(model, result, notChecked) {
  if (!notChecked?.length) return null;
  if (notChecked.length > 1) return "not everything checked";
  const lower = (x) => x.charAt(0).toLowerCase() + x.slice(1);
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0]);
  if (notChecked[0] === "channel" && result.scope?.channels?.length) return `${list(result.scope.channels.map((ch) => lower(CHANNEL_PLAIN[ch]?.label || ch)))} only`;
  if (notChecked[0] === "stop" && result.scope?.stops?.length) return `${list(result.scope.stops.map((p) => pointName(model, p)))} only`;
  if (notChecked[0] === "train" && (result.trains || []).length) return `${list(result.trains.map((t) => t.number || t))} only`;
  return `not every ${notChecked[0]} checked`;
}

// ---- the physical layer --------------------------------------------------------------------------------

/** One sensor reading in plain English (the German original stays in the tooltip). */
export function sensorLine(model, o) {
  const v = o.values || {};
  const at = pointName(model, o.point);
  const name = (p) => pointName(model, p);
  switch (o.kind) {
    case "point_failure": return `Point ${v.switch || "failure"} failed at ${at}${(v.tracks_blocked || []).length ? `: platforms ${v.tracks_blocked.join(" and ")} blocked` : ""}`;
    case "route_set": return v.turn_at ? `Interlocking: the train ends at ${name(v.turn_at)}, platform ${v.track}` : `Interlocking: route out of platform ${v.track} stored`;
    case "interlocking_failure": return `Interlocking failure: no trains ${(v.section || []).map(name).join(" – ")}`;
    case "train_position": return `Train located on the approach to ${at}${v.track ? `, platform ${v.track}` : ""}`;
    case "door_log": return `Door log: no door release at ${at} on ${v.runs ? `all ${v.runs}` : "the last"} runs`;
    case "platform_length": return `Platform ${v.platform_m} m long, train ${v.train_m} m`;
    case "consist_reading": return `Coaches read by RFID: coach ${v.leading_car} leads${v.order ? ` (${v.order})` : ""}`;
    case "section_time": return `Running time ${(v.section || []).map(name).join(" – ")}: ${(v.measured_min || []).map((x) => `+${x}`).join(" and ")} min`;
    default: return String(o.kind || "Reading").replace(/_/g, " ");
  }
}

/**
 * The sensor readings that bear on a train's change, among the stations the agent has read the
 * physical layer at: readings about the train itself first. Returns [{ id, time, text, full, source }].
 */
export function sensorReadings(model, trainId, observedPoints) {
  const pts = new Set(observedPoints || []);
  const changeIds = new Set(changesOf(model, trainId).map((c) => c.id));
  const t = model.trains.get(trainId);
  if (t?.created_by) changeIds.add(t.created_by);
  const relevant = (o) => (o.trains || []).includes(trainId)
    || (o.supports || []).some((s) => changeIds.has(s) || String(s).startsWith(`${trainId}:`));
  return model.world.observations
    .filter((o) => pts.has(o.point) && relevant(o))
    .sort((a, b) => Number((b.trains || []).includes(trainId)) - Number((a.trains || []).includes(trainId)) || a.at - b.at)
    // A register entry has no time of day (at 0): it is shown without one.
    .map((o) => ({ id: o.id, time: o.at ? minuteLabel(o.at) : null, text: sensorLine(model, o), full: o.text, source: o.source }));
}

/** The stations where readings bear on a train's change (the strip and the tests use them). */
export function sensorPoints(model, trainId) {
  return [...new Set(sensorReadings(model, trainId, model.world.observations.map((o) => o.point)).map((r) => model.observations.get(r.id)?.point).filter(Boolean))];
}
