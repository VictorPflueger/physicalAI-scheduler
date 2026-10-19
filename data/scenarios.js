/*
 * TIMETABLE TRANSLATOR — injectable leads.
 *
 * Each scenario is only a short, UNVERIFIED lead ("seed") written the way a first hint typically
 * arrives at a passenger-information desk (a radio message, a staff chat, a customer complaint, a
 * station team's note, a train manager's report, the construction office). In Live mode the agent
 * receives the seed text and nothing else: it must find the train and the operational change in the
 * source, read what customers are told, confirm the change with the physical layer, quantify it with
 * the deterministic sync engine and propose options.
 *
 * `train_id` is the train the timetable mirror shows when the scenario is chosen or starts (the agent
 * never sees it). `exposure_check` is used ONLY by the offline integrity check (js/world_check.js) and
 * is never shown to the agent. `start_here` marks the scenario the five-minute pitch uses (the menu
 * says so); the others are there for questions.
 */
window.SCENARIOS = [
  {
    id: "SC-PLATFORM",
    number: 1,
    start_here: true,
    title: "Short-notice platform change at Köln Hbf",
    short: "Platform change",
    category: "Platform / short-notice rule",
    seed: "Radio message from the platform staff at Köln Hbf: ICE 618 to Hamburg leaves from platform 7 today because of a points failure, but the app still says platform 5. Is that right, and who needs to know?",
    train_id: "T-618",
    exposure_check: { train_ids: ["T-618"], types: ["platform", "coach_order"] }
  },
  {
    id: "SC-DIVERSION",
    number: 2,
    title: "Wuppertal line blocked: ICE diverted via Essen",
    short: "Diversion via Essen",
    category: "Diversion / plausibility check",
    seed: "Post in the staff chat: the line through Wuppertal-Oberbarmen is blocked. ICE 1022 is said to be going via Essen instead, 'about 10 minutes later'. The journey planner still shows stops in Hagen and Wuppertal.",
    train_id: "T-1022",
    exposure_check: { train_ids: ["T-1022", "T-1026"], types: ["stop_not_served", "stop_missing", "time"] }
  },
  {
    id: "SC-OPSSTOP",
    number: 3,
    title: "An operational stop published as a passenger stop",
    short: "Betriebshalt as a stop",
    category: "Conversion rule / operational stop",
    seed: "Customer complaint forwarded by the service centre: ICE 1027 'stopped' in Köln-Mülheim yesterday but the doors stayed closed, although the app listed the stop. Does today's run have the same problem?",
    train_id: "T-1027",
    exposure_check: { train_ids: ["T-1027"], types: ["stop_not_served"] }
  },
  {
    id: "SC-TERMINUS",
    number: 4,
    title: "ICE ends at Köln Messe/Deutz, the app says Köln Hbf",
    short: "Ends at Messe/Deutz",
    category: "Terminus / channel lag",
    seed: "Note from the station team at Köln Messe/Deutz: ICE 1025 ends here today and the displays say so, but passengers keep showing them the app with arrival at Köln Hbf.",
    train_id: "T-1025",
    exposure_check: { train_ids: ["T-1025"], types: ["terminus"] }
  },
  {
    id: "SC-COACH",
    number: 5,
    title: "Reversed coach order on ICE 516",
    short: "Reversed coach order",
    category: "Coach order / separate feed",
    seed: "The train manager of ICE 516 reports during preparation in Köln: 'We are running in reverse order today; first class is at the other end.'",
    train_id: "T-516",
    exposure_check: { train_ids: ["T-516"], types: ["coach_order"] }
  },
  {
    id: "SC-FPLO",
    number: 6,
    title: "Construction order breaks a connection in Dortmund",
    short: "Construction order",
    category: "Fplo / daily generation",
    seed: "Construction office: a timetable order for Bochum – Dortmund (speed restriction, about 4 minutes) went out this morning. Has anyone checked what passengers are told about Dortmund and their connections?",
    train_id: "T-612",
    exposure_check: { train_ids: ["T-612", "T-10109"], types: ["time", "connection"] }
  }
];
