// Repository hygiene for a public prototype: no file the repository would publish names the
// prospective client, the contact or the meeting the prototype was drafted for, points to the
// client's own data services, or carries a personal e-mail address. The terms are stored encoded,
// so this check does not publish them itself.
// Checks every file git would publish: tracked files and untracked files that are not ignored.
// Usage: node tests/hygiene.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

const decode = (b) => Buffer.from(b, "base64").toString("utf8");
// [encoded term, what it is]; matched case-insensitively as a whole word or phrase.
const TERMS = [
  ["RGV1dHNjaGUgQmFobg==", "the client's name"],
  ["REIgSW5mcmFHTw==", "a client company"], ["REIgTmV0eg==", "a client company"], ["REIgU3RhdGlvbg==", "a client company"],
  ["REIgRmVybnZlcmtlaHI=", "a client company"], ["REIgUmVnaW8=", "a client company"],
  ["Um9sYW5k", "the contact's name"],
  ["UmVpc2VuZGVuaW5mb3JtYXRpb24=", "the client's department"],
  ["VGVjaC1TaG93Y2FzZQ==", "the meeting"],
  ["YmFobmhvZi5kZQ==", "a client data service"], ["YmFobi5kZQ==", "a client data service"],
  ["ZGJpbmZyYWdv", "a client data service"], ["ZGItc3RhdGlvbnM=", "a client data package"]
].map(([b, what]) => ({ term: decode(b), what }));
// The client's short name on its own (two capitals), as a word.
const SHORT = new RegExp(`\\b${decode("REI=")}\\b`);
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g; // not "playwright@1.56.0"
const ALLOWED_EMAIL = new Set([]);
const BINARY = /\.(woff2|png|jpe?g|gif|ico|pdf)$/i;

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: APP_ROOT, encoding: "utf8" })
  .split("\n").filter(Boolean).filter((f) => !BINARY.test(f) && fs.existsSync(path.join(APP_ROOT, f)));

const problems = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(APP_ROOT, f), "utf8");
  const lines = text.split("\n");
  for (const { term, what } of TERMS) {
    const re = new RegExp(`(^|[^\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "iu");
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) problems.push(`${f}:${i + 1} names ${what}`);
  }
  const s = lines.findIndex((l) => SHORT.test(l));
  if (s >= 0) problems.push(`${f}:${s + 1} names the client by its short name`);
  for (const m of text.matchAll(EMAIL)) {
    if (ALLOWED_EMAIL.has(m[0].toLowerCase())) continue;
    const line = text.slice(0, m.index).split("\n").length;
    problems.push(`${f}:${line} carries an e-mail address`);
  }
}

for (const p of problems) console.log(`FAIL  ${p}`);
console.log(`${files.length} files checked, ${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
if (!problems.length) console.log("HYGIENE OK");
process.exit(problems.length ? 1 : 0);
