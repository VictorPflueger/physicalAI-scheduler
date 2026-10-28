// The live agent against a scripted stand-in for the Anthropic Messages API (lib/fake-claude.mjs).
// The fake streams realistic SSE and checks every request against the protocol rules in
// TECH_NOTES §3: assistant turns echoed unchanged with signatures, every tool_use answered, headers,
// the fifteen tools and no server tools. The world-model tools run for real in the browser, so the
// expectations below read their actual results.
//   full      ICE 618 end to end: parallel lookups, pause_turn, a 529 retry, the physical layer, a
//             verified alert from the source, the published view and a corroborating reading, a
//             mirror mark, first estimate then the verified figure (the mirror and the tiles follow),
//             rejection then approval, a max_tokens retry, a draft refused by the fact audit and
//             corrected, report, audit, cost maths, Save run as simulation and replay of the recording
//   race      a second decision while the model still answers the first; the mock line on a passenger
//             message; the recording branches correctly
//   abort     Abort while a model call is in flight: nothing appears afterwards
//   badkey    the key is rejected mid-run (401) → removed from the tab
//   scan      Live sweep that finds the checked trains in sync → honest end; the monitor shows the sweep
//   guards    a response that breaks off does not count; a verified alert with one source, and one
//             without a corroborating reading, are refused; options on a partial scope and on a what-if
//             are refused; a decision on an older set of options is ignored; a draft the approved
//             option does not contain, a German-format time no tool returned and a contradicting
//             outcome are refused
// Usage: node tests/live.mjs [case…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { APP_ROOT, ONLY, outDir, wanted, launchBrowser, serveStatic, CORS, MOCK_KEY, NETWORK_NOISE, SKIP_INTRO, KEYS } from "./lib/harness.mjs";

const ROOT = APP_ROOT;
const OUT = await outDir("live");
/** The console's last line as read with its run facts opened (they sit in a closed disclosure). */
const lastLineWithFacts = () => {
  const e = [...document.querySelectorAll("#console .entry")].slice(-1)[0];
  if (!e) return "";
  const d = e.querySelector("details.run-facts");
  if (d) d.open = true;
  const text = e.innerText.replace(/\s+/g, " ").slice(0, 300);
  if (d) d.open = false;
  return text;
};

const { base: BASE, close } = await serveStatic(ROOT, 8767);
const browser = await launchBrowser();
const { REF, SCEN } = await loadData();
const results = [];
const run = wanted;
const KEY = MOCK_KEY;

async function loadData() {
  const load = async (file, name) => {
    const sandbox = { window: {} };
    new Function("window", await readFile(path.join(ROOT, file), "utf8"))(sandbox.window);
    return sandbox.window[name];
  };
  return { REF: await load("data/reference_cases.js", "REFERENCE_CASES"), SCEN: await load("data/scenarios.js", "SCENARIOS") };
}

const served = new Map(); // extra same-origin files for a test (e.g. a recorded simulation script)
async function newPage(fake, { models = "ok" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  await context.route(/^http:\/\/127\.0\.0\.1:8767\/test\//, (route) => {
    const p = new URL(route.request().url()).pathname;
    if (served.has(p)) return route.fulfill({ status: 200, headers: { "content-type": "text/javascript; charset=utf-8" }, body: served.get(p) });
    return route.fulfill({ status: 404, body: "" });
  });
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const log = { pageErrors: [], consoleErrors: [], external: [] };
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host === "api.anthropic.com") {
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
    // The live agent reads no open data: any other request is a failure of the test.
    log.external.push(`${req.method()} ${u.host}${u.pathname}`);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log.pageErrors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) log.consoleErrors.push(m.text()); });
  return { context, page, log };
}

async function startLive(page, { scan = false } = {}) {
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  if (scan) await page.click("#btn-scan");
  else {
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="live"] .mode-cta button');
  }
  await page.waitForSelector("#api-key-input");
  await page.fill("#api-key-input", KEY);
  await page.click('button:has-text("Check key and continue")');
}

async function finish(name, t, fake, checks) {
  const csp = await t.page.evaluate(() => window.__csp || []).catch(() => []);
  results.push({ name, checks, violations: fake?.violations || [], remainingScript: fake?.remaining?.() ?? null, pageErrors: t.log.pageErrors, consoleErrors: t.log.consoleErrors.filter((x) => !x.includes("[Timetable Translator] live run failed")), csp, external: t.log.external });
  await t.context.close();
}

const usage = (o = {}) => ({ input_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 420, ...o });
const lastResults = (req) => {
  const last = req.messages[req.messages.length - 1];
  return Array.isArray(last?.content) ? last.content.filter((b) => b.type === "tool_result").map((b) => ({ isError: b.is_error === true, raw: b.content, json: safeJson(b.content) })) : [];
};
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const consoleHas = (page, re) => page.evaluate((src) => [...document.querySelectorAll("#console .entry")].some((e) => new RegExp(src).test(e.textContent)), re.source);
// A row's state in the timetables. The mirror opens on the alignment view, so the read switches to the
// timetables and back.
const mirrorRow = async (page, side, point) => {
  const view = await page.$eval("#mirror", (m) => m.dataset.view);
  if (view !== "train") {
    await page.click('#mirror .mirror-tools button:has-text("Timetables")');
    await page.waitForSelector('#mirror .mrow[data-side="source"]', { timeout: 5000 });
  }
  const v = await page.evaluate(([s, p]) => document.querySelector(`#mirror .mrow[data-side="${s}"][data-point="${p}"]`)?.dataset.state || document.querySelector(`#mirror .mrow[data-side="${s}"][data-point="${p}"]`)?.dataset.flag || null, [side, point]);
  if (view === "align") await page.click('#mirror .mirror-tools button:has-text("Alignment")');
  return v;
};
// The alignment view's channel cards, by tone.
const alignTones = (page) => page.$$eval("#mirror .al-channel", (els) => els.map((c) => c.dataset.tone).join(","));

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
if (run("full")) {
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
  const checks = {};
  try {
    await startLive(page);
    await page.waitForSelector("#api-key-input", { state: "detached", timeout: 8000 });
    checks.badge = (await page.textContent("#mode-badge")).trim();
    await page.waitForSelector(".alert-card", { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "L1-live-alert.png") });
    // textContent: the sources and checks sit under a closed disclosure.
    checks.alert = await page.$eval(".alert-card", (e) => `${e.dataset.basis}|${e.textContent.replace(/\s+/g, " ").slice(0, 900)}`);
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 30000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "L2-live-options.png") });
    checks.optionTotals = await page.$$eval(".option-card", (els) => els.map((e) => e.querySelector(".option-total .value")?.textContent));
    checks.kpiBefore = await page.$eval("#kpi-pax-value", (e) => `${e.closest(".kpi").dataset.tone}|${e.textContent}`);
    checks.alignBefore = await alignTones(page);
    checks.mirrorBefore = `${await page.textContent("#mirror .mirror-caption strong")}|${await page.textContent("#mirror .cap-chip")}|${await mirrorRow(page, "customer", "KK")}|${await mirrorRow(page, "source", "KK")}`;
    // Reject option B first, then approve the recommended option A.
    await page.click('.option-card[aria-label^="Option B:"] [data-action="reject"]');
    await page.waitForFunction(() => document.querySelector('.option-card[aria-label^="Option B:"]')?.dataset.status === "rejected", null, { timeout: 5000 });
    await page.waitForFunction(() => [...document.querySelectorAll("#console .entry")].some((e) => /Option B rejected/.test(e.textContent)), null, { timeout: 15000 });
    await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
    await page.waitForTimeout(400);
    checks.payoffPax = await page.$eval("#kpi-pax-value", (e) => `${e.closest(".kpi").dataset.tone}|${e.textContent}|${e.nextElementSibling.textContent}`);
    checks.payoffFirst = await page.$eval("#kpi-first-value", (e) => `${e.closest(".kpi").dataset.tone}|${e.textContent}|${e.nextElementSibling.textContent}`);
    checks.alignAfter = await alignTones(page);
    checks.mirrorAfter = await mirrorRow(page, "customer", "KK");
    await page.waitForSelector('button:has-text("Approve all")', { state: "visible", timeout: 30000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "L3-live-outbox.png") });
    checks.factRefusal = await page.evaluate(() => [...document.querySelectorAll('#console .entry[data-guard="ui_draft_action"]')].map((e) => e.innerText.replace(/\s+/g, " ")).join(" | ").slice(0, 240));
    checks.drafts = await page.$$eval(".action-card", (els) => els.map((e) => e.querySelector(".action-meta span")?.textContent));
    checks.draftFooter = await page.$$eval(".action-body", (els) => els.length > 0 && els.every((e) => e.textContent.includes("Requires human approval before publishing") && /Source reference: ICE 618: source v2 \(OPS-05\)/.test(e.textContent)));
    checks.draftTypedTime = await page.$$eval(".action-body", (els) => els.some((e) => e.textContent.includes("07:44")));
    // Approve the first draft, reject the last.
    const approveButtons = await page.$$(".action-card .action-buttons [data-action='approve']");
    await approveButtons[0].click();
    await page.waitForTimeout(200);
    const rejectButtons = await page.$$(".action-card .action-buttons [data-action='reject']");
    await rejectButtons[rejectButtons.length - 1].click();
    await page.waitForSelector('button:has-text("Open management summary")', { timeout: 30000 });
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "L4-live-done.png") });
    checks.status = (await page.textContent(".status-pill .text")).trim();
    checks.costKpi = (await page.textContent("#kpi-cost-value")).trim();
    checks.costSub = (await page.textContent("#kpi-cost-sub")).trim();
    checks.retryNotice = await consoleHas(page, /Retrying in/);
    checks.reasoning = await page.$$eval(".reasoning-text", (els) => els.map((e) => e.textContent).join(" | ").slice(0, 120));
    checks.consoleWatermarkHidden = !(await page.isVisible(".sim-watermark"));
    checks.runFacts = await page.evaluate(lastLineWithFacts);
    checks.reportFooter = await page.$eval(".report-card", (e) => /Live agent run/.test(e.textContent));
    await page.click("#tab-audit");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Export JSON")')]);
    const file = path.join(OUT, download.suggestedFilename());
    await download.saveAs(file);
    const audit = JSON.parse(await readFile(file, "utf8"));
    checks.auditFile = download.suggestedFilename();
    checks.auditMode = audit.mode;
    checks.auditExchanges = audit.api_exchanges.length;
    checks.auditFirstHasSystem = typeof audit.api_exchanges[0]?.request?.system === "string";
    checks.auditNoKey = !JSON.stringify(audit).includes("MOCKKEY");
    checks.auditNoSignature = !JSON.stringify(audit).includes("SIG-THINK-1");
    checks.auditCostEur = audit.cost?.eur;
    // Expected cost from the script's usage (Sonnet prices, FX 0.894; no web search).
    let usd = 0;
    for (const s of script) {
      if (!s.usage) continue;
      const u = s.usage;
      usd += u.input_tokens * 2 / 1e6 + u.cache_creation_input_tokens * 2.5 / 1e6 + u.cache_read_input_tokens * 0.1 / 1e6 + u.output_tokens * 10 / 1e6;
    }
    checks.expectedCostEur = Math.round(usd * 0.894 * 10000) / 10000;
    checks.costMatches = Math.abs((audit.cost?.eur || 0) - usd * 0.894) < 1e-9;
    checks.modelCallRows = await page.$$eval('.audit-table tr[data-type="model_call"]', (els) => els.length);

    // ---- Save run as simulation, then replay it -------------------------------------------------
    const [simDl] = await Promise.all([page.waitForEvent("download"), page.click('#console button:has-text("Save run as simulation")')]);
    checks.simFile = simDl.suggestedFilename();
    const simText = await readFile(await simDl.path(), "utf8");
    await writeFile(path.join(OUT, simDl.suggestedFilename()), simText);
    checks.simNoKey = !simText.includes("MOCKKEY") && !simText.includes("SIG-THINK");
    checks.simHasRecordedSource = simText.includes('"source": "recorded"');
    checks.simReportRewritten = !simText.includes("*Live agent run.") && simText.includes("Recorded live run, replayed in Simulation mode");
    checks.simNoRefusedDraft = !simText.includes("07:44");
    checks.simLookups = (simText.match(/"tool": "(ops|kfp|phys)_[a-z_]+"/g) || []).length;
    served.set("/test/recorded.js", simText);
    await page.addScriptTag({ url: "/test/recorded.js" });
    checks.simLoaded = await page.evaluate(() => window.SIM_RUNS?.["SC-PLATFORM"]?.source);
    await page.click("#btn-reset");
    await page.click('button[aria-label="Replay speed ×4"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 60000 });
    checks.replayWatermark = (await page.textContent(".sim-watermark")).replace(/\s+/g, " ").trim();
    checks.replayBadge = (await page.textContent("#mode-badge")).trim();
    checks.replayOptions = await page.$$eval(".option-card", (els) => els.map((e) => `${e.querySelector(".option-letter")?.textContent}:${e.querySelector(".option-title")?.textContent}:${e.querySelector(".option-total .value")?.textContent}`));
    checks.replayLookups = await page.$$eval("#console .result-summary", (els) => els.map((e) => e.textContent).filter((x) => /PHY-01|OPS-05|source v2/.test(x)).length);
    checks.replayMirror = await mirrorRow(page, "customer", "KK");
    await page.screenshot({ path: path.join(OUT, "L7-replay-options.png") });
    await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
    await page.waitForSelector('button:has-text("Approve all")', { state: "visible", timeout: 60000 });
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 60000 });
    await page.click('button:has-text("Approve all")');
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "L8-replay-done.png") });
    // The full summary sits under "Read it here" in the console; read it there.
    checks.replayReport = await page.$eval(".report-card .report-full", (e) => { e.open = true; const t = e.innerText.split("\n").filter(Boolean).slice(-2).join(" | "); e.open = false; return t; });
    checks.replayCost = (await page.textContent("#kpi-cost-sub")).trim();
    await page.click("#tab-audit").catch(() => {});
    const [rdl] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Export JSON")')]);
    const raudit = JSON.parse(await readFile(await rdl.path(), "utf8"));
    checks.replayAudit = `${raudit.mode}|${raudit.run?.sim_source}|${raudit.mode_statement.slice(0, 50)}`;
    // a different decision than the recorded one ends gracefully
    await page.click("#btn-reset");
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 60000 });
    await page.click('.option-card[aria-label^="Option C:"] [data-action="approve"]');
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 60000 });
    checks.replayOtherPath = await page.evaluate(() => [...document.querySelectorAll("#console .entry")].map((e) => e.innerText).find((x) => /only the path recorded/.test(x))?.replace(/\s+/g, " ").slice(0, 120) || null);
  } catch (e) {
    checks.FAILED = String(e.message).split("\n")[0];
    await page.screenshot({ path: path.join(OUT, "L-fail.png") });
    checks.consoleTail = await page.$$eval("#console .entry", (els) => els.slice(-6).map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 240)));
  }
  await finish("live: full ICE 618 run (mock API)", t, fake, checks);
}

// ---- case: guardrails a live model can run into ------------------------------------------------------
if (run("guards")) {
  const script = [
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Check: I read the operations log and the published view of ICE 618." },
      { type: "tool_use", id: "toolu_q1", name: "ops_list_changes", input: { train: "ICE 618" } },
      { type: "tool_use", id: "toolu_q2", name: "kfp_get_published", input: { train: "ICE 618" } }
    ] },
    { usage: usage(), midError: { type: "overloaded_error" }, blocks: [
      { type: "text", text: "Check: I read the physical layer at Köln Hbf before I raise the alert." },
      { type: "tool_use", id: "toolu_q2x", name: "phys_observe", input: { point: "KK" } }
    ] },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Finding: the operations log moves ICE 618 to Gleis 7, and every channel still shows platform 5." },
      { type: "tool_use", id: "toolu_q3", name: "ui_report_alert", input: { title: "ICE 618 leaves from platform 7", severity: "high", basis: "verified", summary: "Every channel still shows platform 5.", sources: [{ title: "Operations log" }, { title: "operations log " }], train_ids: ["ICE 618"] } },
      { type: "tool_use", id: "toolu_q4", name: "ui_report_alert", input: { title: "ICE 618 leaves from platform 7", severity: "high", basis: "verified", summary: "Every channel still shows platform 5.", sources: SOURCES, train_ids: ["ICE 618"] } }
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r.length === 2 && r.every((x) => !x.isError), "the retried request carries the two lookups");
      check(!JSON.stringify(req.messages).includes("toolu_q2x"), "the broken-off response is not part of the conversation");
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Not confirmed: the physical layer has not been read, so I raise it as a what-if and cost it on the journey planner." },
      { type: "tool_use", id: "toolu_q5", name: "ui_report_alert", input: { title: "ICE 618 may leave from platform 7 (what-if)", severity: "medium", basis: "what_if", summary: "If the operations log is right, every channel shows the wrong platform.", train_ids: ["ICE 618"] } },
      { type: "tool_use", id: "toolu_q6", name: "sim_sync", input: { ...PLATFORM.finding, channels: ["planner"] } },
      { type: "tool_use", id: "toolu_q7", name: "ui_propose_options", input: { recommended_variant_id: "V1", baseline_description: "Every channel keeps showing platform 5, not platform 7.", options: OPTIONS_618 } }
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r[0]?.isError && /two distinct sources/.test(r[0]?.json?.error || ""), `a verified alert with one source is refused (got ${String(r[0]?.raw).slice(0, 200)})`);
      check(r[1]?.isError && /missing: physical layer$|missing: physical layer\./.test(r[1]?.json?.error || ""), `a verified alert without the physical layer is refused (got ${String(r[1]?.raw).slice(0, 200)})`);
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_q8", name: "sim_sync", input: { ...PLATFORM.finding, what_if: { changes: [{ train: "ICE 618", op: "set_track", point: "KK", track: "9" }] } } },
      { type: "tool_use", id: "toolu_q9", name: "ui_propose_options", input: { recommended_variant_id: "V1", baseline_description: "Every channel keeps showing platform 5, not platform 7.", options: OPTIONS_618 } }
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(!r[0]?.isError && r[0]?.json?.ok === true, "the what-if alert is accepted");
      check(r[1]?.json?.basis === "partial", "the planner-only result is partial");
      check(r[2]?.isError && /latest sim_sync result is partial/.test(r[2]?.json?.error || ""), `options on a partial scope are refused (got ${String(r[2]?.raw).slice(0, 160)})`);
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_q10", name: "phys_observe", input: { point: "KK" } },
      { type: "tool_use", id: "toolu_q10b", name: "ui_report_alert", input: { title: "ICE 618 leaves from platform 7; every channel says platform 5", severity: "high", basis: "verified", summary: "The source moved ICE 618 (07:42 to Hamburg-Altona) to Gleis 7 at 07:21.", sources: SOURCES, train_ids: ["ICE 618"] } },
      { type: "tool_use", id: "toolu_q11", name: "sim_sync", input: PLATFORM.finding },
      { type: "tool_use", id: "toolu_q12", name: "ui_propose_options", input: { recommended_variant_id: "V1", baseline_description: "Every channel keeps showing platform 5, not platform 7.", options: OPTIONS_618 } }
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r[0]?.json?.basis === "what_if", "the what-if result is labelled");
      check(r[1]?.isError && /is a what-if/.test(r[1]?.json?.error || ""), `options on a what-if are refused (got ${String(r[1]?.raw).slice(0, 160)})`);
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Option C rejected. I recalculate before you decide." },
      { type: "tool_use", id: "toolu_q13", name: "sim_sync", input: PLATFORM.finding },
      { type: "tool_use", id: "toolu_q14", name: "ui_propose_options", input: { recommended_variant_id: "V2", baseline_description: "Every channel keeps showing platform 5, not platform 7.", options: OPTIONS_618 } }
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r[1]?.json?.ok === true, `the verified alert with the physical layer is accepted (got ${String(r[1]?.raw).slice(0, 160)})`);
      check(r[3]?.json?.decision === "rejected" && r[3]?.json?.option_id === "V3", "first decision: option C rejected");
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_q15", name: "ui_draft_action", input: { type: "override_request", recipient: "Station management Köln Hbf", subject: "Override: ICE 618 platform 7", body: "Set Gleis 7 by hand on the displays." } }
    ], expect: (req, { check }) => {
      const d = lastResults(req)[1]?.json;
      check(d?.decision === "approved" && d?.option_id === "V1", `the click on the new set counts, the stale one does not (got ${JSON.stringify(d).slice(0, 160)})`);
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_q16", name: "ui_draft_action", input: { type: "passenger_message", recipient: "Passenger information desk", subject: "ICE 618 heute Gleis 7", body: "Ansage (DE): ICE 618 nach Hamburg-Altona, Abfahrt 7.44 Uhr, heute von Gleis 7." } }
    ], expect: (req, { check }) => { const r = lastResults(req)[0]; check(r?.isError && /Option A contains no manual override/.test(r?.json?.error || ""), `a draft the option does not contain is refused (got ${String(r?.raw).slice(0, 160)})`); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_q17", name: "ui_draft_action", input: { type: "passenger_message", recipient: "Passenger information desk", subject: "ICE 618 today from platform 7", body: MESSAGE_618 } },
      { type: "tool_use", id: "toolu_q18", name: "ui_await_approvals", input: {} }
    ], expect: (req, { check }) => { const r = lastResults(req)[0]; check(r?.isError && /7\.44 Uhr/.test(r?.json?.error || ""), `a German-format time no tool returned is refused (got ${String(r?.raw).slice(0, 160)})`); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_q19", name: "ui_final_report", input: { outcome: "risk_accepted", markdown: "## ICE 618: passenger-information decision\n\n**Decision.** Option A approved: re-publish ICE 618 from the source.\n\n*Live agent run.*" } }
    ], expect: (req, { check }) => { const r = lastResults(req); check(r[1]?.json?.all_decided === true, "approvals returned"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_q20", name: "ui_final_report", input: { outcome: "response_decided", markdown: "## ICE 618: passenger-information decision\n\n**Decision.** Option A approved: re-publish ICE 618 from the source.\n\n*Live agent run.*" } }
    ], expect: (req, { check }) => { const r = lastResults(req)[0]; check(r?.isError && /response_decided/.test(r?.json?.error || ""), `a contradicting outcome is refused (got ${String(r?.raw).slice(0, 160)})`); } },
    { usage: usage({ output_tokens: 20 }), stop: "end_turn", blocks: [{ type: "text", text: "Done." }],
      expect: (req, { check }) => { const r = lastResults(req)[0]?.json; check(r?.published === true && r?.outcome === "response_decided", "report published with the decision's outcome"); } }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const { page } = t;
  const checks = {};
  try {
    await startLive(page);
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 30000 });
    checks.discarded = await page.$$eval('#console .entry[data-discarded="true"]', (els) => els.length);
    checks.alert = await page.$eval(".alert-card", (e) => e.dataset.basis);
    await page.click('.option-card[aria-label^="Option C:"] [data-action="reject"]');
    // The agent recalculates and proposes again (B recommended now); a click on the old set must not count.
    await page.waitForSelector('.option-card[data-recommended="true"][aria-label^="Option B:"]', { timeout: 20000 });
    await page.evaluate(async () => (await import("./js/events.js")).bus.emit("option_decision", { option_id: "V2", option_label: "Option B (old set)", decision: "approved", options_seq: 1, by: "user" }));
    await page.waitForTimeout(300);
    checks.staleIgnoredOnCards = await page.$$eval(".option-card", (els) => els.every((e) => !e.dataset.status));
    await page.click('.option-card[aria-label^="Option A:"] [data-action="approve"]');
    await page.waitForSelector('.action-card[data-status="pending"] [data-action="approve"]', { state: "visible", timeout: 30000 });
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 30000 });
    checks.drafts = await page.$$eval(".action-card", (els) => els.map((e) => e.querySelector(".action-meta span")?.textContent));
    await page.click('.action-card[data-status="pending"] [data-action="approve"]');
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 30000 });
    checks.runFacts = await page.evaluate(lastLineWithFacts);
    checks.guardLines = await page.$$eval("#console .entry[data-guard]", (els) => els.map((e) => e.dataset.guard));
    await page.screenshot({ path: path.join(OUT, "L9-guards.png") });
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; await page.screenshot({ path: path.join(OUT, "L-guards-fail.png") }).catch(() => {}); }
  await finish("live: guardrails (broken-off response, alerts, options, stale decision, drafts, outcome)", t, fake, checks);
}

// ---- case: quick second decision while the model answers the first; then Save run as simulation -------
if (run("race")) {
  const script = [
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Check: the operations log, what the channels publish and the physical layer at Köln Hbf." },
      { type: "tool_use", id: "toolu_r0a", name: "ops_list_changes", input: { train: "ICE 618" } },
      { type: "tool_use", id: "toolu_r0b", name: "kfp_get_published", input: { train: "ICE 618" } },
      { type: "tool_use", id: "toolu_r0c", name: "phys_observe", input: { point: "KK" } }
    ] },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Finding: ICE 618 leaves from Gleis 7 according to the source; I quantify every channel." },
      { type: "tool_use", id: "toolu_r0d", name: "ui_report_alert", input: { title: "ICE 618 leaves from platform 7; every channel says platform 5", severity: "high", basis: "verified", summary: "The source moved ICE 618 to Gleis 7 at 07:21 (OPS-05).", sources: SOURCES, train_ids: ["ICE 618"] } },
      { type: "tool_use", id: "toolu_r1", name: "sim_sync", input: PLATFORM.finding }
    ] },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Recommendation: option B." },
      { type: "tool_use", id: "toolu_r2", name: "ui_propose_options", input: { recommended_variant_id: "V2", baseline_description: "Every channel keeps showing platform 5, not platform 7.", options: OPTIONS_618 } }
    ] },
    { usage: usage(), stop: "tool_use", delayMs: 1500, blocks: [
      { type: "text", text: "Option A rejected. Options B and C remain open." },
      { type: "tool_use", id: "toolu_r3", name: "ui_await_decision", input: {} }
    ], expect: (req, { check }) => { const r = lastResults(req)[0]?.json; check(r?.decision === "rejected" && r?.option_id === "V1", "first decision is the rejection"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Option B approved. Drafting the passenger message and the staff briefing." },
      { type: "tool_use", id: "toolu_r4", name: "ui_draft_action", input: { type: "passenger_message", recipient: "Passenger information desk", subject: "ICE 618 today from platform 7", body: MESSAGE_618 } },
      { type: "tool_use", id: "toolu_r5", name: "ui_draft_action", input: { type: "staff_brief", recipient: "Station staff Köln Hbf", subject: "ICE 618 from platform 7", body: "Please guide passengers waiting on platform 5 for ICE 618 to Hamburg-Altona (07:42) to platform 7." } },
      { type: "tool_use", id: "toolu_r6", name: "ui_await_approvals", input: {} }
    ], expect: (req, { check }) => { const r = lastResults(req)[0]?.json; check(r?.decision === "approved" && r?.option_id === "V2", "queued approval consumed by ui_await_decision"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "tool_use", id: "toolu_r7", name: "ui_final_report", input: { markdown: "## ICE 618: passenger-information decision\n\n**Decision.** Option B approved: messages on the app, the displays and the announcements, and staff at platform 5 sending passengers to platform 7.\n\n_Live agent run. Figures from the engine._" } }
    ] },
    { usage: usage({ output_tokens: 20 }), stop: "end_turn", blocks: [{ type: "text", text: "Done." }] }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const { page } = t;
  const checks = {};
  try {
    await startLive(page);
    await page.waitForSelector('.option-card[data-recommended="true"] [data-action="approve"]', { state: "visible", timeout: 20000 });
    await page.click('.option-card[aria-label^="Option A:"] [data-action="reject"]');
    await page.waitForTimeout(150);
    await page.click('.option-card[data-recommended="true"] [data-action="approve"]');
    await page.waitForFunction(() => /Waiting for your approval of \d+ draft/.test(document.querySelector("#console").innerText), null, { timeout: 20000 });
    checks.messageHasMockLine = await page.$$eval(".action-card .action-body", (els) => els.map((e) => e.textContent).some((x) => /Mock publication for demonstration; no passenger information system is connected\./.test(x)));
    checks.mirrorAfter = await mirrorRow(page, "customer", "KK");
    await page.click('button:has-text("Approve all")');
    await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 20000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('#console button:has-text("Save run as simulation")')]);
    const text = await readFile(await dl.path(), "utf8");
    const def = JSON.parse(text.slice(text.indexOf("= {") + 2, text.lastIndexOf("};") + 1));
    const aw = def.steps.find((s) => s.awaitOption).awaitOption;
    checks.rejectedLine = aw.rejected.V1 || null;
    checks.branchStart = (aw.approved.V2 || []).slice(0, 3).map((s) => Object.keys(s)[0] + ":" + JSON.stringify(Object.values(s)[0]).slice(0, 50));
    checks.branchDrafts = (aw.approved.V2 || []).filter((s) => s.draft).map((s) => s.draft.type);
    checks.reportFooter = (aw.approved.V2 || []).find((s) => s.report)?.report.split("\n").slice(-1)[0];
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; await page.screenshot({ path: path.join(OUT, "L-race-fail.png") }); }
  await finish("live: quick second decision + recording", t, fake, checks);
}

// ---- case: Abort while a model call is in flight: nothing from the old run appears afterwards ------------
if (run("abort")) {
  const script = [
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Check: I read the source timetable of ICE 618." },
      { type: "tool_use", id: "toolu_a1", name: "ops_get_timetable", input: { train: "ICE 618" } }
    ] },
    { usage: usage(), stop: "end_turn", delayMs: 2500, blocks: [{ type: "text", text: "This late answer must never appear." }] }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const { page } = t;
  const checks = {};
  try {
    await startLive(page);
    await page.waitForFunction(() => document.querySelectorAll(".result-summary").length > 0, null, { timeout: 15000 });
    checks.summary = await page.$eval(".result-summary", (e) => e.textContent.slice(0, 160));
    await page.click("#btn-abort");
    await page.waitForFunction(() => /Aborted/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 5000 });
    const before = await page.$$eval("#console .entry", (els) => els.length);
    const requestsAtAbort = fake.requests.length;
    await page.waitForTimeout(3500);
    const after = await page.$$eval("#console .entry", (els) => els.length);
    checks.requestsAfterAbort = fake.requests.length - requestsAtAbort;
    checks.entriesStable = before === after;
    checks.lateTextShown = await page.evaluate(() => /must never appear/.test(document.querySelector("#console").innerText));
    checks.status = (await page.textContent(".status-pill .text")).trim();
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; }
  // The second scripted answer is requested but arrives after Abort: it is never shown.
  await finish("live: abort during a model call", t, fake, checks);
}

// ---- case: key rejected mid-run (401) ------------------------------------------------------------------
if (run("badkey")) {
  const script = [{ error: { status: 401, type: "authentication_error", message: "invalid x-api-key" } }];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const checks = {};
  try {
    await startLive(t.page);
    await t.page.waitForFunction(() => /Error/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 20000 });
    checks.keyForgotten = await t.page.evaluate((k) => !sessionStorage.getItem(k), KEYS.apiKey);
    checks.message = await t.page.evaluate(() => [...document.querySelectorAll("#console .entry")].map((e) => e.innerText).find((x) => /401/.test(x))?.replace(/\s+/g, " ").slice(0, 160) || null);
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; }
  await finish("live: key rejected (401)", t, fake, checks);
}

// ---- case: Live sweep: the checked trains are in sync --------------------------------------------------
if (run("scan")) {
  const script = [
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Live sweep: I read the overview and compare the first three trains of the window with the source." },
      { type: "tool_use", id: "toolu_s1", name: "ops_get_overview", input: {} },
      { type: "tool_use", id: "toolu_s2", name: "sim_sync", input: { label: "Sweep: the first departures of the window", train_ids: ["RE 10106", "ICE 614", "RE 10107"] } }
    ], expect: (req, { check }) => { const c = req.messages[0].content; check(typeof c === "string" && c.startsWith("Live sweep") && c.includes("Trains in the window:") && c.includes("ICE 618 (T-618)"), "sweep opener lists the trains in the window"); } },
    { usage: usage(), stop: "tool_use", blocks: [
      { type: "text", text: "Confirmed: customer information matches the source for the three trains I checked." },
      { type: "tool_use", id: "toolu_s3", name: "ui_final_report", input: { outcome: "no_material_finding", markdown: "## Live sweep: no material finding\n\nRE 10106, ICE 614 and RE 10107 match the source in every channel; no passenger acts on wrong information.\n\n*Live agent run.*" } }
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r.length === 2 && r.every((x) => !x.isError), `two successful calls (got ${r.map((x) => String(x.raw).slice(0, 80)).join(" / ")})`);
      check(r[0]?.json?.trains_in_window?.length >= 34, `overview lists the trains in the window (got ${r[0]?.json?.trains_in_window?.length})`);
      check(r[1]?.json?.basis === "source" && r[1]?.json?.contradictions?.length === 0 && r[1]?.json?.baseline?.misinformed_pax === 0, `in sync (got ${String(r[1]?.raw).slice(0, 200)})`);
    } },
    { usage: usage({ output_tokens: 30 }), stop: "end_turn", blocks: [{ type: "text", text: "Sweep complete." }] }
  ];
  const fake = createFakeClaude(script);
  const t = await newPage(fake);
  const checks = {};
  try {
    await startLive(t.page, { scan: true });
    await t.page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 20000 });
    checks.endLine = await t.page.evaluate(lastLineWithFacts);
    checks.monitor = await t.page.evaluate(() => ({
      view: document.getElementById("mirror").dataset.view,
      caption: document.querySelector("#mirror .cap-sub")?.textContent || "",
      inSync: [...document.querySelectorAll("#mirror .mon-row")].filter((r) => /In sync with the source/.test(r.textContent)).map((r) => r.querySelector(".mon-train strong").textContent)
    }));
    await t.page.screenshot({ path: path.join(OUT, "L6-sweep-nothing.png") });
  } catch (e) { checks.FAILED = String(e.message).split("\n")[0]; }
  await finish("live: sweep with no findings", t, fake, checks);
}

await browser.close();
await close();

// What each case must show, beyond zero protocol violations and zero page, console, CSP or external requests.
const EXPECT = {
  "live: full ICE 618 run (mock API)": (c) => [
    [c.badge === "LIVE", "LIVE badge"],
    [/^verified\|/.test(c.alert || "") && /ICE 618 leaves from platform 7/.test(c.alert || "") && /physical layer: PHY-01/.test(c.alert || ""), `verified alert card with its evidence (got ${c.alert})`],
    [c.optionTotals?.length === 4, "three options plus do nothing"],
    [c.kpiBefore === "affected|312", `passengers-at-risk tile shows the verified figure (got ${c.kpiBefore})`],
    [c.alignBefore === "affected,affected,affected,affected", `the alignment view shows every channel contradicting the source (got ${c.alignBefore})`],
    [c.mirrorBefore === "ICE 618 · Köln Hbf → Hamburg-Altona|Verified against the source|affected|affected", `the timetables show the verified finding on ICE 618 (got ${c.mirrorBefore})`],
    [/^at-risk\|7\|left with option A \(was 312\)$/.test(c.payoffPax || ""), `the first tile shows the payoff of the approved option (got ${c.payoffPax})`],
    [/^resolved\|14 min\|info in 2 min, aligned in 8 min$/.test(c.payoffFirst || ""), `the second tile shows the payoff (got ${c.payoffFirst})`],
    [c.alignAfter === "resolved,resolved,resolved,resolved", `the approved re-publication turns the channels green (got ${c.alignAfter})`],
    [c.mirrorAfter === "resolved", `the approved re-publication turns the row green (got ${c.mirrorAfter})`],
    [/Guardrail: The draft was refused\. These timetable facts match nothing this text may quote: 07:44/.test(c.factRefusal || "") && c.draftTypedTime === false, `the typed time was refused in view and never reached the Outbox (got ${c.factRefusal})`],
    [/1 guardrail refusal/.test(c.runFacts || ""), `run facts count the refusal (got ${c.runFacts})`],
    [JSON.stringify(c.drafts) === JSON.stringify(["Re-publication order (mock)", "Passenger message"]) && c.draftFooter, `two drafts, each with the approval footer and the source reference (got ${JSON.stringify(c.drafts)})`],
    [c.status === "Done" && c.retryNotice, "run ends Done after a visible retry"],
    [/Run facts/.test(c.runFacts || "") && c.reportFooter, "run facts on the last console line; the summary says it is a live run"],
    [c.auditMode === "live" && c.auditNoKey && c.auditNoSignature && c.auditFirstHasSystem, "audit export: live, no key, no signatures, system prompt logged"],
    [c.costMatches, `cost meter equals the usage maths (got ${c.auditCostEur}, expected ${c.expectedCostEur})`],
    [c.simNoKey && c.simHasRecordedSource && c.simReportRewritten && c.simNoRefusedDraft && c.simLookups === 4, `recording is valid, re-runs the four lookups, carries no secrets and no refused draft (lookups ${c.simLookups})`],
    [c.replayBadge === "SIMULATION" && /recorded on/.test(c.replayWatermark || ""), "replay labelled as a recorded run"],
    [c.replayLookups >= 3 && c.replayMirror === "affected", `the replay re-runs the lookups and shows the finding on the mirror (got ${c.replayLookups}, ${c.replayMirror})`],
    [/Recorded live run/.test(c.replayReport || "") && /simulation\|recorded/.test(c.replayAudit || ""), "replay report and audit marked"],
    [!!c.replayOtherPath, "a decision the live run did not take ends the replay gracefully"]
  ],
  "live: quick second decision + recording": (c) => [
    [c.messageHasMockLine, "the passenger message carries the mock line"],
    [c.mirrorAfter === "at_risk", `option B only informs: the row turns amber (got ${c.mirrorAfter})`],
    [c.rejectedLine === "Option A rejected. Options B and C remain open.", "rejection line recorded"],
    [JSON.stringify(c.branchDrafts) === '["passenger_message","staff_brief"]', `the approval branch carries the drafts (got ${JSON.stringify(c.branchDrafts)})`],
    [/Recorded live run/.test(c.reportFooter || ""), "report footer rewritten for replay"]
  ],
  "live: abort during a model call": (c) => [
    [/^ICE 618 source v2 \(current\): 11 operating points/.test(c.summary || ""), `source timetable summarised (got ${c.summary})`],
    [c.entriesStable && c.lateTextShown === false && c.status === "Aborted", "nothing appears after Abort"],
    [c.requestsAfterAbort === 0, `no model call after Abort (got ${c.requestsAfterAbort})`]
  ],
  "live: key rejected (401)": (c) => [[c.keyForgotten && /401/.test(c.message || ""), "key removed and 401 explained"]],
  "live: sweep with no findings": (c) => [
    [/no material finding/i.test(c.endLine || "") && /Run facts/.test(c.endLine || "") && /tool calls/.test(c.endLine || ""), `honest end with run facts (got ${c.endLine})`],
    [c.monitor?.view === "monitor" && /^Live sweep: 3 of 34 checked/.test(c.monitor?.caption || "") && c.monitor?.inSync?.join(",") === "RE 10106,ICE 614,RE 10107", `the monitor shows the sweep (got ${JSON.stringify(c.monitor)})`]
  ],
  "live: guardrails (broken-off response, alerts, options, stale decision, drafts, outcome)": (c) => [
    [c.discarded >= 1, `the broken-off response's text is marked as discarded (got ${c.discarded})`],
    [c.alert === "what_if", "the alert without the physical layer went out as a what-if"],
    [c.staleIgnoredOnCards, "a decision on the older set of options left the cards undecided"],
    [JSON.stringify(c.drafts) === '["Passenger message"]', `only the passenger message reached the Outbox (got ${JSON.stringify(c.drafts)})`],
    [/7 guardrail refusals/.test(c.runFacts || ""), `run facts count seven refusals (got ${c.runFacts})`],
    [["ui_report_alert", "ui_propose_options", "ui_draft_action", "ui_final_report"].every((g) => (c.guardLines || []).includes(g)), `guardrail lines for the alerts, the options, the drafts and the summary (got ${JSON.stringify(c.guardLines)})`]
  ]
};

await writeFile(path.join(OUT, "live-results.json"), JSON.stringify(results, null, 2));
let passed = 0;
for (const r of results) {
  const problems = [
    ...(r.checks.FAILED ? [`exception: ${r.checks.FAILED}`] : []),
    ...(EXPECT[r.name]?.(r.checks) || []).filter(([ok]) => !ok).map(([, msg]) => msg),
    ...r.violations.map((v) => `protocol: ${v}`),
    ...(r.remainingScript ? [`${r.remainingScript} scripted responses were never requested`] : []),
    ...r.pageErrors.map((e) => `page error: ${e}`),
    ...r.consoleErrors.map((e) => `console error: ${e}`),
    ...r.csp.map((e) => `CSP: ${e}`),
    ...r.external.map((e) => `external request: ${e}`)
  ];
  if (!problems.length) passed += 1;
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${r.name}`);
  for (const p of problems) console.log(`      - ${String(p).slice(0, 300)}`);
}
const allOk = results.length > 0 && passed === results.length;
console.log(`\n${passed}/${results.length} live cases passed. Screenshots and downloads: ${OUT}`);
if (allOk && ONLY.length === 0) console.log("LIVE OK");
process.exit(allOk ? 0 : 1);
