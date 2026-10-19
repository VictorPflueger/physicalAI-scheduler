// Acceptance tests (TECH_NOTES §12) that the other suites do not cover:
//   key      key lifecycle: no key at load, mode choice first, masked key dialog, session-only
//            storage, new tab has no key, Change or forget key, key only ever sent to
//            api.anthropic.com, never in console output, DOM or audit export; Diagnostics privacy row
//   diag     api.anthropic.com unreachable (a firewall): Diagnostics fails that row and says why while
//            the snapshot and privacy rows pass; the key check says it cannot reach the API and starts
//            nothing; Simulation still runs
//   abort    Abort/Reset matrix in Simulation and Live at several phases; every path recovers to
//            Idle and a new run completes
//   offline  Simulation with every external host blocked (no APIs): runs to Done with the timetable
//            mirror drawn (the alignment view, then the timetables) and following the decision,
//            SIMULATION badge and watermark visible at every stage, replay facts shown, and not a
//            single request leaves the page's own server
// Usage: node tests/accept.mjs [case…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { APP_ROOT, ONLY, outDir, wanted, launchBrowser, serveStatic, CORS, MOCK_KEY, NETWORK_NOISE, SKIP_INTRO, KEYS } from "./lib/harness.mjs";

const ROOT = APP_ROOT;
const OUT = await outDir("accept");
const { base: BASE, close } = await serveStatic(ROOT, 8769);
const browser = await launchBrowser();
const REF = await loadRef();
const OPTIONS_618 = [
  { variant_id: "V1", title: "Re-publish ICE 618 from the source", description: "Release source version 2 to every channel and announce the platform change.", residual_risk: "Passengers already heading for platform 5 rely on the announcement to reach platform 7." },
  { variant_id: "V2", title: "Messages and platform staff, data later", description: "Messages on app, displays and announcements; staff at platform 5 send people to platform 7.", residual_risk: "Planner and coach order stay wrong." },
  { variant_id: "V3", title: "Override displays and announcements by hand", description: "Set Gleis 7 by hand on displays and announcements.", residual_risk: "A second, hand-kept truth." }
];
const ALERT_SOURCES = [{ title: "Operations log OPS-05 (Fahrdienstleiter Köln Hbf)" }, { title: "Weichendiagnose, ESTW Köln Hbf" }];
const MESSAGE_618 = "App push (DE): ICE 618 nach Hamburg-Altona, Abfahrt 07:42, fährt heute von Gleis 7 statt Gleis 5.\nApp push (EN): ICE 618 to Hamburg-Altona, departing 07:42, leaves from platform 7 today instead of platform 5.";
const KEY = MOCK_KEY;
const results = [];
const run = wanted;
const usage = (o = {}) => ({ input_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 420, ...o });

async function loadRef() {
  const src = await readFile(path.join(ROOT, "data/reference_cases.js"), "utf8");
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  return sandbox.window.REFERENCE_CASES;
}

/**
 * A page with a swappable fake Anthropic API and a full request log.
 * opts.blockHosts: hosts whose requests fail at network level (like a firewall or CORS block).
 * opts.offline: every non-local request fails (no APIs, no open data).
 */
async function newPage({ blockHosts = [], offline = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const holder = { fake: null };
  const requests = [];
  context.on("request", async (req) => {
    let headers = {};
    try { headers = await req.allHeaders(); } catch { /* ignore */ }
    requests.push({ url: req.url(), host: new URL(req.url()).host, method: req.method(), headers, body: req.postData() || "" });
  });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (offline || blockHosts.includes(u.host)) return route.abort("failed");
    if (u.host === "api.anthropic.com") {
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      if (u.pathname === "/v1/models") return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }] }) });
      if (u.pathname === "/v1/messages" && !req.headers()["x-api-key"]) {
        // The Diagnostics reachability probe sends no key: answer like the real API does.
        return route.fulfill({ status: 401, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "x-api-key header is required" } }) });
      }
      if (u.pathname === "/v1/messages" && holder.fake) {
        const out = holder.fake.handle(req.postData() || "{}", req.headers());
        if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs));
        return route.fulfill({ status: out.status, headers: { ...CORS, ...out.headers }, body: out.body }).catch(() => {});
      }
    }
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const log = { pageErrors: [], consoleErrors: [], consoleAll: [] };
  const watch = (p) => {
    p.on("pageerror", (e) => log.pageErrors.push(String(e.message || e)));
    p.on("console", (m) => {
      log.consoleAll.push(`${m.type()}: ${m.text()}`);
      if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) log.consoleErrors.push(m.text());
    });
  };
  watch(page);
  return { context, page, log, holder, requests, watch };
}

const status = (page) => page.$eval(".status-pill .text", (e) => e.textContent.trim());
const waitStatus = (page, re, timeout = 30000) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector(".status-pill .text")?.textContent || ""), re.source, { timeout });
const entries = (page) => page.$$eval("#console .entry", (els) => els.length);
const lastEntry = (page) => page.$$eval("#console .entry", (els) => els.slice(-1)[0]?.innerText.replace(/\s+/g, " ").trim() || "");

async function boot(page) {
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
}
async function pickScenario(page, id) {
  await page.click("#dd-scenario");
  await page.click(`.menu-item[data-id="${id}"]`);
}
async function startMode(page, mode) {
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  await page.click(`.mode-card[data-mode="${mode}"] .mode-cta button`);
}
async function enterKey(page) {
  await page.waitForSelector("#api-key-input", { timeout: 5000 });
  await page.fill("#api-key-input", KEY);
  await page.click('button:has-text("Check key and continue")');
  await page.waitForSelector("#api-key-input", { state: "detached", timeout: 8000 });
}
async function diagRow(page, label) {
  return page.$$eval(".diag-table tbody tr", (rows, label) => {
    const r = rows.find((x) => x.querySelector("strong")?.textContent.includes(label));
    return r ? { s: r.querySelector(".diag-status")?.dataset.s, detail: r.querySelector(".detail")?.textContent.trim() } : null;
  }, label);
}
async function closeModal(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}
async function exportAudit(page) {
  await page.click("#tab-audit");
  await page.waitForTimeout(200);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.click('button:has-text("Export JSON")')]);
  return JSON.parse(await readFile(await dl.path(), "utf8"));
}
function shortRun() {
  return createFakeClaude([
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Check: I read the source timetable of ICE 618 first." },
      { type: "tool_use", id: "toolu_k1", name: "ops_get_timetable", input: { train: "ICE 618" } }
    ], expect: (req, { check }) => check(req.messages.length === 1, "a new run starts a new conversation") },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Not confirmed: no physical observation confirms the lead yet, so I keep it on watch." },
      { type: "tool_use", id: "toolu_k2", name: "ui_final_report", input: { outcome: "monitoring", markdown: "## ICE 618: monitoring\n\nThe lead is not yet confirmed by the physical layer. No response is proposed.\n\n*Live agent run.*" } }
    ] },
    { usage: usage({ output_tokens: 20 }), stop: "end_turn", blocks: [{ type: "text", text: "Monitoring note published." }] }
  ]);
}
async function finish(name, t, checks, problems, extraFakes = []) {
  const csp = await t.page.evaluate(() => window.__csp || []).catch(() => []);
  const violations = [t.holder.fake, ...extraFakes].filter(Boolean).flatMap((f) => f.violations);
  const ok = !problems.length && !violations.length && !t.log.pageErrors.length && !t.log.consoleErrors.length && !csp.length;
  results.push({ name, ok, checks, problems, violations, pageErrors: t.log.pageErrors, consoleErrors: t.log.consoleErrors, csp });
  await t.context.close();
}

// ---- key lifecycle ------------------------------------------------------------------------------------
if (run("key")) {
  const t = await newPage();
  const { page } = t;
  const checks = {}, problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  try {
    await boot(page);
    checks.noKeyAtLoad = await page.evaluate((k) => !sessionStorage.getItem(k), KEYS.apiKey);
    checks.rendered = await page.evaluate(() => !!document.querySelector("#mirror .al-source .al-fact") && document.querySelectorAll("#mirror .al-channel").length === 4 && document.querySelectorAll(".kpi").length);
    expect(checks.rendered === 4, "the mirror (its alignment view: the source and four channels) and the four KPI tiles are drawn at load");
    // Privacy row with no key
    await page.click("#btn-diagnostics");
    await page.waitForFunction(() => [...document.querySelectorAll(".diag-table tbody tr")].some((r) => /Key and privacy/.test(r.textContent) && r.querySelector('.diag-status[data-s="pass"], .diag-status[data-s="fail"]')), null, { timeout: 5000 });
    checks.privacyNoKey = await diagRow(page, "Key and privacy");
    expect(checks.privacyNoKey?.s === "pass", "privacy row should pass with no key");
    await closeModal(page);
    // Start → mode modal first, no key modal yet
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.modeCards = await page.$$eval(".mode-card", (els) => els.map((e) => e.dataset.mode));
    checks.keyModalBeforeChoice = await page.isVisible("#api-key-input");
    checks.manageKeyHiddenWithoutKey = !(await page.isVisible("#btn-manage-key"));
    await page.click('.mode-card[data-mode="live"] .mode-cta button');
    await page.waitForSelector("#api-key-input", { timeout: 5000 });
    checks.inputType = await page.$eval("#api-key-input", (e) => e.type);
    checks.advice = await page.$eval(".key-advice", (e) => e.innerText.replace(/\s+/g, " ").trim());
    checks.adviceLinks = await page.$$eval(".key-advice a", (els) => els.map((a) => a.href));
    checks.facts = await page.$$eval(".key-facts li", (els) => els.map((e) => e.textContent.trim()));
    expect(checks.inputType === "password", "key input must be masked");
    expect(checks.manageKeyHiddenWithoutKey && !checks.keyModalBeforeChoice, "no key dialog and no Change-key button before the mode choice without a key");
    checks.pmIgnore = await page.$eval("#api-key-input", (e) => e.getAttribute("autocomplete") === "off" && e.hasAttribute("data-1p-ignore") && e.getAttribute("data-lpignore") === "true");
    expect(checks.pmIgnore, "the key field asks password managers not to save it");
    expect(checks.facts.some((f) => /reopening a closed tab/.test(f)), "the key facts say that reopening a closed tab can restore the key");
    expect(/dedicated key with a low monthly spend limit/i.test(checks.advice), "advice must name a dedicated key with a low spend limit");
    expect(checks.adviceLinks.every((h) => h.startsWith("https://platform.claude.com/")), "advice links must point to platform.claude.com");
    t.holder.fake = shortRun();
    await page.fill("#api-key-input", KEY);
    await page.click('button:has-text("Check key and continue")');
    await page.waitForSelector("#api-key-input", { state: "detached", timeout: 8000 });
    await waitStatus(page, /Done/);
    checks.runEnd = await lastEntry(page);
    expect(/Run facts/.test(checks.runEnd), "live run should end with a Run facts line");
    checks.keyInSession = await page.evaluate(([name, k]) => sessionStorage.getItem(name) === k, [KEYS.apiKey, KEY]);
    checks.keyLikeInLocal = await page.evaluate(() => { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/sk-ant-/.test(localStorage.getItem(k) || "")) out.push(k); } return out; });
    expect(checks.keyInSession, "key should be in session storage during the session");
    expect(checks.keyLikeInLocal.length === 0, "no key in local storage");
    checks.keyInDom = await page.evaluate((k) => document.documentElement.outerHTML.includes(k) || document.documentElement.outerHTML.includes("MOCKKEY"), KEY);
    expect(!checks.keyInDom, "key must not appear in the DOM");
    // Privacy row with a key
    await page.click("#btn-diagnostics");
    await page.waitForFunction(() => [...document.querySelectorAll(".diag-table tbody tr")].some((r) => /Key and privacy/.test(r.textContent) && r.querySelector('.diag-status[data-s="pass"], .diag-status[data-s="fail"]')), null, { timeout: 5000 });
    checks.privacyWithKey = await diagRow(page, "Key and privacy");
    await page.screenshot({ path: path.join(OUT, "A-key-diagnostics.png") });
    expect(checks.privacyWithKey?.s === "pass" && /stored for this tab only/.test(checks.privacyWithKey.detail), "privacy row should pass with a key and say it is tab-only");
    await closeModal(page);
    // Audit export
    const audit = await exportAudit(page);
    checks.auditHasKey = JSON.stringify(audit).includes("MOCKKEY");
    checks.auditRunFacts = audit.run_facts ? { tool_calls: audit.run_facts.tool_calls, verification_steps: audit.run_facts.verification_steps, checks: audit.run_facts.checks } : null;
    expect(!checks.auditHasKey, "audit export must not contain the key");
    expect(!!audit.run_facts, "audit export should carry run_facts");
    // A new tab in the same browser has no key
    const tab2 = await t.context.newPage();
    t.watch(tab2);
    await tab2.goto(BASE);
    await tab2.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    checks.newTabHasKey = await tab2.evaluate((k) => !!sessionStorage.getItem(k), KEYS.apiKey);
    expect(!checks.newTabHasKey, "a new tab must not see the key");
    await tab2.close();
    // Change or forget key from the mode modal
    await page.click("#btn-reset");
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.liveCta = await page.$eval('.mode-card[data-mode="live"] .mode-cta button', (b) => b.textContent.trim());
    checks.footerKey = await page.$eval(".modal-foot .left", (e) => e.textContent.trim()).catch(() => null);
    await page.screenshot({ path: path.join(OUT, "A-key-mode-footer.png") });
    expect(!!checks.footerKey && !checks.footerKey.includes(KEY) && /sk-ant-…/.test(checks.footerKey), "mode modal footer should show the masked key");
    await page.click("#btn-manage-key");
    await page.waitForSelector("#api-key-input", { timeout: 5000 });
    checks.currentMasked = await page.$eval(".key-current code", (e) => e.textContent);
    await page.click('button:has-text("Forget key")');
    checks.forgetMsg = await page.$eval("#api-key-msg", (e) => e.textContent.trim());
    checks.keyAfterForget = await page.evaluate((k) => sessionStorage.getItem(k), KEYS.apiKey);
    expect(checks.keyAfterForget === null, "Forget key must clear session storage");
    await closeModal(page);
    checks.statusAfterForget = await status(page);
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.liveCtaAfterForget = await page.$eval('.mode-card[data-mode="live"] .mode-cta button', (b) => b.textContent.trim());
    checks.manageKeyAfterForget = await page.isVisible("#btn-manage-key");
    await page.click('.mode-card[data-mode="live"] .mode-cta button');
    checks.keyAskedAgain = await page.waitForSelector("#api-key-input", { timeout: 5000 }).then(() => true).catch(() => false);
    expect(checks.keyAskedAgain, "after Forget key, Live must ask for a key again");
    await closeModal(page);
    // Where did the key go? Only in x-api-key headers to api.anthropic.com.
    const carrying = t.requests.filter((r) => JSON.stringify(r).includes("MOCKKEY"));
    checks.requestsWithKey = [...new Set(carrying.map((r) => `${r.method} ${r.host}${new URL(r.url).pathname}`))];
    checks.keyOnlyInHeader = carrying.every((r) => r.host === "api.anthropic.com" && r.headers["x-api-key"] === KEY && !r.url.includes("MOCKKEY") && !r.body.includes("MOCKKEY"));
    expect(carrying.length > 0 && checks.keyOnlyInHeader, "the key may travel only in the x-api-key header to api.anthropic.com");
    checks.hostsContacted = [...new Set(t.requests.map((r) => r.host))].sort();
    const allowed = new Set([new URL(BASE).host, "api.anthropic.com"]);
    checks.unexpectedHosts = checks.hostsContacted.filter((h) => !allowed.has(h));
    expect(checks.unexpectedHosts.length === 0, `unexpected hosts: ${checks.unexpectedHosts.join(", ")}`);
    checks.consoleMentionsKey = t.log.consoleAll.filter((x) => x.includes("MOCKKEY") || x.includes(KEY));
    expect(checks.consoleMentionsKey.length === 0, "the key must never be written to the browser console");
    checks.consoleLines = t.log.consoleAll.length;
  } catch (e) {
    problems.push(`exception: ${String(e.message).split("\n")[0]}`);
    await page.screenshot({ path: path.join(OUT, "A-key-fail.png") }).catch(() => {});
  }
  await finish("key lifecycle and privacy", t, checks, problems);
}

// ---- api.anthropic.com unreachable: Diagnostics says so, Live starts nothing, Simulation runs ---------------
if (run("diag")) {
  const t = await newPage({ blockHosts: ["api.anthropic.com"] });
  const { page } = t;
  const checks = {}, problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  try {
    await boot(page);
    await page.click("#btn-diagnostics");
    await page.click('button:has-text("Run all tests")');
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll(".diag-table tbody tr")];
      return rows.length === 3 && rows.every((r) => !r.querySelector('.diag-status[data-s="running"]')) && rows.some((r) => /Anthropic API/.test(r.textContent) && r.querySelector('.diag-status[data-s="fail"]'));
    }, null, { timeout: 20000 });
    checks.rows = await page.$$eval(".diag-table tbody tr", (rows) => rows.map((r) => `${r.querySelector("strong")?.textContent}: ${r.querySelector(".diag-status")?.dataset.s}`));
    checks.anthropic = await diagRow(page, "Anthropic API");
    expect(checks.anthropic?.s === "fail" && /Blocked or unreachable from this browser/.test(checks.anthropic?.detail || ""), `the Anthropic row fails and says why (got ${JSON.stringify(checks.anthropic)})`);
    for (const label of ["World data integrity", "Key and privacy"]) {
      const r = await diagRow(page, label);
      checks[label] = r;
      expect(r?.s === "pass", `${label} should pass (got ${r?.s})`);
    }
    expect(/integrity checks passed/.test(checks["World data integrity"]?.detail || ""), "the snapshot row names its checks");
    await page.screenshot({ path: path.join(OUT, "A-diag-flagged.png") });
    await closeModal(page);
    // Live: the key check cannot reach the API; nothing starts and nothing is sent elsewhere.
    await startMode(page, "live");
    await page.waitForSelector("#api-key-input", { timeout: 5000 });
    await page.fill("#api-key-input", KEY);
    await page.click('button:has-text("Check key and continue")');
    await page.waitForFunction(() => /Could not reach api\.anthropic\.com/.test(document.getElementById("api-key-msg")?.textContent || ""), null, { timeout: 15000 });
    checks.keyMessage = (await page.textContent("#api-key-msg")).trim();
    await page.screenshot({ path: path.join(OUT, "A-diag-key.png") });
    await closeModal(page);
    checks.statusAfterKey = await status(page);
    checks.entriesAfterKey = await entries(page);
    expect(checks.statusAfterKey === "Idle" && checks.entriesAfterKey === 0, `no run starts without the API (got ${checks.statusAfterKey}, ${checks.entriesAfterKey} entries)`);
    // Simulation needs no network.
    await page.click('button[aria-label="Replay speed ×4"]');
    await startMode(page, "simulation");
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 90000 });
    checks.simBadge = (await page.textContent("#mode-badge")).trim();
    expect(checks.simBadge === "SIMULATION", "Simulation runs while the API is unreachable");
    await page.click("#btn-abort");
    checks.hosts = [...new Set(t.requests.map((r) => r.host))].sort();
    expect(checks.hosts.every((h) => h === new URL(BASE).host || h === "api.anthropic.com"), `only the page's server and the API were tried (got ${checks.hosts.join(", ")})`);
  } catch (e) {
    problems.push(`exception: ${String(e.message).split("\n")[0]}`);
    await page.screenshot({ path: path.join(OUT, "A-diag-fail.png") }).catch(() => {});
  }
  await finish("API unreachable: Diagnostics explains, Live starts nothing, Simulation runs", t, checks, problems);
}

// ---- Abort / Reset matrix ------------------------------------------------------------------------------------
if (run("abort")) {
  const t = await newPage();
  const { page } = t;
  const checks = {}, problems = [];
  const used = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  const idleCheck = async (label) => {
    const s = await status(page);
    const n = await entries(page);
    const drafts = await page.$$eval(".action-card", (els) => els.length);
    const opts = await page.$$eval(".option-card", (els) => els.length);
    const badge = (await page.textContent("#mode-badge")).trim();
    checks[`${label}:idle`] = `${s}|entries ${n}|options ${opts}|drafts ${drafts}|${badge}`;
    expect(s === "Idle" && n === 0 && opts === 0 && drafts === 0, `${label}: Reset must return to a clean Idle (${checks[`${label}:idle`]})`);
  };
  const stable = async (label, ms = 2500) => {
    const a = await entries(page);
    await page.waitForTimeout(ms);
    const b = await entries(page);
    checks[`${label}:stable`] = `${a}→${b}`;
    expect(a === b, `${label}: nothing may appear after Abort (${a}→${b})`);
  };
  try {
    await boot(page);
    // S1: Simulation, abort while scanning, then Start again straight away (no Reset needed)
    await page.click('button[aria-label="Replay speed ×1"]').catch(() => {});
    await startMode(page, "simulation");
    await page.waitForTimeout(1800);
    checks["S1:before"] = await status(page);
    await page.click("#btn-abort");
    await waitStatus(page, /Aborted/, 5000);
    await stable("S1");
    checks["S1:end"] = await lastEntry(page);
    await startMode(page, "simulation");
    await page.waitForTimeout(1200);
    checks["S1:restart"] = await status(page);
    expect(/Spotting|Assessing|Checking|Calculating|Proposing|Running/i.test(checks["S1:restart"]) || checks["S1:restart"] !== "Aborted", `S1: Start after Abort must begin a new run (got ${checks["S1:restart"]})`);
    // S2: abort while options wait for a decision
    await page.click('button[aria-label="Replay speed ×4"]');
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 90000 });
    await page.click("#btn-abort");
    await waitStatus(page, /Aborted/, 5000);
    await stable("S2");
    await page.click('.option-card[data-recommended="true"] .btn-approve').catch(() => {});
    await page.waitForTimeout(400);
    checks["S2:approveAfterAbort"] = await page.$$eval(".option-card", (els) => els.map((e) => e.dataset.status || "open").join(","));
    checks["S2:buttonsLeft"] = await page.$$eval(".option-card .btn-approve, .option-card .option-actions .btn", (els) => els.length);
    checks["S2:heading"] = await page.$eval(".options-summary h3", (e) => e.textContent.trim());
    await page.screenshot({ path: path.join(OUT, "A-abort-options.png") });
    expect(checks["S2:approveAfterAbort"] === "expired,expired,expired,expired" && checks["S2:buttonsLeft"] === 0, "S2: an aborted run must show its options as undecided, without buttons");
    await page.click("#btn-reset");
    await idleCheck("S2");
    // S3: Reset (without Abort) while drafts wait for approval, then a full run to Done
    await startMode(page, "simulation");
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 90000 });
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 90000 });
    await page.click("#btn-reset");
    await idleCheck("S3");
    await page.waitForTimeout(1500);
    checks["S3:afterReset"] = `${await status(page)}|entries ${await entries(page)}`;
    expect(checks["S3:afterReset"] === "Idle|entries 0", "S3: the reset run must stay silent");
    await startMode(page, "simulation");
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 90000 });
    checks["S3:watermarkAtOptions"] = await page.isVisible(".sim-watermark");
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForSelector('button:has-text("Approve all")', { state: "visible", timeout: 90000 });
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 90000 });
    await page.click('button:has-text("Approve all")');
    await waitStatus(page, /Done/, 90000);
    checks["S3:end"] = await lastEntry(page);
    expect(/Replay facts/.test(checks["S3:end"]), "S3: a finished simulation should end with Replay facts");
    const simAudit = await exportAudit(page);
    checks["S3:runFacts"] = simAudit.run_facts ? `${simAudit.run_facts.tool_calls} tools, ${simAudit.run_facts.verification_steps} checks, ${JSON.stringify(simAudit.run_facts.checks)}` : null;
    expect(simAudit.run_facts?.checks?.at_least_8_tool_calls && simAudit.run_facts?.checks?.verification_visible, "S3: simulation run facts should meet the 8-tools and verification checks");
    // S4: Reset after Done
    await page.click("#btn-reset");
    await idleCheck("S4");

    // L1: Live, abort while the options wait for a decision; then a fresh live run completes
    const ref = REF["SC-PLATFORM"];
    // Options need a verified alert first: the source, the published view and the physical layer.
    const toOptions = (id) => [
      { usage: usage(), stop: "tool_use", blocks: [
        { type: "text", text: "Check: the operations log, what the channels publish and the physical layer at Köln Hbf." },
        { type: "tool_use", id: `toolu_${id}0a`, name: "ops_list_changes", input: { train: "ICE 618" } },
        { type: "tool_use", id: `toolu_${id}0b`, name: "kfp_get_published", input: { train: "ICE 618" } },
        { type: "tool_use", id: `toolu_${id}0c`, name: "phys_observe", input: { point: "KK" } }
      ] },
      { usage: usage(), stop: "tool_use", blocks: [
        { type: "text", text: "Finding: the source moves ICE 618 to Gleis 7; I quantify every channel." },
        { type: "tool_use", id: `toolu_${id}0d`, name: "ui_report_alert", input: { title: "ICE 618 leaves from platform 7; every channel says platform 5", severity: "high", basis: "verified", summary: "The source moved ICE 618 to Gleis 7 at 07:21 (OPS-05).", sources: ALERT_SOURCES, train_ids: ["ICE 618"] } },
        { type: "tool_use", id: `toolu_${id}1`, name: "sim_sync", input: ref.finding }
      ] },
      { usage: usage(), stop: "tool_use", blocks: [
        { type: "text", text: "Recommendation: option A." },
        { type: "tool_use", id: `toolu_${id}2`, name: "ui_propose_options", input: { recommended_variant_id: "V1", baseline_description: "Every channel keeps showing platform 5, not platform 7.", options: OPTIONS_618 } }
      ] }
    ];
    t.holder.fake = createFakeClaude(toOptions("a"));
    used.push(t.holder.fake);
    await startMode(page, "live");
    await enterKey(page);
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 20000 });
    const reqBefore = t.holder.fake.requests.length;
    await page.click("#btn-abort");
    await waitStatus(page, /Aborted/, 5000);
    await stable("L1");
    checks["L1:modelCallsAfterAbort"] = t.holder.fake.requests.length - reqBefore;
    expect(checks["L1:modelCallsAfterAbort"] === 0, "L1: no model call after Abort");
    await page.click("#btn-reset");
    await idleCheck("L1");
    t.holder.fake = shortRun();
    used.push(t.holder.fake);
    await startMode(page, "live");
    await waitStatus(page, /Done/);
    checks["L1:freshRun"] = await lastEntry(page);
    // L2: Live, abort while drafts wait for approval; a late draft decision is refused
    t.holder.fake = createFakeClaude([
      ...toOptions("b"),
      { usage: usage(), stop: "tool_use", blocks: [
        { type: "text", text: "Option A approved. Drafting the passenger message; it waits for your approval." },
        { type: "tool_use", id: "toolu_b3", name: "ui_draft_action", input: { type: "passenger_message", recipient: "Passenger information desk", subject: "ICE 618 today from platform 7", body: MESSAGE_618 } },
        { type: "tool_use", id: "toolu_b4", name: "ui_await_approvals", input: {} }
      ] }
    ]);
    used.push(t.holder.fake);
    await page.click("#btn-reset");
    await startMode(page, "live");
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 20000 });
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 20000 });
    await page.click("#btn-abort");
    await waitStatus(page, /Aborted/, 5000);
    await stable("L2");
    await page.click(".action-card .action-buttons .btn-approve").catch(() => {});
    await page.waitForTimeout(400);
    checks["L2:draftAfterAbort"] = await page.$$eval(".action-card", (els) => els.map((e) => `${e.dataset.status}:${e.querySelector(".chip")?.textContent}`).join(","));
    expect(/^expired:Not decided: the run ended$/.test(checks["L2:draftAfterAbort"]), "L2: an aborted run must show its drafts as not decided");
    await page.screenshot({ path: path.join(OUT, "A-abort-outbox.png") });
    checks["L2:modelCalls"] = t.holder.fake.requests.length;
    expect(checks["L2:modelCalls"] === 4, `L2: no model call after Abort (got ${checks["L2:modelCalls"]})`);
    await page.click("#btn-reset");
    await idleCheck("L2");
    // L3: Live, Reset while a model call is in flight; the late answer never appears
    t.holder.fake = createFakeClaude([
      { usage: usage(), stop: "end_turn", delayMs: 2500, blocks: [{ type: "text", text: "This late answer must never appear." }] }
    ]);
    used.push(t.holder.fake);
    await startMode(page, "live");
    await page.waitForTimeout(700);
    checks["L3:before"] = await status(page);
    await page.click("#btn-reset");
    await idleCheck("L3");
    await page.waitForTimeout(3200);
    checks["L3:after"] = `${await status(page)}|entries ${await entries(page)}|late ${await page.evaluate(() => /must never appear/.test(document.body.innerText))}`;
    expect(checks["L3:after"] === "Idle|entries 0|late false", "L3: nothing from the reset run may appear");
    // L4: after all that, a normal live run still completes
    t.holder.fake = shortRun();
    used.push(t.holder.fake);
    await startMode(page, "live");
    await waitStatus(page, /Done/);
    checks["L4:end"] = await lastEntry(page);
  } catch (e) {
    problems.push(`exception: ${String(e.message).split("\n")[0]}`);
    await page.screenshot({ path: path.join(OUT, "A-abort-fail.png") }).catch(() => {});
    checks.consoleTail = await page.$$eval("#console .entry", (els) => els.slice(-4).map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 200))).catch(() => []);
  }
  t.holder.fake = null;
  await finish("Abort and Reset matrix (Simulation and Live)", t, checks, problems, used);
}

// ---- Simulation fully offline ---------------------------------------------------------------------------------
if (run("offline")) {
  const t = await newPage({ offline: true });
  const { page } = t;
  const checks = {}, problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  const marks = async (label) => {
    const badge = (await page.textContent("#mode-badge")).trim();
    const wm = await page.isVisible(".sim-watermark");
    checks[`marks:${label}`] = `${badge}|watermark ${wm}`;
    expect(badge === "SIMULATION" && wm, `${label}: SIMULATION badge and watermark must be visible`);
  };
  try {
    await boot(page);
    await pickScenario(page, "SC-FPLO");
    await page.click('button[aria-label="Replay speed ×4"]');
    await startMode(page, "simulation");
    await page.waitForTimeout(1000);
    await marks("start");
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 90000 });
    await marks("options");
    checks.alignBefore = await page.$$eval("#mirror .al-channel", (els) => els.map((e) => `${e.dataset.channel}:${e.dataset.tone}`));
    await page.click('#mirror .mirror-tools button:has-text("Timetables")');
    await page.waitForSelector('#mirror .mrow[data-side="source"]', { timeout: 5000 });
    checks.mirrorBefore = await page.$$eval('#mirror .mrow[data-side="customer"][data-state]', (els) => els.map((e) => `${e.dataset.point}:${e.dataset.state}`));
    await page.click('.option-card[aria-label^="Option C:"] .btn-reject');
    await page.waitForTimeout(1500);
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 90000 });
    await marks("outbox");
    const cards = await page.$$(".action-card[data-status='pending'] .btn-reject");
    if (cards.length) await cards[cards.length - 1].click();
    await page.waitForTimeout(200);
    await page.click('button:has-text("Approve all")').catch(() => {});
    await waitStatus(page, /Done/, 90000);
    await marks("done");
    checks.end = await lastEntry(page);
    expect(/Replay facts/.test(checks.end), "offline replay should end with Replay facts");
    checks.decisions = await page.$$eval(".action-card", (els) => els.map((e) => e.dataset.status).join(","));
    expect(/approved/.test(checks.decisions) && /rejected/.test(checks.decisions), "both draft approval and rejection should play");
    checks.mirror = await page.evaluate(() => ({
      source: document.querySelectorAll('#mirror .mrow[data-side="source"]').length,
      rows: [...document.querySelectorAll('#mirror .mrow[data-side="customer"][data-state]')].map((e) => `${e.dataset.point}:${e.dataset.state}`),
      links: document.querySelectorAll("#mirror .mc-links .ml").length
    }));
    expect(checks.alignBefore.some((x) => x.endsWith(":affected")), `the finding is red on the alignment view offline (${checks.alignBefore})`);
    expect(checks.mirrorBefore.length > 0 && checks.mirrorBefore.every((x) => x.endsWith(":affected")), `the finding is red in the timetables offline (${checks.mirrorBefore})`);
    expect(checks.mirror.source > 0 && checks.mirror.links > 0 && checks.mirror.rows.length > 0 && checks.mirror.rows.every((x) => x.endsWith(":resolved")), `the mirror is drawn offline and shows the approved re-publication (${JSON.stringify(checks.mirror)})`);
    checks.externalAttempts = [...new Set(t.requests.filter((r) => !r.host.startsWith("127.0.0.1")).map((r) => r.host))].sort();
    expect(checks.externalAttempts.length === 0, `an offline simulation must not try any external host: ${checks.externalAttempts.join(", ")}`);
    await page.screenshot({ path: path.join(OUT, "A-offline-done.png") });
  } catch (e) {
    problems.push(`exception: ${String(e.message).split("\n")[0]}`);
    await page.screenshot({ path: path.join(OUT, "A-offline-fail.png") }).catch(() => {});
  }
  await finish("Simulation fully offline (no external request at all)", t, checks, problems);
}

await browser.close();
await close();
await writeFile(path.join(OUT, "accept-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`\n# ${r.name}: ${r.ok ? "PASS" : "FAIL"}`);
  for (const [k, v] of Object.entries(r.checks)) console.log(`  ${k}: ${JSON.stringify(v)?.slice(0, 260)}`);
  if (r.problems.length) console.log("  PROBLEMS:", r.problems);
  if (r.violations.length) console.log("  VIOLATIONS:", r.violations);
  console.log(`  pageErrors: ${JSON.stringify(r.pageErrors)} consoleErrors: ${JSON.stringify(r.consoleErrors.slice(0, 3))} csp: ${JSON.stringify(r.csp)}`);
}
const allOk = results.length > 0 && results.every((r) => r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} acceptance cases passed. Screenshots: ${OUT}`);
if (allOk && ONLY.length === 0) console.log("ACCEPT OK");
process.exit(allOk ? 0 : 1);
