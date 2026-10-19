// The five-minute pitch, checked as the audience sees it. Every expected figure is worked out here,
// in Node, by the sync engine from the same world (never typed into this file), and compared with the
// page:
//   idle       the alignment view is the mirror's first view: the pitch train's source values beside
//              what each channel tells passengers, every channel "Not checked yet", no verdict, no
//              impact; the timetables and all-trains views are one click away and back
//   run        during the run the view shows what the AI reads (source, channels, sensors), a channel it
//              has read waits as "Read, not compared yet", the first estimate judges the journey planner
//              only, and the verified result marks every channel
//              that contradicts the source, the sensors confirm it, and the impact line carries the
//              engine's figure with the first affected moment; the decision card waits for you
//   decisions  after each decision the view shows what is left: re-publishing aligns every channel
//              (the old value struck, the source's value after it), messages leave the data wrong,
//              overrides are a second truth, an accepted risk turns amber with the hand while the
//              impact line stays red; the impact line follows every decision
//   timing     at replay speed ×1 the run reaches the decision within 60 seconds, with at most eight
//              narration paragraphs of at most 240 characters before it
//   captions   every tool call in the console carries a plain sentence of what it reads or calculates
//   intro      the first visit's window says what it does (the engine's example), how the AI aligns
//              the information (five steps) and what it achieves (three outcomes), without scrolling
//              at 1280×720, 1600×900 and 1920×1080
//   cards      option cards carry one big figure (still misinformed) and three plain rows; the KPI
//              tiles speak of alignment after the decision; the passenger message is the first draft
// Usage: node tests/pitch.mjs [case…]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { APP_ROOT, ONLY, outDir, launchBrowser, serveStatic, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";

const OUT = await outDir("pitch");

// ---- the engine's own figures for the pitch scenario --------------------------------------------------
const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ["data/world.js", "data/scenarios.js", "data/reference_cases.js"]) vm.runInContext(fs.readFileSync(path.join(APP_ROOT, f), "utf8"), sandbox);
const { WORLD, SCENARIOS, REFERENCE_CASES: REF } = JSON.parse(JSON.stringify(sandbox.window));
const { buildModel } = await mod("js/world.js");
const { simulateSync, compactForModel } = await mod("js/sync.js");
const { alignmentData, sensorReadings } = await mod("js/align_data.js");
const model = buildModel(WORLD);
const SC = SCENARIOS.find((s) => s.start_here);
if (!SC) { console.log("FAIL  no scenario is marked start_here"); process.exit(1); }
const TRAIN = SC.train_id;
const finding = simulateSync(model, structuredClone(REF[SC.id].finding));
const idle = alignmentData(model, TRAIN);
const verified = alignmentData(model, TRAIN, { result: compactForModel(finding), basisKey: "verified" });
const variant = Object.fromEntries(finding.variants.map((v) => [v.variant_id, v]));
const BASE_PAX = finding.baseline.misinformed_pax;
const FIRST_MIN = finding.baseline.first_event_min;
const SENSORS = sensorReadings(model, TRAIN, WORLD.observations.map((o) => o.point)).map((r) => r.text);
const wrongChannels = verified.channels.filter((c) => c.verdict === "wrong").map((c) => c.channel);

const { base: BASE, close } = await serveStatic(APP_ROOT, 8772);
const browser = await launchBrowser();
const results = [];
const run = (name) => ONLY.length === 0 || ONLY.includes(name);

async function newPage({ intro = false, viewport = { width: 1600, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport });
  if (!intro) await context.addInitScript(SKIP_INTRO);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
  // A log of every state the alignment view showed, so a test never depends on catching a moment.
  await context.addInitScript(() => {
    window.__align = [];
    const snap = () => {
      const chans = [...document.querySelectorAll("#mirror .al-channel")].map((c) => `${c.dataset.channel}:${c.dataset.tone}:${c.dataset.reading}:${c.dataset.read}:${c.querySelector(".al-ch-status")?.textContent.trim()}`);
      const src = document.querySelector("#mirror .al-source");
      const sen = document.querySelector("#mirror .al-sensors");
      const line = `${chans.join(",")}|src:${src?.dataset.reading}:${src?.dataset.read}|sen:${sen?.dataset.reading}:${sen?.dataset.read}|gate:${document.querySelector("#mirror .al-gate")?.dataset.state}`;
      if (window.__align[window.__align.length - 1] !== line) window.__align.push(line);
    };
    new MutationObserver(snap).observe(document, { subtree: true, attributes: true, childList: true, attributeFilter: ["data-tone", "data-reading", "data-read", "data-state"] });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  return { context, page, errors };
}

const alignState = (page) => page.evaluate(() => ({
  view: document.getElementById("mirror").dataset.view,
  pressed: [...document.querySelectorAll("#mirror .mirror-tools .btn[aria-pressed='true']")].map((b) => b.textContent.trim()),
  facts: [...document.querySelectorAll("#mirror .al-source .al-fact")].map((e) => e.textContent.trim()),
  channels: [...document.querySelectorAll("#mirror .al-channel")].map((c) => ({
    channel: c.dataset.channel, name: c.querySelector(".al-ch-name").textContent.trim(), tone: c.dataset.tone, verdict: c.dataset.verdict,
    values: [...c.querySelectorAll(".al-ch-value")].map((v) => v.textContent.replace(/\s+/g, " ").trim()),
    status: c.querySelector(".al-ch-status").textContent.trim()
  })),
  sensors: [...document.querySelectorAll("#mirror .al-sensors .al-obs li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()),
  sensorTag: document.querySelector("#mirror .al-sensors .al-tag:not([hidden])")?.textContent.trim() || "",
  impact: { tone: document.querySelector("#mirror .al-impact").dataset.tone, text: document.querySelector("#mirror .al-impact").textContent.replace(/\s+/g, " ").trim() },
  gate: { state: document.querySelector("#mirror .al-gate").dataset.state, text: document.querySelector("#mirror .al-gate-text").textContent.trim() },
  ai: document.querySelector("#mirror .al-ai-status").textContent.trim()
}));

async function startSimulation(page, speed) {
  await page.click(`button[aria-label="Replay speed ×${speed}"]`);
  await page.click("#dd-scenario");
  await page.click(`.menu-item[data-id="${SC.id}"]`);
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  const t0 = Date.now();
  await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
  return t0;
}
const waitOptions = (page, timeout = 120000) => page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout });
const letterOf = (v) => ({ V1: "A", V2: "B", V3: "C" }[v]);

function finish(name, checks, problems, errors) {
  if (errors.length) problems.push(`page errors: ${errors.join(" | ")}`);
  const ok = !problems.length;
  results.push({ name, ok });
  console.log(`\n# ${name}: ${ok ? "PASS" : "FAIL"}`);
  for (const [k, v] of Object.entries(checks)) console.log(`  ${k}: ${JSON.stringify(v)}`);
  for (const p of problems) console.log(`  FAIL  ${p}`);
  if (ok) console.log(`PITCH ${name} OK`);
}

// ---- idle ----------------------------------------------------------------------------------------------
if (run("idle")) {
  const { context, page, errors } = await newPage();
  const checks = {};
  const problems = [];
  try {
    checks.state = await alignState(page);
    const s = checks.state;
    if (s.view !== "align") problems.push(`the mirror opens on "${s.view}", not the alignment view`);
    if (s.pressed.join() !== "Alignment") problems.push(`pressed view buttons: ${s.pressed.join(", ")}`);
    const wantFacts = idle.facts.map((f) => f.source);
    if (s.facts.join("|") !== wantFacts.join("|")) problems.push(`source facts ${s.facts.join(", ")} (the engine: ${wantFacts.join(", ")})`);
    const want = idle.channels.map((c) => `${c.label}=${c.values.map((v) => v.text).join("+")}`);
    const got = s.channels.map((c) => `${c.name}=${c.values.join("+")}`);
    if (got.join("|") !== want.join("|")) problems.push(`channels ${got.join(", ")} (the engine: ${want.join(", ")})`);
    if (!idle.channels.some((c) => c.values.some((v) => !v.ok))) problems.push("the pitch train shows no difference between the source and the channels");
    if (s.channels.some((c) => c.tone !== "muted" || c.status !== "Not checked yet")) problems.push(`a channel has a verdict before any check: ${JSON.stringify(s.channels.map((c) => `${c.channel}:${c.tone}:${c.status}`))}`);
    if (s.impact.tone !== "muted" || !/not calculated yet/.test(s.impact.text)) problems.push(`impact before the run: ${JSON.stringify(s.impact)}`);
    if (s.gate.state !== "idle" || !/Nothing goes out without your approval/.test(s.gate.text)) problems.push(`decision card: ${JSON.stringify(s.gate)}`);
    if (!/Waiting for a lead/.test(s.ai)) problems.push(`AI card: ${s.ai}`);
    await page.screenshot({ path: path.join(OUT, "idle-1600.png") });
    // One click to the timetables and to all trains, and back.
    await page.click('#mirror .mirror-tools button:has-text("Timetables")');
    await page.waitForSelector('#mirror .mirror-view[data-view="train"]:not([hidden]) .mrow[data-side="source"]');
    await page.click('#mirror .mirror-tools button:has-text("All trains")');
    await page.waitForSelector('#mirror .mirror-view[data-view="monitor"]:not([hidden]) .mon-row');
    await page.click('#mirror .mirror-tools button:has-text("Alignment")');
    await page.waitForSelector('#mirror .mirror-view[data-view="align"]:not([hidden]) .al-channel');
    // A channel card opens that channel's timetable.
    await page.click('#mirror .al-channel[data-channel="displays"]');
    await page.waitForSelector('#mirror .mirror-view[data-view="train"]:not([hidden])');
    checks.channelOpens = await page.$eval("#mirror .mcard", (el) => el.dataset.channel);
    if (checks.channelOpens !== "displays") problems.push(`the displays card opened the ${checks.channelOpens} timetable`);
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  finish("idle", checks, problems, errors);
  await context.close();
}

// ---- run -----------------------------------------------------------------------------------------------
if (run("run")) {
  const { context, page, errors } = await newPage();
  const checks = {};
  const problems = [];
  try {
    await startSimulation(page, 2);
    await waitOptions(page);
    await page.click('.drawer button:has-text("Hide")').catch(() => {});
    await page.waitForTimeout(700);
    const s = await alignState(page);
    checks.atDecision = { channels: s.channels.map((c) => `${c.channel}:${c.tone}`), sensors: s.sensors, impact: s.impact, gate: s.gate.state };
    const log = await page.evaluate(() => window.__align);
    checks.logLength = log.length;
    // The first estimate judged the journey planner only: the planner red while the others were not yet checked.
    const partial = log.some((l) => /planner:affected/.test(l) && /displays:muted/.test(l) && /announcements:muted/.test(l));
    if (!partial) problems.push("no moment showed the first estimate (planner wrong, the other channels not yet checked)");
    if (!log.some((l) => /src:true/.test(l))) problems.push("the source card never showed that the AI was reading it");
    if (!log.some((l) => /:checking:true/.test(l))) problems.push("no channel card ever showed that the AI was reading it");
    // A channel the AI has read waits for the engine's comparison before it gets a verdict and a colour.
    if (!log.some((l) => /displays:muted:false:true:Read, not compared yet/.test(l))) problems.push("no moment showed a channel the AI had read but the engine had not yet compared");
    if (!log.some((l) => /sen:true/.test(l))) problems.push("the sensor card never showed that the AI was reading the sensors");
    // At the decision: every channel the engine finds wrong is red; the sensors confirm; the impact is the engine's.
    const tone = Object.fromEntries(s.channels.map((c) => [c.channel, c.tone]));
    for (const ch of wrongChannels) if (tone[ch] !== "affected") problems.push(`${ch} is ${tone[ch]}, the engine finds it wrong`);
    for (const c of s.channels) if (!wrongChannels.includes(c.channel) && c.tone === "affected") problems.push(`${c.channel} is red, the engine finds it right`);
    for (const c of s.channels.filter((x) => x.tone === "affected")) if (c.status !== "Contradicts the source") problems.push(`${c.channel} says "${c.status}"`);
    const wantSensors = SENSORS.slice(0, 2);
    if (!wantSensors.every((t) => s.sensors.some((x) => x.includes(t)))) problems.push(`sensors ${JSON.stringify(s.sensors)} (expected ${JSON.stringify(wantSensors)})`);
    if (s.sensorTag !== "Confirms the source") problems.push(`sensor tag "${s.sensorTag}"`);
    if (s.impact.tone !== "affected" || !s.impact.text.startsWith(`${BASE_PAX} passengers would act on wrong information`) || !s.impact.text.includes(`the first in ${FIRST_MIN} min`)) problems.push(`impact ${JSON.stringify(s.impact)} (the engine: ${BASE_PAX}, first in ${FIRST_MIN} min)`);
    if (s.gate.state !== "yours" || !/Your decision/.test(s.gate.text)) problems.push(`decision card ${JSON.stringify(s.gate)}`);
    await page.screenshot({ path: path.join(OUT, "run-decision.png") });
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  finish("run", checks, problems, errors);
  await context.close();
}

// ---- decisions -----------------------------------------------------------------------------------------
if (run("decisions")) {
  const checks = {};
  const problems = [];
  const errorsAll = [];
  for (const choice of ["V1", "V2", "V3", "baseline"]) {
    const { context, page, errors } = await newPage();
    try {
      await startSimulation(page, 4);
      await waitOptions(page);
      if (choice === "baseline") await page.click('.option-card[data-kind="baseline"] .option-actions .btn');
      else await page.click(`.option-card[aria-label^="Option ${letterOf(choice)}:"] .btn-approve`);
      await page.waitForSelector(".action-card[data-status='pending']", { timeout: 60000 });
      await page.waitForTimeout(600);
      const s = await alignState(page);
      checks[choice] = { channels: s.channels.map((c) => `${c.channel}:${c.tone}:${c.status}:${c.values.join("+")}`), impact: s.impact, gate: s.gate };
      const wrong = s.channels.filter((c) => wrongChannels.includes(c.channel));
      const v = variant[choice];
      if (choice === "V1") {
        for (const c of wrong) {
          // Approved, not published: the prototype is connected to nothing, so the card says what was decided.
          if (c.tone !== "resolved" || c.status !== "Re-publication approved") problems.push(`V1: ${c.channel} ${c.tone} "${c.status}"`);
          if (!c.values.some((x) => x.includes("→"))) problems.push(`V1: ${c.channel} does not show the value it becomes (${c.values.join(", ")})`);
        }
        const want = `${v.misinformed_pax} still misinformed with option A (was ${BASE_PAX})`;
        if (s.impact.tone !== "resolved" || !s.impact.text.startsWith(want) || !s.impact.text.includes(`every channel aligned after ${v.time_to_sync_min} min`)) problems.push(`V1 impact ${JSON.stringify(s.impact)} (the engine: ${want}, aligned after ${v.time_to_sync_min} min)`);
      } else if (choice === "V2") {
        for (const c of wrong) if (c.tone !== "at-risk" || c.status !== "Data still wrong") problems.push(`V2: ${c.channel} ${c.tone} "${c.status}"`);
        if (s.impact.tone !== "at-risk" || !s.impact.text.startsWith(`${v.misinformed_pax} still misinformed with option B (was ${BASE_PAX})`) || !/data not aligned/.test(s.impact.text)) problems.push(`V2 impact ${JSON.stringify(s.impact)}`);
      } else if (choice === "V3") {
        for (const c of wrong) {
          const want = ["displays", "announcements"].includes(c.channel) ? "Override approved: a second truth" : "Data still wrong";
          if (c.tone !== "at-risk" || c.status !== want) problems.push(`V3: ${c.channel} ${c.tone} "${c.status}" (expected "${want}")`);
        }
        if (s.impact.tone !== "at-risk" || !s.impact.text.startsWith(`${v.misinformed_pax} still misinformed with option C (was ${BASE_PAX})`) || !s.impact.text.includes(`${v.manual_overrides} values kept by hand`)) problems.push(`V3 impact ${JSON.stringify(s.impact)}`);
      } else {
        for (const c of wrong) if (c.tone !== "at-risk" || c.status !== "Wrong: risk accepted") problems.push(`baseline: ${c.channel} ${c.tone} "${c.status}"`);
        if (s.impact.tone !== "affected" || !/risk accepted, nothing changes/.test(s.impact.text) || !s.impact.text.startsWith(String(BASE_PAX))) problems.push(`baseline impact ${JSON.stringify(s.impact)}`);
        if (s.gate.state !== "accepted") problems.push(`baseline decision card ${JSON.stringify(s.gate)}`);
      }
      if (choice !== "baseline" && (s.gate.state !== "yours" || !/approve \d+ drafts? in the Outbox/.test(s.gate.text))) problems.push(`${choice}: decision card ${JSON.stringify(s.gate)}`);
      await page.screenshot({ path: path.join(OUT, `decision-${choice}.png`) });
    } catch (e) { problems.push(`${choice}: exception: ${String(e.message).split("\n")[0]}`); }
    errorsAll.push(...errors);
    await context.close();
  }
  finish("decisions", checks, problems, errorsAll);
}

// ---- timing (and captions from the same run) ------------------------------------------------------------
if (run("timing") || run("captions")) {
  const { context, page, errors } = await newPage();
  const checks = {};
  const problems = [];
  const capProblems = [];
  try {
    const t0 = await startSimulation(page, 1);
    await waitOptions(page, 90000);
    checks.secondsToDecision = Math.round((Date.now() - t0) / 100) / 10;
    if (checks.secondsToDecision > 60) problems.push(`the decision comes after ${checks.secondsToDecision} s at ×1 (at most 60 expected)`);
    const paras = await page.$$eval('#console .entry[data-type="narration"] .para, #console .entry[data-type="narration"] p', (els) => [...new Set(els)].map((p) => p.textContent.replace(/\s+/g, " ").trim()).filter(Boolean));
    checks.paragraphs = paras.length;
    checks.longest = Math.max(...paras.map((p) => p.length));
    if (paras.length > 8) problems.push(`${paras.length} narration paragraphs before the decision (at most 8)`);
    if (checks.longest > 240) problems.push(`the longest paragraph has ${checks.longest} characters (at most 240): ${paras.find((p) => p.length === checks.longest)}`);
    // captions
    const tools = await page.$$eval('#console .entry[data-type="tool_call"]', (els) => els.map((e) => ({ name: e.querySelector(".tool-name")?.textContent.trim(), plain: e.querySelector(".tool-plain")?.textContent.trim() || "" })));
    checks.toolCalls = tools.map((t) => `${t.name}: ${t.plain}`);
    const RULE = { ops_list_changes: /^Reads the operations log/, ops_get_timetable: /^Reads the operational timetable/, kfp_get_published: /^Reads what (every channel|the journey planner and app|the station displays|the announcements|the coach order) tells passengers/, phys_observe: /^Reads the sensors at /, ops_get_passengers: /^Reads today's passenger counts/, sim_sync: /^Calculates /, ops_find_alternatives: /^Looks for other connections/, ops_get_overview: /^Reads every train/ };
    if (tools.length < 8) capProblems.push(`only ${tools.length} tool calls`);
    for (const t of tools) if (!t.plain || !(RULE[t.name] || /./).test(t.plain)) capProblems.push(`${t.name} has no fitting plain sentence ("${t.plain}")`);
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  if (run("timing")) finish("timing", { secondsToDecision: checks.secondsToDecision, paragraphs: checks.paragraphs, longest: checks.longest }, problems, errors);
  if (run("captions")) finish("captions", { toolCalls: checks.toolCalls }, [...capProblems, ...problems.filter((p) => p.startsWith("exception"))], errors);
  await context.close();
}

// ---- intro ---------------------------------------------------------------------------------------------
if (run("intro")) {
  const checks = {};
  const problems = [];
  const errorsAll = [];
  for (const [w, hgt] of [[1280, 720], [1600, 900], [1920, 1080]]) {
    const { context, page, errors } = await newPage({ intro: true, viewport: { width: w, height: hgt } });
    try {
      await page.waitForSelector(".intro-modal", { timeout: 5000 });
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const body = document.querySelector(".intro-modal .modal-body");
        return {
          heads: [...body.querySelectorAll("h3")].map((x) => x.textContent.trim()),
          example: body.querySelector(".intro-problem")?.textContent.replace(/\s+/g, " ").trim() || "",
          source: body.querySelector('.ip-row[data-kind="source"] .ip-val')?.textContent.trim() || "",
          told: body.querySelector('.ip-row[data-kind="told"] .ip-val')?.textContent.trim() || "",
          steps: body.querySelectorAll(".intro-step").length,
          values: body.querySelectorAll(".intro-value li").length,
          lead: document.querySelector(".intro-modal .modal-head p")?.textContent || "",
          scroll: body.scrollHeight, client: body.clientHeight
        };
      });
      checks[`${w}x${hgt}`] = m;
      const fact = verified.facts.find((f) => f.type === "platform").source;
      const told = verified.channels.find((c) => c.values.some((v) => v.type === "platform" && !v.ok)).values.find((v) => v.type === "platform").text;
      if (m.heads.join("|") !== "What it does|How the AI aligns the information|What it achieves") problems.push(`${w}: sections ${m.heads.join(", ")}`);
      if (m.source !== fact || m.told !== told) problems.push(`${w}: the example shows ${m.source} / ${m.told} (the engine: ${fact} / ${told})`);
      if (!m.example.includes(`${BASE_PAX} passengers`) || !m.example.includes(`first in ${FIRST_MIN} minutes`)) problems.push(`${w}: the example lacks the engine's ${BASE_PAX} passengers, first in ${FIRST_MIN} minutes`);
      // The current time makes the figures add up (07:21 changed, 07:42 departs, 14 minutes from now).
      if (!m.example.includes(`It is ${WORLD.meta.now_label}`)) problems.push(`${w}: the example does not say it is ${WORLD.meta.now_label}`);
      if (m.steps !== 5 || m.values !== 3) problems.push(`${w}: ${m.steps} steps and ${m.values} outcomes`);
      if (!/keeps no timetable of its own/i.test(m.lead)) problems.push(`${w}: the lead does not say it keeps no timetable of its own`);
      if (m.scroll > m.client + 1) problems.push(`${w}×${hgt}: the intro scrolls (${m.scroll} > ${m.client})`);
      await page.screenshot({ path: path.join(OUT, `intro-${w}.png`) });
    } catch (e) { problems.push(`${w}: exception: ${String(e.message).split("\n")[0]}`); }
    errorsAll.push(...errors);
    await context.close();
  }
  finish("intro", checks, problems, errorsAll);
}

// ---- cards ---------------------------------------------------------------------------------------------
if (run("cards")) {
  const { context, page, errors } = await newPage();
  const checks = {};
  const problems = [];
  try {
    await startSimulation(page, 4);
    await waitOptions(page);
    await page.waitForTimeout(500);
    checks.cards = await page.$$eval(".option-card", (els) => els.map((e) => ({
      kind: e.dataset.kind, letter: e.querySelector(".option-letter")?.textContent.trim(),
      total: `${e.querySelector(".option-total .label")?.textContent.trim()}=${e.querySelector(".option-total .value")?.textContent.trim()}`,
      rows: [...e.querySelectorAll(".option-figures dt")].map((d) => d.textContent.trim()),
      text: e.textContent
    })));
    for (const c of checks.cards) {
      const v = c.kind === "option" ? variant[{ A: "V1", B: "V2", C: "V3" }[c.letter]] : null;
      const want = `Still misinformed=${c.kind === "option" ? v.misinformed_pax : BASE_PAX}`;
      if (c.total !== want) problems.push(`card ${c.letter}: big figure ${c.total} (the engine: ${want})`);
      if (/Protected passengers|Hand-kept|Back in sync/.test(c.text)) problems.push(`card ${c.letter} still uses an internal word`);
      if (c.kind === "option" && c.rows.join("|") !== "All channels aligned|Kept by hand|Staff effort") problems.push(`card ${c.letter}: rows ${c.rows.join(", ")}`);
    }
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForSelector(".action-card[data-status='pending']", { timeout: 60000 });
    await page.waitForTimeout(800);
    checks.kpi = await page.$$eval(".kpi", (els) => els.slice(0, 2).map((e) => e.querySelector(".kpi-sub").textContent.trim()));
    const v1 = variant.V1;
    if (checks.kpi[0] !== `left with option A (was ${BASE_PAX})`) problems.push(`first tile: ${checks.kpi[0]}`);
    if (checks.kpi[1] !== `info in ${v1.correct_info_from_min} min, aligned in ${v1.time_to_sync_min} min`) problems.push(`second tile: ${checks.kpi[1]} (the engine: info in ${v1.correct_info_from_min} min, aligned in ${v1.time_to_sync_min} min)`);
    checks.drafts = await page.$$eval(".action-card", (els) => els.map((e) => e.querySelector(".action-meta span")?.textContent.trim()));
    if (!/^Passenger message/.test(checks.drafts[0] || "")) problems.push(`the first draft is "${checks.drafts[0]}", not the passenger message`);
    await page.screenshot({ path: path.join(OUT, "cards-outbox.png") });
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  finish("cards", checks, problems, errors);
  await context.close();
}

await browser.close();
await close();
const allOk = results.length > 0 && results.every((r) => r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} pitch cases passed. Screenshots: ${OUT}`);
if (allOk && ONLY.length === 0) console.log("PITCH OK");
process.exit(allOk ? 0 : 1);
