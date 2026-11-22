// The docs say what the page and the repository say. Node.js only.
//   paths    every repository path README.md, DEMO_SCRIPT.md, tests/README.md and vici/README.md name
//            (in backticks or as a relative link) exists
//   release  README.md names version 2.0.0, as js/config.js does, and links the live site
//   script   DEMO_SCRIPT.md walks the guide's talk track: the same five steps in the same order, the
//            same actions to press, the same five minutes
//   suites   tests/README.md names every suite tests/run-all.mjs runs, and nothing it does not
// Each rule is first tried on a planted example that must break it. Prints DOCS OK.
// Usage: node tests/docs.mjs
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { APP_ROOT, checks } from "./lib/harness.mjs";

const { check, end } = checks();
const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");
const strip = (s) => s.replace(/```[\s\S]*?```/g, " ");

/** Repository paths a document names that do not exist (relative to the repository, or to vici/). */
function missingPaths(text, base = "") {
  const named = new Set();
  for (const m of strip(text).matchAll(/`([^`\s]+)`/g)) if (/^(js|css|data|tests|tools|vici|dist|assets|\.github)\/|\.(md|mjs|js|css|html|svg|json)$/.test(m[1]) && !m[1].includes("*") && !/^\?|^https?:/.test(m[1])) named.add(m[1]);
  for (const m of text.matchAll(/\]\(((?!https?:|#|mailto:)[^)\s]+)\)/g)) named.add(m[1].replace(/#.*$/, ""));
  return [...named].filter((p) => !existsSync(path.join(APP_ROOT, base, p)) && !existsSync(path.join(APP_ROOT, p)));
}
check(missingPaths("See `js/nowhere.js` and [this](NOPE.md).").length === 2, "control: a path that does not exist is caught");
for (const [doc, base] of [["README.md", ""], ["DEMO_SCRIPT.md", ""], ["tests/README.md", "tests"], ["vici/README.md", "vici"]]) {
  const miss = missingPaths(read(doc), base);
  check(!miss.length, `${doc}: every path it names exists${miss.length ? `; missing: ${miss.join(", ")}` : ""}`);
}

// The release.
const version = (read("js/config.js").match(/\bversion:\s*"([^"]+)"/) || [])[1];
const readme = read("README.md");
check(version === "2.0.0" && new RegExp(`Version ${version.replace(/\./g, "\\.")}\\b`).test(readme), `README.md names version ${version}, as js/config.js does`);
check(readme.includes("https://victorpflueger.github.io/physicalAI-scheduler/"), "README.md links the live site");

// The demo script walks the guide's talk track.
const html = read("index.html");
const pathHtml = (html.match(/<ol class="vc-guide__path">([\s\S]*?)<\/ol>/) || [])[1] || "";
const guideSteps = [...pathHtml.matchAll(/<li>\s*<strong>([\s\S]*?)<\/strong>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
const scriptSteps = (text) => [...strip(text).matchAll(/^\d\. \*\*([^*]+)\*\*/gm)].map((m) => m[1].trim());
const names = (steps) => steps.map((s) => s.split(/[:.]/)[0].trim());
const presses = (steps) => steps.map((s) => (s.match(/press ([^.,]+?)(?:\.|$| in )/) || [])[1] || null);
const script = read("DEMO_SCRIPT.md");
const ours = scriptSteps(script);
check(names(scriptSteps(script.replace("**Calculate:", "**Count:"))).join() !== names(guideSteps).join(), "control: a step renamed in the script is caught");
check(names(ours).join() === names(guideSteps).join() && ours.length === 5, `DEMO_SCRIPT.md walks the guide's five steps in order (${names(ours).join(", ")})`);
check(JSON.stringify(presses(ours)) === JSON.stringify(presses(guideSteps)), `the script and the guide say to press the same buttons (${presses(ours).filter(Boolean).join(", ")})`);
const minutes = [...strip(script).matchAll(/^\d\. \*\*[^\n]*\((\d+) min\)/gm)].map((m) => m[1]);
check(minutes.length === 5 && minutes.every((m) => m === "1"), `the script gives each step a minute (${minutes.join(", ")})`);

// The suites.
const runAll = read("tests/run-all.mjs");
const suites = [...runAll.matchAll(/\{ id: "([^"]+)"/g)].map((m) => m[1]);
const testsReadme = read("tests/README.md");
const listed = [...testsReadme.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
check(suites.length >= 12 && suites.every((s) => listed.includes(s)) && listed.every((s) => suites.includes(s) || ["rework", "live_site", "remote_head"].includes(s)), `tests/README.md lists the ${suites.length} suites run-all runs (${suites.join(", ")})${suites.filter((s) => !listed.includes(s)).length ? `; missing: ${suites.filter((s) => !listed.includes(s)).join(", ")}` : ""}`);

end("DOCS OK");
