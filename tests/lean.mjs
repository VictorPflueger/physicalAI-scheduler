// How lean the prototype stays: limits a change has to argue with. Node.js only.
//   shell    the presenter is at most 10 modules of its own (main, shell, view, story, run, plain,
//            diagram, estimate, claude, dom) and 1,900 lines; everything else in js/ is 1.4.0's engine,
//            tools, agent, sensor logic and simulation, byte for byte (tests/fingerprint.mjs)
//   app      at most 7,700 lines of JavaScript in js/ (11,414 in 1.4.0) and one stylesheet of at most
//            560 lines (2,219 in seven files in 1.4.0); vici/ is Vici's, tests/ and tools/ aren't the app
//   network  one module makes requests: js/anthropic.js, in a live run; no module or page names
//            another host to call, and the page links nowhere but the byline and Anthropic's console
//   policy   the page connects to api.anthropic.com only, and loads everything else from the site
//   docs     README.md at most 900 words, DEMO_SCRIPT.md at most 700; DESIGN.md, DATA_SOURCES.md,
//            REVIEW.md and TECH_NOTES.md live in the git history
//   page     nothing of 1.4.0's console is left: no control bar (Live sweep, model, replay speed,
//            Abort, Reset, Diagnostics), no console replay, no drawer (Options, Outbox, Audit), no mirror
// Each rule is first tried on a planted example that must break it. Prints LEAN OK.
// Usage: node tests/lean.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

const LIMITS = { shellModules: 10, shellLines: 1900, jsLines: 7700, cssFiles: 1, cssLines: 560, readmeWords: 900, scriptWords: 700 };
const SHELL = ["main.js", "shell.js", "view.js", "story.js", "run.js", "plain.js", "diagram.js", "estimate.js", "claude.js", "dom.js"];
const NET = /\bfetch\s*\(|XMLHttpRequest|WebSocket|new EventSource|navigator\.sendBeacon/;
const HOSTS = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
const CALLED = new Set(["api.anthropic.com"]);
// Links a person follows, not hosts the page calls: the byline, and Anthropic's console in key messages.
const LINKS = new Set(["www.linkedin.com", "victorpflueger.github.io", "platform.claude.com"]);
const OLD_UI = /\b(id|class)="[^"]*\b(btn-scan|btn-start|btn-abort|btn-reset|btn-diagnostics|speed-|model-select|mode-card|console|drawer|outbox|audit-|options-panel|mirror|intro-modal|status-pill)/;

const results = [];
const check = (ok, what) => results.push([!!ok, what]);
const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const lines = (text) => text.split("\n").length;
const words = (text) => text.replace(/```[\s\S]*?```/g, " ").replace(/[|#*`>-]/g, " ").split(/\s+/).filter((w) => /[A-Za-z0-9€]/.test(w)).length;
const policy = (html) => Object.fromEntries(((html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || "")
  .split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
const policyProblems = (html) => {
  const p = policy(html);
  const out = [];
  const connect = (p["connect-src"] || []).map((s) => s.replace(/^https:\/\//, ""));
  if (connect.sort().join(" ") !== [...CALLED].sort().join(" ")) out.push(`connect-src is "${(p["connect-src"] || []).join(" ")}"`);
  for (const [k, v] of Object.entries(p)) if (k !== "connect-src" && v.some((s) => /^https?:|^\*$|^wss?:/.test(s))) out.push(`${k} loads from ${v.join(" ")}`);
  if (!p["default-src"]?.includes("'self'")) out.push("no default-src 'self'");
  return out;
};
const hostsIn = (text) => [...text.matchAll(HOSTS)].map((m) => m[1].toLowerCase()).filter((h) => !CALLED.has(h) && !LINKS.has(h) && h !== "www.w3.org");
/** Links in the page to anything but the byline's two addresses (its own repository among them). */
const strayLinks = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1])
  .filter((href) => !["https://www.linkedin.com/in/victorpflueger", "https://victorpflueger.github.io/VIP/index.html"].includes(href) && !href.startsWith("#"));

// ---- the rules catch what they are for ----------------------------------------------------------------
check(NET.test(code('const r = await fetch("https://api.open-meteo.com/v1/forecast");')) && !NET.test(code("// reads fetch() bodies\nconst fetched = items.filter(Boolean);")), "control: the network pattern catches a request, and passes a comment and ordinary code");
check(hostsIn('const URL = "https://api.open-meteo.com/v1/forecast";').length === 1 && !hostsIn('fetch("https://api.anthropic.com/v1/messages")').length, "control: a host other than Anthropic's API is caught");
check(policyProblems(`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src https://api.anthropic.com https://unpkg.com">`).length > 0 && policyProblems(`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://unpkg.com; connect-src https://api.anthropic.com">`).length > 0, "control: a policy that connects or loads elsewhere is caught");
check(OLD_UI.test('<div id="console">') && OLD_UI.test('<button id="btn-reset">') && !OLD_UI.test('<dialog id="start-dialog">'), "control: a leftover of 1.4.0's console is caught");
check(strayLinks('<a href="https://github.com/VictorPflueger/physicalAI-scheduler">code</a>').length === 1 && !strayLinks('<a class="vc-byline__person" href="https://www.linkedin.com/in/victorpflueger">').length, "control: a link to the repository is caught, the byline's is not");

// ---- the app ----------------------------------------------------------------------------------------------
const js = readdirSync(path.join(APP_ROOT, "js")).filter((f) => f.endsWith(".js"));
const jsLines = js.reduce((n, f) => n + lines(read(`js/${f}`)), 0);
const shell = SHELL.filter((f) => js.includes(f));
const shellLines = shell.reduce((n, f) => n + lines(read(`js/${f}`)), 0);
check(shell.length === SHELL.length && shell.length <= LIMITS.shellModules, `shell: ${shell.length} modules of the presenter's own (${shell.join(", ")}), at most ${LIMITS.shellModules}`);
check(shellLines <= LIMITS.shellLines, `shell: ${shellLines} lines, at most ${LIMITS.shellLines}`);
check(jsLines <= LIMITS.jsLines, `app: ${jsLines} lines of JavaScript in ${js.length} modules, at most ${LIMITS.jsLines} (11,414 in 1.4.0)`);
const css = readdirSync(path.join(APP_ROOT, "css")).filter((f) => f.endsWith(".css"));
const cssLines = css.reduce((n, f) => n + lines(read(`css/${f}`)), 0);
check(css.length === LIMITS.cssFiles && cssLines <= LIMITS.cssLines, `app: ${cssLines} lines of CSS in ${css.length} file(s), one file of at most ${LIMITS.cssLines} lines (2,219 in seven files in 1.4.0)`);

// ---- network, policy and links ----------------------------------------------------------------------------
const net = js.filter((f) => NET.test(code(read(`js/${f}`))));
check(net.join() === "anthropic.js", `network: only js/anthropic.js makes requests (found in ${net.join(", ") || "none"})`);
const hosts = [...js.map((f) => `js/${f}`), "index.html", ...readdirSync(path.join(APP_ROOT, "data")).map((f) => `data/${f}`)].flatMap((f) => hostsIn(read(f)).map((h) => `${f}: ${h}`));
check(!hosts.length, `network: no module or page names a host to call but Anthropic's API${hosts.length ? `; found ${[...new Set(hosts)].slice(0, 6).join(", ")}` : ""}`);
const p = policyProblems(read("index.html"));
check(!p.length, `policy: the page connects to api.anthropic.com only and loads everything from itself${p.length ? `; ${p.join("; ")}` : ""}`);
const stray = strayLinks(read("index.html"));
check(!stray.length, `links: the page links to the byline's LinkedIn and website only, not to its own repository${stray.length ? `; found ${stray.join(", ")}` : ""}`);
const repoNamed = js.filter((f) => /github\.com\/VictorPflueger\/physicalAI-scheduler/i.test(read(`js/${f}`)));
check(!repoNamed.length, `links: no module writes a link to the repository${repoNamed.length ? `; found in ${repoNamed.join(", ")}` : ""}`);

// ---- docs and page ------------------------------------------------------------------------------------------
const count = (f) => (existsSync(path.join(APP_ROOT, f)) ? words(read(f)) : Infinity);
check(count("README.md") <= LIMITS.readmeWords, `docs: README.md has ${count("README.md")} words, at most ${LIMITS.readmeWords}`);
check(count("DEMO_SCRIPT.md") <= LIMITS.scriptWords, `docs: DEMO_SCRIPT.md has ${count("DEMO_SCRIPT.md")} words, at most ${LIMITS.scriptWords}`);
const gone = ["DESIGN.md", "DATA_SOURCES.md", "REVIEW.md", "TECH_NOTES.md", "PLAN.md"].filter((f) => existsSync(path.join(APP_ROOT, f)));
check(!gone.length, `docs: DESIGN.md, DATA_SOURCES.md, REVIEW.md and TECH_NOTES.md live in the git history${gone.length ? ` (still here: ${gone.join(", ")})` : ""}`);
const left = read("index.html").match(OLD_UI);
check(!left, `page: nothing of 1.4.0's console is left${left ? ` (found ${left[0]})` : ""}`);
const oldModules = ["console.js", "controls.js", "drawer.js", "outbox.js", "audit_panel.js", "options_panel.js", "diagnostics.js", "diagnostics_view.js", "mirror.js", "recorder.js", "intro.js"].filter((f) => js.includes(f));
check(!oldModules.length, `page: the modules of 1.4.0's console, drawer, mirror and recorder are gone${oldModules.length ? ` (still here: ${oldModules.join(", ")})` : ""}`);

const failed = results.filter(([ok]) => !ok);
for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
if (failed.length) { console.log(`\n${failed.length} of ${results.length} checks failed.`); process.exit(1); }
console.log(`\nAll ${results.length} checks passed.\nLEAN OK`);
