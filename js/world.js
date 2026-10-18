// World model access for the Timetable Translator: indexes over the synthetic operating snapshot
// (stations, trips, operational changes, publication states, physical observations, passengers),
// the source timetable of every train in every version, and the time helpers. Pure module (no
// DOM), shared by the UI, the agent tools, the sync engine and the integrity checks.
//
// The world model is the single source of truth. It holds every train's timetable as the
// operational systems keep it (version 1 = the base timetable, every operational change creates the
// next version) and what the physical layer observed. It never decides anything: the agent reads
// it, the engine derives the customer view from it, and only operations change it.
//
// Conventions (see data/world.js): times are seconds after midnight of the operating day, multiples
// of 6 (a tenth of a minute). world.meta.now is the snapshot time; minute figures count from it.

export const DATA_CHANNELS = ["planner", "displays", "announcements", "coach"];

/** Returns the raw synthetic world loaded by data/world.js. */
export function getWorldData() {
  const w = globalThis.WORLD;
  if (!w || !Array.isArray(w.trains)) throw new Error("World data (data/world.js) is not loaded.");
  return w;
}

let cachedModel = null;
/** Returns the (cached) indexed model of the world. */
export function getModel() {
  if (!cachedModel) cachedModel = buildModel(getWorldData());
  return cachedModel;
}

/** Builds an indexed model from the raw world object. */
export function buildModel(world) {
  const problems = [];
  const points = mapById(world.points);
  const trains = mapById(world.trains);
  const changes = mapById(world.changes);
  const observations = mapById(world.observations);
  const changesByTrain = new Map();
  for (const c of world.changes) {
    for (const op of c.ops) {
      if (!trains.has(op.train)) problems.push(`${c.id}: unknown train ${op.train}.`);
      if (!changesByTrain.has(op.train)) changesByTrain.set(op.train, []);
      const list = changesByTrain.get(op.train);
      if (!list.includes(c)) list.push(c);
    }
    for (const id of c.trains) if (!trains.has(id)) problems.push(`${c.id}: lists unknown train ${id}.`);
  }
  for (const list of changesByTrain.values()) list.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const obsByTrain = new Map();
  const obsByPoint = new Map();
  for (const o of world.observations) {
    for (const t of o.trains || []) push(obsByTrain, t, o);
    if (o.point) push(obsByPoint, o.point, o);
  }
  for (const t of world.trains) {
    for (const r of t.base) if (!points.has(r.point)) problems.push(`${t.id}: unknown point ${r.point}.`);
  }
  const connections = world.connections || [];
  return {
    world, points, trains, changes, observations, changesByTrain, obsByTrain, obsByPoint, connections,
    channels: world.channels, publication: world.publication, causes: world.causes,
    now: world.meta.now, horizonMin: world.meta.horizon_min, problems
  };
}

function mapById(list) {
  return new Map((list || []).map((x) => [x.id, x]));
}
function push(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

// ---------------------------------------------------------------------------------------------
// Source versions
// ---------------------------------------------------------------------------------------------

/** The operational changes that touch a train, oldest first. */
export function changesOf(model, trainId) {
  return model.changesByTrain.get(trainId) || [];
}

/** The train's current source version: 1 plus one per operational change (created trips start at 1). */
export function currentVersion(model, trainId) {
  return 1 + changesOf(model, trainId).length;
}

/**
 * The source state of a train in a version: rows (Betriebsfahrplan), coach order, route line and
 * the changes applied. `extra` applies hypothetical ops on top (a what-if; never the source).
 */
export function sourceState(model, trainId, version = null, extra = []) {
  const t = model.trains.get(trainId);
  if (!t) return null;
  const v = version === null || version === undefined ? currentVersion(model, trainId) : Math.max(1, Math.min(version, currentVersion(model, trainId)));
  let rows = t.base.map((r) => ({ ...r }));
  let order = t.consist?.order || null;
  let line = t.route_line;
  const applied = [];
  const apply = (op) => {
    switch (op.op) {
      case "set_track": {
        const r = rows.find((x) => x.point === op.point);
        if (r && r.activity !== "pass") r.track = String(op.track);
        break;
      }
      case "consist":
        order = op.order;
        break;
      case "shift_after": {
        const i = rows.findIndex((x) => x.point === op.point);
        const d = Math.round(Number(op.minutes) * 10) * 6;
        if (i >= 0) {
          for (let k = i + 1; k < rows.length; k++) {
            for (const key of ["arr", "dep", "pass"]) if (typeof rows[k][key] === "number") rows[k][key] += d;
          }
        }
        break;
      }
      case "replace_rows":
        rows = op.rows.map((r) => ({ ...r }));
        if (op.route_line) line = op.route_line;
        break;
      case "terminate":
      case "terminate_at": {
        const i = rows.findIndex((x) => x.point === op.point);
        if (i >= 0) {
          const r = rows[i];
          const arr = r.arr ?? r.pass ?? r.dep;
          rows = rows.slice(0, i + 1);
          rows[i] = { point: r.point, arr, dep: null, activity: "end", track: op.track ? String(op.track) : r.track };
        }
        break;
      }
      case "start_at": {
        const i = rows.findIndex((x) => x.point === op.point);
        const j = op.end ? rows.findIndex((x) => x.point === op.end) : rows.length - 1;
        if (i >= 0 && j >= i) {
          rows = rows.slice(i, j + 1);
          const a = rows[0];
          rows[0] = { ...a, arr: null, dep: a.dep ?? a.pass, activity: "start", pass: undefined };
          const z = rows[rows.length - 1];
          if (op.end) rows[rows.length - 1] = { ...z, dep: null, activity: "end" };
          rows = rows.map((r) => { const c = { ...r }; if (c.pass === undefined) delete c.pass; return c; });
        }
        break;
      }
      default:
        break;
    }
  };
  const list = changesOf(model, trainId).slice(0, v - 1);
  for (const c of list) {
    for (const op of c.ops) if (op.train === trainId) apply(op);
    applied.push(c.id);
  }
  for (const op of extra) if (op.train === trainId) apply(op);
  return { train_id: trainId, version: v, rows, order, line, changes: applied, hypothetical: extra.length > 0 };
}

/** What a customer channel shows for a train: { version, at, cause, faults } (default: current, no fault). */
export function publishedInfo(model, trainId, channel) {
  const p = model.world.published?.[trainId] || {};
  const own = Object.prototype.hasOwnProperty.call(p, channel) ? p[channel] : undefined;
  const entry = own !== undefined ? own : p.all;
  const current = currentVersion(model, trainId);
  if (!entry) return { version: current, at: lastChangeAt(model, trainId), cause: null, faults: [], current: true };
  return { version: entry.version, at: entry.at, cause: entry.cause || null, faults: entry.faults || [], current: entry.version >= current && !(entry.faults || []).length };
}

function lastChangeAt(model, trainId) {
  const list = changesOf(model, trainId);
  return list.length ? list[list.length - 1].at + 7 * 60 : model.publication.daily_run;
}

/** Ids any tool or the mirror may reference: trains, points, changes, observations, connections. */
export function isKnownId(model, id) {
  const s = String(id);
  return model.trains.has(s) || model.points.has(s) || model.changes.has(s) || model.observations.has(s) || model.connections.some((c) => c.id === s);
}

/** A train by id or by its number ("ICE 618", "618", "RE 10423"). */
export function findTrain(model, ref) {
  const s = String(ref ?? "").trim();
  if (!s) return null;
  if (model.trains.has(s)) return model.trains.get(s);
  if (model.trains.has(`T-${s}`)) return model.trains.get(`T-${s}`);
  const norm = s.replace(/\s+/g, " ").toLowerCase();
  const digits = (s.match(/\d+/) || [""])[0];
  const list = [...model.trains.values()];
  return list.find((t) => t.number.toLowerCase() === norm)
    || (digits ? list.find((t) => (t.number.match(/\d+/) || [""])[0] === digits && !/^RE 57$|^S /.test(t.number)) : null)
    || null;
}

/** A point by Ril 100 code or by name ("KK", "Köln Hbf", "koeln hbf"). */
export function findPoint(model, ref) {
  const s = String(ref ?? "").trim();
  if (!s) return null;
  if (model.points.has(s.toUpperCase())) return model.points.get(s.toUpperCase());
  const n = norm(s);
  return [...model.points.values()].find((p) => norm(p.name) === n) || null;
}

function norm(s) {
  return String(s).toLowerCase().replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ä/g, "ae").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
}

export function pointName(model, id) {
  return model.points.get(id)?.name || id;
}

// ---------------------------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------------------------

const p2 = (n) => String(n).padStart(2, "0");

/** "07:42.6": a Betriebsfahrplan time to a tenth of a minute. */
export function tenthLabel(sec) {
  if (sec === null || sec === undefined) return null;
  const tenths = Math.round(sec / 6);
  const minutes = Math.floor(tenths / 10);
  return `${p2(Math.floor(minutes / 60) % 24)}:${p2(minutes % 60)}.${tenths % 10}`;
}

/** "07:42": a whole-minute time (no rounding: pass the already rounded seconds). */
export function minuteLabel(sec) {
  if (sec === null || sec === undefined) return null;
  const m = Math.floor(sec / 60);
  return `${p2(Math.floor(m / 60) % 24)}:${p2(m % 60)}`;
}

/** Customer arrival: rounded up to the full minute (demonstration rule, DATA_SOURCES.md §4). */
export function customerArr(sec) {
  return sec === null || sec === undefined ? null : Math.ceil(sec / 60) * 60;
}

/** Customer departure: rounded down to the full minute (demonstration rule). */
export function customerDep(sec) {
  return sec === null || sec === undefined ? null : Math.floor(sec / 60) * 60;
}

/** Minutes from the snapshot time to a time (negative: in the past), to a tenth. */
/** "Köln Hbf 07:42 → Dortmund Hbf 08:56"; a trip with one corridor stop: "Dortmund Hbf 10:01 → Winterberg (Westf)". */
export function runLabel(model, t, rows) {
  // In the minutes passengers are shown: departures rounded down, arrivals up.
  const first = rows[0];
  const last = rows[rows.length - 1];
  const firstT = first.dep !== null && first.dep !== undefined ? customerDep(first.dep) : customerArr(first.arr);
  const lastT = last.arr !== null && last.arr !== undefined ? customerArr(last.arr) : customerDep(last.dep);
  if (rows.length === 1 || first.point === last.point) return `${pointName(model, first.point)} ${minuteLabel(firstT)} → ${t.to}`;
  return `${pointName(model, first.point)} ${minuteLabel(firstT)} → ${pointName(model, last.point)} ${minuteLabel(lastT)}`;
}

export function minutesFromNow(model, sec) {
  return Math.round(((sec - model.now) / 60) * 10) / 10;
}

/** The snapshot time as "07:28". */
export function nowLabel(model) {
  return minuteLabel(model.now);
}
