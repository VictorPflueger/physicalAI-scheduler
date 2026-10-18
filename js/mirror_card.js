// The mirror card, the centre of the train view. Left, the source timetable of one train
// (Betriebsfahrplan: every operating point, tenths of a minute, tracks); right, what one customer
// channel publishes for it (Kundenfahrplan: passenger stops, whole minutes, platforms); between them
// the translation: a line from every customer row to the source row of its point. A passenger stop
// where the train only waits (Betriebshalt) or passes, a stop the source no longer serves and a stop
// the customer timetable misses show as lines that do not meet a passenger stop. The engine's
// contradictions colour the lines and the customer rows (red: contradicts the source; violet: a
// what-if; amber: informed, data still behind; green: re-publication approved). The customer rows
// sit level with their source rows (mirror_data.placeRight); the card scrolls when a train has more
// rows than the mirror has room for.

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { mirrorLinks, placeRight } from "./mirror_data.js";

const SVG = "http://www.w3.org/2000/svg";
function s(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  return el;
}

/** Short names of the contradiction types, for the labels on the lines. */
export const TYPE_SHORT = {
  platform: "Platform", time: "Time", stop_not_served: "No stop", stop_missing: "Not listed",
  terminus: "Terminus", coach_order: "Coach order", connection: "Connection"
};
const STATE_WORD = { affected: "contradicts the source", what_if: "what-if", at_risk: "informed, data behind", resolved: "re-publication approved", accepted: "risk accepted" };
const STATE_ICON = { affected: "alert", what_if: "spark", at_risk: "clock", resolved: "check", accepted: "hand" };
// Which cell of a customer row a contradiction makes wrong.
const WRONG_CELL = { platform: "trk", coach_order: "trk", time: "t", connection: "t", stop_not_served: "row", terminus: "row", stop_missing: null };
const RANK = { affected: 5, what_if: 4, at_risk: 3, accepted: 2, resolved: 1 };

/** The state that stands for several contradictions: the most urgent one. */
export function worstState(list) {
  let best = null;
  for (const c of list) if (c.state && (!best || (RANK[c.state] || 0) > (RANK[best] || 0))) best = c.state;
  return best;
}

export function createCard({ onSource, onCustomer, onChannel }) {
  // ---- head --------------------------------------------------------------------------------------
  const srcVer = h("span", { class: "mc-ver" }, "");
  const srcSub = h("span", { class: "mc-sub" }, "");
  const srcTags = h("span", { class: "mc-tags" });
  // What the agent has read shows as tags in the title rows, which stay visible on a short mirror.
  const headLeft = h("div", { class: "mc-head-col", dataset: { side: "source" } },
    h("div", { class: "mc-title" }, icon("timetable", 18), h("strong", {}, "Betriebsfahrplan"), srcVer, srcTags),
    h("div", { class: "mc-subline" }, srcSub));
  const midNote = h("span", { class: "mc-mid-note" }, "derived");
  const headMid = h("div", { class: "mc-head-mid", title: "The translator derives the customer view from the source and keeps no timetable of its own" }, icon("translate", 22), midNote);
  const chanGroup = h("div", { class: "mc-channels", role: "group", "aria-label": "Customer channel shown" });
  const custTags = h("span", { class: "mc-tags" });
  const headRight = h("div", { class: "mc-head-col", dataset: { side: "customer" } },
    h("div", { class: "mc-title" }, icon("users", 18), h("strong", {}, "Kundenfahrplan"), h("span", { class: "mc-ver" }, "as published"), custTags),
    chanGroup);
  const head = h("div", { class: "mc-head" }, headLeft, headMid, headRight);

  const colLeft = h("div", { class: "mc-cols-side", dataset: { side: "source" } }, h("span", {}), h("span", {}, "Time"), h("span", { class: "code" }, "Point"), h("span", {}, ""), h("span", { class: "r" }, "Track"));
  const custLast = h("span", { class: "r" }, "Platform");
  const colRight = h("div", { class: "mc-cols-side", dataset: { side: "customer" } }, h("span", {}), h("span", {}, "Time"), h("span", {}, "Station"), custLast);
  const cols = h("div", { class: "mc-cols", "aria-hidden": "true" }, colLeft, h("span", {}), colRight);

  // ---- body: the two timetables and the lines between them ----------------------------------------------
  const leftCol = h("div", { class: "mc-side", dataset: { side: "source" }, role: "list", "aria-label": "Source timetable rows" });
  const rightCol = h("div", { class: "mc-side", dataset: { side: "customer" }, role: "list", "aria-label": "Published customer timetable rows" });
  const linkSvg = s("svg", { class: "mc-links", "aria-hidden": "true" });
  const pills = h("div", { class: "mc-pills", "aria-hidden": "true" });
  const midCol = h("div", { class: "mc-mid" }, linkSvg, pills);
  const inner = h("div", { class: "mc-inner" }, leftCol, midCol, rightCol);
  const body = h("div", { class: "mc-body" }, inner);
  const element = h("section", { class: "mcard", "aria-label": "Source timetable and published customer timetable" }, head, cols, body);

  const buttons = { source: new Map(), customer: new Map() };
  const chipButtons = new Map();
  let lastStates = new Map();
  let current = null;

  function checkTag(text, kind) {
    return h("span", { class: "check-tag", dataset: { kind } }, icon("check", 12), text);
  }

  function renderHead(view, ctx) {
    srcVer.textContent = `Source v${view.source.version}`;
    srcVer.dataset.changed = String(view.source.version > 1);
    srcSub.textContent = view.source.note;
    srcTags.replaceChildren(...[
      ctx.checks.source ? checkTag("Source read", "source") : null,
      ctx.checks.physical ? checkTag("Physical layer read", "physical") : null
    ].filter(Boolean));
    headLeft.dataset.checking = String(!!ctx.checking.source);
    custTags.replaceChildren(...[
      ctx.checks.published ? checkTag("Published view read", "published") : null,
      ctx.checks.passengers ? checkTag("Passengers read", "passengers") : null
    ].filter(Boolean));
    headRight.dataset.checking = String(!!ctx.checking.published);
    headMid.dataset.checking = String(!!ctx.checking.translating);
    midNote.textContent = ctx.checking.translating ? "comparing" : "derived";

    const wanted = view.channels.map((c) => c.channel);
    for (const [ch, b] of chipButtons) if (!wanted.includes(ch)) { b.remove(); chipButtons.delete(ch); }
    view.channels.forEach((c, i) => {
      let b = chipButtons.get(c.channel);
      if (!b) {
        b = h("button", { class: "ch-chip", type: "button" });
        b.addEventListener("click", () => onChannel?.(c.channel));
        chipButtons.set(c.channel, b);
      }
      const info = ctx.channelInfo(c.channel);
      b.replaceChildren(...[
        h("span", { class: "ch-name" }, c.label),
        h("span", { class: "ch-v" }, `v${c.version}`),
        info.n ? h("span", { class: "ch-n" }, String(info.n)) : null
      ].filter(Boolean));
      b.setAttribute("aria-pressed", String(c.channel === view.channel));
      b.dataset.behind = String(c.behind || c.faulty);
      if (info.state) b.dataset.state = info.state; else delete b.dataset.state;
      b.dataset.checking = String(ctx.checking.published && (!ctx.checking.channel || ctx.checking.channel === c.channel));
      b.setAttribute("aria-label", `${c.label}: generated from source version ${c.version}${c.behind ? `, source is at ${view.source.version}` : ""}${c.faulty ? ", with a conversion fault" : ""}${info.n ? `; ${info.n} contradiction${info.n === 1 ? "" : "s"} found` : ""}`);
      b.title = `${c.label}: generated from source version ${c.version}${c.behind ? `; the source is at version ${view.source.version}` : ""}${c.faulty ? " (conversion fault)" : ""}`;
      if (chanGroup.children[i] !== b) chanGroup.insertBefore(b, chanGroup.children[i] || null);
    });
    custLast.textContent = view.channel === "coach" ? "Coach sectors" : "Platform";
  }

  /** The time cell: arrival over departure, a passing time, or one of them. */
  function timeCell(arr, dep, pass) {
    if (pass) return h("span", { class: "t", dataset: { pass: "true" } }, h("span", {}, pass));
    const lines = [arr ? h("span", { class: "ta" }, arr) : null, dep ? h("span", { class: "td" }, dep) : null].filter(Boolean);
    return h("span", { class: "t", dataset: { lines: String(lines.length) } }, lines);
  }

  function sourceRow(r, ctx, view, first, last) {
    const sub = [];
    if (first && view.comesFrom) sub.push(`from ${view.comesFrom}`);
    if (r.activity === "ops_stop") sub.push("Betriebshalt: no passengers");
    if (r.activity === "pass") sub.push("Durchfahrt");
    sub.push(...r.changed);
    if (last && view.continues) sub.push(`continues to ${view.continues}`);
    const flagged = ctx.srcCx(r.point);
    const b = h("button", {
      class: "mrow", type: "button", role: "listitem",
      dataset: { side: "source", act: r.activity, point: r.point, changed: String(r.changed.length > 0) },
      "aria-label": `${r.station}, ${r.activity === "pass" ? `passes ${r.pass}` : [r.arr ? `arrives ${r.arr}` : null, r.dep ? `departs ${r.dep}` : null].filter(Boolean).join(", ")}${r.track ? `, track ${r.track}` : ""}${r.activity === "ops_stop" ? ", operational stop only" : ""}${r.changed.length ? `; changed: ${r.changed.join(", ")}` : ""}`
    },
    h("span", { class: "spine" }, h("i")),
    timeCell(r.arr, r.dep, r.activity === "pass" ? r.pass : null),
    h("span", { class: "code" }, r.ril100),
    h("span", { class: "nm" }, h("strong", {}, r.station), sub.length ? h("span", { class: "sub" }, sub.join(" · ")) : null),
    h("span", { class: "trk" }, r.track || ""));
    if (flagged) b.dataset.flag = flagged;
    b.addEventListener("click", () => onSource?.(r.point, b));
    return b;
  }

  function customerRow(r, ctx, view, last) {
    const list = ctx.cxAt(r.point);
    const state = worstState(list);
    const wrong = new Set(list.map((c) => WRONG_CELL[c.type]).filter(Boolean));
    const sub = [];
    if (r.status === "added") sub.push("extra stop");
    if (r.status === "cancelled") sub.push("stop cancelled");
    if (last && r.status !== "cancelled" && view.customer.destination && view.customer.destination !== r.station) sub.push(`to ${view.customer.destination}`);
    const coach = view.channel === "coach";
    const trk = coach
      ? (r.coach ? h("span", { class: "trk sectors" }, h("span", {}, `1st ${r.coach.first}`), h("span", {}, `BR ${r.coach.restaurant}`)) : h("span", { class: "trk" }, ""))
      : h("span", { class: "trk" }, r.platform || "");
    const t = timeCell(r.arr, r.dep, null);
    if (wrong.has("trk")) trk.dataset.wrong = "true";
    if (wrong.has("t")) t.dataset.wrong = "true";
    const b = h("button", {
      class: "mrow", type: "button", role: "listitem",
      dataset: { side: "customer", status: r.status, point: r.point },
      "aria-label": `${r.station}${r.status === "cancelled" ? ", stop cancelled" : `, ${[r.arr ? `arrives ${r.arr}` : null, r.dep ? `departs ${r.dep}` : null].filter(Boolean).join(", ")}`}${!coach && r.platform ? `, platform ${r.platform}` : ""}${coach && r.coach ? `, first class sectors ${r.coach.first}` : ""}${list.length ? `; ${list.map((c) => `${TYPE_SHORT[c.type]}: ${STATE_WORD[c.state] || c.state}`).join("; ")}` : ""}`
    },
    h("span", { class: "spine" }, h("i")),
    t,
    h("span", { class: "nm" }, h("strong", {}, r.station), sub.length ? h("span", { class: "sub" }, sub.join(" · ")) : null),
    trk);
    if (state) b.dataset.state = state;
    if (wrong.has("row")) b.dataset.wrong = "true";
    b.addEventListener("click", () => onCustomer?.(r.point, b));
    return b;
  }

  /**
   * Draws a train. view: { trainId, source: { version, note, rows }, channel, channels, customer:
   * channelRows, continues, comesFrom }; ctx: { rowH, showPasses, showLinks, cxAt(point), srcCx(point), missingCx(point),
   * channelInfo(channel), checks, checking }.
   */
  function render(view, ctx) {
    // A row with the keyboard focus keeps it across the redraw (the rows are drawn anew each time).
    const active = document.activeElement;
    const keep = active?.classList?.contains("mrow") && inner.contains(active) && view.trainId === current?.view.trainId
      ? { side: active.dataset.side, point: active.dataset.point } : null;
    current = { view, ctx };
    renderHead(view, ctx);
    const right = view.customer.rows;
    const rightPoints = new Set(right.map((r) => r.point));
    const left = view.source.rows.filter((r) => r.activity !== "pass" || ctx.showPasses || rightPoints.has(r.point));
    const links = mirrorLinks(left, right).map((l) => (l.right !== null && right[l.right].status === "cancelled" ? { ...l, kind: "cancelled" } : l));
    const rowH = ctx.rowH;
    const leftTops = left.map((_, i) => i * rowH);
    const rightTops = placeRight(leftTops, links, right.length, rowH, left.length * rowH);
    const height = Math.max(left.length * rowH, right.length ? rightTops[right.length - 1] + rowH : 0);
    inner.style.height = `${height}px`;
    element.style.setProperty("--row-h", `${rowH}px`);
    element.dataset.channel = view.channel;
    // The spines run from the first row's mark to the last one's.
    leftCol.style.setProperty("--spine-top", `${rowH / 2}px`);
    leftCol.style.setProperty("--spine-h", `${Math.max(0, (left.length - 1) * rowH)}px`);
    rightCol.style.setProperty("--spine-top", `${right.length ? rightTops[0] + rowH / 2 : 0}px`);
    rightCol.style.setProperty("--spine-h", `${right.length ? rightTops[right.length - 1] - rightTops[0] : 0}px`);

    buttons.source.clear();
    buttons.customer.clear();
    leftCol.replaceChildren(...left.map((r, i) => {
      const b = sourceRow(r, ctx, view, i === 0, i === left.length - 1);
      b.style.top = `${leftTops[i]}px`;
      buttons.source.set(r.point, b);
      return b;
    }));
    const states = new Map();
    rightCol.replaceChildren(...right.map((r, j) => {
      const b = customerRow(r, ctx, view, j === right.length - 1);
      b.style.top = `${rightTops[j]}px`;
      buttons.customer.set(r.point, b);
      const key = `${view.trainId}:${view.channel}:${r.point}`;
      states.set(key, b.dataset.state || "");
      if (b.dataset.state && lastStates.has(key) && lastStates.get(key) !== b.dataset.state) b.classList.add("flash");
      return b;
    }));
    lastStates = states;
    drawLinks(links, left, right, leftTops, rightTops, ctx, height);
    if (keep) (buttons[keep.side].get(keep.point) || leftCol.firstElementChild)?.focus({ preventScroll: true });
  }

  function drawLinks(links, left, right, leftTops, rightTops, ctx, height) {
    const w = Math.max(40, Math.round(midCol.getBoundingClientRect().width) || 112);
    const half = ctx.rowH / 2;
    linkSvg.setAttribute("viewBox", `0 0 ${w} ${Math.max(1, height)}`);
    linkSvg.setAttribute("width", String(w));
    linkSvg.setAttribute("height", String(Math.max(1, height)));
    linkSvg.dataset.links = ctx.showLinks ? "on" : "off";
    linkSvg.dataset.checking = String(!!ctx.checking.translating);
    linkSvg.replaceChildren();
    pills.replaceChildren();
    const pillAt = [];
    for (const l of links) {
      if (l.kind === "hidden") continue;
      const yl = l.left !== null ? leftTops[l.left] + half : null;
      const yr = l.right !== null ? rightTops[l.right] + half : null;
      const point = l.right !== null ? right[l.right].point : left[l.left].point;
      const list = l.kind === "missing" ? ctx.missingCx(point) : l.right !== null ? ctx.cxAt(point) : [];
      const state = worstState(list);
      const attrs = { class: "ml", "data-kind": l.kind, "data-state": state || null };
      if (yl !== null && yr !== null) {
        linkSvg.append(s("path", { ...attrs, d: `M0 ${yl} C ${w * 0.5} ${yl} ${w * 0.5} ${yr} ${w} ${yr}` }));
      } else if (yr !== null) {
        // A customer row with no source row: the line stops short of the source.
        const x0 = w * 0.34;
        linkSvg.append(s("path", { ...attrs, d: `M${x0 + 7} ${yr} L ${w} ${yr}` }));
        linkSvg.append(endMark(x0, yr, "x", attrs));
      } else if (yl !== null) {
        // A source passenger stop the customer timetable does not list.
        const x1 = w * 0.66;
        linkSvg.append(s("path", { ...attrs, d: `M0 ${yl} L ${x1 - 7} ${yl}` }));
        linkSvg.append(endMark(x1, yl, "plus", attrs));
      }
      if (list.length && ctx.showLinks) {
        const y = yl !== null && yr !== null ? (yl + yr) / 2 : yr ?? yl;
        // One label per contradiction on the line: two wrong facts at one stop are two labels.
        for (const c of list) pillAt.push({ y, c });
      }
    }
    // Labels on the coloured lines (what is wrong, how many passengers rely on it), never on top of
    // each other.
    pillAt.sort((a, b) => a.y - b.y || (b.c.passengers || 0) - (a.c.passengers || 0));
    let floor = -Infinity;
    const ph = 22;
    for (const p of pillAt) {
      const y = Math.max(p.y, floor + ph + 3);
      floor = y;
      const label = TYPE_SHORT[p.c.type] || p.c.type;
      const pax = p.c.passengers || 0;
      const st = p.c.state || "affected";
      pills.append(h("span", {
        class: "ml-pill", dataset: { state: st }, style: { top: `${Math.round(y)}px` },
        title: `${label}: ${pax} passengers rely on it (${STATE_WORD[st] || "contradicts the source"})`
      },
      // A mark per state, so the state reads without its colour (as in the sister apps' legends).
      icon(STATE_ICON[st] || "alert", 12, "ml-mark"),
      h("strong", {}, label),
      pax ? h("span", {}, String(pax)) : null));
    }
  }

  function endMark(x, y, kind, attrs) {
    const g = s("g", { class: "ml-end", "data-kind": attrs["data-kind"], "data-state": attrs["data-state"] });
    g.append(s("circle", { cx: x, cy: y, r: 7 }));
    if (kind === "x") g.append(s("path", { d: `M${x - 3.2} ${y - 3.2} L ${x + 3.2} ${y + 3.2} M${x + 3.2} ${y - 3.2} L ${x - 3.2} ${y + 3.2}` }));
    else g.append(s("path", { d: `M${x - 3.6} ${y} L ${x + 3.6} ${y} M${x} ${y - 3.6} L ${x} ${y + 3.6}` }));
    return g;
  }

  /** Scrolls the card so a customer row (or the source row of a point) is in view. */
  function reveal(point) {
    const b = buttons.customer.get(point) || buttons.source.get(point);
    if (!b) return;
    const top = b.offsetTop;
    const view = body.clientHeight;
    if (top < body.scrollTop || top + b.offsetHeight > body.scrollTop + view) body.scrollTop = Math.max(0, top - Math.max(0, (view - b.offsetHeight) / 2));
  }

  /** How many rows of a train fit without scrolling (the body's height over the row height). */
  function rowsThatFit(rowH) {
    return Math.floor((body.clientHeight || 0) / rowH);
  }

  return {
    element,
    render,
    reveal,
    rowsThatFit,
    redraw: () => { if (current) render(current.view, current.ctx); },
    rowButton: (side, point) => buttons[side]?.get(point) || null,
    /** Moves the keyboard focus to the first source row (a train opened from the sync monitor). */
    focusFirst: () => { const b = leftCol.firstElementChild; if (b) { body.scrollTop = 0; b.focus({ preventScroll: true }); } },
    chipButton: (channel) => chipButtons.get(channel) || null,
    bodyElement: body
  };
}
