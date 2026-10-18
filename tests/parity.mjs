// Parity with the sister app: the shared shell must stay the shell the sister apps run, so a fix or a
// design change in one can be carried to the others file by file. Compared with a checkout of Rebate
// Hunter (the most recent sister app), with the app names and storage prefixes normalised:
//   identical   the shared modules and stylesheets, character for character (comments included)
//   same code   stylesheets whose comments name the app's own centrepiece: the rules must match with
//               comments removed (style.css up to its marked app-specific block)
//   same tokens every colour token and its value (css/tokens.css, design/tokens.json)
//   same fonts  the self-hosted font files, byte for byte
// Usage: node tests/parity.mjs <path to a PROC-Rebate-Hunter checkout>
//        (or set PARITY_REF; without a reference the check cannot run and says so)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { APP_ROOT } from "./lib/harness.mjs";

const REF = process.argv[2] || process.env.PARITY_REF || path.resolve(APP_ROOT, "..", "PROC-Rebate-Hunter");
if (!fs.existsSync(path.join(REF, "js", "sse.js"))) {
  console.error(`No sister-app checkout at ${REF}. Clone https://github.com/VictorPflueger/PROC-Rebate-Hunter and pass its path.`);
  process.exit(2);
}

const IDENTICAL = [
  "js/anthropic.js", "js/clock.js", "js/cost.js", "js/dom.js", "js/drawer.js", "js/handover.js", "js/keystore.js",
  "js/labels.js", "js/md.js", "js/modal.js", "js/progress.js", "js/sse.js",
  "css/components.css", "css/console.css", "css/drawer.css", "css/fonts.css"
];
const SAME_CODE = ["css/modals.css", "css/style.css"];
const APP_BLOCK = /\/\* -{20,} \*\/\n\/\* App-specific: not part of the shared shell[\s\S]*$/;

const read = (root, f) => fs.readFileSync(path.join(root, f), "utf8");
const names = (s) => s
  .replace(/the Rebate Hunter|the Timetable Translator/g, "the APP")
  .replace(/Rebate Hunter|Timetable Translator/g, "APP")
  .replace(/rebate-hunter|timetable-translator/g, "app")
  .replace(/(["'`])(rh|tt)\./g, "$1app.");
const code = (s) => names(s).replace(APP_BLOCK, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();

const problems = [];
let checked = 0;
const firstDiff = (a, b) => {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) return `line ${i + 1}: "${(la[i] ?? "").trim().slice(0, 70)}" ≠ "${(lb[i] ?? "").trim().slice(0, 70)}"`;
  return "";
};

for (const f of IDENTICAL) {
  const a = names(read(REF, f));
  const b = names(read(APP_ROOT, f));
  checked += 1;
  if (a !== b) problems.push(`${f} differs from the sister app (${firstDiff(a, b)})`);
}
for (const f of SAME_CODE) {
  const a = code(read(REF, f));
  const b = code(read(APP_ROOT, f));
  checked += 1;
  if (a !== b) {
    let i = 0;
    while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
    problems.push(`${f}: the rules differ from the sister app near "${a.slice(Math.max(0, i - 30), i + 40)}" / "${b.slice(Math.max(0, i - 30), i + 40)}"`);
  }
}

// Every colour token and its value.
const tokens = (css) => Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const ta = tokens(read(REF, "css/tokens.css"));
const tb = tokens(read(APP_ROOT, "css/tokens.css"));
checked += 1;
const tokenDiff = [...new Set([...Object.keys(ta), ...Object.keys(tb)])].filter((k) => ta[k] !== tb[k]);
if (tokenDiff.length) problems.push(`css/tokens.css: ${tokenDiff.length} tokens differ (${tokenDiff.slice(0, 5).map((k) => `${k} ${ta[k]} ≠ ${tb[k]}`).join("; ")})`);
const ja = JSON.parse(read(REF, "design/tokens.json"));
const jb = JSON.parse(read(APP_ROOT, "design/tokens.json"));
const strip = (o) => JSON.stringify(o, (k, v) => (["description", "$description", "name", "title"].includes(k) ? undefined : v));
checked += 1;
if (strip(ja) !== strip(jb)) problems.push("design/tokens.json: the token values differ from the sister app");

// The self-hosted fonts.
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const fa = fs.readdirSync(path.join(REF, "fonts")).filter((f) => f.endsWith(".woff2")).sort();
const fb = fs.readdirSync(path.join(APP_ROOT, "fonts")).filter((f) => f.endsWith(".woff2")).sort();
checked += 1;
if (fa.join() !== fb.join()) problems.push(`fonts: different files (${fa.join(", ")} / ${fb.join(", ")})`);
else for (const f of fa) if (hash(path.join(REF, "fonts", f)) !== hash(path.join(APP_ROOT, "fonts", f))) problems.push(`fonts/${f} differs`);

for (const p of problems) console.log(`FAIL  ${p}`);
console.log(`${checked - problems.length}/${checked} parity checks passed against ${REF}.`);
if (!problems.length) console.log("PARITY OK");
process.exit(problems.length ? 1 : 0);
