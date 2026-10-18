// Placeholders for simulation scripts. Authored scripts never type a figure the engine computes:
// they write {{pax}}, {{first_min}}, {{V1.mis}}, {{T-618.KK.platform.src}} … and the player fills
// them from the engine result at playback. Shared by the player (js/simulation.js) and the script
// checker (js/sim_check.js), so a placeholder that would not resolve is caught before a demo.

import { minuteLabel } from "./world.js";

const int = (n) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
const minutes = (n) => (n === null || n === undefined ? "never" : String(Math.round(Number(n))));

/** "RE 10423 ab Dortmund Hbf 07:52, Gleis 6, an Hagen Hbf 08:16" and its English twin. */
export function journeyText(a, lang = "de") {
  if (!a || a.none || !a.legs?.length) return lang === "de" ? "keine Verbindung im heutigen Fahrplan" : "no connection in today's timetable";
  return a.legs.map((l, i) => {
    const first = lang === "de"
      ? `${i ? "weiter mit " : ""}${l.number} ab ${l.from_station} ${l.dep_label}${l.platform && l.platform !== "Bus" ? `, Gleis ${l.platform}` : l.platform === "Bus" ? " (Ersatzbus)" : ""}`
      : `${i ? "then " : ""}${l.number} from ${l.from_station} ${l.dep_label}${l.platform && l.platform !== "Bus" ? `, platform ${l.platform}` : l.platform === "Bus" ? " (replacement bus)" : ""}`;
    const end = l.arr_label ? (lang === "de" ? `, an ${l.to_station} ${l.arr_label}` : `, arriving ${l.to_station} ${l.arr_label}`) : (lang === "de" ? ` Richtung ${l.to_station}` : ` towards ${l.to_station}`);
    return first + end;
  }).join("; ");
}

/**
 * Variables produced by one sim_sync result. `which` "hypothesis" prefixes keys with "hyp.";
 * every other result writes the unprefixed keys (a later result overwrites an earlier one).
 */
export function syncVars(which, res) {
  const v = {};
  const pre = which === "hypothesis" ? "hyp." : "";
  const b = res.baseline;
  v[`${pre}pax`] = int(b.misinformed_pax);
  v[`${pre}affected`] = int(b.affected_pax);
  v[`${pre}contra`] = String(b.contradictions);
  v[`${pre}first_min`] = b.first_event_min === null ? "—" : String(Math.round(b.first_event_min));
  v[`${pre}first_label`] = b.first_event_label || "—";
  v[`${pre}first_short`] = b.first_event_short || "—";
  v[`${pre}next_cycle`] = b.next_cycle_label;
  v[`${pre}trains`] = String(res.trains.length);
  for (const t of res.trains) v[`${pre}${t.train_id}.v`] = String(t.source_version);
  for (const c of res.contradictions) {
    const k = `${pre}${c.train_id}.${c.point}.${c.type}`;
    v[`${k}.pub`] = c.published;
    v[`${k}.src`] = c.expected;
    v[`${k}.pax`] = int(c.pax);
    v[`${k}.min`] = c.minutes_to_event === null ? "—" : String(Math.round(c.minutes_to_event));
    if (c.delta_min) v[`${k}.delta`] = String(Math.abs(Math.round(c.delta_min)));
    if (c.type === "platform") { v[`${k}.from`] = String(c.published_value); v[`${k}.to`] = String(c.expected_value); }
    if (c.type === "coach_order") {
      v[`${k}.first_pub`] = c.published_value.first; v[`${k}.first_src`] = c.expected_value.first;
      v[`${k}.rest_src`] = c.expected_value.restaurant; v[`${k}.second_src`] = c.expected_value.second;
    }
    if (c.type === "time") {
      const e = c.expected_value;
      if (e.arr !== null && e.arr !== undefined) v[`${k}.arr`] = minuteLabel(e.arr);
      if (e.dep !== null && e.dep !== undefined) v[`${k}.dep`] = minuteLabel(e.dep);
    }
    for (const g of c.groups) v[`${k}.${g.kind}`] = int(g.pax);
  }
  for (const a of res.alternatives || []) {
    const c = res.contradictions.find((x) => x.id === a.contradiction);
    if (!c) continue;
    const kind = /boarding/.test(a.for) ? "boarding" : "onboard";
    const k = `${pre}alt.${c.train_id}.${c.point}.${kind}`;
    v[`${k}.de`] = journeyText(a, "de");
    v[`${k}.en`] = journeyText(a, "en");
    if (a.arrival_label) v[`${k}.arr`] = a.arrival_label;
  }
  for (const x of res.variants || []) {
    v[`${x.variant_id}.mis`] = int(x.misinformed_pax);
    v[`${x.variant_id}.prot`] = int(x.protected_pax);
    v[`${x.variant_id}.from`] = minutes(x.correct_info_from_min);
    v[`${x.variant_id}.sync`] = minutes(x.time_to_sync_min);
    v[`${x.variant_id}.res`] = String(x.residual_contradictions);
    v[`${x.variant_id}.ov`] = String(x.manual_overrides);
    v[`${x.variant_id}.effort`] = String(x.effort_min);
    if (x.hold) { v[`${x.variant_id}.wait`] = String(x.hold.wait_min); v[`${x.variant_id}.delayed`] = int(x.hold.delayed_pax); v[`${x.variant_id}.held`] = int(x.held_pax); }
  }
  return v;
}

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Replaces {{key}} with vars[key]. */
export function fillTemplate(vars, text) {
  return String(text ?? "").replace(PLACEHOLDER, (m, key) => (key in vars ? vars[key] : m));
}

/** Placeholder keys in a text that `vars` cannot resolve. */
export function unresolvedKeys(vars, text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(PLACEHOLDER)) {
    if (!(m[1] in vars)) out.push(m[1]);
  }
  return out;
}
