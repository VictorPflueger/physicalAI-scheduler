// Repository hygiene for a public prototype: no file the repository would publish names the
// prospective client, the contact or the meeting the prototype was drafted for, or points to the
// client's own data services (a private term list), and no file carries an e-mail address.
// The private term list never enters the repository, in any form. It is read from, in order:
//   HYGIENE_TERMS        environment variable (a CI secret), one entry per line
//   HYGIENE_TERMS_FILE   environment variable naming a file
//   ../.hygiene-terms    a file next to the repository folder
// One entry per line: "term<TAB>what it is" (matched case-insensitively as a whole word or phrase)
// or "/regex/flags<TAB>what it is"; lines starting with # are comments. Without a list only the
// generic checks run, and the result says so ("HYGIENE GENERIC OK" instead of "HYGIENE OK").
// Checks every file git would publish: tracked files and untracked files that are not ignored.
// Usage: node tests/hygiene.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

function privateList() {
  if (process.env.HYGIENE_TERMS) return { text: process.env.HYGIENE_TERMS, from: "HYGIENE_TERMS" };
  const file = process.env.HYGIENE_TERMS_FILE || path.join(APP_ROOT, "..", ".hygiene-terms");
  if (fs.existsSync(file)) return { text: fs.readFileSync(file, "utf8"), from: file };
  return null;
}
const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const list = privateList();
const TERMS = (list ? list.text.split(/\r?\n/) : [])
  .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const [term, what = "a private term"] = l.split("\t");
    const m = term.match(/^\/(.+)\/([a-z]*)$/);
    return { re: m ? new RegExp(m[1], m[2].replace("g", "")) : new RegExp(`(^|[^\\p{L}])${escape(term)}(?![\\p{L}])`, "iu"), what };
  });
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g; // not "playwright@1.56.0"
const ALLOWED_EMAIL = new Set([]);
const BINARY = /\.(woff2|png|jpe?g|gif|ico|pdf)$/i;

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: APP_ROOT, encoding: "utf8" })
  .split("\n").filter(Boolean).filter((f) => !BINARY.test(f) && fs.existsSync(path.join(APP_ROOT, f)));

const problems = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(APP_ROOT, f), "utf8");
  const lines = text.split("\n");
  for (const { re, what } of TERMS) {
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) problems.push(`${f}:${i + 1} names ${what}`);
  }
  for (const m of text.matchAll(EMAIL)) {
    if (ALLOWED_EMAIL.has(m[0].toLowerCase())) continue;
    const line = text.slice(0, m.index).split("\n").length;
    problems.push(`${f}:${line} carries an e-mail address`);
  }
}

for (const p of problems) console.log(`FAIL  ${p}`);
console.log(`${files.length} files checked against ${list ? `${TERMS.length} private terms (${list.from === "HYGIENE_TERMS" ? "from HYGIENE_TERMS" : "from a file outside the repository"}) and` : "no private term list, only"} the generic checks: ${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
if (!problems.length) console.log(list && TERMS.length ? "HYGIENE OK" : "HYGIENE GENERIC OK");
process.exit(problems.length ? 1 : 0);
