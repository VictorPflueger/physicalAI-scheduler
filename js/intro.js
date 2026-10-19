// Intro window: what the Timetable Translator does, how the AI aligns the information and what it
// achieves, readable in about a minute. It opens with the problem in one example (the source says one
// platform, every channel another, and how many passengers that misleads), worked out by the sync
// engine when the window opens, so the figures are the engine's and never typed by hand. It opens by
// itself on a visitor's first visit (remembered in this browser's local storage) and any time from the
// "How it works" button in the header.

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { STORAGE } from "./config.js";
import { getModel, minuteLabel } from "./world.js";
import { simulateSync, compactForModel } from "./sync.js";
import { alignmentData } from "./align_data.js";
import { int } from "./format.js";

// The five steps are the same as the progress rail above the console. Their numbers use the
// colours the app uses for the same moments: red for a finding, blue for verification, amber
// for risk, burgundy for your decision, green for a resolved state.
const STEPS = [
  { tone: "spot", title: "Spot", text: "Notices a change in the operational timetable." },
  { tone: "check", title: "Check", text: "Compares every channel with the source and the sensors." },
  { tone: "calculate", title: "Calculate", text: "Counts who would act on wrong information, and when." },
  { tone: "propose", title: "Propose", text: "Three responses next to doing nothing. You decide." },
  { tone: "prepare", title: "Prepare", text: "Drafts the message and the re-publication. You approve." }
];

const VALUE = [
  { title: "Passengers told in time", text: "Contradictions answered before the train leaves, not at the next cycle." },
  { title: "One truth", text: "No timetable of its own: channels are re-published from the source." },
  { title: "People in charge", text: "Nothing goes out without your approval; every figure traced to the source." }
];

/** The pitch scenario as the engine sees it: the source's platform, the channels' platform and who it misleads. */
export function pitchExample(model = getModel(), refs = globalThis.REFERENCE_CASES, scenarios = globalThis.SCENARIOS) {
  try {
    const sc = (scenarios || []).find((s) => s.id === "SC-PLATFORM");
    const spec = refs?.["SC-PLATFORM"]?.finding;
    if (!sc || !spec) return null;
    const res = simulateSync(model, structuredClone(spec));
    if (!res.ok) return null;
    const d = alignmentData(model, sc.train_id, { result: compactForModel(res), basisKey: "verified" });
    const fact = d.facts.find((f) => f.type === "platform");
    const wrong = d.channels.filter((c) => c.values.some((v) => v.type === "platform" && !v.ok));
    const told = wrong[0]?.values.find((v) => v.type === "platform");
    if (!fact || !told) return null;
    return {
      train: `${d.train.number} to ${d.train.to}`,
      stop: d.stop?.text || "",
      source: fact.source,
      told: told.text,
      channels: wrong.map((c) => c.label),
      asOf: wrong[0]?.asOf || null,
      pax: res.baseline.misinformed_pax,
      minutes: res.baseline.first_event_min,
      now: minuteLabel(model.now)
    };
  } catch {
    return null;
  }
}

/** True once this browser has seen the intro (closed it at least once). */
export function introSeen() {
  try { return localStorage.getItem(STORAGE.introSeen) === "1"; } catch { return false; }
}

function markIntroSeen() {
  try { localStorage.setItem(STORAGE.introSeen, "1"); } catch { /* storage blocked: it opens again next time */ }
}

/** The problem in one example: the source's platform above what the channels say, and who acts on it. */
function problemExample(ex) {
  if (!ex) return null;
  const names = ex.channels.map((c, i) => (i ? c.charAt(0).toLowerCase() + c.slice(1) : c));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return h("div", { class: "intro-problem", role: "group", "aria-label": "Example from the demonstration" },
    h("div", { class: "ip-row", dataset: { kind: "source" } },
      icon("timetable", 18),
      h("span", { class: "ip-label" }, "Operational timetable", h("span", { class: "ip-sub" }, `${ex.train} · ${ex.stop}`)),
      h("span", { class: "ip-val" }, ex.source)),
    h("div", { class: "ip-row", dataset: { kind: "told" } },
      icon("users", 18),
      h("span", { class: "ip-label" }, "What passengers are told", h("span", { class: "ip-sub" }, `${list}${ex.asOf ? `, as of ${ex.asOf}` : ""}`)),
      h("span", { class: "ip-val" }, ex.told, icon("alert", 16))),
    h("p", { class: "ip-impact" },
      ex.now ? `It is ${ex.now}: ` : "",
      h("strong", {}, `${int(ex.pax)} passengers`),
      ` would act on the wrong information${ex.minutes !== null && ex.minutes !== undefined ? `, the first in ${int(ex.minutes)} minutes` : ""}. The translator finds it and prepares the fix.`));
}

/**
 * Opens the intro window. With `onStart`, its main button starts the usual run flow (mode choice
 * first) under `startLabel`; without it (a run is in progress) there is only Close.
 * Resolves "start" or null.
 */
export function openIntro({ startLabel = "Start agent", onStart = null } = {}) {
  return new Promise((resolve) => {
    let modal;
    const steps = h("ol", { class: "intro-steps" }, STEPS.map((s, i) =>
      h("li", { class: "intro-step", dataset: { tone: s.tone } },
        h("span", { class: "intro-num", "aria-hidden": "true" }, String(i + 1)),
        h("strong", { class: "intro-step-title" }, s.title),
        h("span", { class: "intro-step-text" }, s.text))));
    const value = h("ul", { class: "intro-value" }, VALUE.map((v) =>
      h("li", {}, h("strong", {}, v.title), h("span", {}, v.text))));

    const footer = onStart
      ? [
        h("span", { class: "left" }, "To watch a run, press ", h("strong", {}, startLabel), " and choose ", h("strong", {}, "Simulation"), ". No key needed."),
        h("button", { class: "btn btn-ghost", type: "button", on: { click: () => modal.close(null) } }, "Close"),
        h("button", { class: "btn btn-primary", type: "button", autofocus: true, on: { click: () => modal.close("start") } }, icon("play", 18), startLabel)
      ]
      : [h("button", { class: "btn btn-primary", type: "button", autofocus: true, on: { click: () => modal.close(null) } }, "Close")];

    modal = openModal({
      title: "How the Timetable Translator works",
      intro: "An AI translator between the operational timetable (Betriebsfahrplan) and everything passengers are told (Kundenfahrplan). It keeps no timetable of its own.",
      className: "intro-modal",
      body: [
        h("h3", {}, "What it does"),
        problemExample(pitchExample()) || h("p", { class: "intro-lead" }, "It finds where what passengers are told contradicts the operational timetable, works out who is affected and prepares the fix for your approval."),
        h("h3", {}, "How the AI aligns the information"),
        steps,
        h("h3", {}, "What it achieves"),
        value,
        h("p", { class: "intro-note" }, "Stations, Ril 100 codes and lines are real; trains, times, passenger figures, operational changes and sensor readings are fictional.")
      ],
      footer,
      onClose: (result) => {
        markIntroSeen();
        resolve(result || null);
        if (result === "start") onStart?.();
      }
    });
  });
}
