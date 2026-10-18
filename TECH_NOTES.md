# TECH_NOTES — verified facts and build decisions

The Timetable Translator calls the Claude API directly from the browser and nothing else. Every external detail the code depends on is recorded here with its source and the date it was verified. If a fact changes, update this file first, then `js/config.js`.

**Basis.** Version **1.0.0**, 18 October 2026. The Timetable Translator runs on the browser client, agent loop, run-event bus and design system of its sister apps (Rebate Hunter 7.1.0, Navigator 1.1.0); `tests/parity.mjs` checks that the shared modules are identical. Sections 1–3 (Claude models, request features, the Messages API from the browser) therefore rest on the sister apps' verification of 12 October 2026 against `platform.claude.com/docs` and live CORS probes: the code is the same, and this build re-checked the protocol against a scripted stand-in (§11), not against a live key. Sections 4–5 describe the world model, the sync engine and the timetable mirror, which are new. Sections 7–12 record the tools, the decisions, the guardrails, the simulation format, the verification log and the acceptance checklist.

---

## 1. Claude models and token prices (cost meter inputs)

Source: Models overview and Pricing pages, `https://platform.claude.com/docs/en/about-claude/models/overview`, `https://platform.claude.com/docs/en/about-claude/pricing` (verified for the sister apps on 12 Oct 2026).

| Label | API model ID | Input $/MTok | Output $/MTok | 5-min cache write $/MTok | Cache read $/MTok | Effort | Max tokens per call |
|---|---|---|---|---|---|---|---|
| Haiku 5.5 — fast, cheapest | `claude-haiku-5-5` | 0.10 (prompt ≤ 100k tok) / 0.50 (> 100k) | 0.50 / 2.50 | 0.125 / 0.625 | 0.01 / 0.05 | medium | 12,000 |
| **Sonnet 5.5 — default** | `claude-sonnet-5-5` | 2.00 | 10.00 | 2.50 | 0.10 | medium | 16,000 |
| Opus 5.5 — deepest | `claude-opus-5-5` | 4.00 | 20.00 | 5.00 | 0.20 | high | 16,000 |

- Haiku 5.5 is priced in two tiers by prompt size; the cost meter (`js/cost.js`) picks the tier per request from `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.
- The Models API (`GET /v1/models`) is free. Diagnostics and the key dialog use it to validate a key and confirm the three model IDs.
- **USD → EUR.** The API bills in USD; the cost meter converts at a fixed **1 USD = 0.894 EUR** (`FX_USD_EUR` in `js/config.js`; ECB reference rate of 12 Oct 2026).

**Cost per run.** Not yet measured with a real key for the Timetable Translator. Its system prompt (about 1,700 words) and 15 tool schemas are of the same order as the sister apps', whose first real Sonnet runs measured about €0.20, and it has no web search fee; expect €0.15–0.40 on Sonnet, €0.02–0.05 on Haiku and €0.35–0.90 on Opus. The cost meter shows the real figure on every run, and the audit export holds the usage of every model call.

## 2. Request features and graceful degradation

- **No server tools.** The agent sends 15 client tools and no web search: the world model and its physical layer are its only sources, so every fact it states can be traced (`toolDefinitions()` in `js/tools.js`). The shared client and cost meter still know the server-side web search tool, because the sister apps use them; this app never sends it, so `usage.server_tool_use.web_search_requests` is always 0.
- **Thinking.** `thinking: {type: "adaptive", display: "summarized"}`; the summaries appear as collapsed "Reasoning" entries in the console. **Effort** `output_config.effort` per model (§1). **Prompt caching** `cache_control: {type: "ephemeral"}` on every request.
- **Graceful degradation** (`callModel` in `js/agent.js`). A 400 that names `output_config`/effort, `display`, `thinking` or `cache_control` drops that one field and retries (at most four times per call), so an account or model without a feature still runs.

## 3. Messages API from the browser (CORS, headers, protocol)

Sources: API overview, Errors, Streaming, Handle tool calls, Handling stop reasons, Thinking, Effort, Prompt caching (all under `platform.claude.com/docs`), and live CORS probes for the sister apps on 12 Oct 2026. `js/anthropic.js`, `js/sse.js` and `js/cost.js` are shared with them unchanged.

**Request.** `POST https://api.anthropic.com/v1/messages` with `x-api-key` (from session storage only), `anthropic-version: 2023-06-01`, `content-type: application/json` and `anthropic-dangerous-direct-browser-access: true`. Without that last header the API's 401 carries no `access-control-allow-origin` and the browser blocks it: **the header is mandatory**. `GET /v1/models` with the header is CORS-enabled too. Keys spanning several workspaces need `anthropic-workspace-id`, which the app does not send; a workspace error is answered with "use a key scoped to a single workspace". Spend limits are set per workspace, not per key.

**Parameters sent.**

```json
{
  "model": "claude-sonnet-5-5",
  "max_tokens": 16000,
  "stream": true,
  "cache_control": { "type": "ephemeral" },
  "thinking": { "type": "adaptive", "display": "summarized" },
  "output_config": { "effort": "medium" },
  "system": "…",
  "tools": [ … 15 client tools … ],
  "tool_choice": { "type": "auto" },
  "messages": [ … ]
}
```

- Every assistant `content` array, thinking blocks and signatures included, is passed back **unchanged**. The engine never changes a tool input in place (it normalises copies), so what was sent is what is echoed and recorded. Recorded runs are stored as UI events, never as API transcripts (signatures only work in the account that produced them).
- Streaming: SSE over `fetch`, LF or CRLF split anywhere, cumulative usage in `message_delta`, mid-stream `error` events raised as API errors, a body without a stop reason treated as an interrupted connection, 90 s idle limit including the wait for headers.
- Stop reasons: `tool_use` → run client tools (independent `ops_*`, `kfp_*` and `phys_*` lookups in parallel, the engine and the `ui_*` tools in order); `pause_turn` → resend; `max_tokens` with a cut-off tool call → discard and retry once at 1.5× (16,000 → 24,000 on Sonnet); `end_turn` before the summary → at most two visible nudges, then **Stopped**; `refusal` and `model_context_window_exceeded` → stop cleanly.
- Errors: 401 removes the key; 429 honours `retry-after` (spend-limit 429s are not retried); 5xx, 529, network errors and cut streams retry twice (1.5 s, then 4 s), then stop with a message pointing to Diagnostics and Simulation; the 400s of §2 drop a feature and retry.

## 4. The world model and the sync engine

**World** (`data/world.js`, built by `tools/build_world.mjs`, world version 1.0.0; indexed once by `js/world.js`, `getModel()`). The Köln – Dortmund corridor frozen at 07:28 (`now` 26,880 s): 16 points with Ril 100 codes and platform tracks, 17 segments on three lines, 82 trains, five operational changes (OPS-01 … OPS-05), what each of four data channels published (version, time, cause, conversion faults), seven causes of lag, nine physical observations, passengers per stop and one connection. Times are seconds after midnight; the source keeps tenths of a minute. What is real and what is invented: `DATA_SOURCES.md`.

**Versions.** A train's base timetable is version 1; each operational change that touches it creates the next version (`sourceState(model, id, version)` applies the changes in order: platform, diversion, early end, coach order, construction order with added running time). A train created by a change (a replacement bus) starts at version 1 and names its creator.

**Customer projection** (`customerView` in `js/sync.js`). Passenger stops only, whole minutes (arrivals up, departures down, arrival never after departure), platforms, the destination, stops cancelled against the base timetable and extra stops, the coach sectors of first class and the bistro, and a channel's conversion faults (an operational stop published as a passenger stop).

**Contradictions** (`trainContradictions`). For every train and data channel, the customer view of the channel's version is compared with the view of the current source: platform, time (≥ 1 min), stop not served, stop missing, terminus, coach order, connection. Each contradiction has an id (`T-618/KK/platform`), the channels that show it wrong and right, what is published and what the source says, the change and version, the cause of the lag, and the passenger groups who rely on it with the moment each acts (`DATA_SOURCES.md` §4).

**`simulateSync(model, spec)`** (engine version 1.0.0). Validates the specification (trains by id or number, channels, stops, what-if changes, up to six variants with their actions) and returns field-level errors or a result: the basis (*source*, *partial* with what it leaves out, or *what_if*), the contradictions, the baseline (passengers misinformed and affected, the first affected moment with a short label, when the channels are back in sync, the next cycle), alternatives for stranded passengers on today's source timetable (`findJourneys`), and per variant the passengers still misinformed and protected, when the right information first reaches them, when every channel is back in sync, residual contradictions, manual overrides, staff effort, action types and a connection hold (wait, delayed passengers, held passengers). Passengers are counted once per stop (`distinctPax`): the groups of one train, stop and direction are nested (seat reservations among those boarding, passengers who change among those alighting), and a passenger counts as misinformed if at least one fact they rely on misleads them; passengers travelling to a stop count only if they are on board when they act (`onboardGroup`: those who meant to board where a diverted train no longer stops are counted there). The journey planner informs people when they plan; every other channel reaches them in real time up to the last moment they can act (`groupMisinformed`, `realtime_min` in the world's publication rules). `DATA_SOURCES.md` §4 states every assumption. `compactForModel` shortens a result for the model. A what-if never changes the model. Golden figures for all six scenarios are frozen in `tests/engine.mjs`.

## 5. The timetable mirror

The centrepiece, where the Navigator has its map and Rebate Hunter its board. Plain DOM and inline SVG; no library.

| Module | Job |
|---|---|
| `js/mirror_data.js` | Pure. What the mirror draws, from the world model and the engine: a train's source rows with what changed against the base timetable (`sourceRows`), a channel's published rows including the stops it shows as cancelled (`channelRows`), the channels' versions (`channelStates`), the links between the two timetables (`mirrorLinks`: stop, operational stop, pass, not in the source, missing, hidden), the vertical places of the published rows (`placeRight`: level with their source rows, in order, never overlapping), the corridor strip (`stripData`, `positionNow`) and the sync monitor's rows (`monitorTrains`) |
| `js/mirror_card.js` | The mirror card: head with both timetables' versions, check tags and the channel chips; the two columns of row buttons; the lines and their labels (one per contradiction, stacked, each with a state mark); a row with the keyboard focus keeps it across redraws; `reveal` scrolls a finding into view |
| `js/mirror_strip.js` | The corridor strip: the network, the route today and as published, stops, operational stops, passes, rings in the state colours, the sensor mark, the train's position, and a 40 px button per station |
| `js/mirror_monitor.js` | The sync monitor: every train in the window, first departure first, with its source version, the channels behind it (a fact) and what the agent's check found (a finding) |
| `js/pop.js`, `js/popovers.js` | One popover at a time beside what it explains, with a tip; Escape, its button or a click outside closes it and gives the focus back, to the element found again by its key after a redraw. Content for a source row, a published row (what every channel shows against what the source says) and a station |
| `js/mirror.js` | State and wiring. It listens to the run events itself: `run_start` focuses the scenario's train (the monitor for a sweep); `tool_call` pulses what a lookup reads and focuses its train (not during a sweep); `tool_result` records what a result confirmed and every `sim_sync` result per train, and focuses the most urgent train of a finding; `kpi_update` names the result's stage (the live agent sends it just before the result, the player just after); `alert` and `mirror_update` mark trains, points and contradictions, and a decision sets them resolved or at risk; an accepted risk marks them accepted; `attempt_discarded` drops a discarded attempt's pulses and tags |

**Sizes.** `data-h` counts the room the views have (a legend docked below them takes its share): tall ≥ 600 px (the strip with station names, rows of 44 px), mid ≥ 400 px (the strip with codes only, 42 px), short ≥ 300 px (no strip; no source note, check tags or column titles; channel chips without versions; 40 px), tiny (no head: the rows only). `data-w` narrow < 820 px tightens the columns and docks the legend below the views; a card narrower than 760 px (a container query) drops the Ril 100 code column. When the card's room changes, the first contradiction is scrolled back into view. The pass rows show when every row fits (the legend's *Passes* toggle overrides it).

**Accessibility.** Every row, channel chip, station, monitor row and legend toggle is a button of at least 40 px with a full accessible name (times, platform, state, what is wrong). They keep the shared focus ring next to their own bars. Under `prefers-reduced-motion` nothing pulses, runs or flashes (`tests/smoke.mjs motion`).

## 6. Front-end libraries, fonts and browser security

| Asset | Version | Delivery | Notes |
|---|---|---|---|
| Web fonts | Barlow, Barlow Semi Condensed, IBM Plex Mono (Fontsource 5.3.0) | Self-hosted woff2 in `fonts/`, latin and latin-ext | SIL Open Font License 1.1; no third-party font service; identical to the sister apps' files (`tests/parity.mjs`) |

No runtime library. Markdown is rendered by a small escape-first renderer (`js/md.js`); the mirror is plain DOM and SVG.

### Content Security Policy (meta tag in `index.html`)

| Directive | Allows | Why |
|---|---|---|
| `connect-src` | `https://api.anthropic.com` | The only `fetch` target; no other host can receive the API key or any data. Diagnostics' privacy row fails if the policy allows anything else |
| `script-src` | `'self'` | App modules and data files only |
| `style-src` | `'self'` | Dynamic styles go through the CSSOM, so no `'unsafe-inline'` |
| `img-src` | `'self'`, `data:` | The favicon, the author's photo in the drawer bar and inline images |
| `font-src` | `'self'` | Self-hosted fonts |
| `object-src`, `base-uri`, `form-action` | none | Hardening |

**Browser storage** (`STORAGE` in `js/config.js`), all under the app's own prefix so it never collides with the sister apps on the same `github.io` origin: session storage `tt.anthropic.key`, `tt.diag`, `tt.model`, `tt.speed`, `tt.sessionCostEur`; local storage `tt.introSeen`, `tt.consoleText`. The key is never written to local storage.

## 7. The agent's tools

| Tool | Kind | Returns |
|---|---|---|
| `ops_get_overview` | Source | The snapshot time, the stations and lines, the trains in the window with their source version and changes, today's changes, the publication cycle. Not which channels lag |
| `ops_list_changes` | Source | The operations log: each change with its record text, source, kind, trains and the version it created; filters by train, point, kind, time |
| `ops_get_timetable` | Source | A train's Betriebsfahrplan (every point, tenths of a minute, track, activity, remarks, coach order, version history), any version |
| `kfp_get_published` | Published view | What each channel publishes for a train: version, time, publication note, stops, platforms, coach sectors |
| `phys_observe` | Physical layer | Observations for a train or point, each with what it corroborates; the train's position; the point's platform lengths |
| `ops_get_passengers` | Source | Boarding, alighting and reservations per stop, and connections with their ids |
| `ops_find_alternatives` | Source | Journeys on today's source timetable, diversions, cuts and buses included, up to two changes |
| `sim_sync` | Engine | §4 |
| `ui_report_alert`, `ui_mark_mirror` | Screen | An alert card with its checked evidence; marks on the mirror |
| `ui_propose_options`, `ui_await_decision` | Human decision | Three options and the do-nothing baseline from the engine; blocks for the decision |
| `ui_draft_action`, `ui_await_approvals` | Human approval | A draft in the outbox; blocks until every draft is decided |
| `ui_final_report` | Summary | The management summary; ends the workflow |

World-model lookups resolve rather than throw: an unknown train or point returns an error naming what exists. Summaries for the console come from `js/summaries.js`.

## 8. Build decisions log

The Timetable Translator inherits the sister apps' decisions wherever the shared code applies them (streaming, caching, thinking display, blocking decision tools, engine-filled options, one event bus, self-hosted fonts, the CSP, queued decisions, nudges with a Stopped end, run facts, the recorder, the key dialog, the intro, the design system, the progress rail, AI labels and handover names). Its own decisions:

| # | Decision | Reason |
|---|---|---|
| D-T1 | A third sister app on the shared shell, not a new design | The three prototypes are shown together; one run model and one design language |
| D-T2 | English user interface; passenger messages German first, then English | The sister apps and their audience are English; the passengers of the corridor read German first |
| D-T3 | No web search and no open-data tools | The concept is "one source of truth": every fact must trace to the snapshot, and nothing outside it can be cited |
| D-T4 | A deterministic sync engine derives the customer view and counts who is misinformed | The AI must not compute times or passengers; the figures are reproducible and frozen in tests |
| D-T5 | A physical layer as an independent second source, required for a verified alert | The whitepaper's world model is corrected by sensors; a dispatch record alone is one source |
| D-T6 | A fact audit for times, platforms, minutes, trains and passengers, in English and German forms | The translator must not become a second timetable through its own text |
| D-T7 | Three options always include a re-publication from the source, messages only, and a manual override | They show the trade-off of the domain: in sync (slower), informed (data stays wrong), fast (a second, hand-kept truth) |
| D-T8 | The timetable mirror as the centrepiece | The question is correspondence between two timetables (`DESIGN.md` §3) |
| D-T9 | Storage keys prefixed `tt.` | The sister apps' `rh.*` and `nav.*` keys share the `github.io` origin |
| D-T10 | Real stations, codes and lines; invented trains and figures; no operator's rules | Realism for the audience without using anyone's data |
| D-T11 | A frozen snapshot at 07:28 instead of a running clock | Every minute figure stays reproducible; replays and tests agree |
| D-T12 | One line label per contradiction, each with a state mark | Two wrong facts at one stop are two findings; the state reads without its colour |
| D-T13 | The mirror's height classes count the docked legend; the strip and the head give way before the rows | The finding stays in view whatever the room (`tests/layout.mjs`) |
| D-T14 | The engine normalises copies of its input | The tool input is echoed to the API and recorded exactly as the model sent it |
| D-T15 | An app-specific block at the end of `css/style.css` (the longer brand name wraps below 1400 px) | Keeps the header's two badge rows without touching the shared rules; `tests/parity.mjs` compares the file above the block |
| D-T16 | The hygiene check's term list lives outside the repository (a CI secret or a file next to the folder) | A public repository must not carry a prospect's names in any form; an encoded list is still readable |
| D-T17 | The journey planner informs at planning time; every other channel reaches people in real time, up to the last moment | People already on the platform or on board still see the displays, hear the announcements and get the push; a decision-time-only model overstated who stays misinformed when a train leaves soon |
| D-T18 | Passengers count once per stop, and only on board if they boarded where the train still stops | Two wrong facts at one stop are one passenger; someone who meant to board at a stop a diverted train skips is not on it |
| D-T19 | An outdated value only next to the source's, checked in code | A passenger message must never present the old platform or time as current; naming both ("Gleis 7, not Gleis 5") is the clear way to say it |

## 9. Live-agent guardrails

Enforced in code (`js/agent.js`, `js/tools.js`, `js/sync.js`, with the policy in `js/guards.js` and the fact audit in `js/facts.js`, which the simulation script checker applies too), not only in the system prompt (`js/prompt.js`):

| Guardrail | Where | Behaviour |
|---|---|---|
| Step cap | `AGENT.maxSteps = 40` | At most 40 model calls per run, a discarded one included, then the run stops with a message |
| Cost cap | `AGENT.budgetEur = 3.00` | The run stops once its own cost passes €3.00 |
| Idle timeout | `AGENT.idleTimeoutMs = 90000` | 90 s without streamed data counts as a failed request (retried) |
| No second source | `simulateSync`, `customerView` | The customer view is derived from the source; the model cannot pass a timetable in. A what-if is applied to a copy and labelled |
| Verified alert | `ui_report_alert` | Two distinct sources; for every train named, its source record (timetable or the change in the operations log), its published view and a physical observation that corroborates the change or the timetable fact, all read in this run, from responses that were kept; otherwise refused with what is missing. The card adds "Checked in this run:" from the tool results |
| Unknown ids | `ui_report_alert`, `ui_mark_mirror` | Dropped and reported back |
| Options | `ui_propose_options` | Exactly three distinct variants of the latest `sim_sync` call, which must have variants and must be neither a what-if nor a partial scope; the recommendation must be one of them; every figure from the engine; only after a verified alert for at least one of its trains; the card texts audited, each card on its own; refused after an approval |
| Decisions | `ui_propose_options`, `ui_await_decision` | Block until the human decides; a decision counts only for the set of options on screen (`options_seq`) and only once per option; clicks queued before the options appeared are dropped; approvals and rejections return as tool results with the next step, which names the drafts the option allows and how to name the option (A, B, C) |
| Drafts | `ui_draft_action` | Only after an approval and only of the kinds the approved option contains (a passenger message with a message action, a re-publication order with a re-publication, an override request with an override, a staff briefing with staff, a hold request with a hold; a memo only after accepting the risk); the source reference, the mock line and the footer "Prepared with the Timetable Translator AI assistant. Requires human approval before publishing." always added in code (a model-written line that imitates one is removed first); subject, recipient and body audited against the world model and the result the options rest on; refused once the summary is published |
| Report | `ui_final_report` | Refused while a draft is pending or a decision is open; the outcome must follow the decision; facts audited; "Live agent run" line added if missing |
| Fact audit | alerts and their source titles, option texts, drafts, report | Times (07:42, 7.42 Uhr), platforms (platform 7, Gleis 7, Gl. 7), coach sectors (sector F–G, Abschnitt F–G, 1st class F–G), minutes (+4 min, 12 Minuten), trains and passenger counts must match a fact a tool returned, by scope: narration and what-if alerts anything, verified alerts and the report no what-if, options and drafts only the world model and the options' result. A world-model fact counts only for the train it is about: the trains of the call and the trains the text names (a line name counts for all its trains). A value only the outdated channels show (an old platform, time or sector) may appear only next to the source's value. A Betriebsfahrplan time stands for the minute passengers are shown (an arrival rounded up, a departure down). Refused twice per text (tool, draft type and recipient), then marked as unchecked on screen |
| Mirror marks | `ui_mark_mirror` | Green ("re-publication approved") and amber on a contradiction ("informed, data behind") are set by the code from the human decision; the agent may mark contradictions affected or neutral, and trains or points it is checking at_risk |
| Key | 401 | The key is removed from the tab and the run stops |
| Audit | `recordApiExchange` | Every request and response logged, the system prompt and tool schemas once per run; signatures and redacted thinking stripped; the key never enters the audit |

Run states: Idle → Scanning → Diagnosing → Verifying → Simulating → Options → Awaiting your decision / Awaiting your approval → Executing → Done (or Stopped, Aborted, Error).

## 10. Simulation scripts and recorded runs

**Format** (`data/sim_runs.js`, one script per scenario). Steps of one kind each: `state`, `say` (narration), `think` (a reasoning summary), `tool` (a world-model lookup, re-run by the player through `js/ops.js`), `recordedTool` (a lookup a live run saw fail, replayed as recorded), `sync` (an engine call: a reference case or a specification, recomputed at playback), `alert`, `mirror`, `options` (texts and order; figures from the named sync result), `awaitOption` (rejection lines and an approval path per option and for accepting the risk), `draft`, `awaitActions`, `report`, `notice`, `end`. Narration quotes engine figures through `{{placeholders}}` (`js/sim_vars.js`): `{{pax}}`, `{{first_min}}`, `{{V1.mis}}`, `{{T-618.KK.platform.to}}` and so on.

**Checks** (`js/sim_check.js`, run by `tools/check_world.mjs` and Diagnostics). Every placeholder resolves; every typed timetable fact was returned by an earlier tool; every alert, option set and draft would be accepted by the live guardrails; at least 8 visible tool calls before the decision, a hypothesis and a visible "Revised:"; an approval path for every option and the baseline and a rejection line for every option; the report carries the simulation marker.

**Recorded runs** (`js/recorder.js`). "Save run as simulation" turns the audit event stream of a completed live run of a preset scenario into a script with `source: "recorded"`: narration, reasoning, every lookup (re-run at playback), every engine specification (re-run), alerts, mirror marks, the options, the drafts and the report (its live line replaced by the replay marker). A response that was discarded leaves no step. The recording carries the world and engine versions; a mismatch makes the check fail ("record the run again").

## 11. Verification log (18 October 2026)

| What | How | Result |
|---|---|---|
| Station codes and names | All 16 checked code by code against the public operating-point directory (2018 open-data edition, `ds-100` module) | All match (`DATA_SOURCES.md` §2) |
| World, scenarios, reference cases, scripts | `node tools/check_world.mjs` | 41/41 |
| Engine golden figures, passengers counted once, projection, refusals, fact audit, guards, tools, the audit by train, mirror data | `node tests/engine.mjs` | 12/12 groups |
| Streaming client, retries, cost maths | `node tests/unit.mjs` | Pass |
| Colour system | `node tools/palette.mjs --check` | 45/45 |
| Shared shell vs Rebate Hunter | `node tests/parity.mjs <checkout>` | 21/21 |
| Main flows and the mirror by mouse and keyboard | `tests/smoke.mjs` in Chromium | 8/8 cases |
| Six simulations, four decision patterns | `tests/sims.mjs` | 6/6 |
| Live agent against the protocol-checking stand-in | `tests/live.mjs` | 6/6 cases, no protocol violation |
| Key, Diagnostics, Abort/Reset, offline | `tests/accept.mjs` | 4/4 |
| Viewports, scenarios, targets | `tests/layout.mjs` | 7/7 |
| Colour grammar in the app | `tests/design.mjs` | 2/2 |
| Repository hygiene, documentation | `tests/hygiene.mjs`, `tests/docs.mjs` | Pass |
| The published site serves the commit and runs a simulation | `tests/live_site.mjs`, run by the *live site* workflow after every GitHub Pages build | Reported in the repository's Actions tab |

Found and fixed after the independent review (18 October 2026): the hygiene check stored its term list in the repository, encoded but readable (now outside it); the fact audit accepted any value a tool had returned, for any train, and did not read coach sectors (now per train, sectors included, outdated values only beside the source's, retries per text); the agent could mark a contradiction green before any decision, propose options without a verified alert, draft after the summary and replace the code's source line with its own (all refused now); people already at the platform could not be reached by a corrected display (now real-time channels reach everyone until the last moment); passengers who meant to board where a diverted train no longer stops were counted again on board (now the on-board share); a hold counted the passengers it saved among those it delayed; the next cycle and its cut-off, the construction order's start, a point failure and a train still using its track, the RB 48 and RE 7 origins, the sector shift's direction and several sensor texts did not agree (all made consistent).

Found and fixed while verifying: the engine counted a passenger once per wrong fact, so the 104 seat reservations on ICE 618 were added to the 312 passengers boarding (416 instead of 312), and the 46 who change to RE 57 to those alighting in Dortmund (now each passenger counts once per stop, checked by `tests/engine.mjs` and a world check that the groups nest); the engine changed a what-if's train reference in the model's own tool input (now it works on copies); times before a comma or a full stop escaped the fact audit (the pattern now ends at a digit boundary); a flagged source row lost its focus ring; the keyboard focus left a row when the mirror redrew; the legend returned no focus on Escape; the longer brand name pushed the header to a third badge row on small laptops, which let the console overlap the drawer bar at 1280 × 720; the mirror's narrow-card rules lost to the narrow-mirror rules and squeezed station names; option cards did not fit at 1080p; a link with two contradictions read "Time +1" (now one label per contradiction).

Not verified in this build: a run with a real API key (no key in the build environment). Read the run facts and the cost meter in rehearsal.

## 12. Acceptance checklist

"Mock" means the live agent ran against the scripted, protocol-checking stand-in for the Anthropic API (`tests/lib/fake-claude.mjs`).

| # | Requirement | How it was verified | Result |
|---|---|---|---|
| 1 | Loads with no key; Start opens the mode dialog; Live then asks for the key; the key is gone after the tab closes and never appears in logs or the audit export | `tests/accept.mjs key`; the Diagnostics "Key and privacy" row repeats the checks in the presenter's browser | Pass |
| 2 | A run of each scenario has ≥ 8 visible tool calls and ≥ 1 visible verification step | Simulation: all six scripts have 8 or more tool calls before the decision, a hypothesis, the physical layer and a visible "Revised:" (`tools/check_world.mjs`, `tests/sims.mjs`); mock live run: 8 lookups and engine calls before the options | Pass for Simulation and mock; real-key timing to be read from the run facts in rehearsal |
| 3 | Options always show the comparison including doing nothing; approving one produces outbox drafts; nothing is sent anywhere except api.anthropic.com | Every simulation and mock run shows three options plus "Do nothing" with engine figures; approval produces drafts; the CSP allows `fetch` to exactly one host; request logs in `tests/accept.mjs` and `tests/live.mjs` show no other | Pass |
| 4 | A Live sweep with no findings ends honestly | `tests/live.mjs scan`: "no material finding" with run facts; the monitor shows what was checked | Pass |
| 5 | The cost meter equals the usage maths; Abort and Reset always recover to Idle | Mock full run: meter equals the price table × usage to 1e-9; Abort/Reset matrix in both modes | Pass |
| 6 | Diagnostics flags an unreachable API, and nothing starts without it | `tests/accept.mjs diag` (api.anthropic.com blocked: the row fails and says why, the key check starts nothing, Simulation runs) | Pass |
| 7 | Simulation runs every preset with no key and no network at all; badge and watermark always visible; approval and rejection paths play; "Save run as simulation" exports a valid script that replays | `tests/sims.mjs`, `tests/accept.mjs offline`, `tests/live.mjs full` and `race` | Pass |
| 8 | Timetable facts in alerts, options, drafts and summaries come from tools, for the trains they concern, and an outdated value appears only beside the source's | `tests/live.mjs full`: a typed time is refused, shown as a guardrail line, corrected, and never reaches the Outbox; `tests/live.mjs guards`: a German-format time is refused; `tests/engine.mjs` audit group: another train's time, a sector no tool returned and an old platform alone are refused, retries are counted per text | Pass |
| 9 | A verified alert rests on the source, the published view and a corroborating physical observation; options follow it and rest on a full-scope result from the source | `tests/live.mjs guards` (one source, no physical layer, partial scope, what-if: all refused); `tests/engine.mjs` (options before a verified alert refused) | Pass |
| 10 | A decision, a draft or a summary can only follow the human decision on the options on screen | `tests/live.mjs guards` (a stale decision is ignored, a draft the option does not contain and a contradicting outcome are refused); every script checked against the same policy | Pass |
| 11 | The mirror shows the finding, follows the decision and stays legible from 1920 × 1080 to 1280 × 720 | `tests/smoke.mjs`, `tests/sims.mjs`, `tests/layout.mjs`, `tests/design.mjs` | Pass |
