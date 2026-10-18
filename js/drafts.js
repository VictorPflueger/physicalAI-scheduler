// Draft finalisation shared by both producers (live tools and the simulation player), so the safety
// lines can never differ between a live run and its replay: every draft carries the AI footer and
// its source reference, and each type says what it does not do. The lines are added in code, after
// any truncation, so no draft can lose them.

export const DRAFT_TYPES = ["passenger_message", "republish_order", "override_request", "staff_brief", "hold_request", "memo"];
export const DRAFT_FOOTER = "Prepared with the Timetable Translator AI assistant. Requires human approval before publishing.";
export const MOCK_LINES = {
  passenger_message: "Mock publication for demonstration; no passenger information system is connected.",
  republish_order: "Mock order for demonstration; no timetable system is connected. The customer timetable is regenerated from the source, never edited by hand.",
  override_request: "Manual override: a second, hand-kept value. It must be removed as soon as the source is re-published. Mock request; no display system is connected.",
  hold_request: "Request only: dispatch decides, and nothing changes until dispatch acts. Mock request; no dispatch system is connected."
};
export const MAX_BODY = 5600;

export const DRAFT_LABEL = {
  passenger_message: "Passenger message",
  republish_order: "Re-publication order",
  override_request: "Override request",
  staff_brief: "Staff briefing",
  hold_request: "Hold request",
  memo: "Internal memo"
};

/**
 * The body as it goes into the Outbox: trimmed, with the source reference, the type's mock line
 * and the AI footer. `source` is a short text such as "ICE 618: source version 2 (OPS-05), 07:28".
 */
export function finalizeDraft(type, body, source = "") {
  let out = String(body || "").trim().slice(0, MAX_BODY);
  if (source && !/Source reference:/i.test(out)) out = `${out}\n\nSource reference: ${source}`;
  const mock = MOCK_LINES[type];
  if (mock && !out.includes(mock.split(";")[0])) out = `${out}\n\n${mock}`;
  if (!out.includes("Requires human approval before publishing")) out = `${out}\n\n${DRAFT_FOOTER}`;
  return out;
}

/** "ICE 618: source v2 (OPS-05); ICE 1022: source v2 (OPS-03); checked against the source at 07:28". */
export function sourceReference(res) {
  if (!res?.trains?.length) return "";
  const parts = res.trains.map((t) => {
    const changes = (res.contradictions || []).find((c) => c.train_id === t.train_id)?.source_changes || [];
    return `${t.number}: source v${t.source_version}${changes.length ? ` (${changes.join(", ")})` : ""}`;
  });
  return `${parts.join("; ")}; every fact checked against the source at ${res.now_label || res.snapshot_time || ""}`.trim();
}
