// The corridor strip above the mirror card: the Köln – Dortmund corridor as a schematic (the main line
// along the bottom, the Wuppertal line along the top), the route the train in focus runs today
// according to the source (solid) and the one the journey planner still shows where the two differ
// (dashed), its passenger stops, operational stops and passing points, where it is at the snapshot,
// the stations the physical layer was read at, and the stations of a contradiction in their state
// colour. Each station opens its details (platforms, what the physical layer observed there). What
// would be round is a flat-top hexagon (Vici's hexagon rule): the stations, their rings, the pulse of
// a station being read, the sensor marks and the train.

import { h } from "./dom.js";

const SVG = "http://www.w3.org/2000/svg";
function s(tag, attrs = {}, text = null) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  if (text !== null) el.textContent = text;
  return el;
}

/** The corners of a flat-top hexagon of circumradius R, as an SVG polygon's points. */
export function hexPoints(cx, cy, R) {
  return Array.from({ length: 6 }, (_, k) => `${(cx + R * Math.cos((k * Math.PI) / 3)).toFixed(2)},${(cy + R * Math.sin((k * Math.PI) / 3)).toFixed(2)}`).join(" ");
}

/** A flat-top hexagon in SVG (a legend's swatch), sized by CSS; its stroke keeps its width in pixels. */
export function hexShape(cls = null) {
  const svg = s("svg", { class: cls, viewBox: "-1.15 -1 2.3 2", "aria-hidden": "true", focusable: "false" });
  svg.append(s("polygon", { points: hexPoints(0, 0, 1.15) }));
  return svg;
}

// Short names for the schematic (the card and the popovers use the full names).
const SHORT = {
  KK: "Köln", KKDZ: "Deutz", KKM: "Mülheim", KLMI: "Leverkusen", KD: "Düsseldorf", KDFF: "Flughafen",
  EDG: "Duisburg", EMLR: "Mülheim (R)", EE: "Essen", EBO: "Bochum", EDO: "Dortmund",
  KSO: "Solingen", KW: "Wuppertal", KWO: "Oberbarmen", EHG: "Hagen", EWIT: "Witten"
};
const PAD = 34;
// The room between two neighbouring names in a row of the strip, in pixels.
const NAME_GAP = 10;

/**
 * Neighbouring names keep NAME_GAP between them: Inter runs wider than the former condensed font, so
 * on a narrower strip "Wuppertal" and "Oberbarmen" would run into one name. A name that comes too
 * close moves a few pixels away from its neighbour (each of the two by half), never off the strip.
 * Names are measured as drawn; a strip not laid out yet keeps them centred, and the next render
 * (the mirror draws again once the fonts are in) spreads them.
 */
function spreadNames(svg, width) {
  const rows = new Map();
  for (const t of svg.querySelectorAll("text.node-name")) {
    const w = typeof t.getComputedTextLength === "function" ? t.getComputedTextLength() : 0;
    if (!(w > 0)) return;
    const y = t.getAttribute("y");
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ t, x: Number(t.getAttribute("x")), w });
  }
  for (const list of rows.values()) {
    list.sort((a, b) => a.x - b.x);
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const b = list[i];
        const gap = b.x - b.w / 2 - (a.x + a.w / 2);
        if (gap < NAME_GAP - 0.25) {
          const d = (NAME_GAP - gap) / 2;
          a.x -= d;
          b.x += d;
          moved = true;
        }
      }
      for (const n of list) n.x = Math.min(width - 2 - n.w / 2, Math.max(2 + n.w / 2, n.x));
      if (!moved) break;
    }
    for (const n of list) n.t.setAttribute("x", n.x.toFixed(1));
  }
}

/** The strip's geometry for a width and a size: lanes, label rows, the x of every station. */
export function stripGeometry(nodes, width, size) {
  // Short names need room: on a narrow strip only the Ril 100 codes are shown.
  const names = size === "tall" && width >= 760;
  // Names and codes keep a few pixels between them, whatever the font rendering.
  const yTop = names ? 44 : 26;
  const yBot = yTop + 42;
  const height = yBot + (names ? 44 : 26);
  const x = (n) => PAD + (n.x / 100) * Math.max(10, width - 2 * PAD);
  const pos = new Map(nodes.map((n) => [n.id, { x: x(n), y: n.y < 20 ? yTop : yBot, top: n.y < 20 }]));
  return { yTop, yBot, height, names, pos };
}

export function createStrip({ onStation }) {
  const svg = s("svg", { class: "strip-svg", "aria-hidden": "true" });
  const hits = h("div", { class: "strip-hits" });
  const element = h("div", { class: "strip", role: "group", "aria-label": "Corridor: the train's route today and as published" }, svg, hits);
  const buttons = new Map();

  /**
   * data: mirror_data.stripData(); ctx: { size: "tall"|"mid", stateAt(point), checking: Set(points),
   * observed: Set(points), trainLabel }.
   */
  function render(data, ctx) {
    const width = Math.round(element.clientWidth || 800);
    const g = stripGeometry(data.nodes, width, ctx.size);
    element.style.height = `${g.height}px`;
    svg.setAttribute("viewBox", `0 0 ${width} ${g.height}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(g.height));
    svg.replaceChildren();
    const P = (id) => g.pos.get(id);
    const line = (ids) => ids.map((id, i) => `${i ? "L" : "M"}${P(id).x.toFixed(1)} ${P(id).y}`).join(" ");

    // The network, then the route as published (where it differs), then today's route.
    for (const e of data.edges) svg.append(s("path", { class: "net", d: line([e.a, e.b]) }));
    const differs = data.published.length && data.published.join() !== data.route.join();
    if (differs) svg.append(s("path", { class: "route-pub", d: line(data.published) }));
    if (data.route.length > 1) svg.append(s("path", { class: "route-src", d: line(data.route) }));

    const onRoute = new Set(data.route);
    const stops = new Set(data.stops);
    const ops = new Set(data.opsStops || []);
    const pubStops = new Set(data.publishedStops);
    for (const n of data.nodes) {
      const p = P(n.id);
      const role = stops.has(n.id) ? "stop" : ops.has(n.id) ? "ops" : onRoute.has(n.id) ? "pass" : pubStops.has(n.id) ? "pubstop" : "off";
      const state = ctx.stateAt(n.id);
      const grp = s("g", { class: "node", "data-role": role, "data-state": state || null, "data-checking": ctx.checking.has(n.id) ? "true" : null });
      // A hexagon's circumradius is a tenth larger than the circle it replaces, so it looks as large.
      if (state) grp.append(s("polygon", { class: "node-ring", points: hexPoints(p.x, p.y, 13.2) }));
      if (role === "ops") grp.append(s("rect", { class: "node-mark", x: p.x - 5.5, y: p.y - 5.5, width: 11, height: 11, rx: 1.5 }));
      else grp.append(s("polygon", { class: "node-mark", points: hexPoints(p.x, p.y, role === "stop" ? 6.6 : role === "pubstop" ? 6 : role === "pass" ? 3.6 : 4) }));
      if (ctx.checking.has(n.id)) grp.append(s("polygon", { class: "node-pulse", points: hexPoints(p.x, p.y, 10) }));
      if (ctx.observed.has(n.id)) {
        // The physical layer was read here: a small sensor mark beside the station.
        const sx = p.x + 11;
        const sy = p.y - 10;
        grp.append(s("polygon", { class: "node-sensor", points: hexPoints(sx, sy, 3.8) }));
      }
      // Labels: the Ril 100 code, and on a tall strip the short name, away from the lines between the lanes
      // and clear of a state ring's flat edge (a ring and the train's marker never touch a label).
      const codeY = p.top ? p.y - (g.names ? 32 : 15) : p.y + (g.names ? 38 : 23);
      grp.append(s("text", { class: "node-code", x: p.x, y: codeY, "text-anchor": "middle" }, n.id));
      if (g.names) grp.append(s("text", { class: "node-name", x: p.x, y: p.top ? p.y - 16 : p.y + 23, "text-anchor": "middle", "data-hub": n.hub ? "true" : null }, SHORT[n.id] || n.name));
      svg.append(grp);
    }
    if (g.names) spreadNames(svg, width);

    // Where the train is at the snapshot: between two points, or waiting at its first one.
    const pos = data.position;
    if (pos && data.route.length) {
      const a = P(pos.at);
      const b = pos.between ? P(pos.between[1]) : null;
      const x = b ? (a.x + b.x) / 2 : a.x;
      const y = b ? (a.y + b.y) / 2 : a.y;
      const next = b || (data.route[1] ? P(data.route[1]) : null);
      const ang = next ? Math.atan2(next.y - a.y, next.x - a.x) : 0;
      const m = s("g", { class: "train-pos", "data-state": pos.state, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` });
      if (pos.state === "running") m.append(s("polygon", { points: hexPoints(0, 0, 9.4) }));
      else m.append(s("polygon", { class: "waiting", points: hexPoints(0, 0, 11.6) }));
      const tip = pos.state === "running" ? 4.6 : 15;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const px = -dy;
      const py = dx;
      const t0 = pos.state === "running" ? -2.6 : 10;
      m.append(s("path", { class: "arrow", d: `M${(dx * tip).toFixed(1)} ${(dy * tip).toFixed(1)} L${(dx * t0 + px * 3.8).toFixed(1)} ${(dy * t0 + py * 3.8).toFixed(1)} L${(dx * t0 - px * 3.8).toFixed(1)} ${(dy * t0 - py * 3.8).toFixed(1)} Z` }));
      svg.append(m);
    }

    // Buttons over the stations (for the details and the keyboard).
    const wanted = new Set(data.nodes.map((n) => n.id));
    for (const [id, b] of buttons) if (!wanted.has(id)) { b.remove(); buttons.delete(id); }
    for (const n of data.nodes) {
      let b = buttons.get(n.id);
      if (!b) {
        b = h("button", { class: "strip-hit", type: "button" });
        b.addEventListener("click", () => onStation?.(n.id, b));
        buttons.set(n.id, b);
        hits.append(b);
      }
      const p = P(n.id);
      // A hexagon of 40 px height over the station (46 px wide).
      b.style.left = `${Math.round(p.x - 23)}px`;
      b.style.top = `${Math.round(p.y - 20)}px`;
      const role = stops.has(n.id) ? "passenger stop" : ops.has(n.id) ? "operational stop, no passengers" : onRoute.has(n.id) ? "passes" : pubStops.has(n.id) ? "a stop only in the published timetable" : "not on the route";
      const state = ctx.stateAt(n.id);
      b.setAttribute("aria-label", `${n.name} (${n.id}): ${role}${state ? `; ${state.replace("_", " ")}` : ""}`);
    }
  }

  return { element, render, button: (id) => buttons.get(id) || null };
}
