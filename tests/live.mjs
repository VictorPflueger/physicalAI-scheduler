// A live run in Chromium against a scripted stand-in for Anthropic's API (tests/lib/fake-claude.mjs),
// which streams real server-sent events and checks every request against the rules the live agent
// must follow. No real key and no real model; the app is served from this folder. Cases:
//   full     ICE 618 end to end on the presenter: the key is checked (free, no tokens), the dialog
//            closes, the header says LIVE and the page says it is an AI; Claude's steps unlock as it
//            reaches them and the page follows; the alert is confirmed by the sensors; the engine's
//            figures reach the tiles and the options; option B rejected, option A approved from the
//            Your turn bar; a draft that quotes a time no tool returned is refused in view; one draft
//            approved, one rejected; the summary; the session cost measured from the usage, to the
//            cent; a retry after an overloaded API in view; nothing requested but api.anthropic.com
//   stop     Stop the live run while a model call is in flight: the bar says why, and nothing of the
//            late answer appears; no request after the stop
//   badkey   a key Anthropic rejects at the check: the dialog says why and no run starts; a key
//            rejected in the middle of a run: the run stops, says why, and the key leaves the tab
// Usage: NODE_PATH="$(npm root -g)" node tests/live.mjs [case…]       prints LIVE OK when all pass
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { APP_ROOT, ONLY, outDir, wanted, launchBrowser, serveStatic, CORS, MOCK_KEY, NETWORK_NOISE } from "./lib/harness.mjs";

const OUT = await outDir("live");
const { base: BASE, close } = await serveStatic(APP_ROOT);
const browser = await launchBrowser();
const { REF, SCEN } = await loadData();
const results = [];
const KEY = MOCK_KEY;

async function loadData() {
  const load = async (file, name) => {
    const sandbox = { window: {} };
    new Function("window", await readFile(path.join(APP_ROOT, file), "utf8"))(sandbox.window);
    return sandbox.window[name];
  };
  return { REF: await load("data/reference_cases.js", "REFERENCE_CASES"), SCEN: await load("data/scenarios.js", "SCENARIOS") };
}

/** A page whose requests to api.anthropic.com the stand-in answers; any other host is blocked and recorded. */
async function newPage(fake, { models = "ok", width = 1920, height = 1080 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const log = { pageErrors: [], consoleErrors: [], external: [], anthropic: [] };
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host === "api.anthropic.com") {
      log.anthropic.push(`${req.method()} ${u.pathname}`);
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      if (u.pathname === "/v1/models") {
        if (models === "reject") return route.fulfill({ status: 401, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
        return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }] }) });
      }
      if (u.pathname === "/v1/messages") {
        const out = fake.handle(req.postData() || "{}", req.headers());
        if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs));
        return route.fulfill({ status: out.status, headers: { ...CORS, ...out.headers }, body: out.body }).catch(() => {});
      }
    }
    log.external.push(`${req.method()} ${u.host}${u.pathname}`);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log.pageErrors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text()) && !m.text().includes("[Timetable Translator] live run failed")) log.consoleErrors.push(m.text()); });
  await page.goto(`${BASE}?guide=0`);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  return { context, page, log };
}

/** Start agent → the live card → the key → Check key and start. */
async function startLive(page, key = KEY) {
  await page.click("#start");
  await page.waitForSelector("#start-dialog[open]");
  await page.fill("#key-input", key);
  await page.click("#start-live");
}
const words = (page) => page.$eval("#agent-words", (e) => e.innerText.replace(/\s+/g, " ").trim());
const bar = (page) => page.evaluate(() => ({
  tone: document.getElementById("move").dataset.tone,
  text: document.getElementById("move-text").textContent.replace(/\s+/g, " ").trim(),
  buttons: [...document.querySelectorAll("#move-actions button")].map((b) => `${b.id}${b.classList.contains("vc-attention") ? "*" : ""}`)
}));
const tile = (page, name) => page.$eval(`[data-vc-kpi="${name}"]`, (t) => {
  const v = t.querySelector(".kpi-value");
  const was = v.querySelector(".vc-stat__was");
  return { value: [...v.childNodes].filter((c) => c !== was && !c.classList?.contains("vc-visually-hidden")).map((c) => c.textContent).join("").replace(/ /g, " ").trim(), was: was ? was.textContent.trim() : null, note: t.querySelector(".kpi-note").textContent.trim() };
});
/** Every step's agent words, read by going through the steps (the page follows the run otherwise). */
async function allWords(page) {
  const out = [];
  for (let i = 1; i <= 5; i++) {
    const enabled = await page.$eval(`#steps li:nth-child(${i}) button`, (b) => !b.disabled);
    if (!enabled) continue;
    await page.keyboard.press(String(i));
    await page.waitForTimeout(120);
    out.push(await words(page));
  }
  return out.join(" | ");
}

async function finish(name, t, fake, checks, expect) {
  const csp = await t.page.evaluate(() => window.__csp || []).catch(() => []);
  results.push({ name, checks, expect, violations: fake?.violations || [], remainingScript: fake?.remaining?.() ?? null, pageErrors: t.log.pageErrors, consoleErrors: t.log.consoleErrors, csp, external: t.log.external });
  await t.context.close();
}

const usage = (o = {}) => ({ input_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 420, ...o });
const lastResults = (req) => {
  const last = req.messages[req.messages.length - 1];
  return Array.isArray(last?.content) ? last.content.filter((b) => b.type === "tool_result").map((b) => ({ isError: b.is_error === true, raw: b.content, json: safeJson(b.content) })) : [];
};
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

const PLATFORM = REF["SC-PLATFORM"];
const SEED = SCEN.find((s) => s.id === "SC-PLATFORM").seed;
const OPTIONS_618 = [
  { variant_id: "V1", title: "Re-publish ICE 618 from the source", description: "Release source version 2 to every channel and push the platform change to app, displays and announcements.", residual_risk: "Passengers already at platform 5 rely on the announcement to reach platform 7." },
  { variant_id: "V2", title: "Messages and platform staff, data later", description: "Push the change to app, displays and announcements, staff at platform 5 sending people to platform 7; data stays.", residual_risk: "Planner and coach order keep the old platform and sectors." },
  { variant_id: "V3", title: "Override displays and announcements by hand", description: "Set Gleis 7 by hand on the station displays and the announcements, and push an app message.", residual_risk: "Hand-kept values become a second truth; the planner stays wrong." }
];
const SOURCES = [{ title: "Operations log OPS-05 (Fahrdienstleiter Köln Hbf)" }, { title: "Weichendiagnose, ESTW Köln Hbf" }];
const MESSAGE_618 = "App push (DE): ICE 618 nach Hamburg-Altona, Abfahrt 07:42, fährt heute von Gleis 7 statt Gleis 5.\nApp push (EN): ICE 618 to Hamburg-Altona, departing 07:42, leaves from platform 7 today instead of platform 5.\n\nDisplay (DE): ICE 618 heute Gleis 7\nDisplay (EN): ICE 618 today platform 7\n\nAnnouncement (DE): Gleisänderung: ICE 618 nach Hamburg-Altona, Abfahrt 07:42, fährt heute von Gleis 7.\nAnnouncement (EN): Platform change: ICE 618 to Hamburg-Altona, departing 07:42, leaves from platform 7 today.";
const ORDER_618 = "Please re-publish ICE 618 from source version 2 (OPS-05) to the journey planner, the station displays, the announcements and the coach order. The channels were generated at 05:30; the short-notice rule held the change back.";
const REPORT_618 = "## ICE 618: passenger-information decision\n\n**What we found.** The source moved ICE 618 (07:42 to Hamburg-Altona) from platform 5 to platform 7 at 07:21 (OPS-05); every channel still shows platform 5, generated at 05:30. The point diagnostics confirm the failure.\n\n**If we do nothing.** 312 passengers act on wrong information, the first in 14 minutes.\n\n**Decision.** Option A approved: re-publish ICE 618 from the source, with a message on the app, the displays and the announcements.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Passengers still misinformed | 312 | 7 |\n| Back in sync with the source | never | after 8 min |\n\n**Actions.** One draft approved, one rejected; nothing was published.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.";

// ---- case: full ICE 618 run ----------------------------------------------------------------------------
if (wanted("full")) {
  const script = [
    { usage: usage({ input_tokens: 3400, cache_creation_input_tokens: 6100, cache_read_input_tokens: 0, output_tokens: 380 }), stop: "tool_use", blocks: [
      { type: "thinking", thinking: "The radio message is a lead. First the operations log and what the channels publish for ICE 618; both lookups are independent.", signature: "SIG-THINK-1==" },
      { type: "text", text: "Lead received: platform staff at Köln Hbf say ICE 618 leaves from platform 7 today, but the app still says platform 5. I read the operations log and the published view in parallel." },
      { type: "tool_use", id: "toolu_01", name: "ops_list_changes", input: { train: "ICE 618" } },
      { type: "tool_use", id: "toolu_02", name: "kfp_get_published", input: { train: "ICE 618" } }
    ], expect: (req, { check }) => {
      check(req.messages.length === 1 && typeof req.messages[0].content === "string" && req.messages[0].content.includes(SEED), "opening message must carry the lead");
      check(req.thinking?.type === "adaptive" && req.thinking?.display === "summarized", "thinking params");
      check(req.output_config?.effort === "medium", "effort");
      check(req.cache_control?.type === "ephemeral", "cache_control");
      check(req.tools.map((t) => t.name).join(",") === "ops_get_overview,ops_list_changes,ops_get_timetable,kfp_get_published,phys_observe,ops_get_passengers,ops_find_alternatives,sim_sync,ui_report_alert,ui_mark_mirror,ui_propose_options,ui_await_decision,ui_draft_action,ui_await_approvals,ui_final_report", "the fifteen tools in order");
      check(/one source of timetable truth/.test(req.system) && /keep no timetable of your own/.test(req.system), "the translator principle is in the system prompt");
    } },
    { usage: usage(), stop: "pause_turn", blocks: [
      { type: "text", text: "Hypothesis: the source moved ICE 618 to Gleis 7 at 07:21 (OPS-05), and every channel still shows platform 5 from 05:30." }
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r.length === 2 && r.every((x) => !x.isError), "two lookups answered");
      const ch = r[0]?.json?.changes?.[0];
      check(ch?.id === "OPS-05" && ch?.time === "07:21" && /Gl\. 7 statt Gl\. 5/.test(ch?.record || ""), `operations log returned (got ${String(r[0]?.raw).slice(0, 160)})`);
      const pl = r[1]?.json?.channels?.planner;
      check(r[1]?.json?.current_source_version === 2 && pl?.generated_from_version === 1 && pl?.stops?.[0]?.platform === "5", `published view returned (got ${String(r[1]?.raw).slice(0, 160)})`);
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Check: a dispatch record alone is one source, so I read the physical layer at Köln Hbf and the source timetable." },
      { type: "tool_use", id: "toolu_03", name: "phys_observe", input: { point: "KK" } },
      { type: "tool_use", id: "toolu_04", name: "ops_get_timetable", input: { train: "ICE 618" } }
    ], expect: (req, { check }) => { const last = req.messages[req.messages.length - 1]; check(last.role === "assistant", "pause_turn must be resent with the assistant turn last"); } },
    { error: { status: 529, type: "overloaded_error", message: "Overloaded" } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Confirmed: the point diagnostics report W 32 failed at 07:12 and the route out of Gleis 7 is set. I raise the alert, mark the mirror and make a first estimate on the journey planner." },
      { type: "tool_use", id: "toolu_05", name: "ui_report_alert", input: {
        title: "ICE 618 leaves from platform 7; every channel says platform 5", severity: "high", basis: "verified",
        summary: "The source moved ICE 618 (07:42 to Hamburg-Altona) to Gleis 7 at 07:21; the journey planner, the displays and the announcements still show platform 5.",
        sources: SOURCES, train_ids: ["ICE 618"], point_ids: ["KK"]
      } },
      { type: "tool_use", id: "toolu_06", name: "ui_mark_mirror", input: { train_ids: ["ICE 618"], point_ids: ["KK"], state: "affected", focus: "ICE 618" } },
      { type: "tool_use", id: "toolu_07", name: "sim_sync", input: PLATFORM.hypothesis }
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r.length === 2 && r.every((x) => !x.isError), `the retried request carries both lookups (got ${r.map((x) => x.isError).join(",")})`);
      const obs = r[0]?.json?.observations || [];
      check(obs.some((o) => o.id === "PHY-01" && o.supports.includes("OPS-05")), `the point failure corroborates OPS-05 (got ${String(r[0]?.raw).slice(0, 200)})`);
      check(r[1]?.json?.version === 2 && r[1]?.json?.rows?.[0]?.track === "7" && r[1]?.json?.rows?.[0]?.dep === "07:42.0", `source timetable returned (got ${String(r[1]?.raw).slice(0, 200)})`);
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Revised: the journey planner only → every channel and the coach order. The same change reverses the coach sectors at Köln Hbf, so I check the full scope." },
      { type: "tool_use", id: "toolu_08", name: "sim_sync", input: PLATFORM.finding }
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      const kinds = r[0]?.json?.evidence_kinds || [];
      check(r[0]?.json?.ok === true && ["operations", "published", "physical", "source"].every((k) => kinds.includes(k)), `alert accepted with the source, the published view and the physical layer (got ${JSON.stringify(r[0]?.json)})`);
      check(r[1]?.json?.ok === true && r[1]?.json?.marked === 2, `mirror marked (got ${String(r[1]?.raw).slice(0, 120)})`);
      check(r[2]?.json?.ok === true && r[2]?.json?.basis === "partial" && r[2]?.json?.baseline?.misinformed_pax === 8, `first estimate: partial, 8 passengers (got ${String(r[2]?.raw).slice(0, 160)})`);
    } },
    { usage: usage({ output_tokens: 900 }), stop: "tool_use", blocks: [
      { type: "text", text: "Recommendation: option A. It leaves 7 passengers misinformed instead of 312 and brings every channel back in sync after 8 minutes, with no hand-kept value." },
      { type: "tool_use", id: "toolu_09", name: "ui_propose_options", input: { recommended_variant_id: "V1", baseline_description: "Every channel keeps showing platform 5, not platform 7, until someone publishes by hand; 312 passengers would act on it.", options: OPTIONS_618 } }
    ], expect: (req, { check }) => {
      const r = lastResults(req)[0]?.json;
      check(r?.ok === true && r?.basis === "source" && r?.variants?.length === 3, "sim_sync with three variants on the full scope from the source");
      check(r?.baseline?.misinformed_pax === 312 && r?.contradictions?.map((c) => c.id).join(",") === "T-618/KK/coach_order,T-618/KK/platform", `engine figures (got ${JSON.stringify(r?.baseline).slice(0, 160)})`);
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Option B rejected. Options A and C remain open." },
      { type: "tool_use", id: "toolu_10", name: "ui_await_decision", input: {} }
    ], expect: (req, { check }) => { const r = lastResults(req)[0]?.json; check(r?.decision === "rejected" && r?.option_id === "V2" && r?.refer_to_it_as === "option B", `rejection returned as tool result (got ${JSON.stringify(r).slice(0, 160)})`); } },
    { usage: usage({ output_tokens: 16000 }), stop: "max_tokens", cut: 1, discard: true, blocks: [
      { type: "text", text: "Option A approved. Drafting the passenger message." },
      { type: "tool_use", id: "toolu_11x", name: "ui_draft_action", input: { type: "passenger_message", recipient: "Passenger information desk", subject: "ICE 618: platform 7", body: "App push (DE): …" } }
    ], expect: (req, { check }) => { const r = lastResults(req)[0]?.json; check(r?.decision === "approved" && r?.option_id === "V1" && r?.figures?.still_misinformed === 7 && r?.figures?.back_in_sync_min === 8, `approval returned as tool result (got ${JSON.stringify(r).slice(0, 200)})`); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Option A approved. I draft the passenger message and the re-publication order; each waits for your approval in the Outbox." },
      { type: "tool_use", id: "toolu_11", name: "ui_draft_action", input: { type: "passenger_message", recipient: "Passenger information desk", subject: "ICE 618 today from platform 7", body: MESSAGE_618.replace(/07:42/g, "07:44") } },
      { type: "tool_use", id: "toolu_12", name: "ui_draft_action", input: { type: "republish_order", recipient: "Timetable publication team (customer timetable)", subject: "Re-publish ICE 618 from source version 2", body: ORDER_618 } }
    ], expect: (req, { check }) => { check(req.max_tokens === 24000, `max_tokens raised after cut-off (got ${req.max_tokens})`); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Correction: ICE 618 departs at 07:42, as the source says, not at the time I typed." },
      { type: "tool_use", id: "toolu_13", name: "ui_draft_action", input: { type: "passenger_message", recipient: "Passenger information desk", subject: "ICE 618 today from platform 7", body: MESSAGE_618 } }
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r[0]?.isError && /07:44/.test(r[0]?.json?.error || "") && /match nothing this text may quote/.test(r[0]?.json?.error || ""), `the fact audit refuses the typed time (got ${String(r[0]?.raw).slice(0, 200)})`);
      check(r[1]?.json?.status === "pending_approval", `the re-publication order is queued (got ${String(r[1]?.raw).slice(0, 120)})`);
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_14", name: "ui_await_approvals", input: {} }
    ], expect: (req, { check }) => { const r = lastResults(req); check(r.length === 1 && r[0].json?.status === "pending_approval", "the corrected message is queued"); } },
    { usage: usage({ output_tokens: 700 }), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_15", name: "ui_final_report", input: { outcome: "response_decided", markdown: REPORT_618 } }
    ], expect: (req, { check }) => { const r = lastResults(req)[0]?.json; check(r?.approved === 1 && r?.rejected === 1, `draft decisions returned (got ${JSON.stringify({ a: r?.approved, r: r?.rejected })})`); } },
    { usage: usage({ output_tokens: 40 }), stop: "end_turn", blocks: [
      { type: "text", text: "The management summary is published. One draft was approved, one rejected; nothing was published to passengers." }
    ], expect: (req, { check }) => { const r = lastResults(req)[0]?.json; check(r?.published === true && r?.outcome === "response_decided", `report published (got ${JSON.stringify(r).slice(0, 160)})`); } }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const { page } = t;
  const c = {};
  try {
    // Every value the first tile shows during the run, in order.
    await page.evaluate(() => {
      window.__pax = [];
      const v = document.querySelector('[data-vc-kpi="Misinformed passengers"] .kpi-value');
      new MutationObserver(() => { const t = v.textContent.replace(/\s+/g, " ").trim(); if (window.__pax.at(-1) !== t) window.__pax.push(t); }).observe(v, { childList: true, subtree: true, characterData: true });
    });
    await startLive(page);
    await page.waitForSelector("#start-dialog", { state: "hidden", timeout: 8000 });
    c.mode = (await page.textContent("#mode-text")).trim();
    c.playHidden = await page.$eval("#play", (b) => b.hidden);
    await page.waitForFunction(() => /Claude is working/.test(document.getElementById("move-text").textContent), null, { timeout: 8000 });
    c.working = await bar(page);
    c.agentNote = (await page.textContent("#agent-note")).trim();
    c.tip = (await page.textContent("#tip-mode")).trim();
    await page.screenshot({ path: path.join(OUT, "L1-live-working.png") });
    // The options: the page has followed Claude to step 4.
    await page.waitForSelector('.option[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 30000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "L2-live-options.png") });
    c.step = await page.$eval('#steps [aria-current="step"]', (b) => b.closest("li").dataset.step);
    c.optionRows = await page.$$eval(".option", (els) => els.map((e) => `${e.dataset.option}:${e.querySelector(".option-figs strong")?.textContent}`));
    c.paxBefore = await tile(page, "Misinformed passengers");
    c.barAtDecision = await bar(page);
    // The alert, confirmed by the sensors, in step 2.
    await page.keyboard.press("2");
    await page.waitForTimeout(150);
    c.alert = await page.$eval("#story-card", (e) => e.innerText.replace(/\s+/g, " ").trim());
    c.sensors = await page.$eval(".al-sensors", (e) => e.innerText.replace(/\s+/g, " ").trim());
    await page.keyboard.press("4");
    await page.waitForTimeout(150);
    // Reject option B, then approve option A from the bar.
    await page.click('.option[data-option="V2"] [data-action="reject"]');
    await page.waitForFunction(() => document.querySelector('.option[data-option="V2"]')?.dataset.state === "rejected", null, { timeout: 8000 });
    await page.waitForFunction(() => /Option B rejected/.test(document.getElementById("agent-words").innerText), null, { timeout: 15000 });
    await page.waitForSelector("#move-actions #approve", { timeout: 15000 });
    c.barAfterReject = await bar(page);
    await page.click("#move-actions #approve");
    await page.waitForTimeout(400);
    c.paxAfter = await tile(page, "Misinformed passengers");
    c.firstAfter = await tile(page, "First passenger acts in");
    c.clockAfter = await tile(page, "Detection → decision");
    // The drafts: two wait, the refused one is in view.
    await page.waitForFunction(() => document.querySelectorAll('.draft[data-status="pending"]').length === 2 && document.getElementById("move-actions").querySelector("#approve-drafts"), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "L3-live-drafts.png") });
    c.step5 = await page.$eval('#steps [aria-current="step"]', (b) => b.closest("li").dataset.step);
    c.drafts = await page.$$eval(".draft", (els) => els.map((e) => e.querySelector(".draft-to").textContent.trim()));
    c.draftTyped = await page.$$eval(".draft pre", (els) => els.some((e) => e.textContent.includes("07:44")));
    c.refusal = await page.$$eval("#agent-words .notice", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()).find((x) => /Guardrail/.test(x)) || null);
    // Approve the first, reject the last.
    await page.click('.draft[data-status="pending"] [data-action="approve"] >> nth=0');
    await page.waitForTimeout(200);
    await page.click('.draft[data-status="pending"] [data-action="reject"] >> nth=-1');
    await page.waitForFunction(() => /^Done\./.test(document.getElementById("move-text").textContent.trim()), null, { timeout: 30000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "L4-live-done.png") });
    c.done = await bar(page);
    c.summary = await page.$eval("#story-card", (e) => /Management summary/.test(e.innerText) && /Written by the agent/.test(e.innerText));
    c.log = await page.$$eval(".log li", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
    c.statuses = await page.$$eval(".draft", (els) => els.map((e) => e.dataset.status));
    c.cost = await tile(page, "Session cost");
    let usd = 0;
    for (const s of script) {
      if (!s.usage) continue;
      const u = s.usage;
      usd += u.input_tokens * 2 / 1e6 + u.cache_creation_input_tokens * 2.5 / 1e6 + u.cache_read_input_tokens * 0.1 / 1e6 + u.output_tokens * 10 / 1e6;
    }
    c.expectedCost = `€${(usd * 0.894).toFixed(2)}`;
    c.words = await allWords(page);
    c.paxSeen = await page.evaluate(() => window.__pax);
  } catch (e) {
    c.FAILED = String(e.message).split("\n")[0];
    await page.screenshot({ path: path.join(OUT, "L-fail.png") }).catch(() => {});
    c.barAtFail = await bar(page).catch(() => null);
  }
  await finish("full: ICE 618 from the key to the summary", t, fake, c, (x) => [
    [x.mode === "LIVE" && x.playHidden, `the header says LIVE and Play steps aside (got ${x.mode}, Play hidden ${x.playHidden})`],
    [/You are interacting with an AI system/.test(x.working?.text || "") && /You are interacting with an AI system/.test(x.agentNote || "") && /You are interacting with an AI system/.test(x.tip || ""), `while Claude works, the bar, the agent's words and the mode tag say it is an AI (got "${x.working?.text}")`],
    [x.working?.buttons?.includes("stop"), `the bar offers Stop the live run while Claude works (got ${x.working?.buttons})`],
    [x.step === "propose", `the page followed Claude to step 4 (got ${x.step})`],
    [JSON.stringify(x.optionRows) === JSON.stringify(["V1:7", "V2:15", "V3:72", "baseline:312"]), `the options carry the engine's figures (got ${JSON.stringify(x.optionRows)})`],
    [x.paxBefore?.value === "312" && x.paxBefore?.note === "if nothing is done", `the tile shows the verified 312 (got ${JSON.stringify(x.paxBefore)})`],
    [x.barAtDecision?.tone === "decide" && x.barAtDecision?.buttons?.join() === "approve*", `at the decision the bar holds one marked action (got ${JSON.stringify(x.barAtDecision)})`],
    [/confirmed by (two|three) sources/.test(x.alert || "") && /platform 7/.test(x.alert || "") && !/Gleis/.test(x.alert || "") && /Track sensors/.test(x.sensors || "") && /Confirms the source/.test(x.sensors || ""), `step 2 shows the alert confirmed by the sensors (got "${(x.alert || "").slice(0, 120)}" / "${(x.sensors || "").slice(0, 120)}")`],
    [x.barAfterReject?.buttons?.join() === "approve*", `after the rejection the bar still asks for the decision (got ${JSON.stringify(x.barAfterReject)})`],
    [x.paxAfter?.value === "7" && x.paxAfter?.was === "312" && x.paxAfter?.note === "with option A", `approving option A moves the tile to 7, with 312 struck through (got ${JSON.stringify(x.paxAfter)})`],
    [x.firstAfter?.value === "14 min" && x.firstAfter?.note === "right information in 2 min", `the first passenger gets the right information in 2 min (got ${JSON.stringify(x.firstAfter)})`],
    [x.clockAfter?.note === "stopped at your decision", `the clock stops at the decision (got ${JSON.stringify(x.clockAfter)})`],
    [x.step5 === "prepare" && JSON.stringify(x.drafts) === JSON.stringify(["Re-publication order to Timetable publication team (customer timetable)", "Passenger message to Passenger information desk"]), `step 5 shows the two drafts (got ${x.step5}, ${JSON.stringify(x.drafts)})`],
    [x.draftTyped === false && /^Guardrail: A draft was refused\. These timetable facts match nothing this text may quote: 07:44\.$/.test(x.refusal || ""), `the draft with the typed time was refused in view and never reached step 5 (got ${x.refusal})`],
    [x.done?.tone === "done" && /Nothing was published/.test(x.done?.text || "") && x.done?.buttons?.includes("back"), `the run ends Done, nothing published, with a way back to the simulation (got ${JSON.stringify(x.done)})`],
    [x.summary && JSON.stringify(x.statuses) === JSON.stringify(["approved", "rejected"]), `the summary is in step 5 and the drafts read approved, rejected (got ${JSON.stringify(x.statuses)})`],
    [x.log?.length === 4 && x.log.every((l) => /^\d{2}:\d{2}:\d{2} You /.test(l)), `the decision log records four decisions with their times (got ${JSON.stringify(x.log)})`],
    [x.cost?.value === x.expectedCost && /^measured, Claude Sonnet 5\.5$/.test(x.cost?.note || ""), `the session cost is measured from the usage (got ${JSON.stringify(x.cost)}, expected ${x.expectedCost})`],
    [/Retrying in/.test(x.words || ""), "the retry after the overloaded API is in view"],
    [(() => { const seen = x.paxSeen || []; const a = seen.indexOf("…"), b = seen.indexOf("8 on 1 of 4 channels"), d = seen.indexOf("312"); return a >= 0 && b > a && d > b; })(), `the first tile waits with "…", says the first estimate counted part of the data, then shows the count (got ${JSON.stringify(x.paxSeen)})`]
  ]);
}

// ---- case: Stop while a model call is in flight -------------------------------------------------------
if (wanted("stop")) {
  const script = [
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Lead received. I read the source timetable of ICE 618 first." },
      { type: "tool_use", id: "toolu_a1", name: "ops_get_timetable", input: { train: "ICE 618" } }
    ] },
    { usage: usage(), stop: "end_turn", delayMs: 2500, blocks: [{ type: "text", text: "This late answer must never appear." }] }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const { page } = t;
  const c = {};
  try {
    await startLive(page);
    await page.waitForFunction(() => document.querySelectorAll("#agent-words .did").length > 0, null, { timeout: 15000 });
    await page.waitForSelector("#move-actions #stop", { timeout: 5000 });
    await page.waitForTimeout(300);
    const at = fake.requests.length;
    await page.click("#move-actions #stop");
    await page.waitForFunction(() => /stopped/.test(document.getElementById("move-text").textContent), null, { timeout: 5000 });
    c.bar = await bar(page);
    await page.waitForTimeout(3500);
    c.requestsAfter = fake.requests.length - at;
    c.late = await page.evaluate(() => /must never appear/.test(document.body.innerText));
    c.barLater = await bar(page);
    await page.click("#move-actions #back");
    await page.waitForFunction(() => document.getElementById("mode-text").textContent === "SIMULATION", null, { timeout: 15000 });
    c.back = (await page.textContent("#mode-text")).trim();
  } catch (e) { c.FAILED = String(e.message).split("\n")[0]; await page.screenshot({ path: path.join(OUT, "L-stop-fail.png") }).catch(() => {}); }
  await finish("stop: Stop the live run during a model call", t, fake, c, (x) => [
    [x.bar?.tone === "done" && /You stopped the live run/.test(x.bar?.text || ""), `the bar says the live run stopped, and why (got ${JSON.stringify(x.bar)})`],
    [x.late === false && x.requestsAfter <= 1 && JSON.stringify(x.barLater) === JSON.stringify(x.bar), `nothing of the late answer appears, and no new call goes out (got ${x.requestsAfter} after the stop)`],
    [x.back === "SIMULATION", "Back to the simulation returns to the replay"]
  ]);
}

// ---- case: keys Anthropic rejects ----------------------------------------------------------------------
if (wanted("badkey")) {
  {
    const t = await newPage(null, { models: "reject" });
    const { page } = t;
    const c = {};
    try {
      await startLive(page);
      await page.waitForSelector("#key-error:not([hidden])", { timeout: 8000 });
      c.error = (await page.textContent("#key-error")).trim();
      c.open = await page.$eval("#start-dialog", (d) => d.open);
      c.mode = (await page.textContent("#mode-text")).trim();
      c.calls = t.log.anthropic.filter((x) => /messages/.test(x)).length;
      await page.fill("#key-input", "not-a-key");
      await page.click("#start-live");
      await page.waitForTimeout(200);
      c.shape = (await page.textContent("#key-error")).trim();
    } catch (e) { c.FAILED = String(e.message).split("\n")[0]; }
    await finish("badkey: the check rejects the key", t, null, c, (x) => [
      [/Anthropic rejected this key \(401\)/.test(x.error || "") && x.open && x.mode === "SIMULATION" && x.calls === 0, `the dialog says why and stays open; no run starts (got "${x.error}")`],
      [/doesn't look like an Anthropic API key/.test(x.shape || ""), `a key of the wrong shape is refused before any request (got "${x.shape}")`]
    ]);
  }
  {
    const script = [{ error: { status: 401, type: "authentication_error", message: "invalid x-api-key" } }];
    const fake = createFakeClaude(script);
    const t = await newPage(fake);
    const { page } = t;
    const c = {};
    try {
      await startLive(page);
      await page.waitForFunction(() => /stopped/.test(document.getElementById("move-text").textContent), null, { timeout: 20000 });
      c.bar = await bar(page);
      c.words = await words(page);
      c.keyGone = await page.evaluate(() => !Object.keys(sessionStorage).some((k) => (sessionStorage.getItem(k) || "").startsWith("sk-ant-")));
    } catch (e) { c.FAILED = String(e.message).split("\n")[0]; }
    await finish("badkey: Anthropic rejects the key in the run", t, fake, c, (x) => [
      [x.bar?.tone === "done" && /stopped/.test(x.bar?.text || "") && /401/.test(x.words || "") && /removed from this tab/.test(x.words || ""), `the run stops and says why (got ${JSON.stringify(x.bar)} / "${(x.words || "").slice(0, 160)}")`],
      [x.keyGone, "the key left the tab"]
    ]);
  }
}

await writeFile(path.join(OUT, "live-results.json"), JSON.stringify(results.map(({ expect, ...r }) => r), null, 2));
await browser.close();
await close();
let passed = 0;
for (const r of results) {
  const problems = [
    ...(r.checks.FAILED ? [`exception: ${r.checks.FAILED}`] : []),
    ...r.expect(r.checks).filter(([ok]) => !ok).map(([, msg]) => msg),
    ...r.violations.map((v) => `protocol: ${v}`),
    ...(r.remainingScript ? [`${r.remainingScript} scripted responses were never requested`] : []),
    ...r.pageErrors.map((e) => `page error: ${e}`),
    ...r.consoleErrors.map((e) => `console error: ${e}`),
    ...r.csp.map((e) => `CSP: ${e}`),
    ...r.external.map((e) => `external request: ${e}`)
  ];
  if (!problems.length) passed += 1;
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${r.name}`);
  for (const [ok, msg] of r.expect(r.checks)) if (ok) console.log(`      ok: ${msg.split(" (got")[0]}`);
  for (const p of problems) console.log(`      - ${String(p).slice(0, 300)}`);
}
const allOk = results.length > 0 && passed === results.length;
console.log(`\n${passed}/${results.length} live cases passed. Screenshots: ${OUT}`);
if (allOk && ONLY.length === 0) console.log("LIVE OK");
process.exit(allOk ? 0 : 1);
