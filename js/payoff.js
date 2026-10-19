// Shared shaping of options and of what an approved decision changes on screen. The live tools and
// the simulation player both use these helpers, so an option card, the KPI tiles and the mirror look
// exactly the same whichever producer is running.

/** Figures of one engine variant as shown on an option card (all values come from the engine). */
export function optionFigures(v) {
  return {
    misinformed_pax: v.misinformed_pax,
    protected_pax: v.protected_pax,
    correct_info_from_min: v.correct_info_from_min,
    time_to_sync_min: v.time_to_sync_min,
    residual_contradictions: v.residual_contradictions,
    manual_overrides: v.manual_overrides,
    effort_min: v.effort_min,
    held_pax: v.held_pax || 0,
    hold: v.hold || null,
    action_types: v.action_types || []
  };
}

/** The do-nothing baseline as shown on its card. */
export function baselineFigures(res, description = "") {
  const b = res.baseline;
  return {
    misinformed_pax: b.misinformed_pax,
    affected_pax: b.affected_pax,
    contradictions: b.contradictions,
    first_event_min: b.first_event_min,
    first_event_label: b.first_event_label,
    first_event_short: b.first_event_short,
    time_to_sync_min: b.time_to_sync_min,
    next_cycle_label: b.next_cycle_label,
    next_cycle_note: b.next_cycle_note || "",
    contradiction_ids: (res.contradictions || []).map((c) => c.id),
    description: String(description || "").slice(0, 300)
  };
}

/** The KPI update after a sync calculation (first estimate, verified figure, partial or what-if). */
export function kpiFromResult(res, label) {
  const b = res.baseline;
  return {
    pax_at_risk: b.misinformed_pax,
    affected_pax: b.affected_pax,
    horizon_min: res.horizon_min,
    first_event_min: b.first_event_min,
    first_event_label: b.first_event_label,
    first_event_short: b.first_event_short,
    basis: res.basis,
    stage: res.basis !== "source" || /first estimate/.test(String(label)) ? "estimate" : "verified",
    label: res.basis === "what_if" ? "what-if, not the source" : res.basis === "partial" ? "first estimate" : label
  };
}

/**
 * Events that follow an approval: the KPI tiles show who is still misinformed, and the mirror
 * follows the decision. An option that re-publishes from the source turns its contradictions
 * resolved (approved, not yet published: nothing is connected); an option that only informs
 * (messages, overrides) leaves the data contradictions open, so they turn amber; accepting the risk
 * changes nothing on the mirror. Returns a list of [type, payload] pairs for the bus.
 */
export function decisionEffects(optionsPayload, optionId) {
  if (!optionsPayload) return [];
  const base = optionsPayload.baseline || {};
  if (optionId === "baseline") {
    return [["kpi_update", { decided: true, accepted: true, option_label: "Do nothing", before_pax: base.misinformed_pax }]];
  }
  const opt = (optionsPayload.options || []).find((o) => o.id === optionId);
  if (!opt) return [];
  const out = [["kpi_update", {
    decided: true,
    option_label: `option ${opt.letter}`,
    residual_pax: opt.misinformed_pax,
    before_pax: base.misinformed_pax,
    correct_from_min: opt.correct_info_from_min,
    sync_min: opt.time_to_sync_min
  }]];
  const ids = base.contradiction_ids || [];
  const trains = optionsPayload.train_ids || [];
  const synced = !(opt.residual_contradictions > 0);
  const decision = { source: "decision", option_id: optionId, republish: (opt.action_types || []).includes("republish") };
  if (ids.length || trains.length) {
    out.push(["mirror_update", { contradiction_ids: ids, train_ids: trains, state: synced ? "resolved" : "at_risk", ...decision }]);
  }
  return out;
}
