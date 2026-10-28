// Smoke tests of the main flows and the failure modes of loading:
//   sim          a full Simulation run (ICE 618's platform change) with the finding on the alignment
//                view and in the timetables, options, the approval's payoff (both views and the KPI
//                tiles), outbox, summary and audit export
//   live         key check (401, then accepted), a model that keeps ending its turn early
//   diag         Diagnostics dialog, custom what-if blocks Simulation
//   intro        first visit opens the intro window; "How it works" reopens it; Start agent leads to the mode choice
//   mirror       the timetable mirror by mouse and keyboard: a scenario's train in the alignment view
//                (its cards with the focus ring), then the timetables: the popovers of both timetables
//                and of a station (Escape returns the focus), the channel chips, the legend and its
//                toggles, focus kept across a redraw, all trains (a row opens its train and the focus
//                follows); every control at least 40 px; nothing loads from outside
//   motion       reduced motion: a Simulation run shows the mirror's final state at once, no motion
//   file         opened from file://: the page explains how to start a server
//   missing-data a data file is missing: the boot screen names it
// Usage: node tests/smoke.mjs [case…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { APP_ROOT, ONLY, outDir, wanted, launchBrowser, serveStatic, NETWORK_NOISE, MOCK_KEY, SKIP_INTRO, KEYS } from "./lib/harness.mjs";

const OUT = await outDir("smoke");
const { base: BASE, blockLocal, close } = await serveStatic(APP_ROOT, 8765);
const browser = await launchBrowser();
const results = [];

async function newPage({ anthropic = null, intro = false, viewport = { width: 1920, height: 1080 }, reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, reducedMotion });
  if (!intro) await context.addInitScript(SKIP_INTRO);
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample || ""}`.trim()));
  });
  const external = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = new URL(route.request().url());
    if (u.host === "api.anthropic.com" && anthropic) return anthropic(route);
    external.push(`${route.request().method()} ${u.host}${u.pathname}`);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const log = { pageErrors: [], consoleErrors: [] };
  page.on("pageerror", (e) => log.pageErrors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") log.consoleErrors.push(m.text()); });
  return { context, page, log, external };
}

/** expectations: [[condition, message], …]; allowConsole: console errors that are part of the case. */
async function finish(name, { context, page, log }, checks, expectations, allowConsole = null) {
  const csp = await page.evaluate(() => window.__csp || []).catch(() => ["<page gone>"]);
  const consoleErrors = log.consoleErrors.filter((t) => !NETWORK_NOISE.test(t) && !(allowConsole && allowConsole.test(t)));
  const problems = expectations.filter(([ok]) => !ok).map(([, msg]) => msg);
  if (checks.FAILED) problems.unshift(`exception: ${checks.FAILED}`);
  const ok = !problems.length && !log.pageErrors.length && !consoleErrors.length && !csp.length;
  results.push({ name, ok, problems, checks, pageErrors: log.pageErrors, consoleErrors, csp });
  await context.close();
}

const shot = (page, file) => page.screenshot({ path: path.join(OUT, file) });
const boot = async (page) => { await page.goto(BASE); await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 }); };
const pickScenario = async (page, id) => { await page.click("#dd-scenario"); await page.click(`.menu-item[data-id="${id}"]`); await page.waitForTimeout(500); };
/**
 * Vici's keyboard focus ring on the element a selector names (the index-th match), focused first: an
 * outline of 2 px or more in the focus colour (--vc-focus), or, on a hexagon, a hexagonal ring that its
 * ::after draws. Runs in the page: page.evaluate(viciRing, [selector, index]). Returns "selector:true".
 */
function viciRing([sel, index = 0]) {
  const el = document.querySelectorAll(sel)[index];
  if (!el) return `${sel}:missing`;
  el.focus();
  const hex = getComputedStyle(document.documentElement).getPropertyValue("--vc-focus").trim();
  const n = parseInt(hex.slice(1), 16);
  const focus = `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  const cs = getComputedStyle(el);
  const ring = getComputedStyle(el, "::after");
  const outline = cs.outlineStyle === "solid" && parseFloat(cs.outlineWidth) >= 2 && cs.outlineColor === focus;
  const hexRing = ring.content !== "none" && ring.opacity === "1" && ring.backgroundColor === focus;
  return `${sel}:${outline || hexRing}`;
}

// ---- sim: full simulation of ICE 618's platform change ---------------------------------------------------
if (wanted("sim")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.waitForTimeout(800);
    checks.bootRemoved = (await page.$("#boot")) === null;
    checks.badgeIdle = (await page.textContent("#mode-badge")).trim();
    checks.disclosure = (await page.textContent(".ai-disclosure")).replace(/\s+/g, " ").trim();
    checks.fontsLoaded = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").length; });
    checks.captionIdle = (await page.textContent("#mirror .mirror-caption strong")).trim();
    await shot(page, "01-idle.png");
    await page.click('button[aria-label="Replay speed ×4"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    await shot(page, "02-mode-choice.png");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForTimeout(2500);
    checks.badgeSim = (await page.textContent("#mode-badge")).trim();
    checks.watermarkVisible = await page.isVisible(".sim-watermark");
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 180000 });
    await page.waitForTimeout(800);
    await shot(page, "03-options.png");
    checks.optionCards = await page.$$eval(".option-card", (els) => els.map((e) => `${e.dataset.kind}:${e.querySelector(".option-total .value")?.textContent}`));
    checks.approveButtonsVisibleWithoutScroll = await page.evaluate(() => {
      const body = document.querySelector(".drawer-body").getBoundingClientRect();
      return [...document.querySelectorAll(".option-actions .btn")].every((b) => { const r = b.getBoundingClientRect(); return r.top >= body.top && r.bottom <= body.bottom; });
    });
    // The finding on the alignment view: every channel contradicts the source, the impact is the
    // verified figure, and the caption says the result was verified against the source.
    checks.finding = await page.evaluate(() => ({
      view: document.getElementById("mirror").dataset.view,
      tones: [...document.querySelectorAll("#mirror .al-channel")].map((c) => c.dataset.tone).join(","),
      impact: document.querySelector("#mirror .al-impact")?.dataset.tone || null,
      chip: document.querySelector("#mirror .cap-chip:not([hidden])")?.textContent || null,
      pax: document.getElementById("kpi-pax-value").textContent
    }));
    // The same finding in the timetables: Köln Hbf's published row contradicts the source, with its line label.
    await page.click('#mirror .mirror-tools button:has-text("Timetables")');
    await page.waitForSelector('#mirror .mrow[data-side="customer"][data-point="KK"]', { timeout: 5000 });
    checks.findingTimetables = await page.evaluate(() => ({
      kk: document.querySelector('#mirror .mrow[data-side="customer"][data-point="KK"]')?.dataset.state || null,
      flag: document.querySelector('#mirror .mrow[data-side="source"][data-point="KK"]')?.dataset.flag || null,
      pill: document.querySelector("#mirror .ml-pill strong")?.textContent || null
    }));
    // A flagged source row keeps its keyboard focus ring with its bar.
    await page.keyboard.press("Shift");
    checks.flagRing = await page.evaluate(viciRing, ['#mirror .mrow[data-side="source"][data-flag]']);
    checks.flagBar = await page.evaluate(() => getComputedStyle(document.querySelector('#mirror .mrow[data-side="source"][data-flag]')).boxShadow);
    await page.click('#mirror .mirror-tools button:has-text("Alignment")');
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    // The mirror follows the decision: the re-published channels turn green, the tiles show what is left.
    await page.waitForSelector('#mirror .al-channel[data-tone="resolved"]', { timeout: 15000 });
    checks.payoff = await page.evaluate(() => ({
      pax: document.getElementById("kpi-pax-value").textContent,
      paxSub: document.getElementById("kpi-pax-sub").textContent,
      firstSub: document.getElementById("kpi-first-sub").textContent,
      tones: [...document.querySelectorAll("#mirror .al-channel")].map((c) => c.dataset.tone).join(",")
    }));
    await page.click('#mirror .mirror-tools button:has-text("Timetables")');
    await page.waitForSelector('#mirror .mrow[data-side="customer"][data-point="KK"][data-state="resolved"]', { timeout: 15000 });
    checks.payoff.pill = await page.evaluate(() => document.querySelector("#mirror .ml-pill")?.dataset.state || null);
    await page.click('#mirror .mirror-tools button:has-text("Alignment")');
    await page.waitForSelector('button:has-text("Approve all")', { state: "visible", timeout: 120000 });
    await page.waitForTimeout(600);
    await shot(page, "04-outbox.png");
    checks.drafts = await page.$$eval(".action-card", (els) => els.length);
    await page.click('button:has-text("Approve all")');
    await page.waitForSelector('button:has-text("Open management summary")', { state: "visible", timeout: 120000 });
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 60000 });
    await page.waitForTimeout(1000);
    checks.statusEnd = (await page.textContent(".status-pill .text")).trim();
    checks.startLabel = (await page.textContent("#btn-start")).trim();
    checks.lastEntryInView = await page.evaluate(() => {
      const log = document.querySelector("#console .log");
      const last = log.lastElementChild.getBoundingClientRect();
      const box = log.getBoundingClientRect();
      return last.bottom <= box.bottom + 2 && last.top >= box.top - 2;
    });
    // The run's facts close the console, one click away: a closed "Replay facts" with the facts inside.
    checks.replayFacts = await page.$$eval("#console .entry", (els) => {
      const d = els.slice(-1)[0]?.querySelector("details.run-facts");
      return !!d && !d.open && d.querySelector("summary")?.textContent.trim() === "Replay facts" && /tool calls/.test(d.querySelector("p")?.textContent || "");
    });
    await shot(page, "05-done.png");
    await page.click('button:has-text("Open management summary")');
    await page.waitForSelector(".report-modal", { timeout: 5000 });
    checks.reportHasSimNote = (await page.textContent(".report-modal")).includes("Simulated run");
    await shot(page, "06-report.png");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    // A presenter's key stored in this tab must not reach the export, even after a simulation.
    await page.evaluate(async (k) => (await import("./js/keystore.js")).setKey(k), MOCK_KEY);
    await page.click("#tab-audit");
    await page.waitForTimeout(400);
    const [download] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Export JSON")')]);
    const audit = JSON.parse(await readFile(await download.path(), "utf8"));
    checks.auditFile = download.suggestedFilename();
    checks.auditMode = audit.mode;
    checks.auditRunFacts = !!audit.run_facts;
    checks.keyStored = await page.evaluate((k) => !!sessionStorage.getItem(k), KEYS.apiKey);
    checks.auditNoKey = checks.keyStored && !JSON.stringify(audit).includes("MOCKKEY") && !JSON.stringify(audit).includes("sk-ant");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "sim-fail.png");
  }
  await finish("sim: full Simulation run", t, checks, [
    [checks.bootRemoved, "boot screen should be removed"],
    [checks.badgeIdle === "No run active", "idle badge"],
    [/You are interacting with an AI system/.test(checks.disclosure || ""), "AI disclosure must be visible"],
    [checks.captionIdle === "ICE 618 · Köln Hbf → Hamburg-Altona", `the mirror opens on the scenario's train (${checks.captionIdle})`],
    [checks.badgeSim === "SIMULATION" && checks.watermarkVisible, "SIMULATION badge and watermark"],
    [checks.optionCards?.length === 4 && checks.optionCards.some((c) => c.startsWith("baseline:")), "three options plus do nothing"],
    [checks.approveButtonsVisibleWithoutScroll, "the option buttons fit at 1080p"],
    [checks.finding?.view === "align" && checks.finding?.tones === "affected,affected,affected,affected" && checks.finding?.impact === "affected" && checks.finding?.chip === "Verified against the source" && checks.finding?.pax === "312",
      `the alignment view shows the verified finding (${JSON.stringify(checks.finding)})`],
    [checks.findingTimetables?.kk === "affected" && checks.findingTimetables?.flag === "affected" && /^Platform/.test(checks.findingTimetables?.pill || ""),
      `the timetables show the same finding (${JSON.stringify(checks.findingTimetables)})`],
    [checks.flagRing?.endsWith(":true") && /inset/.test(checks.flagBar || ""), `a flagged source row shows the focus ring beside its bar (${checks.flagRing}; ${checks.flagBar})`],
    [checks.payoff?.pax === "7" && /was 312/.test(checks.payoff?.paxSub || "") && /^info in 2 min, aligned in 8 min$/.test(checks.payoff?.firstSub || "") && checks.payoff?.tones === "resolved,resolved,resolved,resolved" && checks.payoff?.pill === "resolved",
      `the approval's payoff on the tiles, the alignment view and the timetables (${JSON.stringify(checks.payoff)})`],
    [checks.drafts > 0, "approval must produce drafts"],
    [checks.statusEnd === "Done" && checks.startLabel === "New run", "run ends Done"],
    [checks.lastEntryInView && checks.replayFacts, "console ends on the Replay facts line (closed, the facts inside)"],
    [checks.reportHasSimNote, "summary marked as simulated"],
    [checks.auditMode === "simulation" && checks.auditRunFacts && checks.auditNoKey && /^run-\d{8}-\d{4}-\w+-SIMULATION-audit\.json$/.test(checks.auditFile || ""), `audit export: simulation mode, run facts, no key (${checks.auditFile})`]
  ]);
}

// ---- live: key check and a model that ends its turn early -----------------------------------------
if (wanted("live")) {
  let models = 0;
  let messageCalls = 0;
  const t = await newPage({
    anthropic: async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
      if (req.method() === "POST" && new URL(req.url()).pathname === "/v1/messages") {
        // Ends its turn without finishing the workflow: the app nudges it twice, then stops.
        messageCalls += 1;
        const ev = (e, d) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
        const body = [
          ev("message_start", { type: "message_start", message: { id: `msg_${messageCalls}`, model: "claude-sonnet-5-5", role: "assistant", content: [], usage: { input_tokens: 900, output_tokens: 1 } } }),
          ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
          ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Shall I continue with the check?" } }),
          ev("content_block_stop", { type: "content_block_stop", index: 0 }),
          ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 12 } }),
          ev("message_stop", { type: "message_stop" })
        ].join("");
        return route.fulfill({ status: 200, headers: { ...cors, "content-type": "text/event-stream" }, body });
      }
      models += 1;
      if (models === 1) return route.fulfill({ status: 401, headers: cors, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ data: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }] }) });
    }
  });
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="live"] .mode-cta button');
    await page.waitForSelector("#api-key-input", { timeout: 5000 });
    await page.fill("#api-key-input", MOCK_KEY);
    checks.inputMasked = (await page.getAttribute("#api-key-input", "type")) === "password";
    await shot(page, "10-key-dialog.png");
    await page.click('button:has-text("Check key and continue")');
    await page.waitForFunction(() => /401/.test(document.getElementById("api-key-msg")?.textContent || ""), null, { timeout: 8000 });
    checks.rejectMessage = (await page.textContent("#api-key-msg")).trim();
    await page.click('button:has-text("Check key and continue")');
    await page.waitForSelector("#api-key-input", { state: "detached", timeout: 8000 });
    await page.waitForFunction(() => /Stopped|Done|Error/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 20000 });
    checks.messageCalls = messageCalls;
    checks.nudges = await page.evaluate(() => [...document.querySelectorAll("#console .entry")].filter((e) => /asked it to continue/.test(e.textContent)).length);
    checks.badgeLive = (await page.textContent("#mode-badge")).trim();
    checks.keyInSession = await page.evaluate((k) => Boolean(sessionStorage.getItem(k)), KEYS.apiKey);
    checks.localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
    checks.statusEnd = (await page.textContent(".status-pill .text")).trim();
    checks.keyNotInDom = !(await page.content()).includes("MOCKKEY");
    await shot(page, "11-live-stopped.png");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "live-fail.png");
  }
  await finish("live: key check and early end", t, checks, [
    [checks.inputMasked, "key input must be masked"],
    [/401/.test(checks.rejectMessage || ""), "a rejected key must say 401"],
    [checks.messageCalls === 3 && checks.nudges === 2, `two nudges, then stop (${checks.messageCalls} calls, ${checks.nudges} nudges)`],
    [checks.statusEnd === "Stopped" && checks.badgeLive === "LIVE", "run ends Stopped in Live mode"],
    [checks.keyInSession && !(checks.localStorageKeys || []).some((k) => /key/i.test(k)) && checks.keyNotInDom, "key in session storage only"]
  ]);
}

// ---- diag: Diagnostics and custom what-if --------------------------------------------------------
if (wanted("diag")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.click("#btn-diagnostics");
    await page.waitForFunction(() => document.querySelectorAll('.diag-status[data-s="pass"]').length >= 2, null, { timeout: 10000 });
    await shot(page, "12-diagnostics.png");
    checks.localRows = await page.$$eval(".diag-table tbody tr", (rows) => rows.map((r) => `${r.querySelector("strong")?.textContent}:${r.querySelector(".diag-status")?.dataset.s}`).filter((x) => /World|privacy/.test(x)));
    checks.footer = await page.$eval(".modal-foot .left", (e) => e.textContent.trim());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.click("#dd-scenario");
    await page.click('.menu-item[data-id="custom"]');
    await page.waitForSelector("#custom-scenario");
    await page.fill("#custom-scenario", "Does RE 10109 still stop at Leverkusen Mitte this morning, as the journey planner says?");
    await page.click('button:has-text("Use this scenario")');
    await page.waitForTimeout(300);
    checks.scenarioLabel = (await page.textContent("#dd-scenario")).replace(/\s+/g, " ").trim();
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    checks.simBlocked = await page.getAttribute('.mode-card[data-mode="simulation"]', "aria-disabled");
    await shot(page, "13-custom-mode.png");
    await page.keyboard.press("Escape");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
  }
  await finish("diag: Diagnostics and custom what-if", t, checks, [
    [(checks.localRows || []).length === 2 && checks.localRows.every((x) => x.endsWith(":pass")), `world data and privacy rows pass (${checks.localRows})`],
    [/^Timetable Translator \d+\.\d+\.\d+/.test(checks.footer || ""), `Diagnostics footer shows the version (${checks.footer})`],
    [/Custom/.test(checks.scenarioLabel || ""), "custom what-if selected"],
    [checks.simBlocked === "true", "custom what-ifs cannot run as Simulation"]
  ]);
}

// ---- intro: first visit opens the intro window; "How it works" reopens it ----------------------------
if (wanted("intro")) {
  const t = await newPage({ intro: true });
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.waitForSelector(".intro-modal", { timeout: 5000 });
    checks.autoOpened = true;
    checks.title = (await page.textContent(".intro-modal h2")).trim();
    checks.steps = await page.$$eval(".intro-step-title", (els) => els.map((e) => e.textContent));
    checks.values = await page.$$eval(".intro-value strong", (els) => els.map((e) => e.textContent));
    checks.words = await page.$eval(".intro-modal", (e) => e.innerText.split(/\s+/).filter(Boolean).length);
    checks.fits = await page.$eval(".intro-modal", (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    await page.waitForTimeout(200);
    checks.focus = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await shot(page, "20-intro.png");
    await page.click('.intro-modal .modal-foot button:has-text("Close")');
    await page.waitForSelector(".intro-modal", { state: "detached", timeout: 3000 });
    checks.flag = await page.evaluate((k) => localStorage.getItem(k), KEYS.introSeen);
    await page.reload();
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    await page.waitForTimeout(800);
    checks.reopenedOnReload = await page.isVisible(".intro-modal");
    checks.buttonLabel = (await page.textContent("#btn-about")).trim();
    await page.click("#btn-about");
    await page.waitForSelector(".intro-modal", { timeout: 3000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector(".intro-modal", { state: "detached", timeout: 3000 });
    await page.click("#btn-about");
    await page.click('.intro-modal .modal-foot button:has-text("Start agent")');
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.startOpensModeChoice = await page.$$eval(".mode-card", (els) => els.map((e) => e.dataset.mode).join(","));
    // During a run the window only explains: Close is its only button and the run carries on.
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForTimeout(1200);
    await page.click("#btn-about");
    await page.waitForSelector(".intro-modal", { timeout: 3000 });
    checks.duringRunButtons = await page.$$eval(".intro-modal .modal-foot button", (els) => els.map((e) => e.textContent.trim()));
    await page.keyboard.press("Escape");
    checks.statusAfterClose = (await page.textContent(".status-pill .text")).trim();
    await page.click("#btn-abort");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "intro-fail.png");
  }
  await finish("intro: first visit, reopen, start", t, checks, [
    [checks.autoOpened && checks.title === "How the Timetable Translator works", `the intro opens by itself on the first visit (${checks.title})`],
    [checks.steps?.join(",") === "Spot,Check,Calculate,Propose,Prepare" && checks.values?.length === 3, "five steps and three value points"],
    [checks.words <= 230, `the intro stays brief (${checks.words} words)`],
    [checks.fits, "the intro fits the screen"],
    [checks.focus === "Start agent", "the main button has focus"],
    [checks.flag === "1" && checks.reopenedOnReload === false, "once closed, it does not open again on reload"],
    [checks.buttonLabel === "How it works", "header button labelled How it works"],
    [checks.startOpensModeChoice === "simulation,live", "Start agent in the intro opens the mode choice"],
    [JSON.stringify(checks.duringRunButtons) === '["Close"]' && /Spotting|Assessing|Checking|Calculating|Proposing/.test(checks.statusAfterClose || ""), `during a run: Close only, and the run carries on (${checks.duringRunButtons}, ${checks.statusAfterClose})`]
  ]);
}

// ---- mirror: the timetable mirror by mouse and keyboard ------------------------------------------------------
if (wanted("mirror")) {
  const t = await newPage();
  const { page, external } = t;
  const checks = {};
  const active = () => page.evaluate(() => { const a = document.activeElement; return a ? `${a.className}|${a.dataset.side || ""}|${a.dataset.point || ""}` : "none"; });
  try {
    await boot(page);
    await pickScenario(page, "SC-DIVERSION");
    // The alignment view opens first; its cards are buttons with the focus ring, and a card opens the timetables.
    await page.keyboard.press("Shift");
    checks.alignRings = [];
    for (const sel of ["#mirror .al-source", "#mirror .al-channel"]) checks.alignRings.push(await page.evaluate(viciRing, [sel]));
    checks.alignView = `${await page.$eval("#mirror", (m) => m.dataset.view)}:${(await page.textContent("#mirror .mirror-caption strong")).trim()}`;
    await page.click('#mirror .mirror-tools button:has-text("Timetables")');
    await page.waitForSelector('#mirror .mrow[data-side="source"]', { timeout: 5000 });
    checks.caption = (await page.textContent("#mirror .mirror-caption strong")).trim();
    checks.sub = (await page.textContent("#mirror .cap-sub")).trim();
    checks.rows = await page.evaluate(() => ({
      source: document.querySelectorAll('#mirror .mrow[data-side="source"]').length,
      customer: [...document.querySelectorAll('#mirror .mrow[data-side="customer"]')].map((b) => `${b.dataset.point}:${b.dataset.status}`).join(","),
      links: document.querySelectorAll("#mirror .mc-links .ml").length,
      ends: document.querySelectorAll("#mirror .mc-links .ml-end").length,
      routePub: !!document.querySelector("#mirror .strip .route-pub"),
      trainPos: document.querySelector("#mirror .strip .train-pos")?.dataset.state || null
    }));
    await shot(page, "14-mirror-train.png");
    // Keyboard: a source row opens its record; Escape closes it and gives the focus back.
    await page.focus('#mirror .mrow[data-side="source"][data-point="KK"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector("#mirror .mirror-pop:not([hidden])", { timeout: 3000 });
    checks.srcPop = (await page.textContent("#mirror .mirror-pop .pop-title")).trim();
    checks.srcPopText = (await page.textContent("#mirror .mirror-pop")).replace(/\s+/g, " ");
    checks.popFocused = await page.evaluate(() => document.querySelector("#mirror .mirror-pop").contains(document.activeElement));
    checks.popTip = await page.$eval("#mirror .mirror-pop", (e) => e.dataset.tip || "none");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    checks.popClosed = await page.$eval("#mirror .mirror-pop", (e) => e.hidden);
    checks.focusBack = await active();
    // A published row the source no longer serves, and a station of the corridor strip.
    await page.click('#mirror .mrow[data-side="customer"][data-point="KW"]');
    await page.waitForSelector("#mirror .mirror-pop:not([hidden])");
    checks.custPop = (await page.textContent("#mirror .mirror-pop")).replace(/\s+/g, " ");
    await shot(page, "15-mirror-customer-pop.png");
    await page.click('#mirror .strip-hit[aria-label^="Essen Hbf (EE)"]');
    await page.waitForTimeout(200);
    checks.stationPop = (await page.textContent("#mirror .mirror-pop .pop-title")).trim();
    await page.keyboard.press("Escape");
    // The channel chips: the right column shows the channel picked.
    await page.click('#mirror .ch-chip:has-text("Displays")');
    await page.waitForTimeout(300);
    checks.channel = await page.evaluate(() => ({
      card: document.querySelector("#mirror .mcard").dataset.channel,
      pressed: [...document.querySelectorAll("#mirror .ch-chip")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.querySelector(".ch-name").textContent).join(",")
    }));
    // The legend docks beside the views; Passes hides the points the train passes; Escape closes it.
    await page.click('#mirror .mirror-tools button:has-text("Legend")');
    await page.waitForSelector("#mirror-legend:not([hidden])");
    await page.waitForTimeout(300);
    checks.legend = await page.evaluate(() => {
      const l = document.getElementById("mirror-legend").getBoundingClientRect();
      const v = document.querySelector('#mirror .mirror-view[data-view="train"]').getBoundingClientRect();
      return { docked: v.right <= l.left + 1, focused: document.getElementById("mirror-legend").contains(document.activeElement), expanded: document.querySelector('#mirror .mirror-tools button[aria-controls="mirror-legend"]').getAttribute("aria-expanded") };
    });
    await shot(page, "16-mirror-legend.png");
    // Whether the passing points show depends on the room (the mirror decides); the toggle overrides it both ways.
    const count = () => page.$$eval('#mirror .mrow[data-side="source"]', (els) => els.length);
    const n0 = await count();
    await page.click('#mirror-legend .legend-chip:has-text("Passes")');
    await page.waitForTimeout(300);
    const n1 = await count();
    await page.click('#mirror-legend .legend-chip:has-text("Passes")');
    await page.waitForTimeout(300);
    checks.passes = `${n0}→${n1}→${await count()}`;
    await page.focus("#mirror-legend");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    checks.legendClosed = `${await page.$eval("#mirror-legend", (e) => e.hidden)}:${await page.evaluate(() => document.activeElement?.getAttribute("aria-controls"))}`;
    // Keyboard focus survives a redraw (the panel resizes), and the popover gives it back after one.
    await page.focus('#mirror .mrow[data-side="source"][data-point="EDO"]');
    await page.setViewportSize({ width: 1920, height: 1060 });
    await page.waitForTimeout(400);
    checks.focusKept = await active();
    await page.keyboard.press("Enter");
    await page.waitForSelector("#mirror .mirror-pop:not([hidden])");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    checks.focusBackAfterRedraw = await active();
    // A visible focus ring on the mirror's own buttons: Vici's ring in the focus colour, an outline on
    // rectangles and a hexagonal ring (::after) on hexagons; their shadows must not hide it.
    await page.keyboard.press("Shift");
    checks.rings = [];
    for (const sel of ["#mirror .mirror-tools button", '#mirror .mrow[data-side="source"]', '#mirror .mrow[data-side="customer"]', "#mirror .ch-chip", "#mirror .strip-hit"]) checks.rings.push(await page.evaluate(viciRing, [sel]));
    // The sync monitor: every train in the window, first departure first; a row opens its train and
    // the keyboard focus moves into the card.
    await page.click('#mirror .mirror-tools button:has-text("All trains")');
    await page.waitForSelector('#mirror .mirror-view[data-view="monitor"]:not([hidden])');
    await page.waitForTimeout(300);
    checks.monitor = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#mirror .mon-row")];
      const first = rows.map((r) => (r.querySelector(".mon-run span")?.textContent.match(/\d\d:\d\d/) || [""])[0]);
      return { n: rows.length, sorted: first.every((x, i) => i === 0 || x >= first[i - 1]), caption: document.querySelector("#mirror .mirror-caption strong").textContent, sev: rows.find((r) => /Bus SEV/.test(r.textContent))?.querySelector(".mon-src span")?.textContent || null };
    });
    await shot(page, "17-mirror-monitor.png");
    await page.keyboard.press("Shift");
    checks.rings.push(await page.evaluate(viciRing, ["#mirror .mon-row", 3]));
    const row1026 = await page.evaluateHandle(() => [...document.querySelectorAll("#mirror .mon-row")].find((r) => r.querySelector(".mon-train strong")?.textContent === "ICE 1026"));
    await row1026.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    checks.afterRow = `${await page.$eval("#mirror", (m) => m.dataset.view)}:${(await page.textContent("#mirror .mirror-caption strong")).trim()}`;
    checks.focusAfterRow = await active();
    // Every mirror control is at least 40 px; a timetable row at least 40 px high.
    checks.small = await page.evaluate(() => [...document.querySelectorAll("#mirror button")].filter((b) => b.offsetParent).filter((b) => { const r = b.getBoundingClientRect(); return r.width < 40 || r.height < 40; }).map((b) => b.getAttribute("aria-label") || b.textContent));
    checks.external = external.slice();
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "mirror-fail.png");
  }
  await finish("mirror: alignment, timetables, popovers, legend, all trains", t, checks, [
    [checks.alignView === "align:ICE 1022 · Berlin Hbf → Köln Hbf" && (checks.alignRings || []).every((r) => r.endsWith(":true")), `the alignment view opens on the chosen scenario's train, its cards with the focus ring (${checks.alignView}; ${checks.alignRings})`],
    [checks.caption === "ICE 1022 · Berlin Hbf → Köln Hbf" && /^Source v2 \(OPS-03, 07:08\) · Planner v1 · Displays v1/.test(checks.sub || ""), `the timetables show the same train (${checks.caption}; ${checks.sub})`],
    [checks.rows?.source === 11 && /EHG:/.test(checks.rows?.customer || "") && /KW:/.test(checks.rows?.customer || "") && checks.rows?.links >= 6 && checks.rows?.ends >= 2,
      `source rows, the published rows with their lines and the stop marks (${JSON.stringify(checks.rows)})`],
    [checks.rows?.routePub && checks.rows?.trainPos, "the strip shows the published route beside today's and the train's position"],
    [checks.srcPop === "Köln Hbf (KK)" && /Betriebsfahrplan, source version 2/.test(checks.srcPopText || "") && checks.popFocused && checks.popTip !== "none", `a source row's record opens by keyboard (${checks.srcPop}, tip ${checks.popTip})`],
    [checks.popClosed && /mrow\|source\|KK/.test(checks.focusBack || ""), `Escape closes it and returns the focus (${checks.focusBack})`],
    [/Wuppertal Hbf/.test(checks.custPop || "") && /Source says/.test(checks.custPop || "") && /stop cancelled/.test(checks.custPop || ""), "a published row compares every channel with what the source says"],
    [checks.stationPop === "Essen Hbf", `a station of the strip opens its details (${checks.stationPop})`],
    [checks.channel?.card === "displays" && checks.channel?.pressed === "Displays", `a channel chip switches the published column (${JSON.stringify(checks.channel)})`],
    [checks.legend?.docked && checks.legend?.focused && checks.legend?.expanded === "true", `the legend docks beside the views and takes the focus (${JSON.stringify(checks.legend)})`],
    [checks.passes === "11→5→11" || checks.passes === "5→11→5", `Passes shows or hides the points the train passes (${checks.passes})`],
    [checks.legendClosed === "true:mirror-legend", `Escape closes the legend and returns the focus to its button (${checks.legendClosed})`],
    [/mrow\|source\|EDO/.test(checks.focusKept || "") && /mrow\|source\|EDO/.test(checks.focusBackAfterRedraw || ""), `focus survives a redraw, and the popover gives it back after one (${checks.focusKept}; ${checks.focusBackAfterRedraw})`],
    [(checks.rings || []).length === 6 && checks.rings.every((r) => r.endsWith(":true")), `the mirror's buttons show the focus ring (${checks.rings})`],
    [checks.monitor?.n === 34 && checks.monitor?.sorted && /^All trains: 34 in the next/.test(checks.monitor?.caption || "") && checks.monitor?.sev === "created by OPS-03", `all trains: 34, first departure first (${JSON.stringify(checks.monitor)})`],
    [checks.afterRow === "train:ICE 1026 · Berlin Hbf → Köln Hbf" && /mrow\|source\|/.test(checks.focusAfterRow || ""), `a monitor row opens its train and the focus follows (${checks.afterRow}; ${checks.focusAfterRow})`],
    [(checks.small || []).length === 0, `every mirror control is at least 40 px (${checks.small})`],
    [(checks.external || []).length === 0, `nothing loads from outside (${checks.external})`]
  ]);
}

// ---- motion: reduced motion shows the final state at once ---------------------------------------------------
if (wanted("motion")) {
  const t = await newPage({ reducedMotion: "reduce" });
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.click('button[aria-label="Replay speed ×4"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector(".option-card", { state: "visible", timeout: 180000 });
    await page.waitForTimeout(300);
    // The finding is on the mirror straight away, and no mirror element animates (no pulse, no
    // running lines, no flash).
    checks.kk = await page.evaluate(() => [...document.querySelectorAll("#mirror .al-channel")].map((c) => c.dataset.tone).join(","));
    checks.animations = await page.evaluate(() => document.getAnimations().filter((a) => document.querySelector("#mirror")?.contains(a.effect?.target) && a.playState === "running").map((a) => `${a.effect?.target?.className?.baseVal ?? a.effect?.target?.className}:${a.animationName || a.transitionProperty || a.constructor.name}`));
    await shot(page, "18-reduced-motion.png");
    await page.click("#btn-abort");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "motion-fail.png");
  }
  await finish("motion: reduced motion", t, checks, [
    [checks.kk === "affected,affected,affected,affected", `the alignment view shows the finding (${checks.kk})`],
    [(checks.animations || []).length === 0, `no animation on the mirror (${JSON.stringify(checks.animations)})`]
  ]);
}

// ---- file: opened from disk ---------------------------------------------------------------------------
if (wanted("file")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await page.goto(`file://${APP_ROOT}/index.html`);
    await page.waitForTimeout(7000);
    checks.bootPresent = (await page.$("#boot")) !== null;
    checks.helpVisible = await page.evaluate(() => getComputedStyle(document.querySelector(".boot-help")).visibility === "visible");
    await shot(page, "19-file-protocol.png");
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  await finish("file: page explains how to start a server", t, checks, [[checks.bootPresent && checks.helpVisible, "boot help visible"]], /blocked by CORS policy|Cross origin requests/);
}

// ---- missing-data: a data file did not deploy ------------------------------------------------------------
if (wanted("missing-data")) {
  blockLocal.add("/data/sim_runs.js");
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await page.goto(BASE);
    await page.waitForSelector('#boot[data-state="failed"]', { timeout: 15000 });
    checks.detail = (await page.textContent("#boot-detail")).trim();
    await shot(page, "21-missing-data.png");
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  blockLocal.delete("/data/sim_runs.js");
  await finish("missing-data: boot screen names the file", t, checks, [[/data\/sim_runs\.js/.test(checks.detail || ""), "missing file named"]], /Start-up failed/);
}

await browser.close();
await close();
await writeFile(path.join(OUT, "smoke-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
  if (r.pageErrors.length || r.consoleErrors.length || r.csp.length) console.log(`      errors: ${JSON.stringify({ page: r.pageErrors, console: r.consoleErrors, csp: r.csp }).slice(0, 400)}`);
}
const passedAll = results.length > 0 && results.every((r) => r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} smoke cases passed. Screenshots: ${OUT}`);
if (passedAll && ONLY.length === 0) console.log("SMOKE OK");
process.exit(passedAll ? 0 : 1);
