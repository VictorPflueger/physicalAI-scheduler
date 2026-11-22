// How the prototype works, in Chromium:
//   render   ViciDesign's own scripts/check-guide-render.mjs, run against the page served over http:
//            it opens once per tab, focus and keys behave, ?guide=0 and ?guide=present work, full
//            screen on a phone (Vici's script prints GUIDE BEHAVIOUR OK)
//   opening  the guide opens by itself in a fresh tab and again in a second new tab, stays shut on a
//            reload, stays shut with ?guide=0 and opens on the talk track with ?guide=present; the story
//            waits behind it and plays when it closes; How it works has a row for every key figure and
//            the talk track ends with five timed steps; every chapter fits a 1280 × 720 and a
//            1366 × 768 window without scrolling, in both themes, the guide's footer in view
// The fit check first proves itself on a planted chapter that does scroll.
// Usage: NODE_PATH="$(npm root -g)" node tests/guide.mjs [render] [opening] [--require-vici]
import { spawn } from "node:child_process";
import path from "node:path";
import { APP_ROOT, REQUIRE_VICI, viciDir, launchBrowser, serveStatic, outDir, wanted, KPI_NAMES, NETWORK_NOISE } from "./lib/harness.mjs";

const OUT = await outDir("guide");
const server = await serveStatic();
const browser = await launchBrowser();
const groups = [];
async function run(name, token, fn) {
  if (!wanted(name)) return;
  const results = [];
  const check = (ok, what) => results.push([!!ok, what]);
  try { await fn(check); } catch (e) { check(false, `${name}: stopped with ${String(e.message || e).split("\n")[0]}`); }
  groups.push([results, token]);
}

/** Every chapter of the open guide: does its text scroll, and is the footer in the window? */
const chapterFit = (page) => page.evaluate(async () => {
  const d = document.getElementById("guide");
  const box = d.querySelector(".vc-guide__chapters");
  const out = [];
  const rail = [...d.querySelectorAll(".vc-guide__rail .vc-step__button")];
  for (const [i, b] of rail.entries()) {
    b.click();
    await new Promise((r) => setTimeout(r, 60));
    const foot = d.querySelector(".vc-guide__footer").getBoundingClientRect();
    out.push({ chapter: d.querySelectorAll(".vc-guide__chapter")[i].dataset.vcChapter, over: box.scrollHeight - box.clientHeight, footer: foot.bottom <= innerHeight + 1 && foot.top >= 0 });
  }
  return out;
});
const guideOpen = (page) => page.evaluate(() => document.getElementById("guide").open);
const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.boot === "ready", null, { timeout: 20000 });

try {
  await run("render", "GUIDE RENDER OK", async (check) => {
    const dir = viciDir();
    if (!dir) {
      check(!REQUIRE_VICI, `${REQUIRE_VICI ? "no" : "skipped: no"} ViciDesign checkout next to this repository (../ViciDesign) or in VICI_DIR`);
      return;
    }
    // Vici's own behaviour check runs as its own process while this one serves the page.
    const r = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(dir, "scripts", "check-guide-render.mjs"), server.base, OUT], { cwd: APP_ROOT, env: process.env });
      let out = "";
      child.stdout.on("data", (d) => { out += d; });
      child.stderr.on("data", (d) => { out += d; });
      child.on("close", (status) => resolve({ status, out }));
    });
    const said = r.out.trim();
    check(r.status === 0 && /GUIDE BEHAVIOUR OK/.test(said), `Vici's check-guide-render.mjs passes against the page over http (${path.relative(APP_ROOT, dir) || dir})${r.status === 0 ? "" : `: ${said.split("\n").slice(-6).join(" | ")}`}`);
  });

  await run("opening", "GUIDE OPENING OK", async (check) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
    const errors = [];
    const watch = (p) => { p.on("pageerror", (e) => errors.push(String(e.message || e))); p.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); }); };
    const first = await context.newPage();
    watch(first);
    await first.goto(server.base);
    await ready(first);
    await first.waitForTimeout(400);
    const opened = await guideOpen(first);
    const title = await first.$eval("#guide-title", (e) => e.textContent.trim());
    // Behind the guide the story waits: no Play, the clock at 0:00.
    await first.waitForTimeout(1500);
    const waiting = await first.evaluate(() => ({ play: document.getElementById("play-text").textContent, clock: document.querySelector('[data-vc-kpi="Detection → decision"] .kpi-value').textContent.trim(), step: document.querySelector('#steps [aria-current="step"]')?.closest("li").dataset.step }));
    check(opened && title === "How the prototype works", `a fresh tab opens "${title}" by itself`);
    check(waiting.play === "Play" && waiting.clock === "0:00" && waiting.step === "spot", `the story waits behind the guide (${JSON.stringify(waiting)})`);
    await first.keyboard.press("Escape");
    await first.waitForTimeout(600);
    const playing = await first.evaluate(() => ({ open: document.getElementById("guide").open, play: document.getElementById("play-text").textContent, bar: document.getElementById("move-text").textContent.trim() }));
    check(!playing.open && playing.play === "Pause" && /^Playing\./.test(playing.bar), `closing the guide plays the story (${JSON.stringify(playing)})`);
    await first.reload();
    await ready(first);
    await first.waitForTimeout(400);
    check(!(await guideOpen(first)), "a reload of the same tab keeps the guide shut");
    const second = await context.newPage();
    watch(second);
    await second.goto(server.base);
    await ready(second);
    await second.waitForTimeout(400);
    check(await guideOpen(second), "a second new tab opens the guide again");
    const shut = await context.newPage();
    watch(shut);
    await shut.goto(`${server.base}?guide=0`);
    await ready(shut);
    await shut.waitForTimeout(400);
    check(!(await guideOpen(shut)), "?guide=0 keeps it shut");
    const present = await context.newPage();
    watch(present);
    await present.goto(`${server.base}?guide=present`);
    await ready(present);
    await present.waitForTimeout(400);
    const track = await present.evaluate(() => {
      const ch = document.querySelector('[data-vc-chapter="present"]');
      return { open: document.getElementById("guide").open, shown: !ch.hidden, items: [...ch.querySelectorAll(".vc-guide__path > li")].map((li) => ({ name: li.querySelector("strong").textContent.split(/[:.]/)[0].trim(), time: li.querySelector(".vc-guide__time")?.textContent.trim(), say: li.querySelector(".vc-guide__say")?.textContent.trim() || "" })) };
    });
    check(track.open && track.shown && track.items.length >= 3 && track.items.length <= 7 && track.items.every((i) => /^\d+ min$/.test(i.time || "") && i.say.length > 20), `?guide=present opens on the talk track: ${track.items.map((i) => `${i.name} ${i.time}`).join(", ")}`);
    const last = await present.evaluate(() => { const chapters = [...document.querySelectorAll(".vc-guide__chapter")]; return chapters[chapters.length - 1].dataset.vcChapter; });
    check(last === "present", `the talk track is the guide's last chapter (${last})`);
    const rows = await present.evaluate(() => [...document.querySelectorAll('[data-vc-chapter="how"] tbody th[scope="row"]')].map((t) => t.textContent.trim()));
    check(KPI_NAMES.every((k) => rows.includes(k)), `How it works has a row for every key figure (${rows.join(", ")})`);
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();

    // The fit check catches a chapter that scrolls.
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`${server.base}?guide=what`);
      await page.waitForFunction(() => document.getElementById("guide").open);
      await page.evaluate(() => { const lead = document.querySelector('[data-vc-chapter="what"] .vc-guide__lead'); lead.textContent = lead.textContent.repeat(14); });
      const planted = await chapterFit(page);
      check(planted[0].over > 0, `control: a chapter whose text overflows is caught (${planted[0].over} px)`);
      await page.close();
    }
    for (const [width, height] of [[1280, 720], [1366, 768]]) {
      for (const theme of ["light", "dark"]) {
        const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
        await ctx.addInitScript((t) => { try { localStorage.setItem("vc-theme", t); } catch { /* blocked */ } }, theme);
        const page = await ctx.newPage();
        await page.goto(`${server.base}?guide=what`);
        await page.waitForFunction(() => document.documentElement.dataset.boot === "ready" && document.getElementById("guide").open, null, { timeout: 20000 });
        await page.waitForTimeout(200);
        const fit = await chapterFit(page);
        const bad = fit.filter((c) => c.over > 1 || !c.footer);
        check(fit.length === 4 && !bad.length, `${width} × ${height} ${theme}: ${fit.map((c) => c.chapter).join(", ")} fit without scrolling${bad.length ? `; ${bad.map((c) => `${c.chapter} scrolls ${c.over} px${c.footer ? "" : ", footer out of view"}`).join("; ")}` : ""}`);
        if (theme === "light") {
          for (const [i, id] of ["what", "how", "real", "present"].entries()) {
            await page.click(`.vc-guide__rail .vc-step__button >> nth=${i}`);
            await page.waitForTimeout(100);
            await page.screenshot({ path: path.join(OUT, `${width}x${height}-${id}.png`) });
          }
        }
        await ctx.close();
      }
    }
  });
} finally {
  await browser.close();
  await server.close();
}

let failed = 0;
const tokens = [];
for (const [results, token] of groups) {
  for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  const f = results.filter(([ok]) => !ok).length;
  failed += f;
  if (!f) tokens.push(token);
}
if (failed) { console.log(`\n${failed} checks failed. Screenshots: ${OUT}`); process.exit(1); }
console.log(`\nAll checks passed. Screenshots: ${OUT}\n${tokens.join("\n")}${groups.length === 2 ? "\nGUIDE OK" : ""}`);
