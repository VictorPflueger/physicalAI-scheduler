// Starts the Timetable Translator. It plays the default scenario, the platform change at Köln Hbf,
// through the simulation player to the point where a person decides, and shows its five steps. Once the
// guide is closed, Play walks the steps at reading pace and stops where a person acts; there the bar
// right under the story says "Your turn" and holds the one action. A click on a step, a key, a clicker or
// ?step= shows a step at once and pauses Play. Start agent offers the simulation again or a live run on
// the visitor's key; both fill the same run digest (js/run.js), so every step looks the same in both.

import { bus, newRunId } from "./events.js";
import { getModel } from "./world.js";
import { createSimulationPlayer } from "./simulation.js";
import { createLiveAgent } from "./agent.js";
import { MODELS, DEFAULT_MODEL } from "./config.js";
import { digest, diagramAt, STEP_IDS } from "./run.js";
import { STEPS, story, keyFigures, guideFigures, aiLine, capital } from "./story.js";
import { renderStory, renderKpis } from "./view.js";
import { createDiagram } from "./diagram.js";
import { createShell, getParam, setParam } from "./shell.js";
import { playHeadless, estimateCost } from "./estimate.js";
import { forgetKey } from "./claude.js";
import { eurCents } from "./format.js";

const $ = (id) => document.getElementById(id);
const MODEL = MODELS.find((m) => m.id === DEFAULT_MODEL) || MODELS[0];
// The scenarios' links (?scenario=diversion), and names in plain words where the data has German terms.
const SLUGS = { "SC-PLATFORM": "platform-change", "SC-DIVERSION": "diversion", "SC-OPSSTOP": "operational-stop", "SC-TERMINUS": "new-terminus", "SC-COACH": "coach-order", "SC-FPLO": "construction-order", "SC-EUROPE": "european-timetable" };
const SHORT = { "SC-OPSSTOP": "Operational stop" };
const HINTS = {
  "SC-PLATFORM": "A platform change the channels missed",
  "SC-DIVERSION": "Two diverted trains, stops they will not make",
  "SC-OPSSTOP": "A stop where the doors stay shut",
  "SC-TERMINUS": "The train ends early, the app says otherwise",
  "SC-COACH": "First class at the other end of the platform",
  "SC-FPLO": "Track works make two trains late and break a connection",
  "SC-EUROPE": "A Belgian change the European timetable lacks"
};

const S = { scenario: null, mode: "simulation", runId: null, events: [], r: null, view: null, step: 0, follow: false, busy: false, estimates: new Map(), started: false, link: false, played: false };
/** Play: on, its frame, the time spent reading the current step, the step it timed. */
const P = { on: false, raf: 0, at: 0, last: 0, step: -1 };
let shell, diagram, clock, model, guide, player, agent;

async function start() {
  for (const name of ["WORLD", "SCENARIOS", "REFERENCE_CASES", "SIM_RUNS"]) {
    if (!globalThis[name]) throw new Error(`A data file did not load (${name}). Deploy data/ next to index.html and reload.`);
  }
  model = getModel();
  guide = $("guide");
  diagram = createDiagram();
  $("diagram").append(diagram.element);
  player = createSimulationPlayer({ getSpeed: () => Infinity });
  agent = createLiveAgent({ onKeyRejected: () => forgetKey() });

  shell = createShell({
    steps: STEPS,
    onStep(id, how) {
      S.step = STEP_IDS.indexOf(id);
      if (how === "click" || how === "key") pause();
      if (S.mode === "live") S.follow = S.step >= (S.r?.reached ?? 0);
      draw();
      $("story").scrollTop = 0;
      const st = S.view?.steps[S.step];
      if (st && how !== "code") shell.announce(`Step ${S.step + 1} of 5, ${st.label}: ${st.title}.${st.waits ? ` Your turn: ${st.turn?.text || ""}` : ""}`);
      if (how === "click" || how === "key") $("story-title").focus({ preventScroll: true });
    },
    onForward: () => go(S.step + 1),
    onBack: () => go(S.step - 1),
    onSpace: () => (P.on ? pause() : play()),
    onStart: (mode) => (mode === "live" ? startLive() : openCase(S.scenario, { play: true })),
    onCase: (slug) => openCase(findScenario(slug), { play: true })
  });
  $("play").addEventListener("click", () => (P.on ? pause() : play()));
  for (const t of ["pointerdown", "keydown", "wheel"]) document.addEventListener(t, () => { document.querySelector("#move-actions #next")?.classList.remove("vc-attention"); nudge(); }, { capture: true, passive: true });

  // Detection → decision: from the lead on screen to your approval, measured on this page.
  clock = shell.createClock((text, running) => shell.setKpi("Detection → decision", {
    value: text,
    note: running ? "running since the lead" : S.r?.decision ? "stopped at your decision" : "starts with the lead",
    tone: S.r?.decision && !running ? "decided" : ""
  }));

  // The guide opens by itself in a new tab. Closing it puts the lead on screen: the clock starts and the
  // story plays, unless a link asked for a step. Start on a guide opened later plays the story too.
  guide.addEventListener("vc:guideclose", (e) => {
    const firstClose = !S.started;
    if (firstClose) begin();
    else if (e.detail?.returnValue === "done") play();
    if (document.activeElement === document.body) $("story").focus({ preventScroll: true });
  });

  shell.setCases(scenarioList().map((s) => ({ slug: SLUGS[s.id], title: s.title, short: SHORT[s.id] || s.short, hint: HINTS[s.id] || "" })), SLUGS[defaultScenario().id]);
  const first = findScenario(getParam("scenario"));
  const at = STEP_IDS.indexOf(getParam("step"));
  S.link = at >= 0;
  $("boot-status").textContent = "Playing the agent's run…";
  await openCase(first, { at: S.link ? at : null, boot: true });
  fillGuide(await estimateFor(defaultScenario()));
  document.documentElement.dataset.boot = "ready";
  $("boot").dataset.state = "done";
  setTimeout(() => $("boot")?.remove(), 400);
  setInterval(() => { if (P.on) shell.setMoveNote(countdown()); }, 250);
  if (!guide.open) begin();
}

/** The lead is on screen: the clock starts, and Play too unless a link asked for a step. */
function begin() {
  if (S.started) return;
  S.started = true;
  if (S.mode !== "live" && !S.r?.decision) clock.start();
  if (!S.link) play();
  draw();
}

// ---- scenarios ------------------------------------------------------------------------------------------

function scenarioList() {
  const all = globalThis.SCENARIOS || [];
  return [...all.filter((s) => s.start_here), ...all.filter((s) => !s.start_here)];
}
const defaultScenario = () => scenarioList()[0];
const findScenario = (slugOrId) => scenarioList().find((s) => SLUGS[s.id] === slugOrId || s.id === slugOrId) || defaultScenario();

/** The scenario's estimated live cost, from a headless run of its script (once per scenario). */
async function estimateFor(scenario) {
  if (S.estimates.has(scenario.id)) return S.estimates.get(scenario.id);
  const events = await playHeadless(scenario);
  const e = { events, cost: estimateCost(events, scenario, MODEL.id) };
  S.estimates.set(scenario.id, e);
  return e;
}

/**
 * Opens a scenario in the simulation: its run plays at once, through the real tools and engine, up to
 * the point where a person decides. at: the step a link asked for, shown paused; play: start Play.
 */
async function openCase(scenario, { at = null, play: andPlay = false, boot = false } = {}) {
  pause();
  stopRun();
  S.busy = true;
  S.scenario = scenario;
  S.mode = "simulation";
  shell.setMode("simulation");
  $("scenario-name").textContent = SHORT[scenario.id] || scenario.short;
  if (!boot) draw();
  const est = await estimateFor(scenario);
  for (const el of document.querySelectorAll('.start-card [data-fig="estimate"]')) el.textContent = eurCents(est.cost.eur);
  S.events = [];
  S.runId = newRunId();
  const rested = new Promise((resolve) => {
    const off = bus.onAny((ev) => {
      if (ev.run_id !== S.runId) return;
      S.events.push(ev);
      if (S.busy && ((ev.type === "state_change" && ev.payload.state === "awaiting_approval") || ev.type === "run_end")) resolve();
      if (!S.busy) schedule();
    });
    S.stopListening = off;
  });
  bus.beginRun({ run_id: S.runId, mode: "simulation" });
  bus.emit("run_start", { run_id: S.runId, mode: "simulation", entry: "scenario", scenario_id: scenario.id, title: scenario.title, seed: scenario.seed, sim_source: "authored" });
  player.play(globalThis.SIM_RUNS[scenario.id], { scenario: scenario.id });
  await rested;
  S.busy = false;
  clock.reset();
  if (S.started) clock.start();
  setParam("scenario", scenario.id === defaultScenario().id ? null : SLUGS[scenario.id]);
  S.step = 0;
  P.step = -1;
  draw();
  shell.go(STEP_IDS[at ?? 0], "code");
  if (!boot) shell.announce(`${scenario.title}. Step 1 of 5: Spot.`);
  if (andPlay && S.started) play();
}

/** Ends whatever runs now: the replay's player or a live agent. */
function stopRun() {
  if (player.isActive()) player.abort("Another scenario was opened.");
  if (agent.isActive()) agent.abort("Back to the simulation.");
  S.stopListening?.();
  S.stopListening = null;
  bus.endRun();
}

/** Shows step i. A step chosen by hand pauses Play; Play's own moves keep it on (keep). */
function go(i, { keep = false } = {}) {
  if (!S.view || i < 0 || i >= STEP_IDS.length || !S.view.steps[i].ready) return;
  if (!keep) pause();
  P.step = -1;
  shell.go(STEP_IDS[i], keep ? "play" : "key");
}

// ---- drawing --------------------------------------------------------------------------------------------

function schedule() {
  if (S.frame) return;
  S.frame = requestAnimationFrame(() => { S.frame = 0; draw(); });
}

function draw() {
  if (!S.scenario || !S.events.length) { drawPlay(); shell.setMove(moveFor()); return; }
  const r = digest(S.events);
  S.r = r;
  S.view = story(r, { scenario: S.scenario, mode: S.mode });
  const v = S.view;
  const last = v.steps.reduce((k, s, i) => (s.ready ? i : k), 0);
  shell.setReached(STEP_IDS[last]);
  // A live run moves on as the agent does, unless the presenter looks back at an earlier step.
  if (S.mode === "live" && S.follow && S.step < r.reached) { shell.go(STEP_IDS[r.reached], "play"); return; }
  if (!v.steps[S.step].ready) S.step = last;
  if (r.decision && clock.running()) clock.stop();
  shell.setKpi("Detection → decision", { note: clock.running() ? "running since the lead" : r.decision ? "stopped at your decision" : "starts with the lead", tone: r.decision && !clock.running() ? "decided" : "" });
  const train = S.scenario.train_id;
  const t = model.trains.get(train);
  $("stage-title").textContent = t ? `${t.number} to ${t.to}` : S.scenario.title;
  renderStory(r, v, S.step, { scenario: S.scenario, model, mode: S.mode, handlers: { decide, decideDraft } });
  diagram.render({ ...diagramAt(r, model, train, S.step), ai: S.mode === "live" && !r.end && S.step === r.reached ? liveDoing(r) : aiLine(r, S.step) });
  const est = S.estimates.get(S.scenario.id);
  renderKpis(keyFigures(r, { mode: S.mode, estimate: est ? est.cost.eur : null, model: MODEL.label }), shell.setKpi);
  const waiting = v.steps.findIndex((s) => s.waits);
  shell.setWaits(waiting >= 0 ? STEP_IDS[waiting] : null);
  drawPlay();
  shell.setMove(moveFor());
  if (P.on) shell.setMoveNote(countdown());
}

// ---- Play: the steps go by themselves and stop where a person acts ----------------------------------------

/** The story is over: the last step shown, the run ended, nothing left for a person to do. */
const finished = () => !!S.view && S.mode !== "live" && S.step === STEP_IDS.length - 1 && !!S.r?.end && !S.view.steps[S.step].waits;
/** A dialog or the scenario menu covers the page: Play holds its time until it closes. */
const covered = () => !!document.querySelector("dialog[open]") || shell.menuOpen();

function play() {
  if (S.mode === "live" || S.busy) return;
  if (finished()) { openCase(S.scenario, { play: true }); return; }
  S.started = true;
  S.played = true;
  P.on = true;
  P.last = 0;
  if (!P.raf) P.raf = requestAnimationFrame(frame);
  draw();
}

function pause() {
  if (!P.on) return;
  P.on = false;
  cancelAnimationFrame(P.raf);
  P.raf = 0;
  if (S.view) shell.setFill(STEP_IDS[S.step], 0);
  draw();
  nudge();
}

/** Paused on a step, Next draws the eye after six seconds without a click, a key or a scroll. */
let idle = 0;
function nudge() {
  clearTimeout(idle);
  idle = setTimeout(() => {
    const next = document.querySelector("#move-actions #next");
    if (next && !P.on && S.mode !== "live" && !covered()) next.classList.add("vc-attention");
  }, 6000);
}

function frame(now) {
  P.raf = 0;
  if (!P.on) return;
  // Time away from the tab, or a slow frame, does not count.
  const dt = P.last ? Math.min(now - P.last, 100) : 0;
  P.last = now;
  if (S.view && !S.busy) {
    if (P.step !== S.step) { P.step = S.step; P.at = 0; }
    const st = S.view.steps[S.step];
    const next = S.view.steps[S.step + 1];
    // Once the person has done the last step's action, Play ends at once and offers Replay.
    if (!next && S.r?.end && !st.waits) { pause(); return; }
    if (st.waits) P.at = 0; // the person's turn: once they have acted, the step's new words get their time
    else if (!covered()) {
      P.at = Math.min(P.at + dt, st.read);
      if (P.at >= st.read) {
        if (next?.ready) { go(S.step + 1, { keep: true }); P.raf = requestAnimationFrame(frame); return; }
        if (!next && S.r?.end) { pause(); return; }
      }
    }
    const read = st.waits ? 0 : P.at / st.read;
    shell.setFill(STEP_IDS[S.step], read);
    document.querySelector("#move-actions #next")?.style.setProperty("--fill", read.toFixed(4));
  }
  P.raf = requestAnimationFrame(frame);
}

/** When Play moves on, in words: "Check in 7 s." */
function countdown() {
  const st = S.view?.steps[S.step];
  const next = S.view?.steps[S.step + 1];
  if (!st || st.waits || !next) return "";
  return `${next.label} in ${Math.max(1, Math.ceil((st.read - P.at) / 1000))} s.`;
}

/** Play, Pause or Replay; a live run follows the agent, so Play steps aside. */
function drawPlay() {
  const b = $("play");
  b.hidden = S.mode === "live";
  b.disabled = S.busy;
  const state = P.on ? "pause" : finished() ? "replay" : "play";
  if (b.dataset.state === state) return;
  b.dataset.state = state;
  b.querySelector(".vc-icon").className = `vc-icon vc-icon--${state === "pause" ? "pause" : state === "replay" ? "refresh" : "play"}`;
  $("play-text").textContent = state === "pause" ? "Pause" : state === "replay" ? "Replay" : "Play";
}

// ---- the bar right under the story: what happens next, and whose turn it is ------------------------------

function moveFor() {
  if (S.mode === "live") return liveMove();
  if (S.busy || !S.view) return { tone: "working", lead: "Loading.", text: `${S.scenario?.title || "The scenario"}: the agent's run is being played.`, actions: [] };
  const v = S.view;
  const at = S.step;
  const st = v.steps[at];
  const next = v.steps[at + 1];
  if (!S.started) return { tone: "working", lead: "Ready.", text: "The story plays when you close the guide.", actions: [] };
  if (st.waits) return turnMove(st);
  if (finished() || (!next && S.r.end)) return done();
  // Playing: the bar says when the page moves on, and Next's foot fills as the step is read.
  if (P.on && next) return { tone: "working", lead: "Playing.", text: next.next, note: countdown(), actions: [{ id: "next", label: `Next: ${next.label}`, icon: "chevron-right", kind: "secondary", onClick: () => go(at + 1, { keep: true }) }] };
  // A first screen that waits for the person to start (a link to a step): Play starts from here.
  if (!S.played && next?.ready) return { tone: "move", lead: "Your turn.", text: "Play walks the story from here and stops where you decide.", actions: [{ id: "play-here", label: "Play", icon: "play", attention: true, onClick: play }] };
  if (next && !next.ready) return { tone: "working", lead: "The agent is drafting.", text: "The drafts follow your decision in a moment.", actions: [] };
  if (!next) return done();
  return { tone: "move", lead: "Your turn.", text: `Next: ${next.label}. ${next.next}`, actions: [{ id: "next", label: `Next: ${next.label}`, icon: "chevron-right", onClick: () => go(at + 1, { keep: P.on }) }] };
}

/** Where the page waits for a person: the decision, or the drafts. */
function turnMove(st) {
  const a = st.turn?.action;
  if (!a) return { tone: "decide", lead: "Your turn.", text: st.turn?.text || "", actions: [] };
  const onClick = a.id === "approve" ? () => decide(a.option, "approved") : approveAll;
  return { tone: "decide", lead: "Your turn.", text: st.turn.text, actions: [{ id: a.id, label: a.label, icon: "check", attention: true, onClick }] };
}

function done() {
  const elapsed = S.r?.decision ? clockText() : null;
  return {
    tone: "done", lead: "Done.",
    text: `${elapsed ? `From the lead to your decision in ${elapsed}. ` : ""}Nothing was published. Replay it, or try another scenario.`,
    actions: [
      { id: "again", label: "Replay", icon: "refresh", kind: "secondary", onClick: () => openCase(S.scenario, { play: true }) },
      { id: "cases", label: "Another scenario", icon: "chevron-down", kind: "ghost", onClick: () => shell.openCases() }
    ]
  };
}
const clockText = () => $("story") && document.querySelector('[data-vc-kpi="Detection → decision"] .kpi-value')?.textContent;

// ---- decisions ------------------------------------------------------------------------------------------

function decide(optionId, decision) {
  const r = S.r;
  if (!r?.options || r.decision || r.end) return;
  if (S.mode === "live" && !agent.isActive()) return;
  const opt = r.options.options.find((o) => o.id === optionId);
  bus.emit("option_decision", { options_seq: r.options.options_seq, option_id: optionId, option_label: opt ? opt.title : "Do nothing", decision, by: "user" });
  if (decision === "approved") clock.stop();
  shell.announce(decision === "rejected" ? `You rejected option ${opt?.letter}.` : optionId === "baseline" ? "You accepted the risk." : `You approved option ${opt?.letter}. The agent drafts what it needs.`);
}

function decideDraft(id, decision) {
  const d = S.r?.drafts.find((x) => x.action_id === id);
  if (!d || d.status !== "pending") return;
  bus.emit("action_decision", { action_id: id, decision, by: "user" });
}

function approveAll() {
  for (const d of S.r?.drafts || []) if (d.status === "pending") decideDraft(d.action_id, "approved");
  shell.announce("You approved every draft. Nothing was published.");
}

// ---- a live run on the visitor's key ----------------------------------------------------------------------

function startLive() {
  if (agent.isActive()) return;
  pause();
  stopRun();
  const scenario = S.scenario;
  S.mode = "live";
  S.events = [];
  S.r = null;
  S.view = null;
  S.follow = true;
  S.step = 0;
  S.started = true;
  S.runId = newRunId();
  S.stopListening = bus.onAny((ev) => { if (ev.run_id === S.runId) { S.events.push(ev); schedule(); } });
  bus.beginRun({ run_id: S.runId, mode: "live" });
  bus.emit("run_start", { run_id: S.runId, mode: "live", entry: "scenario", scenario_id: scenario.id, title: scenario.title, seed: scenario.seed, model: MODEL.id, model_label: MODEL.label });
  shell.setMode("live");
  clock.reset();
  clock.start();
  shell.go(STEP_IDS[0], "code");
  shell.announce("The live run started. You are interacting with an AI system.");
  agent.run({ entry: "scenario", scenario, modelId: MODEL.id });
}

/** What Claude is doing now, for the translator's card: the call in flight, else the step. */
function liveDoing(r) {
  const busy = [...r.calls].reverse().find((c) => !c.done);
  const DOING = { sim_sync: "Calculating who would act on it", phys_observe: "Reading the sensors", kfp_get_published: "Reading what passengers are told", ops_get_passengers: "Counting today's passengers", ops_get_timetable: "Reading the operational timetable", ops_list_changes: "Reading the operations log", ops_find_alternatives: "Looking for other connections", ops_get_overview: "Reading every train in the window" };
  return (busy && DOING[busy.name]) || capital(STEPS[r.reached].doing);
}

function liveMove() {
  const r = S.r;
  const v = S.view;
  const back = { id: "back", label: "Back to the simulation", icon: "refresh", kind: "secondary", onClick: () => openCase(S.scenario, { play: true }) };
  const stop = { id: "stop", label: "Stop the live run", icon: "stop", kind: "danger", onClick: () => agent.abort("You stopped the live run.") };
  if (!r || !v) return { tone: "working", lead: "Claude is starting.", text: "It reads the lead first. You are interacting with an AI system.", actions: [stop] };
  if (r.end) {
    const ok = r.end.status === "done" || r.end.status === "no_findings";
    return { tone: "done", lead: ok ? "Done." : "The live run stopped.", text: ok ? "Nothing was published." : `${r.end.reason || "It ended early."} Start agent runs it again.`, actions: [back] };
  }
  const waiting = v.steps.findIndex((s) => s.waits);
  if (waiting >= 0 && waiting === S.step) return turnMove(v.steps[waiting]);
  if (waiting >= 0) return { tone: "decide", lead: "Your turn.", text: `Claude waits for your ${waiting === 3 ? "decision" : "approval"} in step ${waiting + 1}.`, actions: [{ id: "go", label: `Go to step ${waiting + 1}`, icon: "chevron-right", attention: true, onClick: () => go(waiting) }] };
  const now = STEPS[r.reached];
  return { tone: "working", lead: "Claude is working.", text: `Step ${r.reached + 1}, ${now.label}: ${now.doing}. You are interacting with an AI system.`, actions: now.index === S.step ? [stop] : [{ id: "go", label: `Go to step ${r.reached + 1}`, icon: "chevron-right", kind: "secondary", onClick: () => go(r.reached) }, stop] };
}

// ---- the guide's figures ----------------------------------------------------------------------------------

/** Writes the default scenario's figures into the guide, which tells its story. */
function fillGuide(est) {
  const r = digest(est.events);
  const figs = guideFigures(r, { model, scenario: defaultScenario(), estimate: est.cost.eur });
  const minutes = [...guide.querySelectorAll(".vc-guide__path .vc-guide__time")].map((t) => parseFloat(t.textContent));
  figs["decision-min"] = `${minutes.slice(0, 4).reduce((a, b) => a + b, 0)} min`;
  figs.model = MODEL.label;
  for (const el of document.querySelectorAll("#guide [data-fig], .start-card [data-fig='model']")) {
    if (figs[el.dataset.fig] !== undefined && figs[el.dataset.fig] !== "") el.textContent = figs[el.dataset.fig];
  }
}

// ---- go ---------------------------------------------------------------------------------------------

start().catch((err) => {
  console.error("[Timetable Translator] start-up failed:", err);
  $("boot").dataset.state = "failed";
  $("boot-status").textContent = "The Timetable Translator could not start.";
  $("boot-detail").textContent = String(err?.message || err);
  $("boot-detail").hidden = false;
});
