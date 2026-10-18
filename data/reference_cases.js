/*
 * TIMETABLE TRANSLATOR — reference cases for the six preset scenarios.
 *
 * A reference case is the sync position and the response options a representative agent run
 * would arrive at AFTER verification. It serves two purposes:
 *   1. the scripted Simulation mode computes every passenger figure and every minute from these
 *      specs with the same deterministic engine the live agent uses (js/sync.js): figures are never
 *      typed in;
 *   2. the integrity check (js/world_check.js) runs them to prove each scenario bites.
 * The live agent never sees this file: it must derive its own scope and options from evidence.
 *
 * `hypothesis` is the first, narrower estimate shown before the visible self-correction in a
 * simulated run (a partial scope: one train, one channel or one stop). `finding` is the verified
 * position from the source with exactly three variants.
 */
window.REFERENCE_CASES = {
  "SC-PLATFORM": {
    hypothesis: {
      label: "First estimate from the radio message: the journey planner and app at Köln Hbf only",
      train_ids: ["T-618"], channels: ["planner"]
    },
    finding: {
      label: "ICE 618 from the source: platform and coach sectors at Köln Hbf, every channel",
      train_ids: ["T-618"],
      variants: [
        { variant_id: "V1", name: "Re-publish ICE 618 from the source and announce the platform", actions: [
          { type: "republish" },
          { type: "message", channels: ["app_push", "displays", "announcements"] }
        ] },
        { variant_id: "V2", name: "Messages and platform staff, re-publish later", actions: [
          { type: "message", channels: ["app_push", "displays", "announcements"] },
          { type: "staff" }
        ] },
        { variant_id: "V3", name: "Override displays and announcements by hand", actions: [
          { type: "override" },
          { type: "message", channels: ["app_push"] }
        ] }
      ]
    }
  },

  "SC-DIVERSION": {
    hypothesis: {
      label: "First estimate from the chat: ICE 1022 only",
      train_ids: ["T-1022"]
    },
    finding: {
      label: "ICE 1022 and ICE 1026 from the source: both diverted, Hagen and Wuppertal not served",
      train_ids: ["T-1022", "T-1026"],
      variants: [
        { variant_id: "V1", name: "Release and re-publish both trains, message with alternatives", actions: [
          { type: "republish" },
          { type: "message", channels: ["app_push", "displays", "announcements", "planner"] },
          { type: "staff" }
        ] },
        { variant_id: "V2", name: "Messages everywhere, data stays as it is", actions: [
          { type: "message", channels: ["app_push", "displays", "announcements", "planner"] },
          { type: "staff" }
        ] },
        { variant_id: "V3", name: "Override the stations' displays and announcements", actions: [
          { type: "override" },
          { type: "message", channels: ["app_push"] }
        ] }
      ]
    }
  },

  "SC-OPSSTOP": {
    hypothesis: {
      label: "First estimate from the complaint: the journey planner and app only",
      train_ids: ["T-1027"], channels: ["planner"]
    },
    finding: {
      label: "ICE 1027 from the source: Köln-Mülheim is a Betriebshalt in every channel",
      train_ids: ["T-1027"],
      variants: [
        { variant_id: "V1", name: "Re-publish ICE 1027 and tell booked passengers", actions: [
          { type: "republish" },
          { type: "message", channels: ["app_push", "displays", "announcements"] }
        ] },
        { variant_id: "V2", name: "Remove the stop from the displays by hand", actions: [
          { type: "override" },
          { type: "message", channels: ["app_push"] }
        ] },
        { variant_id: "V3", name: "Announce it, leave the data", actions: [
          { type: "message", channels: ["app_push", "displays", "announcements"] },
          { type: "staff" }
        ] }
      ]
    }
  },

  "SC-TERMINUS": {
    hypothesis: {
      label: "First estimate from the station note: the journey planner and app only",
      train_ids: ["T-1025"], channels: ["planner"]
    },
    finding: {
      label: "ICE 1025 from the source: ends at Köln Messe/Deutz; planner and on-board announcements still say Köln Hbf",
      train_ids: ["T-1025"],
      variants: [
        { variant_id: "V1", name: "Re-publish ICE 1025 and tell the passengers on board", actions: [
          { type: "republish" },
          { type: "message", channels: ["app_push", "announcements"] }
        ] },
        { variant_id: "V2", name: "Crew announcement and app push, planner at 08:00", actions: [
          { type: "message", channels: ["app_push"] },
          { type: "staff" }
        ] },
        { variant_id: "V3", name: "Override the on-board announcements", actions: [
          { type: "override", channels: ["announcements"] },
          { type: "message", channels: ["app_push"] }
        ] }
      ]
    }
  },

  "SC-COACH": {
    hypothesis: {
      label: "First estimate from the train manager: reservations boarding at Köln Hbf",
      train_ids: ["T-516"], stops: ["KK"]
    },
    finding: {
      label: "ICE 516 from the source: reversed coach order at every boarding stop",
      train_ids: ["T-516"],
      variants: [
        { variant_id: "V1", name: "Refresh the coach order from the source and announce it", actions: [
          { type: "republish", channels: ["coach"] },
          { type: "message", channels: ["app_push", "announcements"] }
        ] },
        { variant_id: "V2", name: "Announcements, app push and platform staff", actions: [
          { type: "message", channels: ["app_push", "announcements"] },
          { type: "staff" }
        ] },
        { variant_id: "V3", name: "Platform announcements only", actions: [
          { type: "message", channels: ["announcements"] }
        ] }
      ]
    }
  },

  "SC-FPLO": {
    hypothesis: {
      label: "First estimate from the construction office: ICE 612 only",
      train_ids: ["T-612"]
    },
    finding: {
      label: "ICE 612 and RE 10109 from the source: +4 minutes into Dortmund, the RE 57 connection lost",
      train_ids: ["T-612", "T-10109"],
      variants: [
        { variant_id: "V1", name: "Re-publish both trains and ask dispatch to hold RE 57", actions: [
          { type: "republish" },
          { type: "hold_request", connection_id: "CX-01" },
          { type: "message", channels: ["app_push", "announcements"] }
        ] },
        { variant_id: "V2", name: "Re-publish both trains, announce the lost connection", actions: [
          { type: "republish" },
          { type: "message", channels: ["app_push", "announcements"] }
        ] },
        { variant_id: "V3", name: "Messages only, data at tomorrow's run", actions: [
          { type: "message", channels: ["app_push", "announcements", "planner"] }
        ] }
      ]
    }
  }
};
