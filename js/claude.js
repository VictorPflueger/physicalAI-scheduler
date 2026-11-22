// The shell's key functions (js/shell.js imports them from here, as in Navigator) on the Timetable
// Translator's own key store and client: the key stays in this tab's session storage under the app's
// own name (js/keystore.js) and goes only to api.anthropic.com (js/anthropic.js), where the live agent
// reads it. checkKey makes the free check, which uses no tokens, and says in a sentence what went wrong.

import { checkKey as probe } from "./anthropic.js";
export { getKey, setKey, forgetKey, looksLikeKey, maskKey } from "./keystore.js";

/** Resolves { ok: true } or { ok: false, error: a sentence for the visitor }. */
export async function checkKey(key) {
  const r = await probe(key);
  if (r.ok) return { ok: true };
  if (r.status === 0) return { ok: false, error: `Could not reach api.anthropic.com to check the key: ${r.error?.message || "the network or a firewall blocks it"}` };
  if (r.status === 401) return { ok: false, error: "Anthropic rejected this key (401). Check that it is active and copied completely." };
  const msg = r.error?.message || r.error?.type || "no reason given";
  if (/workspace/i.test(msg)) return { ok: false, error: `Anthropic answered ${r.status}: ${msg} Use a key scoped to a single workspace.` };
  return { ok: false, error: `Anthropic answered ${r.status}: ${msg}` };
}
