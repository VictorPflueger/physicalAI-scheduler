/*
 * TIMETABLE TRANSLATOR — simulation scripts (Simulation mode).
 *
 * One script per preset scenario (seven). Each mirrors what the live agent does: the same tools in the same
 * order, a hypothesis that is checked against the source, the published channels and the physical
 * layer, a visible "Revised:" self-correction, exactly three costed responses plus the do-nothing
 * baseline, drafts that wait for approval, and a management summary.
 *
 * Integrity rules for authors (checked by js/sim_check.js in Diagnostics and tools/check_world.mjs):
 *   - World-model lookups (ops_*, kfp_*, phys_*) are re-run at playback by the real queries (js/ops.js).
 *   - Every passenger figure and every minute the engine computes comes from the sync engine via
 *     {{placeholders}} (js/sim_vars.js). A timetable fact (a time, a platform, minutes, a number of
 *     passengers) may be typed only if a tool returned it earlier in the script.
 *   - The player adds the source reference, the mock line and the AI footer to every draft, as live
 *     mode does. Passenger messages are written in German first, then English.
 *   - Reports end with the simulation marker; nothing here may present itself as a live run.
 *
 * A completed live run can replace a script: "Save run as simulation" in the Audit tab exports it
 * in this format (source: "recorded"), to be appended to the end of this file.
 */
window.SIM_RUNS = {
  "SC-PLATFORM": {
    title: "Short-notice platform change at Köln Hbf",
    // The scenario of the five-minute pitch: eight short paragraphs before the decision, each a step the
    // audience can follow on the alignment view (source, channels, sensors, impact).
    steps: [
      { state: "scanning" },
      { say: "Lead: platform staff at Köln Hbf say ICE 618 to Hamburg leaves from another platform today, but the app shows the old one. A radio message is not a source, so I read the operations log first." },
      { mirror: { train_ids: ["T-618"], state: "at_risk", focus: "T-618" } },
      { tool: "ops_list_changes", input: { train: "ICE 618" } },
      { say: "Finding: the signaller moved ICE 618 to platform 7 at 07:21 (OPS-05, points failure). That is the source now." },
      { tool: "kfp_get_published", input: { train: "ICE 618", channel: "planner" } },
      { say: "Hypothesis: only the app is behind and still shows platform 5, not platform 7. The station displays would then put most passengers right." },

      { state: "verifying" },
      { sync: "hypothesis" },
      { say: "First estimate, from the journey planner alone: {{hyp.pax}} passengers would go to the wrong platform. Before I rely on that, I read every channel and the sensors." },

      { tool: "kfp_get_published", input: { train: "ICE 618" } },
      { tool: "ops_get_timetable", input: { train: "ICE 618" } },
      { tool: "phys_observe", input: { point: "KK" } },
      { say: "Revised: not only the app is behind. The displays, the announcements and the coach order were generated at 05:30 too: every channel says platform 5, not platform 7." },
      { say: "Confirmed: the sensors agree with the source, not with the channels. The interlocking has stored the route out of platform 7 for train 618." },
      { alert: {
        title: "ICE 618: every channel shows platform 5, the train leaves from platform 7",
        severity: "critical",
        basis: "verified",
        summary: "The source moved ICE 618 to platform 7 at 07:21 (OPS-05, points failure W 32), and the interlocking has stored the route out of platform 7. The app, the station displays, the announcements and the coach-position displays still show platform 5, generated at 05:30.",
        train_ids: ["T-618"],
        point_ids: ["KK"],
        sources: [
          { title: "Operations log OPS-05: signaller Köln Hbf, platform change (synthetic)" },
          { title: "Point diagnostics and route store, ESTW Köln Hbf (synthetic)" },
          { title: "Published customer timetable, all channels (synthetic)" }
        ]
      } },

      { state: "simulating" },
      { tool: "ops_get_passengers", input: { train: "ICE 618" } },
      { sync: "finding" },
      { say: "Impact: {{pax}} passengers would act on wrong information, the first in {{first_min}} minutes. On platform 7 first class stops in sector {{T-618.KK.coach_order.first_src}}, not {{T-618.KK.coach_order.first_pub}}. No publication cycle fixes this by itself." },
      { mirror: { train_ids: ["T-618"], point_ids: ["KK"], state: "affected" } },

      { options: {
        recommended: "V1",
        baseline_description: "Every channel keeps platform 5, not platform 7; {{pax}} passengers act on it.",
        texts: {
          V1: {
            title: "Re-publish from the source",
            description: "Every channel re-published from the source, plus a passenger message.",
            residual_risk: "Some already head for the old platform."
          },
          V2: {
            title: "Messages and staff only",
            description: "Messages on every channel and staff on the platform; the data stays wrong.",
            residual_risk: "The data stays wrong; messages miss some passengers."
          },
          V3: {
            title: "Override by hand",
            description: "Platform 7 set by hand on displays and announcements, plus an app message.",
            residual_risk: "The coach order stays wrong for reservation holders."
          }
        }
      } },
      { say: "Recommendation: option A. It re-publishes from the source: {{V1.mis}} instead of {{pax}} passengers misinformed, every channel aligned after {{V1.sync}} minutes, nothing kept by hand." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. B informs passengers without touching the data; C sets the platform by hand.",
          V2: "Option B rejected. A re-publishes from the source; C overrides the displays and announcements by hand.",
          V3: "Option C rejected. A re-publishes from the source; B informs without touching the data."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. I draft the passenger message and the re-publication order." },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Köln Hbf",
              subject: "ICE 618 to Hamburg-Altona, 07:42: today from platform 7",
              body: "App-Push (DE): ICE 618 nach Hamburg-Altona, Abfahrt 07:42 Uhr, fährt heute von Gleis 7 (nicht Gleis 5). Die 1. Klasse hält in Abschnitt {{T-618.KK.coach_order.first_src}}.\nApp push (EN): ICE 618 to Hamburg-Altona, departing 07:42, leaves from platform 7 today (not platform 5). First class stops in sector {{T-618.KK.coach_order.first_src}}.\n\nAnzeiger Köln Hbf (DE): ICE 618 Hamburg-Altona 07:42 – heute Gleis 7\nDisplay Köln Hbf (EN): ICE 618 Hamburg-Altona 07:42 – today platform 7\n\nAnsage (DE): Achtung an Gleis 5: ICE 618 nach Hamburg-Altona, Abfahrt 07:42 Uhr, fährt heute von Gleis 7. Die Wagen der 1. Klasse halten in Abschnitt {{T-618.KK.coach_order.first_src}}.\nAnnouncement (EN): Attention, platform 5: ICE 618 to Hamburg-Altona, departing 07:42, leaves from platform 7 today. First class stops in sector {{T-618.KK.coach_order.first_src}}."
            } },
            { draft: {
              type: "republish_order", recipient: "Timetable publication team",
              subject: "Release ICE 618 from the source to every channel now",
              body: "Please release ICE 618, source version 2 (OPS-05: platform 7, not platform 5, from 07:21), to every customer channel: journey planner and app, station displays, announcements, coach order.\n\nNo value is typed by hand. Every channel is expected to be aligned after {{V1.sync}} minutes."
            } },
            { awaitActions: true },
            { report: "## ICE 618: platform change at Köln Hbf\n\n**What we found.** The source moved ICE 618 (07:42 to Hamburg-Altona) from platform 5 to platform 7 at 07:21 (OPS-05, points failure W 32); the interlocking has stored the route out of platform 7. Every customer channel was generated at 05:30 and still shows platform 5, and the coach-position displays still show first class in {{T-618.KK.coach_order.first_pub}} instead of sector {{T-618.KK.coach_order.first_src}}. The short-notice rule held the change back.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes, and no publication cycle fixes it.\n\n**Decision.** Option A approved: re-publication of ICE 618 from the source, with a message on the app, the displays and the announcements.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V1.mis}} |\n| Right information from | – | +{{V1.from}} min |\n| Every channel aligned with the source | never | after {{V1.sync}} min |\n| Values kept by hand | – | {{V1.ov}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** Passengers already heading for platform 5 depend on the announcement.\n\n**How we know.** The platform change from the operations log and the source timetable; the old platform from every published channel; the points failure and the stored route from the physical layer; passenger figures from today's counts; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. I draft the passenger message and the briefing for the platform staff; the published data stays as it is." },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Köln Hbf",
              subject: "ICE 618 to Hamburg-Altona, 07:42: today from platform 7",
              body: "App-Push (DE): ICE 618 nach Hamburg-Altona, Abfahrt 07:42 Uhr, fährt heute von Gleis 7 (nicht Gleis 5). Die 1. Klasse hält in Abschnitt {{T-618.KK.coach_order.first_src}}.\nApp push (EN): ICE 618 to Hamburg-Altona, departing 07:42, leaves from platform 7 today (not platform 5). First class stops in sector {{T-618.KK.coach_order.first_src}}.\n\nAnzeiger Köln Hbf (DE): ICE 618 Hamburg-Altona 07:42 – heute Gleis 7\nDisplay Köln Hbf (EN): ICE 618 Hamburg-Altona 07:42 – today platform 7\n\nAnsage (DE): Achtung an Gleis 5: ICE 618 nach Hamburg-Altona, Abfahrt 07:42 Uhr, fährt heute von Gleis 7. Die Wagen der 1. Klasse halten in Abschnitt {{T-618.KK.coach_order.first_src}}.\nAnnouncement (EN): Attention, platform 5: ICE 618 to Hamburg-Altona, departing 07:42, leaves from platform 7 today. First class stops in sector {{T-618.KK.coach_order.first_src}}."
            } },
            { draft: {
              type: "staff_brief", recipient: "Station staff Köln Hbf (platforms 5 and 7)",
              subject: "ICE 618, 07:42: send passengers from platform 5 to platform 7",
              body: "ICE 618 to Hamburg-Altona (07:42) leaves from platform 7 today, not platform 5 (OPS-05, points failure W 32). The journey planner and the coach-position displays still show platform 5.\n\nPlease stand at platform 5 until the departure and send passengers to platform 7. On platform 7 first class stops in sector {{T-618.KK.coach_order.first_src}}, not {{T-618.KK.coach_order.first_pub}}: point passengers with reservations to the right sector."
            } },
            { awaitActions: true },
            { report: "## ICE 618: platform change at Köln Hbf\n\n**What we found.** The source moved ICE 618 (07:42 to Hamburg-Altona) from platform 5 to platform 7 at 07:21 (OPS-05, points failure W 32); every customer channel still shows platform 5, generated at 05:30.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\n**Decision.** Option B approved: messages on the app, the displays and the announcements, and staff at platform 5. The published data stays as it is.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V2.mis}} |\n| Right information from | – | +{{V2.from}} min |\n| Every channel aligned with the source | never | {{V2.sync}} |\n| Contradictions left in the data | {{contra}} | {{V2.res}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The planner and the coach order keep the old platform and sectors until someone re-publishes from the source.\n\n**How we know.** The platform change from the operations log and the source timetable; the old platform from every published channel; the points failure from the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. I draft the override request for the displays and announcements and the app message. The overrides are values kept by hand: the request says when to remove them." },
            { draft: {
              type: "override_request", recipient: "Station operations Köln Hbf (displays and announcements)",
              subject: "Override for ICE 618, 07:42: platform 7 on displays and announcements",
              body: "Please set by hand, for ICE 618 to Hamburg-Altona (07:42) at Köln Hbf:\n- station displays: platform 7 (published: platform 5)\n- automatic announcements: platform 7 (published: platform 5)\n\nBasis: OPS-05 (07:21) in the source; the route out of platform 7 is stored in the interlocking.\n\nRemove both overrides as soon as ICE 618 is re-published from the source, or after the departure at the latest."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Köln Hbf",
              subject: "ICE 618 to Hamburg-Altona, 07:42: today from platform 7",
              body: "App-Push (DE): ICE 618 nach Hamburg-Altona, Abfahrt 07:42 Uhr, fährt heute von Gleis 7 (nicht Gleis 5). Die 1. Klasse hält in Abschnitt {{T-618.KK.coach_order.first_src}}.\nApp push (EN): ICE 618 to Hamburg-Altona, departing 07:42, leaves from platform 7 today (not platform 5). First class stops in sector {{T-618.KK.coach_order.first_src}}."
            } },
            { awaitActions: true },
            { report: "## ICE 618: platform change at Köln Hbf\n\n**What we found.** The source moved ICE 618 (07:42 to Hamburg-Altona) from platform 5 to platform 7 at 07:21 (OPS-05); every customer channel still shows platform 5, generated at 05:30.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\n**Decision.** Option C approved: platform 7 set by hand on the station displays and announcements, and an app message.\n\n| | Do nothing | Option C |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V3.mis}} |\n| Right information from | – | +{{V3.from}} min |\n| Values kept by hand (second truth) | – | {{V3.ov}} |\n| Every channel aligned with the source | never | {{V3.sync}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The overrides are a second truth: they must be removed once the source is re-published, and the planner and the coach order stay wrong meanwhile.\n\n**How we know.** The platform change from the operations log and the source timetable; the old platform from every published channel; the points failure from the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "You accepted the risk. Nothing is published and nothing is requested; I record the decision in an internal memo." },
            { draft: {
              type: "memo", recipient: "Passenger information desk, Köln Hbf",
              subject: "ICE 618, 07:42: risk accepted, no publication",
              body: "Decision recorded: no action on ICE 618 to Hamburg-Altona (07:42 from Köln Hbf).\n\nThe source has the train on platform 7 since 07:21 (OPS-05); every customer channel still shows platform 5. If nothing changes, {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\nPlease review if the situation changes."
            } },
            { awaitActions: true },
            { report: "## ICE 618: platform change at Köln Hbf\n\n**What we found.** The source moved ICE 618 (07:42 to Hamburg-Altona) from platform 5 to platform 7 at 07:21 (OPS-05); every customer channel still shows platform 5.\n\n**Decision.** The risk was accepted: nothing is published and nothing is requested.\n\n**What that means.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes, and no channel comes back in line with the source by itself.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts (the decision memo) approved.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },
  "SC-DIVERSION": {
    title: "Wuppertal line blocked: ICE diverted via Essen",
    steps: [
      { state: "scanning" },
      { say: "Lead received from the staff chat: the line through Wuppertal-Oberbarmen is said to be blocked and ICE 1022 diverted via Essen, 'about ten minutes later', while the journey planner still shows Hagen and Wuppertal. A chat post is a rumour until the source confirms it: operations log first." },
      { mirror: { train_ids: ["T-1022"], state: "at_risk", focus: "T-1022" } },
      { tool: "ops_list_changes", input: { train: "ICE 1022" } },
      { say: "Finding: OPS-03, released by network control at 07:08. An interlocking failure at Wuppertal-Oberbarmen stops all traffic between Hagen Hbf and Wuppertal Hbf. ICE 1022 and ICE 1026 run Dortmund – Bochum – Essen – Duisburg – Düsseldorf – Köln instead: Hagen Hbf and Wuppertal Hbf are dropped, Essen Hbf and Düsseldorf Hbf added, +12 Min. The chat's estimate was too low." },
      { tool: "kfp_get_published", input: { train: "ICE 1022", channel: "planner" } },
      { say: "Hypothesis: the journey planner still shows ICE 1022 on its planned run, Hagen Hbf at 08:07, Wuppertal Hbf at 08:23 and Köln Hbf at 08:51. The plausibility check rejected the update at 07:10 because the extra stops are not in the train's list of commercial stops. I assume one train is affected." },

      { state: "verifying" },
      { sync: "hypothesis" },
      { say: "First estimate for ICE 1022 alone: {{hyp.pax}} passengers would act on wrong information, the first at Dortmund Hbf in {{hyp.first_min}} minutes. The engine marks the scope as partial: the same operational change touches another train whose customer information is wrong too." },

      { tool: "ops_get_timetable", input: { train: "ICE 1022" } },
      { tool: "phys_observe", input: { train: "ICE 1022" } },
      { say: "Confirmed: the physical layer backs the source. The interlocking at Wuppertal-Oberbarmen has been down since 07:02 with no train movements between Hagen Hbf and Wuppertal Hbf, and train positioning shows ICE 1022 approaching platform 11 at Dortmund Hbf, its exit route stored towards Bochum Hbf. The source brings it to Köln Hbf at 09:03." },
      { tool: "kfp_get_published", input: { train: "ICE 1026" } },
      { say: "Check: ICE 1026, the next train on the same line, shows the old run in every channel as well: Hagen Hbf at 09:07, Wuppertal Hbf at 09:23, Köln Hbf at 09:51." },
      { tool: "kfp_get_published", input: { train: "ICE 1023" } },
      { say: "Check: ICE 1023 northbound is diverted too, but without extra stops: its update passed and every channel shows the diversion. No contradiction there." },
      { say: "Revised: one train → two. ICE 1022 and ICE 1026 both still show stops at Hagen and Wuppertal they will not make, leave out the extra stops at Essen and Düsseldorf, and reach Köln Hbf later than shown." },
      { alert: {
        title: "ICE 1022 and ICE 1026: customer information shows stops the diverted trains will not make",
        severity: "critical",
        basis: "verified",
        summary: "Since 07:08 the source runs both trains via Essen Hbf and Düsseldorf Hbf (OPS-03, interlocking failure at Wuppertal-Oberbarmen). Every channel still shows Hagen Hbf and Wuppertal Hbf and the old arrival times at Köln Hbf: the plausibility check rejected the update.",
        train_ids: ["T-1022", "T-1026"],
        point_ids: ["EHG", "KW", "EE", "KD"],
        sources: [
          { title: "Operations log OPS-03: network control, diversion (synthetic)" },
          { title: "Interlocking diagnostics, ESTW Wuppertal-Oberbarmen (synthetic)" },
          { title: "Train positioning, Dortmund Hbf (synthetic)" }
        ]
      } },

      { state: "simulating" },
      { tool: "ops_get_passengers", input: { train: "ICE 1022" } },
      { tool: "ops_get_passengers", input: { train: "ICE 1026" } },
      { say: "Finding: on ICE 1022, 74 passengers plan to board at Hagen Hbf and 96 at Wuppertal Hbf, and 247 passengers travel to Köln Hbf; ICE 1026 carries similar numbers an hour later." },
      { tool: "ops_find_alternatives", input: { from: "KW", to: "KK", after: "08:23" } },
      { say: "Check: for passengers waiting at Wuppertal Hbf, today's timetable has RB 30473 at 08:51 from platform 2, arriving at Köln Hbf at 09:27. From Hagen Hbf the replacement bus runs to Wuppertal Hbf. The engine works out an alternative for every stranded group." },
      { sync: "finding" },
      { say: "Impact: {{pax}} passengers on the two trains would act on wrong information, across {{contra}} contradictions; the first decide at Dortmund Hbf, which ICE 1022 leaves in {{first_min}} minutes. Of the 247 travelling to Köln Hbf on ICE 1022, {{T-1022.KK.time.onboard}} are on board from Dortmund; those who meant to board at Hagen or Wuppertal are counted there. The plausibility check holds the update back, so no publication cycle fixes it: it needs a manual release." },
      { mirror: { train_ids: ["T-1022", "T-1026"], point_ids: ["EHG", "KW"], state: "affected" } },

      { options: {
        recommended: "V1",
        baseline_description: "The rejected update stays rejected: every channel keeps Hagen and Wuppertal and the old arrival times, and {{pax}} passengers act on them.",
        texts: {
          V1: {
            title: "Release and re-publish both trains",
            description: "Release the rejected update and re-publish ICE 1022 and ICE 1026; message every channel and brief staff.",
            residual_risk: "Until the release is through, the messages and the staff carry the passengers."
          },
          V2: {
            title: "Messages everywhere, data unchanged",
            description: "Message every channel with the diversion and the alternatives and brief staff; the update stays rejected.",
            residual_risk: "The planner keeps selling Hagen and Wuppertal: every contradiction stays in the data."
          },
          V3: {
            title: "Override displays and announcements",
            description: "Set the cancelled stops and new times by hand on displays and announcements, with an app message.",
            residual_risk: "Many hand-kept values, a second truth; the journey planner stays wrong."
          }
        }
      } },
      { say: "Recommendation: option A. It leaves {{V1.mis}} passengers misinformed, as few as option B, and it is the only option that aligns every channel with the source again, after {{V1.sync}} minutes. Option C would need {{V3.ov}} hand-kept values and still leave {{V3.mis}} passengers misinformed." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. B informs every channel without touching the data; C overrides the displays and announcements by hand.",
          V2: "Option B rejected. A releases and re-publishes both trains; C overrides the displays and announcements by hand.",
          V3: "Option C rejected. A re-publishes from the source; B informs without touching the data."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the release order, the passenger message with the alternatives and the staff briefing." },
            { draft: {
              type: "republish_order", recipient: "Timetable publication team",
              subject: "Release the rejected update for ICE 1022 and ICE 1026 (OPS-03) and re-publish both trains",
              body: "Please release by hand the update for ICE 1022 and ICE 1026 that the plausibility check rejected at 07:10, and re-publish both trains from source version 2 (OPS-03) to every customer channel.\n\nWhy: the diversion via Essen Hbf and Düsseldorf Hbf adds two stops that are not in the trains' list of commercial stops; for today they are commercial stops. Every channel still shows Hagen Hbf and Wuppertal Hbf.\n\nNo value is to be typed by hand: the customer timetable is generated from the source. With the release, every channel is expected to be aligned after {{V1.sync}} minutes."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, region Rhein-Ruhr",
              subject: "ICE 1022 and ICE 1026 diverted via Essen and Düsseldorf: no stops at Hagen and Wuppertal",
              body: "App-Push (DE): ICE 1022 nach Köln Hbf wird wegen einer Stellwerksstörung in Wuppertal-Oberbarmen über Essen und Düsseldorf umgeleitet. Die Halte Hagen Hbf und Wuppertal Hbf entfallen; zusätzliche Halte in Essen Hbf und Düsseldorf Hbf. Ankunft in Köln Hbf {{T-1022.KK.time.arr}} statt 08:51. Nach Hagen Hbf: {{alt.T-1022.EHG.onboard.de}}. Ab Hagen Hbf: {{alt.T-1022.EHG.boarding.de}}. Ab Wuppertal Hbf: {{alt.T-1022.KW.boarding.de}}. Nach Wuppertal Hbf: {{alt.T-1022.KW.onboard.de}}.\nApp push (EN): ICE 1022 to Köln Hbf is diverted via Essen and Düsseldorf because of a signal-box failure at Wuppertal-Oberbarmen. The stops at Hagen Hbf and Wuppertal Hbf are cancelled; extra stops at Essen Hbf and Düsseldorf Hbf. Arrival at Köln Hbf {{T-1022.KK.time.arr}} instead of 08:51. For Hagen Hbf: {{alt.T-1022.EHG.onboard.en}}. From Hagen Hbf: {{alt.T-1022.EHG.boarding.en}}. From Wuppertal Hbf: {{alt.T-1022.KW.boarding.en}}. For Wuppertal Hbf: {{alt.T-1022.KW.onboard.en}}.\n\nApp-Push (DE): ICE 1026 nach Köln Hbf wird ebenso umgeleitet; Ankunft in Köln Hbf {{T-1026.KK.time.arr}} statt 09:51. Ab Hagen Hbf: {{alt.T-1026.EHG.boarding.de}}. Ab Wuppertal Hbf: {{alt.T-1026.KW.boarding.de}}.\nApp push (EN): ICE 1026 to Köln Hbf is diverted the same way; arrival at Köln Hbf {{T-1026.KK.time.arr}} instead of 09:51. From Hagen Hbf: {{alt.T-1026.EHG.boarding.en}}. From Wuppertal Hbf: {{alt.T-1026.KW.boarding.en}}.\n\nAnzeiger Hagen Hbf und Wuppertal Hbf (DE): ICE 1022 Köln Hbf – Halt entfällt, Umleitung über Essen\nDisplay Hagen Hbf and Wuppertal Hbf (EN): ICE 1022 Köln Hbf – stop cancelled, diverted via Essen\n\nAnsage Hagen Hbf (DE): Information zu ICE 1022 nach Köln Hbf, planmäßige Abfahrt 08:07 Uhr: Der Zug wird heute umgeleitet und hält nicht in Hagen. Bitte nutzen Sie {{alt.T-1022.EHG.boarding.de}}.\nAnnouncement Hagen Hbf (EN): Information on ICE 1022 to Köln Hbf, scheduled at 08:07: the train is diverted today and does not stop at Hagen. Please take {{alt.T-1022.EHG.boarding.en}}."
            } },
            { draft: {
              type: "staff_brief", recipient: "Station staff Hagen Hbf, Wuppertal Hbf, Essen Hbf and Düsseldorf Hbf",
              subject: "ICE 1022 and ICE 1026 diverted: no stops at Hagen and Wuppertal, extra stops at Essen and Düsseldorf",
              body: "Hagen Hbf and Wuppertal Hbf: ICE 1022 (08:07 and 08:23) and ICE 1026 (09:07 and 09:23) do not stop today (OPS-03, signal-box failure at Wuppertal-Oberbarmen). Send passengers for Köln to the alternatives: from Hagen Hbf {{alt.T-1022.EHG.boarding.en}}; from Wuppertal Hbf {{alt.T-1022.KW.boarding.en}}.\n\nEssen Hbf and Düsseldorf Hbf: extra stops of both trains, Essen Hbf platform 4, Düsseldorf Hbf platform 17."
            } },
            { awaitActions: true },
            { report: "## ICE 1022 and ICE 1026: diversion via Essen and Düsseldorf\n\n**What we found.** Since 07:08 the source runs ICE 1022 and ICE 1026 via Essen Hbf and Düsseldorf Hbf (OPS-03): an interlocking failure at Wuppertal-Oberbarmen has stopped all traffic between Hagen Hbf and Wuppertal Hbf since 07:02, and ICE 1022 stands ready at Dortmund Hbf with its route set towards Bochum Hbf. Every customer channel still shows the stops at Hagen Hbf and Wuppertal Hbf and the old arrivals at Köln Hbf: the plausibility check rejected the update because the extra stops are not commercial stops. ICE 1023, diverted without extra stops, was published correctly.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes, and no cycle releases the update.\n\n**Decision.** Option A approved: release of the update and re-publication of both trains from the source, messages with alternatives on every channel and a staff briefing.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V1.mis}} |\n| Right information from | – | +{{V1.from}} min |\n| Every channel aligned with the source | never | after {{V1.sync}} min |\n| Hand-kept values | – | {{V1.ov}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** Until the release is through, passengers depend on the messages and the staff.\n\n**How we know.** The diversion from the operations log and the source timetable; the old run from every published channel; the interlocking failure and the train's position from the physical layer; passenger figures from today's counts; alternatives from today's source timetable; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the passenger message with the alternatives for every channel and the staff briefing; the rejected update stays as it is." },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, region Rhein-Ruhr",
              subject: "ICE 1022 and ICE 1026 diverted via Essen and Düsseldorf: no stops at Hagen and Wuppertal",
              body: "App-Push und Reiseauskunft (DE): ICE 1022 nach Köln Hbf wird wegen einer Stellwerksstörung in Wuppertal-Oberbarmen über Essen und Düsseldorf umgeleitet. Die Halte Hagen Hbf und Wuppertal Hbf entfallen; zusätzliche Halte in Essen Hbf und Düsseldorf Hbf. Ankunft in Köln Hbf {{T-1022.KK.time.arr}} statt 08:51. Ab Hagen Hbf: {{alt.T-1022.EHG.boarding.de}}. Ab Wuppertal Hbf: {{alt.T-1022.KW.boarding.de}}.\nApp push and journey planner (EN): ICE 1022 to Köln Hbf is diverted via Essen and Düsseldorf because of a signal-box failure at Wuppertal-Oberbarmen. The stops at Hagen Hbf and Wuppertal Hbf are cancelled; extra stops at Essen Hbf and Düsseldorf Hbf. Arrival at Köln Hbf {{T-1022.KK.time.arr}} instead of 08:51. From Hagen Hbf: {{alt.T-1022.EHG.boarding.en}}. From Wuppertal Hbf: {{alt.T-1022.KW.boarding.en}}.\n\nApp-Push (DE): ICE 1026 wird ebenso umgeleitet; Ankunft in Köln Hbf {{T-1026.KK.time.arr}} statt 09:51.\nApp push (EN): ICE 1026 is diverted the same way; arrival at Köln Hbf {{T-1026.KK.time.arr}} instead of 09:51.\n\nAnsage Hagen Hbf und Wuppertal Hbf (DE): Information zu ICE 1022 und ICE 1026 nach Köln Hbf: Die Züge werden heute umgeleitet und halten nicht in Hagen und Wuppertal.\nAnnouncement Hagen Hbf and Wuppertal Hbf (EN): ICE 1022 and ICE 1026 to Köln Hbf are diverted today and do not stop at Hagen or Wuppertal."
            } },
            { draft: {
              type: "staff_brief", recipient: "Station staff Hagen Hbf, Wuppertal Hbf, Essen Hbf and Düsseldorf Hbf",
              subject: "ICE 1022 and ICE 1026 diverted: no stops at Hagen and Wuppertal",
              body: "Hagen Hbf and Wuppertal Hbf: ICE 1022 (08:07 and 08:23) and ICE 1026 (09:07 and 09:23) do not stop today (OPS-03). The journey planner still lists the stops: tell passengers in person. From Hagen Hbf: {{alt.T-1022.EHG.boarding.en}}; from Wuppertal Hbf: {{alt.T-1022.KW.boarding.en}}.\n\nEssen Hbf and Düsseldorf Hbf: extra stops of both trains, Essen Hbf platform 4, Düsseldorf Hbf platform 17."
            } },
            { awaitActions: true },
            { report: "## ICE 1022 and ICE 1026: diversion via Essen and Düsseldorf\n\n**What we found.** Since 07:08 the source runs ICE 1022 and ICE 1026 via Essen Hbf and Düsseldorf Hbf (OPS-03, interlocking failure at Wuppertal-Oberbarmen). Every customer channel still shows Hagen Hbf and Wuppertal Hbf: the plausibility check rejected the update.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\n**Decision.** Option B approved: messages with alternatives on every channel and staff briefed; the rejected update stays as it is.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V2.mis}} |\n| Right information from | – | +{{V2.from}} min |\n| Every channel aligned with the source | never | {{V2.sync}} |\n| Contradictions left in the data | {{contra}} | {{V2.res}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The journey planner keeps selling journeys with the cancelled stops until the update is released.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the override request for the stations' displays and announcements and the app message; the request says when the overrides must go." },
            { draft: {
              type: "override_request", recipient: "Station operations Hagen Hbf, Wuppertal Hbf and Köln Hbf (displays and announcements)",
              subject: "Overrides for ICE 1022 and ICE 1026: cancelled stops and new arrival times",
              body: "Please set by hand on the station displays and announcements:\n- Hagen Hbf: ICE 1022 (08:07) and ICE 1026 (09:07): stop cancelled\n- Wuppertal Hbf: ICE 1022 (08:23) and ICE 1026 (09:23): stop cancelled\n- Köln Hbf: arrival of ICE 1022 {{T-1022.KK.time.arr}} instead of 08:51, of ICE 1026 {{T-1026.KK.time.arr}} instead of 09:51\n\nBasis: OPS-03 (07:08) in the source; the interlocking at Wuppertal-Oberbarmen is down.\n\nThese are hand-kept values: remove every override as soon as both trains are re-published from the source."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, region Rhein-Ruhr",
              subject: "ICE 1022 and ICE 1026 diverted: no stops at Hagen and Wuppertal",
              body: "App-Push (DE): ICE 1022 und ICE 1026 nach Köln Hbf werden über Essen und Düsseldorf umgeleitet; die Halte Hagen Hbf und Wuppertal Hbf entfallen. Ankunft in Köln Hbf {{T-1022.KK.time.arr}} und {{T-1026.KK.time.arr}}.\nApp push (EN): ICE 1022 and ICE 1026 to Köln Hbf are diverted via Essen and Düsseldorf; the stops at Hagen Hbf and Wuppertal Hbf are cancelled. Arrival at Köln Hbf {{T-1022.KK.time.arr}} and {{T-1026.KK.time.arr}}."
            } },
            { awaitActions: true },
            { report: "## ICE 1022 and ICE 1026: diversion via Essen and Düsseldorf\n\n**What we found.** Since 07:08 the source runs both trains via Essen Hbf and Düsseldorf Hbf (OPS-03); every customer channel still shows Hagen Hbf and Wuppertal Hbf.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\n**Decision.** Option C approved: the stops and times set by hand on the stations' displays and announcements, and an app message.\n\n| | Do nothing | Option C |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V3.mis}} |\n| Hand-kept values (second truth) | – | {{V3.ov}} |\n| Every channel aligned with the source | never | {{V3.sync}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** {{V3.ov}} hand-kept values must be removed once the trains are re-published; the journey planner stays wrong meanwhile.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "You accepted the risk. Nothing is published and nothing is requested; I record the decision in an internal memo." },
            { draft: {
              type: "memo", recipient: "Passenger information desk, region Rhein-Ruhr",
              subject: "ICE 1022 and ICE 1026: risk accepted, no publication",
              body: "Decision recorded: no action on ICE 1022 and ICE 1026.\n\nThe source has both trains diverted via Essen Hbf and Düsseldorf Hbf since 07:08 (OPS-03); every customer channel still shows Hagen Hbf and Wuppertal Hbf. If nothing changes, {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\nPlease review if the situation changes."
            } },
            { awaitActions: true },
            { report: "## ICE 1022 and ICE 1026: diversion via Essen and Düsseldorf\n\n**What we found.** Since 07:08 the source runs both trains via Essen Hbf and Düsseldorf Hbf (OPS-03); every customer channel still shows Hagen Hbf and Wuppertal Hbf.\n\n**Decision.** The risk was accepted: nothing is published and nothing is requested.\n\n**What that means.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes, and the rejected update is not released.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts (the decision memo) approved.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },

  "SC-OPSSTOP": {
    title: "An operational stop published as a passenger stop",
    steps: [
      { state: "scanning" },
      { say: "Lead received from the service centre: a passenger says ICE 1027 'stopped' at Köln-Mülheim yesterday without opening its doors, although the app listed the stop. Yesterday is gone; the question is today's run. Operations log first." },
      { mirror: { train_ids: ["T-1027"], state: "at_risk", focus: "T-1027" } },
      { tool: "ops_list_changes", input: { train: "ICE 1027" } },
      { say: "Finding: no operational change touches ICE 1027 today; it runs on its base timetable. If the app is wrong, the fault is in the conversion to the customer timetable, not in a late change." },
      { tool: "ops_get_timetable", input: { train: "ICE 1027" } },
      { say: "Finding: in the source, Köln-Mülheim is a Betriebshalt. The train waits there from 08:43 for its path into Köln Hbf over the Hohenzollern bridge, with no passenger exchange." },
      { tool: "kfp_get_published", input: { train: "ICE 1027", channel: "planner" } },
      { say: "Hypothesis: the journey planner publishes Köln-Mülheim as a normal stop, arrival 08:43, departure 08:44 from platform 3: the conversion rule lost the operational-stop flag. The complaint came through the app, so I assume the app is the channel at fault." },

      { state: "verifying" },
      { sync: "hypothesis" },
      { say: "First estimate for the app alone: {{hyp.pax}} of {{hyp.affected}} passengers who booked to or from Köln-Mülheim would be stranded; the first decide at Düsseldorf Hbf in {{hyp.first_min}} minutes. The other channels come next." },

      { tool: "kfp_get_published", input: { train: "ICE 1027" } },
      { say: "Check: the station displays and the automatic announcements carry the same fault. All three were generated with the conversion rule that drops the flag on stops of 1.5 minutes or more." },
      { tool: "phys_observe", input: { train: "ICE 1027", point: "KKM" } },
      { say: "Confirmed: the physical layer agrees with the source. The door log of the last five runs shows the stop at Köln-Mülheim without door release every time, held for 1.6 to 2.1 minutes, and the infrastructure register gives platform 3 a usable length of only 215 m for a 346 m double unit: the train could not serve that platform even if it wanted to." },
      { say: "Revised: only the app → the app, the station displays and the announcements. Every channel promises a stop the train does not make, and passengers keep booking journeys to it." },
      { alert: {
        title: "ICE 1027: every channel lists a stop at Köln-Mülheim that is a Betriebshalt",
        severity: "high",
        basis: "verified",
        summary: "In the source ICE 1027 waits at Köln-Mülheim from 08:43 without passenger exchange; the door logs and the platform length confirm it. A conversion rule fault publishes the stop in the journey planner, on the station displays and in the announcements.",
        train_ids: ["T-1027"],
        point_ids: ["KKM"],
        sources: [
          { title: "Source timetable ICE 1027: Betriebshalt Köln-Mülheim (synthetic)" },
          { title: "TCMS door log, ICE 1027, last five runs (synthetic)" },
          { title: "Infrastructure register: platform data Köln-Mülheim (synthetic)" }
        ]
      } },

      { state: "simulating" },
      { tool: "ops_get_passengers", input: { train: "ICE 1027" } },
      { say: "Finding: 21 passengers plan to board at Köln-Mülheim and 37 to get off there: journeys booked only because the planner lists the stop." },
      { tool: "ops_find_alternatives", input: { from: "KK", to: "KKM", after: "08:55" } },
      { say: "Check: passengers for Köln-Mülheim ride on to Köln Hbf and come back with the S 11: S 30124 at 09:00 from platform 11, arriving at 09:09. Those waiting at Köln-Mülheim take the S 11 to Köln Hbf instead." },
      { sync: "finding" },
      { say: "Impact: {{pax}} passengers rely on a stop that does not exist; the first decide at Düsseldorf Hbf in {{first_min}} minutes. And it repeats every day until the conversion rule is fixed: the error is in the rule, not in today's data." },
      { mirror: { train_ids: ["T-1027"], point_ids: ["KKM"], state: "affected" } },

      { options: {
        recommended: "V1",
        baseline_description: "Every channel keeps the stop at Köln-Mülheim; {{pax}} passengers act on it, and the same happens tomorrow.",
        texts: {
          V1: {
            title: "Re-publish ICE 1027 with the Betriebshalt",
            description: "Re-publish ICE 1027 with the operational-stop flag kept, so Köln-Mülheim drops out; tell booked passengers.",
            residual_risk: "The conversion rule stays faulty: tomorrow's generation repeats the error."
          },
          V2: {
            title: "Remove the stop from the displays by hand",
            description: "Delete Köln-Mülheim by hand from displays and announcements and push an app message; the planner stays.",
            residual_risk: "Hand-kept values, a second truth; the journey planner keeps selling the stop."
          },
          V3: {
            title: "Announce it, leave the data",
            description: "Message app, displays and announcements and brief the train crew; the published data stays as it is.",
            residual_risk: "Every channel keeps the false stop, and new journeys keep being booked to it."
          }
        }
      } },
      { say: "Recommendation: option A. It leaves {{V1.mis}} passengers misinformed and aligns every channel with the source after {{V1.sync}} minutes. Option C leaves {{V3.mis}} misinformed today, but keeps the false stop in every channel, so the next bookings go wrong too." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. B removes the stop from the displays by hand; C informs without touching the data.",
          V2: "Option B rejected. A re-publishes from the source; C informs without touching the data.",
          V3: "Option C rejected. A re-publishes from the source; B removes the stop from the displays by hand."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the re-publication order, a note on the conversion rule and the passenger message." },
            { draft: {
              type: "republish_order", recipient: "Timetable publication team",
              subject: "Re-publish ICE 1027 with the Betriebshalt at Köln-Mülheim",
              body: "Please re-publish ICE 1027 from the source to every customer channel with the operational-stop flag at Köln-Mülheim kept: the stop at 08:43 is a Betriebshalt without passenger exchange and must not appear in the customer timetable.\n\nWhy: the conversion rule loses the operational-stop flag on stops of 1.5 minutes or more, so the journey planner, the station displays and the announcements list Köln-Mülheim as a passenger stop.\n\nNo value is to be typed by hand. With the re-publication, every channel is expected to be aligned after {{V1.sync}} minutes."
            } },
            { draft: {
              type: "memo", recipient: "Timetable publication team (conversion rules)",
              subject: "Conversion rule drops the Betriebshalt flag on stops of 1.5 minutes or more",
              body: "The customer-timetable conversion publishes operational stops of 1.5 minutes or more as passenger stops. Today it affects ICE 1027 at Köln-Mülheim; the door logs show the doors never open there.\n\nPlease fix the rule before tomorrow's daily generation, or the error comes back with every run, and check which other trains have operational stops of that length."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Köln",
              subject: "ICE 1027 does not stop at Köln-Mülheim",
              body: "App-Push (DE): ICE 1027 nach Köln Hbf hält heute nicht in Köln-Mülheim: der Halt um 08:43 Uhr ist ein Betriebshalt ohne Ein- und Ausstieg. Nach Köln-Mülheim: bis Köln Hbf fahren, dann {{alt.T-1027.KKM.onboard.de}}. Ab Köln-Mülheim nach Köln Hbf: {{alt.T-1027.KKM.boarding.de}}.\nApp push (EN): ICE 1027 to Köln Hbf does not stop at Köln-Mülheim today: the stop at 08:43 is an operational stop without boarding or alighting. For Köln-Mülheim: stay on to Köln Hbf, then {{alt.T-1027.KKM.onboard.en}}. From Köln-Mülheim to Köln Hbf: {{alt.T-1027.KKM.boarding.en}}.\n\nAnzeiger Köln-Mülheim (DE): ICE 1027 Köln Hbf 08:44 – kein Halt\nDisplay Köln-Mülheim (EN): ICE 1027 Köln Hbf 08:44 – no stop\n\nAnsage im Zug (DE): Information für Reisende nach Köln-Mülheim: Dieser Zug hält in Köln-Mülheim nur betrieblich, die Türen bleiben geschlossen. Bitte fahren Sie bis Köln Hbf.\nOn-board announcement (EN): Passengers for Köln-Mülheim: this train only stops there for operational reasons and the doors stay closed. Please stay on to Köln Hbf."
            } },
            { awaitActions: true },
            { report: "## ICE 1027: a Betriebshalt published as a passenger stop\n\n**What we found.** In the source ICE 1027 waits at Köln-Mülheim from 08:43 without passenger exchange (a Betriebshalt). The journey planner, the station displays and the announcements list it as a passenger stop: the conversion rule loses the operational-stop flag on stops of 1.5 minutes or more. The door logs of the last five runs (no door release) and the platform length (215 m for a 346 m double unit) confirm the source.\n\n**If we do nothing.** {{pax}} passengers rely on a stop that does not exist, the first in {{first_min}} minutes, and tomorrow repeats it.\n\n**Decision.** Option A approved: re-publication of ICE 1027 with the Betriebshalt, a passenger message and a report on the conversion rule.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V1.mis}} |\n| Right information from | – | +{{V1.from}} min |\n| Every channel aligned with the source | never | after {{V1.sync}} min |\n| Hand-kept values | – | {{V1.ov}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** Until the conversion rule is fixed, every daily generation brings the stop back.\n\n**How we know.** The Betriebshalt from the source timetable; the published stop from every channel; door logs and platform data from the physical layer; bookings from today's passenger figures; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the override request for the station displays and announcements and the app message; the request says when the overrides must go." },
            { draft: {
              type: "override_request", recipient: "Station operations Köln-Mülheim (displays and announcements)",
              subject: "Override: remove ICE 1027 (08:44) from the displays and announcements at Köln-Mülheim",
              body: "Please remove ICE 1027 to Köln Hbf (08:43 / 08:44, platform 3) by hand from the station displays and the automatic announcements at Köln-Mülheim: the stop is a Betriebshalt and the doors stay closed.\n\nThese are hand-kept values: remove the overrides once ICE 1027 is re-published from the source with the operational-stop flag."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Köln",
              subject: "ICE 1027 does not stop at Köln-Mülheim",
              body: "App-Push (DE): ICE 1027 nach Köln Hbf hält heute nicht in Köln-Mülheim (nur Betriebshalt, Türen bleiben geschlossen). Nach Köln-Mülheim: {{alt.T-1027.KKM.onboard.de}}.\nApp push (EN): ICE 1027 to Köln Hbf does not stop at Köln-Mülheim today (operational stop only, doors stay closed). For Köln-Mülheim: {{alt.T-1027.KKM.onboard.en}}."
            } },
            { awaitActions: true },
            { report: "## ICE 1027: a Betriebshalt published as a passenger stop\n\n**What we found.** In the source ICE 1027 waits at Köln-Mülheim from 08:43 without passenger exchange; every channel lists it as a passenger stop because the conversion rule drops the operational-stop flag. Door logs and platform data confirm the source.\n\n**If we do nothing.** {{pax}} passengers rely on a stop that does not exist, the first in {{first_min}} minutes.\n\n**Decision.** Option B approved: the stop removed by hand from the displays and announcements at Köln-Mülheim, and an app message.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V2.mis}} |\n| Hand-kept values (second truth) | – | {{V2.ov}} |\n| Every channel aligned with the source | never | {{V2.sync}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The journey planner keeps selling the stop; the overrides must be removed once the train is re-published.\n\n**How we know.** The source timetable, every published channel, door logs and platform data; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the passenger message for the app, the displays and the announcements and the briefing for the train crew; the published data stays as it is." },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Köln",
              subject: "ICE 1027 does not stop at Köln-Mülheim",
              body: "App-Push (DE): ICE 1027 nach Köln Hbf hält heute nicht in Köln-Mülheim (nur Betriebshalt). Nach Köln-Mülheim: bis Köln Hbf, dann {{alt.T-1027.KKM.onboard.de}}.\nApp push (EN): ICE 1027 to Köln Hbf does not stop at Köln-Mülheim today (operational stop only). For Köln-Mülheim: stay on to Köln Hbf, then {{alt.T-1027.KKM.onboard.en}}.\n\nAnsage Köln-Mülheim (DE): ICE 1027 nach Köln Hbf, 08:44 Uhr: kein Halt in Köln-Mülheim. Bitte nutzen Sie {{alt.T-1027.KKM.boarding.de}}.\nAnnouncement Köln-Mülheim (EN): ICE 1027 to Köln Hbf, 08:44: no stop at Köln-Mülheim. Please take {{alt.T-1027.KKM.boarding.en}}."
            } },
            { draft: {
              type: "staff_brief", recipient: "Train crew of ICE 1027",
              subject: "Köln-Mülheim is a Betriebshalt: announce it before Düsseldorf",
              body: "The journey planner, the displays and the announcements list a passenger stop at Köln-Mülheim (08:43), but it is a Betriebshalt and the doors stay closed. Please announce before Düsseldorf Hbf that the train does not serve Köln-Mülheim, and point passengers for Köln-Mülheim to the S 11 from Köln Hbf: {{alt.T-1027.KKM.onboard.en}}."
            } },
            { awaitActions: true },
            { report: "## ICE 1027: a Betriebshalt published as a passenger stop\n\n**What we found.** In the source ICE 1027 waits at Köln-Mülheim from 08:43 without passenger exchange; every channel lists it as a passenger stop because the conversion rule drops the operational-stop flag.\n\n**If we do nothing.** {{pax}} passengers rely on a stop that does not exist, the first in {{first_min}} minutes.\n\n**Decision.** Option C approved: messages on the app, the displays and the announcements, and the train crew briefed; the data stays as it is.\n\n| | Do nothing | Option C |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V3.mis}} |\n| Every channel aligned with the source | never | {{V3.sync}} |\n| Contradictions left in the data | {{contra}} | {{V3.res}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** Every channel keeps the false stop; new journeys to Köln-Mülheim keep being booked.\n\n**How we know.** The source timetable, every published channel, door logs and platform data; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "You accepted the risk. Nothing is published and nothing is requested; I record the decision in an internal memo." },
            { draft: {
              type: "memo", recipient: "Passenger information desk, Köln",
              subject: "ICE 1027 at Köln-Mülheim: risk accepted, no publication",
              body: "Decision recorded: no action on ICE 1027 today.\n\nThe source has a Betriebshalt at Köln-Mülheim (08:43); every channel lists it as a passenger stop because of a conversion rule fault. If nothing changes, {{pax}} passengers rely on the stop, the first in {{first_min}} minutes, and tomorrow repeats it.\n\nPlease review if the situation changes."
            } },
            { awaitActions: true },
            { report: "## ICE 1027: a Betriebshalt published as a passenger stop\n\n**What we found.** In the source ICE 1027 waits at Köln-Mülheim without passenger exchange; every channel lists it as a passenger stop.\n\n**Decision.** The risk was accepted: nothing is published and nothing is requested.\n\n**What that means.** {{pax}} passengers rely on a stop that does not exist, the first in {{first_min}} minutes, and the conversion rule repeats the error tomorrow.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts (the decision memo) approved.\n\n**How we know.** The source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },

  "SC-TERMINUS": {
    title: "ICE ends at Köln Messe/Deutz, the app says Köln Hbf",
    steps: [
      { state: "scanning" },
      { say: "Lead received from the station team at Köln Messe/Deutz: ICE 1025 ends there today and the displays say so, but passengers keep showing them the app with arrival at Köln Hbf. Two channels disagree; the source decides which is right." },
      { mirror: { train_ids: ["T-1025"], state: "at_risk", focus: "T-1025" } },
      { tool: "ops_list_changes", input: { train: "ICE 1025" } },
      { say: "Finding: OPS-04, released by long-distance dispatch at 07:17. ICE 1025 from Hamburg ends at Köln Messe/Deutz on platform 1 and turns there, because the points failure at W 32 leaves Köln Hbf short of capacity." },
      { tool: "kfp_get_published", input: { train: "ICE 1025", channel: "displays" } },
      { say: "Hypothesis: the station displays were generated from version 2 and show the train ending at Köln Messe/Deutz, arrival 09:16, with Köln Hbf cancelled. Only the journey planner and the app lag, so the risk is limited to app users." },

      { state: "verifying" },
      { sync: "hypothesis" },
      { say: "First estimate for the app alone: {{hyp.pax}} of {{hyp.affected}} passengers travelling to Köln Hbf would be caught out; they decide on board before Köln Messe/Deutz, in {{hyp.first_min}} minutes. The journey planner's import is queued for the {{hyp.next_cycle}} cycle." },

      { tool: "kfp_get_published", input: { train: "ICE 1025" } },
      { say: "Check: the on-board announcements were loaded at departure from Hamburg with the planned run to Köln Hbf, and nothing refreshes them on the way. The journey planner catches up in the half-hourly cycle; the announcements do not." },
      { tool: "phys_observe", input: { train: "ICE 1025" } },
      { say: "Confirmed: the interlocking at Köln Messe/Deutz has stored ICE 1025's entry route into platform 1 with the end of the run and a change of direction, and no route on to Köln Hbf; the point diagnostics at Köln Hbf have shown W 32 failed since 07:12." },
      { say: "Revised: only the app → the app and the on-board announcements. The passengers on board hear 'Köln Hbf' until the train stops at Messe/Deutz, and they are the ones who must decide where to get off." },
      { alert: {
        title: "ICE 1025 ends at Köln Messe/Deutz, but the planner and the on-board announcements say Köln Hbf",
        severity: "high",
        basis: "verified",
        summary: "Since 07:17 the source ends ICE 1025 at Köln Messe/Deutz on platform 1 (OPS-04, points failure W 32 at Köln Hbf). The station displays show it; the journey planner and the on-board announcements still show the arrival at Köln Hbf at 09:20.",
        train_ids: ["T-1025"],
        point_ids: ["KKDZ", "KK"],
        sources: [
          { title: "Operations log OPS-04: long-distance dispatch Köln, terminus moved (synthetic)" },
          { title: "Route store, interlocking Köln Messe/Deutz, and point diagnostics ESTW Köln Hbf (synthetic)" }
        ]
      } },

      { state: "simulating" },
      { tool: "ops_get_passengers", input: { train: "ICE 1025" } },
      { say: "Finding: 268 passengers on ICE 1025 travel to Köln Hbf." },
      { tool: "ops_find_alternatives", input: { from: "KKDZ", to: "KK", after: "09:20" } },
      { say: "Check: from Köln Messe/Deutz the next train to Köln Hbf is RB 30473 at 09:22 from platform 2, arriving at 09:27; S 30129 follows at 09:28." },
      { sync: "finding" },
      { say: "Impact: {{pax}} of {{affected}} passengers for Köln Hbf would act on the wrong destination. The planner catches up at {{next_cycle}}, the on-board announcements never do, and the passengers decide in {{first_min}} minutes, before the stop at Köln Messe/Deutz." },
      { mirror: { train_ids: ["T-1025"], point_ids: ["KK"], state: "affected" } },

      { options: {
        recommended: "V1",
        baseline_description: "The planner catches up at {{next_cycle}}, but the on-board announcements keep saying Köln Hbf: {{pax}} passengers act on it.",
        texts: {
          V1: {
            title: "Re-publish ICE 1025, tell passengers on board",
            description: "Re-publish ICE 1025 to every channel, reload the on-board announcements, push the new terminus to the app.",
            residual_risk: "Passengers without the app depend on the reloaded on-board announcements."
          },
          V2: {
            title: "Crew announcement and app push",
            description: "Push an app message and have the crew announce the new terminus; the planner catches up in the next cycle.",
            residual_risk: "The automatic announcements keep saying Köln Hbf: the data is not aligned again."
          },
          V3: {
            title: "Override the on-board announcements",
            description: "Override the on-board announcements by hand and push an app message.",
            residual_risk: "A hand-kept value on board, a second truth; the planner waits for the next cycle."
          }
        }
      } },
      { say: "Recommendation: option A. It leaves {{V1.mis}} passengers misinformed, the same as option C, but every channel is aligned with the source again after {{V1.sync}} minutes and nothing is kept by hand." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. B relies on the crew and the app; C overrides the on-board announcements by hand.",
          V2: "Option B rejected. A re-publishes from the source; C overrides the on-board announcements by hand.",
          V3: "Option C rejected. A re-publishes from the source; B relies on the crew and the app."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the re-publication order and the passenger message." },
            { draft: {
              type: "republish_order", recipient: "Timetable publication team",
              subject: "Re-publish ICE 1025 (OPS-04, terminus Köln Messe/Deutz) and reload the on-board announcements",
              body: "Please re-publish ICE 1025 from source version 2 (OPS-04, 07:17) to every customer channel, including the on-board announcements, which were loaded at departure from Hamburg with the planned run to Köln Hbf.\n\nThe train ends at Köln Messe/Deutz on platform 1 (arrival 09:16); Köln Hbf is not served. The journey planner's import missed the 07:30 cycle.\n\nNo value is to be typed by hand. With the re-publication, every channel is expected to be aligned after {{V1.sync}} minutes."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Köln",
              subject: "ICE 1025 ends at Köln Messe/Deutz today",
              body: "App-Push (DE): ICE 1025 endet heute in Köln Messe/Deutz (an 09:16) und fährt nicht bis Köln Hbf. Weiter nach Köln Hbf: {{alt.T-1025.KK.onboard.de}}.\nApp push (EN): ICE 1025 terminates at Köln Messe/Deutz today (arriving 09:16) and does not continue to Köln Hbf. Onward to Köln Hbf: {{alt.T-1025.KK.onboard.en}}.\n\nZugansage (DE): Information zu Ihrer Reise: Dieser Zug endet heute in Köln Messe/Deutz. Reisende nach Köln Hbf steigen bitte in Köln Messe/Deutz aus und nutzen {{alt.T-1025.KK.onboard.de}}.\nOn-board announcement (EN): Information on your journey: this train terminates at Köln Messe/Deutz today. Passengers for Köln Hbf, please change at Köln Messe/Deutz to {{alt.T-1025.KK.onboard.en}}."
            } },
            { awaitActions: true },
            { report: "## ICE 1025: terminus moved to Köln Messe/Deutz\n\n**What we found.** Since 07:17 the source ends ICE 1025 at Köln Messe/Deutz on platform 1 (OPS-04, points failure W 32 at Köln Hbf); train positioning and the point diagnostics confirm it. The station displays show the new terminus; the journey planner (import missed the 07:30 cycle) and the on-board announcements (loaded in Hamburg) still say Köln Hbf.\n\n**If we do nothing.** {{pax}} of {{affected}} passengers for Köln Hbf act on the wrong destination, deciding in {{first_min}} minutes; the planner catches up at {{next_cycle}}, the announcements never do.\n\n**Decision.** Option A approved: re-publication of ICE 1025 from the source, with a reload of the on-board announcements and an app message.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V1.mis}} |\n| Right information from | – | +{{V1.from}} min |\n| Every channel aligned with the source | never | after {{V1.sync}} min |\n| Hand-kept values | – | {{V1.ov}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** Passengers without the app depend on the reloaded on-board announcements.\n\n**How we know.** The new terminus from the operations log and the source timetable; each channel's version from the published view; train position and points failure from the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the app message and the briefing for the train crew; the planner catches up in the next cycle." },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Köln",
              subject: "ICE 1025 ends at Köln Messe/Deutz today",
              body: "App-Push (DE): ICE 1025 endet heute in Köln Messe/Deutz (an 09:16) und fährt nicht bis Köln Hbf. Weiter nach Köln Hbf: {{alt.T-1025.KK.onboard.de}}.\nApp push (EN): ICE 1025 terminates at Köln Messe/Deutz today (arriving 09:16) and does not continue to Köln Hbf. Onward to Köln Hbf: {{alt.T-1025.KK.onboard.en}}."
            } },
            { draft: {
              type: "staff_brief", recipient: "Train crew of ICE 1025",
              subject: "Announce the new terminus Köln Messe/Deutz before arrival",
              body: "ICE 1025 ends today at Köln Messe/Deutz on platform 1 (OPS-04); the automatic announcements still say Köln Hbf. Please announce the new terminus well before arrival and point passengers for Köln Hbf to {{alt.T-1025.KK.onboard.en}}."
            } },
            { awaitActions: true },
            { report: "## ICE 1025: terminus moved to Köln Messe/Deutz\n\n**What we found.** Since 07:17 the source ends ICE 1025 at Köln Messe/Deutz (OPS-04); the station displays show it, the journey planner and the on-board announcements still say Köln Hbf.\n\n**If we do nothing.** {{pax}} of {{affected}} passengers for Köln Hbf act on the wrong destination, deciding in {{first_min}} minutes.\n\n**Decision.** Option B approved: an app message and the train crew announcing the new terminus; the planner catches up at {{next_cycle}}.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V2.mis}} |\n| Right information from | – | +{{V2.from}} min |\n| Every channel aligned with the source | never | {{V2.sync}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The automatic announcements keep saying Köln Hbf.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the override request for the on-board announcements and the app message; the request says when the override must go." },
            { draft: {
              type: "override_request", recipient: "On-board systems desk, long-distance traffic",
              subject: "Override the on-board announcements of ICE 1025: terminus Köln Messe/Deutz",
              body: "Please override the automatic announcements of ICE 1025 by hand: terminus Köln Messe/Deutz (arrival 09:16, platform 1) instead of Köln Hbf.\n\nBasis: OPS-04 (07:17) in the source.\n\nThis is a hand-kept value: remove the override once ICE 1025 is re-published from the source, at the end of the run at the latest."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Köln",
              subject: "ICE 1025 ends at Köln Messe/Deutz today",
              body: "App-Push (DE): ICE 1025 endet heute in Köln Messe/Deutz (an 09:16). Weiter nach Köln Hbf: {{alt.T-1025.KK.onboard.de}}.\nApp push (EN): ICE 1025 terminates at Köln Messe/Deutz today (arriving 09:16). Onward to Köln Hbf: {{alt.T-1025.KK.onboard.en}}."
            } },
            { awaitActions: true },
            { report: "## ICE 1025: terminus moved to Köln Messe/Deutz\n\n**What we found.** Since 07:17 the source ends ICE 1025 at Köln Messe/Deutz (OPS-04); the journey planner and the on-board announcements still say Köln Hbf.\n\n**If we do nothing.** {{pax}} of {{affected}} passengers for Köln Hbf act on the wrong destination, deciding in {{first_min}} minutes.\n\n**Decision.** Option C approved: the on-board announcements overridden by hand, and an app message.\n\n| | Do nothing | Option C |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V3.mis}} |\n| Hand-kept values (second truth) | – | {{V3.ov}} |\n| Every channel aligned with the source | never | {{V3.sync}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The override must be removed after the run; the planner catches up only at {{next_cycle}}.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "You accepted the risk. Nothing is published and nothing is requested; I record the decision in an internal memo." },
            { draft: {
              type: "memo", recipient: "Passenger information desk, Köln",
              subject: "ICE 1025 terminus Köln Messe/Deutz: risk accepted, no publication",
              body: "Decision recorded: no action on ICE 1025.\n\nThe source ends the train at Köln Messe/Deutz since 07:17 (OPS-04); the journey planner and the on-board announcements still say Köln Hbf. If nothing changes, {{pax}} passengers act on the wrong destination, deciding in {{first_min}} minutes.\n\nPlease review if the situation changes."
            } },
            { awaitActions: true },
            { report: "## ICE 1025: terminus moved to Köln Messe/Deutz\n\n**What we found.** Since 07:17 the source ends ICE 1025 at Köln Messe/Deutz (OPS-04); the journey planner and the on-board announcements still say Köln Hbf.\n\n**Decision.** The risk was accepted: nothing is published and nothing is requested.\n\n**What that means.** {{pax}} passengers act on the wrong destination, deciding in {{first_min}} minutes; the planner catches up at {{next_cycle}}, the announcements never do.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts (the decision memo) approved.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },

  "SC-COACH": {
    title: "Reversed coach order on ICE 516",
    steps: [
      { state: "scanning" },
      { say: "Lead received from the train manager of ICE 516 during preparation in Köln: the train runs in reverse order today, first class at the other end. Operations log first." },
      { mirror: { train_ids: ["T-516"], state: "at_risk", focus: "T-516" } },
      { tool: "ops_list_changes", input: { train: "ICE 516" } },
      { say: "Finding: OPS-01, from vehicle dispatching at 06:41. The set of ICE 516 was turned in the depot at Köln-Deutzerfeld, so car 27 runs at the front and first class at the rear. Source version 2 carries the reversed order." },
      { tool: "kfp_get_published", input: { train: "ICE 516", channel: "coach" } },
      { say: "Hypothesis: the coach order in the app and on the platform coach-position displays comes from the vehicle plan of 05:30 and still shows first class in sector G–H. The train manager is in Köln, so I assume the boarding at Köln Hbf is the problem." },

      { state: "verifying" },
      { sync: "hypothesis" },
      { say: "First estimate for Köln Hbf: {{hyp.pax}} passengers with seat reservations would wait at the wrong end of the platform; the first in {{hyp.first_min}} minutes, for the departure at 08:12. The engine marks the scope as partial: stops with the same contradiction are left out." },

      { tool: "ops_get_timetable", input: { train: "ICE 516" } },
      { tool: "phys_observe", input: { train: "ICE 516" } },
      { say: "Confirmed: the RFID reader at the depot exit recorded ICE 516 at 06:58 with car 27 at the front and car 21 at the rear. The physical order matches the source, not the coach-order feed." },
      { tool: "kfp_get_published", input: { train: "ICE 516" } },
      { say: "Check: the timetable channels are current; only the coach-order feed is behind, and it is behind at every stop: Düsseldorf Hbf, Duisburg Hbf, Essen Hbf and Bochum Hbf show the same sectors as Köln Hbf." },
      { say: "Revised: Köln Hbf only → every boarding stop. The coach-order feed is not refreshed when a set is turned, so the wrong sectors travel with the train." },
      { alert: {
        title: "ICE 516: the coach-position displays show first class at the wrong end, at every stop",
        severity: "high",
        basis: "verified",
        summary: "Since 06:41 the source has ICE 516 running in reverse order (OPS-01), and the RFID reading at the depot exit confirms car 27 at the front. The app and the platform coach-position displays still show the order from the vehicle plan of 05:30.",
        train_ids: ["T-516"],
        point_ids: ["KK"],
        sources: [
          { title: "Operations log OPS-01: vehicle dispatching, set turned (synthetic)" },
          { title: "RFID car reading, depot exit Köln-Deutzerfeld (synthetic)" }
        ]
      } },

      { state: "simulating" },
      { tool: "ops_get_passengers", input: { train: "ICE 516" } },
      { say: "Finding: 112 passengers board at Köln Hbf with seat reservations, and more join at every stop to Bochum Hbf." },
      { sync: "finding" },
      { say: "Impact: {{pax}} passengers with reservations would wait at the wrong end of the platform, across {{contra}} stops; the first in {{first_min}} minutes at Köln Hbf. The source puts first class in sector {{T-516.KK.coach_order.first_src}} and the restaurant in {{T-516.KK.coach_order.rest_src}}; the feed shows first class in {{T-516.KK.coach_order.first_pub}}." },
      { mirror: { train_ids: ["T-516"], state: "affected" } },

      { options: {
        recommended: "V1",
        baseline_description: "The coach-order feed keeps the plan of 05:30 at every stop; {{pax}} passengers with reservations wait at the wrong end.",
        texts: {
          V1: {
            title: "Refresh the coach order from the source",
            description: "Re-publish ICE 516's coach order to the app and the coach-position displays, and announce the reversal.",
            residual_risk: "Passengers already standing at their sector rely on the announcement."
          },
          V2: {
            title: "Announcements, app push and platform staff",
            description: "Announce the reversed order on the platforms, push it to the app, brief staff; the feed stays as it is.",
            residual_risk: "The coach-position displays keep the wrong sectors at every stop."
          },
          V3: {
            title: "Platform announcements only",
            description: "Announce the reversed order on the platforms of each stop, nothing else.",
            residual_risk: "App users and the coach-position displays keep the wrong sectors."
          }
        }
      } },
      { say: "Recommendation: option A. It leaves {{V1.mis}} passengers misinformed instead of {{pax}}, and the coach order is aligned with the source again after {{V1.sync}} minutes. Option B leaves {{V2.mis}}: the displays keep showing the wrong sectors." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. B relies on announcements, the app and staff; C on announcements alone.",
          V2: "Option B rejected. A refreshes the coach order from the source; C announces it only.",
          V3: "Option C rejected. A refreshes the coach order from the source; B adds the app and staff to the announcements."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the coach-order refresh and the passenger message." },
            { draft: {
              type: "republish_order", recipient: "Timetable publication team (coach order)",
              subject: "Refresh the coach order of ICE 516 from the source (OPS-01, reversed)",
              body: "Please re-publish the coach order of ICE 516 from source version 2 (OPS-01, 06:41) to the app and the platform coach-position displays at every stop.\n\nWhy: the set was turned in the depot; car 27 runs at the front and first class at the rear. The coach-order feed still carries the vehicle plan of 05:30 and is not refreshed when a set is turned.\n\nNo value is to be typed by hand. With the refresh, the coach order is expected to be aligned after {{V1.sync}} minutes."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, region Rhein-Ruhr",
              subject: "ICE 516 runs in reverse order today",
              body: "App-Push (DE): ICE 516 nach Berlin Hbf fährt heute in umgekehrter Wagenreihung. 1. Klasse in Abschnitt {{T-516.KK.coach_order.first_src}}, Bordrestaurant in {{T-516.KK.coach_order.rest_src}}, 2. Klasse in {{T-516.KK.coach_order.second_src}}.\nApp push (EN): ICE 516 to Berlin Hbf runs in reverse order today: first class in sector {{T-516.KK.coach_order.first_src}}, restaurant in {{T-516.KK.coach_order.rest_src}}, second class in {{T-516.KK.coach_order.second_src}}.\n\nAnsage Köln Hbf, Düsseldorf Hbf, Duisburg Hbf, Essen Hbf und Bochum Hbf (DE): Information zu ICE 516 nach Berlin Hbf: Der Zug fährt heute in umgekehrter Wagenreihung. Die Wagen der 1. Klasse halten in Abschnitt {{T-516.KK.coach_order.first_src}}.\nAnnouncement at Köln Hbf, Düsseldorf Hbf, Duisburg Hbf, Essen Hbf and Bochum Hbf (EN): ICE 516 to Berlin Hbf runs in reverse order today. First class stops in sector {{T-516.KK.coach_order.first_src}}."
            } },
            { awaitActions: true },
            { report: "## ICE 516: reversed coach order\n\n**What we found.** Since 06:41 the source has ICE 516 in reverse order (OPS-01: the set was turned in the depot), and the RFID reading at the depot exit confirms car 27 at the front. The timetable channels are current, but the coach-order feed still carries the vehicle plan of 05:30 at every stop: first class shown in {{T-516.KK.coach_order.first_pub}}, really in {{T-516.KK.coach_order.first_src}}.\n\n**If we do nothing.** {{pax}} passengers with reservations wait at the wrong end of the platform, at {{contra}} stops, the first in {{first_min}} minutes.\n\n**Decision.** Option A approved: the coach order refreshed from the source, with an app message and platform announcements.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V1.mis}} |\n| Right information from | – | +{{V1.from}} min |\n| Every channel aligned with the source | never | after {{V1.sync}} min |\n| Hand-kept values | – | {{V1.ov}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** Passengers already at their sector rely on the announcement.\n\n**How we know.** The reversed order from the operations log and the source; the old order from the coach-order feed; the physical order from the RFID reading; reservations from today's passenger figures; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the passenger message and the briefing for the platform staff; the coach-order feed stays as it is." },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, region Rhein-Ruhr",
              subject: "ICE 516 runs in reverse order today",
              body: "App-Push (DE): ICE 516 nach Berlin Hbf fährt heute in umgekehrter Wagenreihung: 1. Klasse in Abschnitt {{T-516.KK.coach_order.first_src}}, Bordrestaurant in {{T-516.KK.coach_order.rest_src}}.\nApp push (EN): ICE 516 to Berlin Hbf runs in reverse order today: first class in sector {{T-516.KK.coach_order.first_src}}, restaurant in {{T-516.KK.coach_order.rest_src}}.\n\nAnsage (DE): ICE 516 nach Berlin Hbf fährt heute in umgekehrter Wagenreihung; die 1. Klasse hält in Abschnitt {{T-516.KK.coach_order.first_src}}.\nAnnouncement (EN): ICE 516 to Berlin Hbf runs in reverse order today; first class stops in sector {{T-516.KK.coach_order.first_src}}."
            } },
            { draft: {
              type: "staff_brief", recipient: "Platform staff Köln Hbf, Düsseldorf Hbf, Duisburg Hbf, Essen Hbf and Bochum Hbf",
              subject: "ICE 516 in reverse order: the coach-position displays are wrong",
              body: "ICE 516 runs in reverse order today (OPS-01); the coach-position displays still show first class in {{T-516.KK.coach_order.first_pub}}. First class stops in sector {{T-516.KK.coach_order.first_src}}, the restaurant in sector {{T-516.KK.coach_order.rest_src}}. Please point passengers with reservations to the right sector before the train arrives."
            } },
            { awaitActions: true },
            { report: "## ICE 516: reversed coach order\n\n**What we found.** Since 06:41 the source has ICE 516 in reverse order (OPS-01), confirmed by the RFID reading; the coach-order feed still shows the vehicle plan of 05:30 at every stop.\n\n**If we do nothing.** {{pax}} passengers with reservations wait at the wrong end, the first in {{first_min}} minutes.\n\n**Decision.** Option B approved: announcements, an app message and platform staff; the coach-order feed stays as it is.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V2.mis}} |\n| Right information from | – | +{{V2.from}} min |\n| Every channel aligned with the source | never | {{V2.sync}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The coach-position displays keep the wrong sectors at every stop.\n\n**How we know.** The operations log, the source, the coach-order feed and the RFID reading; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the platform announcements; nothing else changes." },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, region Rhein-Ruhr",
              subject: "Platform announcement: ICE 516 in reverse order",
              body: "Ansage Köln Hbf, Düsseldorf Hbf, Duisburg Hbf, Essen Hbf und Bochum Hbf (DE): Information zu ICE 516 nach Berlin Hbf: Der Zug fährt heute in umgekehrter Wagenreihung. Die 1. Klasse hält in Abschnitt {{T-516.KK.coach_order.first_src}}, das Bordrestaurant in {{T-516.KK.coach_order.rest_src}}.\nAnnouncement at Köln Hbf, Düsseldorf Hbf, Duisburg Hbf, Essen Hbf and Bochum Hbf (EN): ICE 516 to Berlin Hbf runs in reverse order today. First class stops in sector {{T-516.KK.coach_order.first_src}}, the restaurant in {{T-516.KK.coach_order.rest_src}}."
            } },
            { awaitActions: true },
            { report: "## ICE 516: reversed coach order\n\n**What we found.** Since 06:41 the source has ICE 516 in reverse order (OPS-01); the coach-order feed still shows the plan of 05:30 at every stop.\n\n**If we do nothing.** {{pax}} passengers with reservations wait at the wrong end, the first in {{first_min}} minutes.\n\n**Decision.** Option C approved: platform announcements at every stop.\n\n| | Do nothing | Option C |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V3.mis}} |\n| Right information from | – | +{{V3.from}} min |\n| Every channel aligned with the source | never | {{V3.sync}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** App users and the coach-position displays keep the wrong sectors.\n\n**How we know.** The operations log, the source, the coach-order feed and the RFID reading; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "You accepted the risk. Nothing is published and nothing is requested; I record the decision in an internal memo." },
            { draft: {
              type: "memo", recipient: "Passenger information desk, region Rhein-Ruhr",
              subject: "ICE 516 reversed coach order: risk accepted, no publication",
              body: "Decision recorded: no action on ICE 516.\n\nThe source has the train in reverse order since 06:41 (OPS-01); the coach-order feed still shows the plan of 05:30. If nothing changes, {{pax}} passengers with reservations wait at the wrong end, the first in {{first_min}} minutes.\n\nPlease review if the situation changes."
            } },
            { awaitActions: true },
            { report: "## ICE 516: reversed coach order\n\n**What we found.** Since 06:41 the source has ICE 516 in reverse order (OPS-01); the coach-order feed still shows the plan of 05:30.\n\n**Decision.** The risk was accepted: nothing is published and nothing is requested.\n\n**What that means.** {{pax}} passengers with reservations wait at the wrong end of the platform, the first in {{first_min}} minutes.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts (the decision memo) approved.\n\n**How we know.** The operations log, the source, the coach-order feed and the RFID reading; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },

  "SC-FPLO": {
    title: "Construction order breaks a connection in Dortmund",
    steps: [
      { state: "scanning" },
      { say: "Lead received from the construction office: a timetable order for Bochum – Dortmund, a speed restriction of 'about four minutes', went out this morning. The question is what passengers are told about Dortmund and their connections. First the order itself." },
      { mirror: { view: "monitor", state: "neutral" } },
      { tool: "ops_list_changes", input: { kind: "fplo" } },
      { say: "Finding: Fplo 1187, released by construction planning at 06:50. A 70 km/h restriction between Bochum Hbf and Dortmund Hbf for track works has been in place since 06:30; from 08:00 to 14:00 the order adds +4.0 min from Bochum Hbf to trains 612 and 10109." },
      { mirror: { train_ids: ["T-612"], state: "at_risk", focus: "T-612" } },
      { tool: "kfp_get_published", input: { train: "ICE 612", channel: "planner" } },
      { say: "Hypothesis: ICE 612's customer information still shows the arrival at Dortmund Hbf at 09:56. Construction orders are processed in the daily generation at 05:30, and this one came out at 06:50. I start with ICE 612, the long-distance train." },

      { state: "verifying" },
      { sync: "hypothesis" },
      { say: "First estimate for ICE 612: {{hyp.pax}} passengers would act on wrong information, and the planner shows the connection to RE 57 at Dortmund as reachable: {{hyp.T-612.EDO.connection.src}}. The engine marks the scope as partial: the same order slows another train whose information is wrong too." },

      { tool: "ops_get_timetable", input: { train: "ICE 612" } },
      { tool: "phys_observe", input: { point: "EBO" } },
      { say: "Confirmed: the running-time measurement between Bochum Hbf and Dortmund Hbf shows today's trains 3.8 and 4.1 minutes slower than the timetable at the restriction: the +4 minutes are real." },
      { tool: "kfp_get_published", input: { train: "RE 10109" } },
      { say: "Check: RE 10109 runs into the same restriction, and its channels still show the old arrival at Dortmund Hbf, 09:47." },
      { tool: "ops_get_passengers", input: { train: "ICE 612" } },
      { say: "Finding: 46 passengers on ICE 612 plan to change at Dortmund Hbf to RE 57 to Winterberg (Westf) at 10:01, with a 4-minute minimum transfer." },
      { say: "Revised: ICE 612 alone → ICE 612 and RE 10109. Both trains reach Dortmund Hbf later than shown, and the connection to RE 57 that the planner offers is lost." },
      { alert: {
        title: "ICE 612 and RE 10109 arrive in Dortmund later than shown; the RE 57 connection is lost",
        severity: "medium",
        basis: "verified",
        summary: "Fplo 1187 (06:50) adds +4.0 min from Bochum Hbf to both trains, and the running-time measurement confirms it. The customer timetable comes from the daily run at 05:30 and still shows the old arrivals and the connection to RE 57 at 10:01.",
        train_ids: ["T-612", "T-10109"],
        point_ids: ["EDO", "EBO"],
        sources: [
          { title: "Operations log OPS-02: Fplo 1187, construction planning (synthetic)" },
          { title: "Running-time measurement Bochum Hbf – Dortmund Hbf (synthetic)" }
        ]
      } },

      { state: "simulating" },
      { tool: "ops_get_passengers", input: { train: "RE 10109" } },
      { sync: "finding" },
      { say: "Impact: {{pax}} passengers would act on wrong information, the first in {{first_min}} minutes; {{T-612.EDO.connection.pax}} of them miss RE 57 without warning. Without a re-publication the old times stay until tomorrow's daily run. The next RE 57: {{alt.T-612.EDO.onboard.en}}." },
      { mirror: { train_ids: ["T-612", "T-10109"], point_ids: ["EDO"], state: "affected", focus: "T-612" } },

      { options: {
        recommended: "V1",
        baseline_description: "The old arrivals and the connection to RE 57 stay in every channel until tomorrow's daily run; {{pax}} passengers act on them.",
        texts: {
          V1: {
            title: "Re-publish, ask dispatch to hold RE 57",
            description: "Re-publish ICE 612 and RE 10109, ask dispatch to hold RE 57, and tell the passengers.",
            residual_risk: "Dispatch decides; a hold delays the passengers already on RE 57."
          },
          V2: {
            title: "Re-publish both, announce the lost connection",
            description: "Re-publish ICE 612 and RE 10109 and tell passengers the connection to RE 57 is lost.",
            residual_risk: "The passengers who change wait for the next RE 57."
          },
          V3: {
            title: "Messages only, data at tomorrow's run",
            description: "Message the app, the announcements and the planner, and leave the data to tomorrow's daily generation.",
            residual_risk: "Every channel keeps the old times until tomorrow."
          }
        }
      } },
      { say: "Recommendation: option A. It leaves {{V1.mis}} passengers misinformed, and if dispatch agrees, {{V1.held}} passengers keep their connection while RE 57 leaves {{V1.wait}} minutes late. Option B leaves {{V2.mis}} misinformed and the connection lost." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. B re-publishes and announces the lost connection; C informs without touching the data.",
          V2: "Option B rejected. A also asks dispatch to hold the connection; C informs without touching the data.",
          V3: "Option C rejected. A and B both re-publish from the source."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. Drafting the re-publication order, the hold request to dispatch and the passenger message." },
            { draft: {
              type: "republish_order", recipient: "Timetable publication team",
              subject: "Re-publish ICE 612 and RE 10109 with Fplo 1187 (OPS-02)",
              body: "Please re-publish ICE 612 and RE 10109 from source version 2 (OPS-02, Fplo 1187, released 06:50) to every customer channel. The order adds +4.0 min from Bochum Hbf; the daily generation at 05:30 did not include it, and the half-hourly cycle processes dispatch changes only.\n\nNo value is to be typed by hand. With the re-publication, every channel is expected to be aligned after {{V1.sync}} minutes."
            } },
            { draft: {
              type: "hold_request", recipient: "Dispatch (Transportleitung), Dortmund",
              subject: "Request: hold RE 57 (10:01) at Dortmund Hbf for ICE 612",
              body: "Please consider holding RE 57 to Winterberg (Westf), departing Dortmund Hbf at 10:01, for {{V1.wait}} minutes: ICE 612 now arrives at {{T-612.EDO.time.arr}} instead of 09:56 because of Fplo 1187.\n\n46 passengers change from ICE 612 to RE 57 (4-minute minimum transfer). Holding delays {{V1.delayed}} passengers on RE 57; otherwise the next RE 57 leaves an hour later.\n\nDispatch decides; nothing changes until dispatch acts."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Dortmund",
              subject: "ICE 612 and RE 10109: later arrival at Dortmund Hbf (construction works)",
              body: "App-Push (DE): ICE 612: wegen Bauarbeiten zwischen Bochum und Dortmund Ankunft in Dortmund Hbf {{T-612.EDO.time.arr}} statt 09:56. Der Anschluss an RE 57 nach Winterberg (Westf) um 10:01 wird bei der Disposition angefragt; falls er nicht gehalten wird: {{alt.T-612.EDO.onboard.de}}.\nApp push (EN): ICE 612: because of construction works between Bochum and Dortmund, arrival at Dortmund Hbf {{T-612.EDO.time.arr}} instead of 09:56. Dispatch has been asked to hold the connection to RE 57 to Winterberg (Westf) at 10:01; if it is not held: {{alt.T-612.EDO.onboard.en}}.\n\nApp-Push (DE): RE 10109: Ankunft in Dortmund Hbf {{T-10109.EDO.time.arr}} statt 09:47 (Bauarbeiten).\nApp push (EN): RE 10109: arrival at Dortmund Hbf {{T-10109.EDO.time.arr}} instead of 09:47 (construction works).\n\nZugansage ICE 612 (DE): Wegen Bauarbeiten erreichen wir Dortmund Hbf einige Minuten später. Reisende nach Winterberg: Ihr Anschluss an RE 57 wird angefragt.\nOn-board announcement ICE 612 (EN): Because of construction works we reach Dortmund Hbf a few minutes late. Passengers for Winterberg: your connection to RE 57 has been requested."
            } },
            { awaitActions: true },
            { report: "## ICE 612 and RE 10109: construction order Bochum – Dortmund\n\n**What we found.** Fplo 1187 (released 06:50) adds +4.0 min from Bochum Hbf to ICE 612 and RE 10109; the running-time measurement confirms it. The customer timetable comes from the daily run at 05:30 and still shows the old arrivals at Dortmund Hbf, and the connection from ICE 612 to RE 57 (10:01) as reachable: {{T-612.EDO.connection.src}}.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes, and {{T-612.EDO.connection.pax}} miss RE 57 without warning.\n\n**Decision.** Option A approved: re-publication of both trains from the source, a request to dispatch to hold RE 57 and a passenger message.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V1.mis}} |\n| Right information from | – | +{{V1.from}} min |\n| Every channel aligned with the source | never | after {{V1.sync}} min |\n| Connection kept (if dispatch agrees) | – | {{V1.held}} passengers |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published or requested.\n\n**Residual risk.** Dispatch decides on the hold; a hold delays RE 57 by {{V1.wait}} minutes for {{V1.delayed}} passengers.\n\n**How we know.** The order from the operations log and the source timetable; the old times from every published channel; the slower section from the physical layer; connections from today's passenger figures; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. Drafting the re-publication order and the passenger message about the lost connection." },
            { draft: {
              type: "republish_order", recipient: "Timetable publication team",
              subject: "Re-publish ICE 612 and RE 10109 with Fplo 1187 (OPS-02)",
              body: "Please re-publish ICE 612 and RE 10109 from source version 2 (OPS-02, Fplo 1187, released 06:50) to every customer channel. The order adds +4.0 min from Bochum Hbf and was not part of the daily generation at 05:30.\n\nNo value is to be typed by hand. With the re-publication, every channel is expected to be aligned after {{V2.sync}} minutes."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Dortmund",
              subject: "ICE 612: connection to RE 57 at Dortmund Hbf lost",
              body: "App-Push (DE): ICE 612: wegen Bauarbeiten Ankunft in Dortmund Hbf {{T-612.EDO.time.arr}} statt 09:56. Der Anschluss an RE 57 nach Winterberg (Westf) um 10:01 ist nicht erreichbar; nächste Verbindung: {{alt.T-612.EDO.onboard.de}}.\nApp push (EN): ICE 612: because of construction works, arrival at Dortmund Hbf {{T-612.EDO.time.arr}} instead of 09:56. The connection to RE 57 to Winterberg (Westf) at 10:01 cannot be made; next connection: {{alt.T-612.EDO.onboard.en}}.\n\nApp-Push (DE): RE 10109: Ankunft in Dortmund Hbf {{T-10109.EDO.time.arr}} statt 09:47.\nApp push (EN): RE 10109: arrival at Dortmund Hbf {{T-10109.EDO.time.arr}} instead of 09:47."
            } },
            { awaitActions: true },
            { report: "## ICE 612 and RE 10109: construction order Bochum – Dortmund\n\n**What we found.** Fplo 1187 (06:50) adds +4.0 min from Bochum Hbf to both trains; the customer timetable still shows the old arrivals and the RE 57 connection as reachable.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\n**Decision.** Option B approved: re-publication of both trains from the source and an announcement of the lost connection.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V2.mis}} |\n| Right information from | – | +{{V2.from}} min |\n| Every channel aligned with the source | never | after {{V2.sync}} min |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The passengers who change wait for the next RE 57.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. Drafting the passenger message; the data waits for tomorrow's daily run." },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, Dortmund",
              subject: "ICE 612 and RE 10109: later arrival at Dortmund Hbf",
              body: "App-Push und Reiseauskunft (DE): ICE 612: wegen Bauarbeiten Ankunft in Dortmund Hbf {{T-612.EDO.time.arr}} statt 09:56; der Anschluss an RE 57 um 10:01 ist nicht erreichbar, nächste Verbindung: {{alt.T-612.EDO.onboard.de}}. RE 10109: Ankunft {{T-10109.EDO.time.arr}} statt 09:47.\nApp push and journey planner (EN): ICE 612: because of construction works, arrival at Dortmund Hbf {{T-612.EDO.time.arr}} instead of 09:56; the connection to RE 57 at 10:01 cannot be made, next connection: {{alt.T-612.EDO.onboard.en}}. RE 10109: arrival {{T-10109.EDO.time.arr}} instead of 09:47."
            } },
            { awaitActions: true },
            { report: "## ICE 612 and RE 10109: construction order Bochum – Dortmund\n\n**What we found.** Fplo 1187 (06:50) adds +4.0 min from Bochum Hbf to both trains; the customer timetable still shows the old arrivals and the RE 57 connection as reachable.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\n**Decision.** Option C approved: messages on the app, the announcements and the planner; the data waits for tomorrow's daily run.\n\n| | Do nothing | Option C |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V3.mis}} |\n| Every channel aligned with the source | never | {{V3.sync}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** Every channel keeps the old times until tomorrow.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "You accepted the risk. Nothing is published and nothing is requested; I record the decision in an internal memo." },
            { draft: {
              type: "memo", recipient: "Passenger information desk, Dortmund",
              subject: "Fplo 1187 (ICE 612, RE 10109): risk accepted, no publication",
              body: "Decision recorded: no action on ICE 612 and RE 10109.\n\nFplo 1187 (06:50) adds +4.0 min from Bochum Hbf; the customer timetable still shows the old arrivals and the connection to RE 57 at 10:01. If nothing changes, {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\nPlease review if the situation changes."
            } },
            { awaitActions: true },
            { report: "## ICE 612 and RE 10109: construction order Bochum – Dortmund\n\n**What we found.** Fplo 1187 (06:50) adds +4.0 min from Bochum Hbf to both trains; the customer timetable still shows the old arrivals and the RE 57 connection.\n\n**Decision.** The risk was accepted: nothing is published and nothing is requested.\n\n**What that means.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes, until tomorrow's daily run.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts (the decision memo) approved.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  },

  "SC-EUROPE": {
    title: "ICE to Brussels: the European timetable lags",
    // Scenario 7, the European timetable. A partner railway's change for its own section reaches the
    // source (the operations log) at 06:12, after the European timetable's nightly merge: the journey
    // planner and the on-board announcements, which take cross-border trains from that timetable,
    // still show the old run; the station displays, fed by each railway's own data, are right.
    steps: [
      { state: "scanning" },
      { say: "Lead from the international service desk: passengers on ICE 318 to Bruxelles-Midi ask whether their connection to Oostende still works, as the partner railway has works in Belgium. A question is not a source: I read the operations log first." },
      { mirror: { train_ids: ["T-318"], state: "at_risk", focus: "T-318" } },
      { tool: "ops_list_changes", input: { train: "ICE 318" } },
      { say: "Finding: the partner railway delivered a change for its own section at 06:12 (OPS-06). Works between Liège-Guillemins and Bruxelles-Midi add +9.0 minutes from Liège; the section in Germany is unchanged. That delivery is the source now." },
      { tool: "kfp_get_published", input: { train: "ICE 318", channel: "planner" } },
      { say: "Hypothesis: only the app is behind. It takes cross-border trains from the European timetable, merged at 04:00, before the delivery, and still shows the arrival at Bruxelles-Midi at 09:33." },

      { state: "verifying" },
      { sync: "hypothesis" },
      { say: "First estimate, from the journey planner alone: {{hyp.pax}} passengers would act on the old arrival. Before I rely on that, I read every channel, the source timetable and the sensors." },

      { tool: "kfp_get_published", input: { train: "ICE 318" } },
      { tool: "ops_get_timetable", input: { train: "ICE 318" } },
      { tool: "phys_observe", input: { point: "XBLIG" } },
      { say: "Revised: only the app is behind → the on-board announcements come from the same European timetable and say 09:33 too. The station displays take each railway's data directly and say 09:42, as the source does." },
      { say: "Confirmed: the sensors agree with the source. The partner's first two trains on that section this morning ran +8.6 and +9.3 minutes late: the works are real." },
      { tool: "ops_get_passengers", input: { train: "ICE 318" } },
      { say: "Finding: 41 passengers on ICE 318 plan to change at Bruxelles-Midi to IC 2117 to Oostende at 09:42, with a 6-minute minimum transfer. Arriving at 09:42, they miss it." },
      { alert: {
        title: "ICE 318: app and announcements show 09:33 at Bruxelles-Midi, the source 09:42",
        severity: "high",
        basis: "verified",
        summary: "The partner railway's delivery of 06:12 (OPS-06) adds +9.0 min from Liège-Guillemins, and the running times measured on its section confirm the works. The journey planner and the on-board announcements take the train from the European timetable merged at 04:00: they still show 09:33 and the connection to IC 2117. The station displays show 09:42.",
        train_ids: ["T-318"],
        point_ids: ["XBB"],
        sources: [
          { title: "Operations log OPS-06: the partner railway's delivery for its section (synthetic)" },
          { title: "Running-time measurement Liège-Guillemins – Bruxelles-Midi (synthetic)" },
          { title: "Published customer timetable, all channels (synthetic)" }
        ]
      } },

      { state: "simulating" },
      { sync: "finding" },
      { say: "Impact: {{pax}} passengers would act on wrong information; the first decide at Liège-Guillemins in {{first_min}} minutes, and {{T-318.XBB.connection.pax}} would miss IC 2117 without warning. The European timetable is merged again only tonight." },
      { mirror: { train_ids: ["T-318"], point_ids: ["XBB"], state: "affected", focus: "T-318" } },

      { options: {
        recommended: "V1",
        baseline_description: "The app and the on-board announcements keep the old arrival and the connection to IC 2117 until tonight's merge; {{pax}} passengers act on them.",
        texts: {
          V1: {
            title: "Merge again and re-publish",
            description: "ICE 318 merged again from both railways' deliveries, checked and re-published to every channel, plus a message and the crew on board.",
            residual_risk: "A few miss the app, the announcement and the crew alike."
          },
          V2: {
            title: "Messages and crew only",
            description: "App push, announcements and a planner note, and the crew on board; the European timetable waits for tonight's merge.",
            residual_risk: "The European timetable stays wrong until tonight."
          },
          V3: {
            title: "Override the announcements",
            description: "The on-board announcements set by hand, plus an app message.",
            residual_risk: "The planner keeps the old arrival; the override is a second truth."
          }
        }
      } },
      { say: "Recommendation: option A. Like B, it leaves {{V1.mis}} instead of {{pax}} passengers misinformed, and it also puts the European timetable right: ICE 318 merged again from both railways' deliveries, every channel aligned after {{V1.sync}} minutes, nothing kept by hand." },

      { awaitOption: {
        rejected: {
          V1: "Option A rejected. B informs passengers without touching the data; C sets the announcements by hand.",
          V2: "Option B rejected. A merges the train again from the source; C sets the announcements by hand.",
          V3: "Option C rejected. A merges the train again from the source; B informs without touching the data."
        },
        approved: {
          V1: [
            { state: "executing" },
            { say: "Option A approved. I draft the passenger message, the order to merge ICE 318 again and the briefing for the train crew." },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, international trains",
              subject: "ICE 318 to Bruxelles-Midi: later arrival, connection to IC 2117 not reachable",
              body: "App-Push (DE): ICE 318 nach Bruxelles-Midi: Wegen Bauarbeiten in Belgien Ankunft {{T-318.XBB.time.arr}} statt 09:33. Der Anschluss an IC 2117 nach Oostende um 09:42 ist nicht erreichbar; nächste Verbindung: {{alt.T-318.XBB.onboard.de}}.\nApp push (EN): ICE 318 to Bruxelles-Midi: because of works in Belgium, arrival {{T-318.XBB.time.arr}} instead of 09:33. The connection to IC 2117 to Oostende at 09:42 cannot be made; next connection: {{alt.T-318.XBB.onboard.en}}.\n\nZugansage ICE 318 (DE): Wegen Bauarbeiten in Belgien erreichen wir Bruxelles-Midi um {{T-318.XBB.time.arr}}, nicht um 09:33. Reisende nach Oostende: Ihr Anschluss an IC 2117 um 09:42 ist nicht erreichbar. Nächste Verbindung: {{alt.T-318.XBB.onboard.de}}.\nOn-board announcement ICE 318 (EN): Because of works in Belgium we reach Bruxelles-Midi at {{T-318.XBB.time.arr}}, not 09:33. Passengers for Oostende: your connection to IC 2117 at 09:42 cannot be made. Next connection: {{alt.T-318.XBB.onboard.en}}."
            } },
            { draft: {
              type: "republish_order", recipient: "European timetable team (timetable publication)",
              subject: "Merge ICE 318 again from both deliveries and re-publish it (OPS-06)",
              body: "Please merge ICE 318 again in the European timetable from the current deliveries: the German section as it stands and the partner railway's delivery for the Belgian section of 06:12 (OPS-06, +9.0 min from Liège-Guillemins, source version 2). Check the merge against both deliveries, then re-publish the train to the journey planner and app and to the on-board announcements; the station displays already show it.\n\nNo value is typed by hand. Every channel is expected to be aligned after {{V1.sync}} minutes."
            } },
            { draft: {
              type: "staff_brief", recipient: "Train crew of ICE 318",
              subject: "ICE 318: later arrival at Bruxelles-Midi, passengers for Oostende",
              body: "ICE 318 reaches Bruxelles-Midi at {{T-318.XBB.time.arr}}, not 09:33 (OPS-06: works between Liège-Guillemins and Bruxelles-Midi, +9.0 min). Until the train is merged again, the journey planner and the on-board announcements still show 09:33 and the connection to IC 2117 to Oostende at 09:42.\n\nPlease tell passengers after Liège-Guillemins, and send the 41 passengers for Oostende to {{alt.T-318.XBB.onboard.en}}."
            } },
            { awaitActions: true },
            { report: "## ICE 318: the European timetable behind the partner's change\n\n**What we found.** The partner railway delivered a change for its section of ICE 318 at 06:12 (OPS-06): works between Liège-Guillemins and Bruxelles-Midi add +9.0 min, and the running times measured there confirm it. The journey planner and app and the on-board announcements take the train from the European timetable merged at 04:00: they still show the arrival at Bruxelles-Midi at 09:33 instead of {{T-318.XBB.time.arr}}, and the connection to IC 2117 to Oostende as reachable. The station displays already show {{T-318.XBB.time.arr}}.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes, and {{T-318.XBB.connection.pax}} miss IC 2117 without warning; the European timetable is merged again only tonight.\n\n**Decision.** Option A approved: ICE 318 merged again from both railways' deliveries and re-published, with a message on the app and on board, and the crew briefed.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V1.mis}} |\n| Right information from | – | +{{V1.from}} min |\n| Every channel aligned with the source | at tonight's merge | after {{V1.sync}} min |\n| Values kept by hand | – | {{V1.ov}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The merge is checked against both deliveries before it is released; until then the message and the crew carry the change.\n\n**How we know.** The partner railway's delivery in the operations log and the source timetable; the old arrival from the published channels; the running times from the physical layer; the connection from today's passenger figures; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V2: [
            { state: "executing" },
            { say: "Option B approved. I draft the passenger message and the briefing for the train crew; the European timetable stays as it is until tonight's merge." },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, international trains",
              subject: "ICE 318 to Bruxelles-Midi: later arrival, connection to IC 2117 not reachable",
              body: "App-Push (DE): ICE 318 nach Bruxelles-Midi: Wegen Bauarbeiten in Belgien Ankunft {{T-318.XBB.time.arr}} statt 09:33. Der Anschluss an IC 2117 nach Oostende um 09:42 ist nicht erreichbar; nächste Verbindung: {{alt.T-318.XBB.onboard.de}}.\nApp push (EN): ICE 318 to Bruxelles-Midi: because of works in Belgium, arrival {{T-318.XBB.time.arr}} instead of 09:33. The connection to IC 2117 to Oostende at 09:42 cannot be made; next connection: {{alt.T-318.XBB.onboard.en}}.\n\nZugansage ICE 318 (DE): Wegen Bauarbeiten in Belgien erreichen wir Bruxelles-Midi um {{T-318.XBB.time.arr}}, nicht um 09:33. Reisende nach Oostende: Ihr Anschluss an IC 2117 um 09:42 ist nicht erreichbar.\nOn-board announcement ICE 318 (EN): Because of works in Belgium we reach Bruxelles-Midi at {{T-318.XBB.time.arr}}, not 09:33. Passengers for Oostende: your connection to IC 2117 at 09:42 cannot be made.\n\nReiseauskunft (DE): ICE 318: Ankunft in Bruxelles-Midi {{T-318.XBB.time.arr}} statt 09:33; Anschluss an IC 2117 nicht erreichbar.\nJourney planner (EN): ICE 318: arrival at Bruxelles-Midi {{T-318.XBB.time.arr}} instead of 09:33; the connection to IC 2117 cannot be made."
            } },
            { draft: {
              type: "staff_brief", recipient: "Train crew of ICE 318",
              subject: "ICE 318: later arrival at Bruxelles-Midi, passengers for Oostende",
              body: "ICE 318 reaches Bruxelles-Midi at {{T-318.XBB.time.arr}}, not 09:33 (OPS-06: works between Liège-Guillemins and Bruxelles-Midi, +9.0 min). The journey planner and the on-board announcements still show 09:33 and the connection to IC 2117 to Oostende at 09:42.\n\nPlease tell passengers after Liège-Guillemins, and send the 41 passengers for Oostende to {{alt.T-318.XBB.onboard.en}}."
            } },
            { awaitActions: true },
            { report: "## ICE 318: the European timetable behind the partner's change\n\n**What we found.** The partner railway delivered a change for its section of ICE 318 at 06:12 (OPS-06): +9.0 min between Liège-Guillemins and Bruxelles-Midi. The journey planner and the on-board announcements take the train from the European timetable merged at 04:00 and still show 09:33 instead of {{T-318.XBB.time.arr}}, and the connection to IC 2117 as reachable.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\n**Decision.** Option B approved: messages on the app, the announcements and the planner, and the crew on board. The European timetable stays as it is until tonight's merge.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V2.mis}} |\n| Right information from | – | +{{V2.from}} min |\n| Every channel aligned with the source | at tonight's merge | at tonight's merge |\n| Contradictions left in the data | {{contra}} | {{V2.res}} |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The planner and the announcements keep the old arrival until the European timetable is merged again.\n\n**How we know.** The partner railway's delivery in the operations log and the source timetable; the old arrival from the published channels; the running times from the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          V3: [
            { state: "executing" },
            { say: "Option C approved. I draft the override request for the on-board announcements and the app message. The override is a value kept by hand: the request says when to remove it." },
            { draft: {
              type: "override_request", recipient: "Train crew of ICE 318 (on-board announcements)",
              subject: "Override for ICE 318: arrival at Bruxelles-Midi {{T-318.XBB.time.arr}} in the announcements",
              body: "Please set by hand in the on-board announcements of ICE 318:\n- arrival at Bruxelles-Midi: {{T-318.XBB.time.arr}} (published: 09:33)\n- connection to IC 2117 to Oostende at 09:42: not reachable\n\nBasis: OPS-06 (06:12) in the source; the running times on the partner's section confirm the works.\n\nRemove the override as soon as ICE 318 is merged again in the European timetable, or at Bruxelles-Midi at the latest."
            } },
            { draft: {
              type: "passenger_message", recipient: "Passenger information desk, international trains",
              subject: "ICE 318 to Bruxelles-Midi: later arrival, connection to IC 2117 not reachable",
              body: "App-Push (DE): ICE 318 nach Bruxelles-Midi: Wegen Bauarbeiten in Belgien Ankunft {{T-318.XBB.time.arr}} statt 09:33. Der Anschluss an IC 2117 nach Oostende um 09:42 ist nicht erreichbar; nächste Verbindung: {{alt.T-318.XBB.onboard.de}}.\nApp push (EN): ICE 318 to Bruxelles-Midi: because of works in Belgium, arrival {{T-318.XBB.time.arr}} instead of 09:33. The connection to IC 2117 to Oostende at 09:42 cannot be made; next connection: {{alt.T-318.XBB.onboard.en}}."
            } },
            { awaitActions: true },
            { report: "## ICE 318: the European timetable behind the partner's change\n\n**What we found.** The partner railway delivered a change for its section of ICE 318 at 06:12 (OPS-06): +9.0 min between Liège-Guillemins and Bruxelles-Midi. The journey planner and the on-board announcements still show 09:33 instead of {{T-318.XBB.time.arr}}, from the European timetable merged at 04:00.\n\n**If we do nothing.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\n**Decision.** Option C approved: the on-board announcements set by hand, and an app message.\n\n| | Do nothing | Option C |\n|---|---|---|\n| Passengers still misinformed | {{pax}} | {{V3.mis}} |\n| Right information from | – | +{{V3.from}} min |\n| Values kept by hand (second truth) | – | {{V3.ov}} |\n| Every channel aligned with the source | at tonight's merge | at tonight's merge, the override removed |\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts approved in the Outbox. They are drafts: nothing was published.\n\n**Residual risk.** The override is a second truth: it must be removed once the train is merged again, and the planner keeps the old arrival meanwhile.\n\n**How we know.** The partner railway's delivery in the operations log and the source timetable; the old arrival from the published channels; the running times from the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ],
          baseline: [
            { state: "executing" },
            { say: "You accepted the risk. Nothing is published and nothing is requested; I record the decision in an internal memo." },
            { draft: {
              type: "memo", recipient: "Passenger information desk, international trains",
              subject: "ICE 318 (OPS-06): risk accepted, no publication",
              body: "Decision recorded: no action on ICE 318 to Bruxelles-Midi.\n\nThe partner railway's delivery of 06:12 (OPS-06) adds +9.0 min from Liège-Guillemins; the journey planner and the on-board announcements still show 09:33 instead of {{T-318.XBB.time.arr}}, and the connection to IC 2117. If nothing changes, {{pax}} passengers act on wrong information, the first in {{first_min}} minutes.\n\nPlease review if the situation changes."
            } },
            { awaitActions: true },
            { report: "## ICE 318: the European timetable behind the partner's change\n\n**What we found.** The partner railway delivered a change for its section of ICE 318 at 06:12 (OPS-06); the journey planner and the on-board announcements still show 09:33 instead of {{T-318.XBB.time.arr}} at Bruxelles-Midi, and the connection to IC 2117.\n\n**Decision.** The risk was accepted: nothing is published and nothing is requested.\n\n**What that means.** {{pax}} passengers act on wrong information, the first in {{first_min}} minutes, until the European timetable is merged again tonight.\n\n**Actions.** {{actions.approved}} of {{actions.total}} drafts (the decision memo) approved.\n\n**How we know.** The operations log, the source timetable, every published channel and the physical layer; every figure from the deterministic sync engine.\n\n*Simulated run (scripted replay). Figures calculated by the sync engine from the synthetic operating snapshot.*" },
            { end: "done" }
          ]
        }
      } }
    ]
  }
};
