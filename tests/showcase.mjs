// The presenter in Chromium, as a partner drives it, against the engine's own figures (computed here in
// Node with the page's modules, not read from the page). Cases, each runnable alone:
//   first-screen  four tiles marked data-vc-kpi, top right, with the engine's values for the platform
//                 change before anything runs (the guide still open); at most 13 controls on the first
//                 screen and none of 1.4.0's lab controls
//   header        at 1280 × 720 and 1920 × 1080: the icon and the name, SIMULATION, How it works with its
//                 words in view, the theme toggle (it switches), and under the header one sentence and
//                 the byline; the header keeps one row
//   turn          wherever the page waits for a person (the next step when paused, the decision, the
//                 drafts) a Your turn bar right under the story holds the page's one primary action,
//                 marked with vc-attention, in view and not covered; acting moves the figures
//   network       a simulation from the guide to Done, a scenario change and the Start dialog request
//                 nothing from another site; a live run against a stand-in requests api.anthropic.com
//                 only; the page links to the byline's two addresses and not to its repository
//   steps         Spot, Check, Calculate, Propose and Prepare under the header, by click, the bar's Next,
//                 the arrow keys, PageDown and PageUp, 1 to 5, Home and ?step=; the address follows
//   start         Start agent opens on the free simulation first, the live run second with the AI notice
//                 above its key; Run the simulation plays the story from Spot
//   keep          the three-column diagram (the source, the translator, what passengers are told) on
//                 every step; in Check the sensors confirm the source; the AI notice beside every live
//                 control; drafts approved but nothing published; the decision log says who did what
//   scenarios     the platform change opens first; the menu holds the other six; each opens with the
//                 engine's figures on its tiles and its decision in step 4, from the menu and from a link
//   play          Play waits for the guide, then walks the steps at reading pace (the rail fills), holds
//                 while a dialog is open, pauses on Space and on a step chosen by hand, stops where the
//                 person acts, goes on after they act and ends on Replay
//   layout        1920 × 1080, 1366 × 768 and 1280 × 720, light and dark, every step with its decision
//                 and drafts: no page scroll, the bar in view and clickable, the header one row with every
//                 figure in full, every text on Vici's type scale (none below its 2xs); all seven
//                 scenarios at 1280 × 720 after each kind of decision
// Usage: NODE_PATH="$(npm root -g)" node tests/showcase.mjs [case…]
import path from "node:path";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { launchBrowser, serveStatic, offlineContext, outDir, wanted, loadApp, NETWORK_NOISE, STEP_IDS, KPI_NAMES, VIEWPORTS, DEFAULT_SCENARIO, CORS, MOCK_KEY } from "./lib/harness.mjs";

const app = await loadApp();
const { story, run: runMod, estimate, format, config } = app;
const MODEL = config.MODELS.find((m) => m.id === config.DEFAULT_MODEL);
const LABELS = story.STEPS.map((s) => s.label);
const SLUGS = { "SC-PLATFORM": "platform-change", "SC-DIVERSION": "diversion", "SC-OPSSTOP": "operational-stop", "SC-TERMINUS": "new-terminus", "SC-COACH": "coach-order", "SC-FPLO": "construction-order", "SC-EUROPE": "european-timetable" };
/** Each scenario as the engine sees it: the tiles before a decision, the recommended option, Play's read times. */
const ENGINE = {};
for (const s of app.SCENARIOS) {
  const ev = await estimate.playHeadless(s);
  const rested = runMod.digest(ev.slice(0, ev.findIndex((e) => e.type === "option_decision")));
  const k = story.keyFigures(rested, { mode: "simulation", estimate: estimate.estimateCost(ev, s, MODEL.id).eur, model: MODEL.label });
  const v = story.story(rested, { scenario: s, mode: "simulation" });
  const o = ev.find((e) => e.type === "options").payload;
  ENGINE[s.id] = { scenario: s, k, rec: o.options.find((x) => x.recommended).letter, read: v.steps.map((x) => x.read), title: s.title };
}
const DEMO = ENGINE[DEFAULT_SCENARIO];
const OUT = await outDir("showcase");
const server = await serveStatic();
const browser = await launchBrowser();
const groups = [];

async function open(query = "guide=0", { width = 1280, height = 720, theme = "light" } = {}) {
  const { context, external } = await offlineContext(browser, { viewport: { width, height }, colorScheme: theme });
  await context.addInitScript((t) => { try { localStorage.setItem("vc-theme", t); } catch { /* blocked */ } }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
  await page.goto(`${server.base}${query ? `?${query}` : ""}`);
  await page.waitForFunction(() => document.documentElement.dataset.boot === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(150);
  return { context, page, errors, external };
}
const at = (page) => page.evaluate(() => ({
  step: document.querySelector('#steps [aria-current="step"]')?.closest("li")?.dataset.step || null,
  query: location.search,
  title: document.getElementById("story-title").textContent.trim()
}));
/** Each key figure: its value, the old value a decision struck through, its note and tone. */
const kpis = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-vc-kpi]")].map((t) => {
  const v = t.querySelector(".kpi-value");
  const was = v.querySelector(".vc-stat__was");
  const text = (n) => n.textContent.replace(/ /g, " ").trim();
  return [t.dataset.vcKpi, { value: [...v.childNodes].filter((c) => c !== was && !c.classList?.contains("vc-visually-hidden")).map(text).join("").trim(), was: was ? text(was) : null, struck: was ? getComputedStyle(was).textDecorationLine.includes("line-through") : false, note: text(t.querySelector(".kpi-note")), tone: t.dataset.tone || "" }];
})));
/** The bar under the story: tone, words, buttons (a * marks vc-attention), in view and uncovered. */
const bar = (page) => page.evaluate(() => {
  const move = document.getElementById("move");
  const r = move.getBoundingClientRect();
  const buttons = [...document.querySelectorAll("#move-actions button")];
  const uncovered = buttons.every((b) => { const x = b.getBoundingClientRect(); const hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2); return hit && b.contains(hit); });
  const scroller = document.getElementById("story").getBoundingClientRect();
  return {
    tone: move.dataset.tone, text: document.getElementById("move-text").textContent.replace(/\s+/g, " ").trim(),
    buttons: buttons.map((b) => `${b.id}${b.classList.contains("vc-attention") ? "*" : ""}`), labels: buttons.map((b) => b.textContent.trim()),
    marked: document.querySelectorAll(".vc-attention").length,
    inView: r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1, uncovered,
    // The bar is the story's last part: right after what just happened, or, when the story is longer
    // than the window, pinned to its bottom with the story scrolling above it.
    underStory: move.closest(".story-foot")?.parentElement?.id === "story" && !move.closest(".story-foot").nextElementSibling && r.top >= scroller.top && r.bottom <= scroller.bottom + 1
      && (document.getElementById("agent").getBoundingClientRect().bottom <= r.top + 1 || scroller.bottom - r.bottom <= 24)
  };
});
const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(150); };
async function run(name, token, fn) {
  if (!wanted(name)) return;
  const results = [];
  const check = (ok, what) => results.push([!!ok, what]);
  try { await fn(check); } catch (e) { check(false, `${name}: stopped with ${String(e.message || e).split("\n")[0]}`); }
  groups.push([results, token]);
}
/** Waits until a step can be shown (its button is enabled once the run reaches it). */
const reachable = (page, id) => page.waitForSelector(`#steps [data-step="${id}"] button:not([disabled])`, { timeout: 15000 });
/** Approves the recommended option in step 4 and both drafts in step 5. */
async function decideAll(page) {
  await press(page, "4");
  await page.click('.option[data-recommended="true"] [data-action="approve"]');
  await reachable(page, "prepare");
  await press(page, "5");
  await page.waitForSelector("#move-actions #approve-drafts", { timeout: 15000 });
  await page.click("#move-actions #approve-drafts");
  await page.waitForFunction(() => /^Done\./.test(document.getElementById("move-text").textContent.trim()), null, { timeout: 15000 });
}

try {
  // ---- the first screen ------------------------------------------------------------------------------
  await run("first-screen", "FIRST SCREEN OK", async (check) => {
    const { context, page, errors } = await open("", { width: 1280, height: 720 });
    const guide = await page.evaluate(() => document.getElementById("guide").open);
    const tiles = await kpis(page);
    const place = await page.evaluate(() => {
      const box = document.querySelector(".kpis").getBoundingClientRect();
      const head = document.querySelector(".app-header").getBoundingClientRect();
      return { right: Math.round(innerWidth - box.right), top: Math.round(box.top - head.top), inHeader: box.bottom <= head.bottom + 1, rightHalf: (box.left + box.right) / 2 > innerWidth / 2 };
    });
    check(guide, "a first visit opens the guide; the tiles below are read before anything runs");
    check(Object.keys(tiles).join("|") === KPI_NAMES.join("|") && Object.keys(tiles).length >= 2 && Object.keys(tiles).length <= 4, `four tiles marked data-vc-kpi: ${Object.keys(tiles).join(", ")}`);
    check(place.right <= 24 && place.top <= 16 && place.inHeader && place.rightHalf, `the tiles sit top right in the header (${JSON.stringify(place)})`);
    const want = { "Misinformed passengers": DEMO.k.pax, "First passenger acts in": DEMO.k.first, "Session cost": DEMO.k.cost };
    for (const [name, f] of Object.entries(want)) check(tiles[name]?.value === f.value && tiles[name]?.note === f.note, `"${name}" reads ${tiles[name]?.value}, ${tiles[name]?.note}: the engine's ${f.value}, ${f.note}`);
    check(tiles["Detection → decision"]?.value === "0:00" && tiles["Detection → decision"]?.note === "starts with the lead", `"Detection → decision" waits at 0:00 for the lead (${JSON.stringify(tiles["Detection → decision"])})`);
    await press(page, "Escape");
    await page.waitForTimeout(300);
    const controls = await page.evaluate(() => [...document.querySelectorAll("button, a[href], input, select")].filter((e) => {
      if (e.closest(".vc-byline, dialog, .vc-menu")) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).visibility === "visible";
    }).map((e) => e.textContent.trim() || e.getAttribute("aria-label") || e.id));
    check(controls.length <= 13, `${controls.length} controls on the first screen, at most 13 (${controls.join(", ")})`);
    const lab = controls.filter((c) => /Live sweep|Abort|Reset|Diagnostics|×\d|Sonnet|Haiku|Opus|Outbox|Audit|Export/.test(c));
    check(!lab.length, `none of 1.4.0's lab controls is on the first screen${lab.length ? `: ${lab.join(", ")}` : ""}`);
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await page.screenshot({ path: path.join(OUT, "first-screen-1280.png") });
    await context.close();
  });

  // ---- the header ------------------------------------------------------------------------------------
  await run("header", "HEADER OK", async (check) => {
    for (const [width, height] of [[1280, 720], [1920, 1080]]) {
      const { context, page, errors } = await open("guide=0", { width, height });
      const h = await page.evaluate(() => {
        const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.right <= innerWidth + 1 && getComputedStyle(e).visibility === "visible"; };
        const head = document.querySelector(".app-header");
        const hb = head.getBoundingClientRect();
        const how = document.querySelector('[data-vc-guide-open="guide"]');
        const range = document.createRange();
        range.selectNodeContents(how);
        const words = [...range.getClientRects()].reduce((w, r) => w + r.width, 0);
        const intro = document.querySelector(".intro-text");
        const parts = [".brand", ".header-actions", ".kpis"].map((s) => document.querySelector(s).getBoundingClientRect());
        return {
          icon: vis(document.querySelector(".brand .vc-cell .vc-icon--clock")), name: document.querySelector(".brand-name").textContent.trim(), nameShown: vis(document.querySelector(".brand-name")),
          mode: document.getElementById("mode-text").textContent, modeShown: vis(document.getElementById("mode-tag")),
          how: how.innerText.trim(), howShown: vis(how) && words > 60, toggle: vis(document.querySelector("[data-vc-theme-toggle]")),
          intro: intro.textContent.trim(), introShown: vis(intro) && intro.getBoundingClientRect().top >= hb.bottom - 1 && intro.getClientRects().length === 1 && intro.getBoundingClientRect().height < 40,
          byline: vis(document.querySelector(".intro .vc-byline")),
          oneRow: parts.every((r) => r.top >= hb.top - 1 && r.bottom <= hb.bottom + 1) && parts.every((r) => Math.abs((r.top + r.bottom) / 2 - (hb.top + hb.bottom) / 2) < hb.height / 2)
        };
      });
      const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "system");
      await page.click("[data-vc-theme-toggle]");
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "system");
      const w = `${width} × ${height}`;
      check(h.icon && h.name === "Timetable Translator" && h.nameShown, `${w}: the clock in its lilac cell and the name "${h.name}"`);
      check(h.mode === "SIMULATION" && h.modeShown, `${w}: the header says ${h.mode}`);
      check(h.how === "How it works" && h.howShown, `${w}: How it works shows its words ("${h.how}")`);
      check(h.toggle && before !== after, `${w}: the theme toggle switches the theme (${before} → ${after})`);
      check(h.introShown && h.byline && (h.intro.match(/[.!?](\s|$)/g) || []).length === 1, `${w}: under the header one sentence on one line ("${h.intro}") and the byline`);
      check(h.oneRow, `${w}: the header keeps one row`);
      check(!errors.length, `${w}: no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
      await context.close();
    }
  });

  // ---- Your turn -------------------------------------------------------------------------------------
  await run("turn", "TURN OK", async (check) => {
    const { context, page, errors } = await open("guide=0", { width: 1280, height: 720 });
    const ok = (b) => b.inView && b.uncovered && b.underStory && b.marked === 1;
    await press(page, "1");
    let b = await bar(page);
    check(b.tone === "move" && /^Your turn\. Next: Check\./.test(b.text) && b.buttons.join() === "next" && b.marked === 0 && b.inView && b.uncovered && b.underStory, `paused on a step, the bar offers the next one, not yet marked: "${b.text}" [${b.labels}] (${JSON.stringify({ inView: b.inView, uncovered: b.uncovered, underStory: b.underStory, marked: b.marked })})`);
    await page.waitForTimeout(6500);
    b = await bar(page);
    check(b.buttons.join() === "next*" && ok(b), `after six quiet seconds its Next draws the eye (${b.buttons})`);
    await page.click("#move-actions #next");
    await page.waitForTimeout(150);
    check((await at(page)).step === "check", "its button shows Check");
    await press(page, "4");
    b = await bar(page);
    check(b.tone === "decide" && /^Your turn\. The agent recommends option A: 7 instead of 312 misinformed/.test(b.text) && b.buttons.join() === "approve*" && b.labels[0] === `Approve option ${DEMO.rec}` && ok(b), `at the decision: "${b.text}" [${b.labels}]`);
    const wait = await page.$eval('#steps [data-step="propose"]', (li) => li.dataset.waits);
    check(wait === "true", "the step that waits is marked on the rail");
    await page.click("#move-actions #approve");
    await page.waitForTimeout(300);
    const t = await kpis(page);
    check(t["Misinformed passengers"].value === "7" && t["Misinformed passengers"].was === "312" && t["Misinformed passengers"].struck && t["Detection → decision"].note === "until your decision", `the decision moves the figures: ${t["Misinformed passengers"].was} → ${t["Misinformed passengers"].value}, the clock stops (${t["Detection → decision"].value})`);
    const row = await page.$eval('.option[data-recommended="true"]', (e) => e.dataset.state);
    check(row === "approved", `the recommended option reads approved (${row})`);
    await page.waitForSelector("#move-actions #next", { timeout: 10000 });
    await page.click("#move-actions #next");
    await page.waitForSelector("#move-actions #approve-drafts", { timeout: 10000 });
    b = await bar(page);
    check(b.tone === "decide" && /^Your turn\. Two drafts wait for your approval\. Approving publishes nothing\.$/.test(b.text) && b.buttons.join() === "approve-drafts*" && b.labels[0] === "Approve both drafts" && ok(b), `at the drafts: "${b.text}" [${b.labels}]`);
    await page.click("#move-actions #approve-drafts");
    await page.waitForFunction(() => /^Done\./.test(document.getElementById("move-text").textContent.trim()), null, { timeout: 15000 });
    b = await bar(page);
    check(b.tone === "done" && /Nothing was published/.test(b.text) && b.marked === 0 && b.buttons.join() === "again,cases", `at the end nothing waits: "${b.text}" [${b.labels}]`);
    // Every scenario's decision, at 1280 × 720.
    const rows = [];
    for (const [id, e] of Object.entries(ENGINE)) {
      if (id === DEFAULT_SCENARIO) continue;
      const o = await open(`scenario=${SLUGS[id]}&step=propose&guide=0`);
      const x = await bar(o.page);
      rows.push(x.buttons.join() === "approve*" && x.labels[0] === `Approve option ${e.rec}` && ok(x) ? null : `${id}: ${JSON.stringify(x)}`);
      await o.context.close();
    }
    check(rows.length === 6 && rows.every((r) => !r), `in the other six scenarios the decision's bar holds Approve option and is in view${rows.filter(Boolean).length ? `; ${rows.filter(Boolean).join("; ")}` : ""}`);
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();
  });

  // ---- the network -----------------------------------------------------------------------------------
  await run("network", "NETWORK OK", async (check) => {
    const { context, page, errors, external } = await open("", { width: 1920, height: 1080 });
    await press(page, "Escape");
    for (const k of ["1", "2", "3"]) await press(page, k);
    await decideAll(page);
    await page.click("#scenario-button");
    await page.click('#scenario-menu [role="menuitemradio"] >> nth=1');
    await page.waitForFunction(() => /scenario=/.test(location.search) && document.getElementById("move").dataset.tone !== "working", null, { timeout: 15000 }).catch(() => {});
    await page.click("#start");
    await page.waitForSelector("#start-dialog[open]");
    await page.click("#start-sim");
    await page.waitForTimeout(500);
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].filter((a) => !a.getAttribute("href").startsWith("#")).map((a) => a.href));
    check(!external.length, `a simulation from the guide to Done, a scenario change and the Start dialog request nothing from another site${external.length ? `: ${[...new Set(external)].join(", ")}` : ""}`);
    check(links.length === 2 && links.every((l) => ["https://www.linkedin.com/in/victorpflueger", "https://victorpflueger.github.io/VIP/index.html"].includes(l)), `the page links to the byline's two addresses only, not to its repository (${links.join(", ")})`);
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();
    // A live run: only api.anthropic.com.
    const usage = { input_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 420 };
    const fake = createFakeClaude([
      { usage, stop: "tool_use", blocks: [{ type: "text", text: "Lead received. I read the operations log first." }, { type: "tool_use", id: "toolu_n1", name: "ops_list_changes", input: { train: "ICE 618" } }] },
      { usage, stop: "end_turn", blocks: [{ type: "text", text: "The operations log moved ICE 618 to platform 7 at 07:21." }] }
    ]);
    const live = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const hosts = new Set();
    await live.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      hosts.add(u.host);
      if (u.host !== "api.anthropic.com") return route.abort("blockedbyclient");
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      if (u.pathname === "/v1/models") return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: [{ id: MODEL.id }] }) });
      const out = fake.handle(req.postData() || "{}", req.headers());
      return route.fulfill({ status: out.status, headers: { ...CORS, ...out.headers }, body: out.body }).catch(() => {});
    });
    const lp = await live.newPage();
    await lp.goto(`${server.base}?guide=0`);
    await lp.waitForFunction(() => document.documentElement.dataset.boot === "ready", null, { timeout: 20000 });
    await lp.click("#start");
    await lp.fill("#key-input", MOCK_KEY);
    await lp.click("#start-live");
    await lp.waitForFunction(() => /stopped|Done/.test(document.getElementById("move-text").textContent), null, { timeout: 20000 });
    check(fake.requests.length >= 2 && [...hosts].join() === "api.anthropic.com", `a live run against the stand-in requests api.anthropic.com only (${[...hosts].join(", ")}; ${fake.requests.length} model calls)`);
    await live.close();
  });

  // ---- the steps -------------------------------------------------------------------------------------
  await run("steps", "STEPS OK", async (check) => {
    const { context, page, errors } = await open("guide=0", { width: 1920, height: 1080 });
    const steps = await page.$$eval("#steps li", (els) => els.map((li) => `${li.dataset.step}:${li.querySelector(".vc-step__label").firstChild.textContent.trim()}`));
    check(steps.join("|") === STEP_IDS.map((id, i) => `${id}:${LABELS[i]}`).join("|"), `the steps under the header read ${steps.join(", ")}`);
    const below = await page.evaluate(() => document.getElementById("steps").getBoundingClientRect().top >= document.querySelector(".app-header").getBoundingClientRect().bottom - 1);
    check(below, "the steps sit under the header");
    let s = await at(page);
    check(s.step === "spot" && !/step=/.test(s.query), `the page opens on Spot with a clean address (${s.step}, "${s.query}")`);
    await page.click('#steps [data-step="calculate"] button');
    await page.waitForTimeout(150);
    s = await at(page);
    const calcTitle = `${DEMO.k.pax.value} passengers would act on wrong information, the first in ${DEMO.k.first.value}`;
    check(s.step === "calculate" && /step=calculate/.test(s.query) && s.title === calcTitle, `a click shows Calculate and writes ?step=calculate ("${s.title}")`);
    const aria = await page.$$eval("#steps button[aria-current]", (bs) => bs.map((b) => b.closest("li").dataset.step));
    check(aria.join() === "calculate", `the current step is marked aria-current (${aria})`);
    await press(page, "ArrowRight");
    const right = (await at(page)).step;
    await press(page, "ArrowLeft");
    const left = (await at(page)).step;
    await press(page, "PageDown");
    const down = (await at(page)).step;
    await press(page, "PageUp");
    const up = (await at(page)).step;
    await press(page, "2");
    const two = (await at(page)).step;
    await press(page, "Home");
    s = await at(page);
    check(right === "propose" && left === "calculate" && down === "propose" && up === "calculate" && two === "check" && s.step === "spot" && !/step=/.test(s.query), `the arrow keys, PageDown and PageUp, 2 and Home move the steps (${right}, ${left}, ${down}, ${up}, ${two}, ${s.step})`);
    await press(page, "5");
    const early = (await at(page)).step;
    check(early === "spot", `Prepare waits for a decision: 5 does nothing before it (${early})`);
    await decideAll(page);
    s = await at(page);
    check(s.step === "prepare" && /step=prepare/.test(s.query), `after the decision 5 shows Prepare (${s.step})`);
    await page.click('[data-vc-guide-open="guide"]');
    await page.waitForTimeout(150);
    await press(page, "ArrowLeft");
    const inGuide = (await page.evaluate(() => document.getElementById("guide").open)) && (await at(page)).step === "prepare";
    await press(page, "Escape");
    check(inGuide, "the arrow keys leave the steps alone while the guide is open");
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();
    const waiting = await open("step=check&guide=0");
    const w = await bar(waiting.page);
    await waiting.page.click("#move-actions #play-here");
    await waiting.page.waitForTimeout(300);
    const started = await waiting.page.$eval("#play-text", (e) => e.textContent);
    check(w.tone === "move" && /^Your turn\. Play walks the story from here/.test(w.text) && w.buttons.join() === "play-here*" && started === "Pause", `a link to a step waits for the person, and its bar's Play starts the story ("${w.text}" [${w.buttons}], then ${started})`);
    await waiting.context.close();
    const linked = await open("step=propose&guide=0");
    s = await at(linked.page);
    const linkedPlay = await linked.page.$eval("#play-text", (e) => e.textContent);
    check(s.step === "propose" && s.title.startsWith(`Option ${DEMO.rec} leaves`) && linkedPlay === "Play", `?step=propose opens at Propose, paused ("${s.title}")`);
    await linked.context.close();
  });

  // ---- Start agent -----------------------------------------------------------------------------------
  await run("start", "START OK", async (check) => {
    const { context, page, errors } = await open("guide=0", { width: 1280, height: 720 });
    const beside = await page.evaluate(() => { const n = document.getElementById("start").nextElementSibling; return n?.classList.contains("ai-notice") ? n.textContent.trim() : null; });
    check(beside === "You are interacting with an AI system", `the AI notice stands beside Start agent ("${beside}")`);
    await page.click("#start");
    await page.waitForSelector("#start-dialog[open]");
    const d = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#start-dialog .start-card")];
      const [a, b] = cards.map((c) => c.getBoundingClientRect());
      const live = cards[1];
      const notice = live.querySelector(".ai-notice-full");
      return {
        order: cards.map((c) => c.querySelector("h3").textContent.trim()),
        firstFirst: a.left < b.left - 1 || a.top < b.top - 1,
        simPrimary: document.getElementById("start-sim").className.trim() === "vc-button", simClass: document.getElementById("start-sim").className,
        livePrimary: !/vc-button--secondary/.test(document.getElementById("start-live").className),
        focus: document.activeElement?.id,
        notice: notice?.textContent.trim(), noticeFirst: !!notice && notice.compareDocumentPosition(document.getElementById("key-input")) === Node.DOCUMENT_POSITION_FOLLOWING,
        free: /costs nothing, needs no key/.test(cards[0].textContent), cost: live.querySelector('[data-fig="estimate"]')?.textContent
      };
    });
    check(d.order.join() === "Simulation,Live run" && d.firstFirst, `the dialog offers the simulation first, the live run second (${d.order.join(", ")})`);
    check(d.simPrimary && !d.livePrimary && d.focus === "start-sim" && d.free, `the free simulation is the primary button and has the focus (${JSON.stringify({ sim: d.simClass, live: d.livePrimary, focus: d.focus, free: d.free })})`);
    check(d.notice === "You are interacting with an AI system" && d.noticeFirst, `the live card says it is an AI above the key ("${d.notice}")`);
    check(d.cost === DEMO.k.cost.value.replace("≈ ", ""), `the live card names the estimated cost (${d.cost})`);
    await page.click("#start-sim");
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ open: document.getElementById("start-dialog").open, mode: document.getElementById("mode-text").textContent, play: document.getElementById("play-text").textContent, step: document.querySelector('#steps [aria-current="step"]')?.closest("li").dataset.step }));
    check(!after.open && after.mode === "SIMULATION" && after.play === "Pause" && after.step === "spot", `Run the simulation plays the story from Spot (${JSON.stringify(after)})`);
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();
  });

  // ---- what the rework keeps -----------------------------------------------------------------------------
  await run("keep", "KEEP OK", async (check) => {
    const { context, page, errors } = await open("guide=0", { width: 1280, height: 720 });
    const diagram = () => page.evaluate(() => {
      const heads = [...document.querySelectorAll("#diagram .al-head")].map((h) => h.textContent.replace(/^\d/, "").trim());
      const r = document.querySelector("#diagram .align")?.getBoundingClientRect();
      return { heads, shown: !!r && r.width > 300 && r.height > 200, bylines: document.querySelectorAll(".vc-byline").length };
    });
    const seen = [];
    for (const k of ["1", "2", "3", "4"]) { await press(page, k); seen.push(await diagram()); }
    await page.click('.option[data-recommended="true"] [data-action="approve"]');
    await reachable(page, "prepare");
    await press(page, "5");
    await page.waitForSelector("#move-actions #approve-drafts", { timeout: 15000 });
    seen.push(await diagram());
    const want = "The source|The translator|What passengers are told";
    check(seen.length === 5 && seen.every((d) => d.heads.join("|").replace(/as of [\d:]+/, "").trim() === want && d.shown && d.bylines === 1), `the three-column diagram shows on all five steps, under one byline (${seen.map((d) => d.heads.length).join(", ")} columns)`);
    const pending = await page.evaluate(() => ({ pending: document.querySelectorAll('.draft[data-status="pending"]').length, note: /Approving publishes nothing/.test(document.getElementById("story-card").innerText) }));
    await page.click("#move-actions #approve-drafts");
    await page.waitForFunction(() => /^Done\./.test(document.getElementById("move-text").textContent.trim()), null, { timeout: 15000 });
    const done = await page.evaluate(() => ({
      statuses: [...document.querySelectorAll(".draft-status")].map((e) => e.textContent.trim()),
      log: [...document.querySelectorAll(".log li")].map((e) => e.textContent.replace(/\s+/g, " ").trim()),
      bar: document.getElementById("move-text").textContent
    }));
    check(pending.pending === 2 && pending.note && done.statuses.length === 2 && done.statuses.every((x) => x === "Approved, not published") && /Nothing was published/.test(done.bar), `the drafts wait for approval and, approved, are not published (${done.statuses.join(", ")})`);
    check(done.log.length === 3 && /^\d{2}:\d{2}:\d{2} You approved option A/.test(done.log[0]) && done.log.slice(1).every((l) => /^\d{2}:\d{2}:\d{2} You approved /.test(l)), `the decision log says who approved what, and when (${done.log.join(" | ")})`);
    await press(page, "2");
    const sensors = await page.$eval(".al-sensors", (e) => ({ text: e.innerText.replace(/\s+/g, " ").trim(), readings: e.querySelectorAll(".al-obs li").length }));
    check(sensors.readings >= 1 && /Confirms the source/.test(sensors.text), `in Check the track sensors confirm the source ("${sensors.text}")`);
    const live = await page.evaluate(() => [...document.querySelectorAll("[data-vc-live]")].map((el) => {
      const near = el.id === "start" ? el.nextElementSibling : el.closest(".start-card");
      return { id: el.id, notice: !!near && /You are interacting with an AI system/.test(near.textContent) };
    }));
    check(live.length === 2 && live.every((l) => l.notice), `the AI notice stands beside every live control (${live.map((l) => `${l.id}: ${l.notice}`).join(", ")})`);
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();
  });

  // ---- the scenarios ---------------------------------------------------------------------------------
  await run("scenarios", "SCENARIOS OK", async (check) => {
    const { context, page, errors } = await open("guide=0", { width: 1920, height: 1080 });
    const first = await page.evaluate(() => ({ name: document.getElementById("scenario-name").textContent.trim(), stage: document.getElementById("stage-title").textContent.trim(), title: document.getElementById("story-title").textContent.trim(), query: location.search }));
    check(first.name === "Platform change" && first.stage === "ICE 618 to Hamburg-Altona" && first.title === DEMO.title && !/scenario=/.test(first.query), `the platform change opens first (${JSON.stringify(first)})`);
    await page.click("#scenario-button");
    const menu = await page.$$eval('#scenario-menu [role="menuitemradio"]', (els) => els.map((e) => ({ title: e.querySelector("span").textContent.trim(), checked: e.getAttribute("aria-checked") })));
    check(menu.length === 7 && menu[0].title === DEMO.title && menu[0].checked === "true" && menu.slice(1).every((m) => m.checked === "false"), `one menu holds all seven, the platform change checked first (${menu.map((m) => m.title).join(" · ")})`);
    await press(page, "Escape");
    const ids = Object.keys(ENGINE).filter((id) => id !== DEFAULT_SCENARIO);
    for (const [i, id] of ids.entries()) {
      const e = ENGINE[id];
      await page.click("#scenario-button");
      await page.click(`#scenario-menu [role="menuitemradio"] >> nth=${i + 1}`);
      await page.waitForFunction((slug) => location.search.includes(`scenario=${slug}`) && document.getElementById("move").dataset.tone !== "working" || document.getElementById("move-text").textContent.startsWith("Playing"), SLUGS[id], { timeout: 15000 });
      await page.waitForTimeout(200);
      const t = await kpis(page);
      const s = await at(page);
      await press(page, "4");
      const b = await bar(page);
      check(t["Misinformed passengers"].value === e.k.pax.value && t["First passenger acts in"].value === e.k.first.value && t["Session cost"].value === e.k.cost.value && s.title === e.title && b.labels[0] === `Approve option ${e.rec}`,
        `${id} from the menu: ${t["Misinformed passengers"].value} misinformed, the first in ${t["First passenger acts in"].value}, ${t["Session cost"].value}, "${s.title}", step 4 asks to approve option ${e.rec}`);
    }
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();
    const linked = await open("scenario=diversion&guide=0");
    const l = await kpis(linked.page);
    const lt = await at(linked.page);
    check(lt.title === ENGINE["SC-DIVERSION"].title && l["Misinformed passengers"].value === ENGINE["SC-DIVERSION"].k.pax.value, `?scenario=diversion opens the diversion ("${lt.title}", ${l["Misinformed passengers"].value})`);
    await linked.context.close();
  });

  // ---- Play --------------------------------------------------------------------------------------------
  await run("play", "PLAY OK", async (check) => {
    const { context, page, errors } = await open("", { width: 1280, height: 720 });
    const state = () => page.evaluate(() => ({
      step: document.querySelector('#steps [aria-current="step"]')?.closest("li").dataset.step,
      play: document.getElementById("play-text").textContent,
      fill: Number(document.querySelector("#steps .vc-step--current")?.style.getPropertyValue("--vc-step-fill") || 0),
      bar: document.getElementById("move-text").textContent.replace(/\s+/g, " ").trim()
    }));
    await page.waitForTimeout(1500);
    let s = await state();
    check(s.step === "spot" && s.play === "Play" && s.fill === 0, `Play waits while the guide is open (${JSON.stringify(s)})`);
    await press(page, "Escape");
    const t0 = Date.now();
    await page.waitForTimeout(1200);
    s = await state();
    const nextFill = await page.evaluate(() => Number(document.querySelector("#move-actions #next")?.style.getPropertyValue("--fill") || 0));
    check(s.play === "Pause" && s.fill > 0.04 && nextFill > 0.04 && /^Playing\. Check in \d+ s\. /.test(s.bar), `closing it plays: the rail and Next's foot fill, and the bar counts down ("${s.bar}", fill ${s.fill.toFixed(2)}, Next ${nextFill.toFixed(2)})`);
    await page.waitForFunction(() => document.querySelector('#steps [aria-current="step"]')?.closest("li").dataset.step === "check", null, { timeout: DEMO.read[0] + 3000 });
    const spotTook = Date.now() - t0;
    check(spotTook >= DEMO.read[0] - 600 && spotTook <= DEMO.read[0] + 2500, `Spot is read for its time: ${(spotTook / 1000).toFixed(1)} s (its reading time ${(DEMO.read[0] / 1000).toFixed(1)} s)`);
    // A dialog holds the time.
    await page.waitForTimeout(800);
    await page.click('[data-vc-guide-open="guide"]');
    const held0 = (await state()).fill;
    await page.waitForTimeout(1500);
    const held1 = (await state()).fill;
    await press(page, "Escape");
    check(Math.abs(held1 - held0) < 0.02 && (await state()).step === "check", `the open guide holds Play (${held0.toFixed(2)} → ${held1.toFixed(2)})`);
    // Space pauses and continues.
    await page.locator("#story").focus();
    await press(page, " ");
    const paused = await state();
    await page.waitForTimeout(1500);
    const still = await state();
    await press(page, " ");
    const again = await state();
    check(paused.play === "Play" && still.step === "check" && still.fill === 0 && again.play === "Pause", `Space pauses and continues (${paused.play}, ${still.step}, ${again.play})`);
    // A step chosen by hand pauses.
    await page.click('#steps [data-step="spot"] button');
    await page.waitForTimeout(200);
    const chosen = await state();
    check(chosen.play === "Play" && chosen.step === "spot", `a step chosen by hand pauses Play (${chosen.play}, ${chosen.step})`);
    // From Calculate, Play stops at the decision and waits.
    await page.click('#steps [data-step="calculate"] button');
    await page.click("#play");
    await page.waitForFunction(() => document.querySelector('#steps [aria-current="step"]')?.closest("li").dataset.step === "propose", null, { timeout: DEMO.read[2] + 3000 });
    await page.waitForTimeout(3000);
    s = await state();
    check(s.step === "propose" && /^Your turn\./.test(s.bar), `Play stops at the decision and waits (${s.step}: "${s.bar.slice(0, 60)}")`);
    await page.click("#move-actions #approve");
    await page.waitForFunction(() => document.querySelector('#steps [aria-current="step"]')?.closest("li").dataset.step === "prepare", null, { timeout: 20000 });
    await page.waitForSelector("#move-actions #approve-drafts", { timeout: 10000 });
    s = await state();
    check(s.step === "prepare" && s.play === "Pause", `after the approval Play goes on to the drafts (${s.step})`);
    await page.click("#move-actions #approve-drafts");
    await page.waitForFunction(() => document.getElementById("play-text").textContent === "Replay", null, { timeout: 20000 });
    s = await state();
    check(s.play === "Replay" && /^Done\./.test(s.bar), `the story ends on Replay ("${s.bar.slice(0, 60)}")`);
    await page.click("#play");
    await page.waitForFunction(() => document.getElementById("play-text").textContent === "Pause" && document.querySelector('#steps [aria-current="step"]')?.closest("li").dataset.step === "spot", null, { timeout: 15000 });
    check(true, "Replay starts the story again from Spot");
    check(!errors.length, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await context.close();
  });

  // ---- the layout --------------------------------------------------------------------------------------
  await run("layout", "LAYOUT OK", async (check) => {
    const headerNow = (page) => page.evaluate(() => ({
      height: Math.round(document.querySelector(".app-header").getBoundingClientRect().height),
      cut: [...document.querySelectorAll("[data-vc-kpi]")].filter((t) => [t, ...t.querySelectorAll("p")].some((e) => e.scrollWidth > e.clientWidth + 1)).map((t) => `${t.dataset.vcKpi} (${t.querySelector(".kpi-note").textContent.trim()})`)
    }));
    const measure = (page) => page.evaluate(() => {
      const inView = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden) return true; const r = e.getBoundingClientRect(); return r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; };
      const covered = [...document.querySelectorAll("#move-actions button")].filter((b) => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !hit || !b.contains(hit); }).map((b) => b.textContent.trim());
      const parts = [".app-header", ".intro", ".talk-track", "#diagram", "#story-title", "#move"].filter((s) => !inView(s));
      // Vici's type scale at this window (its sizes are rem, some fluid): every text uses one of them.
      const scale = ["2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl"].map((k) => {
        const probe = document.createElement("span");
        probe.style.fontSize = `var(--vc-font-size-${k})`;
        document.body.append(probe);
        const px = parseFloat(getComputedStyle(probe).fontSize);
        probe.remove();
        return px;
      });
      const small = new Set();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!n.textContent.trim() || !el || el.closest("dialog:not([open]), [hidden], .vc-visually-hidden, .vc-tooltip, .boot")) continue;
        // A struck-through old value is sized by Vici itself, relative to its figure (vc-stat__was).
        if (el.closest(".vc-stat__was")) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < scale[0] - 0.05 || !scale.some((x) => Math.abs(x - size) < 0.06)) small.add(`${n.textContent.trim().slice(0, 30)} (${size}px)`);
      }
      const wide = [...document.querySelectorAll("#story-card *, #diagram *, .kpis *")].filter((e) => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX === "visible" && !["SPAN", "STRONG", "S"].includes(e.tagName) && e.clientWidth > 0).map((e) => e.className || e.tagName).slice(0, 3);
      return { wide: document.documentElement.scrollWidth - innerWidth, tall: document.documentElement.scrollHeight - innerHeight, parts, covered, small: [...small].slice(0, 4), overflow: wide };
    });
    for (const [width, height] of VIEWPORTS) {
      for (const theme of ["light", "dark"]) {
        const { context, page, errors } = await open("guide=0", { width, height, theme });
        await press(page, "1");
        const problems = [];
        const first = await headerNow(page);
        const states = [["1", "spot"], ["2", "check"], ["3", "calculate"], ["4", "propose"], ["approve", "propose-decided"], ["5", "prepare"], ["drafts", "prepare-approved"]];
        for (const [key, name] of states) {
          if (key === "approve") { await page.click('.option[data-recommended="true"] [data-action="approve"]'); await reachable(page, "prepare"); }
          else if (key === "drafts") { await page.waitForSelector("#move-actions #approve-drafts", { timeout: 15000 }); await page.click("#move-actions #approve-drafts"); await page.waitForTimeout(600); }
          else await press(page, key);
          if (key === "5") await page.waitForSelector("#move-actions #approve-drafts", { timeout: 15000 });
          await page.waitForTimeout(150);
          const m = await measure(page);
          const head = await headerNow(page);
          if (m.wide > 0 || m.tall > 0) problems.push(`${name}: the page scrolls (${m.wide} px wide, ${m.tall} px tall)`);
          if (m.parts.length) problems.push(`${name}: out of view: ${m.parts.join(", ")}`);
          if (m.covered.length) problems.push(`${name}: the bar's ${m.covered.join(", ")} is covered`);
          if (m.small.length) problems.push(`${name}: text off Vici's type scale: ${m.small.join(", ")}`);
          if (m.overflow.length) problems.push(`${name}: wider than its box: ${m.overflow.join(", ")}`);
          if (head.height !== first.height) problems.push(`${name}: the header grew from ${first.height} to ${head.height} px`);
          if (head.cut.length) problems.push(`${name}: key figures cut: ${head.cut.join(", ")}`);
          await page.screenshot({ path: path.join(OUT, `${width}x${height}-${theme}-${name}.png`) });
        }
        check(!problems.length && !errors.length, `${width} × ${height} ${theme}: every step fits the window, the bar stays clickable, the header keeps one row with every figure in full, every text on Vici's type scale${problems.length ? `; ${problems.join("; ")}` : ""}${errors.length ? `; errors: ${errors.join(" | ")}` : ""}`);
        await context.close();
      }
    }
    // Every scenario, both ways a decision can go, at the narrowest window.
    const sweep = [];
    for (const id of Object.keys(ENGINE)) {
      for (const choice of ["recommended", "baseline"]) {
        const { context, page, errors } = await open(`${id === DEFAULT_SCENARIO ? "" : `scenario=${SLUGS[id]}&`}step=propose&guide=0`, { width: 1280, height: 720 });
        const first = await headerNow(page);
        await page.click(choice === "recommended" ? '.option[data-recommended="true"] [data-action="approve"]' : '.option[data-option="baseline"] [data-action="approve"]');
        await page.waitForTimeout(200);
        const head = await headerNow(page);
        const m = await measure(page);
        const bad = [head.height !== first.height ? `the header grew from ${first.height} to ${head.height} px` : "", head.cut.length ? `cut: ${head.cut.join(", ")}` : "", m.tall > 0 || m.wide > 0 ? "the page scrolls" : "", errors.length ? `errors: ${errors.join(" | ")}` : ""].filter(Boolean);
        sweep.push(bad.length ? `${id} ${choice}: ${bad.join(", ")}` : null);
        await context.close();
      }
    }
    const bad = sweep.filter(Boolean);
    check(sweep.length === 14 && !bad.length, `at 1280 × 720 the header keeps one row with every figure in full, in all seven scenarios after an approval and after accepting the risk${bad.length ? `; ${bad.join("; ")}` : ""}`);
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
console.log(`\nAll checks passed. Screenshots: ${OUT}\n${tokens.join("\n")}${groups.length === 10 ? "\nSHOWCASE OK" : ""}`);
