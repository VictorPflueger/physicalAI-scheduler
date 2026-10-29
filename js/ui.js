// UI orchestrator: builds the components, wires controls and dialogs, starts run producers and
// translates run events into drawer and state changes (the timetable mirror follows the run events
// itself). The UI never branches on which producer is running; only the mode badge reads the mode.

import { bus, newRunId } from "./events.js";
import { getState, setState, subscribe, isRunning, isFinished } from "./state.js";
import { createMirror } from "./mirror.js";
import { createConsole } from "./console.js";
import { createKpis } from "./kpi.js";
import { createDrawer } from "./drawer.js";
import { createOptionsPanel } from "./options_panel.js";
import { createOutbox } from "./outbox.js";
import { createAuditPanel } from "./audit_panel.js";
import { resetAudit } from "./audit.js";
import { createControls } from "./controls.js";
import { chooseMode, askApiKey, askCustomScenario, showReport } from "./dialogs.js";
import { openDiagnostics } from "./diagnostics_view.js";
import { openIntro, introSeen } from "./intro.js";
import { createSimulationPlayer } from "./simulation.js";
import { createLiveAgent } from "./agent.js";
import { hasKey, forgetKey } from "./keystore.js";
import { MODELS } from "./config.js";
import { h, withTooltip } from "./dom.js";
import { icon } from "./icons.js";
import { dateWithYear } from "./format.js";

const modelLabel = (id) => MODELS.find((m) => m.id === id)?.label || id || null;

export function initUI() {
  const scenarios = window.SCENARIOS || [];
  const byId = (id) => scenarios.find((s) => s.id === id);
  setState({ keyPresent: hasKey() });

  // ---- components ------------------------------------------------------------------------------
  const badge = document.getElementById("mode-badge");
  const mirror = createMirror(document.getElementById("mirror"), { scenarios, initialScenario: getState().scenarioId });
  // Choosing a scenario: from the menu, or from the list in the console.
  const selectScenario = (id) => {
    setState({ scenarioId: id, entry: "scenario" });
    if (!isRunning(getState())) mirror.focusScenario(id);
  };
  const consoleUI = createConsole(document.getElementById("console"), {
    scenarios,
    onPickScenario: (id) => selectScenario(id),
    // After a run: another scenario, straight into the run flow (the mode dialog asks first).
    onRunScenario: (id) => {
      if (isRunning(getState())) return;
      selectScenario(id);
      start("scenario");
    },
    onOpenOptions: () => drawer.show("options"),
    onOpenOutbox: () => drawer.show("outbox"),
    onOpenReport: (md) => showReport(md, { mode: getState().mode, simSource: getState().simSource }),
    onSaveSimulation: () => {
      const r = auditPanel.saveSimulation();
      showBanner({ level: r.ok ? "info" : "warn", title: r.ok ? "Run saved as simulation" : "Could not save the run", text: r.message, timeout: r.ok ? 9000 : 0 });
    }
  });
  const kpis = createKpis(document.getElementById("kpis"));
  const drawer = createDrawer(document.getElementById("drawer"), {
    onToggle: () => setTimeout(() => mirror.invalidate(), 260)
  });
  const optionsPanel = createOptionsPanel(drawer.panel("options"), {
    onDecision: (d) => {
      if (!isRunning(getState())) return notice("warn", "This run has ended. Start a new run to take a decision.");
      bus.emit("option_decision", { ...d, by: "user" });
    },
    onCount: (n, attention) => drawer.setCount("options", n, attention)
  });
  const outbox = createOutbox(drawer.panel("outbox"), {
    onDecision: (d) => {
      if (!isRunning(getState())) return notice("warn", "This run has ended. Start a new run to approve drafts.");
      bus.emit("action_decision", { ...d, by: "user" });
    },
    onCount: (n, attention) => drawer.setCount("outbox", n, attention)
  });
  const auditPanel = createAuditPanel(drawer.panel("audit"), { onCount: (n) => drawer.setCount("audit", n) });
  const player = createSimulationPlayer({ getSpeed: () => getState().speed });
  const agent = createLiveAgent({
    onKeyRejected: () => {
      forgetKey();
      setState({ keyPresent: false });
    }
  });

  const controls = createControls(document.getElementById("controls"), scenarios, {
    onStart: () => start(getState().entry === "custom" ? "custom" : "scenario"),
    onLiveScan: () => start("scan"),
    onSelectScenario: (id) => selectScenario(id),
    onSelectCustom: async () => {
      const text = await askCustomScenario(getState().customText);
      if (text) setState({ entry: "custom", customText: text });
    },
    onSelectModel: (id) => setState({ model: id }),
    onSpeed: (n) => setState({ speed: n }),
    onAbort: () => abort("Stopped by the user."),
    onReset: () => resetWorkspace(),
    onDiagnostics: () => openDiagnostics()
  });

  // ---- intro window: "How it works" in the header, and once by itself on a first visit -----------
  const aboutBtn = h("button", {
    class: "vc-button vc-button--secondary about-btn", type: "button", id: "btn-about",
    title: "What the Timetable Translator does, how it works and why it pays off"
  }, icon("info", 18), h("span", { class: "btn-text" }, "How it works"));
  aboutBtn.addEventListener("click", () => showIntro());
  // Beside the mode badge, so the badges need two rows at most next to the KPI tiles; on small
  // laptops it keeps only its icon, and its tooltip names it.
  badge.after(withTooltip(aboutBtn, "How it works", { below: true }));

  function showIntro() {
    const s = getState();
    // During a run the window only explains; it never starts or interrupts anything.
    if (isRunning(s)) return openIntro({});
    return openIntro({
      startLabel: isFinished(s) ? "New run" : "Start agent",
      onStart: () => start(getState().entry === "custom" ? "custom" : "scenario")
    });
  }

  // ---- state → view ----------------------------------------------------------------------------
  const render = (s) => {
    const sc = byId(s.scenarioId);
    controls.update(s, { scenarioLabel: sc?.short || "Choose", scenarioNumber: sc?.number ?? null, scenarioCount: scenarios.length });
    consoleUI.setScenario(s.entry === "scenario" ? s.scenarioId : null);
    badge.dataset.mode = s.mode || "none";
    // A Vici tag: LIVE solid merlot with a pulsing hexagon, SIMULATION on its neutral tape.
    badge.className = s.mode === "live" ? "vc-tag vc-tag--solid mode-badge" : "vc-tag mode-badge";
    badge.replaceChildren(...(s.mode === "live"
      ? [h("span", { class: "mode-dot", "aria-hidden": "true" }), "LIVE"]
      : s.mode === "simulation" ? ["SIMULATION"] : ["No run active"]));
    badge.title = s.mode === "live" ? "Live agent: real model calls on your API key"
      : s.mode === "simulation" ? "Simulation: scripted replay, not live data" : "Choose a mode with Start agent";
  };
  subscribe(render);
  render(getState());

  // ---- run events → UI effects --------------------------------------------------------------------
  bus.on("state_change", (ev) => setState({ runState: ev.payload.state }));
  bus.on("run_end", (ev) => {
    const st = ev.payload.status;
    setState({ runState: st === "done" || st === "no_findings" ? "done" : st === "incomplete" ? "stopped" : st });
  });
  bus.on("options", () => drawer.show("options"));
  bus.on("action_draft", () => drawer.show("outbox"));

  // ---- run control ---------------------------------------------------------------------------------
  async function start(entry) {
    const s = getState();
    if (isRunning(s)) return;
    // A finished run stays on screen until the next run really begins: cancelling the mode or key
    // dialog must not wipe a console, outbox or audit trail that may not be exported yet.

    const scenario = byId(getState().scenarioId);
    const runLabel = entry === "scan" ? "Live sweep: every train in the window checked against the source, no injected scenario"
      : entry === "custom" ? `Custom what-if: ${getState().customText}`
        : `Scenario ${scenario?.number} of ${scenarios.length}: ${scenario?.title}`;

    let mode = "live";
    if (entry !== "scan") {
      mode = await chooseMode({
        runLabel,
        simBlocked: entry === "custom" ? "Custom what-ifs need the live agent: free text has no scripted replay." : null
      });
      if (!mode) return;
    }
    if (mode === "key") {
      // "Change or forget key": the key dialog shows the stored key masked, with Forget key.
      const ok = await askApiKey({});
      setState({ keyPresent: hasKey() });
      if (!ok) return;
      mode = "live";
    }
    if (mode === "live" && !hasKey()) {
      const ok = await askApiKey({});
      setState({ keyPresent: hasKey() });
      if (!ok) return;
    }
    begin(mode, entry, scenario);
  }

  function begin(mode, entry, scenario) {
    const s = getState();
    const run_id = newRunId();
    const model = MODELS.find((m) => m.id === s.model) || MODELS[0];
    resetWorkspace({ keepMode: true, silent: true });
    setState({ mode, runState: "scanning", runId: run_id });
    bus.beginRun({ run_id, mode });
    const title = entry === "scan" ? "Live sweep: customer information against the source" : entry === "custom" ? "Custom what-if" : `Scenario ${scenario.number}: ${scenario.title}`;
    const def = mode === "simulation" ? window.SIM_RUNS?.[scenario?.id] : null;
    const recorded = def?.source === "recorded";
    setState({ simSource: mode === "simulation" ? (recorded ? "recorded" : "authored") : null });
    bus.emit("run_start", {
      run_id, mode, entry, title,
      scenario_id: entry === "scenario" ? scenario.id : null,
      seed: entry === "scenario" ? scenario.seed : entry === "custom" ? s.customText : null,
      model: mode === "live" ? model.id : null,
      model_label: mode === "live" ? model.label : null,
      ...(mode === "simulation" ? {
        sim_source: recorded ? "recorded" : "authored",
        ...(recorded ? { recorded_on: def.recorded?.at ? dateWithYear(def.recorded.at) : null, recorded_model: modelLabel(def.recorded?.model) } : {})
      } : {})
    });

    if (mode === "simulation") {
      if (!def) {
        bus.emit("notice", { level: "error", text: `No simulation script found for “${scenario?.title}”. Check that data/sim_runs.js is complete, or run Diagnostics.` });
        bus.emit("run_end", { status: "error", reason: "No simulation script for this scenario." });
        return;
      }
      player.play(def, { scenario: scenario.id });
      return;
    }

    agent.run({ entry, scenario, customText: s.customText, modelId: model.id });
  }

  function abort(reason) {
    if (player.isActive()) player.abort(reason);
    if (agent.isActive()) agent.abort(reason);
  }

  function resetWorkspace({ keepMode = false, silent = false } = {}) {
    if (player.isActive()) player.abort("Reset by the user.");
    if (agent.isActive()) agent.abort("Reset by the user.");
    bus.endRun();
    consoleUI.reset();
    mirror.reset();
    if (!silent) mirror.focusScenario(getState().scenarioId);
    kpis.reset();
    optionsPanel.reset();
    outbox.reset();
    resetAudit();
    auditPanel.refresh();
    drawer.setOpen(false);
    setState({ runState: "idle", runId: null, ...(keepMode ? {} : { mode: null }) });
  }

  function notice(level, text) {
    showBanner({ level, title: level === "warn" ? "Heads-up" : "Note", text, timeout: 6000 });
  }

  /** Opens the intro once per browser: called by main.js after the boot screen is gone. */
  function introOnFirstVisit() {
    if (!introSeen() && !document.querySelector("dialog[open]")) showIntro();
  }

  return { mirror, start, resetWorkspace, showIntro, introOnFirstVisit };
}

/** Transient banner under the header (also used for file:// and library warnings). */
export function showBanner({ level = "info", title = "", text = "", timeout = 0 } = {}) {
  const stack = document.getElementById("banners");
  if (!stack) return null;
  // A Vici alert in the tone of its level, with its icon and a dismiss button that names itself.
  const close = h("button", { class: "vc-icon-button", type: "button" }, icon("x", 18));
  const tone = level === "error" ? "vc-alert--danger" : level === "warn" ? "vc-alert--warning" : "";
  const el = h("div", { class: ["vc-alert", tone, "banner"], dataset: { level }, role: level === "error" ? "alert" : "status" },
    icon(level === "info" ? "info" : "alert", 22),
    h("div", { class: "vc-alert__body banner-text" }, title ? h("p", { class: "vc-alert__title" }, title) : null, h("p", {}, text)),
    withTooltip(close, "Dismiss", { below: true }));
  close.addEventListener("click", () => el.remove());
  stack.appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}
