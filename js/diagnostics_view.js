// Diagnostics dialog: self-tests the one external service from this browser and shows the operating
// snapshot's integrity checks and the key and privacy rules.

import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { TESTS, runAll, runTest, memory } from "./diagnostics.js";
import { APP } from "./config.js";

const STATUS_TEXT = { pass: "Pass", fail: "Fail", warn: "Check", skip: "Skipped", running: "Testing", idle: "Not run" };
const STATUS_ICON = { pass: "check", fail: "x", warn: "alert", skip: "info", idle: "info" };
// Each status is a Vici tag in its tone, with its icon and its word; skipped and not run are plain.
const STATUS_TAG = { pass: "vc-tag--success", fail: "vc-tag--danger", warn: "vc-tag--warning", running: "vc-tag--info", skip: "", idle: "" };

export function openDiagnostics() {
  const rows = new Map();
  const remembered = memory();
  const tbody = h("tbody");
  for (const t of TESTS) {
    const statusCell = h("td", { class: "status" });
    const msCell = h("td", { class: "ms vc-tabular" }, "");
    const detailCell = h("td", { class: "detail" }, t.purpose);
    tbody.appendChild(h("tr", {},
      h("td", {}, h("strong", {}, t.label), h("span", { class: "host" }, t.host)),
      statusCell, msCell, detailCell));
    rows.set(t.id, { statusCell, msCell, detailCell });
    const prev = remembered[t.id];
    setRow(t.id, prev ? { status: prev.status, detail: `${prev.detail} (earlier this session)` } : { status: "idle" });
  }

  const worldList = h("ul", { class: "world-checks" });

  function setRow(id, r) {
    const row = rows.get(id);
    if (!row) return;
    const s = r.status || "idle";
    clear(row.statusCell).appendChild(h("span", { class: ["vc-tag", STATUS_TAG[s] || "", "diag-status"], dataset: { s } },
      s === "running" ? h("span", { class: "vc-spinner vc-spinner--sm", "aria-hidden": "true" }) : icon(STATUS_ICON[s] || "info", 16), STATUS_TEXT[s] || s));
    row.msCell.textContent = r.ms ? `${r.ms} ms` : "";
    if (r.detail) row.detailCell.textContent = r.detail;
    if (id === "world" && r.checks) {
      clear(worldList);
      for (const c of r.checks) {
        worldList.appendChild(h("li", { dataset: { ok: String(!!c.ok) } }, h("span", { class: ["world-mark", c.ok ? "pass" : "fail"] }, icon(c.ok ? "check" : "x", 16)), h("span", {}, `${c.name}${c.detail ? ` — ${c.detail}` : ""}`)));
      }
    }
  }

  const runBtn = h("button", { class: "vc-button", type: "button", autofocus: true }, icon("pulse", 18), "Run all tests");
  runBtn.addEventListener("click", async () => {
    if (runBtn.getAttribute("aria-disabled") === "true") return;
    runBtn.setAttribute("aria-disabled", "true");
    await runAll(setRow);
    runBtn.setAttribute("aria-disabled", "false");
  });

  const modal = openModal({
    title: "Diagnostics",
    intro: "Tests the one external service the app uses (the Anthropic API, for the live agent) from this browser, and checks the operating snapshot locally. The live agent reads no open data and has no web search: the world model and its physical layer are its only sources.",
    size: "wide",
    body: [
      h("div", { class: "vc-table-wrap diag-wrap" },
        h("table", { class: "vc-table diag-table" },
          h("thead", {}, h("tr", {}, h("th", {}, "Service"), h("th", {}, "Status"), h("th", {}, "Time"), h("th", {}, "Details"))),
          tbody)),
      h("div", { class: "diag-section" },
        h("h3", {}, "World data integrity"),
        h("p", {}, "Checks run locally on the operating snapshot: every trip on the network and forwards in time, every operational change corroborated by the physical layer, the customer projection, scenario coverage and honest sweep negatives, the reference cases and the simulation scripts."),
        worldList)
    ],
    footer: [
      h("span", { class: "dialog-note" }, `${APP.name} ${APP.version}. Run this on the presentation laptop and network before going on stage.`),
      runBtn
    ]
  });

  // Integrity check is local and instant: show it straight away.
  runTest("world").then((r) => setRow("world", r));
  runTest("privacy").then((r) => setRow("privacy", r));
  return modal;
}
