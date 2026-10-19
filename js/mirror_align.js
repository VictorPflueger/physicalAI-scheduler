// The alignment view: the Timetable Translator's story in one picture, and the mirror's first view.
//   1  the source the AI reads: the operational timetable (Betriebsfahrplan) at one stop of one train,
//      and the sensors of the physical layer that confirm what the trains will really do;
//   2  the AI translator between the two timetables, which keeps no timetable of its own, and the
//      person who decides before anything goes out;
//   3  what passengers are told on every customer channel (Kundenfahrplan), with the agent's verdict.
// Below them, what the agent's engine result says that means for passengers, and after the human
// decision what is left. It follows the same run events as the timetable view (js/mirror.js passes the
// state in), so a simulated and a live run look the same. Every value comes from js/align_data.js.

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { int } from "./format.js";

const CHANNEL_ICON = { planner: "list", displays: "timetable", announcements: "megaphone", coach: "users" };

/**
 * The channel's line under its value: the agent's verdict, or what the human decision did to it.
 * A channel the AI has read but no engine result has judged yet says so: the verdict and its colour
 * come from the sync engine's comparison, never from the language model's reading.
 * Returns { tone, icon, text }.
 */
export function channelStatus(ch, { reading = false, read = false, decision = null } = {}) {
  if (reading) return { tone: "checking", icon: null, text: "Reading…" };
  if (!ch.values.length) return { tone: "muted", icon: null, text: "Not concerned" };
  if (ch.verdict === "wrong" && decision) {
    // Approved, not done: the prototype publishes nothing, and in operation the release would follow.
    if (decision.state === "resolved") {
      // The time to alignment is on the impact line below and in the tooltip; the card stays one short line.
      return { tone: "resolved", icon: "check", text: "Re-publication approved", hint: decision.syncMin !== null && decision.syncMin !== undefined ? `Every channel aligned with the source ${fmt(decision.syncMin)} min after the release; nothing is published by this prototype` : "Nothing is published by this prototype" };
    }
    // An accepted risk reads as the mirror's legend says: amber with the hand, nothing changed.
    if (decision.state === "accepted") return { tone: "at-risk", icon: "hand", text: "Wrong: risk accepted" };
    if (decision.overrides && (ch.channel === "displays" || ch.channel === "announcements")) {
      return { tone: "at-risk", icon: "hand", text: "Override approved: a second truth" };
    }
    return { tone: "at-risk", icon: "clock", text: "Data still wrong" };
  }
  switch (ch.verdict) {
    case "wrong": return { tone: "affected", icon: "alert", text: "Contradicts the source" };
    case "right": return { tone: "ok", icon: "check", text: "Matches the source" };
    case "na": return { tone: "muted", icon: null, text: "Not concerned" };
    case "what_if": return { tone: "what-if", icon: "spark", text: "Wrong under the what-if" };
    default: return { tone: "muted", icon: null, text: read ? "Read, not compared yet" : "Not checked yet" };
  }
}

/** The line under the three columns: what the agent's result means for passengers, then what is left. Returns { tone, num, text }. */
export function impactLine(data, decision) {
  const imp = data?.impact;
  if (!imp) return { tone: "muted", num: null, text: "Passenger impact: not calculated yet. The sync engine calculates it once the AI has read the source and the channels." };
  const first = imp.minutes !== null && imp.minutes !== undefined ? `the first in ${int(imp.minutes)} min${imp.where ? ` (${imp.where})` : ""}` : "none within the planning window";
  const who = imp.trains > 1 ? `passengers on ${int(imp.trains)} trains` : "passengers";
  if (decision?.state === "accepted") return { tone: "affected", num: int(imp.pax), text: `${who} act on wrong information: risk accepted, nothing changes` };
  if (decision && typeof decision.residual === "number") {
    const right = decision.fromMin !== null && decision.fromMin !== undefined ? `right information after ${fmt(decision.fromMin)} min` : null;
    const data2 = decision.state === "resolved"
      ? (decision.syncMin !== null && decision.syncMin !== undefined ? `every channel aligned after ${fmt(decision.syncMin)} min` : "every channel re-published")
      : `data not aligned${decision.overrides ? `, ${int(decision.overrides)} ${decision.overrides === 1 ? "value" : "values"} kept by hand` : ""}`;
    return {
      tone: decision.state === "resolved" ? "resolved" : "at-risk",
      num: int(decision.residual),
      text: [`still misinformed with option ${decision.letter}${typeof decision.before === "number" ? ` (was ${int(decision.before)})` : ""}`, right, data2].filter(Boolean).join(" · ")
    };
  }
  if (!imp.pax && !imp.contradictions) return { tone: "resolved", num: "0", text: "passengers act on wrong information: every channel matches the source" };
  if (imp.stage === "what_if") return { tone: "what-if", num: int(imp.pax), text: `${who} would act on wrong information under the what-if · ${first}` };
  // A first estimate says what it looked at ("journey planner & app only"), so its smaller figure is
  // read as a partial count, not as a second answer next to the verified one.
  const estimate = imp.stage === "estimate" ? ` (first estimate${imp.covered ? `: ${imp.covered}` : ""})` : "";
  return {
    tone: imp.stage === "estimate" ? "at-risk" : "affected",
    num: int(imp.pax),
    text: `${who} would act on wrong information${estimate} · ${first}`
  };
}

const fmt = (x) => `${Math.round(Number(x) * 10) / 10}`;

export function createAlign({ onChannel, onSource } = {}) {
  // ---- column 1: the source and the sensors ------------------------------------------------------------
  const srcTag = h("span", { class: "al-tag" });
  const srcTrain = h("span", { class: "al-train" });
  const srcStop = h("span", { class: "al-stop" });
  const srcFacts = h("span", { class: "al-facts" });
  const srcChange = h("span", { class: "al-change" });
  const source = h("button", { class: "al-card al-source", type: "button", title: "Open the timetables: the source beside what each channel publishes" },
    h("span", { class: "al-card-top" }, icon("timetable", 18), h("span", { class: "al-title" }, "Operational timetable"), h("span", { class: "al-de" }, "Betriebsfahrplan"), srcTag),
    srcTrain, srcStop, srcFacts, srcChange);
  source.addEventListener("click", () => onSource?.());

  const senTag = h("span", { class: "al-tag" });
  const senList = h("ul", { class: "al-obs" });
  const senEmpty = h("p", { class: "al-empty" }, "Not read yet");
  const sensors = h("div", { class: "al-card al-sensors" },
    h("span", { class: "al-card-top" }, icon("radar", 18), h("span", { class: "al-title" }, "Sensors"), h("span", { class: "al-de" }, "physical layer"), senTag),
    senEmpty, senList);

  const colSrc = h("section", { class: "al-col", dataset: { col: "src" }, "aria-label": "1: the source the AI reads" },
    h("h3", { class: "al-head" }, h("span", { class: "al-num", "aria-hidden": "true" }, "1"), h("span", {}, "The source"), h("span", { class: "al-head-sub" }, "what the trains will do")),
    source, sensors);

  // ---- column 2: the AI and the human decision -------------------------------------------------------
  const aiStatus = h("p", { class: "al-ai-status", role: "status" });
  const ai = h("div", { class: "al-card al-ai" },
    h("span", { class: "al-card-top" }, icon("spark", 18), h("span", { class: "al-title" }, "AI translator")),
    aiStatus,
    h("ul", { class: "al-rules" },
      h("li", {}, icon("check", 14), "Keeps no timetable of its own"),
      h("li", {}, icon("check", 14), "Every fact traced to the source")));
  const gateText = h("p", { class: "al-gate-text" });
  const gate = h("div", { class: "al-card al-gate" },
    h("span", { class: "al-card-top" }, icon("user", 18), h("span", { class: "al-title" }, "You decide")),
    gateText);
  const colAi = h("section", { class: "al-col", dataset: { col: "ai" }, "aria-label": "2: the AI translator and your decision" },
    h("h3", { class: "al-head" }, h("span", { class: "al-num", "aria-hidden": "true" }, "2"), h("span", {}, "The translator"), h("span", { class: "al-head-sub" }, "compares and drafts")),
    ai, h("span", { class: "al-down", "aria-hidden": "true" }), gate);

  // ---- column 3: the channels ------------------------------------------------------------------------
  const chList = h("ul", { class: "al-channels" });
  const colCh = h("section", { class: "al-col", dataset: { col: "ch" }, "aria-label": "3: what passengers are told" },
    h("h3", { class: "al-head" }, h("span", { class: "al-num", "aria-hidden": "true" }, "3"), h("span", {}, "What passengers are told"), h("span", { class: "al-head-sub" }, "Kundenfahrplan")),
    chList);
  const cards = new Map();

  const linkIn = h("span", { class: "al-link", dataset: { link: "in" }, "aria-hidden": "true" });
  const linkOut = h("span", { class: "al-link", dataset: { link: "out" }, "aria-hidden": "true" });

  // ---- the impact line ---------------------------------------------------------------------------------
  const impNum = h("span", { class: "al-impact-num num" });
  const impText = h("span", { class: "al-impact-text" });
  // The spaces between the parts are real text, so a screen reader and a copy read "312 passengers".
  const impact = h("div", { class: "al-impact", role: "status", "aria-live": "polite" }, icon("users", 20), impNum, " ", impText);

  const element = h("div", { class: "align" },
    h("div", { class: "al-grid" }, colSrc, linkIn, colAi, linkOut, colCh),
    impact);

  function channelCard(channel) {
    let card = cards.get(channel);
    if (card) return card;
    const name = h("span", { class: "al-ch-name" });
    const asOf = h("span", { class: "al-ch-asof" });
    const values = h("span", { class: "al-ch-values" });
    const status = h("span", { class: "al-ch-status" });
    const btn = h("button", { class: "al-card al-channel", type: "button", dataset: { channel } },
      h("span", { class: "al-card-top" }, icon(CHANNEL_ICON[channel] || "list", 18), name, asOf),
      values, status);
    btn.addEventListener("click", () => onChannel?.(channel));
    const li = h("li", {}, btn);
    card = { li, btn, name, asOf, values, status };
    cards.set(channel, card);
    return card;
  }

  /**
   * data: js/align_data.js alignmentData(); ctx: {
   *   size, read: { source, physical, channels: Set }, reading: { source, physical, channels: Set|"all", calculating },
   *   sensors: [reading], ai: string, gate: { state, text }, decision: null | { state, letter, residual, before, fromMin, syncMin, overrides } }
   */
  function render(data, ctx) {
    element.dataset.size = ctx.size || "tall";
    if (!data) return;
    const { read = {}, reading = {}, decision = null } = ctx;

    // Column 1
    srcTrain.textContent = `${data.train.number} → ${data.train.to}`;
    srcStop.textContent = data.stop?.text || "";
    srcFacts.replaceChildren(...data.facts.map((f) => h("span", { class: "al-fact", dataset: { type: f.type }, title: `${f.label}: ${f.sourceFull}` }, f.source)));
    const sourceOf = new Map(data.facts.map((f) => [f.id, f.source]));
    srcChange.textContent = data.change?.text || "";
    source.dataset.read = String(!!read.source);
    source.dataset.reading = String(!!reading.source);
    setTag(srcTag, reading.source ? ["checking", "Reading…"] : read.source ? ["read", "Read by the AI"] : null);
    source.setAttribute("aria-label", `Operational timetable (source): ${data.train.number} to ${data.train.to}, ${data.stop?.text || ""}: ${data.facts.map((f) => f.source).join(", ")}. ${data.change?.text || ""}. Opens the timetables.`);

    const obs = ctx.sensors || [];
    sensors.dataset.read = String(!!read.physical);
    sensors.dataset.reading = String(!!reading.physical);
    senEmpty.hidden = obs.length > 0;
    senEmpty.textContent = reading.physical ? "Reading the sensors…" : read.physical ? "No reading bears on this train" : "Not read yet";
    senList.replaceChildren(...obs.slice(0, 2).map((o) => h("li", { title: `${o.source}: ${o.full}` }, o.time ? h("span", { class: "al-time num" }, o.time) : null, o.time ? " " : null, h("span", {}, o.text))));
    senList.hidden = !obs.length;
    setTag(senTag, reading.physical ? ["checking", "Reading…"] : obs.length ? ["ok", "Confirms the source"] : null);

    // Column 2
    aiStatus.textContent = ctx.ai || "";
    ai.dataset.busy = String(!!(reading.source || reading.physical || reading.calculating || reading.channels === "all" || (reading.channels && reading.channels.size)));
    gate.dataset.state = ctx.gate?.state || "idle";
    gateText.textContent = ctx.gate?.text || "Nothing goes out without your approval";

    // Column 3
    const keep = new Set(data.channels.map((c) => c.channel));
    for (const [ch, c] of cards) if (!keep.has(ch)) { c.li.remove(); cards.delete(ch); }
    data.channels.forEach((ch, i) => {
      const c = channelCard(ch.channel);
      const isReading = reading.channels === "all" || !!reading.channels?.has?.(ch.channel);
      const st = channelStatus(ch, { reading: isReading, read: !!read.channels?.has?.(ch.channel), decision });
      c.name.textContent = ch.label;
      c.name.title = ch.de;
      c.asOf.textContent = ch.asOf ? `as of ${ch.asOf}` : "";
      c.asOf.title = ch.asOf ? `Generated at ${ch.asOf}, before the source changed` : "";
      // After an approved re-publication, a wrong value shows what it becomes: the source's value.
      const fixed = (v) => st.tone === "resolved" && !v.ok && sourceOf.get(v.id);
      c.values.replaceChildren(...(ch.values.length
        ? ch.values.map((v) => h("span", { class: "al-ch-value", dataset: { ok: String(v.ok), type: v.type }, title: v.full },
          fixed(v) ? [h("s", {}, v.text), h("span", { class: "al-arrow", "aria-label": "becomes" }, " → "), sourceOf.get(v.id)] : v.text))
        : [h("span", { class: "al-ch-value", dataset: { none: "true" } }, "—")]));
      c.status.replaceChildren(...[st.icon ? icon(st.icon, 15) : null, h("span", {}, st.text)].filter(Boolean));
      c.status.title = st.hint || "";
      c.btn.dataset.tone = st.tone;
      c.btn.dataset.verdict = ch.verdict || "none";
      c.btn.dataset.reading = String(isReading);
      c.btn.dataset.read = String(!!read.channels?.has?.(ch.channel));
      c.btn.setAttribute("aria-label", `${ch.label}${ch.asOf ? `, as of ${ch.asOf}` : ""}: ${ch.values.map((v) => v.text).join(", ") || "not concerned"}. ${st.text}. Opens this channel's timetable.`);
      if (chList.children[i] !== c.li) chList.insertBefore(c.li, chList.children[i] || null);
    });

    // Links: reading flows towards the AI; after a decision, the outcome flows to the channels.
    linkIn.dataset.flow = reading.source || reading.physical ? "reading" : read.source ? "done" : "idle";
    linkOut.dataset.flow = decision ? (decision.state === "resolved" ? "resolved" : decision.state === "accepted" ? "idle" : "at-risk") : reading.channels === "all" || reading.channels?.size ? "reading" : "idle";

    // The impact line
    const imp = impactLine(data, decision);
    impact.dataset.tone = imp.tone;
    impNum.hidden = imp.num === null;
    impNum.textContent = imp.num ?? "";
    impText.textContent = imp.text;
    if (data.more) impText.append(h("span", { class: "al-more" }, ` · ${data.more} more ${data.more === 1 ? "stop" : "stops"} in the timetables`));
  }

  function setTag(el, spec) {
    el.hidden = !spec;
    if (!spec) return;
    el.dataset.tone = spec[0];
    el.replaceChildren(...[spec[0] === "read" || spec[0] === "ok" ? icon("check", 12) : null, h("span", { class: "al-tag-text" }, spec[1])].filter(Boolean));
  }

  return {
    element,
    render,
    /** The first channel card (the keyboard focus moves there when a train opens in this view). */
    focusFirst: () => (chList.querySelector(".al-channel") || source).focus({ preventScroll: true })
  };
}
