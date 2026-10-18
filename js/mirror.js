// The timetable mirror, the Timetable Translator's centrepiece (where the Navigator has its map and
// Rebate Hunter its board). Two views:
//   train view    one train: the corridor strip (its route today and as published) over the mirror
//                 card, the source timetable (Betriebsfahrplan) beside what one customer channel
//                 publishes (Kundenfahrplan), with the translation between them as lines;
//   sync monitor  every train in the window with its source version, the channels behind it and what
//                 the agent's check found.
// The mirror listens to the run events itself: it focuses the train the agent works on, pulses what a
// lookup reads (the source column, a channel, the station of a sensor reading), badges what a result
// confirmed, colours the contradictions of the agent's sim_sync results (red, or violet for a
// what-if), follows what alerts and marks (ui_mark_mirror) say, and turns the contradictions an
// approved option re-publishes green (amber where it only informs, or where the risk is accepted).
// Both producers emit the same events, so a simulated and a live run look the same. Every figure
// comes from js/mirror_data.js (world model and engine).

import { bus } from "./events.js";
import { getModel, findTrain, findPoint, minuteLabel } from "./world.js";
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { sourceRows, channelRows, channelStates, stripData, monitorTrains } from "./mirror_data.js";
import { createCard, worstState } from "./mirror_card.js";
import { createStrip } from "./mirror_strip.js";
import { createMonitor } from "./mirror_monitor.js";
import { createPopover } from "./pop.js";
import { sourceRowPopover, customerRowPopover, stationPopover } from "./popovers.js";

const STATES = new Set(["affected", "at_risk", "resolved", "neutral"]);
const CHECK_KIND = { ops_get_timetable: "source", ops_list_changes: "operations", kfp_get_published: "published", phys_observe: "physical", ops_get_passengers: "passengers" };
const TRAIN_TOOLS = ["ops_get_timetable", "kfp_get_published", "ops_get_passengers", "phys_observe", "ops_list_changes"];

/** The caption's chip for the engine result of the train in focus: its basis, or the stage the KPI update names. */
export const BASIS_CHIP = {
  estimate: ["First estimate", "ai"],
  verified: ["Verified against the source", "info"],
  what_if: ["What-if, not the source", "ai"],
  partial: ["Partial scope", "risk"]
};
function basisKeyOf(basis, stage) {
  if (basis === "what_if") return "what_if";
  if (basis === "partial") return "partial";
  return stage === "estimate" ? "estimate" : "verified";
}

/** The trains a tool call is about (the mirror focuses and pulses them). Exported for the tests. */
export function callTrains(model, name, input = {}) {
  const one = (ref) => (ref ? findTrain(model, ref)?.id || null : null);
  if (name === "sim_sync") return [...new Set((Array.isArray(input.train_ids) ? input.train_ids : []).map(one).filter(Boolean))];
  if (TRAIN_TOOLS.includes(name)) return [one(input.train)].filter(Boolean);
  return [];
}

/** The stations a tool call is about (the strip pulses them). */
export function callPoints(model, name, input = {}) {
  const one = (ref) => (ref ? findPoint(model, ref)?.id || null : null);
  if (name === "phys_observe" || name === "ops_list_changes") return [one(input.point)].filter(Boolean);
  if (name === "ops_find_alternatives") return [one(input.from), one(input.to)].filter(Boolean);
  return [];
}

/** What a successful lookup confirmed: [{ train, kind }] and the stations the physical layer was read at. */
export function resultChecks(model, name, r) {
  const kind = CHECK_KIND[name];
  if (!kind || !r || r.error || r.ok === false) return { checks: [], points: [] };
  let trains = [];
  let points = [];
  if (name === "ops_list_changes") trains = (r.changes || []).flatMap((c) => c.train_ids || []);
  else if (name === "phys_observe") {
    if (!(r.observations || []).length) return { checks: [], points: [] };
    trains = [r.train_id, ...(r.observations || []).flatMap((o) => o.train_ids || [])];
    points = [r.point, ...(r.observations || []).map((o) => findPoint(model, o.station)?.id)];
  } else trains = [r.train_id];
  const ids = [...new Set(trains.filter((id) => id && model.trains.has(id)))];
  return { checks: ids.map((train) => ({ train, kind })), points: [...new Set(points.filter(Boolean))] };
}

/** The contradictions of one train in an engine result (compact form: ids "T-618/KK/platform"). */
export function contradictionsOf(result, trainId) {
  return (result?.contradictions || []).filter((c) => String(c.id).startsWith(`${trainId}/`));
}

export function createMirror(container, { scenarios = [], initialScenario = null } = {}) {
  const model = getModel();
  const st = {
    view: "train",
    focus: null,
    channel: "planner",
    channelNow: "planner",        // the channel the right column shows now
    channelPicked: false,         // the presenter chose the channel for this train
    entry: null,
    running: false,
    marks: new Map(),             // "train:T-618" | "point:KK" | "cx:T-618/KK/platform" → state
    calls: new Map(),             // call_id → { name, trains, points, channel }
    checks: new Map(),            // train → Map(kind → Set(call_id))
    observed: new Map(),          // point → Set(call_id): the physical layer was read there
    results: new Map(),           // train → { result, basisKey }  (the agent's latest sim_sync for it)
    lastResultTrains: [],
    pendingBasis: null,
    options: null,
    decisions: new Map(),         // train → { label, state }  (an approved option, or the accepted risk)
    flagged: null,
    checkedTrains: new Set(),
    focusCard: false,             // move the focus into the card once the train is drawn
    bodyH: null,                  // the card body's height when last drawn
    showPasses: null,             // null: the mirror decides by the room it has
    showLinks: true,
    showStrip: true
  };

  let passChip = null;           // the legend's Passes toggle (the mirror sets it when it decides)

  // ---- chrome: caption, view buttons, views, legend, popover ----------------------------------------
  const capTitle = h("strong", {}, "");
  const capChip = h("span", { class: "chip cap-chip", hidden: true }, "");
  const capSub = h("span", { class: "cap-sub" }, "");
  const caption = h("div", { class: "mirror-caption" }, h("div", { class: "cap-line" }, capTitle, capChip), capSub);
  const btnTrain = h("button", { class: "btn btn-sm", type: "button", "aria-pressed": "true", title: "One train: its source timetable beside what passengers are told" }, icon("translate", 18), h("span", { class: "btn-text" }, "Train view"));
  const btnMonitor = h("button", { class: "btn btn-sm", type: "button", "aria-pressed": "false", title: "Every train in the window, first departure first" }, icon("list", 18), h("span", { class: "btn-text" }, "Sync monitor"));
  const btnLegend = h("button", { class: "btn btn-sm", type: "button", "aria-expanded": "false", "aria-controls": "mirror-legend", title: "What the marks and colours mean" }, icon("info", 18), h("span", { class: "btn-text" }, "Legend"));
  const tools = h("div", { class: "mirror-tools" }, btnTrain, btnMonitor, btnLegend);
  btnTrain.addEventListener("click", () => showTrain());
  btnMonitor.addEventListener("click", () => showMonitor());
  btnLegend.addEventListener("click", () => setLegend(legend.hidden));

  const strip = createStrip({ onStation: openStation });
  const card = createCard({ onSource: openSource, onCustomer: openCustomer, onChannel: pickChannel });
  const trainEl = h("div", { class: "mirror-view", dataset: { view: "train" } }, strip.element, card.element);
  // A row of the monitor opens its train; the keyboard focus follows into the card.
  const monitor = createMonitor({ onRow: (id) => { pop.hide(); st.focusCard = true; focus(id); } });
  const monitorEl = h("div", { class: "mirror-view", dataset: { view: "monitor" }, hidden: true }, monitor.element);
  const legend = buildLegend();
  container.append(caption, tools, trainEl, monitorEl, legend);
  const pop = createPopover(container, { resolve: resolveKey });

  // ---- state helpers ----------------------------------------------------------------------------------
  const markOf = (key) => st.marks.get(key) || null;

  function mark({ train_ids = [], point_ids = [], contradiction_ids = [], state = "affected" } = {}) {
    const s = STATES.has(state) ? state : "affected";
    const set = (key) => st.marks.set(key, s);
    for (const id of train_ids || []) if (model.trains.has(id)) set(`train:${id}`);
    for (const id of point_ids || []) if (model.points.has(id)) set(`point:${id}`);
    for (const id of contradiction_ids || []) set(`cx:${id}`);
  }

  function addCheck(trainId, kind, callId) {
    if (!st.checks.has(trainId)) st.checks.set(trainId, new Map());
    const kinds = st.checks.get(trainId);
    if (!kinds.has(kind)) kinds.set(kind, new Set());
    kinds.get(kind).add(callId);
  }
  const checksOf = (id) => [...(st.checks.get(id)?.keys() || [])];

  /** Forgets everything a tool call of a discarded attempt showed: its pulse and its badges. */
  function dropCall(callId) {
    if (st.calls.get(callId)?.name === "sim_sync") st.pendingBasis = null;
    st.calls.delete(callId);
    for (const kinds of st.checks.values()) {
      for (const [kind, calls] of kinds) {
        calls.delete(callId);
        if (!calls.size) kinds.delete(kind);
      }
    }
    for (const [p, calls] of st.observed) { calls.delete(callId); if (!calls.size) st.observed.delete(p); }
  }

  /** The contradictions of a train with their state on the mirror now (null: cleared by a neutral mark). */
  function itemsOf(trainId) {
    const rec = st.results.get(trainId);
    if (!rec) return [];
    return contradictionsOf(rec.result, trainId).map((c) => {
      const m = markOf(`cx:${c.id}`);
      const state = m === "neutral" ? null : m || (rec.basisKey === "what_if" ? "what_if" : "affected");
      return { ...c, state };
    }).filter((c) => c.state);
  }

  /** A train's state: what a mark says, else the most urgent of its contradictions. */
  function trainState(id) {
    const decided = st.decisions.get(id)?.state;
    if (decided) return decided;
    const fromItems = worstState(itemsOf(id));
    const m = markOf(`train:${id}`);
    return fromItems || (m === "neutral" ? null : m);
  }

  /** The channel the right column shows: the presenter's choice, else the one with the most findings. */
  function channelFor(id) {
    const chans = channelStates(model, id).map((c) => c.channel);
    if (st.channelPicked && chans.includes(st.channel)) return st.channel;
    const asked = [...st.calls.values()].find((c) => c.name === "kfp_get_published" && c.trains.includes(id) && c.channel);
    if (asked && chans.includes(asked.channel)) return asked.channel;
    const counts = new Map();
    for (const c of itemsOf(id)) {
      const list = c.type === "coach_order" ? ["coach"] : c.channels_wrong.filter((ch) => ch !== "coach");
      for (const ch of list) counts.set(ch, (counts.get(ch) || 0) + 1);
    }
    let best = "planner";
    let n = 0;
    for (const ch of chans) if ((counts.get(ch) || 0) > n) { best = ch; n = counts.get(ch); }
    return best;
  }

  // ---- views ------------------------------------------------------------------------------------------
  function focus(trainId) {
    if (!model.trains.has(trainId)) return;
    if (st.focus !== trainId) { pop.hide(); st.channelPicked = false; }
    st.focus = trainId;
    st.view = "train";
    render();
  }
  function showTrain() {
    if (!st.focus) st.focus = scenarioTrain(scenarios[0]?.id) || "T-618";
    st.view = "train";
    pop.hide();
    render();
  }
  function showMonitor() {
    st.view = "monitor";
    pop.hide();
    render();
  }
  function pickChannel(ch) {
    st.channel = ch;
    st.channelPicked = true;
    pop.hide();
    render();
  }
  function scenarioTrain(id) {
    const sc = scenarios.find((s) => s.id === id);
    return sc?.train_id || sc?.exposure_check?.train_ids?.[0] || null;
  }
  // The mirror opens on the train of the scenario chosen in the control bar.
  st.focus = scenarioTrain(initialScenario) || scenarioTrain(scenarios[0]?.id) || model.world.trains[0]?.id || null;

  // ---- run events ---------------------------------------------------------------------------------------
  bus.on("run_start", (ev) => {
    const p = ev.payload;
    st.running = true;
    st.entry = p.entry;
    if (p.entry === "scenario" && scenarioTrain(p.scenario_id)) focus(scenarioTrain(p.scenario_id));
    else showMonitor();
  });

  bus.on("tool_call", (ev) => {
    const p = ev.payload;
    if (p.name?.startsWith("ui_")) return;
    const trains = callTrains(model, p.name, p.input || {});
    const points = callPoints(model, p.name, p.input || {});
    st.calls.set(p.call_id, { name: p.name, trains, points, channel: p.name === "kfp_get_published" ? p.input?.channel || null : null });
    if (p.name === "ops_get_overview" && st.entry !== "scenario") { showMonitor(); return; }
    const target = trains.includes(st.focus) ? st.focus : trains[0];
    if (target && st.entry !== "scan" && target !== st.focus) focus(target);
    else render();
  });

  bus.on("tool_result", (ev) => {
    const p = ev.payload;
    const call = st.calls.get(p.call_id) || { name: p.name, trains: [], points: [] };
    st.calls.delete(p.call_id);
    const name = p.name || call.name;
    const r = p.result;
    if (p.ok !== false && r && !r.error && r.ok !== false) {
      const { checks, points } = resultChecks(model, name, r);
      for (const c of checks) addCheck(c.train, c.kind, p.call_id);
      for (const pt of points) { if (!st.observed.has(pt)) st.observed.set(pt, new Set()); st.observed.get(pt).add(p.call_id); }
      if (name === "sim_sync" && Array.isArray(r.contradictions)) {
        // The live agent names the stage just before the result arrives; the simulation just after.
        const key = st.pendingBasis || basisKeyOf(r.basis, null);
        const ids = (r.trains || []).map((t) => t.train_id).filter((id) => model.trains.has(id));
        for (const id of ids) { st.results.set(id, { result: r, basisKey: key }); st.checkedTrains.add(id); }
        st.lastResultTrains = ids;
        st.pendingBasis = null;
        // Focus where the finding is most urgent: the train whose passengers act first (then the one
        // with the most passengers); the train in focus stays when it is as urgent.
        if (st.entry !== "scan" && ids.length) {
          const rank = ids.map((id) => {
            const list = itemsOf(id);
            return { id, n: list.length, first: Math.min(...list.map((c) => c.minutes_to_first_event ?? 1e9), 1e9), pax: list.reduce((s, c) => s + (c.passengers || 0), 0) };
          }).filter((x) => x.n).sort((a, b) => a.first - b.first || b.pax - a.pax);
          const cur = rank.find((x) => x.id === st.focus);
          const best = rank[0];
          if (best && best.id !== st.focus && (!cur || cur.first > best.first)) { focus(best.id); revealFinding(); return; }
        }
        render();
        revealFinding();
        return;
      }
      if (name === "sim_sync") st.pendingBasis = null;
      for (const c of checks) st.checkedTrains.add(c.train);
    }
    render();
  });

  // The KPI update that follows each calculation names its stage (first estimate, verified, what-if);
  // the one after a "do nothing" approval records the accepted risk on the contradictions.
  bus.on("kpi_update", (ev) => {
    const p = ev.payload;
    if (p.decided && p.accepted) { acceptRisk(); render(); return; }
    if (p.decided) return;
    const key = basisKeyOf(p.basis, p.stage);
    if ([...st.calls.values()].some((c) => c.name === "sim_sync")) { st.pendingBasis = key; return; }
    for (const id of st.lastResultTrains) { const rec = st.results.get(id); if (rec) rec.basisKey = key; }
    render();
  });

  bus.on("alert", (ev) => {
    const p = ev.payload;
    const trains = (p.train_ids || []).filter((id) => model.trains.has(id));
    mark({ train_ids: trains, point_ids: p.point_ids || [], state: p.basis === "what_if" ? "at_risk" : "affected" });
    st.flagged = trains[0] || st.flagged;
    if (trains[0] && (st.view === "monitor" || !trains.includes(st.focus))) focus(trains[0]);
    else render();
  });

  bus.on("mirror_update", (ev) => {
    const p = ev.payload;
    mark(p);
    if (p.source === "decision") applyDecision(p);
    if (p.focus && model.trains.has(p.focus)) focus(p.focus);
    else if (p.view === "monitor") showMonitor();
    else if (p.view === "train") showTrain();
    else render();
  });

  bus.on("options", (ev) => {
    const p = ev.payload;
    st.options = p;
    const ids = (p.train_ids || []).filter((id) => model.trains.has(id));
    if (ids.length && !ids.includes(st.focus)) {
      const best = ids.map((id) => ({ id, n: itemsOf(id).length })).sort((a, b) => b.n - a.n)[0];
      focus(best.id);
    } else render();
  });

  bus.on("attempt_discarded", (ev) => {
    for (const id of ev.payload.call_ids || []) dropCall(id);
    render();
  });

  bus.on("run_end", () => {
    st.running = false;
    st.calls.clear();
    render();
  });

  /** An approved option: its trains show what it does (re-published and in sync, or informed only). */
  function applyDecision(p) {
    const opt = (st.options?.options || []).find((o) => o.id === p.option_id);
    const label = opt ? `Option ${opt.letter} approved` : "Option approved";
    for (const id of p.train_ids || []) {
      if (!model.trains.has(id)) continue;
      st.decisions.set(id, { label: p.state === "resolved" ? `${label}: re-publish` : `${label}: informed, data behind`, state: p.state === "resolved" ? "resolved" : "at_risk" });
    }
  }

  /** "Do nothing" approved: the contradictions stay and read as an accepted risk. */
  function acceptRisk() {
    const ids = st.options?.baseline?.contradiction_ids || [];
    for (const id of ids) st.marks.set(`cx:${id}`, "accepted");
    for (const id of st.options?.train_ids || []) if (model.trains.has(id)) st.decisions.set(id, { label: "Risk accepted: nothing changed", state: "at_risk" });
  }

  // ---- popovers -------------------------------------------------------------------------------------------
  function openSource(point, anchor) {
    const id = st.focus;
    const items = itemsOf(id).filter((c) => c.point === point);
    pop.show(anchor, sourceRowPopover(model, id, point, { state: worstState(items) || markOf(`point:${point}`), checks: checksOf(id) }), { label: `Source row ${point}`, id: `source:${point}` });
  }
  function openCustomer(point, anchor) {
    const id = st.focus;
    const items = itemsOf(id).filter((c) => c.point === point && wrongOn(c, st.channelNow));
    pop.show(anchor, customerRowPopover(model, id, point, st.channelNow, { state: worstState(items), contradiction: items[0] || null }), { label: `Published row ${point}`, id: `customer:${point}` });
  }
  function openStation(point, anchor) {
    pop.show(anchor, stationPopover(model, point, { state: stateAtPoint(point) }), { label: `Station ${point}`, id: `station:${point}` });
  }

  /** The element that stands for a popover's key now (the mirror may have redrawn it). */
  function resolveKey(key) {
    const [kind, a] = String(key).split(":");
    if (kind === "source") return card.rowButton("source", a);
    if (kind === "customer") return card.rowButton("customer", a);
    if (kind === "station") return strip.button(a);
    return null;
  }

  const wrongOn = (c, ch) => (ch === "coach" ? c.type === "coach_order" : c.type !== "coach_order" && c.channels_wrong.includes(ch));
  function stateAtPoint(point) {
    const items = st.focus ? itemsOf(st.focus).filter((c) => c.point === point || c.new_terminus === point) : [];
    return worstState(items) || (markOf(`point:${point}`) === "neutral" ? null : markOf(`point:${point}`));
  }

  // ---- drawing ----------------------------------------------------------------------------------------------
  let frame = null;
  function render() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = null; draw(); });
  }

  function draw() {
    container.dataset.view = st.view;
    container.dataset.strip = st.showStrip ? "on" : "off";
    btnTrain.setAttribute("aria-pressed", String(st.view === "train"));
    btnMonitor.setAttribute("aria-pressed", String(st.view === "monitor"));
    container.style.setProperty("--tools-w", `${Math.round(tools.offsetWidth || 320)}px`);
    for (const g of legend.querySelectorAll("[data-only]")) g.hidden = g.dataset.only !== st.view;
    fitLegend();
    sizeClass();
    if (st.view === "train" && st.focus) drawTrain();
    else drawMonitor();
  }

  function setCaption(title, sub, chipKey) {
    capTitle.textContent = title;
    capSub.textContent = sub;
    const [label, tone] = chipKey ? BASIS_CHIP[chipKey] || [null, null] : [null, null];
    capChip.hidden = !label;
    capChip.textContent = label || "";
    if (tone) capChip.dataset.tone = tone; else delete capChip.dataset.tone;
  }

  const checkingOf = (id) => {
    const out = { source: false, published: false, channel: null, translating: false, physical: false };
    for (const c of st.calls.values()) {
      if (!c.trains.includes(id)) continue;
      if (c.name === "ops_get_timetable" || c.name === "ops_list_changes") out.source = true;
      if (c.name === "kfp_get_published") { out.published = true; out.channel = c.channel; }
      if (c.name === "sim_sync") out.translating = true;
      if (c.name === "phys_observe") out.physical = true;
    }
    return out;
  };

  function drawTrain() {
    trainEl.hidden = false;
    monitorEl.hidden = true;
    const id = st.focus;
    const t = model.trains.get(id);
    const rows = sourceRows(model, id);
    const ch = channelFor(id);
    st.channelNow = ch;
    const customer = channelRows(model, id, ch);
    const channels = channelStates(model, id);
    const items = itemsOf(id);
    const rec = st.results.get(id) || null;
    const kinds = checksOf(id);
    const checking = checkingOf(id);
    const changes = model.changesByTrain.get(id) || [];
    const last = changes[changes.length - 1];
    const created = t.created_by ? model.changes.get(t.created_by) : null;
    const sourceNote = last ? `${last.id} at ${minuteLabel(last.at)} · every operating point, tenths of a minute`
      : created ? `Created by ${created.id} at ${minuteLabel(created.at)} · every operating point, tenths of a minute`
        : "Base timetable · every operating point, tenths of a minute";
    const first = rows[0];
    const end = rows[rows.length - 1];
    setCaption(`${t.number} · ${t.from} → ${t.to}`,
      `Source v${sourceVersion(id)}${last ? ` (${last.id}, ${minuteLabel(last.at)})` : ""} · ${channels.map((c) => `${c.label} v${c.version}${c.faulty ? "*" : ""}`).join(" · ")}`,
      rec ? rec.basisKey : null);

    // Size: rows of 44 px on a tall mirror, 40 px on a short or tiny one; the strip only when there is room.
    const size = container.dataset.h;
    const rowH = size === "tall" ? 44 : size === "mid" ? 42 : 40;
    const stripOn = st.showStrip && (size === "tall" || size === "mid");
    strip.element.hidden = !stripOn;
    if (stripOn) {
      const data = stripData(model, id);
      const pts = new Set([...st.calls.values()].flatMap((c) => c.points));
      strip.render(data, { size: size === "tall" ? "tall" : "mid", stateAt: stateAtPoint, checking: pts, observed: new Set(st.observed.keys()) });
    }
    card.element.style.top = stripOn ? `${strip.element.offsetHeight + 8}px` : "0px";

    const right = customer.rows;
    const passes = rows.filter((r) => r.activity === "pass" && !right.some((x) => x.point === r.point)).length;
    const fit = card.rowsThatFit(rowH);
    const showPasses = st.showPasses ?? (rows.length <= Math.max(fit, rows.length - passes));
    passChip?.setAttribute("aria-pressed", String(showPasses));

    const cxAt = (point) => items.filter((c) => c.point === point && wrongOn(c, ch));
    card.render({
      trainId: id,
      source: { version: sourceVersion(id), note: sourceNote, rows },
      channel: ch,
      channels,
      customer,
      continues: end && t.to !== end.station ? t.to : null,
      comesFrom: first && t.from !== first.station ? t.from : null
    }, {
      rowH, showPasses, showLinks: st.showLinks,
      cxAt,
      missingCx: (point) => items.filter((c) => c.point === point && c.type === "stop_missing" && c.channels_wrong.includes(ch)),
      srcCx: (point) => worstState(items.filter((c) => c.point === point)),
      channelInfo: (channel) => {
        const list = items.filter((c) => wrongOn(c, channel));
        return { n: list.length, state: worstState(list) };
      },
      checks: {
        source: kinds.includes("source") || kinds.includes("operations"),
        published: kinds.includes("published"),
        physical: kinds.includes("physical"),
        passengers: kinds.includes("passengers")
      },
      checking
    });
    if (st.focusCard) { st.focusCard = false; card.focusFirst(); }
    // When the card's room changes (the drawer opens or closes, the window resizes), the finding is
    // brought back into view.
    const bodyH = card.bodyElement.clientHeight;
    if (bodyH !== st.bodyH) { st.bodyH = bodyH; revealFinding(); }
  }

  function sourceVersion(id) {
    return 1 + (model.changesByTrain.get(id) || []).length;
  }

  /** After a result, the first contradiction of the train in focus scrolls into view in the card. */
  function revealFinding() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (st.view !== "train" || !st.focus) return;
      const first = itemsOf(st.focus).filter((c) => wrongOn(c, st.channelNow)).sort((a, b) => (a.minutes_to_first_event ?? 1e9) - (b.minutes_to_first_event ?? 1e9))[0];
      if (first) card.reveal(first.point);
    }));
  }

  function drawMonitor() {
    trainEl.hidden = true;
    monitorEl.hidden = false;
    const rows = monitorTrains(model);
    const checking = new Set([...st.calls.values()].flatMap((c) => c.trains));
    setCaption(`Sync monitor: ${rows.length} trains in the next ${model.horizonMin} minutes`,
      st.entry === "scan" && (st.running || st.checkedTrains.size)
        ? `Live sweep: ${rows.filter((r) => st.checkedTrains.has(r.id)).length} of ${rows.length} checked · first departure first`
        : `Source version against what each channel published · S-Bahn shuttles left out · first departure first`,
      null);
    monitor.render(rows, {
      stateOf: (id) => trainState(id),
      resultOf: (id) => {
        const rec = st.results.get(id);
        if (!rec) return null;
        const items = itemsOf(id);
        const wrong = new Set(items.flatMap((c) => (c.type === "coach_order" ? ["coach"] : c.channels_wrong)));
        // Passengers counted once (the engine's per-train figure), not the sum over contradictions.
        const perTrain = rec.result?.trains?.find((t) => t.train_id === id)?.pax;
        return { n: items.length, pax: typeof perTrain === "number" ? perTrain : items.reduce((s, c) => s + (c.passengers || 0), 0), wrong };
      },
      checking,
      decisionOf: (id) => st.decisions.get(id) || null,
      focus: st.focus
    });
    monitor.reveal([...checking][0] || st.flagged || st.focus);
  }

  /**
   * The legend opens from the view buttons and docks beside the views (below them on a narrow mirror),
   * which give it the room: it never covers a row, the strip or the caption.
   */
  function setLegend(open) {
    const hadFocus = legend.contains(document.activeElement);
    legend.hidden = !open;
    btnLegend.setAttribute("aria-expanded", String(open));
    container.dataset.legend = open ? "open" : "closed";
    if (open) legend.focus({ preventScroll: true });
    else if (hadFocus) btnLegend.focus({ preventScroll: true });
    render();
  }
  function fitLegend() {
    container.style.setProperty("--legend-h", legend.hidden ? "0px" : `${Math.round(legend.offsetHeight)}px`);
  }

  // ---- sizes ---------------------------------------------------------------------------------------------
  // The height class counts the room the views have: a legend docked below them (on a narrow mirror)
  // takes its share, so the strip and the card head give way to the rows first.
  const sizeClass = () => {
    const wid = container.clientWidth;
    container.dataset.w = wid < 820 ? "narrow" : "wide";
    container.dataset.tools = wid < 640 ? "icons" : "text";
    const docked = !legend.hidden && wid < 820 ? legend.offsetHeight + 12 : 0;
    const hgt = container.clientHeight - docked;
    container.dataset.h = hgt >= 600 ? "tall" : hgt >= 400 ? "mid" : hgt >= 300 ? "short" : "tiny";
  };
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => { sizeClass(); render(); }).observe(container);
  }

  // ---- legend --------------------------------------------------------------------------------------------
  function buildLegend() {
    const toggle = (label, key, title) => {
      const btn = h("button", { class: "legend-chip", type: "button", "aria-pressed": String(st[key] !== false), title }, h("span", { class: "box" }, icon("check", 12)), label);
      btn.addEventListener("click", () => {
        const on = btn.getAttribute("aria-pressed") !== "true";
        st[key] = on;
        btn.setAttribute("aria-pressed", String(on));
        render();
      });
      return btn;
    };
    const mark = (cls, label) => h("div", { class: "legend-row" }, h("span", { class: `legend-mark ${cls}` }), label);
    // A status: its colour, and the mark the line labels carry, so it reads without the colour too.
    const dot = (fill, stroke, label, cls = "", mk = null) => h("div", { class: "legend-row" },
      h("span", { class: "legend-state" },
        h("span", { class: `legend-swatch-dot ${cls}`, style: { background: fill, borderColor: stroke } }),
        mk ? h("span", { class: "legend-state-mark", style: { color: stroke } }, icon(mk, 13)) : null),
      label);
    const line = (cls, label) => h("div", { class: "legend-row" }, h("span", { class: `legend-swatch-line ${cls}` }), label);
    const el = h("section", { class: "legend", id: "mirror-legend", "aria-label": "Mirror legend", tabindex: "-1", hidden: true });
    const closeBtn = h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "Close legend", title: "Close legend" }, icon("x", 18));
    closeBtn.addEventListener("click", () => setLegend(false));
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); setLegend(false); } });
    passChip = toggle("Passes", "showPasses", "The points the train passes without stopping (Durchfahrten)");
    el.append(
      h("div", { class: "legend-head" }, h("strong", {}, "Legend"), closeBtn),
      h("div", { class: "legend-body" },
        h("div", { class: "legend-toggles", role: "group", "aria-label": "Show on the mirror", dataset: { only: "train" } },
          passChip,
          toggle("Lines", "showLinks", "The lines from each published row to its source row, and their labels"),
          toggle("Corridor", "showStrip", "The corridor strip above the timetables")),
        h("div", { class: "legend-group", dataset: { only: "train" } }, h("h4", {}, "Timetables"),
          mark("stop", "Passenger stop (Verkehrshalt)"),
          mark("ops", "Operational stop, no passengers (Betriebshalt)"),
          mark("pass", "Passes without stopping (Durchfahrt)"),
          line("", "Published row and its source row"),
          mark("x", "Published, but not in the source"),
          mark("plus", "In the source, not published")),
        h("div", { class: "legend-group", dataset: { only: "train" } }, h("h4", {}, "Corridor"),
          line("route", "Route today (source)"),
          line("route dashed", "Route as published")),
        h("div", { class: "legend-group", dataset: { only: "monitor" } }, h("h4", {}, "Channels"),
          h("div", { class: "legend-row" }, h("span", { class: "mon-chip" }, "2 channels behind"), "Generated from an older version (*: a conversion fault)"),
          h("div", { class: "legend-row" }, h("span", { class: "mon-chip", dataset: { wrong: "true" } }, "Planner wrong"), "Contradicts the source, as the agent's check found")),
        h("div", { class: "legend-group" }, h("h4", {}, "Status"),
          dot("var(--affected-fill)", "var(--affected)", "Contradicts the source", "", "alert"),
          dot("var(--violet-fill)", "var(--violet-line)", "What-if, not the source", "", "spark"),
          dot("var(--at-risk-fill)", "var(--at-risk)", "Informed, data still behind", "", "clock"),
          dot("var(--at-risk-fill)", "var(--at-risk)", "Risk accepted: nothing changed", "", "hand"),
          dot("var(--resolved-fill)", "var(--resolved)", "Re-publication approved", "", "check"),
          dot("", "", "Being checked by the agent", "pulse"))
      )
    );
    return el;
  }

  sizeClass();
  render();

  // ---- API ---------------------------------------------------------------------------------------------------
  /** Clears the run's marks, checks and results (the view stays; ui.js chooses what to show next). */
  function reset() {
    st.marks.clear();
    st.calls.clear();
    st.checks.clear();
    st.observed.clear();
    st.results.clear();
    st.lastResultTrains = [];
    st.pendingBasis = null;
    st.options = null;
    st.decisions.clear();
    st.flagged = null;
    st.checkedTrains.clear();
    st.running = false;
    st.entry = null;
    st.channelPicked = false;
    pop.hide();
    render();
  }

  return {
    ready: true,
    focusTrain: (id) => focus(id),
    focusScenario: (id) => { const t = scenarioTrain(id); if (t) focus(t); },
    showTrain, showMonitor, reset,
    invalidate: () => { sizeClass(); render(); }
  };
}
