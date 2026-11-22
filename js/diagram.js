// The three-column diagram, the Timetable Translator's story in one picture:
//   1  the source the AI reads: the operational timetable at one stop of one train, when and by whom it
//      changed, and the one sensor reading on the track that bears most on the train;
//   2  the AI translator between the two timetables, which keeps no timetable of its own, and the
//      person who decides before anything goes out;
//   3  what passengers are told on every customer channel, with the engine's verdict.
// Below them, what the engine's result means for passengers, and after your decision what is left.
// Each card says one thing in a few words. It draws what js/run.js's diagramAt() gives it, so a replay
// and a live run look the same; every value comes from js/align_data.js (world model and engine).

import { h, icon } from "./dom.js";
import { int } from "./format.js";
import { role } from "./plain.js";

const CHANNEL_ICON = { planner: "list", displays: "timetable", announcements: "megaphone", coach: "users" };

/**
 * The channel's line under its value: the engine's verdict, or what your decision did to it. A channel
 * the AI has read but no engine result has judged yet says so: the verdict and its colour come from
 * the sync engine's comparison, never from the language model's reading. Returns { tone, icon, text }.
 */
export function channelStatus(ch, { reading = false, read = false, decision = null } = {}) {
  if (reading) return { tone: "checking", icon: null, text: "Reading…" };
  if (!ch.values.length) return { tone: "muted", icon: null, text: "Not concerned" };
  if (ch.verdict === "wrong" && decision) {
    // Approved, not done: the prototype publishes nothing; in operation the release would follow.
    if (decision.state === "resolved") return { tone: "resolved", icon: "check", text: "Re-publication approved" };
    if (decision.state === "accepted") return { tone: "at-risk", icon: "hand", text: "Wrong: risk accepted" };
    if (decision.overrides && (ch.channel === "displays" || ch.channel === "announcements")) return { tone: "at-risk", icon: "hand", text: "Set by hand: a second truth" };
    return { tone: "at-risk", icon: "clock", text: "Data still wrong" };
  }
  switch (ch.verdict) {
    case "wrong": return { tone: "affected", icon: "warning", text: "Contradicts the source" };
    case "right": return { tone: "ok", icon: "check", text: "Matches the source" };
    case "na": return { tone: "muted", icon: null, text: "Not concerned" };
    case "what_if": return { tone: "what-if", icon: "sparkle", text: "Wrong under the what-if" };
    default: return { tone: "muted", icon: null, text: read ? "Read, not compared yet" : "Not checked yet" };
  }
}

const fmt = (x) => `${Math.round(Number(x) * 10) / 10}`;

/** The line under the three columns: what the engine's result means for passengers, then what is left. Returns { tone, num, text }. */
export function impactLine(data, decision) {
  const imp = data?.impact;
  if (!imp) return { tone: "muted", num: null, text: "Passenger impact: not counted yet. The engine counts it once the AI has read the source and the channels." };
  const first = imp.minutes !== null && imp.minutes !== undefined ? `the first in ${int(imp.minutes)} min` : "none within three hours";
  const who = imp.trains > 1 ? `passengers on ${int(imp.trains)} trains` : "passengers";
  if (decision?.state === "accepted") return { tone: "affected", num: int(imp.pax), text: `${who} act on wrong information: risk accepted, nothing changes` };
  if (decision && typeof decision.residual === "number") {
    const right = decision.fromMin !== null && decision.fromMin !== undefined ? `right information after ${fmt(decision.fromMin)} min` : null;
    const aligned = decision.state === "resolved"
      ? (decision.syncMin !== null && decision.syncMin !== undefined ? `every channel aligned after ${fmt(decision.syncMin)} min` : "every channel re-published")
      : `data not aligned${decision.overrides ? `, ${int(decision.overrides)} ${decision.overrides === 1 ? "value" : "values"} set by hand` : ""}`;
    return {
      tone: decision.state === "resolved" ? "resolved" : "at-risk",
      num: int(decision.residual),
      text: [`still misinformed with option ${decision.letter}${typeof decision.before === "number" ? ` (was ${int(decision.before)})` : ""}`, right, aligned].filter(Boolean).join(" · ")
    };
  }
  if (!imp.pax && !imp.contradictions) return { tone: "resolved", num: "0", text: "passengers act on wrong information: every channel matches the source" };
  if (imp.stage === "what_if") return { tone: "what-if", num: int(imp.pax), text: `${who} would act on wrong information under the what-if · ${first}` };
  // A first estimate says what it looked at ("journey planner & app only"), so its smaller figure reads
  // as a partial count, not as a second answer next to the verified one.
  const estimate = imp.stage === "estimate" ? ` (first estimate${imp.covered ? `: ${imp.covered}` : ""})` : "";
  return { tone: imp.stage === "estimate" ? "at-risk" : "affected", num: int(imp.pax), text: `${who} would act on wrong information${estimate} · ${first}` };
}

export function createDiagram() {
  // ---- column 1: the source and the sensors ----------------------------------------------------------
  const srcTag = h("span", { class: "vc-tag vc-tag--info al-tag" });
  const srcStop = h("span", { class: "al-stop" });
  const srcFacts = h("span", { class: "al-facts" });
  const srcChange = h("span", { class: "al-change" });
  const source = h("div", { class: "al-card al-source" },
    h("span", { class: "al-card-top" }, icon("timetable"), h("span", { class: "al-title" }, "Operational timetable"), srcTag),
    srcStop, srcFacts, srcChange);
  const senTag = h("span", { class: "vc-tag vc-tag--info al-tag" });
  const senList = h("ul", { class: "al-obs" });
  const senEmpty = h("p", { class: "al-empty" }, "Not read yet");
  const sensors = h("div", { class: "al-card al-sensors" },
    h("span", { class: "al-card-top" }, icon("radar"), h("span", { class: "al-title" }, "Track sensors"), senTag),
    senEmpty, senList);
  const colSrc = h("section", { class: "al-col", dataset: { col: "src" }, "aria-label": "1: the source the AI reads" },
    h("h3", { class: "al-head" }, h("span", { class: "al-num", "aria-hidden": "true" }, "1"), h("span", {}, "The source")),
    source, sensors);

  // ---- column 2: the AI and your decision ------------------------------------------------------------
  const aiStatus = h("p", { class: "al-ai-status", role: "status" });
  const ai = h("div", { class: "al-card al-ai" },
    h("span", { class: "al-card-top" }, icon("sparkle"), h("span", { class: "al-title" }, "AI translator")),
    aiStatus,
    h("p", { class: "al-rule" }, icon("check"), "Keeps no timetable of its own"));
  const gateText = h("p", { class: "al-gate-text" });
  const gate = h("div", { class: "al-card al-gate" },
    h("span", { class: "al-card-top" }, icon("user"), h("span", { class: "al-title" }, "You decide")),
    gateText);
  const colAi = h("section", { class: "al-col", dataset: { col: "ai" }, "aria-label": "2: the AI translator and your decision" },
    h("h3", { class: "al-head" }, h("span", { class: "al-num", "aria-hidden": "true" }, "2"), h("span", {}, "The translator")),
    ai, h("span", { class: "al-down", "aria-hidden": "true" }), gate);

  // ---- column 3: the channels ------------------------------------------------------------------------
  const chList = h("ul", { class: "al-channels" });
  const chAsOf = h("span", { class: "al-head-asof", hidden: true });
  const colCh = h("section", { class: "al-col", dataset: { col: "ch" }, "aria-label": "3: what passengers are told" },
    h("h3", { class: "al-head" }, h("span", { class: "al-num", "aria-hidden": "true" }, "3"), h("span", {}, "What passengers are told"), chAsOf),
    chList);
  const cards = new Map();
  const linkIn = h("span", { class: "al-link", dataset: { link: "in" }, "aria-hidden": "true" });
  const linkOut = h("span", { class: "al-link", dataset: { link: "out" }, "aria-hidden": "true" });

  // ---- the impact line ---------------------------------------------------------------------------------
  const impNum = h("span", { class: "al-impact-num vc-tabular" });
  const impText = h("span", { class: "al-impact-text" });
  const impact = h("div", { class: "al-impact", role: "status" }, icon("users"), impNum, " ", impText);

  const element = h("div", { class: "align" }, h("div", { class: "al-grid" }, colSrc, linkIn, colAi, linkOut, colCh), impact);

  function channelCard(channel) {
    let card = cards.get(channel);
    if (card) return card;
    const name = h("span", { class: "al-ch-name" });
    const asOf = h("span", { class: "al-ch-asof" });
    const values = h("span", { class: "al-ch-values" });
    const status = h("span", { class: "al-ch-status" });
    const box = h("div", { class: "al-card al-channel", dataset: { channel } }, h("span", { class: "al-card-top" }, icon(CHANNEL_ICON[channel] || "list"), name, asOf), values, status);
    const li = h("li", {}, box);
    card = { li, box, name, asOf, values, status };
    cards.set(channel, card);
    return card;
  }

  /** state: js/run.js diagramAt() plus { ai: the translator's line }. */
  function render(state) {
    const { data, read = {}, reading = {}, sensors: obs = [], decision = null } = state;
    if (!data) return;

    // Column 1
    srcStop.textContent = data.stop?.text || "";
    srcFacts.replaceChildren(...data.facts.map((f) => h("span", { class: "al-fact", dataset: { type: f.type } }, f.source)));
    const sourceOf = new Map(data.facts.map((f) => [f.id, f.source]));
    const change = data.change || {};
    srcChange.textContent = change.at ? `Changed at ${change.at}${change.by ? ` by ${role(change.by)}` : ""}` : "No change today: the base timetable";
    source.dataset.read = String(!!read.source);
    source.dataset.reading = String(!!reading.source);
    setTag(srcTag, reading.source ? ["checking", "Reading…"] : read.source ? ["read", "Read by the AI"] : null);

    sensors.dataset.read = String(!!read.physical);
    sensors.dataset.reading = String(!!reading.physical);
    senEmpty.hidden = obs.length > 0;
    senEmpty.textContent = reading.physical ? "Reading the sensors…" : read.physical ? "No reading bears on this train" : "Not read yet";
    // The reading that bears most on the train; the others confirm the same.
    senList.replaceChildren(...obs.slice(0, 1).map((o) => h("li", {}, o.time ? h("span", { class: "al-time vc-tabular" }, o.time) : null, h("span", {}, o.text))));
    senList.hidden = !obs.length;
    setTag(senTag, reading.physical ? ["checking", "Reading…"] : obs.length ? ["ok", "Confirms the source"] : null);

    // Column 2
    aiStatus.textContent = state.ai || "";
    ai.dataset.busy = String(!!(reading.source || reading.physical || reading.calculating || reading.channels === "all" || reading.channels?.size));
    gate.dataset.state = state.gate?.state || "idle";
    gateText.textContent = state.gate?.text || "Nothing goes out without your approval";

    // Column 3
    const times = new Set(data.channels.map((c) => c.asOf || ""));
    const shared = times.size === 1 && !times.has("") ? data.channels[0].asOf : null;
    chAsOf.hidden = !shared;
    chAsOf.textContent = shared ? `as of ${shared}` : "";
    const keep = new Set(data.channels.map((c) => c.channel));
    for (const [ch, c] of cards) if (!keep.has(ch)) { c.li.remove(); cards.delete(ch); }
    data.channels.forEach((ch, i) => {
      const c = channelCard(ch.channel);
      const isReading = reading.channels === "all" || !!reading.channels?.has?.(ch.channel);
      const st = channelStatus(ch, { reading: isReading, read: !!read.channels?.has?.(ch.channel), decision });
      c.name.textContent = ch.label;
      c.asOf.textContent = ch.asOf && !shared ? `as of ${ch.asOf}` : "";
      // After an approved re-publication, a wrong value shows what it becomes: the source's value.
      const fixed = (v) => st.tone === "resolved" && !v.ok && sourceOf.get(v.id);
      c.values.replaceChildren(...(ch.values.length
        ? ch.values.map((v) => h("span", { class: "al-ch-value", dataset: { ok: String(v.ok), type: v.type } },
          fixed(v) ? [h("s", {}, v.text), h("span", { class: "al-arrow" }, " → "), h("span", { class: "al-new" }, sourceOf.get(v.id))] : v.text))
        : [h("span", { class: "al-ch-value", dataset: { none: "true" } }, "Nothing to show")]));
      c.status.replaceChildren(...[st.icon ? icon(st.icon) : null, h("span", {}, st.text)].filter(Boolean));
      c.box.dataset.tone = st.tone;
      c.box.dataset.verdict = ch.verdict || "none";
      c.box.dataset.reading = String(isReading);
      if (chList.children[i] !== c.li) chList.insertBefore(c.li, chList.children[i] || null);
    });

    // Reading flows towards the AI; after a decision, the outcome flows to the channels.
    linkIn.dataset.flow = reading.source || reading.physical ? "reading" : read.source ? "done" : "idle";
    linkOut.dataset.flow = decision ? (decision.state === "resolved" ? "resolved" : decision.state === "accepted" ? "idle" : "at-risk") : reading.channels === "all" || reading.channels?.size ? "reading" : "idle";

    const imp = impactLine(data, decision);
    impact.dataset.tone = imp.tone;
    impNum.hidden = imp.num === null;
    impNum.textContent = imp.num ?? "";
    impText.textContent = imp.text;
    if (data.more && imp.num !== null) impText.append(h("span", { class: "al-more" }, ` · and ${data.more} more ${data.more === 1 ? "stop" : "stops"}`));
    fit();
  }

  /** The view steps down a size while its content outgrows the frame, so the impact line stays in view. */
  function fit() {
    const SIZES = ["tall", "mid", "short"];
    const frame = element.parentElement;
    const room = frame ? frame.clientHeight : 0;
    element.dataset.size = room >= 470 ? "tall" : room >= 380 ? "mid" : "short";
    const outgrows = () => element.scrollHeight > element.clientHeight + 1;
    for (let i = SIZES.indexOf(element.dataset.size); i < SIZES.length - 1 && element.clientHeight > 0 && outgrows(); i++) element.dataset.size = SIZES[i + 1];
  }

  function setTag(el, spec) {
    el.hidden = !spec;
    if (!spec) return;
    el.dataset.tone = spec[0];
    el.replaceChildren(...[spec[0] === "read" || spec[0] === "ok" ? icon("check") : null, h("span", { class: "al-tag-text" }, spec[1])].filter(Boolean));
  }

  return { element, render, fit };
}
