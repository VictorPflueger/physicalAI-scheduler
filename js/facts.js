// Fact audit: the guard that keeps the AI from becoming a second source of timetable truth. Every
// timetable fact the agent writes into an alert, an option card, a draft or the summary (a clock
// time, a platform or track, coach sectors, a number of minutes, a train number, a number of
// passengers) must be a fact that a tool returned in this run, for a train the text is about: the
// source timetable, the published customer view, the physical layer, the passenger figures or the
// sync engine. js/guards.js decides which results a text may quote and checks that an outdated
// value is never named without the source's value. The option cards and KPI tiles take their
// figures from the engine directly; this check covers the free text.
//
// Facts are read in the forms people write them, in English and German: "07:42", "7.42 Uhr",
// "platform 7", "Gleis 7", "Gl. 7", "track 7", "sector F–G", "Abschnitt F–G", "1st class F–G",
// "+12 min", "12 Minuten später", "ICE 618", "RE 4", "312 passengers", "312 Reisende".

const SP = "[ \\u00a0\\u202f\\u2009]";
// A time ends at a digit boundary: "07:44," and "07:44." are times, "08:37.6" (tenths) and "12.345" are not.
const TIME = new RegExp(`(?<![\\d.,:])([01]?\\d|2[0-3])[:.]([0-5]\\d)(?!\\d|[.,:]\\d|${SP}?%)(?:${SP}?Uhr)?`, "g");
const PLATFORM = new RegExp(`\\b(?:platforms?|tracks?|Gleis(?:e|en)?|Gl\\.|Bahnsteig|Bstg\\.)${SP}?(\\d{1,2})(?:${SP}?(?:and|und|&|,|–|-|/)${SP}?(\\d{1,2}))?\\b`, "gi");
const MINUTES = new RegExp(`(?<![\\d.,:])([+−-]?${SP}?\\d{1,3}(?:[.,]\\d)?)${SP}?(?:Minuten|minutes?|-minutes?|-Minuten|Min\\.|min\\b|Min\\b)`, "gi");
const TRAIN = new RegExp(`\\b(ICE|IC|EC|RE|RB|S)${SP}?(\\d{1,5})\\b`, "g");
const PAX = new RegExp(`(?<![\\d.,:])(\\d{1,3}(?:[,.]\\d{3})?|\\d{1,5})${SP}?(?:passengers?|travellers?|people|Reisende[nr]?|Fahrgäste[n]?|Fahrgast)\\b`, "gi");
// Coach sectors after a word that announces them: "sector F–G", "Abschnitt F bis G", "1st class F–G",
// "1. Klasse in Abschnitt F–G", "Bordrestaurant in E". A single capital must stand alone ("in Essen" is no sector).
const SECTOR = new RegExp(`(?:\\bsectors?|\\bAbschnitte?n?|\\bSektor(?:en)?|\\b1st${SP}class|\\bfirst${SP}class|\\b2nd${SP}class|\\bsecond${SP}class|\\b[12]\\.${SP}?Klasse|\\brestaurant|\\bBordrestaurant|\\bBistro)(?:${SP}(?:in|im|ist|is|stops${SP}in|hält${SP}in|halten${SP}in))?(?:${SP}(?:sectors?|Abschnitte?n?))?${SP}([A-H])(?:${SP}?(?:–|-|bis|to)${SP}?([A-H]))?(?![\\p{L}\\d])`, "giu");

const sectorValue = (a, b) => (b && b.toUpperCase() !== a.toUpperCase() ? `${a.toUpperCase()}–${b.toUpperCase()}` : a.toUpperCase());

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
  for (const m of s.matchAll(SECTOR)) add("sector", m[0], sectorValue(m[1], m[2]), m.index);
  for (const m of s.matchAll(MINUTES)) {
    const v = Math.abs(Number(m[1].replace(/[^\d.,]/g, "").replace(",", ".")));
    if (Number.isFinite(v)) add("minutes", m[0], v, m.index);
  }
  for (const m of s.matchAll(TRAIN)) add("train", m[0], `${m[1]} ${m[2]}`, m.index);
  for (const m of s.matchAll(PAX)) add("pax", m[0], Number(m[1].replace(/[,.]/g, "")), m.index);
  return out.sort((a, b) => a.index - b.index);
}

// ---- known facts ------------------------------------------------------------------------------------

const KINDS = ["time", "platform", "sector", "minutes", "train", "pax"];

/** A set of known facts by kind. */
export class FactSet {
  constructor() { this.items = Object.fromEntries(KINDS.map((k) => [k, new Set()])); }
  add(kind, value) {
    if (value === null || value === undefined || value === "" || !this.items[kind]) return;
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
    if (!this.items[kind]) return false;
    if (kind === "minutes") return this.items.minutes.has(Math.round(Number(value))) || this.items.minutes.has(Number(value));
    if (kind === "pax") return this.items.pax.has(Math.round(Number(value)));
    return this.items[kind].has(String(value));
  }
  merge(other) {
    for (const k of KINDS) for (const v of other.items[k]) this.items[k].add(v);
    return this;
  }
  get size() { return Object.values(this.items).reduce((s, x) => s + x.size, 0); }
}

const PAX_KEY = /(^|_)(pax|passengers|board|alight|reserved_board|held_pax|delayed_pax|protected_pax|misinformed_pax|affected_pax)$/i;
const MIN_KEY = /(_min|minutes|delta_min|wait_min|minutes_to_first_event|minutes_to_event|effort_min|measured_min)$/i;
const PLATFORM_KEY = /^(platform|track|arr_platform|tracks_blocked|platform_changed_from|from_platform|to_platform)$/i;
const SECTOR_KEY = /^(first|restaurant|second)$/i;
const TRAIN_KEY = /^(number|train|line)$/i;

/** The facts of one value under one key, added to every set in `sets`. */
function collectLeaf(v, key, sets) {
  const add = (kind, value) => { for (const s of sets) s.add(kind, value); };
  const k = String(key || "");
  if (typeof v === "number") {
    if (PAX_KEY.test(k)) add("pax", v);
    else if (MIN_KEY.test(k)) add("minutes", v);
    return;
  }
  if (typeof v !== "string") return;
  if (PLATFORM_KEY.test(k)) add("platform", v.replace(/^(?:Gl\.|platform|track)\s*/i, ""));
  if (SECTOR_KEY.test(k) && /^[A-H](?:\s?[–-]\s?[A-H])?$/i.test(v.trim())) {
    const [a, b] = v.trim().split(/\s?[–-]\s?/);
    add("sector", sectorValue(a, b));
  }
  for (const f of extractFacts(v)) add(f.kind, f.value);
  // A Betriebsfahrplan time "08:37.6" stands for the minute passengers are shown: an arrival is
  // rounded up (08:38), a departure down (08:37). Elsewhere (a remark, a record) it stands for both.
  for (const m of v.matchAll(/\b(\d{2}):(\d{2})\.(\d)\b/g)) {
    const total = Number(m[1]) * 60 + Number(m[2]);
    const up = Number(m[3]) ? total + 1 : total;
    const minutes = k === "arr" ? [up] : k === "dep" ? [total] : [total, up];
    for (const t of minutes) add("time", `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
}

/**
 * Walks a tool result and adds every timetable fact to the sets `setsFor(context)` returns, where the
 * context is the list of trains the enclosing object is about (contextOf(object) → ids or null; an
 * object without its own trains belongs to its parent's) or null for facts about no train.
 */
export function collectFactsBy(value, contextOf, setsFor) {
  const walk = (v, key, depth, ctx) => {
    if (depth > 16 || v === null || v === undefined) return;
    if (Array.isArray(v)) {
      if (PLATFORM_KEY.test(String(key || ""))) for (const x of v) collectLeaf(String(x), "platform", setsFor(ctx));
      for (const x of v) walk(x, key, depth + 1, ctx);
      return;
    }
    if (typeof v === "object") {
      const own = contextOf ? contextOf(v) : null;
      const c = own && own.length ? own : ctx;
      for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1, c);
      return;
    }
    collectLeaf(v, key, setsFor(ctx));
  };
  walk(value, null, 0, null);
}

/** Adds every timetable fact found in a tool result to one set (numbers by key, facts written in strings). */
export function collectFacts(value, known = new FactSet()) {
  collectFactsBy(value, null, () => [known]);
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
