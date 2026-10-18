// Header KPI strip: passengers at risk (who would act on wrong information if nothing is done), the
// first affected moment, detection → decision stopwatch, session cost. After a decision the first two
// tiles show what is left with the approved option, so the payoff of the decision is visible at a
// glance.

import { bus } from "./events.js";
import { h } from "./dom.js";
import { eurCents, clock, int } from "./format.js";
import { STORAGE, UI } from "./config.js";

// What the stopwatch is waiting on while it runs.
const WATCH_STATE = {
  scanning: "reading the operations log",
  diagnosing: "comparing the timetables",
  verifying: "checking the physical layer",
  simulating: "running the sync engine",
  options: "options ready",
  awaiting_approval: "waiting for your decision",
  executing: "drafting actions"
};

export function createKpis(container) {
  const make = (id, label, sub) => {
    const value = h("div", { class: "kpi-value", id: `kpi-${id}-value` }, "—");
    const subEl = h("div", { class: "kpi-sub", id: `kpi-${id}-sub` }, sub);
    const el = h("div", { class: "kpi", dataset: { tone: "muted" }, role: "group", "aria-label": label },
      h("div", { class: "kpi-label" }, label), value, subEl);
    container.appendChild(el);
    return { el, value, sub: subEl };
  };

  const atRisk = make("pax", "Passengers at risk", "acting on wrong information");
  const first = make("first", "First affected in", "no run yet");
  const watch = make("watch", "Detection → decision", "starts with the run");
  const cost = make("cost", "Session cost", "no model calls yet");

  let sessionBase = readSessionCost();
  let runCost = 0;
  let lastRunCost = null;
  let mode = null;
  let running = false;
  let timer = null;
  let t0 = 0;
  let frozenAt = null;
  let lastPax = null;
  let lastLabel = "";

  const set = (tile, text, tone, sub) => {
    if (tile.value.textContent !== text) {
      tile.value.textContent = text;
      tile.value.classList.remove("flip");
      void tile.value.offsetWidth;
      tile.value.classList.add("flip");
    }
    if (tone !== undefined) tile.el.dataset.tone = tone;
    if (sub !== undefined) {
      tile.sub.textContent = sub;
      tile.sub.title = sub; // full text on hover when the tile truncates it
    }
  };

  const renderCost = () => {
    if (mode === "simulation") {
      set(cost, "€0.00", "muted", "simulated: no model calls");
      return;
    }
    const total = sessionBase + runCost;
    let sub;
    if (mode === "live" && running) sub = `this run ${eurCents(runCost)}`;
    else if (lastRunCost !== null) sub = `last run ${eurCents(lastRunCost)}`;
    else sub = total > 0 ? "earlier live runs in this tab" : "no model calls yet";
    set(cost, eurCents(total), total > 0 ? "" : "muted", sub);
  };

  function startWatch() {
    stopWatch();
    t0 = performance.now();
    frozenAt = null;
    set(watch, "00:00", "", "running");
    timer = setInterval(() => {
      watch.value.textContent = clock(performance.now() - t0);
    }, 250);
  }

  function stopWatch(sub) {
    if (timer) clearInterval(timer);
    timer = null;
    if (sub && frozenAt === null) {
      frozenAt = performance.now() - t0;
      watch.value.textContent = clock(frozenAt);
      watch.sub.textContent = sub;
    }
  }

  bus.on("run_start", (ev) => {
    mode = ev.payload.mode;
    running = true;
    runCost = 0;
    lastPax = null;
    set(atRisk, "—", "muted", "counting once the trains are known");
    set(first, "—", "muted", "calculating");
    startWatch();
    renderCost();
  });

  bus.on("state_change", (ev) => {
    const label = WATCH_STATE[ev.payload.state];
    if (timer && frozenAt === null && label) watch.sub.textContent = label;
  });

  bus.on("kpi_update", (ev) => {
    const p = ev.payload;
    if (p.decided) return showDecision(p);
    if (typeof p.pax_at_risk === "number") {
      lastPax = p.pax_at_risk;
      // A what-if is shown as an assumption, never in the alarm colour of a verified finding, and a
      // first estimate is not yet a result: 0 there is not "resolved", so it is not green.
      const estimate = p.stage === "estimate";
      const tone = p.basis === "what_if" ? "at-risk" : p.pax_at_risk > 0 ? (estimate ? "at-risk" : "affected") : estimate ? "muted" : "resolved";
      set(atRisk, int(p.pax_at_risk), tone, `of ${int(p.affected_pax || 0)} relying on it${p.label ? `, ${p.label}` : ""}`);
      atRisk.sub.title = `${int(p.pax_at_risk)} passengers are expected to act on wrong information within ${p.horizon_min || 180} minutes if nothing is done (${int(p.affected_pax || 0)} rely on a wrong fact; each passenger counted once per stop); ${p.label || "engine result"}`;
    }
    if ("first_event_min" in p) {
      // The tile names whose moment and where, as briefly as the sister apps' "Leipzig, Mon 19 Oct":
      // "ICE 618, Köln Hbf 07:42".
      lastLabel = p.first_event_label || p.first_event_short || "";
      if (p.first_event_min === null) {
        set(first, "None", p.stage === "estimate" ? "muted" : "resolved", `no one affected within ${p.horizon_min || 180} min`);
      } else {
        set(first, minutes(p.first_event_min), p.first_event_min <= UI.urgentMinutes ? "affected" : "at-risk", lastLabel);
      }
    }
  });

  /** After the human decision: who is still misinformed with the approved option, compared with before. */
  function showDecision(p) {
    const before = typeof p.before_pax === "number" ? p.before_pax : lastPax;
    if (p.accepted) {
      atRisk.sub.textContent = "risk accepted, nothing published";
      first.sub.textContent = `${first.sub.textContent.replace(/, risk accepted$/, "")}, risk accepted`;
      return;
    }
    if (typeof p.residual_pax === "number") {
      set(atRisk, int(p.residual_pax), p.residual_pax > 0 ? "at-risk" : "resolved",
        `left with ${p.option_label}${typeof before === "number" ? ` (was ${int(before)})` : ""}`);
    }
    if ("correct_from_min" in p) {
      // Short enough for the tile at 1280 px; the tooltip has the full sentence.
      const parts = [];
      const long = [];
      if (p.correct_from_min !== null && p.correct_from_min !== undefined) {
        parts.push(`info +${fmtMin(p.correct_from_min)}`);
        long.push(`right information from +${fmtMin(p.correct_from_min)}`);
      }
      const synced = p.sync_min !== null && p.sync_min !== undefined;
      parts.push(synced ? `in sync after ${fmtMin(p.sync_min)}` : "data not in sync");
      long.push(synced ? `in sync after ${fmtMin(p.sync_min)}` : "data not back in sync");
      first.sub.textContent = parts.join(", ");
      first.sub.title = `${lastLabel ? `${lastLabel}: ` : ""}${long.join(", ")} with ${p.option_label}`;
      first.el.dataset.tone = p.sync_min === null || p.sync_min === undefined ? "at-risk" : "resolved";
    }
  }

  bus.on("option_decision", (ev) => {
    if (ev.payload.decision === "approved") stopWatch("to the approved decision");
  });

  bus.on("report", () => stopWatch("to the management summary"));

  bus.on("cost_update", (ev) => {
    if (ev.payload.simulated) return;
    runCost = Number(ev.payload.eur) || 0;
    renderCost();
  });

  bus.on("run_end", (ev) => {
    const status = ev.payload.status;
    running = false;
    stopWatch(status === "done" || status === "no_findings" ? "run complete" : status === "aborted" ? "stopped (aborted)" : "stopped");
    if (mode === "live") {
      sessionBase += runCost;
      lastRunCost = runCost;
      runCost = 0;
      writeSessionCost(sessionBase);
    }
    renderCost();
  });

  function reset() {
    stopWatch();
    mode = null;
    running = false;
    runCost = 0;
    frozenAt = null;
    lastPax = null;
    set(atRisk, "—", "muted", "acting on wrong information");
    set(first, "—", "muted", "no run yet");
    set(watch, "00:00", "muted", "starts with the run");
    renderCost();
  }

  /** Adds a cost outside a run (kept for the shared shell; this app has no paid probe). */
  function addSessionCost(eur) {
    sessionBase += Number(eur) || 0;
    writeSessionCost(sessionBase);
    renderCost();
  }

  reset();
  return { reset, addSessionCost };
}

function minutes(n) {
  return `${int(n)} min`;
}

function fmtMin(x) {
  return `${Math.round(Number(x) * 10) / 10} min`;
}

function readSessionCost() {
  try { return Number(sessionStorage.getItem(STORAGE.sessionCost)) || 0; } catch { return 0; }
}

function writeSessionCost(v) {
  try { sessionStorage.setItem(STORAGE.sessionCost, String(v)); } catch { /* ignore */ }
}
