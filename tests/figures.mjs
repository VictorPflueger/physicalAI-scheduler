// The figures and the names: the app computes every figure and none is typed in, and the room hears
// names, never ids. Node.js only.
//   page   every [data-fig] figure written in index.html (the key figures, the guide, the Start agent
//          dialog) equals the one the app computes for the platform change; no euro amount is typed
//          into the page or a script; the talk track has five one-minute steps named as the page's;
//          the four tiles read, before anything runs, what the app shows; for all seven scenarios on
//          every decision path every placeholder is filled, no figure is broken, and the key figures
//          and options are the engine's own (js/sync.js on the scenario's reference case)
//   names  no state the presenter draws on any path of the seven scenarios (tests/lib/pages.mjs)
//          shows an id where a name belongs, a German team title, a placeholder, a broken value or a
//          screen that 2.0.0 cut, and no draft's full text an id, a placeholder or a broken value;
//          every scenario's train has a name for the stage's heading
//   docs   README.md and DEMO_SCRIPT.md name the five steps and the four key figures, and every
//          passenger count, minute, euro amount and option in them is the one the app computes
// Each rule is first tried on a planted example that must break it.
// Usage: node tests/figures.mjs [page] [names] [docs]
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_ROOT, wanted, loadApp, STEP_IDS, KPI_NAMES, DEFAULT_SCENARIO } from "./lib/harness.mjs";
import { renderAll, plansFor, visibleText } from "./lib/pages.mjs";

const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");
const norm = (s) => String(s).replace(/&nbsp;| /g, " ").replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const app = await loadApp();
const { story, run, estimate, world, config, format } = app;
const html = read("index.html");
const model = world.getModel();
const MODEL = config.MODELS.find((m) => m.id === config.DEFAULT_MODEL);
const LABELS = story.STEPS.map((s) => s.label);
const scenarioOf = (id) => app.SCENARIOS.find((s) => s.id === id);
const demo = scenarioOf(DEFAULT_SCENARIO);
const demoEvents = await estimate.playHeadless(demo);
const demoCost = estimate.estimateCost(demoEvents, demo, MODEL.id).eur;
/** The run as the page holds it when it rests: up to the decision. */
const rested = run.digest(demoEvents.slice(0, demoEvents.findIndex((e) => e.type === "option_decision")));

/** What no state may show: an id where a name belongs, a placeholder, a broken value, a cut screen. */
const FORBIDDEN = [
  [/\bOPS-\d+\b/, "an operations log id"], [/\bPHY-\d+\b/, "a sensor reading id"], [/\bT-[A-Z]*\d+\b/, "a train id"],
  [/\bSC-[A-Z]+\b/, "a scenario id"], [/\bV[1-3]\b/, "a variant id"], [/\bsim-[ac]\d+\b/, "a call id"], [/\bW \d+\b/, "a points number"],
  [/\bESTW\b/, "the interlocking's German abbreviation"], [/\bFplo\b/, "a construction order's German abbreviation"],
  [/\b(Fahrdienstleiter|Weichendiagnose|Betriebshalt|Fahrzeugdisposition|Baubetriebsplanung)\b/, "a German team or record title"],
  [/\{\{|\}\}/, "an unfilled placeholder"], [/\b(undefined|NaN|null|Infinity)\b/, "a broken value"],
  [/\bOutbox\b|\bLive sweep\b|\b(Audit|Options|Diagnostics) (tab|panel)\b|\b[Rr]eset and\b|\bpress Reset\b/, "a screen 2.0.0 cut"]
];

/** The platform change's figures as the page writes them. */
function expected(page) {
  const figs = story.guideFigures(run.digest(demoEvents), { model, scenario: demo, estimate: demoCost });
  const minutes = [...page.matchAll(/class="vc-guide__time"[^>]*>([^<]*)</g)].map((m) => parseFloat(m[1]));
  figs["decision-min"] = `${minutes.slice(0, STEP_IDS.indexOf("propose") + 1).reduce((a, b) => a + b, 0)} min`;
  figs.model = MODEL.label;
  figs["max-calls"] = String(config.AGENT.maxSteps);
  figs.budget = `€${config.AGENT.budgetEur}`;
  return figs;
}

/** Every element marked data-fig in a page whose text differs from the computed figure. */
function figureProblems(page) {
  const figs = expected(page);
  const out = [];
  let n = 0;
  for (const m of page.matchAll(/<(\w+)\b[^>]*\bdata-fig="([^"]+)"[^>]*>([^<]*)<\/\1>/g)) {
    n += 1;
    const [, , name, text] = m;
    if (!(name in figs)) out.push(`data-fig="${name}" names no computed figure`);
    else if (norm(text) !== norm(figs[name])) out.push(`data-fig="${name}" reads "${norm(text)}", the app computes "${norm(figs[name])}"`);
  }
  return { n, out };
}

/** Euro amounts typed into the page outside the elements the app writes. */
const typedEuros = (page) => (page.replace(/<(\w+)\b[^>]*\bdata-fig="[^"]+"[^>]*>[^<]*<\/\1>/g, "").replace(/<!--[\s\S]*?-->/g, "").match(/€(?:\s|&nbsp;)?\d[\d.,]*[kMB]?/g) || []);

async function pageChecks() {
  const results = [];
  const check = (ok, what) => results.push([!!ok, what]);

  // The rules catch what they are for.
  check(figureProblems(html.replace(/(data-fig="rec-left"[^>]*>)7</, "$18<")).out.length > 0, "control: a figure in the page that differs from the engine's is caught");
  check(typedEuros(html.replace("</nav>", "<p>Costs €45k.</p></nav>")).length === 1, "control: a euro amount typed into the page is caught");

  const { n, out } = figureProblems(html);
  check(n >= 20 && !out.length, `page: the ${n} figures written in index.html equal the app's${out.length ? `; ${out.join("; ")}` : ""}`);
  const typed = typedEuros(html);
  check(!typed.length, `page: no euro amount is typed into index.html outside the figures the app writes${typed.length ? `; found ${typed.join(", ")}` : ""}`);
  const typedScript = (read("data/sim_runs.js") + read("data/scenarios.js")).match(/€\s?\d[\d.,]*[kMB]?/g) || [];
  check(!typedScript.length, `scripts: data/sim_runs.js and data/scenarios.js type no euro amount${typedScript.length ? `; found ${typedScript.join(", ")}` : ""}`);

  // The talk track: five steps of one minute, in the page's order.
  const pathHtml = (html.match(/<ol class="vc-guide__path">([\s\S]*?)<\/ol>/) || [])[1] || "";
  const items = [...pathHtml.matchAll(/<li>\s*<strong>([^<.:]+)/g)].map((m) => norm(m[1]));
  const times = [...pathHtml.matchAll(/class="vc-guide__time">([^<]*)</g)].map((m) => norm(m[1]));
  check(items.join("|") === LABELS.join("|") && times.length === 5 && times.every((t) => t === "1 min"), `talk track: five steps named ${items.join(", ")}, ${times.join(", ")}`);
  const steps = [...html.matchAll(/<li class="vc-step" data-step="([^"]+)">[\s\S]*?<span class="vc-step__label">([^<]+)</g)].map((m) => `${m[1]}:${m[2]}`);
  check(steps.join("|") === STEP_IDS.map((id, i) => `${id}:${LABELS[i]}`).join("|"), `page: the steps under the header are ${steps.join(", ")}`);
  // The guide names the action the bar offers at the decision and at the drafts.
  const view = story.story(rested, { scenario: demo, mode: "simulation" });
  const decisionAction = view.steps[STEP_IDS.indexOf("propose")].turn?.action?.label;
  // The page rests at the drafts with every draft written and none decided yet.
  const lastDraft = demoEvents.map((e) => e.type).lastIndexOf("action_draft");
  const later = run.digest(demoEvents.slice(0, lastDraft + 1).filter((e) => e.type !== "action_decision"));
  const draftsAction = story.story(later, { scenario: demo, mode: "simulation" }).steps[STEP_IDS.indexOf("prepare")].turn?.action?.label;
  check(decisionAction && norm(pathHtml).includes(`press ${decisionAction}`) && draftsAction && norm(pathHtml).includes(`press ${draftsAction}`), `talk track: it says to press "${decisionAction}" and "${draftsAction}", as the Your turn bar offers them`);

  // The key figures as written equal what the app shows before anything happens.
  const shown = story.keyFigures(rested, { mode: "simulation", estimate: demoCost, model: MODEL.label });
  const tiles = Object.fromEntries([...html.matchAll(/data-vc-kpi="([^"]+)"[\s\S]*?class="[^"]*kpi-value[^"]*"[^>]*>([\s\S]*?)<\/p>\s*<p class="[^"]*kpi-note[^"]*">([\s\S]*?)<\/p>/g)]
    .map((m) => [m[1], { value: norm(m[2]), note: norm(m[3]) }]));
  check(Object.keys(tiles).join("|") === KPI_NAMES.join("|"), `key figures: the page has ${Object.keys(tiles).join(", ")}`);
  for (const [name, f] of [["Misinformed passengers", shown.pax], ["First passenger acts in", shown.first], ["Session cost", shown.cost]]) {
    const t = tiles[name];
    check(t && t.value === norm(f.value) && t.note === norm(f.note), `key figures: "${name}" reads "${t?.value}, ${t?.note}" as the app shows it ("${f.value}, ${f.note}")`);
  }
  check(tiles["Detection → decision"]?.value === "0:00" && tiles["Detection → decision"]?.note === "starts with the lead", `key figures: "Detection → decision" starts at 0:00 with the lead`);
  check(!/Step 3|…/.test(Object.values(tiles).map((t) => t.value).join(" ")), "key figures: every tile holds a value before anything runs, none waits for a step");

  // All seven scenarios, every path: filled, unbroken, the engine's.
  const { simulateSync } = await import("../js/sync.js");
  for (const s of app.SCENARIOS) {
    const first = await estimate.playHeadless(s);
    const o = first.find((e) => e.type === "options")?.payload;
    const problems = [];
    const plans = plansFor(o.options.map((x) => x.id), o.recommended);
    for (const [name, how] of plans) {
      const events = name === "recommended" ? first : await estimate.playHeadless(s, how);
      const text = JSON.stringify(events.map((e) => e.payload));
      const left = text.match(/\{\{[^}]+\}\}/g) || [];
      if (left.length) problems.push(`${name}: unfilled ${[...new Set(left)].slice(0, 3).join(", ")}`);
      if (/NaN|undefined|Infinity/.test(text)) problems.push(`${name}: NaN, Infinity or undefined in an event`);
      if (!events.some((e) => e.type === "run_end" && e.payload.status === "done")) problems.push(`${name}: the run did not end`);
    }
    const ref = simulateSync(model, structuredClone(app.REFERENCE_CASES[s.id].finding));
    const r = run.digest(first.slice(0, first.findIndex((e) => e.type === "option_decision")));
    const k = story.keyFigures(r, { mode: "simulation", estimate: 0.1 });
    if (k.pax.value !== format.int(ref.baseline.misinformed_pax)) problems.push(`the tile shows ${k.pax.value} misinformed, the engine counts ${ref.baseline.misinformed_pax}`);
    if (k.first.value !== (ref.baseline.first_event_min === null ? "None" : `${format.int(ref.baseline.first_event_min)} min`)) problems.push(`the tile shows the first in ${k.first.value}, the engine says ${ref.baseline.first_event_min} min`);
    for (const opt of o.options) {
      const v = ref.variants.find((x) => x.variant_id === opt.id);
      if (!v || v.misinformed_pax !== opt.misinformed_pax || v.time_to_sync_min !== opt.time_to_sync_min) problems.push(`option ${opt.letter} is not the engine's ${opt.id}`);
    }
    const cost = estimate.estimateCost(first, s, MODEL.id).eur;
    if (!(cost > 0 && cost < config.AGENT.budgetEur)) problems.push(`the estimate ${cost} is not a cost below the cap`);
    const figs = story.guideFigures(run.digest(first), { model, scenario: s, estimate: cost });
    for (const name of ["pax", "first", "rec", "rec-left", "estimate"]) if (!figs[name] || /NaN|undefined/.test(figs[name])) problems.push(`figure ${name} is "${figs[name]}"`);
    check(!problems.length, `${s.id}: ${plans.length} paths filled and ended; ${k.pax.value} misinformed, the first in ${k.first.value}, option ${figs.rec} leaves ${figs["rec-left"]}, a live run ≈ ${format.eurCents(cost)}${problems.length ? `; ${problems.join("; ")}` : ""}`);
  }
  return results;
}

async function namesChecks() {
  const results = [];
  const check = (ok, what) => results.push([!!ok, what]);
  check(FORBIDDEN.every(([re]) => !re.test("ICE 618 leaves from platform 7; the signaller at Köln Hbf changed it at 07:21, after the points failure."))
    && ["OPS-05", "T-618", "V2", "W 32", "{{pax}}", "the Outbox", "Fahrdienstleiter Köln Hbf", "NaN min"].every((t) => FORBIDDEN.some(([re]) => re.test(t))),
  "control: the patterns catch an id, a German title, a placeholder, a broken value and a cut screen, and leave a plain sentence alone");
  const { states, paths } = await renderAll();
  const scenarioTexts = app.SCENARIOS.flatMap((s) => [s.title, app.plain.plain(s.seed)]);
  // A draft's full text (in a <pre>) may be German, so German words stay there; ids, placeholders and
  // broken values may not.
  const draftsOf = (html) => [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map((m) => m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  const inDrafts = (what) => !/German|cut/.test(what);
  for (const [re, what] of FORBIDDEN) {
    let hit = null;
    for (const s of states) {
      const line = visibleText(s.html).split("\n").find((l) => re.test(l));
      if (line) { hit = `"${line.trim().slice(0, 120)}" (${s.where})`; break; }
      const draft = inDrafts(what) && draftsOf(s.html).flatMap((d) => d.split("\n")).find((l) => re.test(l));
      if (draft) { hit = `"${draft.trim().slice(0, 120)}" (${s.where}, a draft)`; break; }
    }
    const t = scenarioTexts.find((x) => re.test(x));
    if (!hit && t) hit = `"${t.slice(0, 120)}" (a scenario's title or lead)`;
    check(!hit, `no state on any of the ${paths.length} paths shows ${what}${hit ? `: ${hit}` : ""}`);
  }
  const unnamed = app.SCENARIOS.filter((s) => { const t = model.trains.get(s.train_id); return !t || !t.number || !t.to; }).map((s) => s.id);
  check(!unnamed.length, `every scenario's train has a number and a destination for the stage's heading${unnamed.length ? `; missing for ${unnamed.join(", ")}` : ""}`);
  check(states.length > 500, `${states.length} states drawn from the page's own modules`);
  return results;
}

function docsChecks() {
  const results = [];
  const check = (ok, what) => results.push([!!ok, what]);
  const figs = expected(html);
  const counts = new Set([figs.pax, figs["hyp-pax"], figs["rec-left"]]);
  const euros = new Set([figs.estimate, figs.budget]);
  /** Problems with one Markdown document against the page and the engine. */
  const docProblems = (text) => {
    const out = [];
    const plain = text.replace(/```[\s\S]*?```/g, " ");
    for (const label of LABELS) if (!new RegExp(`\\b${label}\\b`).test(plain)) out.push(`never names the step ${label}`);
    for (const name of KPI_NAMES) if (!plain.includes(name)) out.push(`never names the key figure ${name}`);
    for (const m of plain.matchAll(/€\s?\d+(?:[.,]\d+)*(?:\s?[kMB]\b)?/g)) if (!euros.has(norm(m[0]))) out.push(`${m[0]} is not a figure the app computes (${[...euros].join(", ")})`);
    for (const m of plain.matchAll(/\b(\d[\d,]*) (?:passengers|misinformed)\b/g)) if (!counts.has(m[1])) out.push(`"${m[0]}": the engine counts ${[...counts].join(", ")}`);
    for (const m of plain.matchAll(/\bfirst (?:one )?(?:in|after) (\d+) min/g)) if (`${m[1]} min` !== figs.first) out.push(`"${m[0]}": the engine says ${figs.first}`);
    for (const m of plain.matchAll(/[Aa]pprove option ([ABC])\b/g)) if (m[1] !== figs.rec) out.push(`"${m[0]}": the agent recommends option ${figs.rec}`);
    return out;
  };
  const readme = read("README.md");
  check(docProblems(`${readme}\n312 passengers, 313 passengers`).length > 0, "control: a passenger count in a document that differs from the engine's is caught");
  for (const doc of ["README.md", "DEMO_SCRIPT.md"]) {
    const p = docProblems(read(doc));
    check(!p.length, `${doc}: names the five steps and four key figures, and its figures are the app's${p.length ? `; ${p.join("; ")}` : ""}`);
  }
  return results;
}

const groups = [];
if (wanted("page")) groups.push([await pageChecks(), "FIGURES OK"]);
if (wanted("names")) groups.push([await namesChecks(), "NAMES OK"]);
if (wanted("docs")) groups.push([docsChecks(), "DOCS MATCH"]);
let failed = 0;
const tokens = [];
for (const [results, token] of groups) {
  for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  const f = results.filter(([ok]) => !ok).length;
  failed += f;
  if (!f) tokens.push(token);
}
if (failed) { console.log(`\n${failed} checks failed.`); process.exit(1); }
console.log(`\nAll checks passed.\n${tokens.join("\n")}`);
