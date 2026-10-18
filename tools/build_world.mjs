// Builds data/world.js, the synthetic operating snapshot of the Timetable Translator (developer
// tool; the app itself needs no build step and loads the generated file).
// Usage from the repository root:  node tools/build_world.mjs
//
// What it writes:
//   - the Köln – Dortmund corridor: real stations with their Ril 100 codes, a schematic position
//     for the mirror's corridor strip, platform tracks with sectors (lengths and sector positions
//     invented), and the lines that join them;
//   - about forty trips (ICE, RE, S-Bahn, a replacement bus) with their base timetable (version 1)
//     computed from segment running times, to a tenth of a minute as in a Betriebsfahrplan;
//   - the operational changes of the morning (dispatch decisions, a construction timetable order,
//     a turned train set), each of which creates a new source version of the trains it touches;
//   - what every customer channel (journey planner and app, station displays, announcements, coach
//     order) has published for each train, from which source version, and why it is behind;
//   - the physical layer: point-machine and interlocking diagnostics, train positions, door logs,
//     platform lengths, a coach-order reading and measured section times;
//   - passengers per stop (boarding, alighting, seat reservations) and the connections at stations.
//
// Every train number, time, track, passenger figure and observation is invented. The stations,
// their Ril 100 codes and the lines between them are real public facts (DATA_SOURCES.md §2).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- time helpers (seconds since midnight; a Betriebsfahrplan counts tenths of a minute) ---------
const T = (s) => {
  const m = /^(\d{1,2}):(\d{2})(?:\.(\d))?$/.exec(String(s));
  if (!m) throw new Error(`Bad time ${s}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + (m[3] ? Number(m[3]) * 6 : 0);
};
const tenth = (sec) => Math.round(sec / 6) * 6;
const MIN = (m) => tenth(m * 60);

const WORLD_VERSION = "1.0.0";
const NOW = T("07:28");

// ---- the corridor --------------------------------------------------------------------------------
// x/y place each station on the mirror's corridor strip (0–100 wide, 0–36 high): the main line along
// the bottom, the Wuppertal line along the top. a_end: the end of the platforms where sector A lies.
const P = (id, name, x, y, tracks, extra = {}) => ({ id, ril100: id, name, x, y, tracks, ...extra });
const track = (n, o = {}) => [String(n), { length_m: 405, a_end: "S", stop_offset: 0, ...o }];
const tracks = (...list) => Object.fromEntries(list.map((t) => (Array.isArray(t) ? t : track(t))));

const POINTS = [
  P("KK", "Köln Hbf", 4, 30, tracks(2, 3, 4, 5, 6, track(7, { stop_offset: 1, note: "Train stops one sector further north than on track 5." }), 9, 10, 11), { hub: true }),
  P("KKDZ", "Köln Messe/Deutz", 12, 30, tracks(1, 2, 4, 5, 7, 8, 9, 10)),
  P("KKM", "Köln-Mülheim", 20, 30, tracks(1, 2, track(3, { length_m: 215, note: "Platform 215 m: shorter than an ICE double unit." }), 4)),
  P("KLMI", "Leverkusen Mitte", 29, 30, tracks(1, 2, 3, 4)),
  P("KD", "Düsseldorf Hbf", 40, 30, tracks(5, 13, 14, 15, 16, 17, 18), { hub: true }),
  P("KDFF", "Düsseldorf Flughafen", 49, 30, tracks(1, 2, 3, 4)),
  P("EDG", "Duisburg Hbf", 58, 30, tracks(4, 5, 8, 9, 12, 13), { hub: true }),
  P("EMLR", "Mülheim (Ruhr) Hbf", 67, 30, tracks(1, 2, 3, 4)),
  P("EE", "Essen Hbf", 75, 30, tracks(2, 4, 5, 6, 7), { hub: true }),
  P("EBO", "Bochum Hbf", 85, 30, tracks(3, 4, 5, 6)),
  P("EDO", "Dortmund Hbf", 96, 30, tracks(6, 7, 11, 16, 21), { hub: true }),
  P("KSO", "Solingen Hbf", 33, 8, tracks(1, 2, 3)),
  P("KW", "Wuppertal Hbf", 48, 8, tracks(1, 2, 3, 4, track("Bus", { length_m: 0, bus: true, note: "Replacement-bus stop in front of the station." })), { hub: true }),
  P("KWO", "Wuppertal-Oberbarmen", 57, 8, tracks(1, 2, 3, 4, track("Bus", { length_m: 0, bus: true }))),
  P("EHG", "Hagen Hbf", 72, 8, tracks(2, 3, 4, 5, track("Bus", { length_m: 0, bus: true, note: "Replacement-bus stop, Graf-von-Galen-Ring exit." })), { hub: true }),
  P("EWIT", "Witten Hbf", 85, 8, tracks(1, 2, 3))
];
const POINT = new Map(POINTS.map((p) => [p.id, p]));

// Lines with their running times in minutes for an ICE between neighbouring points (RE, S-Bahn and
// bus derive theirs). Both directions use the same times.
const SEGMENTS = [
  ["KK", "KKDZ", 3.4], ["KKDZ", "KKM", 2.8], ["KKM", "KLMI", 4.6], ["KLMI", "KD", 12.6], ["KD", "KDFF", 5.8],
  ["KDFF", "EDG", 7.6], ["EDG", "EMLR", 6.2], ["EMLR", "EE", 4.4], ["EE", "EBO", 9.4], ["EBO", "EDO", 9.8],
  ["KKM", "KSO", 12.2], ["KSO", "KW", 9.0], ["KW", "KWO", 4.4], ["KWO", "EHG", 10.4], ["EHG", "EWIT", 8.8], ["EWIT", "EDO", 9.6],
  ["KD", "KW", 19.0] // Düsseldorf – Wuppertal (via Erkrath; the stations between are not modelled)
];
const LINES = [
  { id: "main", name: "Köln – Düsseldorf – Duisburg – Essen – Bochum – Dortmund", points: ["KK", "KKDZ", "KKM", "KLMI", "KD", "KDFF", "EDG", "EMLR", "EE", "EBO", "EDO"] },
  { id: "wupper", name: "Köln – Solingen – Wuppertal – Hagen – Witten – Dortmund", points: ["KKM", "KSO", "KW", "KWO", "EHG", "EWIT", "EDO"] },
  { id: "dw", name: "Düsseldorf – Wuppertal", points: ["KD", "KW"] }
];
const FACTOR = { ICE: 1, IC: 1.05, RE: 1.22, S: 1.32, Bus: 1 };
const BUS_MIN = { "EHG-KWO": 26, "KWO-KW": 12 };

function runMinutes(a, b, category) {
  if (category === "Bus") {
    const k = BUS_MIN[`${a}-${b}`] ?? BUS_MIN[`${b}-${a}`];
    if (k === undefined) throw new Error(`No bus time ${a}-${b}`);
    return k;
  }
  const seg = SEGMENTS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (!seg) throw new Error(`No segment ${a}-${b}`);
  return seg[2] * FACTOR[category];
}

// ---- trips ----------------------------------------------------------------------------------------
// route: every point the trip passes, in order. stops: point → { dwell (min), track, kind? }
// kind "ops" marks a Betriebshalt (an operational stop with no passengers). Points on the route
// without an entry are passed (Durchfahrt). The first and the last point are always stops.
const ICE_MAIN_N = ["KK", "KKDZ", "KKM", "KLMI", "KD", "KDFF", "EDG", "EMLR", "EE", "EBO", "EDO"];
const ICE_MAIN_S = [...ICE_MAIN_N].reverse();
const ICE_WUP_S = ["EDO", "EWIT", "EHG", "KWO", "KW", "KSO", "KKM", "KKDZ", "KK"];
const ICE_WUP_N = [...ICE_WUP_S].reverse();

// RE 1 tracks by direction (invented, kept stable for every RE 1 trip).
const RE1_TRACK = {
  N: { KK: "9", KKDZ: "4", KKM: "1", KLMI: "1", KD: "14", KDFF: "1", EDG: "8", EMLR: "1", EE: "5", EBO: "5", EDO: "21" },
  S: { EDO: "21", EBO: "6", EE: "6", EMLR: "2", EDG: "9", KDFF: "2", KD: "15", KLMI: "2", KKM: "2", KKDZ: "5", KK: "10" }
};

const TRIPS = [
  // -- northbound ICE on the main line
  { id: "T-614", number: "ICE 614", category: "ICE", direction: "N", from: "Köln Hbf", to: "Hamburg-Altona", route: ICE_MAIN_N, start: "07:12",
    stops: { KK: { track: "5" }, KD: { dwell: 1.8, track: "16" }, EDG: { dwell: 1.6, track: "5" }, EE: { dwell: 1.8, track: "2" }, EBO: { dwell: 1.4, track: "3" }, EDO: { track: "16" } } },
  { id: "T-618", number: "ICE 618", category: "ICE", direction: "N", from: "Köln Hbf", to: "Hamburg-Altona", route: ICE_MAIN_N, start: "07:42",
    stops: { KK: { track: "5" }, KD: { dwell: 1.8, track: "16" }, KDFF: { dwell: 1.2, track: "3" }, EDG: { dwell: 1.6, track: "5" }, EE: { dwell: 1.8, track: "2" }, EBO: { dwell: 1.4, track: "3" }, EDO: { track: "16" } } },
  { id: "T-1023", number: "ICE 1023", category: "ICE", direction: "N", from: "Köln Hbf", to: "Berlin Hbf", route: ICE_WUP_N, start: "07:55",
    stops: { KK: { track: "4" }, KW: { dwell: 1.6, track: "2" }, EHG: { dwell: 1.6, track: "4" }, EDO: { track: "11" } } },
  { id: "T-516", number: "ICE 516", category: "ICE", direction: "N", from: "Köln Hbf", to: "Berlin Hbf", route: ICE_MAIN_N, start: "08:12",
    stops: { KK: { track: "4" }, KD: { dwell: 1.8, track: "16" }, EDG: { dwell: 1.6, track: "5" }, EE: { dwell: 1.8, track: "2" }, EBO: { dwell: 1.4, track: "3" }, EDO: { track: "16" } } },
  { id: "T-612", number: "ICE 612", category: "ICE", direction: "N", from: "Köln Hbf", to: "Hamburg-Altona", route: ICE_MAIN_N, start: "08:42",
    stops: { KK: { track: "5" }, KD: { dwell: 1.8, track: "16" }, EDG: { dwell: 1.6, track: "5" }, EE: { dwell: 1.8, track: "2" }, EBO: { dwell: 1.4, track: "3" }, EDO: { track: "16" } } },
  // -- southbound ICE on the main line
  { id: "T-1027", number: "ICE 1027", category: "ICE", direction: "S", from: "Berlin Hbf", to: "Köln Hbf", route: ICE_MAIN_S, start: "07:36",
    stops: { EDO: { track: "11" }, EBO: { dwell: 1.4, track: "4" }, EE: { dwell: 1.8, track: "4" }, EDG: { dwell: 1.6, track: "4" }, KD: { dwell: 1.8, track: "17" }, KKM: { dwell: 1.8, track: "3", kind: "ops", reason: "Betriebshalt: Abwarten der Einfahrt Köln Hbf (Hohenzollernbrücke)" }, KK: { track: "3" } } },
  { id: "T-1025", number: "ICE 1025", category: "ICE", direction: "S", from: "Hamburg-Altona", to: "Köln Hbf", route: ICE_MAIN_S, start: "08:06",
    stops: { EDO: { track: "11" }, EBO: { dwell: 1.4, track: "4" }, EE: { dwell: 1.8, track: "4" }, EDG: { dwell: 1.6, track: "4" }, KD: { dwell: 1.8, track: "17" }, KK: { track: "6" } } },
  // -- southbound ICE on the Wuppertal line (diverted this morning)
  { id: "T-1022", number: "ICE 1022", category: "ICE", direction: "S", from: "Berlin Hbf", to: "Köln Hbf", route: ICE_WUP_S, start: "07:47",
    stops: { EDO: { track: "11" }, EHG: { dwell: 1.6, track: "3" }, KW: { dwell: 1.6, track: "3" }, KK: { track: "2" } } },
  { id: "T-1026", number: "ICE 1026", category: "ICE", direction: "S", from: "Berlin Hbf", to: "Köln Hbf", route: ICE_WUP_S, start: "08:47",
    stops: { EDO: { track: "11" }, EHG: { dwell: 1.6, track: "3" }, KW: { dwell: 1.6, track: "3" }, KK: { track: "2" } } },
  // -- RE 1 (Aachen – Hamm), all stations of the corridor
  ...[["T-10107", "RE 10107", "07:18", "N"], ["T-10109", "RE 10109", "08:18", "N"], ["T-10111", "RE 10111", "09:18", "N"],
    ["T-10106", "RE 10106", "07:05", "S"], ["T-10108", "RE 10108", "08:05", "S"]].map(([id, number, start, direction]) => ({
    id, number, line: "RE 1", category: "RE", direction, from: direction === "N" ? "Aachen Hbf" : "Hamm (Westf) Hbf", to: direction === "N" ? "Hamm (Westf) Hbf" : "Aachen Hbf",
    route: direction === "N" ? ICE_MAIN_N : ICE_MAIN_S, start,
    stops: Object.fromEntries((direction === "N" ? ICE_MAIN_N : ICE_MAIN_S).map((p) => [p, { dwell: 0.8, track: RE1_TRACK[direction][p] }]))
  })),
  // -- RE 4 (Dortmund – Wuppertal – Düsseldorf – Aachen); the Hagen – Wuppertal leg is cut this morning
  { id: "T-10423", number: "RE 10423", line: "RE 4", category: "RE", direction: "S", from: "Dortmund Hbf", to: "Aachen Hbf", route: ["EDO", "EWIT", "EHG", "KWO", "KW", "KD"], start: "07:52",
    stops: { EDO: { track: "6" }, EWIT: { dwell: 0.8, track: "2" }, EHG: { dwell: 1.0, track: "5" }, KWO: { dwell: 0.8, track: "2" }, KW: { dwell: 1.0, track: "4" }, KD: { track: "5" } } },
  { id: "T-10426", number: "RE 10426", line: "RE 4", category: "RE", direction: "N", from: "Aachen Hbf", to: "Dortmund Hbf", route: ["KD", "KW", "KWO", "EHG", "EWIT", "EDO"], start: "08:45",
    stops: { KD: { track: "5" }, KW: { dwell: 1.0, track: "1" }, KWO: { dwell: 0.8, track: "1" }, EHG: { dwell: 1.0, track: "4" }, EWIT: { dwell: 0.8, track: "1" }, EDO: { track: "6" } } },
  { id: "T-10425", number: "RE 10425", line: "RE 4", category: "RE", direction: "S", from: "Dortmund Hbf", to: "Aachen Hbf", route: ["EDO", "EWIT", "EHG", "KWO", "KW", "KD"], start: "08:52",
    stops: { EDO: { track: "6" }, EWIT: { dwell: 0.8, track: "2" }, EHG: { dwell: 1.0, track: "5" }, KWO: { dwell: 0.8, track: "2" }, KW: { dwell: 1.0, track: "4" }, KD: { track: "5" } } },
  { id: "T-10428", number: "RE 10428", line: "RE 4", category: "RE", direction: "N", from: "Aachen Hbf", to: "Dortmund Hbf", route: ["KD", "KW", "KWO", "EHG", "EWIT", "EDO"], start: "09:45",
    stops: { KD: { track: "5" }, KW: { dwell: 1.0, track: "1" }, KWO: { dwell: 0.8, track: "1" }, EHG: { dwell: 1.0, track: "4" }, EWIT: { dwell: 0.8, track: "1" }, EDO: { track: "6" } } },
  // -- RB 48 westbound from Wuppertal (Wuppertal-Oberbarmen is cut off this morning)
  ...["07:51", "08:51", "09:51", "10:51"].map((start, i) => ({
    id: `T-RB48-${i + 1}`, number: `RB ${30471 + 2 * i}`, line: "RB 48", category: "RE", direction: "S", from: "Wuppertal-Oberbarmen", to: "Bonn-Mehlem", route: ["KW", "KSO", "KKM", "KKDZ", "KK"], start, external_after: true,
    stops: { KW: { track: "2" }, KSO: { dwell: 0.8, track: "1" }, KKM: { dwell: 0.8, track: "2" }, KKDZ: { dwell: 0.8, track: "2" }, KK: { track: "10" } }
  })),
  // -- RE 7 westbound (Wuppertal – Köln), runs west of the cut
  { id: "T-10721", number: "RE 10721", line: "RE 7", category: "RE", direction: "S", from: "Hamm (Westf) Hbf", to: "Krefeld Hbf", route: ["KW", "KSO", "KKM", "KKDZ", "KK"], start: "08:21", origin_cut_by: "OPS-03",
    stops: { KW: { track: "1" }, KSO: { dwell: 0.8, track: "2" }, KKM: { dwell: 0.8, track: "2" }, KKDZ: { dwell: 0.8, track: "2" }, KK: { track: "9" } } },
  { id: "T-10723", number: "RE 10723", line: "RE 7", category: "RE", direction: "S", from: "Hamm (Westf) Hbf", to: "Krefeld Hbf", route: ["KW", "KSO", "KKM", "KKDZ", "KK"], start: "09:21",
    stops: { KW: { track: "1" }, KSO: { dwell: 0.8, track: "2" }, KKM: { dwell: 0.8, track: "2" }, KKDZ: { dwell: 0.8, track: "2" }, KK: { track: "9" } } },
  { id: "T-10725", number: "RE 10725", line: "RE 7", category: "RE", direction: "S", from: "Hamm (Westf) Hbf", to: "Krefeld Hbf", route: ["KW", "KSO", "KKM", "KKDZ", "KK"], start: "10:21",
    stops: { KW: { track: "1" }, KSO: { dwell: 0.8, track: "2" }, KKM: { dwell: 0.8, track: "2" }, KKDZ: { dwell: 0.8, track: "2" }, KK: { track: "9" } } },
  // -- RE 57 at Dortmund: the connection the construction order breaks
  { id: "T-RE57-0957", number: "RE 57", line: "RE 57", category: "RE", direction: "E", from: "Dortmund Hbf", to: "Winterberg (Westf)", route: ["EDO"], start: "10:01", external_after: true,
    stops: { EDO: { track: "7" } } },
  { id: "T-RE57-1057", number: "RE 57", line: "RE 57", category: "RE", direction: "E", from: "Dortmund Hbf", to: "Winterberg (Westf)", route: ["EDO"], start: "11:01", external_after: true,
    stops: { EDO: { track: "7" } } }
];

// S 11 shuttles in Köln (Köln Hbf – Köln Messe/Deutz – Köln-Mülheim), every ten minutes both ways (the
// S-Bahn platforms: Köln Hbf 10 and 11, Messe/Deutz 9 and 10).
for (let m = T("07:00"); m <= T("10:40"); m += 10 * 60) {
  const hhmm = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  const n = 30100 + ((m - T("07:00")) / 600) * 2;
  TRIPS.push({ id: `T-S${n}`, number: `S ${n}`, line: "S 11", category: "S", direction: "N", from: "Düsseldorf Flughafen Terminal", to: "Bergisch Gladbach", route: ["KK", "KKDZ", "KKM"], start: hhmm(m), external_after: true,
    stops: { KK: { track: "11" }, KKDZ: { dwell: 0.6, track: "9" }, KKM: { track: "4" } } });
  TRIPS.push({ id: `T-S${n + 1}`, number: `S ${n + 1}`, line: "S 11", category: "S", direction: "S", from: "Bergisch Gladbach", to: "Düsseldorf Flughafen Terminal", route: ["KKM", "KKDZ", "KK"], start: hhmm(m + 4 * 60), external_after: true,
    stops: { KKM: { track: "3" }, KKDZ: { dwell: 0.6, track: "10" }, KK: { track: "10" } } });
}

// ---- generate a timetable from a route, the stops and a start time --------------------------------
function generate(trip, { route = trip.route, stops = trip.stops, start = T(trip.start), extraAt = {} } = {}) {
  const rows = [];
  let t = start;
  for (let i = 0; i < route.length; i++) {
    const p = route[i];
    const s = stops[p];
    if (i > 0) t = tenth(t + runMinutes(route[i - 1], p, trip.category) * 60);
    if (extraAt[p]) t = tenth(t + extraAt[p] * 60);
    const first = i === 0;
    const last = i === route.length - 1;
    if (first) {
      rows.push({ point: p, arr: null, dep: t, activity: "start", track: s?.track ?? null });
    } else if (last && !trip.external_after) {
      rows.push({ point: p, arr: t, dep: null, activity: "end", track: s?.track ?? null });
    } else if (s) {
      const dwell = MIN(s.dwell ?? 1);
      const row = { point: p, arr: t, dep: tenth(t + dwell), activity: s.kind === "ops" ? "ops_stop" : "stop", track: s.track ?? null };
      if (s.reason) row.remark = s.reason;
      rows.push(row);
      t = row.dep;
    } else {
      rows.push({ point: p, pass: t, activity: "pass", track: null });
    }
  }
  if (trip.external_after && rows.length) {
    // The trip continues beyond the corridor: its last modelled point is a departure, not an end.
    const lastRow = rows[rows.length - 1];
    if (lastRow.activity === "end") { lastRow.activity = "stop"; lastRow.dep = tenth(lastRow.arr + 60); }
    if (route.length === 1) { lastRow.activity = "start"; }
  }
  return rows;
}

// ---- passengers ------------------------------------------------------------------------------------
// A deterministic generator (mulberry32) spreads plausible numbers; scenario-critical figures are set
// explicitly below so that the stories read well. Reservations are a share of boarding passengers.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261018);
const BASE_PAX = { ICE: [180, 320], RE: [60, 160], S: [20, 70], Bus: [10, 30] };
const RES_SHARE = { ICE: 0.34, RE: 0, S: 0, Bus: 0 };
function passengers(trip, rows) {
  const out = {};
  const [lo, hi] = BASE_PAX[trip.category];
  const stopsRows = rows.filter((r) => ["start", "stop", "end"].includes(r.activity));
  stopsRows.forEach((r, i) => {
    const hub = POINT.get(r.point)?.hub;
    const scale = hub ? 1 : 0.45;
    const board = r.activity === "end" ? 0 : Math.round((lo + rnd() * (hi - lo)) * (i === 0 ? 1 : 0.42) * scale);
    const alight = r.activity === "start" ? 0 : Math.round((lo + rnd() * (hi - lo)) * (r.activity === "end" ? 0.9 : 0.36) * scale);
    out[r.point] = { board, alight, reserved_board: Math.round(board * RES_SHARE[trip.category]) };
  });
  return out;
}
const PAX_OVERRIDE = {
  "T-618": { KK: { board: 312, alight: 0, reserved_board: 104 } },
  // EE and KD are not on the base route of 1022 and 1026: these are the passengers the extra stops
  // of the diversion would serve (boarding towards Köln), had they known.
  "T-1022": { EDO: { board: 186, alight: 0, reserved_board: 63 }, EHG: { board: 74, alight: 52, reserved_board: 21 }, KW: { board: 96, alight: 81, reserved_board: 30 }, KK: { board: 0, alight: 247, reserved_board: 0 }, EE: { board: 18, alight: 0, reserved_board: 0 }, KD: { board: 27, alight: 0, reserved_board: 0 } },
  "T-1026": { EDO: { board: 164, alight: 0, reserved_board: 55 }, EHG: { board: 61, alight: 47, reserved_board: 18 }, KW: { board: 88, alight: 73, reserved_board: 27 }, KK: { board: 0, alight: 221, reserved_board: 0 }, EE: { board: 15, alight: 0, reserved_board: 0 }, KD: { board: 22, alight: 0, reserved_board: 0 } },
  "T-1027": { KKM: { board: 21, alight: 37, reserved_board: 0, note: "Journeys booked to or from Köln-Mülheim because the journey planner lists the stop." } },
  "T-1025": { KK: { board: 0, alight: 268, reserved_board: 0 } },
  "T-516": { KK: { board: 284, alight: 0, reserved_board: 112 }, KD: { board: 133, alight: 49, reserved_board: 51 }, EDG: { board: 58, alight: 37, reserved_board: 19 }, EE: { board: 71, alight: 54, reserved_board: 26 } },
  "T-612": { EDO: { board: 52, alight: 118, reserved_board: 0 } }
};

// ---- consists ----------------------------------------------------------------------------------------
// An ICE set of seven cars as passengers see it: 1st class at one end, the restaurant car next to it.
const ICE_CARS = [
  { car: "21", class: "1" }, { car: "22", class: "1" }, { car: "23", class: "BR" },
  { car: "24", class: "2" }, { car: "25", class: "2" }, { car: "26", class: "2" }, { car: "27", class: "2" }
];

// ---- build the trips ---------------------------------------------------------------------------------
const trains = TRIPS.map((trip) => {
  const rows = generate(trip);
  const pax = { ...passengers(trip, rows) };
  for (const [p, v] of Object.entries(PAX_OVERRIDE[trip.id] || {})) pax[p] = { ...(pax[p] || {}), ...v };
  return {
    id: trip.id, number: trip.number, line: trip.line || trip.number.split(" ")[0], category: trip.category, direction: trip.direction,
    from: trip.from, to: trip.to, route_line: routeLine(trip.route),
    base: rows,
    consist: trip.category === "ICE" ? { cars: ICE_CARS, order: "standard", length_m: trip.id === "T-1027" ? 346 : 200, double: trip.id === "T-1027" } : null,
    passengers: pax,
    ...(trip.external_after ? { continues_beyond: true } : {})
  };
});
const TRAIN = new Map(trains.map((t) => [t.id, t]));

function routeLine(route) {
  if (route.length < 2) return "station";
  if (route.includes("KW") && route.includes("EHG")) return "wupper";
  if (route.includes("KD") && route.includes("KW")) return "dw";
  if (route.every((p) => LINES[0].points.includes(p))) return "main";
  return "mixed";
}

// ---- operational changes of the morning -----------------------------------------------------------
// Each change creates the next source version of every train it touches. "ops" are applied in order.
// The text is the record as the operational systems keep it (German operating language).
const ice = (id) => TRAIN.get(id);
const rowAt = (trainId, point) => ice(trainId).base.find((r) => r.point === point);

// Diverted Wuppertal-line ICE: main line via Bochum and Essen, extra stops at Essen Hbf and
// Düsseldorf Hbf, no stops at Hagen Hbf and Wuppertal Hbf; a path conflict adds a wait at Duisburg.
function divertedRows(trainId) {
  const t = ice(trainId);
  const orig = t.base;
  const start = orig[0].dep;
  const plannedEnd = orig[orig.length - 1].arr;
  const trip = { category: "ICE", external_after: false };
  const stops = { EDO: { track: "11" }, EE: { dwell: 1.8, track: "4" }, KD: { dwell: 1.8, track: "17" }, KK: { track: "2" } };
  // First without the wait, to know how much the path conflict must add for +12 minutes in Köln.
  const plain = generate(trip, { route: ICE_MAIN_S, stops, start });
  const wait = (plannedEnd + 12 * 60 - plain[plain.length - 1].arr) / 60;
  const withWait = { ...stops, EDG: { dwell: Math.round(wait * 10) / 10, track: "4", kind: "ops", reason: "Betriebshalt: Abwarten Trasse (Umleitungsverkehr)" } };
  return generate(trip, { route: ICE_MAIN_S, stops: withWait, start });
}

// Diverted northbound Wuppertal-line ICE: main line without extra stops (published automatically).
function divertedNorthRows(trainId) {
  const t = ice(trainId);
  const start = t.base[0].dep;
  const stops = { KK: { track: "4" }, EDO: { track: "11" } };
  return generate({ category: "ICE", external_after: false }, { route: ICE_MAIN_N, stops, start, extraAt: { EDG: 5 } });
}

const CHANGES = [
  {
    id: "OPS-01", at: T("06:41"), source: "Fahrzeugdisposition Fernverkehr", kind: "consist", trains: ["T-516"],
    text: "Zug 516: Wagenreihung umgekehrt. Triebzug nach Wende im Bw Köln-Deutzerfeld gedreht abgestellt; Wagen 27 läuft an der Spitze, 1. Klasse am Zugschluss.",
    ops: [{ train: "T-516", op: "consist", order: "reversed" }]
  },
  {
    id: "OPS-02", at: T("06:50"), source: "Baubetriebsplanung (Fplo-Stelle)", kind: "fplo", trains: ["T-612", "T-10109"],
    text: "Fplo Nr. 1187: Langsamfahrstelle Bochum Hbf – Dortmund Hbf, 70 km/h (Oberbauarbeiten). Mehrfahrzeit +4,0 Min ab Bochum Hbf für die Züge 612 und 10109. Gültig heute 08:00 – 14:00.",
    ops: [{ train: "T-612", op: "shift_after", point: "EBO", minutes: 4 }, { train: "T-10109", op: "shift_after", point: "EBO", minutes: 4 }]
  },
  {
    id: "OPS-03", at: T("07:08"), source: "Netzleitzentrale / Disposition Hagen", kind: "diversion", trains: ["T-1022", "T-1026", "T-1023", "T-10423", "T-10426", "T-10425", "T-10428"],
    text: "Stellwerksausfall Wuppertal-Oberbarmen, keine Fahrten Hagen Hbf – Wuppertal Hbf. Züge 1022 und 1026: Umleitung Dortmund – Bochum – Essen – Duisburg – Düsseldorf – Köln, Halte Hagen Hbf und Wuppertal Hbf entfallen, Zusatzhalte Essen Hbf und Düsseldorf Hbf, Mehrfahrzeit +12 Min. Zug 1023: Umleitung über Düsseldorf ohne Zusatzhalte. RE 10423 und RE 10425 enden in Hagen Hbf, RE 10426 und RE 10428 enden in Wuppertal Hbf. Schienenersatzverkehr Hagen Hbf – Wuppertal-Oberbarmen – Wuppertal Hbf eingerichtet.",
    ops: [
      { train: "T-1022", op: "replace_rows", rows: divertedRows("T-1022"), route_line: "main" },
      { train: "T-1026", op: "replace_rows", rows: divertedRows("T-1026"), route_line: "main" },
      { train: "T-1023", op: "replace_rows", rows: divertedNorthRows("T-1023"), route_line: "main" },
      { train: "T-10423", op: "terminate", point: "EHG" },
      { train: "T-10426", op: "start_at", point: "KD", end: "KW" },
      { train: "T-10425", op: "terminate", point: "EHG" },
      { train: "T-10428", op: "start_at", point: "KD", end: "KW" }
    ],
    creates_trips: ["T-SEV1", "T-SEV2", "T-SEV3", "T-SEV4", "T-SEV5", "T-SEV6", "T-SEV7", "T-SEV8", "T-SEV9"]
  },
  {
    id: "OPS-04", at: T("07:17"), source: "Disposition Fernverkehr, Bereich Köln", kind: "terminate", trains: ["T-1025"],
    text: "Zug 1025: Teilausfall Köln Messe/Deutz – Köln Hbf, Zug endet in Köln Messe/Deutz Gl. 1 und kehrt dort (Kapazität Köln Hbf, Weichenstörung W 32).",
    ops: [{ train: "T-1025", op: "terminate_at", point: "KKDZ", track: "1" }]
  },
  {
    id: "OPS-05", at: T("07:21"), source: "Fahrdienstleiter Köln Hbf", kind: "platform", trains: ["T-618"],
    text: "Zug 618: Gleiswechsel Köln Hbf, Abfahrt Gl. 7 statt Gl. 5 (Weichenstörung W 32, Fahrstraßen über W 32 gesperrt).",
    ops: [{ train: "T-618", op: "set_track", point: "KK", track: "7" }]
  }
];

// The replacement bus Hagen – Wuppertal (exists only from OPS-03 on: version 1 of the trip).
for (const [i, start] of ["07:35", "07:55", "08:15", "08:35", "08:55", "09:15", "09:35", "09:55", "10:15"].entries()) {
  const trip = { id: `T-SEV${i + 1}`, number: `Bus SEV ${i + 1}`, line: "SEV", category: "Bus", direction: "S", from: "Hagen Hbf", to: "Wuppertal Hbf",
    route: ["EHG", "KWO", "KW"], start, stops: { EHG: { track: "Bus" }, KWO: { dwell: 0.5, track: "Bus" }, KW: { track: "Bus" } } };
  const rows = generate(trip);
  trains.push({ id: trip.id, number: trip.number, line: "SEV", category: "Bus", direction: "S", from: trip.from, to: trip.to, route_line: "wupper",
    base: rows, consist: null, passengers: passengers(trip, rows), created_by: "OPS-03" });
}

// ---- publication: what each customer channel shows, and why it is behind -------------------------
// version: the source version the channel was generated from; faults: conversion faults of that
// channel's generation. Channels not listed for a train show its current source version.
const CYCLE_NEXT = T("08:00");
const PUBLISHED = {
  "T-618": { all: { version: 1, at: T("05:30"), cause: "short_notice" } },
  "T-1022": { all: { version: 1, at: T("05:30"), cause: "added_stop" } },
  "T-1026": { all: { version: 1, at: T("05:30"), cause: "added_stop" } },
  "T-1027": { all: { version: 1, at: T("05:30"), cause: "ops_stop_mapping", faults: ["ops_stop_as_stop"] }, coach: { version: 1, at: T("05:30") } },
  "T-1025": { planner: { version: 1, at: T("05:30"), cause: "planner_queue" }, announcements: { version: 1, at: T("05:30"), cause: "announcement_feed" }, app_push: null },
  "T-516": { coach: { version: 1, at: T("05:30"), cause: "coach_feed" } },
  "T-612": { all: { version: 1, at: T("05:30"), cause: "fplo_daily" } },
  "T-10109": { all: { version: 1, at: T("05:30"), cause: "fplo_daily" } }
};

const CAUSES = {
  short_notice: { title: "Short-notice change", text: "Changes released less than 30 minutes before departure are not published automatically; they wait for a manual publication.", auto_fix_at: null },
  added_stop: { title: "Rejected by the plausibility check", text: "The customer-timetable generation rejected the update at 07:10 because the extra stops at Essen Hbf and Düsseldorf Hbf are not in the train's list of commercial stops.", auto_fix_at: null, needs_manual_release: true },
  ops_stop_mapping: { title: "Conversion rule fault", text: "Since the timetable change the conversion loses the operational-stop flag on stops of 1.5 minutes or more, so a Betriebshalt is published as a passenger stop.", auto_fix_at: null },
  planner_queue: { title: "Journey-planner import queued", text: "Station displays take the dispatch feed directly; the journey planner imports in the half-hourly cycle, and this change missed the 07:30 import.", auto_fix_at: CYCLE_NEXT },
  announcement_feed: { title: "On-board announcements on the old run", text: "The train's automatic announcements were loaded at departure from Hamburg with the planned run to Köln Hbf.", auto_fix_at: null },
  coach_feed: { title: "Coach order is a separate feed", text: "The coach order shown in the app and on the platform coach-position displays comes from the vehicle plan of 05:30 and is not refreshed when a set is turned.", auto_fix_at: null },
  fplo_daily: { title: "Construction order after the daily run", text: "Fplo orders are processed in the daily generation at 05:30; this one was released at 06:50, and the half-hourly cycle processes dispatch changes only.", auto_fix_at: null }
};

// ---- the physical layer ----------------------------------------------------------------------------------
const OBS = [
  { id: "PHY-01", at: T("07:12"), kind: "point_failure", source: "Weichendiagnose, ESTW Köln Hbf", point: "KK", trains: [], supports: ["OPS-04", "OPS-05"],
    text: "Weiche 32: Endlage nicht erreicht, Antrieb gestört. Fahrstraßen über W 32 (Gleise 5 und 6, Ausfahrt Richtung Köln Messe/Deutz) gesperrt.",
    values: { switch: "W 32", tracks_blocked: ["5", "6"] } },
  { id: "PHY-02", at: T("07:24"), kind: "route_set", source: "Stellwerk Köln Hbf (ESTW), Fahrstraßenspeicher", point: "KK", trains: ["T-618"], supports: ["OPS-05"],
    text: "Fahrstraße für Zug 618 vorgemerkt: Ausfahrt aus Gleis 7 Richtung Köln Messe/Deutz.",
    values: { track: "7" } },
  { id: "PHY-03", at: T("07:02"), kind: "interlocking_failure", source: "Stellwerksdiagnose, ESTW Wuppertal-Oberbarmen", point: "KWO", trains: [], supports: ["OPS-03"],
    text: "Totalausfall der Stellwerksrechner, keine Fahrstraßen einstellbar. Abschnitt Hagen Hbf – Wuppertal Hbf ohne Zugfahrten.",
    values: { section: ["EHG", "KW"] } },
  { id: "PHY-04", at: T("07:26"), kind: "train_position", source: "Zugortung (GNSS und Gleisfreimeldung)", point: "EDO", trains: ["T-1022"], supports: ["OPS-03"],
    text: "Zug 1022 bereitgestellt in Dortmund Hbf Gl. 11; Ausfahrstraße Richtung Bochum Hbf eingestellt.",
    values: { track: "11", direction: "EBO" } },
  { id: "PHY-05", at: T("06:00"), kind: "door_log", source: "TCMS-Türprotokoll, Zug 1027 (letzte 5 Fahrten)", point: "KKM", trains: ["T-1027"], supports: ["T-1027:KKM:ops_stop"],
    text: "Halt in Köln-Mülheim an allen fünf Tagen ohne Türfreigabe, Haltezeit 1,6 bis 2,1 Minuten.",
    values: { door_release: false, runs: 5 } },
  { id: "PHY-06", at: T("00:00"), kind: "platform_length", source: "Infrastrukturregister (Bahnsteigdaten)", point: "KKM", trains: ["T-1027"], supports: ["T-1027:KKM:ops_stop"],
    text: "Köln-Mülheim Gl. 3: nutzbare Bahnsteiglänge 215 m. Zug 1027 fährt als Doppeltraktion mit 346 m.",
    values: { platform_m: 215, train_m: 346 } },
  { id: "PHY-07", at: T("07:23"), kind: "train_position", source: "Zugortung (GNSS)", point: "EDO", trains: ["T-1025"], supports: ["OPS-04"],
    text: "Zug 1025 läuft planmäßig von Hamburg zu; Disposition hat für Köln Messe/Deutz Gl. 1 die Kehre eingeplant.",
    values: { turn_at: "KKDZ", track: "1" } },
  { id: "PHY-08", at: T("06:58"), kind: "consist_reading", source: "RFID-Wagenerfassung, Ausfahrt Bw Köln-Deutzerfeld", point: "KKDZ", trains: ["T-516"], supports: ["OPS-01"],
    text: "Zug 516 erfasst mit Wagen 27 an der Spitze und Wagen 21 am Schluss (Reihenfolge 27 – 21).",
    values: { leading_car: "27", order: "reversed" } },
  { id: "PHY-09", at: T("07:25"), kind: "section_time", source: "Fahrzeitmessung aus der Zugortung", point: "EBO", trains: [], supports: ["OPS-02"],
    text: "Abschnitt Bochum Hbf – Dortmund Hbf heute: Züge 610 und 10105 mit +3,8 und +4,1 Minuten gegenüber Fahrplan (Langsamfahrstelle 70 km/h).",
    values: { section: ["EBO", "EDO"], measured_min: [3.8, 4.1] } }
];

// Train positions now (07:28), for the corridor strip: where each running train is.
function positionNow(rows) {
  let last = null;
  for (const r of rows) {
    const t = r.dep ?? r.pass ?? r.arr;
    if (t !== null && t !== undefined && t <= NOW) last = r;
  }
  return last ? last.point : null;
}

// ---- connections --------------------------------------------------------------------------------------
const CONNECTIONS = [
  { id: "CX-01", from_train: "T-612", to_train: "T-RE57-0957", at: "EDO", min_transfer_min: 4, passengers: 46, note: "Connection shown in the journey planner and on the train's connection display." }
];

// ---- channels and their reach -----------------------------------------------------------------------------
// Reach: the share of a passenger group a correct channel informs while it still matters. Boarding
// groups are at or on the way to the station; on-board groups are already on the train.
const CHANNELS = {
  planner: { label: "Journey planner and app", short: "Planner", reach: { boarding: 0.55, onboard: 0.35 }, data: true },
  displays: { label: "Station displays", short: "Displays", reach: { boarding: 0.9, onboard: 0.1 }, data: true },
  announcements: { label: "Announcements (station and on board)", short: "Announcements", reach: { boarding: 0.75, onboard: 0.85 }, data: true },
  coach: { label: "Coach order (app and platform coach-position displays)", short: "Coach order", reach: { boarding: 0.8, onboard: 0 }, data: true },
  app_push: { label: "App push to booked passengers", short: "App push", reach: { boarding: 0.35, onboard: 0.45 }, data: false },
  staff: { label: "Station staff and train crew", short: "Staff", reach: { boarding: 0.3, onboard: 0.8 }, data: false }
};

const PUBLICATION = {
  cycle_min: 30,
  next_cycle: CYCLE_NEXT,
  daily_run: T("05:30"),
  timings_min: { republish: 6, display_lag: 2, manual_release: 12, message: { app_push: 2, displays: 3, announcements: 3, planner: 4 }, override: 2, staff: 5, hold_decision: 3 },
  effort_min: { republish: 3, manual_release: 6, message_per_channel: 2, override_per_value: 2, override_cleanup_per_value: 2, staff: 4, hold_request: 3 },
  windows_min: { platform: [20, 2], coach_order: [15, 1], stop_not_served: [40, 5], stop_missing: [30, 3], terminus: [40, 3], time: [30, 3], connection: [30, 3] },
  note: "Timings, reach and effort are assumptions for the demonstration (DATA_SOURCES.md §4), not measured values of any railway."
};

// ---- assemble ---------------------------------------------------------------------------------------------
for (const t of trains) t.position_now = positionNow(t.base);

const world = {
  meta: {
    world_version: WORLD_VERSION,
    title: "Köln – Dortmund corridor, operating snapshot",
    now: NOW, now_label: "07:28",
    horizon_min: 180,
    snapshot_note: "A frozen snapshot of one morning at 07:28. The clock does not run on: every minute figure counts from 07:28.",
    fiction_note: "Train numbers, times, tracks, passenger figures, operational changes and sensor readings are invented. The stations, their Ril 100 codes and the lines between them are real.",
    operator_note: "No real railway's data, systems or rules are used; the publication rules are assumptions written for this demonstration."
  },
  points: POINTS,
  segments: SEGMENTS.map(([a, b, min]) => ({ a, b, ice_min: min })),
  lines: LINES,
  trains,
  changes: CHANGES,
  published: PUBLISHED,
  causes: CAUSES,
  observations: OBS,
  connections: CONNECTIONS,
  channels: CHANNELS,
  publication: PUBLICATION
};

const header = `/*
 * TIMETABLE TRANSLATOR — synthetic operating snapshot of the Köln – Dortmund corridor.
 * GENERATED by tools/build_world.mjs: do not edit by hand; change the generator and run
 * \`node tools/build_world.mjs\`.
 *
 * Invented: every train number, time, track, passenger figure, operational change, publication
 * state and sensor reading. Real: the stations, their Ril 100 codes and the lines between them
 * (DATA_SOURCES.md §2).
 *
 * Conventions
 *   - Times are seconds after midnight of the operating day (the day the app is opened). The
 *     Betriebsfahrplan counts tenths of a minute, so every time is a multiple of 6 seconds.
 *   - meta.now is the snapshot time (07:28). Minute figures count from it; the clock never runs on.
 *   - A train's base rows are source version 1; each operational change creates the next version.
 *   - published[train][channel] names the source version a customer channel shows (default: the
 *     current version) and the reason it is behind (causes).
 *
 * Loaded as a classic script so the app works without any same-origin fetch.
 */
`;
const out = `${header}window.WORLD = ${JSON.stringify(world)};\n`;
fs.writeFileSync(path.join(root, "data", "world.js"), out);
console.log(`data/world.js written: ${trains.length} trips, ${CHANGES.length} operational changes, ${OBS.length} observations, ${(out.length / 1024).toFixed(1)} KB`);
