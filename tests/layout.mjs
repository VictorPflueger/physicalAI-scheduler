// Layout checks for projector use:
//   viewports  at 1920×1080, 1600×900, 1536×864, 1366×768 and 1280×720 (idle, the finding during the
//              run, options, outbox, approved with the drawer hidden, that again with the legend opened
//              by the presenter, and all trains): no horizontal overflow, header badges never overlap
//              the KPI tiles, the header keeps its height and the control bar stays on one row; on the
//              alignment view (the mirror's first view) no card leaves the view, no two cards cover
//              each other, the caption and view buttons cover none, every value stays inside its card
//              and the finding is in view, with the drawer open and closed and beside the legend; on
//              the timetables nothing leaves the panel, the caption, view buttons, legend, corridor
//              strip and card never cover each other, the strip's labels stay apart, the rows and the
//              lines between them stay inside the card, the line labels never stack on each other, and
//              the finding is in view in the card
//   scenarios  the other five scenarios at 1280×720 through the finding, options and outbox, whose
//              longer KPI subtitles must not push the header to a third row, and whose mirrors follow
//              the rules above; their findings at 1600×900 too
//   targets    every visible interactive element is at least 40 px high and wide at 1920×1080, in the
//              main states of a run (idle, intro window, mode dialog, options, outbox, audit, Diagnostics)
// Usage: node tests/layout.mjs [case…]
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { APP_ROOT, ONLY, outDir, wanted, launchBrowser, serveStatic, SKIP_INTRO } from "./lib/harness.mjs";

const OUT = await outDir("layout");
const { base: BASE, close } = await serveStatic(APP_ROOT, 8766);
const browser = await launchBrowser();
const results = [];

async function newPage(width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(SKIP_INTRO);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  // Measure with the page's own fonts, not a fallback that is still on screen while they load.
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

async function headerGeometry(page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll(".header-badges > *")].map((e) => e.getBoundingClientRect());
    const kpis = document.querySelector("#kpis").getBoundingClientRect();
    return {
      overlap: items.some((r) => r.right > kpis.left - 4 && r.bottom > kpis.top && r.top < kpis.bottom),
      headerHeight: Math.round(document.querySelector(".app-header").getBoundingClientRect().height),
      controlsHeight: Math.round(document.querySelector("#controls").getBoundingClientRect().height)
    };
  });
}

/** What covers what on the timetable mirror (empty when everything has its own place). */
async function mirrorOverlaps(page, { finding = false } = {}) {
  return page.evaluate((finding) => {
    const mirror = document.querySelector("#mirror");
    const M = mirror.getBoundingClientRect();
    const shown = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden]");
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    const within = (a, B) => a.l >= B.left - 1 && a.r <= B.right + 1 && a.t >= B.top - 1 && a.b <= B.bottom + 1;
    const out = [];
    const caption = document.querySelector("#mirror .mirror-caption");
    const tools = document.querySelector("#mirror .mirror-tools");
    const legend = document.querySelector("#mirror .legend");
    const strip = document.querySelector("#mirror .strip");
    const card = document.querySelector("#mirror .mcard");
    const monitor = document.querySelector("#mirror .monitor");
    if (hit(box(caption), box(tools))) out.push("caption under the view buttons");
    for (const [nm, el] of [["caption", caption], ["view buttons", tools], ["legend", legend], ["strip", strip], ["card", card], ["monitor", monitor]]) {
      if (shown(el) && !within(box(el), M)) out.push(`the ${nm} leaves the mirror`);
    }
    if (shown(legend)) for (const [nm, el] of [["caption", caption], ["view buttons", tools], ["strip", strip], ["card", card], ["monitor", monitor]]) {
      if (shown(el) && hit(box(legend), box(el))) out.push(`the legend covers the ${nm}`);
    }
    for (const [nm, el] of [["caption", caption], ["view buttons", tools]]) {
      if (shown(strip) && hit(box(el), box(strip))) out.push(`the ${nm} covers the strip`);
      if (shown(card) && hit(box(el), box(card))) out.push(`the ${nm} covers the card`);
      if (shown(monitor) && hit(box(el), box(monitor))) out.push(`the ${nm} covers the monitor`);
    }
    if (shown(strip) && shown(card) && hit(box(strip), box(card))) out.push("the strip covers the card");
    if (shown(strip)) {
      const S = strip.getBoundingClientRect();
      const texts = [...strip.querySelectorAll("text")].filter((t) => t.textContent.trim());
      for (const t of texts) if (!within(box(t), S)) out.push(`strip label ${t.textContent} leaves the strip`);
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        if (hit(box(texts[i]), box(texts[j]))) out.push(`strip labels overlap: ${texts[i].textContent} / ${texts[j].textContent}`);
      }
      for (const b of strip.querySelectorAll(".strip-hit")) if (!within(box(b), M)) out.push(`station button ${b.getAttribute("aria-label")?.slice(0, 20)} leaves the mirror`);
    }
    if (shown(card)) {
      const C = card.getBoundingClientRect();
      const body = card.querySelector(".mc-body");
      const B = body.getBoundingClientRect();
      if (body.scrollWidth > body.clientWidth + 1) out.push("the card overflows sideways");
      const chans = card.querySelector(".mc-channels");
      if (chans.scrollWidth > chans.clientWidth + 1) out.push("the channel chips overflow sideways");
      for (const head of card.querySelectorAll(".mc-head-col")) if (head.scrollWidth > head.clientWidth + 1) out.push(`the ${head.dataset.side} head overflows sideways`);
      for (const row of card.querySelectorAll(".mrow")) {
        const r = box(row);
        if (r.l < C.left - 1 || r.r > C.right + 1) out.push(`row ${row.dataset.side} ${row.dataset.point} leaves the card sideways`);
        for (const cell of row.children) if (cell.scrollWidth > cell.clientWidth + 1 && !cell.classList.contains("nm")) out.push(`row ${row.dataset.side} ${row.dataset.point}: a cell overflows`);
        // Station names may end in an ellipsis, but keep room for a name.
        const nm = row.querySelector(".nm");
        if (nm && nm.clientWidth < 96) out.push(`row ${row.dataset.side} ${row.dataset.point}: the station name is squeezed to ${nm.clientWidth} px`);
      }
      const mid = card.querySelector(".mc-mid");
      const D = mid.getBoundingClientRect();
      const pills = [...card.querySelectorAll(".ml-pill")];
      for (const p of pills) { const r = box(p); if (r.l < D.left - 1 || r.r > D.right + 1) out.push("a line label leaves the middle column"); }
      for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) if (hit(box(pills[i]), box(pills[j]))) out.push("line labels overlap");
      const svg = card.querySelector(".mc-links");
      const L = box(svg);
      if (L.l < D.left - 1 || L.r > D.right + 1) out.push("the lines leave the middle column");
      // The finding: at least one red customer row is fully in view in the card.
      if (finding) {
        const rows = [...card.querySelectorAll('.mrow[data-side="customer"][data-state]')];
        if (!rows.length) out.push("no finding on the card");
        else if (!rows.some((r) => { const x = r.getBoundingClientRect(); return x.top >= B.top - 1 && x.bottom <= B.bottom + 1; })) out.push("the finding is scrolled out of view");
      }
    }
    if (shown(monitor) && monitor.scrollWidth > monitor.clientWidth + 1) out.push("the monitor overflows sideways");
    return out;
  }, finding);
}

/** What covers or clips what on the alignment view (empty when every card has its own place). */
async function alignOverlaps(page, opts = {}) {
  // Measured at rest: the drawer slides and the view resizes (the options can open right after the
  // finding), so a measurement counts only if the view kept its size and no CSS transition ran from just
  // before it until a moment after it; a frame in the middle of the drawer's slide is not a layout.
  const atRest = () => page.evaluate(() => {
    const v = document.querySelector('#mirror .mirror-view[data-view="align"]');
    const moving = document.getAnimations().some((a) => a instanceof CSSTransition && a.playState === "running");
    return { size: v ? `${v.clientWidth}x${v.clientHeight}` : "none", moving };
  });
  let last = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.waitForFunction(() => {
      const v = document.querySelector('#mirror .mirror-view[data-view="align"]');
      const size = v ? `${v.clientWidth}x${v.clientHeight}` : "none";
      const moving = document.getAnimations().some((a) => a instanceof CSSTransition && a.playState === "running");
      const same = window.__alignSize === size;
      window.__alignSize = size;
      return same && !moving;
    }, null, { polling: 200, timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(150);
    const before = await atRest();
    last = await measureAlign(page, opts);
    await page.waitForTimeout(300);
    const after = await atRest();
    if (!before.moving && !after.moving && before.size === after.size) return last;
  }
  return last;
}

async function measureAlign(page, { finding = false } = {}) {
  return page.evaluate((finding) => {
    const view = document.querySelector('#mirror .mirror-view[data-view="align"]');
    const out = [];
    const shown = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none" && !el.closest("[hidden]");
    if (!shown(view)) return ["the alignment view is not shown"];
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    const within = (a, B) => a.l >= B.l - 1 && a.r <= B.r + 1 && a.t >= B.t - 1 && a.b <= B.b + 1;
    const V = box(view);
    const name = (el) => el.classList.contains("al-channel") ? `channel ${el.dataset.channel}` : [...el.classList].find((c) => c.startsWith("al-") && c !== "al-card") || el.className;
    const cards = [...view.querySelectorAll(".al-card, .al-impact")].filter(shown);
    for (const c of cards) if (!within(box(c), V)) out.push(`the ${name(c)} card leaves the view`);
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      if (hit(box(cards[i]), box(cards[j]))) out.push(`the ${name(cards[i])} and ${name(cards[j])} cards overlap`);
    }
    for (const sel of ["#mirror .mirror-caption", "#mirror .mirror-tools", "#mirror .legend"]) {
      const el = document.querySelector(sel);
      if (shown(el)) for (const c of cards) if (hit(box(el), box(c))) out.push(`${sel.replace("#mirror .", "")} covers the ${name(c)} card`);
    }
    for (const c of cards) {
      const C = box(c);
      for (const v of c.querySelectorAll(".al-fact, .al-ch-value, .al-ch-status, .al-title, .al-ch-name, .al-impact-text, .al-gate-text, .al-ai-status, .al-train")) {
        if (shown(v) && !within(box(v), C)) out.push(`"${v.textContent.trim().slice(0, 24)}" leaves the ${name(c)} card`);
      }
    }
    for (const head of view.querySelectorAll(".al-head")) if (shown(head) && !within(box(head), V)) out.push("a column head leaves the view");
    // The source's values, each channel's values and the verdict words are read whole, never cut to an
    // ellipsis (the smallest view shows the verdict as a mark only, so it has no word to cut).
    const size = view.querySelector(".align")?.dataset.size || "?";
    const cut = (el) => el.scrollWidth > el.clientWidth + 1;
    for (const f of view.querySelectorAll(".al-fact")) if (shown(f) && cut(f)) out.push(`the source value "${f.textContent.trim()}" is cut (${size})`);
    for (const v of view.querySelectorAll(".al-ch-value")) if (shown(v) && cut(v)) out.push(`the channel value "${v.textContent.trim()}" is cut (${size})`);
    for (const s of view.querySelectorAll(".al-ch-status > span:not(.icon)")) if (shown(s) && cut(s)) out.push(`the verdict "${s.textContent.trim()}" is cut (${size})`);
    if (finding) {
      const red = [...view.querySelectorAll('.al-channel[data-tone="affected"], .al-channel[data-tone="resolved"], .al-channel[data-tone="at-risk"]')].filter(shown);
      if (!red.length) out.push("no finding on the alignment view");
      else if (!red.some((r) => within(box(r), V))) out.push("the finding is out of view");
    }
    return out;
  }, finding);
}

/** The timetables for a measurement, then back to the alignment view. */
async function inTimetables(page, measure) {
  await page.click('#mirror .mirror-tools button:has-text("Timetables")');
  await page.waitForSelector('#mirror .mirror-view[data-view="train"]:not([hidden]) .mrow', { timeout: 5000 });
  await page.waitForTimeout(500);
  const r = await measure();
  await page.click('#mirror .mirror-tools button:has-text("Alignment")');
  await page.waitForTimeout(300);
  return r;
}

async function toOutbox(page) {
  await page.click('.option-card[data-recommended="true"] .btn-approve');
  await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 120000 });
  await page.waitForTimeout(400);
}

/** Starts a simulation and stops at the finding: the mirror's chip reads "Verified against the source". */
async function toFinding(page, scenarioId = null) {
  if (scenarioId) {
    await page.click("#dd-scenario");
    await page.click(`.menu-item[data-id="${scenarioId}"]`);
  }
  await page.click('button[aria-label="Replay speed ×4"]');
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card");
  await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
  await page.waitForFunction(() => document.querySelector("#mirror .cap-chip:not([hidden])")?.textContent === "Verified against the source", null, { timeout: 120000 });
  await page.waitForTimeout(1200);
}

async function toOptions(page, scenarioId = null) {
  if (scenarioId) {
    await page.click("#dd-scenario");
    await page.click(`.menu-item[data-id="${scenarioId}"]`);
  }
  await page.click('button[aria-label="Replay speed ×4"]');
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card");
  await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
  await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
  // The longest status label ("Awaiting your decision") is the one the control bar must fit.
  await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() === "Awaiting your decision", null, { timeout: 30000 });
  await page.waitForTimeout(300);
}

if (wanted("viewports")) {
  for (const [w, h] of [[1920, 1080], [1600, 900], [1536, 864], [1366, 768], [1280, 720]]) {
    const { context, page, errors } = await newPage(w, h);
    const problems = [];
    try {
      const idle = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const headerIdle = await headerGeometry(page);
      const alignIdle = await alignOverlaps(page);
      const mirrorIdle = await inTimetables(page, () => mirrorOverlaps(page));
      await page.screenshot({ path: path.join(OUT, `vp-${w}x${h}-idle.png`) });
      await toFinding(page);
      const alignFinding = await alignOverlaps(page, { finding: true });
      await page.screenshot({ path: path.join(OUT, `vp-${w}x${h}-finding.png`) });
      const mirrorFinding = await inTimetables(page, () => mirrorOverlaps(page, { finding: true }));
      await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
      await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() === "Awaiting your decision", null, { timeout: 30000 });
      await page.waitForTimeout(300);
      const options = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const headerRun = await headerGeometry(page);
      const alignOptions = await alignOverlaps(page, { finding: true });
      await page.screenshot({ path: path.join(OUT, `vp-${w}x${h}-options.png`) });
      const mirrorOptions = await inTimetables(page, () => mirrorOverlaps(page, { finding: true }));
      await toOutbox(page);
      const outbox = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const headerOutbox = await headerGeometry(page);
      const alignOutbox = await alignOverlaps(page, { finding: true });
      await page.screenshot({ path: path.join(OUT, `vp-${w}x${h}-outbox.png`) });
      const mirrorOutbox = await inTimetables(page, () => mirrorOverlaps(page));
      // The decision on the full mirror: the drawer hidden, the re-published channels and rows green.
      await page.click('.drawer button:has-text("Hide")');
      await page.waitForTimeout(900);
      const alignApproved = await alignOverlaps(page, { finding: true });
      await page.screenshot({ path: path.join(OUT, `vp-${w}x${h}-approved.png`) });
      const mirrorApproved = await inTimetables(page, () => mirrorOverlaps(page, { finding: true }));
      // The presenter opens the legend: it docks beside the views (below them on a narrow mirror).
      await page.click('#mirror .mirror-tools button[aria-controls="mirror-legend"]');
      await page.waitForTimeout(600);
      const alignLegend = await alignOverlaps(page);
      await page.screenshot({ path: path.join(OUT, `vp-${w}x${h}-legend.png`) });
      const mirrorLegend = await inTimetables(page, () => mirrorOverlaps(page));
      await page.click('#mirror .mirror-tools button[aria-controls="mirror-legend"]');
      // All trains in the window.
      await page.click('#mirror .mirror-tools button:has-text("All trains")');
      await page.waitForTimeout(500);
      const mirrorMonitor = await mirrorOverlaps(page);
      await page.screenshot({ path: path.join(OUT, `vp-${w}x${h}-monitor.png`) });
      for (const [label, list] of [["idle", alignIdle], ["finding", alignFinding], ["options", alignOptions], ["outbox", alignOutbox], ["approved", alignApproved], ["legend opened", alignLegend]]) {
        for (const p of list) problems.push(`${label}: alignment view: ${p}`);
      }
      for (const [label, list] of [["idle", mirrorIdle], ["finding", mirrorFinding], ["options", mirrorOptions], ["outbox", mirrorOutbox], ["approved", mirrorApproved], ["legend opened", mirrorLegend], ["all trains", mirrorMonitor]]) {
        for (const p of list) problems.push(`${label}: timetables: ${p}`);
      }
      if (idle || options || outbox) problems.push(`horizontal overflow (idle ${idle}, options ${options}, outbox ${outbox})`);
      for (const [label, g] of [["idle", headerIdle], ["options", headerRun], ["outbox", headerOutbox]]) {
        if (g.overlap) problems.push(`${label}: header badges overlap the KPI tiles`);
        if (g.headerHeight > 115) problems.push(`${label}: header grew to ${g.headerHeight} px`);
        if (g.controlsHeight > 70) problems.push(`${label}: control bar wraps (${g.controlsHeight} px)`);
      }
    } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
    problems.push(...errors.map((e) => `page error: ${e}`));
    results.push({ name: `viewport ${w}×${h} (alignment view, timetables, all trains)`, ok: !problems.length, problems });
    await context.close();
  }
}

if (wanted("scenarios")) {
  const problems = [];
  for (const id of ["SC-DIVERSION", "SC-OPSSTOP", "SC-TERMINUS", "SC-COACH", "SC-FPLO"]) {
    const { context, page, errors } = await newPage(1280, 720);
    try {
      await toFinding(page, id);
      const alignFinding = await alignOverlaps(page, { finding: true });
      await page.screenshot({ path: path.join(OUT, `sc-${id}-1280-finding.png`) });
      const mirrorFinding = await inTimetables(page, () => mirrorOverlaps(page, { finding: true }));
      await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
      await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() === "Awaiting your decision", null, { timeout: 30000 });
      await page.waitForTimeout(300);
      const atOptions = await headerGeometry(page);
      const alignOptions = await alignOverlaps(page, { finding: true });
      const mirrorOptions = await inTimetables(page, () => mirrorOverlaps(page, { finding: true }));
      await toOutbox(page);
      const atOutbox = await headerGeometry(page);
      const alignOutbox = await alignOverlaps(page, { finding: true });
      await page.screenshot({ path: path.join(OUT, `sc-${id}-1280-outbox.png`) });
      const mirrorOutbox = await inTimetables(page, () => mirrorOverlaps(page));
      for (const [label, g] of [["options", atOptions], ["outbox", atOutbox]]) {
        if (g.overlap) problems.push(`${id} ${label}: header badges overlap the KPI tiles`);
        if (g.headerHeight > 115) problems.push(`${id} ${label}: header grew to ${g.headerHeight} px`);
      }
      for (const [label, list] of [["finding", alignFinding], ["options", alignOptions], ["outbox", alignOutbox]]) for (const p of list) problems.push(`${id} ${label}: alignment view: ${p}`);
      for (const [label, list] of [["finding", mirrorFinding], ["options", mirrorOptions], ["outbox", mirrorOutbox]]) for (const p of list) problems.push(`${id} ${label}: timetables: ${p}`);
    } catch (e) { problems.push(`${id}: exception: ${String(e.message).split("\n")[0]}`); }
    problems.push(...errors.map((e) => `${id}: page error: ${e}`));
    await context.close();
  }
  // Their findings at 1600×900, where the strip shows the station names.
  for (const id of ["SC-DIVERSION", "SC-OPSSTOP", "SC-TERMINUS", "SC-COACH", "SC-FPLO"]) {
    const { context, page, errors } = await newPage(1600, 900);
    try {
      await toFinding(page, id);
      for (const p of await alignOverlaps(page, { finding: true })) problems.push(`${id} finding at 1600×900: alignment view: ${p}`);
      await page.screenshot({ path: path.join(OUT, `sc-${id}-1600-finding.png`) });
      for (const p of await inTimetables(page, () => mirrorOverlaps(page, { finding: true }))) problems.push(`${id} finding at 1600×900: timetables: ${p}`);
    } catch (e) { problems.push(`${id} at 1600×900: exception: ${String(e.message).split("\n")[0]}`); }
    problems.push(...errors.map((e) => `${id}: page error: ${e}`));
    await context.close();
  }
  results.push({ name: "five more scenarios at 1280×720 (finding, options, outbox) and 1600×900 (finding), alignment view and timetables", ok: !problems.length, problems });
}

if (wanted("targets")) {
  const { context, page, errors } = await newPage(1920, 1080);
  const problems = [];
  const audit = async (label) => {
    // Sizes are taken at rest: entrance animations must have finished.
    await page.waitForFunction(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming?.().iterations !== Infinity).every((a) => a.playState !== "running"), null, { timeout: 5000 }).catch(() => {});
    const small = await page.evaluate(() => {
      const sel = 'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="menuitemradio"]';
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        // Text links inside sentences are exempt: they are part of the prose.
        if (el.tagName === "A" && el.closest("p, li, .result-sources, .report-card, .md")) continue;
        if (r.height < 40 || r.width < 40) out.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute("aria-label") || el.title || "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return [...new Set(out)];
    });
    if (small.length) problems.push(`${label}: ${small.join("; ")}`);
  };
  try {
    await audit("idle");
    await page.click("#btn-about");
    await page.waitForSelector(".intro-modal");
    await audit("intro window");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".intro-modal", { state: "detached" });
    await page.click('button[aria-label="Replay speed ×4"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await audit("mode dialog");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
    await page.waitForTimeout(500);
    await audit("options");
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 120000 });
    await audit("outbox");
    await page.click('button:has-text("Approve all")');
    await page.waitForSelector('button:has-text("Open management summary")', { state: "visible", timeout: 60000 });
    await page.click("#tab-audit");
    await page.waitForTimeout(300);
    await audit("audit");
    await page.click("#btn-diagnostics");
    await page.waitForTimeout(500);
    await audit("Diagnostics");
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  problems.push(...errors.map((e) => `page error: ${e}`));
  results.push({ name: "touch targets ≥ 40 px at 1920×1080", ok: !problems.length, problems });
  await context.close();
}

await browser.close();
await close();
await writeFile(path.join(OUT, "layout-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
}
const allOk = results.length > 0 && results.every((r) => r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} layout checks passed. Screenshots: ${OUT}`);
if (allOk && ONLY.length === 0) console.log("LAYOUT OK");
process.exit(allOk ? 0 : 1);
