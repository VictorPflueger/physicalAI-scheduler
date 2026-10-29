// Detail popovers for the timetable mirror, built from the same world-model queries the agent uses
// (the source timetable, the published channels, the physical layer, the passengers) and from the
// engine's findings the mirror shows.

import { h } from "./dom.js";
import { sourceState, publishedInfo, currentVersion, changesOf, pointName, tenthLabel, minuteLabel, DATA_CHANNELS } from "./world.js";
import { customerView } from "./sync.js";
import { ACT_SHORT, ACT_DE, CHANNEL_SHORT, TAG_TONE } from "./mirror_data.js";

const STATE_TEXT = { affected: "Contradicts the source", at_risk: "Informed, data still behind", resolved: "Re-publication approved", accepted: "Risk accepted", what_if: "What-if, not the source" };

function stateChip(state) {
  if (!state || state === "neutral") return null;
  const tone = state === "affected" ? "danger" : state === "at_risk" || state === "accepted" ? "risk" : state === "what_if" ? "ai" : "approved";
  return tag(tone, STATE_TEXT[state] || state);
}

/** A Vici tag in one of the mirror's tones (TAG_TONE); plain without one. */
function tag(tone, text) {
  return h("span", { class: ["vc-tag", TAG_TONE[tone] || ""] }, text);
}

function dl(rows) {
  return h("dl", { class: "pop-grid" }, rows.filter(Boolean).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
}

function checkTags(checks = []) {
  const label = { source: "Source read", published: "Published view read", physical: "Physical layer read", passengers: "Passengers read", operations: "Operations log read" };
  // What the agent read: fjord, the tone of checking.
  return checks.length ? h("div", { class: "pop-tags" }, checks.map((k) => tag("info", label[k] || k))) : null;
}

/** A source row (Betriebsfahrplan): the row, what changed it, and what the physical layer saw there. */
export function sourceRowPopover(model, trainId, point, ctx = {}) {
  const t = model.trains.get(trainId);
  const st = sourceState(model, trainId);
  const r = st.rows.find((x) => x.point === point);
  if (!r) return h("div", {}, "This point is not on the train's route today.");
  const base = sourceState(model, trainId, 1).rows.find((x) => x.point === point);
  const changes = changesOf(model, trainId);
  const obs = (model.obsByPoint.get(point) || []).filter((o) => o.trains.includes(trainId) || o.supports.some((s) => changes.some((c) => c.id === s) || s.startsWith(`${trainId}:${point}`)));
  const time = r.activity === "pass" ? `passes ${tenthLabel(r.pass)}` : [r.arr !== null && r.arr !== undefined ? `arr ${tenthLabel(r.arr)}` : null, r.dep !== null && r.dep !== undefined ? `dep ${tenthLabel(r.dep)}` : null].filter(Boolean).join(", ");
  return h("div", {},
    h("div", { class: "pop-title" }, `${pointName(model, point)} (${point})`),
    h("div", { class: "pop-sub" }, `${t.number}, Betriebsfahrplan, source version ${st.version}`),
    h("div", { class: "pop-tags" }, stateChip(ctx.state), tag(null, `${ACT_DE[r.activity]}: ${ACT_SHORT[r.activity]}`)),
    dl([
      ["Time", time],
      r.track ? ["Track", r.track] : null,
      r.remark ? ["Remark", r.remark] : null,
      base && st.version > 1 && (base.track !== r.track || base.activity !== r.activity) ? ["Base timetable", `${ACT_SHORT[base.activity]}${base.track ? `, track ${base.track}` : ""}`] : null,
      !base && st.version > 1 ? ["Base timetable", "not on the planned route"] : null,
      changes.length ? ["Changed by", changes.map((c) => `${c.id} (${minuteLabel(c.at)}, ${c.source})`).join("; ")] : ["Changed by", "nothing today: base timetable"]
    ]),
    changes.length ? h("p", { class: "pop-note pop-record" }, changes[changes.length - 1].text) : null,
    obs.length ? h("table", { class: "vc-table vc-table--compact pop-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Physical layer"), h("th", { class: "r" }, "Time"))),
      h("tbody", {}, obs.map((o) => h("tr", {}, h("td", {}, h("strong", {}, o.source), h("br"), o.text), h("td", { class: "r" }, minuteLabel(o.at)))))) : null,
    checkTags(ctx.checks));
}

/** A published row (Kundenfahrplan): what each channel shows there, and what the source says. */
export function customerRowPopover(model, trainId, point, channel, ctx = {}) {
  const t = model.trains.get(trainId);
  const cur = currentVersion(model, trainId);
  const derived = customerView(model, trainId);
  const d = derived.rows.find((x) => x.point === point);
  const rows = DATA_CHANNELS.filter((ch) => ch !== "coach").map((ch) => {
    const info = publishedInfo(model, trainId, ch);
    const v = customerView(model, trainId, { version: info.version, faults: info.faults });
    const x = v.rows.find((y) => y.point === point);
    return { ch, info, text: x ? `${x.arr !== null ? `arr ${minuteLabel(x.arr)} ` : ""}${x.dep !== null ? `dep ${minuteLabel(x.dep)}` : ""}${x.platform ? `, platform ${x.platform}` : ""}`.trim() : "not listed" };
  });
  const sourceText = d ? `${d.arr !== null ? `arr ${minuteLabel(d.arr)} ` : ""}${d.dep !== null ? `dep ${minuteLabel(d.dep)}` : ""}${d.platform ? `, platform ${d.platform}` : ""}`.trim()
    : derived.cancelled.some((c) => c.point === point) ? "stop cancelled (Halt entfällt)" : "no passenger stop";
  const pax = t.passengers?.[point];
  const c = ctx.contradiction;
  return h("div", {},
    h("div", { class: "pop-title" }, pointName(model, point)),
    h("div", { class: "pop-sub" }, `${t.number}, Kundenfahrplan as published · source is at v${cur}`),
    h("div", { class: "pop-tags" }, stateChip(ctx.state)),
    h("table", { class: "vc-table vc-table--compact pop-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Channel"), h("th", {}, "Shows"), h("th", { class: "r" }, "From"))),
      h("tbody", {},
        rows.map((x) => h("tr", { dataset: { selected: String(x.ch === channel) } }, h("td", {}, CHANNEL_SHORT[x.ch]), h("td", {}, x.text), h("td", { class: "r" }, `v${x.info.version}${x.info.faults.length ? "*" : ""}`))),
        h("tr", { class: "pop-derived" }, h("td", {}, "Source says"), h("td", {}, sourceText), h("td", { class: "r" }, `v${cur}`)))),
    c ? dl([
      ["Contradiction", `${c.type.replace(/_/g, " ")}: ${c.published} → ${c.source_says}`],
      ["Passengers", `${c.passengers} relying on it; first in ${c.minutes_to_first_event} min`],
      c.causes?.length ? ["Why behind", c.causes.map((k) => model.causes[k]?.title || k).join("; ")] : null
    ]) : null,
    !c && pax ? dl([["Passengers", `${pax.board} boarding, ${pax.alight} alighting${pax.reserved_board ? `, ${pax.reserved_board} with seat reservations` : ""}`]]) : null,
    rows.some((x) => x.info.faults.length) ? h("p", { class: "pop-note" }, "* generated with a conversion fault: ", model.causes[rows.find((x) => x.info.faults.length).info.cause]?.text || "") : null,
    h("p", { class: "pop-note" }, "The customer view is derived from the source by the deterministic engine; the translator keeps no timetable of its own."));
}

/** A station on the corridor strip: platforms and what the physical layer observed there. */
export function stationPopover(model, point, ctx = {}) {
  const p = model.points.get(point);
  if (!p) return h("div", {}, "Unknown station.");
  const obs = model.obsByPoint.get(point) || [];
  const tracks = Object.entries(p.tracks).filter(([, s]) => !s.bus);
  return h("div", {},
    h("div", { class: "pop-title" }, p.name),
    h("div", { class: "pop-sub" }, `Ril 100 code ${p.ril100} · ${tracks.length} platform tracks`),
    h("div", { class: "pop-tags" }, stateChip(ctx.state)),
    dl([["Platform tracks", tracks.map(([k, s]) => `${k}${s.length_m !== 405 ? ` (${s.length_m} m)` : ""}`).join(", ")]]),
    obs.length ? h("table", { class: "vc-table vc-table--compact pop-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Physical layer"), h("th", { class: "r" }, "Time"))),
      h("tbody", {}, obs.map((o) => h("tr", {}, h("td", {}, h("strong", {}, o.source), h("br"), o.text), h("td", { class: "r" }, minuteLabel(o.at)))))) : h("p", { class: "pop-note" }, "No observation from the physical layer at this station this morning."),
    h("p", { class: "pop-note" }, "The station and its Ril 100 code are real; platform data and observations are invented."));
}
