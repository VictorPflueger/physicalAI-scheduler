# Timetable Translator — two timetables, one truth

A live, agentic AI demo for passenger information on the railway. The Timetable Translator stands between the **Betriebsfahrplan**, the operational timetable that operations keep (every operating point, tenths of a minute, tracks, operational stops), and the **Kundenfahrplan**, the customer timetable passengers see in the journey planner and app, on station displays, in announcements and in the coach order. It answers the question a passenger-information desk asks every morning: *where does what we tell passengers contradict what the trains will really do, who will act on the wrong information, how soon, and what is the cleanest way to put it right?*

**Live site: [victorpflueger.github.io/physicalAI-scheduler](https://victorpflueger.github.io/physicalAI-scheduler/)** · Version 1.4.0 · Static website, no backend, no build step. It looks like the rest of Victor Pflüger's work: it is built on his design system Vici, in a light and a dark theme. It is a sister prototype of the Navigator (supply-chain disruptions), Rebate Hunter (procurement rebates) and Repack Pilot, built on the same shell.

---

## The pitch in five minutes

Open the live site, read the intro window with the audience, close it, and start scenario 1 in Simulation mode (press **Start agent**, then **Run simulation**; no key needed). `DEMO_SCRIPT.md` has the stage script for five and for ten minutes.

**What it does.** Operations move ICE 618 to another platform at short notice. The operational timetable (the source) says platform 7; the journey planner and app, the station displays, the announcements and the coach order still say what was generated at 05:30. 312 passengers would act on the wrong information, the first of them in 14 minutes. The Timetable Translator finds this, works out who is affected and how soon, and prepares the fix for a person to approve. It keeps no timetable of its own.

**How the AI aligns the information.** The mirror opens on the **alignment view**: on the left the source the AI reads (the operational timetable at one stop, and the sensors of the physical layer), in the middle the AI translator and the person who decides, on the right what each channel tells passengers. During the run you watch the AI read the source, then the journey planner (a first estimate: one channel wrong, 8 passengers), then every channel and the sensors (the interlocking has stored the route out of platform 7, so the source is right). A channel the AI has read waits as *Read, not compared yet*: the deterministic engine compares it with the source, and only the engine's result turns a channel that contradicts the source red, with the passengers it misleads in the line below (312). The AI proposes three responses next to doing nothing; you choose. Approving the re-publication from the source turns the channels green, with the old value struck through and the source's value after it (*Re-publication approved*; the prototype itself publishes nothing): the channels are aligned by regenerating them from the one source, not by typing values into them. A message alone leaves the data wrong (honey), a manual override becomes a second truth (honey, with the hand). Each card says one thing in a few words; the tool calls' names and results, the alert's sources, the drafts' full text and the run's facts are one click away, so the audience reads the story, not the record.

**What it achieves.** 312 passengers misled becomes 7 with the recommended option; the right information reaches passengers in 2 minutes and every channel is aligned with the source in 8, before the train leaves rather than at the next publication cycle. Every figure comes from the source and a deterministic engine, every fact the AI writes is checked against what the tools returned, the passenger message is drafted in German and English, and nothing goes out without approval.

The other six scenarios (a diversion, an operational stop published as a passenger stop, a new terminus, a reversed coach order, a construction order, and a cross-border ICE whose European timetable lags the partner railway's change) are there for questions: before a run the console lists all seven, and when a run has finished, **Try another scenario** above its last line offers the others, each one click from the mode choice for its run. **Timetables** shows the source timetable beside each channel's, stop by stop; **All trains** lists every train in the next three hours.

## What it is and why it matters

A railway changes its operational timetable all day: a points failure moves a train to another platform, a blocked line diverts an ICE, a construction order adds four minutes, a set is turned in the depot and runs in reverse. Each change is entered once, in the operational source. The customer timetable is generated from that source, but not always at once and not always correctly: the publication cycle does not take short-notice changes, a plausibility check rejects an update with unusual stops, a conversion rule turns an operational stop into a passenger stop, the coach order travels in a feed of its own, the on-board announcements were loaded at the start of the run, and a cross-border train reaches the journey planner through a European timetable merged from every railway's delivery once a night, so a partner railway's change after the merge waits for the next one. Each channel then shows its own version of the truth, and passengers act on whichever one they read.

The Timetable Translator shows an AI agent doing the comparison in a minute. It takes an unverified lead (a radio message, a remark from the platform), reads the operational change and the source timetable, reads what every customer channel publishes, and confirms the change independently in the **physical layer**: the interlocking, the point diagnostics, the train's position, door logs, the RFID reading at the depot exit. A deterministic sync engine derives what passengers should be told from the source, finds every contradiction and counts who relies on it and how soon. The agent then proposes exactly three costed responses next to doing nothing, waits for a human decision, and turns the approved option into draft passenger messages (German first, then English), a re-publication order, an override or staff briefing, or a hold request to dispatch. Nothing leaves the outbox without approval, and nothing is ever published. Every step is visible in the console, and every model call and decision lands in an audit log that can be exported as JSON.

**The AI keeps no timetable of its own.** It never computes a time, a platform or a passenger figure: the engine derives the customer view from the source, option cards and KPI tiles are filled from engine results, and every time, platform, coach sector, minute figure, train number and passenger count the agent writes into an alert, an option card, a draft or the summary is checked in code, in English and German forms ("07:42", "7.42 Uhr", "Gleis 7", "Abschnitt F–G", "+4 Min"): it must be a value a tool returned for a train the text is about, and a value only the outdated channels show may appear only next to the source's value ("Gleis 7, not Gleis 5"). A passenger message may quote only the source and the result the options rest on, never a what-if. A text the audit still cannot match after two refusals is shown with its unchecked facts marked, never passed silently.

| Preset scenario (real stations, fictional trains) | What the agent finds | Misinformed passengers |
|---|---|---|
| 1 · Platform change at Köln Hbf | A points failure moves ICE 618 from Gleis 5 to Gleis 7 at 07:21; the short-notice rule held the change back, so every channel still says platform 5; on Gleis 7 the train stands one sector further along, so the coach sectors shown are wrong too | 312 of 312 |
| 2 · Diversion via Essen | The Wuppertal line is blocked; ICE 1022 and ICE 1026 run via Essen and Düsseldorf, but the plausibility check rejected the update: every channel still sells Hagen and Wuppertal and the old arrival in Köln | 856 of 856 |
| 3 · Operational stop as a passenger stop | A conversion rule publishes ICE 1027's operational stop at Köln-Mülheim as a passenger stop; door logs and the platform length confirm nobody can board there | 58 of 58 |
| 4 · New terminus Köln Messe/Deutz | ICE 1025 ends at Messe/Deutz; the displays know it, the journey planner and the on-board announcements still say Köln Hbf | 157 of 268 |
| 5 · Reversed coach order | ICE 516 was turned in the depot; the timetable channels are right, the coach-order feed shows first class at the wrong end at five stops | 225 of 225 |
| 6 · Construction order in Dortmund | A construction order adds four minutes to ICE 612 and RE 10109 after the daily generation; the connection to RE 57 in Dortmund breaks, and dispatch can be asked to hold it | 234 of 234 |
| 7 · European timetable lags | ICE 318 runs from Dortmund via Köln and Aachen to Bruxelles-Midi. The partner railway delivers works on its own section (+9 minutes from Liège-Guillemins) at 06:12, after the European timetable's nightly merge at 04:00: the journey planner and app and the on-board announcements, which take cross-border trains from that timetable, still show 09:33 in Brussels and the connection to IC 2117 to Oostende; the station displays, fed by each railway's own data, show 09:42. Merging the train again from both deliveries, checked before release, aligns every channel in 20 minutes | 230 of 252 |

*Misinformed passengers* are those who would act on wrong information within 180 minutes if nothing is done, out of all who rely on a wrong fact. Someone who relies on two wrong facts at one stop (the platform and the coach sectors) counts once, and someone who meant to board where a diverted train no longer stops counts there, not again on board. The figures come from the engine and are frozen in `tests/engine.mjs`; `DATA_SOURCES.md` §4 states every assumption behind them.

> **Fictional trains, real stations.** The stations, their Ril 100 codes and the lines between them are real. Every train number, time, track, passenger figure, operational change, publication state and sensor reading is invented, and no railway's data, systems or rules are used: the publication rules, the European timetable's nightly merge among them, are assumptions written for this demonstration. See `DATA_SOURCES.md`.

For clients, the point is not the fictional morning but the pattern: an agent that uses tools, verifies before it alerts, quantifies before it recommends, keeps a human in charge of every outbound action, and stays a translator instead of becoming a second source of truth. Everything runs in the presenter's browser on the presenter's own Claude API key: no server to approve, no client data, no integration project.

## The concept

The idea came out of a conversation about passenger information: an AI as a **translator between the Betriebsfahrplan and the Kundenfahrplan**. Four principles carry it, and the prototype implements each in code:

1. **One source of truth, no second timetable.** The source is the operational timetable as operations keep it. The translator reads it and derives; it never stores or edits a timetable of its own (`js/sync.js` derives the customer view, `js/facts.js` audits every fact the agent writes).
2. **Every fact traceable.** Each contradiction names the source version, the operational change that created it, the channel and version that show it wrong, and why the channel lags (the publication note). Drafts carry a source reference line; the audit export holds every request, response and decision.
3. **Passenger information derived from operational change.** An operational change becomes a list of customer-facing consequences (platform, time, stop not served, stop missing, terminus, coach order, connection), each with the passengers who rely on it and the first departure or arrival it concerns.
4. **Contradictions flagged, humans decide.** The agent proposes; a human approves; nothing is published.

**How it maps to the world-model idea of the whitepaper *Two AI Worlds, One Robot* (Physical AI and Agentic AI, 2026).** The whitepaper describes a *world model* as the connecting link between the two AI worlds: a continuously updated representation of the relevant environment that does not think for itself, is corrected by sensor data, and gives the planning intelligence the current state and the expected outcome of its actions. The Timetable Translator applies that loop to a railway corridor:

| Whitepaper | Timetable Translator |
|---|---|
| World model: shared state and prediction model, no goals of its own, updated by sensors | The operating snapshot: the source timetable with the day's operational changes, corrected and confirmed by the physical layer (`data/world.js`, `js/world.js`) |
| Physical AI: perception, sensors detect state | `phys_observe`: interlocking routes, point diagnostics, train positions, door logs, platform lengths, RFID coach-order readings, measured section times |
| Agentic AI: plans, checks the plan against the world model, compares results | The live agent (`js/agent.js`, `js/tools.js`): spots the change, reads source and channels, verifies, quantifies, proposes |
| Mental simulation: options evaluated against the world model before acting | `sim_sync`: every option is costed by the deterministic engine before anyone decides |
| Deviation: re-plan or escalate to a human | Exactly three options plus doing nothing; a human approves; drafts wait in the outbox |
| Explainability as a condition for approval | Console with sources and guardrail lines, AI labels, audit export, run facts |

## How it works

```
 Presenter's browser: static files from GitHub Pages (or any static host)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │   Live agent (js/agent.js)            ┐                                    │
 │   Claude tool-use loop, streamed      │   one stream of     ┌───────────┐  │
 │                                       ├─► run events ──────►│ Timetable │  │
 │   Simulation player (js/simulation.js)│   (js/events.js)    │ mirror,   │  │
 │   scripted replay, data/sim_runs.js   ┘                     │ KPIs,     │  │
 │                                                             │ console,  │  │
 │   Tools the agent can call (js/tools.js)                    │ options,  │  │
 │    ops_*       the source: operations log, Betriebsfahrplan,│ outbox,   │  │
 │                passengers, alternative journeys             │ audit log │  │
 │    kfp_*       what every customer channel publishes        └───────────┘  │
 │    phys_*      the physical layer (sensor observations)                    │
 │    sim_sync    deterministic sync engine (js/sync.js)                      │
 │    ui_*        alert, mirror marks, options, drafts, report: wait for a human│
 └───────────┬────────────────────────────────────────────────────────────────┘
             │ HTTPS with your API key (the only outside connection)
             ▼
   api.anthropic.com/v1/messages
```

- **Two producers, one interface.** The live agent and the simulation player emit the same run events, so the interface behaves the same in both modes. The mode badge, the console watermark, the evidence labels and the audit export say which mode ran.
- **Synthetic world.** `data/world.js` holds the Köln – Dortmund corridor at 07:28 on one morning, and beyond it the cross-border line from Köln via Aachen to Liège and Brussels: 20 operating points with their Ril 100 (DS 100) codes, the lines between them, 85 trains (ICE, IC, RE, S-Bahn and replacement buses) with their source timetables, the day's six operational changes, what each channel published and why it lags, the physical observations and the passenger figures. It ships as a script (`window.WORLD = …`), so nothing is fetched.
- **The timetable mirror** is the centrepiece, where the Navigator has its map and Rebate Hunter its board. It opens on the alignment view (the source and the sensors, the AI translator and the person who decides, every channel with its verdict, the passenger impact); the timetables view puts the source timetable beside the published one, the translation between them as lines (see *Reading the screen*).
- **Guardrails in code, not only in the prompt.** Every option figure comes from the engine, and options can rest only on a full-scope result from the source, never on a partial scope or a what-if. An alert marked "verified" needs two distinct sources and, for every train it names, the source record, the published view and a physical observation that corroborates it, all read in the same run. Options follow a verified alert. Every timetable fact in an alert, an option card, a draft or the summary must match a fact a tool returned for a train the text is about, and an outdated value may appear only beside the source's. Only a human decision turns the mirror green or honey. A decision counts only for the options on screen; drafts only follow it, only of the kinds the approved option contains, and none after the summary; the summary waits until every draft is decided and reports the decision that was taken. The source reference and the approval footer of a draft are always the code's own. A response that breaks off is marked as discarded and counts for nothing. Each run is capped at 40 model calls and €3. Simulation scripts are checked against the same rules.
- **Browser-enforced boundaries.** The page's Content Security Policy lets it connect to api.anthropic.com only and loads nothing from outside: scripts, styles and fonts ship with the page (the design system Vici is copied into `vici/`). The key lives in this tab's session storage only, under the app's own name.

## Deploy in five minutes (GitHub Pages)

The live site above is served from this repository's `main` branch. To run your own copy:

1. **Fork or copy the repository.** Keep it public for Pages on a free plan. Include the hidden file **`.nojekyll`**: it stops GitHub from running Jekyll over the Markdown files. (A web upload takes at most 100 files at a time, and the Timetable Translator has about 125: upload everything except `js/` first, then that folder.)
2. **Turn on Pages.** **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch **main**, folder **/ (root)**, **Save**.
3. **Open the site** after a minute or two at `https://<your-user>.github.io/<repository>/`. Progress shows under **Actions** ("pages build and deployment"); after each build the **live site** workflow checks that the site serves the pushed files and that a simulation runs there.
4. **Check it on the presentation laptop.** Open the site, click **Diagnostics**, then **Run all tests**. Every row should pass.

**Run it locally** from the repository folder with any static server, for example `python3 -m http.server 8000`, then open `http://localhost:8000/`. Opening `index.html` from disk does not work: browsers block ES modules on `file://`, and the page explains this.

**Updating.** Push the changes. GitHub Pages caches files for up to ten minutes; hard-reload (**Ctrl + Shift + R**, **Cmd + Shift + R** on a Mac) and check the version at the bottom of Diagnostics.

## First visit

On a first visit, a short window explains what the Timetable Translator does (the pitch scenario as one example, with the engine's own figures: the source's platform, what passengers are told, how many passengers that misleads), how the AI aligns the information (spot, check, calculate, propose, prepare) and what it achieves. Its **Start agent** button leads straight into the run. **How it works** in the header opens it again at any time; during a run it only explains and never interrupts.

## Reading the screen

- **Merlot is you.** Approve buttons are merlot, Vici's deep wine red, and so is the step of the progress rail that waits for you: *Your decision* for the options, then *Your approval* for the drafts.
- **Lilac is the AI.** The options, drafts and summary the agent wrote carry an **AI** label; the translator between the two timetables is lilac too, and so is a what-if (a hypothetical change the agent tests, not the source).
- **Red, honey and green are the state of passenger information** (Vici's coral, honey and sage): red contradicts the source, honey means passengers are informed but the data is still behind (or the risk was accepted), green means a re-publication from the source was approved. Each channel card and line label carries a mark as well (warning, clock, hand, check, sparkle), so the state reads without its colour.
- **Hexagons, not circles.** As everywhere in Vici, what would be round is a hexagon: the corridor's stations and the train, the stops on the timetables, the rail's steps, the status pips.
- **The alignment view** (the mirror's first view) tells the story in three columns. **1 The source**: the operational timetable at one stop of the train (its platform, coach sectors, times, and the change that set them), and the sensors that confirm what the train will really do. **2 The translator**: what the AI is doing now (reading the source, reading what passengers are told, reading the sensors, calculating), the rule that it keeps no timetable of its own, and **You decide** below it, merlot when a decision or an approval waits for you. **3 What passengers are told**: one card per channel (journey planner and app, station displays, announcements, coach order) with its value, how old it is, and the verdict: *Not checked yet*, *Reading…*, *Read, not compared yet* (the colour waits for the engine's comparison, never the language model's reading), *Contradicts the source* (red), *Matches the source*; after your decision *Re-publication approved* (green, the old value struck through), *Data still wrong* or *Override approved: a second truth* (honey), or *Wrong: risk accepted*. The line below says how many passengers would act on wrong information and when the first does, and after the decision what is left. A channel card opens that channel's timetable. When the drawer is open the view condenses to two rows, then to one, so the finding stays in view.
- **The timetable mirror, timetables view.** Above, the corridor strip: the main line along the bottom, the Wuppertal line along the top (for a train that runs abroad, the cross-border line to Brussels on the left, the border a dashed upright with the two countries' codes), the train's route today (solid) and as published (dashed) where they differ, its passenger stops, operational stops and passes, where it is at 07:28, and the stations the physical layer was read at. Below, the mirror card: on the left the **Betriebsfahrplan** (every operating point with tenths of a minute and tracks), on the right the **Kundenfahrplan** of the channel you pick (journey planner, displays, announcements, coach order), each with the version of the source it was generated from. Between them, a line joins every published row to its source row; a line that ends in × is published but no longer in the source, one that ends in + is in the source but not published. When the engine finds a contradiction, the published row, its line and a label with the passengers who rely on it take the state colour. Click any row or station for its details: the record that changed it, what each channel shows, what the physical layer saw.
- **All trains** (the sync monitor) lists every train in the next 180 minutes (the S-Bahn shuttles aside), first departure first, with its source version, the channels still behind it, and what the agent's check found. The Live sweep fills it in as it goes. A row opens its train.
- **While the agent works**, the column it reads pulses in fjord blue, the station a sensor was read at gets a mark, and tags record what was checked (source read, published view read, physical layer read, passengers read). When the drawer opens, the mirror makes room: first the strip goes, then the card's head, so the rows with the finding stay in view. **Legend** explains every mark and has toggles for passing points, lines and the strip.
- **The progress rail** above the console shows the agent's plan in five steps and where it is now. **Guardrail** lines in the console show where code refused a step and why.
- **Choosing a scenario.** Before a run the console lists the seven preset scenarios, each a different kind of contradiction, with scenario 1 marked *Start here*; a click loads one (the mirror shows its train) and **Start agent** runs it. The Scenario control in the control bar names the one loaded (*Scenario 1 of 7: Platform change*, on a laptop *1 of 7 Platform change*), and its menu holds the same list and the custom what-if. When a run has finished, **Try another scenario** above the console's last line offers the other six: one click opens the mode choice for that scenario.

**Light or dark.** The page opens in the light theme, made for projectors in lit rooms. The moon in the header switches to the dark theme, and every page of Victor's site remembers the choice.

Every colour comes from Vici's tokens and is checked for contrast in both themes and for colour blindness. `DESIGN.md` explains the system, which the Timetable Translator shares with its sister prototypes, the Navigator, Rebate Hunter and Repack Pilot.

## The two modes

Clicking **Start agent** first asks how the agent should run.

| | **Simulation** | **Live agent** |
|---|---|---|
| What runs | A scripted replay of a representative agent run | Real Claude reasoning with real tool calls |
| Tool results | Re-computed from the world model at playback | Computed from the world model |
| Figures | Calculated by the sync engine at playback | Calculated by the sync engine |
| Key and cost | None | Your Anthropic API key; a few tens of euro cents per run |
| Network | None; works fully offline | api.anthropic.com only |
| Labelling | SIMULATION badge with a striped tape, the tape and the word SIMULATION in the console, "Simulated run" in the summary, `"mode": "simulation"` in the audit export | LIVE badge, "Live agent run" in the summary, `"mode": "live"` |

- **Use Live for the real demo.** If the agent finds nothing, it says so. If a lead cannot be confirmed, it labels the analysis a *what-if*.
- **Use Simulation** for rehearsal, as the fallback on stage, and for anyone exploring without a key. Replay speed ×1, ×2 or ×4 is set in the control bar; a run takes about 20 seconds at ×4.
- **Live sweep** (control bar) checks the trains in the window for customer information that contradicts the source, with no injected scenario. It always runs live.
- **Custom what-if** (Scenario menu) lets the audience type a lead, for example *"Does RE 10109 still stop at Leverkusen Mitte this morning, as the journey planner says?"* It needs the live agent.

## Your API key

The Timetable Translator asks for a key only when you start a live run: **Live agent** in the mode dialog, **Live sweep**, or a custom what-if.

1. **Create a dedicated workspace with a spend limit.** At [platform.claude.com](https://platform.claude.com), open **Settings → Workspaces → Create workspace** (needs an organisation admin), select it and set a monthly spend limit under **Spend limits**, for example $10. Spend limits apply per workspace, not per key, and cannot be set on the Default Workspace.
2. **Create a key in that workspace.** Under **Settings → API keys → Create key**, scope the key to that workspace.
3. **Enter it only in the app.** Paste it when the app asks; it is checked with a free call that uses no tokens. Never paste the key into chat, slides or email.

What happens to the key:
- It is kept in this tab's session storage only, under the name `tt.anthropic.key`. The browser drops it when the tab closes (reopening a closed tab can bring it back), it is absent from other tabs, and it is never written to local storage, the console, the audit export or recorded runs. The key field asks password managers not to save it.
- Live mode needs the app in its own tab: inside another page's frame the key dialog refuses the key. Simulation works anywhere.
- It is sent only to api.anthropic.com, in the `x-api-key` header. The page's security policy blocks every other destination.
- **Start agent → Change or forget key** removes it at any time; use it before you leave a shared computer.
- **One origin, several apps.** GitHub Pages serves all of an account's projects from one origin (`https://<user>.github.io`). The sister apps keep separate storage names (`tt.*`, `rh.*`, `nav.*`), so they never overwrite each other, but a page of the same origin opened in the same tab could read a stored key. For a client setting, give the app its own host.
- Diagnostics has a **Key and privacy** row that checks all of this in your browser.

## What a run costs

The cost meter in the header shows the real cost of every call as it happens (token usage × list price, converted at 1 USD = 0.894 EUR). The audit export holds the usage of every model call.

| Model (selector) | Per preset scenario run | Notes |
|---|---|---|
| **Sonnet 5.5** (default) | expect about €0.15–0.40 | Best balance for the stage |
| Haiku 5.5 | about €0.02–0.05 | Fastest |
| Opus 5.5 | about €0.35–0.90 | Deepest reasoning, slower |

These are estimates carried over from the sister apps, whose prompts and tool sets are of the same size and whose Sonnet runs measured about €0.20; the Timetable Translator has no web search, so there is no search fee. Measure your own with the cost meter during rehearsal. Each run stops on its own if it passes €3.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Page says it must be opened through a web server | It was opened from disk (`file://`). Use GitHub Pages or `python3 -m http.server`. |
| GitHub Pages shows 404 | Wait two minutes after enabling Pages and check the **Actions** tab. `index.html` must be in the repository root, branch `main`, folder `/ (root)`. |
| Old version after an update | Pages caches for up to ten minutes. Hard-reload and check the version in the Diagnostics footer. |
| "Could not reach api.anthropic.com", or Diagnostics fails the Anthropic API row | A firewall, proxy or browser extension blocks the call. Try another network (a phone hotspot) or a browser profile without extensions. Simulation works offline. |
| "Anthropic rejected the API key (401)" | The key is wrong, expired or archived. The app removes it from the tab; enter a valid one. |
| Error that mentions a workspace | The key works in several workspaces. Create a key scoped to a single workspace. |
| "Spend limit reached" or "no credit" | Raise the workspace's spend limit or add credit in the Console, or switch to Simulation. |
| The mirror shows only the timetable rows | The drawer (or the legend on a small screen) leaves little room: the strip and the card's head give way first, so the finding stays in view. Click **Hide** on the drawer, or close the legend. |
| "The API is busy right now" | Anthropic returned overloaded or rate-limit errors after two automatic retries. Wait a minute, switch to Haiku, or run the Simulation. |
| Run ends as **Stopped** | The model ended its turn twice without finishing; the app does not invent the rest. Start again, or switch to the Simulation of the same scenario. |
| A **Guardrail** line appears in the console | Code refused a step (for example a draft quoting a time no tool returned). The agent is told why and corrects it; the run facts count these refusals. |
| Text too small on the projector | Use **Larger text** in the console header. The layout is tested at 1920×1080 and down to 1280×720. |

## Recording a live run for Simulation mode

After a completed live run of a preset scenario, click **Save run as simulation** (end of the console). The app validates the recording and downloads `sim-run-<scenario>-recorded-<date>.js`. Append that file's content to the end of `data/sim_runs.js`: from then on, Simulation mode replays that real run for the scenario, labelled as a recorded run. World-model lookups and engine figures are recomputed at playback, and only the decision path that was taken live can be replayed. A recording carries the world and engine versions; when either changes, the check reports it as stale and it should be recorded again. Delete the appended block to return to the authored script.

## Safety and the EU AI Act

The Timetable Translator is designed along the transparency and human-oversight lines of the EU AI Act. This is a design intent, not a legal assessment.
- **Disclosure.** "You are interacting with an AI system" is shown permanently in the header.
- **Human oversight.** Options wait for a human decision, and each draft waits for its own approval. A run that ends without a decision shows its options and drafts as undecided.
- **No real-world action.** The outbox is connected to no passenger-information, timetable or dispatch system; approval only marks a draft as cleared. Every draft says it is a mock and carries "Requires human approval before publishing."
- **Record-keeping.** The audit export contains every run event, every model request and response (minus thinking signatures), the mode, the run facts and the cost.
- **Honest modes.** Simulation output is labelled everywhere and never presented as live.

## Quality and acceptance

- The **run facts** line at the end of every run states agent time (excluding time spent waiting for your decisions), tool calls by kind, visible verification steps, revisions, guardrail refusals and cost.
- `node tools/check_world.mjs` checks the world model, the scenarios, the reference cases and all seven simulation scripts (46 checks), holding every script to the live agent's guardrails.
- `node tests/engine.mjs` checks the sync engine against frozen golden figures for all seven scenarios, the customer projection, the honest negatives of every other train, the refusals, the fact audit, the guardrails and the mirror's data.
- `node tests/tokens.mjs` checks the colour system on Vici's values in both themes: contrast for every text and state pairing, and how far the state colours stay apart for colour-blind viewers. `node tests/hexagon.mjs` checks that nothing in the app is round, `node tests/page-icon.mjs` that the page icon matches the prototype's card on Victor's website, and `node tests/vici-files.mjs` that `vici/` holds exactly Vici's files.
- `tests/` contains the browser suites (smoke, simulations, live agent against a scripted API stand-in, acceptance, layout, design, and the pitch as the audience sees it) and the parity, hygiene and documentation checks. See `tests/README.md`; GitHub Actions runs them on every push. `TECH_NOTES.md` §12 lists the acceptance items, §11 is the verification log.

## Files

| Path | Contents |
|---|---|
| `index.html` | The single page, its security policy and the boot screen |
| `vici/` | Victor's design system Vici (stylesheet, script, tokens, fonts, the byline's portrait and LinkedIn's logo), copied unchanged; `vici/README.md` lists the files, their release and their licences |
| `css/` | The app's styles on top of Vici: layout, components, console, drawer, dialogs (shared with the sister prototypes), and `css/mirror.css` and `css/align.css` (the timetable mirror) |
| `js/` | ES modules, one responsibility each (see below), and `theme.js`, which sets the theme before the page is drawn |
| `favicon.svg` | The page icon: Vici's clock icon in a lilac hexagon, as on the prototype's card on Victor's website |
| `data/world.js` | The operating snapshot: stations, lines, trains, operational changes, published channels, physical observations, passengers (generated by `tools/build_world.mjs`) |
| `data/scenarios.js`, `data/reference_cases.js` | The seven preset scenarios and their engine reference cases |
| `data/sim_runs.js` | The seven simulation scripts |
| `tools/` | The world builder, the world check |
| `tests/` | Optional test suites (Node.js; browser suites need Playwright) |
| `README.md`, `DEMO_SCRIPT.md`, `DATA_SOURCES.md`, `TECH_NOTES.md`, `DESIGN.md`, `REVIEW.md` | This guide, the stage script (German), every data source and assumption, verified API facts and decisions, the design system, and the review with the parity checklist and the customer's view of the pitch |

Main modules: `agent.js` (live tool-use loop), `anthropic.js` (streaming client, retries), `prompt.js` (system prompt), `tools.js` (tool definitions and executors), `guards.js` (the guardrail policy shared by the live tools and the script checker), `facts.js` (the fact audit), `ops.js` (world-model queries: the source, the published channels, the physical layer, passengers, alternatives), `sync.js` (the sync engine), `world.js` (indexed world model), `payoff.js` (option figures and decision effects), `drafts.js` (draft footers and source references), `simulation.js` (replay), `sim_vars.js` and `sim_check.js` (script placeholders and validation), `recorder.js` (Save run as simulation), `events.js` (run-event bus), `ui.js` (orchestration), `mirror.js` (the timetable mirror) with `mirror_data.js` (what it draws), `mirror_align.js` (the alignment view), `mirror_card.js`, `mirror_strip.js`, `mirror_monitor.js`, `pop.js` and `popovers.js` (details), `icons.js` (Vici's icons by name, and the twelve drawn in Vici's style), `console.js`, `kpi.js`, `options_panel.js`, `outbox.js`, `audit.js`, `diagnostics.js`, `keystore.js` (session-only key), `cost.js`, `run_facts.js`.

## Credits and licences

Design system: Vici by Victor Pflüger (MIT for its code; `vici/LICENSE`), with its fonts Bricolage Grotesque, Inter and JetBrains Mono (SIL Open Font License 1.1); Victor's portrait is his own, LinkedIn's logo LinkedIn's. Claude is a service of Anthropic, billed to your own key. Details are in `DATA_SOURCES.md`.

## Author

**Victor Pflüger** — Senior Consultant, Data Science & AI · [linkedin.com/in/victorpflueger](https://www.linkedin.com/in/victorpflueger)

*A portfolio prototype that shows how an agentic, human-supervised workflow keeps passenger information true to the operational source, built as the sister of the Navigator and Rebate Hunter.*
