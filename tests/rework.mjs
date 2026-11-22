// The portfolio audit's scoring rule (claude/prototype-portfolio-audit.md, "How this was measured"),
// rows A1 to A5 and B1 to B7, measured as the audit measured them: on the page as served over http and
// as Chromium renders it in a fresh tab at 1280 × 720 in the light theme, with every request to another
// site blocked and logged, and Vici's own checks from a ViciDesign checkout. Row C, the partner's
// judgement, is not a script. Prints every row with its points, then REWORK POINTS <sum>.
//   A1 byline with both links (rel="author")            3 if missing or incomplete
//   A2 the talk track opens by itself                   3 never, 1.5 only on a browser's first visit
//   A3 the talk track follows Vici's How it works       3 no Vici guide, 1 with structural problems
//   A4 key figures at the top                           3 none; 1 without data-vc-kpi; +1 fewer than 2
//                                                       or more than 4; +1 not at the top; +1 every tile
//                                                       empty on the first screen; at most 3
//   A5 key figures explained in the talk track          2 none named, 1 some, 0.5 not as rows
//   B1 Vici 2.0                                         3 on 1.x, 1.5 three or more PRs behind main,
//                                                       0.5 one or two behind (against origin/main of
//                                                       the ViciDesign checkout)
//   B2 Vici's writing rules                             1 for any problem
//   B3 the AI notice where a live run can start         2 if missing
//   B4 the header                                       0.5 each: no SIMULATION or LIVE, How it works
//                                                       without visible words, no theme toggle
//   B5 asks for the next click in words                 2 never in its code, 1 not where the first
//                                                       screen waits
//   B6 no requests to other sites                       1 for any
//   B7 no link to its own repository                    0.5 for any
// A release check, not a CI suite: B1 moves whenever ViciDesign's main does.
// Usage: NODE_PATH="$(npm root -g)" node tests/rework.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT, viciDir, launchBrowser, serveStatic, KPI_NAMES } from "./lib/harness.mjs";

const dir = viciDir();
if (!dir) { console.log("FAIL  no ViciDesign checkout next to this repository (../ViciDesign) or in VICI_DIR"); process.exit(1); }
const lib = async (file) => import(pathToFileURL(path.join(dir, "scripts", "lib", file)).href);
const { guideProblems } = await lib("guide.mjs");
const { writingProblems } = await lib("writing.mjs");
const { aiNoticeProblems, canRunLive } = await lib("ai.mjs");
const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const REPO = /github\.com\/VictorPflueger\/physicalAI-scheduler/i;
const rows = [];
const row = (code, points, what) => rows.push({ code, points, what });

const server = await serveStatic();
const browser = await launchBrowser();
const served = await (await fetch(server.base)).text();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: "light" });
  const external = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => { external.push(route.request().url()); return route.abort("blockedbyclient"); });
  const page = await context.newPage();
  await page.goto(server.base);
  await page.waitForFunction(() => document.documentElement.dataset.boot === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const first = await page.evaluate(() => {
    const head = document.querySelector("header")?.getBoundingClientRect();
    const tiles = [...document.querySelectorAll(".vc-stat")];
    const kpi = [...document.querySelectorAll("[data-vc-kpi]")];
    const top = kpi.length && kpi.every((t) => { const r = t.getBoundingClientRect(); return head && r.top >= head.top - 1 && r.bottom <= head.bottom + 1; });
    const empty = kpi.length && kpi.every((t) => !/\d/.test(t.querySelector(".vc-stat__value")?.textContent || ""));
    const byline = document.querySelector(".vc-byline");
    const links = byline ? [...byline.querySelectorAll("a[href]")].map((a) => ({ href: a.href, author: (a.rel || "").split(/\s+/).includes("author") })) : [];
    const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility === "visible"; };
    const how = document.querySelector("[data-vc-guide-open]");
    const range = document.createRange();
    if (how) range.selectNodeContents(how);
    return {
      guide: !!document.querySelector("dialog.vc-guide")?.open,
      stats: tiles.length, kpis: kpi.map((t) => t.dataset.vcKpi), top, empty, links,
      mode: /\b(SIMULATION|LIVE)\b/.test(document.querySelector("header")?.innerText || ""),
      how: !!how && vis(how) && /How it works/.test(how.innerText) && [...range.getClientRects()].reduce((w, r) => w + r.width, 0) > 60,
      toggle: vis(document.querySelector("[data-vc-theme-toggle]")),
      rows: [...document.querySelectorAll('[data-vc-chapter="how"] tbody th[scope="row"]')].map((t) => t.textContent.trim()),
      howText: document.querySelector('[data-vc-chapter="how"]')?.textContent || "",
      bar: document.getElementById("move-text")?.textContent.trim() || ""
    };
  });
  // A second new tab, then a pause on the first screen: does the page ask for the next click in words?
  const second = await context.newPage();
  await second.goto(server.base);
  await second.waitForFunction(() => document.documentElement.dataset.boot === "ready", null, { timeout: 20000 });
  await second.waitForTimeout(400);
  const again = await second.evaluate(() => !!document.querySelector("dialog.vc-guide")?.open);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page.locator("#story").focus();
  await page.keyboard.press(" ");
  await page.waitForTimeout(300);
  const waits = await page.evaluate(() => ({ text: document.getElementById("move-text").textContent.trim(), actions: [...document.querySelectorAll("#move-actions button")].map((b) => b.textContent.trim()) }));
  // The walk: every step, the decision, the drafts.
  for (const k of ["2", "3", "4"]) { await page.keyboard.press(k); await page.waitForTimeout(120); }
  await page.click("#move-actions #approve");
  await page.waitForSelector('#steps [data-step="prepare"] button:not([disabled])', { timeout: 15000 });
  await page.keyboard.press("5");
  await page.waitForSelector("#move-actions #approve-drafts", { timeout: 15000 });
  await page.click("#move-actions #approve-drafts");
  await page.waitForTimeout(800);
  const rendered = await page.content();
  const anchors = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href));

  // A1
  const li = first.links.find((l) => /linkedin\.com\/in\/victorpflueger/.test(l.href));
  const site = first.links.find((l) => /victorpflueger\.github\.io\/VIP/.test(l.href));
  row("A1", li?.author && site?.author ? 0 : 3, `byline: LinkedIn ${li ? (li.author ? "with" : "without") + " rel=author" : "missing"}, website ${site ? (site.author ? "with" : "without") + " rel=author" : "missing"}`);
  // A2
  row("A2", first.guide && again ? 0 : first.guide ? 1.5 : 3, `the talk track opens by itself: first tab ${first.guide}, second new tab ${again}`);
  // A3
  const g = /class="[^"]*\bvc-guide\b/.test(served) ? guideProblems(served) : null;
  row("A3", g === null ? 3 : g.length ? 1 : 0, `Vici's guide${g === null ? " missing" : g.length ? `: ${g.join("; ")}` : ": guideProblems finds nothing"}`);
  // A4
  let a4 = 0;
  if (!first.kpis.length) a4 = first.stats ? 1 : 3;
  if (first.kpis.length && (first.kpis.length < 2 || first.kpis.length > 4)) a4 += 1;
  if (first.kpis.length && !first.top) a4 += 1;
  if (first.kpis.length && first.empty) a4 += 1;
  row("A4", Math.min(3, a4), `key figures: ${first.kpis.length} tiles marked data-vc-kpi (${first.kpis.join(", ")}), at the top ${first.top}, all empty ${first.empty}`);
  // A5
  const named = first.kpis.filter((k) => first.howText.includes(k));
  const asRows = first.kpis.filter((k) => first.rows.includes(k));
  row("A5", !first.kpis.length ? 2 : asRows.length === first.kpis.length ? 0 : named.length === first.kpis.length ? 0.5 : named.length ? 1 : 2, `${asRows.length} of ${first.kpis.length} key figures are rows of How it works`);
  // B1
  let b1 = 3;
  let b1what = "";
  try {
    const ours = ["dist/vici.min.css", "dist/vici.js"].map((f) => readFileSync(path.join(APP_ROOT, "vici", f)));
    const main = git("rev-parse", "origin/main");
    const matches = (rev) => ["dist/vici.min.css", "dist/vici.js"].every((f, i) => { try { return execFileSync("git", ["-C", dir, "show", `${rev}:${f}`], { maxBuffer: 64 * 1024 * 1024 }).equals(ours[i]); } catch { return false; } });
    if (matches(main)) { b1 = 0; b1what = `vici/ equals ViciDesign origin/main (${main.slice(0, 7)})`; } else {
      const revs = git("rev-list", "--first-parent", "origin/main").split("\n");
      const at = revs.findIndex((r) => matches(r));
      const behind = at < 0 ? null : git("rev-list", "--merges", "--first-parent", `${revs[at]}..origin/main`).split("\n").filter(Boolean).length;
      b1 = behind === null ? 3 : behind >= 3 ? 1.5 : behind >= 1 ? 0.5 : 0;
      b1what = behind === null ? "vici/ matches no commit on ViciDesign's main" : `vici/ is ${behind} pull requests behind ViciDesign's main`;
    }
  } catch (e) { b1what = `could not compare with ViciDesign (${String(e.message).split("\n")[0]})`; }
  row("B1", b1, b1what);
  // B2
  const w = [...new Set([...writingProblems(served), ...writingProblems(rendered)])];
  row("B2", w.length ? 1 : 0, `Vici's writing rules on the page as served and as rendered${w.length ? `: ${w.join("; ")}` : ": no problem"}`);
  // B3
  const a = canRunLive(served) ? aiNoticeProblems(served) : [];
  row("B3", a.length ? 2 : 0, `the AI notice${canRunLive(served) ? "" : " (the page cannot run live)"}${a.length ? `: ${a.join("; ")}` : ": where a live run can start"}`);
  // B4
  row("B4", (first.mode ? 0 : 0.5) + (first.how ? 0 : 0.5) + (first.toggle ? 0 : 0.5), `header: SIMULATION or LIVE ${first.mode}, How it works with words ${first.how}, theme toggle ${first.toggle}`);
  // B5
  const js = readdirSync(path.join(APP_ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(path.join(APP_ROOT, "js", f), "utf8")).join("\n");
  const inCode = /Your turn/.test(js);
  const onFirst = /^Your turn\./.test(waits.text) && waits.actions.length === 1;
  row("B5", !inCode ? 2 : onFirst ? 0 : 1, `asks for the next click in words: in the code ${inCode}; paused on the first screen "${waits.text.slice(0, 70)}" [${waits.actions.join(", ")}]`);
  // B6
  row("B6", external.length ? 1 : 0, `requests to other sites: ${external.length ? [...new Set(external)].join(", ") : "none"}`);
  // B7
  const own = anchors.filter((h) => REPO.test(h)).length + (REPO.test(served) ? 1 : 0);
  row("B7", own ? 0.5 : 0, `links to its own repository: ${own}`);
  // The key figures the rule reads are the ones the page means.
  if (first.kpis.join("|") !== KPI_NAMES.join("|")) row("--", 0, `note: the tiles read ${first.kpis.join(", ")}`);
  await context.close();
} finally {
  await browser.close();
  await server.close();
}

const sum = rows.reduce((n, r) => n + r.points, 0);
for (const r of rows) console.log(`${r.points ? "FAIL" : "PASS"}  ${r.code}  ${String(r.points).padStart(3)}  ${r.what}`);
console.log(`\n(Vici's checks from ${dir}; row C is the partner's judgement)`);
console.log(`REWORK POINTS ${sum}`);
process.exit(sum ? 1 : 0);
