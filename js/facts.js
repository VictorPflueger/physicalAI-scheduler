// Fact audit: the guard that keeps the AI from becoming a second source of timetable truth. Every
// timetable fact the agent writes into an alert, an option card, a draft or the summary (a clock
// time, a platform or track, a number of minutes, a train number, a number of passengers) must be a
// fact that a tool returned in this run: the source timetable, the published customer view, the
// physical layer, the passenger figures or the sync engine. The option cards and KPI tiles take
// their figures from the engine directly; this check covers the free text.
//
// Facts are read in the forms people write them, in English and German: "07:42", "7.42 Uhr",
// "platform 7", "Gleis 7", "Gl. 7", "track 7", "+12 min", "12 Minuten später", "about 12 minutes",
// "ICE 618", "RE 4", "312 passengers", "312 Reisende".

const SP = "[ \\u00a0\\u202f\\u2009]";
// A time ends at a digit boundary: "07:44," and "07:44." are times, "08:37.6" (tenths) and "12.345" are not.
const TIME = new RegExp(`(?<![\\d.,:])([01]?\\d|2[0-3])[:.]([0-5]\\d)(?!\\d|[.,:]\\d|${SP}?%)(?:${SP}?Uhr)?`, "g");
const PLATFORM = new RegExp(`\\b(?:platforms?|tracks?|Gleis(?:e|en)?|Gl\\.|Bahnsteig|Bstg\\.)${SP}?(\\d{1,2})(?:${SP}?(?:and|und|&|,|–|-|/)${SP}?(\\d{1,2}))?\\b`, "gi");
const MINUTES = new RegExp(`(?<![\\d.,:])([+−-]?${SP}?\\d{1,3}(?:[.,]\\d)?)${SP}?(?:Minuten|minutes?|-minutes?|-Minuten|Min\\.|min\\b|Min\\b)`, "gi");
const TRAIN = new RegExp(`\\b(ICE|IC|EC|RE|RB|S)${SP}?(\\d{1,5})\\b`, "g");
const PAX = new RegExp(`(?<![\\d.,:])(\\d{1,3}(?:[,.]\\d{3})?|\\d{1,5})${SP}?(?:passengers?|travellers?|people|Reisende[nr]?|Fahrgäste[n]?|Fahrgast)\\b`, "gi");

/** Timetable facts written in a text: [{ kind, raw, value, index }]. */
export function extractFacts(text) {
  const s = String(text || "");
  const out = [];
  const spans = [];
  const add = (kind, raw, value, index, { force = false } = {}) => {
    const end = index + raw.length;
    if (!force && spans.some(([a, b, k]) => k === kind && index < b && end > a)) return;
    if (!force) spans.push([index, end, kind]);
    out.push({ kind, raw: raw.trim(), value, index });
  };
  for (const m of s.matchAll(TIME)) add("time", m[0], `${m[1].padStart(2, "0")}:${m[2]}`, m.index);
  for (const m of s.matchAll(PLATFORM)) {
    add("platform", m[0], m[1], m.index);
    if (m[2]) add("platform", m[0], m[2], m.index + 1, { force: true });
  }
  for (const m of s.matchAll(MINUTES)) {
    const v = Math.abs(Number(m[1].replace(/[^\d.,]/g, "").replace(",", ".")));
    if (Number.isFinite(v)) add("minutes", m[0], v, m.index);
  }
  for (const m of s.matchAll(TRAIN)) add("train", m[0], `${m[1]} ${m[2]}`, m.index);
  for (const m of s.matchAll(PAX)) add("pax", m[0], Number(m[1].replace(/[,.]/g, "")), m.index);
  return out.sort((a, b) => a.index - b.index);
}

// ---- known facts ------------------------------------------------------------------------------------

/** A set of known facts by kind. */
export class FactSet {
  constructor() { this.items = { time: new Set(), platform: new Set(), minutes: new Set(), train: new Set(), pax: new Set() }; }
  add(kind, value) {
    if (value === null || value === undefined || value === "") return;
    if (kind === "minutes" || kind === "pax") {
      const n = Math.abs(Number(value));
      if (!Number.isFinite(n)) return;
      this.items[kind].add(Math.round(n));
      if (kind === "minutes") this.items[kind].add(Math.round(n * 10) / 10);
      return;
    }
    this.items[kind].add(String(value));
  }
  has(kind, value) {
    if (kind === "minutes") return this.items.minutes.has(Math.round(Number(value))) || this.items.minutes.has(Number(value));
    if (kind === "pax") return this.items.pax.has(Math.round(Number(value)));
    return this.items[kind].has(String(value));
  }
  merge(other) {
    for (const k of Object.keys(this.items)) for (const v of other.items[k]) this.items[k].add(v);
    return this;
  }
  get size() { return Object.values(this.items).reduce((s, x) => s + x.size, 0); }
}

const PAX_KEY = /(^|_)(pax|passengers|board|alight|reserved_board|held_pax|delayed_pax|protected_pax|misinformed_pax|affected_pax)$/i;
const MIN_KEY = /(_min|minutes|delta_min|wait_min|minutes_to_first_event|minutes_to_event|effort_min|measured_min)$/i;
const PLATFORM_KEY = /^(platform|track|arr_platform|tracks_blocked|platform_changed_from|from_platform|to_platform)$/i;
const TRAIN_KEY = /^(number|train|line)$/i;

/** Adds every timetable fact found in a tool result (numbers by key, facts written in strings). */
export function collectFacts(value, known = new FactSet()) {
  const walk = (v, key, depth) => {
    if (depth > 16 || v === null || v === undefined) return;
    if (typeof v === "number") {
      const k = String(key || "");
      if (PAX_KEY.test(k)) known.add("pax", v);
      else if (MIN_KEY.test(k)) known.add("minutes", v);
      return;
    }
    if (typeof v === "string") {
      const k = String(key || "");
      if (PLATFORM_KEY.test(k)) known.add("platform", v.replace(/^(?:Gl\.|platform|track)\s*/i, ""));
      if (TRAIN_KEY.test(k)) for (const f of extractFacts(v)) if (f.kind === "train") known.add("train", f.value);
      for (const f of extractFacts(v)) known.add(f.kind, f.value);
      // A Betriebsfahrplan time "08:37.6" stands for the customer minutes on either side of it.
      for (const m of v.matchAll(/\b(\d{2}):(\d{2})\.(\d)\b/g)) {
        const total = Number(m[1]) * 60 + Number(m[2]);
        for (const t of [total, Number(m[3]) ? total + 1 : total]) known.add("time", `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
      }
      return;
    }
    if (Array.isArray(v)) {
      if (PLATFORM_KEY.test(String(key || ""))) for (const x of v) known.add("platform", String(x));
      for (const x of v) walk(x, key, depth + 1);
      return;
    }
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1);
  };
  walk(value, null, 0);
  return known;
}

/** Facts written in `text` that no known set holds (known: a FactSet or a list of them). */
export function unknownFacts(text, known) {
  const sets = (Array.isArray(known) ? known : [known]).filter(Boolean);
  return extractFacts(text).filter((f) => !sets.some((s) => s.has(f.kind, f.value)));
}

/** Facts every text may use without a tool: the snapshot time and the train lines of the corridor. */
export function baseFacts(model) {
  const s = new FactSet();
  const now = model.now;
  s.add("time", `${String(Math.floor(now / 3600)).padStart(2, "0")}:${String(Math.floor((now % 3600) / 60)).padStart(2, "0")}`);
  for (const t of model.trains.values()) {
    s.add("train", t.number.replace(/^Bus SEV \d+$/, "SEV"));
    if (t.line && /^(ICE|IC|EC|RE|RB|S)\s?\d+$/.test(t.line)) s.add("train", t.line.replace(/\s+/, " "));
  }
  // The publication cycle and the planning horizon are part of the world's rules.
  s.add("minutes", model.publication.cycle_min);
  s.add("minutes", model.horizonMin);
  return s;
}
