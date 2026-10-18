// Publication check: GitHub's main branch holds exactly the local HEAD, and nothing is left
// uncommitted, so the site GitHub Pages serves is the code the tests ran on.
// Usage: node tests/remote_head.mjs
import { execFileSync } from "node:child_process";
import { APP_ROOT } from "./lib/harness.mjs";

const git = (...args) => execFileSync("git", args, { cwd: APP_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const problems = [];
let head = "";
let remote = "";
try { head = git("rev-parse", "HEAD"); } catch { problems.push("no local commit"); }
try { remote = (git("ls-remote", "origin", "refs/heads/main").split(/\s+/)[0] || ""); } catch (e) { problems.push(`origin cannot be read (${String(e.message).split("\n")[0]})`); }
const dirty = git("status", "--porcelain");
if (head && remote && head !== remote) problems.push(`origin/main is ${remote.slice(0, 12) || "missing"}, local HEAD is ${head.slice(0, 12)}`);
if (head && !remote) problems.push("origin has no main branch");
if (dirty) problems.push(`uncommitted changes:\n${dirty}`);
for (const p of problems) console.log(`FAIL  ${p}`);
console.log(`local HEAD ${head.slice(0, 12) || "none"}, origin/main ${remote.slice(0, 12) || "none"}`);
if (!problems.length) console.log("REMOTE OK");
process.exit(problems.length ? 1 : 0);
