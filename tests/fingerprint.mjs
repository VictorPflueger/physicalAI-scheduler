// The case stays intact: the engine, the tools, the agent, the sensor logic, the data and the seven
// simulation scripts are the files of version 1.4.0 (commit 04006b6), byte for byte, and they give
// 1.4.0's figures on every decision path a person can take.
//   files    SHA-256 of every module, data file and tool the presenter shell builds on; config.js with
//            its version masked, the only line 2.0.0 changes there
//   paths    every scenario on every path: the recommended option with its drafts approved or
//            rejected, each other option, a rejection before the approval, accepting the risk, and
//            rejecting all three before accepting it. Per path: the alert, every figure the engine
//            reports (estimate, verified, payoff), each option's figures, the decisions, the drafts
//            and the summary's heading
// The paths are played here with 1.4.0's own modules only (js/events.js and js/simulation.js), so the
// fixture is computed by 1.4.0 itself:
//   node tests/fingerprint.mjs --write --root=<a checkout of 1.4.0>
// writes tests/fixtures/fingerprint-1.4.0.json from that checkout; 2.0.0 never rewrites it.
// Usage: node tests/fingerprint.mjs          prints "FINGERPRINT OK" or the differences
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./lib/harness.mjs";

const FIXTURE = path.join(APP_ROOT, "tests", "fixtures", "fingerprint-1.4.0.json");
const rootArg = process.argv.find((a) => a.startsWith("--root="));
const ROOT = rootArg ? path.resolve(rootArg.slice("--root=".length)) : APP_ROOT;
const UNCHANGED = [
  "js/agent.js", "js/align_data.js", "js/anthropic.js", "js/audit.js", "js/clock.js", "js/cost.js", "js/drafts.js",
  "js/events.js", "js/facts.js", "js/format.js", "js/guards.js", "js/keystore.js", "js/labels.js", "js/ops.js",
  "js/payoff.js", "js/prompt.js", "js/run_facts.js", "js/sim_check.js", "js/sim_vars.js", "js/simulation.js",
  "js/sse.js", "js/summaries.js", "js/sync.js", "js/theme.js", "js/tool_plain.js", "js/tools.js", "js/world.js",
  "js/world_check.js",
  "data/world.js", "data/scenarios.js", "data/reference_cases.js", "data/sim_runs.js",
  "tools/build_world.mjs", "tools/check_world.mjs"
];
const sha = (s) => createHash("sha256").update(s).digest("hex");
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const maskVersion = (s) => s.replace(/(\bversion:\s*")[^"]*(")/, "$1…$2");

function files() {
  const out = Object.fromEntries(UNCHANGED.map((f) => [f, sha(read(f))]));
  out["js/config.js (version masked)"] = sha(maskVersion(read("js/config.js")));
  return out;
}

/** The decision paths of one scenario, from its options: [name, { pick, drafts }]. */
function plansFor(ids, recommended) {
  const others = ids.filter((id) => id !== recommended);
  return [
    ["recommended", { pick: recommended, drafts: "approved" }],
    ["recommended, drafts rejected", { pick: recommended, drafts: "rejected" }],
    ...others.map((id) => [`approve ${id}`, { pick: id, drafts: "approved" }]),
    [`reject ${others[0]}, then the recommended`, { reject: [others[0]], pick: recommended, drafts: "approved" }],
    ["accept the risk", { pick: "baseline", drafts: "approved" }],
    ["reject all, then accept the risk", { reject: [...ids], pick: "baseline", drafts: "approved" }]
  ];
}

/** Plays one script to its end with 1.4.0's modules from `root`, deciding as `plan` says. */
async function playPath(mods, scenario, plan) {
  const { bus, newRunId, createSimulationPlayer } = mods;
  const player = createSimulationPlayer({ getSpeed: () => Infinity });
  const events = [];
  const runId = newRunId();
  const queue = [...(plan.reject || []).map((id) => [id, "rejected"]), [plan.pick, "approved"]];
  let seq = null;
  const next = () => { const d = queue.shift(); if (d) setTimeout(() => bus.emit("option_decision", { options_seq: seq, option_id: d[0], decision: d[1], by: "user" }), 0); };
  bus.beginRun({ run_id: runId, mode: "simulation" });
  const off = bus.onAny((ev) => {
    if (ev.run_id !== runId) return;
    events.push(ev);
    const p = ev.payload || {};
    if (ev.type === "options") {
      seq = p.options_seq;
      if (plan.pick === "recommended") queue[queue.length - 1][0] = p.recommended;
      next();
    }
    if (ev.type === "option_decision" && p.decision === "rejected") next();
    if (ev.type === "action_draft") setTimeout(() => bus.emit("action_decision", { action_id: p.action_id, decision: plan.drafts, by: "user" }), 0);
  });
  bus.emit("run_start", { run_id: runId, mode: "simulation", entry: "scenario", scenario_id: scenario.id, title: scenario.title, seed: scenario.seed });
  try {
    await player.play(globalThis.SIM_RUNS[scenario.id], { scenario: scenario.id });
  } finally {
    off();
    bus.endRun();
  }
  return events;
}

/** What a path shows, in values that do not move with the clock. */
function summarise(events) {
  const ev = (t) => events.filter((e) => e.type === t).map((e) => e.payload);
  const opts = ev("options").at(-1);
  return {
    errors: ev("notice").filter((n) => n.level === "error").map((n) => n.text),
    end: ev("run_end").map((e) => e.status || e.reason || null),
    alerts: ev("alert").map((a) => `${a.basis}|${a.title}`),
    kpis: ev("kpi_update").map((k) => (k.decided
      ? `decided ${k.option_label}: ${k.residual_pax} of ${k.before_pax}, right information ${k.correct_from_min ?? "-"} min, in sync ${k.sync_min ?? "-"} min`
      : `${k.stage}/${k.basis}: ${k.pax_at_risk} of ${k.affected_pax}, first ${k.first_event_min} min at ${k.first_event_short}`)),
    options: opts ? opts.options.map((o) => [o.id, o.letter, o.misinformed_pax, o.protected_pax, o.correct_info_from_min, o.time_to_sync_min, o.residual_contradictions, o.manual_overrides, o.held_pax]) : null,
    recommended: opts ? opts.recommended : null,
    baseline: opts ? [opts.baseline?.misinformed_pax ?? null, opts.baseline?.first_event_min ?? null] : null,
    decided: ev("option_decision").map((d) => `${d.option_id}:${d.decision}`),
    drafts: ev("action_draft").map((d) => `${d.type}: ${d.subject}`),
    report: (ev("report").at(-1)?.markdown || "").split("\n")[0]
  };
}

async function figures(root) {
  globalThis.window = globalThis;
  const require = createRequire(import.meta.url);
  for (const f of ["world", "scenarios", "reference_cases", "sim_runs"]) require(path.join(root, "data", `${f}.js`));
  const mod = (name) => import(pathToFileURL(path.join(root, "js", `${name}.js`)).href);
  const { bus, newRunId } = await mod("events");
  const { createSimulationPlayer } = await mod("simulation");
  const mods = { bus, newRunId, createSimulationPlayer };
  const paths = {};
  for (const sc of globalThis.SCENARIOS) {
    // The options a scenario offers, from its own run.
    const first = await playPath(mods, sc, { pick: "recommended", drafts: "approved" });
    const o = first.find((e) => e.type === "options")?.payload;
    if (!o) { paths[`${sc.id} recommended`] = summarise(first); continue; }
    for (const [name, plan] of plansFor(o.options.map((x) => x.id), o.recommended)) {
      paths[`${sc.id} ${name}`] = summarise(await playPath(mods, sc, plan));
    }
  }
  return paths;
}

const now = { files: files(), paths: await figures(ROOT) };
if (process.argv.includes("--write")) {
  let commit = null;
  try { commit = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* not a checkout */ }
  const version = (read("js/config.js").match(/\bversion:\s*"([^"]+)"/) || [])[1];
  if (version !== "1.4.0") { console.log(`FAIL: --root must be a checkout of 1.4.0 (it is ${version})`); process.exit(1); }
  writeFileSync(FIXTURE, `${JSON.stringify({ commit, version, ...now }, null, 1)}\n`);
  console.log(`Wrote ${path.relative(APP_ROOT, FIXTURE)} from ${commit}: ${Object.keys(now.files).length} files, ${Object.keys(now.paths).length} paths.`);
  process.exit(0);
}

const then = JSON.parse(readFileSync(FIXTURE, "utf8"));
const diffs = [];
for (const [f, h] of Object.entries(then.files)) if (now.files[f] !== h) diffs.push(`file changed or missing: ${f}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const [k, v] of Object.entries(then.paths || {})) if (!same(now.paths[k], v)) diffs.push(`path ${k}: ${JSON.stringify(now.paths[k])} is not ${JSON.stringify(v)}`);
for (const k of Object.keys(now.paths)) if (!(k in (then.paths || {}))) diffs.push(`path ${k} is not in the fixture`);
const errors = Object.entries(now.paths).filter(([, v]) => v.errors.length).map(([k]) => k);
if (errors.length) diffs.push(`script errors on ${errors.join(", ")}`);
const unfinished = Object.entries(now.paths).filter(([, v]) => !same(v.end, ["done"])).map(([k, v]) => `${k} (${JSON.stringify(v.end)})`);
if (unfinished.length) diffs.push(`paths that did not end: ${unfinished.join(", ")}`);
if (Object.keys(then.paths || {}).length < 40) diffs.push(`the fixture holds ${Object.keys(then.paths || {}).length} paths; it must cover every path of the seven scenarios`);

if (diffs.length) {
  console.log(`FAIL: ${diffs.length} difference(s) from 1.4.0 (${then.commit?.slice(0, 7)})`);
  for (const d of diffs.slice(0, 30)) console.log(`  - ${d}`);
  process.exit(1);
}
console.log(`${Object.keys(then.files).length} files byte-identical to 1.4.0 (${then.commit.slice(0, 7)}), and ${Object.keys(then.paths).length} decision paths of the seven scenarios with 1.4.0's figures.`);
console.log("FINGERPRINT OK");
