// One-line, human-readable summaries of tool results for the agent console. Shared by the live
// tool executor and the simulation player so both read the same; every tool has its own line, so a
// live result is never reduced to "Result received".

export function summarizeToolResult(name, result) {
  if (!result) return "No result";
  if (result.error) return `Error: ${result.error}`;
  if (result.ok === false && Array.isArray(result.errors)) return `Rejected by the engine: ${result.errors[0]}`;
  switch (name) {
    case "ops_get_overview":
      return `Snapshot ${result.snapshot_time}: ${result.trains_in_window?.length || 0} trains in the next ${result.horizon_min} minutes, ${result.operational_changes_today?.length || 0} operational changes today, next publication run ${String(result.publication?.cycle || "").replace(/^.*next run /, "")}`;
    case "ops_list_changes": {
      const c = result.changes || [];
      if (!c.length) return result.note || "No operational change found";
      return `${c.length} change${c.length === 1 ? "" : "s"}: ${c.slice(0, 3).map((x) => `${x.id} ${x.kind} at ${x.time} (${x.trains.join(", ")})`).join("; ")}${c.length > 3 ? ` +${c.length - 3} more` : ""}`;
    }
    case "ops_get_timetable": {
      const rows = result.rows || [];
      const stops = rows.filter((r) => ["start", "stop", "end"].includes(r.activity)).length;
      const ops = rows.filter((r) => r.activity === "ops_stop").length;
      const passes = rows.filter((r) => r.activity === "pass").length;
      return `${result.number} source v${result.version}${result.version === result.current_version ? " (current)" : ` of ${result.current_version}`}: ${rows.length} operating points, ${stops} passenger stops, ${passes} passes${ops ? `, ${ops} operational stop${ops === 1 ? "" : "s"}` : ""}${result.consist?.order === "reversed" ? "; coach order reversed" : ""}`;
    }
    case "kfp_get_published": {
      const ch = result.channels || {};
      const parts = Object.entries(ch).map(([k, v]) => `${k} v${v.generated_from_version}`);
      const behind = Object.values(ch).filter((v) => v.generated_from_version < result.current_source_version).length;
      return `${result.number} as published: ${parts.join(", ")}; source is v${result.current_source_version}${behind ? ` (${behind} channel${behind === 1 ? "" : "s"} behind)` : ""}`;
    }
    case "phys_observe": {
      const o = result.observations || [];
      if (!o.length) return result.note || "No observation";
      return `${o.length} observation${o.length === 1 ? "" : "s"}: ${o.slice(0, 2).map((x) => `${x.id} ${x.kind.replace(/_/g, " ")} (${x.source.split(",")[0]})`).join("; ")}${result.position_now ? `; position: ${result.position_now}` : ""}`;
    }
    case "ops_get_passengers": {
      const s = result.stops || [];
      const board = s.reduce((a, x) => a + x.board, 0);
      const res = s.reduce((a, x) => a + x.reserved_board, 0);
      return `${result.number}: ${board} boarding across ${s.length} stops, ${res} with seat reservations${result.connections?.length ? `; ${result.connections.length} connection${result.connections.length === 1 ? "" : "s"} (${result.connections.map((c) => `${c.passengers} to ${c.to.split(" to ")[0]}`).join(", ")})` : ""}`;
    }
    case "ops_find_alternatives": {
      const j = result.journeys || [];
      if (!j.length) return result.note || "No journey found";
      const first = j[0];
      return `${result.from} → ${result.to} after ${result.after}: arrives ${first.arrival} via ${first.legs.map((l) => `${l.train} ${l.dep}`).join(", ")}${first.transfers ? ` (${first.transfers} change${first.transfers === 1 ? "" : "s"})` : ""}`;
    }
    case "sim_sync": {
      const b = result.baseline || {};
      const what = result.basis === "what_if" ? " (what-if, not the source)" : result.basis === "partial" ? " (first estimate)" : "";
      const first = b.first_event_min === null || b.first_event_min === undefined ? "nothing affected within the horizon" : `first affected in ${b.first_event_min} min (${b.first_event_label})`;
      // A contradiction is one wrong fact; it can show on several channels (one card each in the alignment view).
      const channels = new Set((result.contradictions || []).flatMap((c) => c.channels_wrong || [])).size;
      const on = channels ? ` on ${channels} channel${channels === 1 ? "" : "s"}` : "";
      return `${b.contradictions ?? 0} contradiction${b.contradictions === 1 ? "" : "s"}${on}${what}: ${b.misinformed_pax ?? 0} passengers would act on wrong information; ${first}${result.variants?.length ? `; ${result.variants.length} options costed` : ""}`;
    }
    default:
      if (typeof result.summary === "string") return result.summary;
      return "Result received";
  }
}
