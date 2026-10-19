// The published site: GitHub Pages serves exactly the files of this checkout, and a Simulation run
// completes there with no error and no request to any other host. Run after a Pages build (the
// "live site" workflow does this on every Pages build) or by hand.
//   files   index.html, the config, the engine, the world and the scripts as served equal this
//           checkout (Pages caches for up to ten minutes, so it retries for up to twelve)
//   run     scenario 1 in Simulation mode to the end: the verified finding on the KPI tile, the
//           approval, the drafts approved, Done; no page error, nothing loaded from another host
//           (up to three runs a minute apart, for a deployment the CDN is still taking up)
// In GitHub Actions every problem is also printed as an annotation (::error / ::warning).
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

// 2. A Simulation run completes there. Right after a first deployment the CDN can still answer
// with an older or missing file for a minute or two, so a failed run is tried again (three runs,
// a minute apart); the problems of an earlier run are reported as warnings.
async function simulationRun() {
  const found = [];
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
    if (!/Misinformed passengers[\s\S]*312[\s\S]*verified against the source/.test(tile)) found.push(`the finding's tile reads "${tile.replace(/\s+/g, " ")}"`);
    // The alignment view (the mirror's first view) shows every channel contradicting the source.
    const tones = await page.$$eval("#mirror .al-channel", (els) => els.map((e) => e.dataset.tone).join(","));
    if (tones !== "affected,affected,affected,affected") found.push(`the alignment view's channels read "${tones}"`);
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 60000 });
    await page.click('button:has-text("Approve all")');
    await page.waitForSelector('button:has-text("Open management summary")', { state: "visible", timeout: 60000 });
    // The run ends a moment after the summary appears (the player's last step), so wait for it to end.
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill")?.innerText || ""), null, { timeout: 15000 }).catch(() => {});
    const status = (await page.locator(".status-pill").innerText()).trim();
    if (!/Done/.test(status)) found.push(`the run ends as "${status}"`);
  } catch (e) {
    found.push(`the run did not complete: ${String(e.message || e).split("\n")[0]}`);
  }
  const own = new URL(URL_BASE).host;
  const other = [...hosts].filter((h) => h !== own);
  if (other.length) found.push(`requests to other hosts: ${other.join(", ")}`);
  if (errors.length) found.push(`page errors: ${errors.slice(0, 3).join(" | ")}`);
  await browser.close();
  return found;
}

// In GitHub Actions each problem also becomes an annotation, readable without the job log.
const annotate = (level, text) => { if (process.env.GITHUB_ACTIONS === "true") console.log(`::${level} title=live site::${text.replace(/\r?\n/g, " ")}`); };

if (!stale.length) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const found = await simulationRun();
    if (!found.length) { console.log(`PASS  run: scenario 1 in Simulation mode completes on the published site${attempt > 1 ? ` (run ${attempt})` : ""}`); break; }
    if (attempt === 3) { problems.push(...found); break; }
    for (const f of found) { console.log(`WARN  run ${attempt}: ${f}`); annotate("warning", `run ${attempt}: ${f}`); }
    await new Promise((r) => setTimeout(r, 60000));
  }
}

for (const p of problems) annotate("error", p);
for (const p of problems) console.log(`FAIL  ${p}`);
console.log(`${URL_BASE}: ${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
if (!problems.length) console.log("LIVE SITE OK");
process.exit(problems.length ? 1 : 0);
