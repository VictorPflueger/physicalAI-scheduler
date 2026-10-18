// Self-tests run from the presenter's browser: the one external service (the Anthropic API), the
// integrity of the operating snapshot (world, scenarios, reference cases, simulation scripts), and
// the key and privacy rules. The live agent reads no open data and has no web search, so there is
// nothing else to reach and no fallback to remember.

import { ANTHROPIC, OPEN_DATA, APP, STORAGE } from "./config.js";
import { checkKey, probeEndpoint } from "./anthropic.js";
import { getKey, redactSecrets } from "./keystore.js";
import { checkWorld } from "./world_check.js";
import { buildAuditExport } from "./audit.js";

export const TESTS = [
  { id: "anthropic", label: "Anthropic API", host: "api.anthropic.com", purpose: "Live agent (Claude)" },
  { id: "world", label: "World data integrity", host: "local", purpose: "Operating snapshot, scenarios, reference cases, simulation scripts" },
  { id: "privacy", label: "Key and privacy", host: "local", purpose: "Key kept in this tab only, under this app's own name, never exported; connections limited by the page's security policy" }
];

// The only hosts the page may connect to (the CSP meta tag in index.html must match).
const ALLOWED_CONNECT = [new URL(ANTHROPIC.messagesUrl).origin, ...Object.values(OPEN_DATA).map((d) => d.origin)];
const KEY_LIKE = /sk-ant-(?!\[REDACTED\])[A-Za-z0-9_-]{8,}/;

// Results of this session, for the dialog ("earlier this session").
const results = {};
export function memory() {
  return { ...results };
}

const RUNNERS = {
  async anthropic() {
    const key = getKey();
    if (!key) {
      const r = await probeEndpoint();
      return { status: r.ok ? "pass" : "fail", ms: r.ms, detail: r.ok ? `${r.detail} Add your key in Live mode to check it.` : r.detail };
    }
    const r = await checkKey(key);
    if (!r.ok) {
      const msg = r.status === 401 ? "Key rejected (401). Check that it is active and copied completely." : `${r.error?.type || "error"}: ${r.error?.message || ""}`;
      return { status: "fail", ms: r.ms, detail: msg };
    }
    const missing = r.missing.length ? ` Missing for this key: ${r.missing.join(", ")}.` : ` All three ${APP.name} models are available.`;
    return { status: r.missing.length ? "warn" : "pass", ms: r.ms, detail: `Key valid (free check, no tokens used).${missing}` };
  },
  async privacy() {
    const issues = [];
    const notes = [];
    // 1. The browser enforces where the page may connect.
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") || "";
    const connect = (/connect-src([^;]*)/.exec(csp)?.[1] || "").trim().split(/\s+/).filter(Boolean);
    const extra = connect.filter((x) => !ALLOWED_CONNECT.includes(x));
    const missing = ALLOWED_CONNECT.filter((x) => !connect.includes(x));
    if (!csp || !connect.length) issues.push("no connection policy found");
    else if (extra.length) issues.push(`the policy also allows ${extra.join(", ")}`);
    else notes.push(`connections limited to ${connect.length === 1 ? connect[0] : `${connect.length} hosts`}${missing.length ? ` (not allowed: ${missing.join(", ")})` : ""}`);
    // 2. The key lives in this tab's session storage only, under this app's own name.
    let inLocal = false;
    let foreign = 0;
    try { for (let i = 0; i < localStorage.length; i++) if (KEY_LIKE.test(localStorage.getItem(localStorage.key(i)) || "")) inLocal = true; } catch { /* storage unavailable */ }
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k !== STORAGE.apiKey && KEY_LIKE.test(sessionStorage.getItem(k) || "")) foreign += 1;
      }
    } catch { /* storage unavailable */ }
    if (inLocal) issues.push("an API key was found in local storage");
    notes.push(getKey() ? `your key is stored for this tab only (${STORAGE.apiKey})` : "no key stored");
    if (foreign) notes.push(`another app on this site address keeps ${foreign} key${foreign === 1 ? "" : "s"} in this tab under its own name`);
    // 3. Nothing exported can carry the key.
    const sample = getKey() || "sk-ant-EXAMPLE-not-a-real-key-0000";
    if (redactSecrets(`x ${sample} y`).includes(sample)) issues.push("key redaction failed");
    if (KEY_LIKE.test(buildAuditExport())) issues.push("the audit export contains a key");
    else notes.push("audit export checked");
    const text = issues.length ? `${issues.join("; ")}.` : `${notes.join("; ")}.`;
    return { status: issues.length ? "fail" : "pass", ms: null, detail: text.charAt(0).toUpperCase() + text.slice(1) };
  },
  async world() {
    const started = performance.now();
    const res = checkWorld(globalThis.WORLD, globalThis.SCENARIOS || [], globalThis.REFERENCE_CASES || {}, globalThis.SIM_RUNS || {});
    const passed = res.checks.filter((c) => c.ok).length;
    return { status: res.ok ? "pass" : "fail", ms: Math.round(performance.now() - started), detail: `${passed}/${res.checks.length} integrity checks passed.`, checks: res.checks };
  }
};

/** Run one test; the result is remembered for this session. */
export async function runTest(id) {
  const fn = RUNNERS[id];
  if (!fn) return { status: "skip", detail: "Unknown test." };
  const r = await fn();
  if (id === "anthropic") results[id] = { status: r.status, detail: r.detail };
  return r;
}

/** Run all tests in parallel, reporting each result as it arrives. */
export async function runAll(onResult) {
  const out = {};
  await Promise.all(TESTS.map(async (t) => {
    onResult?.(t.id, { status: "running" });
    const r = await runTest(t.id);
    out[t.id] = r;
    onResult?.(t.id, r);
  }));
  return out;
}
