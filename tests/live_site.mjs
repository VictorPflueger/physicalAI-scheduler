// The published site: GitHub Pages serves exactly the files of this checkout, and a Simulation run
// completes there with no error and no request to any other host. Run after a Pages build (the
// "live site" workflow does this on every Pages build) or by hand.
//   files   index.html, the config, the engine, the world and the scripts as served equal this
//           checkout (Pages caches for up to ten minutes, so it retries for up to twelve)
//   run     the platform change on the presenter to the end: the guide, the verified finding on its tile,
//           the approval from the Your turn bar, both drafts approved, Done; no page error, nothing
//           loaded from another host (up to three runs a minute apart, for a deployment the CDN is
//           still taking up)
// In GitHub Actions every problem is also printed as an annotation (::error / ::warning).
// Usage: node tests/live_site.mjs [url]   (default: the repository's GitHub Pages address; LIVE_URL)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { APP_ROOT, launchBrowser } from "./lib/harness.mjs";

const URL_BASE = (process.argv[2] || process.env.LIVE_URL || "https://victorpflueger.github.io/physicalAI-scheduler/").replace(/\/?$/, "/");
const FILES = ["index.html", "js/config.js", "js/main.js", "js/sync.js", "js/tools.js", "css/app.css", "vici/dist/vici.js", "data/world.js", "data/sim_runs.js"];
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  const hosts = new Set();
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: URLs */ } });
  try {
    await page.goto(URL_BASE, { waitUntil: "load" });
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 30000 });
    // A fresh tab: the guide opens by itself; closing it plays the story.
    await page.waitForSelector("#guide[open]", { timeout: 10000 });
    await page.keyboard.press("Escape");
    const tile = (await page.locator('[data-vc-kpi="Misinformed passengers"]').innerText()).replace(/\s+/g, " ");
    if (!/Misinformed passengers 312 if nothing is done/.test(tile)) found.push(`the first tile reads "${tile}"`);
    await page.keyboard.press("4");
    await page.waitForSelector("#move-actions #approve", { timeout: 15000 });
    await page.click("#move-actions #approve");
    await page.waitForSelector('#steps [data-step="prepare"] button:not([disabled])', { timeout: 15000 });
    await page.keyboard.press("5");
    await page.waitForSelector("#move-actions #approve-drafts", { timeout: 30000 });
    await page.click("#move-actions #approve-drafts");
    await page.waitForFunction(() => /^Done\./.test(document.getElementById("move-text").textContent.trim()), null, { timeout: 30000 });
    const after = (await page.locator('[data-vc-kpi="Misinformed passengers"]').innerText()).replace(/\s+/g, " ");
    if (!/312 now 7 with option A/.test(after)) found.push(`after the approval the first tile reads "${after}"`);
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
    if (!found.length) { console.log(`PASS  run: the platform change plays from the guide to Done on the published site${attempt > 1 ? ` (run ${attempt})` : ""}`); break; }
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
