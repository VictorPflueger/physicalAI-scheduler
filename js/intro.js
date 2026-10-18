// Intro window: what the Timetable Translator does, how it works and why it pays off, readable in about
// a minute. It opens by itself on a visitor's first visit (remembered in this browser's local storage)
// and any time from the "How it works" button in the header.

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { STORAGE } from "./config.js";

// The five steps are the same as the progress rail above the console. Their numbers use the
// colours the app uses for the same moments: red for a finding, blue for verification, amber
// for risk, burgundy for your decision, green for a resolved state.
const STEPS = [
  { tone: "spot", title: "Spot", text: "Picks up an operational change and the trains it touches." },
  { tone: "check", title: "Check", text: "Reads the source, what passengers are told, and the physical layer." },
  { tone: "calculate", title: "Calculate", text: "Works out who would act on wrong information, and when." },
  { tone: "propose", title: "Propose", text: "Offers three costed responses next to doing nothing. You decide." },
  { tone: "prepare", title: "Prepare", text: "Drafts the passenger message and the re-publication for your approval. Nothing is published." }
];

const VALUE = [
  { title: "One truth", text: "The AI keeps no timetable of its own: every fact it states traces back to the source." },
  { title: "Passengers told in time", text: "Contradictions between the two timetables are found before anyone stands on the wrong platform." },
  { title: "People stay in charge", text: "The agent prepares, you approve, and every step is logged." }
];

/** True once this browser has seen the intro (closed it at least once). */
export function introSeen() {
  try { return localStorage.getItem(STORAGE.introSeen) === "1"; } catch { return false; }
}

function markIntroSeen() {
  try { localStorage.setItem(STORAGE.introSeen, "1"); } catch { /* storage blocked: it opens again next time */ }
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
        h("span", { class: "left" }, "Try it for free: press ", h("strong", {}, startLabel), " and choose ", h("strong", {}, "Simulation"), ". No key needed."),
        h("button", { class: "btn btn-ghost", type: "button", on: { click: () => modal.close(null) } }, "Close"),
        h("button", { class: "btn btn-primary", type: "button", autofocus: true, on: { click: () => modal.close("start") } }, icon("play", 18), startLabel)
      ]
      : [h("button", { class: "btn btn-primary", type: "button", autofocus: true, on: { click: () => modal.close(null) } }, "Close")];

    modal = openModal({
      title: "How the Timetable Translator works",
      intro: "An AI agent between the operational timetable (Betriebsfahrplan) and the customer timetable (Kundenfahrplan): it derives what passengers should be told from the single source, finds where published information contradicts it, and proposes a fix.",
      className: "intro-modal",
      body: [
        h("h3", {}, "How it works"),
        steps,
        h("h3", {}, "Why it pays off"),
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
