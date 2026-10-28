// Design checks and review captures (DESIGN.md §8):
//   states   the colour grammar in the running app: the alignment view's channel cards, the timetable
//            mirror's rows, lines, line labels, corridor rings and monitor rows use the state tokens (danger: contradicts the source;
//            warning: informed, data still behind; success: re-publication approved; lilac: a what-if), so does
//            its legend; the status pill and the progress rail name the human step ("Your decision",
//            then "Your approval"), the rail ends with every step done, and the AI labels open and close
//   review   screenshots for a design review: the options at 1920×1080 as rendered and under a
//            simulated projector washout, and the finished run as seen with protanopia,
//            deuteranopia and tritanopia (Machado et al. 2009 matrices, applied in linear RGB)
// Usage: node tests/design.mjs [case…]
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { APP_ROOT, ONLY, outDir, wanted, launchBrowser, serveStatic, SKIP_INTRO } from "./lib/harness.mjs";

const OUT = await outDir("design");
const { base: BASE, close } = await serveStatic(APP_ROOT, 8770);
const browser = await launchBrowser();
const results = [];

// Severity 1.0 (dichromacy). The same matrices as the colour check in tests/tokens.mjs.
const CVD = {
  "Normal vision": null,
  Protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  Deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  Tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]
};
// A projector in a lit room: lower contrast, brighter, less saturated.
const WASHOUT = "contrast(0.62) brightness(1.18) saturate(0.8)";

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(SKIP_INTRO);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  return { context, page, errors };
}

const pillText = (page) => page.$eval(".status-pill .text", (e) => e.textContent.trim());
const waitPill = (page, re, timeout = 30000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.querySelector(".status-pill .text")?.textContent || ""), re.source, { timeout });
const railNow = (page) => page.evaluate(() => {
  const cur = document.querySelector('.rail-step[aria-current="step"]');
  return {
    step: cur?.dataset.step || null,
    state: cur?.dataset.state || null,
    turn: cur?.querySelector(".rail-turn")?.textContent.trim() || null,
    states: [...document.querySelectorAll(".rail-step")].map((s) => s.dataset.state)
  };
});

/**
 * The mirror's colours against the tokens: customer rows (their bar), lines, line labels, the strip's
 * rings, the monitor's rows and the legend's status dots. Returns { mismatches, counted }.
 */
function mirrorColours(page) {
  return page.evaluate(() => {
    // Resolve a token through a probe element, so var() chains end in a colour.
    const probe = document.createElement("i");
    document.body.append(probe);
    const colour = (name) => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color; };
    const first = (shadow) => (/rgba?\([^)]*\)/.exec(shadow || "") || ["none"])[0];
    // The state tokens (Vici): danger, warning, success and lilac (the AI's what-if), as lines and outlines.
    const TOKEN = { affected: "--vc-danger-solid", at_risk: "--vc-warning-text", accepted: "--vc-warning-text", resolved: "--vc-success-solid", what_if: "--vc-feature-solid" };
    // Only what is on screen counts (a hidden strip or view keeps its last drawing until shown again).
    const shown = (e) => e.getClientRects().length > 0 && !e.closest("[hidden]");
    const all = (sel) => [...document.querySelectorAll(sel)].filter(shown);
    const out = { mismatches: [], counted: {} };
    for (const [st, name] of Object.entries(TOKEN)) {
      const want = colour(name);
      const rows = all(`#mirror .mrow[data-side="customer"][data-state="${st}"]`).map((e) => [`row ${e.dataset.point}`, first(getComputedStyle(e).boxShadow)]);
      const lines = all(`#mirror .mc-links .ml[data-state="${st}"]`).map((e) => ["line", getComputedStyle(e).stroke]);
      const pills = all(`#mirror .ml-pill[data-state="${st}"]`).map((e) => ["line label", getComputedStyle(e).borderTopColor]);
      const rings = all(`#mirror .strip .node[data-state="${st}"] .node-ring`).map((e) => ["strip ring", getComputedStyle(e).stroke]);
      const mon = all(`#mirror .mon-row[data-state="${st}"]`).map((e) => ["monitor row", getComputedStyle(e).borderLeftColor]);
      // The alignment view's channel cards carry the state as their left bar (an accepted risk takes the warning tone, as at_risk).
      const tone = { affected: "affected", at_risk: "at-risk", resolved: "resolved", what_if: "what-if" }[st];
      const cards = tone ? all(`#mirror .al-channel[data-tone="${tone}"]`).map((e) => [`channel card ${e.dataset.channel}`, getComputedStyle(e).borderLeftColor]) : [];
      out.counted[st] = rows.length + lines.length + pills.length + rings.length + mon.length + cards.length;
      for (const [what, got] of [...rows, ...lines, ...pills, ...rings, ...mon, ...cards]) if (got !== want) out.mismatches.push(`${st} ${what} ${got} ≠ ${want}`);
    }
    const status = [...document.querySelectorAll("#mirror .legend-group")].find((g) => /Status/.test(g.querySelector("h4")?.textContent || ""));
    const rows = status ? [...status.querySelectorAll(".legend-row")] : [];
    for (const [label, name] of [["Contradicts the source", "--vc-danger-solid"], ["What-if, not the source", "--vc-feature-solid"], ["Informed, data still behind", "--vc-warning-text"], ["Risk accepted: nothing changed", "--vc-warning-text"], ["Re-publication approved", "--vc-success-solid"]]) {
      const row = rows.find((r) => r.textContent.trim() === label);
      const got = row ? getComputedStyle(row.querySelector(".legend-swatch-dot")).borderTopColor : "missing";
      if (got !== colour(name)) out.mismatches.push(`legend "${label}" ${got} ≠ ${colour(name)}`);
    }
    probe.remove();
    return out;
  });
}

async function toOptions(page) {
  await page.click('button[aria-label="Replay speed ×4"]');
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card");
  await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
  await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
}
async function toDrafts(page) {
  await page.click('.option-card[data-recommended="true"] .btn-approve');
  await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 120000 });
}
async function toDone(page) {
  await page.click('button:has-text("Approve all")');
  await page.waitForSelector('button:has-text("Open management summary")', { state: "visible", timeout: 60000 });
}

if (wanted("states")) {
  const { context, page, errors } = await newPage();
  const problems = [];
  try {
    await toOptions(page);
    await waitPill(page, /^Awaiting your decision$/);
    let rail = await railNow(page);
    if (rail.step !== "propose" || rail.state !== "yours" || rail.turn !== "Your decision") problems.push(`options: rail shows ${JSON.stringify(rail)}`);

    // The mirror draws states with the state tokens, and its legend shows the same colours.
    const colours = await mirrorColours(page);
    problems.push(...colours.mismatches);
    if (colours.counted.affected < 3) problems.push(`the finding is not marked on the mirror at the options stage (${JSON.stringify(colours.counted)})`);

    // AI label: opens a note on click, closes on Escape and gives focus back.
    await page.click(".options-summary-head .ai-label");
    const tip = await page.$eval(".options-summary-head .ai-tip", (t) => ({ hidden: t.hidden, text: t.textContent }));
    if (tip.hidden || !/AI-proposed options/.test(tip.text) || !/Scripted replay/.test(tip.text)) problems.push(`options AI label: ${JSON.stringify(tip).slice(0, 160)}`);
    await page.keyboard.press("Escape");
    const after = await page.evaluate(() => ({
      hidden: document.querySelector(".options-summary-head .ai-tip").hidden,
      focus: document.activeElement?.classList.contains("ai-label")
    }));
    if (!after.hidden || !after.focus) problems.push(`AI label after Escape: ${JSON.stringify(after)}`);

    // Approving the option hands the next step to the drafts.
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() !== "Awaiting your decision", null, { timeout: 5000 });
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 120000 });
    await waitPill(page, /^Awaiting your approval$/);
    rail = await railNow(page);
    if (rail.step !== "prepare" || rail.state !== "yours" || rail.turn !== "Your approval") problems.push(`drafts: rail shows ${JSON.stringify(rail)}`);
    const draftLabels = await page.$$eval(".action-card .ai-label", (l) => l.length);
    const drafts = await page.$$eval(".action-card", (c) => c.length);
    if (!drafts || draftLabels !== drafts) problems.push(`${draftLabels} AI labels on ${drafts} drafts`);
    const phases = await page.$$eval("#console .phase", (p) => p.map((e) => e.textContent.trim()));
    for (const want of ["Phase: Awaiting your decision", "Phase: Awaiting your approval"]) if (!phases.includes(want)) problems.push(`console lacks "${want}"`);

    await toDone(page);
    await waitPill(page, /^Done$/);
    // After the approval the re-published contradictions turn the resolved colour, in the alignment
    // view, in all trains and in the timetables.
    await page.click('.drawer button:has-text("Hide")').catch(() => {});
    await page.waitForTimeout(1200);
    const after2 = await mirrorColours(page);
    problems.push(...after2.mismatches.map((m) => `after approval: ${m}`));
    if (after2.counted.resolved < 4 || after2.counted.affected) problems.push(`the approval is not in the success tone on the mirror (${JSON.stringify(after2.counted)})`);
    await page.click('#mirror .mirror-tools button:has-text("All trains")');
    await page.waitForTimeout(400);
    const monitor = await mirrorColours(page);
    problems.push(...monitor.mismatches.map((m) => `monitor: ${m}`));
    if (!monitor.counted.resolved) problems.push(`the monitor shows no decided train (${JSON.stringify(monitor.counted)})`);
    await page.click('#mirror .mirror-tools button:has-text("Timetables")');
    await page.waitForTimeout(400);
    const timetables = await mirrorColours(page);
    problems.push(...timetables.mismatches.map((m) => `timetables: ${m}`));
    if (timetables.counted.resolved < 4 || timetables.counted.affected) problems.push(`the approval is not in the success tone in the timetables (${JSON.stringify(timetables.counted)})`);
    await page.click('#mirror .mirror-tools button:has-text("Alignment")');
    rail = await railNow(page);
    if (rail.states.some((s) => s !== "done")) problems.push(`done: rail states ${rail.states.join(", ")}`);
    if ((await pillText(page)) !== "Done") problems.push(`done: pill reads ${await pillText(page)}`);
    if (!(await page.$(".report-card .ai-label"))) problems.push("no AI label on the summary card");
    await page.screenshot({ path: path.join(OUT, "states-done.png") });

    // An option that only informs leaves the data behind: the warning tone.
    await page.click("#btn-reset");
    await page.click("#dd-scenario");
    await page.click('.menu-item[data-id="SC-OPSSTOP"]');
    await toOptions(page);
    await page.click('.option-card[aria-label^="Option B:"] .btn-approve');
    await page.waitForTimeout(800);
    const warning = await mirrorColours(page);
    problems.push(...warning.mismatches.map((m) => `informed only: ${m}`));
    if (!warning.counted.at_risk || warning.counted.affected) problems.push(`option B is not in the warning tone on the mirror (${JSON.stringify(warning.counted)})`);
    await page.screenshot({ path: path.join(OUT, "states-at-risk.png") });

    // A what-if (a hypothetical change the agent tests, not the source) is lilac.
    await page.click("#btn-abort").catch(() => {});
    await page.click("#btn-reset");
    await page.evaluate(async () => {
      const { bus } = await import("./js/events.js");
      const { getModel } = await import("./js/world.js");
      const { simulateSync, compactForModel } = await import("./js/sync.js");
      const input = { train_ids: ["RE 10109"], what_if: { changes: [{ train: "RE 10109", op: "skip", point: "KLMI" }] } };
      bus.emit("tool_call", { call_id: "design-what-if", name: "sim_sync", input, server: false });
      bus.emit("tool_result", { call_id: "design-what-if", name: "sim_sync", ok: true, result: compactForModel(simulateSync(getModel(), input)), server: false });
    });
    await page.waitForTimeout(500);
    const lilac = await mirrorColours(page);
    problems.push(...lilac.mismatches.map((m) => `what-if: ${m}`));
    if (!lilac.counted.what_if || lilac.counted.affected) problems.push(`the what-if is not lilac on the mirror (${JSON.stringify(lilac.counted)})`);
    const chip = await page.$eval("#mirror .cap-chip", (c) => `${c.textContent}|${c.dataset.tone}`);
    if (chip !== "What-if, not the source|ai") problems.push(`what-if chip reads ${chip}`);
    await page.screenshot({ path: path.join(OUT, "states-what-if.png") });
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  problems.push(...errors.map((e) => `page error: ${e}`));
  results.push({ name: "colour grammar, handover labels, AI labels", ok: !problems.length, problems });
  await context.close();
}

if (wanted("review")) {
  const { context, page, errors } = await newPage();
  const problems = [];
  const files = [];
  try {
    await toOptions(page);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, "review-options.png") });
    await page.evaluate((f) => { document.documentElement.style.filter = f; }, WASHOUT);
    await page.screenshot({ path: path.join(OUT, "review-options-washout.png") });
    await page.evaluate(() => { document.documentElement.style.filter = ""; });
    files.push("review-options.png", "review-options-washout.png");

    await toDrafts(page);
    await toDone(page);
    // The finished run with the drawer hidden: the mirror shows the whole train.
    await page.click('.drawer button:has-text("Hide")').catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.style.position = "absolute";
      // Filter primitives work in linear RGB by default, which is where the matrices apply.
      svg.innerHTML = '<filter id="cvd-sim" color-interpolation-filters="linearRGB"><feColorMatrix id="cvd-matrix" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>';
      document.body.appendChild(svg);
    });
    const shots = { full: [], mirror: [] };
    const mirrorBox = await page.$eval("#mirror", (m) => { const r = m.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    for (const [name, m] of Object.entries(CVD)) {
      await page.evaluate((mat) => {
        const values = mat ? `${mat[0].join(" ")} 0 0 ${mat[1].join(" ")} 0 0 ${mat[2].join(" ")} 0 0 0 0 0 1 0` : "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0";
        document.getElementById("cvd-matrix").setAttribute("values", values);
        document.body.style.filter = mat ? "url(#cvd-sim)" : "";
      }, m);
      await page.waitForTimeout(300);
      shots.full.push([name, (await page.screenshot()).toString("base64")]);
      shots.mirror.push([name, (await page.screenshot({ clip: mirrorBox })).toString("base64")]);
    }
    await page.evaluate(() => { document.body.style.filter = ""; });

    const sheet = await context.newPage();
    for (const [kind, list] of Object.entries(shots)) {
      await sheet.setViewportSize({ width: 1920, height: 200 }); // the full-page capture grows to fit
      await sheet.setContent(`<!doctype html><html><body style="margin:0;background:#fff;font:600 20px Arial,sans-serif;color:#2c1f21">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px">${list.map(([n, b]) =>
          `<figure style="margin:0"><figcaption style="padding:2px 2px 6px">${n}</figcaption><img style="width:100%;display:block;border:1px solid #e5d9db" src="data:image/png;base64,${b}"></figure>`).join("")}</div></body></html>`);
      await sheet.waitForTimeout(200);
      const file = `review-cvd-${kind}.png`;
      await sheet.screenshot({ path: path.join(OUT, file), fullPage: true });
      files.push(file);
    }
    await sheet.close();
  } catch (e) { problems.push(`exception: ${String(e.message).split("\n")[0]}`); }
  problems.push(...errors.map((e) => `page error: ${e}`));
  results.push({ name: `review captures (${files.length} files)`, ok: !problems.length && files.length === 4, problems });
  await context.close();
}

await browser.close();
await close();
await writeFile(path.join(OUT, "design-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
}
const allOk = results.length > 0 && results.every((r) => r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} design checks passed. Screenshots: ${OUT}`);
if (allOk && ONLY.length === 0) console.log("DESIGN OK");
process.exit(allOk ? 0 : 1);
