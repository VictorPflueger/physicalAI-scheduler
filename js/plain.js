// Plain words for the room. The engine, the scripts and the agent name records by their ids (OPS-05,
// W 32, Fplo 1187), the interlocking (ESTW) and the railway's teams by their German titles, and a stop
// without passengers by its German name (Betriebshalt); the presenter says what they are instead: "the
// points failure", "the signaller at Köln Hbf", "an operational stop". One place for it, so the page,
// the guide and the tests agree (Vici's Writing guideline: names, not record ids).
//   names  turns the ids into words and nothing else: for a draft's full text, which may be German
//   plain  names, and puts the German terms and 1.4.0's screen names of an English sentence into words

// The ids, for every text the page shows, a draft's full text included.
const IDS = [
  // the operations log's change ids
  [/Operations log OPS-\d+:/g, "Operations log:"],
  [/\bBasis: OPS-\d+ \((\d{2}:\d{2})\)/g, "Basis: the change at $1"],
  [/ ?\(OPS-\d+\)/g, ""],
  [/\(OPS-\d+[,:]\s*/g, "("],
  [/\bOPS-\d+, (released|from)\b/g, "a change $1"],
  [/ ?\bOPS-\d+\b/g, ""],
  // points (Weichen) by number
  [/\b(points failure)(?: at)? W \d+\b/g, "$1"],
  [/\bW (\d+)\b/g, "points $1"],
  // a construction order (Fahrplananordnung) by its number
  [/\bFplo \d+\b/g, "the construction order"],
  [/(Finding: )the construction order,/g, "$1a construction order,"],
  [/(^|[.!?]\s+|\*\*\s*|\n)the construction order/g, (m, before) => `${before}The construction order`]
];

// The German terms and 1.4.0's screen names, for an English sentence on the page.
const WORDS = [
  // the electronic interlocking (ESTW)
  [/, ESTW /g, ", "],
  [/ ESTW /g, " at "],
  // an operational stop (Betriebshalt): a stop without passengers
  [/operational stop only \(Betriebshalt\)/g, "operational stop only"],
  [/\ba Betriebshalt\b/g, "an operational stop"],
  [/\bBetriebshalt flag\b/g, "operational-stop flag"],
  [/\bBetriebshalt\b/g, "operational stop"],
  // a platform in German (Gleis 7) in an English sentence
  [/\bGleis (\d+[a-z]?)\b/g, "platform $1"],
  // German minutes
  [/([+−-]\d+(?:\.\d)?) Min\b/g, "$1 min"],
  // 1.4.0's screens: the Outbox, Reset, Diagnostics and the model choice are gone; the drafts sit in
  // step 5, Replay starts again, and a live run uses one model
  [/ in the Outbox\b/g, ""],
  [/, or reset and run a different analysis\./g, ", or replay the scenario."],
  [/ or run Diagnostics; Simulation mode works offline/g, "; the simulation works offline"],
  [/ Choose another model\./g, " Run the simulation instead."],
  // a stock phrase in one script ("in today's"), said plainly
  [/\bnot in today's data\b/g, "not in the day's data"]
];

const apply = (rules, text) => {
  let out = String(text ?? "");
  for (const [re, to] of rules) out = out.replace(re, to);
  return out.replace(/ {2,}/g, " ").replace(/ ([,.;:)])/g, "$1");
};

/** A text with its record ids put into words, and nothing else changed: for a draft's full text. */
export const names = (text) => apply(IDS, text);

/** A sentence from the engine, a script or the agent, in the words a customer uses. */
export const plain = (text) => apply([...IDS, ...WORDS], text);

/** The teams that change the operational timetable, from their German titles in the operating snapshot. */
const ROLES = {
  "Fahrdienstleiter Köln Hbf": "the signaller at Köln Hbf",
  "Fahrzeugdisposition Fernverkehr": "long-distance vehicle planning",
  "Baubetriebsplanung (Fplo-Stelle)": "construction planning",
  "Netzleitzentrale / Disposition Hagen": "network control in Hagen",
  "Disposition Fernverkehr, Bereich Köln": "long-distance dispatch in Köln",
  "Fahrplanlieferung Partnerbahn (Belgien)": "the Belgian partner railway"
};

/** Who changed the source, in English: "the signaller at Köln Hbf". */
export const role = (source) => ROLES[source] || plain(source);

/** The channels in the words of the room. */
export const CHANNEL_NAME = {
  planner: "the journey planner and app",
  displays: "the station displays",
  announcements: "the announcements",
  coach: "the coach order"
};
