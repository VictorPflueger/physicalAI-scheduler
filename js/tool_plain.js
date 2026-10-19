// What a tool call does, in one plain sentence for the console ("Reads the operations log for ICE 618:
// the source"). The tool's own name and arguments stay underneath for those who want them; this line
// is for the audience. Pure (the model is passed in), so the tests can check it in Node.

import { findPoint, findTrain } from "./world.js";

const CHANNEL_WORDS = {
  planner: "the journey planner and app",
  displays: "the station displays",
  announcements: "the announcements",
  coach: "the coach order"
};

/** The sentence for one tool call, or null for a tool without one (the console then shows the name only). */
export function toolPlain(name, input = {}, model = null) {
  const i = input && typeof input === "object" ? input : {};
  const train = (ref) => {
    if (!ref) return null;
    const t = model ? findTrain(model, ref) : null;
    return t ? t.number : String(ref);
  };
  const station = (ref) => {
    if (!ref) return null;
    const p = model ? findPoint(model, ref) : null;
    return p ? p.name : String(ref);
  };
  switch (name) {
    case "ops_get_overview":
      return "Reads every train of the next three hours: the source";
    case "ops_list_changes": {
      const what = i.train ? ` for ${train(i.train)}` : i.point ? ` at ${station(i.point)}` : "";
      return `Reads the operations log${what}: the source`;
    }
    case "ops_get_timetable":
      return `Reads the operational timetable of ${train(i.train) || "the train"}: the source`;
    case "kfp_get_published": {
      const who = train(i.train) || "the train";
      return i.channel && CHANNEL_WORDS[i.channel]
        ? `Reads what ${CHANNEL_WORDS[i.channel]} tells passengers about ${who}`
        : `Reads what every channel tells passengers about ${who}`;
    }
    case "phys_observe":
      return `Reads the sensors at ${station(i.point) || "the station"}: the physical layer`;
    case "ops_get_passengers":
      return `Reads today's passenger counts for ${train(i.train) || "the train"}`;
    case "ops_find_alternatives": {
      const from = station(i.from);
      const to = station(i.to);
      return `Looks for other connections${from && to ? ` from ${from} to ${to}` : ""}`;
    }
    case "sim_sync":
      return i.what_if
        ? "Calculates a what-if with the sync engine (an assumption, not the source)"
        : (Array.isArray(i.variants) && i.variants.length
          ? "Calculates who would act on wrong information, and what each response would change (sync engine)"
          : "Calculates who would act on wrong information (sync engine)");
    case "web_search":
      return null;
    default:
      return null;
  }
}
