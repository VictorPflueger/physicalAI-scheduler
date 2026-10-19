// Plays all six simulation scripts in the browser along four decision patterns (approve the
// recommendation, reject one and approve another, accept the risk, reject all three and then accept
// the risk) and checks the integrity rules: no unresolved placeholders, SIMULATION markings, no
// network at all, the reasoning labels in the console, the payoff of the decision on the KPI tiles
// and on the mirror (a re-publication turns the contradictions green, an option that only informs
// turns them amber, an accepted risk keeps them and says so, in the alignment view, in the
// timetables and in all trains), the audit export marked as simulation with every decision recorded.
// Usage: node tests/sims.mjs [scenarioId…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { APP_ROOT, ONLY, outDir, launchBrowser, serveStatic, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";

const OUT = await outDir("sims");
const { base: BASE, close } = await serveStatic(APP_ROOT, 8768);
const browser = await launchBrowser();

// Decision plans: options to reject (in order) before the final decision, the draft decisions, and
// the state the mirror must show afterwards (resolved: re-published from the source; at_risk:
// passengers informed, data still behind; accepted: the risk accepted, nothing changed).
const PLANS = {
  "SC-PLATFORM": { reject: ["V3"], approve: "V1", drafts: "reject-last", mirror: "resolved", monitor: /^Option A approved: re-publish$/ },
  "SC-DIVERSION": { reject: [], approve: "V1", drafts: "approve-all", mirror: "resolved", monitor: /^Option A approved: re-publish$/ },
  "SC-OPSSTOP": { reject: ["V1"], approve: "V2", drafts: "approve-all", mirror: "at_risk", monitor: /^Option B approved: informed, data behind$/ },
  "SC-TERMINUS": { reject: [], approve: "baseline", drafts: "approve-all", mirror: "accepted", monitor: /^Risk accepted: nothing changed$/ },
  "SC-COACH": { reject: ["V1", "V2", "V3"], approve: "baseline", drafts: "approve-all", mirror: "accepted", monitor: /^Risk accepted: nothing changed$/ },
  "SC-FPLO": { reject: ["V3"], approve: "V2", drafts: "reject-last", mirror: "resolved", monitor: /^Option B approved: re-publish$/ }
};

const results = [];
for (const [id, plan] of Object.entries(PLANS)) {
  if (ONLY.length && !ONLY.includes(id)) continue;
  results.push(await playScenario(id, plan));
}
await writeFile(path.join(OUT, "sims-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`\n# ${r.id}: ${r.ok ? "PASS" : "FAIL"}`);
  for (const [k, v] of Object.entries(r.checks)) console.log(`  ${k}: ${JSON.stringify(v)}`);
  if (r.problems.length) console.log("  PROBLEMS:", r.problems);
  console.log(`  pageErrors: ${JSON.stringify(r.pageErrors)} consoleErrors: ${JSON.stringify(r.consoleErrors)} csp: ${JSON.stringify(r.csp)} network: ${JSON.stringify(r.network)}`);
}
await browser.close();
await close();
const allOk = results.length > 0 && results.every((r) => r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} simulations passed. Screenshots: ${OUT}`);
if (allOk && ONLY.length === 0) console.log("SIMS OK");
process.exit(allOk ? 0 : 1);

async function playScenario(id, plan) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const network = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = new URL(route.request().url());
    network.push(`${route.request().method()} ${u.host}${u.pathname}`);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const pageErrors = [], consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) consoleErrors.push(m.text()); });
  const checks = {};
  const problems = [];
  const short = id.replace("SC-", "").toLowerCase();
  // The alignment view (the mirror's first view): each channel card's tone, the impact line's tone.
  const alignState = () => page.evaluate(() => ({
    view: document.getElementById("mirror").dataset.view,
    channels: [...document.querySelectorAll("#mirror .al-channel")].map((c) => `${c.dataset.channel}:${c.dataset.tone}`),
    impact: document.querySelector("#mirror .al-impact")?.dataset.tone || null
  }));
  // The timetables (the train view), opened with their button and left again for the alignment view.
  const timetables = async () => {
    await page.click('#mirror .mirror-tools button:has-text("Timetables")');
    await page.waitForSelector('#mirror .mrow[data-side="source"]', { timeout: 5000 });
    await page.waitForTimeout(300);
    const m = await mirrorState();
    await page.click('#mirror .mirror-tools button:has-text("Alignment")');
    await page.waitForTimeout(200);
    return m;
  };
  const mirrorState = () => page.evaluate(() => ({
    view: document.getElementById("mirror").dataset.view,
    train: document.querySelector("#mirror .mirror-caption strong")?.textContent || "",
    rows: [...document.querySelectorAll('#mirror .mrow[data-side="customer"][data-state]')].map((b) => `${b.dataset.point}:${b.dataset.state}`),
    pills: [...document.querySelectorAll("#mirror .ml-pill")].map((p) => p.dataset.state),
    chips: [...document.querySelectorAll("#mirror .ch-chip[data-state]")].map((c) => `${c.querySelector(".ch-name").textContent}:${c.dataset.state}`)
  }));
  try {
    await page.goto(BASE);
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    await page.click('button[aria-label="Replay speed ×4"]');
    await page.click("#dd-scenario");
    await page.click(`.menu-item[data-id="${id}"]`);
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForTimeout(1500);
    checks.badge = (await page.textContent("#mode-badge")).trim();
    checks.watermark = await page.isVisible(".sim-watermark");
    const t0 = Date.now();
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 240000 });
    checks.secondsToOptions = Math.round((Date.now() - t0) / 1000);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `${short}-1-options.png`) });
    checks.options = await page.$$eval(".option-card", (els) => els.map((e) => `${e.querySelector(".option-letter")?.textContent}:${e.querySelector(".option-total .value")?.textContent}`));
    checks.kpiBefore = await page.$$eval(".kpi", (els) => els.slice(0, 2).map((e) => `${e.dataset.tone}|${e.innerText.replace(/\s+/g, " ").trim()}`));
    checks.alignBefore = await alignState();
    checks.mirrorBefore = await timetables();
    const letterOf = (v) => ({ V1: "A", V2: "B", V3: "C" }[v]);
    for (const v of plan.reject) {
      const n0 = await page.$$eval(".entry", (els) => els.length);
      await page.click(`.option-card[aria-label^="Option ${letterOf(v)}:"] .btn-reject`);
      await page.waitForFunction((n) => document.querySelectorAll(".entry").length > n + 1, n0, { timeout: 30000 });
      await page.waitForTimeout(400);
    }
    if (plan.approve === "baseline") {
      await page.click('.option-card[data-kind="baseline"] .option-actions .btn');
    } else {
      await page.click(`.option-card[aria-label^="Option ${letterOf(plan.approve)}:"] .btn-approve`);
    }
    await page.waitForTimeout(1500);
    checks.kpiAfter = await page.$$eval(".kpi", (els) => els.slice(0, 3).map((e) => `${e.dataset.tone}|${e.innerText.replace(/\s+/g, " ").trim()}`));
    checks.alignAfter = await alignState();
    checks.mirrorAfter = await timetables();
    // drafts
    await page.waitForSelector(".action-card[data-status='pending']", { timeout: 120000 });
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 120000 });
    await page.screenshot({ path: path.join(OUT, `${short}-2-outbox.png`) });
    const pending = await page.$$(".action-card[data-status='pending']");
    checks.drafts = pending.length;
    checks.draftTypes = await page.$$eval(".action-card", (els) => els.map((e) => e.querySelector(".action-meta span")?.textContent?.trim() || ""));
    for (let i = 0; i < pending.length; i++) {
      const cards = await page.$$(".action-card[data-status='pending']");
      const last = i === pending.length - 1;
      const btn = await cards[0].$(plan.drafts === "reject-last" && last && pending.length > 1 ? ".btn-reject" : ".btn-approve");
      await btn.click();
      await page.waitForTimeout(150);
    }
    await page.waitForSelector('button:has-text("Open management summary")', { state: "visible", timeout: 120000 });
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `${short}-3-done.png`) });
    checks.status = (await page.textContent(".status-pill .text")).trim();
    checks.kpiEnd = await page.$$eval(".kpi", (els) => els.map((e) => `${e.dataset.tone}|${e.innerText.replace(/\s+/g, " ").trim()}`));
    const consoleText = await page.innerText("#console");
    checks.labels = ["Hypothesis:", "Check:", "Confirmed:", "Revised:", "Impact:", "Recommendation:"].filter((l) => consoleText.includes(l));
    checks.phases = [...consoleText.matchAll(/Phase: ([A-Za-z ]+)/g)].map((m) => m[1].trim());
    // report modal
    await page.click('button:has-text("Open management summary")');
    await page.waitForSelector(".report-modal", { timeout: 5000 });
    const reportText = await page.innerText(".report-modal");
    checks.reportHead = reportText.split("\n").filter(Boolean).slice(0, 2).join(" | ");
    checks.reportMarked = /Simulated run/.test(reportText);
    await page.screenshot({ path: path.join(OUT, `${short}-4-report.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const outboxText = await page.$eval("#panel-outbox", (el) => el.textContent);
    // unresolved placeholders anywhere
    const all = `${consoleText}\n${reportText}\n${outboxText}\n${await page.innerText("header")}`;
    const unresolved = all.match(/\{\{[^}]*\}\}/g);
    if (unresolved) problems.push(`unresolved placeholders: ${[...new Set(unresolved)].join(", ")}`);
    if (/Live agent run/.test(all)) problems.push("text claims a live run");
    // Every draft carries the AI footer and its source reference.
    checks.draftsMarked = await page.$$eval(".action-card", (els) => els.every((e) => /Source reference:/.test(e.textContent) && /Prepared with the Timetable Translator AI assistant\. Requires human approval/.test(e.textContent)));
    // audit export
    await page.click("#tab-audit");
    await page.waitForTimeout(300);
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.click('button:has-text("Export JSON")')]);
    const audit = JSON.parse(await readFile(await dl.path(), "utf8"));
    checks.auditMode = audit.mode;
    checks.auditSaveDisabled = await page.$eval('button:has-text("Save run as simulation")', (b) => b.getAttribute("aria-disabled"));
    checks.optionDecisions = audit.events.filter((e) => e.type === "option_decision").map((e) => `${e.payload.decision} ${e.payload.option_id}`);
    checks.actionDecisions = audit.events.filter((e) => e.type === "action_decision").map((e) => e.payload.decision).join(",");
    const optionsEv = audit.events.filter((e) => e.type === "options").slice(-1)[0];
    const trainIds = optionsEv?.payload.train_ids || [];
    // The mirror with the drawer hidden (the full train view), then the sync monitor: every train of
    // the decision carries it.
    await page.click('.drawer button:has-text("Hide")').catch(() => {});
    await page.waitForTimeout(600);
    checks.alignEnd = await alignState();
    await page.screenshot({ path: path.join(OUT, `${short}-5-alignment.png`) });
    checks.mirrorEnd = await timetables();
    await page.click('#mirror .mirror-tools button:has-text("Timetables")');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${short}-5-mirror.png`) });
    await page.click('#mirror .mirror-tools button:has-text("All trains")');
    await page.waitForTimeout(500);
    checks.monitor = await page.evaluate((ids) => {
      const out = {};
      for (const b of document.querySelectorAll("#mirror .mon-row")) {
        const name = b.querySelector(".mon-train strong").textContent;
        const label = b.querySelector(".mon-check").textContent.trim();
        if (b.dataset.state || ids.length) out[name] = `${b.dataset.state || "-"}|${label}`;
      }
      return Object.fromEntries(Object.entries(out).filter(([, v]) => !/^-\|Not checked$/.test(v)));
    }, trainIds);
    await page.screenshot({ path: path.join(OUT, `${short}-6-monitor.png`) });

    // expectations
    if (checks.badge !== "SIMULATION") problems.push("badge");
    if (!checks.watermark) problems.push("watermark hidden");
    if (checks.status !== "Done") problems.push(`status ${checks.status}`);
    if (checks.auditMode !== "simulation") problems.push("audit mode");
    if (!checks.reportMarked) problems.push("report not marked as simulated");
    if (!checks.draftsMarked) problems.push("a draft lacks the AI footer or the source reference");
    for (const l of ["Hypothesis:", "Confirmed:", "Revised:", "Impact:", "Recommendation:"]) if (!checks.labels.includes(l)) problems.push(`missing ${l}`);
    if (network.length) problems.push(`network requests: ${network.join(", ")}`);
    if (checks.optionDecisions.filter((d) => d.startsWith("rejected")).length !== plan.reject.length) problems.push("rejections not recorded");
    if (!checks.optionDecisions.includes(`approved ${plan.approve}`)) problems.push(`the approval of ${plan.approve} is not recorded`);
    // Before the decision the finding is red on the mirror (the alignment view first, then the
    // timetables), and the first tile is the verified figure.
    const red = checks.alignBefore.channels.filter((c) => c.endsWith(":affected")).map((c) => c.split(":")[0]);
    if (checks.alignBefore.view !== "align" || !red.length || checks.alignBefore.impact !== "affected" || checks.alignBefore.channels.some((c) => !/:(affected|ok|muted)$/.test(c))) problems.push(`the finding is not red on the alignment view: ${JSON.stringify(checks.alignBefore)}`);
    if (!checks.mirrorBefore.rows.length || !checks.mirrorBefore.rows.every((r) => r.endsWith(":affected"))) problems.push(`the finding is not red in the timetables: ${checks.mirrorBefore.rows.join(" ")}`);
    if (!/^affected\|Misinformed passengers \d[\d,]* verified against the source/.test(checks.kpiBefore[0])) problems.push(`the verified figure is not on the first tile: ${checks.kpiBefore[0]}`);
    // After the decision: the tiles and the mirror follow it.
    if (plan.approve === "baseline") {
      if (!/risk accepted, nothing published/.test(checks.kpiAfter[0])) problems.push(`the accepted risk is not on the tile: ${checks.kpiAfter[0]}`);
    } else {
      if (!/^(at-risk|resolved)\|Misinformed passengers [\d,]+ left with option [A-C] \(was [\d,]+\)/.test(checks.kpiAfter[0])) problems.push(`the tile did not show the payoff: ${checks.kpiAfter[0]}`);
      const synced = plan.mirror === "resolved";
      if (synced !== /aligned in/.test(checks.kpiAfter[1])) problems.push(`the second tile does not say whether the data is aligned again: ${checks.kpiAfter[1]}`);
    }
    // The channels that were red follow the decision on the alignment view (an accepted risk turns
    // amber with the hand, as in the legend), and so does the impact line (which stays red while
    // passengers act on wrong information).
    const tone = { resolved: "resolved", at_risk: "at-risk", accepted: "at-risk" }[plan.mirror];
    const impactTone = { resolved: "resolved", at_risk: "at-risk", accepted: "affected" }[plan.mirror];
    for (const [when, a] of [["after the decision", checks.alignAfter], ["with the drawer hidden", checks.alignEnd]]) {
      const now = Object.fromEntries(a.channels.map((c) => c.split(":")));
      if (red.some((ch) => now[ch] !== tone)) problems.push(`alignment view ${when}: ${a.channels.join(" ")} (expected ${tone} where it was red)`);
      if (a.impact !== impactTone) problems.push(`alignment view ${when}: impact line ${a.impact} (expected ${impactTone})`);
    }
    for (const [when, m] of [["after the decision", checks.mirrorAfter], ["with the drawer hidden", checks.mirrorEnd]]) {
      if (!m.rows.length || !m.rows.every((r) => r.endsWith(`:${plan.mirror}`))) problems.push(`mirror ${when}: rows ${m.rows.join(" ")} (expected ${plan.mirror})`);
      if (m.pills.some((s) => s !== plan.mirror)) problems.push(`mirror ${when}: line labels ${m.pills.join(" ")}`);
    }
    const decided = Object.entries(checks.monitor).filter(([, v]) => !/Not checked/.test(v));
    if (!decided.length || !decided.every(([, v]) => plan.monitor.test(v.split("|")[1]))) problems.push(`monitor: ${JSON.stringify(checks.monitor)}`);
  } catch (e) {
    problems.push(`exception: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: path.join(OUT, `${short}-fail.png`) }).catch(() => {});
  }
  const csp = await page.evaluate(() => window.__csp || []).catch(() => []);
  await context.close();
  const ok = !problems.length && !pageErrors.length && !consoleErrors.length && !csp.length;
  return { id, ok, checks, problems, pageErrors, consoleErrors, csp, network: [...new Set(network)] };
}
