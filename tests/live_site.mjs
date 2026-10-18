// The published site: GitHub Pages serves exactly the files of this checkout, and a Simulation run
// completes there with no error and no request to any other host. Run after a Pages build (the
// "live site" workflow does this on every Pages build) or by hand.
//   files   index.html, the config, the engine, the world and the scripts as served equal this
//           checkout (Pages caches for up to ten minutes, so it retries for up to twelve)
//   run     scenario 1 in Simulation mode to the end: the verified finding on the KPI tile, the
//           approval, the drafts approved, Done; no page error, nothing loaded from another host
// Usage: node tests/live_site.mjs [url]   (default: the repository's GitHub Pages address; LIVE_URL)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { APP_ROOT, launchBrowser, SKIP_INTRO } from "./lib/harness.mjs";

const URL_BASE = (process.argv[2] || process.env.LIVE_URL || "https://victorpflueger.github.io/physicalAI-scheduler/").replace(/\/?$/, "/");
const FILES = ["index.html", "js/config.js", "js/sync.js", "js/tools.js", "data/world.js", "data/sim_runs.js"];
const WAIT_MS = Number(process.env.LIVE_WAIT_MS || 12 * 60 * 1000);
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const problems = [];

// 1. The files as served equal this checkout.
const deadline = Date.now() + WAIT_MS;
let stale = FILES;
while (true) {
  stale = [];
  for (const f of FILES) {
    try {
      const r = await fetch(`${URL_BASE}${f}?t=${Date.now()}`, { cache: "no-store" });
      const body = Buffer.from(await r.arrayBuffer());
      if (!r.ok || sha(body) !== sha(fs.readFileSync(path.join(APP_ROOT, f)))) stale.push(`${f} (${r.status})`);
    } catch (e) {
      stale.push(`${f} (${String(e.message || e).slice(0, 60)})`);
    }
  }
  if (!stale.length || Date.now() > deadline) break;
  console.log(`waiting for the site to serve this checkout: ${stale.join(", ")}`);
  await new Promise((r) => setTimeout(r, 30000));
}
if (stale.length) problems.push(`the site does not serve this checkout: ${stale.join(", ")}`);
else console.log(`PASS  files: ${FILES.length} files as served equal this checkout`);

// 2. A Simulation run completes there.
if (!stale.length) {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.addInitScript(SKIP_INTRO);
  const page = await context.newPage();
  const errors = [];
  const hosts = new Set();
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: URLs */ } });
  try {
    await page.goto(URL_BASE, { waitUntil: "load" });
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 30000 });
    await page.click("#dd-scenario");
    await page.click('.menu-item[data-id="SC-PLATFORM"]');
    await page.click('button[aria-label="Replay speed ×4"]');
    await page.click("#btn-start");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
    const tile = await page.locator(".kpi").first().innerText();
    if (!/312[\s\S]*of 312 relying on it, verified/.test(tile)) problems.push(`the finding's tile reads "${tile.replace(/\s+/g, " ")}"`);
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 60000 });
    await page.click('button:has-text("Approve all")');
    await page.waitForSelector('button:has-text("Open management summary")', { state: "visible", timeout: 60000 });
    const status = (await page.locator(".status-pill").innerText()).trim();
    if (!/Done/.test(status)) problems.push(`the run ends as "${status}"`);
  } catch (e) {
    problems.push(`the run did not complete: ${String(e.message || e).split("\n")[0]}`);
  }
  const own = new URL(URL_BASE).host;
  const other = [...hosts].filter((h) => h !== own);
  if (other.length) problems.push(`requests to other hosts: ${other.join(", ")}`);
  if (errors.length) problems.push(`page errors: ${errors.slice(0, 3).join(" | ")}`);
  if (!problems.length) console.log("PASS  run: scenario 1 in Simulation mode completes on the published site");
  await browser.close();
}

for (const p of problems) console.log(`FAIL  ${p}`);
console.log(`${URL_BASE}: ${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
if (!problems.length) console.log("LIVE SITE OK");
process.exit(problems.length ? 1 : 0);
