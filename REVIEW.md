# REVIEW — the Timetable Translator and its parity with the sister prototypes

This document has five parts:

1. **What was asked and what was built:** the brief, the concept, and where each requirement lives.
2. **Parity checklist:** every feature of the sister apps and its counterpart here, with a status.
3. **Findings** from building and verifying this version, fixed and open.
4. **Back-port recommendations** for the Rebate Hunter and the Navigator.
5. **Decisions and open points.**

Subject: Timetable Translator 1.0.0 (`js/config.js`), 18 October 2026. Reference: Rebate Hunter 7.1.0 (`VictorPflueger/PROC-Rebate-Hunter`, the most recent sister app, whose shell this build reuses) and Navigator 1.1.0 (`VictorPflueger/supply-chain-navigator`). Live sites: `victorpflueger.github.io/PROC-Rebate-Hunter/`, `victorpflueger.github.io/supply-chain-navigator/`.

---

## Part 1. What was asked and what was built

**The brief.** A new physical-AI prototype to show a client, drafted from an e-mail exchange about passenger information on the railway: how AI could keep the operational timetable (Betriebsfahrplan) and the customer timetable (Kundenfahrplan) better in step, on the condition that the AI must not become a second source of timetable truth but should connect operational reality with what passengers are told. The reply in that exchange proposed the concept built here: the AI as a **translator** that keeps no timetable of its own, traces every fact back to the shared source, derives passenger information from operational changes such as platform changes or diversions, and reports contradictions between the two timetables, in the spirit of the world model of the whitepaper *Two AI Worlds, One Robot*. Design (colour coding, features, run model) was to follow the two sister prototypes.

| Requirement | Where it lives | Status |
|---|---|---|
| No second source of timetable truth | The engine derives the customer view from the source (`js/sync.js`); the agent has no tool that writes a timetable; options with hand-set values are labelled "second truth" | Built |
| Every fact traceable to the source | Contradictions name the source version, the change, the channel version and the cause; the fact audit (`js/facts.js`) refuses any time, platform, minute figure, train or passenger count no tool returned; drafts carry a source reference | Built |
| Passenger information derived from operational changes | Platform, time, stop not served, stop missing, terminus, coach order and connection contradictions; passenger messages German first, then English | Built |
| Contradictions reported, humans decide | Verified alerts, three costed options plus doing nothing, approvals, an outbox connected to nothing | Built |
| Link to the whitepaper's world model | The physical layer (`phys_observe`) corrects and confirms the source; a verified alert needs it (`README.md`, *The concept*) | Built |
| Sister-app design and features | Part 2 | Built |
| Public repository names no client, contact or meeting | `tests/hygiene.mjs` | Built, checked on every push |

## Part 2. Parity checklist

Status: **Same** — identical code or behaviour (the shared modules are character for character equal apart from names, `tests/parity.mjs`); **Adapted** — the same feature with timetable content; **Improved** — the same feature plus a fix the sister apps can take; **Replaced** — a domain module in the same role; **New**; **Changed** — deliberately different.

### Look

| # | Sister-app feature | Timetable Translator | Status |
|---|---|---|---|
| P1 | Palette generated from `#7a1e3a` in OKLCH, roles, contrast and colour-blind checks | Same generator and source; every token value identical; `tools/palette.mjs --check` 45/45 | Same |
| P2 | Barlow, Barlow Semi Condensed, IBM Plex Mono, self-hosted | Same files, byte for byte | Same |
| P3 | Header (brand, badges, four KPI tiles), control bar, centrepiece and console, drawer (Options, Outbox, Audit) | Same grid and breakpoints; the timetable mirror takes the board's panel | Same |
| P4 | Components: buttons, chips, KPI tiles, option cards, comparison bars, outbox cards, AI label, progress rail, status pill, modals, console entries | `components.css`, `console.css`, `drawer.css`, `fonts.css` identical; `modals.css` and `style.css` the same rules, `style.css` plus one marked app-specific rule (the longer brand name wraps below 1400 px) | Same |
| P5 | Colour grammar: burgundy human, violet AI, red/amber/green the domain's state, blue checking, hazard tape simulation | Same rules; red/amber/green mean the state of passenger information; violet also marks the translator and a what-if | Adapted |
| P6 | Logo and favicon (burgundy tile, white mark) | Own mark: three source rows linked to three published rows, one of them ringed | Adapted |
| P7 | Boot screen, `file://` help, missing-file report | Same | Same |
| P8 | Motion and reduced motion | Same, plus the mirror's pulses and flashes, all off under reduced motion | Adapted |
| P9 | Accessibility: skip link, live regions, focus trap, keyboard menus, large targets, focus ring | Same; every mirror row, channel chip, station, monitor row and legend toggle is a button of at least 40 px with a full accessible name, keeps the focus across redraws and returns it from its popover | Adapted |
| P10 | Projector features: Larger text, tested viewports | Same; tested from 1920 × 1080 to 1280 × 720 | Same |
| P11 | Centrepiece: the Navigator's map, the Rebate Hunter's board | **Timetable mirror**: corridor strip, Betriebsfahrplan beside the published Kundenfahrplan with the translation as lines, sync monitor, legend, popovers, state colours with a mark per state | Replaced |

### Run model and features

| # | Sister-app feature | Timetable Translator | Status |
|---|---|---|---|
| F1 | Mode dialog, "Will run", Change or forget key | Same | Same |
| F2 | Key handling, session-only storage, redaction, 401 removes the key, no key entry in a frame | Same, under `tt.anthropic.key` | Same |
| F3 | Models: Sonnet 5.5 (default), Haiku 5.5, Opus 5.5 | Same | Same |
| F4 | Streaming client, retries, downgrades, stop reasons, discarded attempts | Same modules | Same |
| F5 | Cost meter, €3 and 40-call caps | Same; no web search, so no search fee | Same |
| F6 | Guardrails in code | The same set, rewritten for the domain: verified alerts need the source record, the published view and a corroborating physical observation; options only from a full-scope result from the source; options only after a verified alert; a decision bound to the options on screen; drafts only of the kinds the option contains and none after the summary; the outcome follows the decision; the mirror's green and amber only from a decision; a fact audit by train for times, platforms, coach sectors, minutes, trains and passengers in English and German forms, with outdated values only beside the source's | Adapted |
| F7 | Live scan / sweep with an honest empty end | Live sweep over the trains in the window | Adapted |
| F8 | Custom what-if (Live only) | Same | Same |
| F9 | Six preset scenarios with reference cases | Six rail scenarios on real stations | Adapted |
| F10 | Simulation scripts with engine placeholders and a checker holding them to the live guardrails | Same format with timetable placeholders | Adapted |
| F11 | Save run as simulation | Same mechanism; mirror steps, and the world and engine versions in every recording | Adapted |
| F12 | Run facts, Guardrail lines | Same; tool calls counted as source, published view, physical layer and sync calculations | Adapted |
| F13 | Audit tab, filters, JSON export | Same | Same |
| F14 | Diagnostics | Three rows: Anthropic API, world data integrity, key and privacy | Adapted |
| F15 | Open-data tools (weather, LEI index, exchange rates) | None: the snapshot and its physical layer are the only sources (D-T3) | Changed |
| F16 | ERP tools | `ops_*` (operations log, Betriebsfahrplan, passengers, alternatives), `kfp_get_published`, `phys_observe` | Replaced |
| F17 | Deterministic engine (impact, rebate) | Deterministic sync engine | Replaced |
| F18 | Intro window, five steps, under 200 words | Same structure, timetable copy | Adapted |
| F19 | KPI tiles with payoff after a decision | Passengers at risk, First affected in, Detection → decision, Session cost | Adapted |
| F20 | Hand-over labels, progress rail, AI labels | Same; the AI labels name what was checked (trains, times, platforms) | Adapted |
| F21 | Options: three plus doing nothing, bars, recommended frame, accept the risk | Same; Still misinformed, Back in sync, Hand-kept values, Staff effort, Protected passengers, Connection held | Adapted |
| F22 | Outbox with footers, Approve all, unchecked-figures chip | Re-publication orders, passenger messages, override requests, staff briefings, hold requests, memos; "Unchecked facts" chip | Adapted |
| F23 | Management summary, Abort, Reset, New run, replay speeds | Same | Same |
| F24 | `ui_mark_board`, `board_update`, the centrepiece following lookups, results and decisions by itself | `ui_mark_mirror`, `mirror_update`; the mirror follows the run events itself | Changed |

### Shared shell (identical apart from names and comments)

`js/anthropic.js`, `js/clock.js`, `js/cost.js`, `js/dom.js`, `js/drawer.js`, `js/handover.js`, `js/keystore.js`, `js/labels.js`, `js/md.js`, `js/modal.js`, `js/progress.js`, `js/sse.js`, `css/components.css`, `css/console.css`, `css/drawer.css`, `css/fonts.css`; `css/modals.css` and `css/style.css` with the same rules; the colour tokens and the fonts. `tests/parity.mjs` compares them with a Rebate Hunter checkout on every push.

### Tests, tooling and documents

| Suite | Here | Status |
|---|---|---|
| tokens, unit | Same | Same |
| world | 41 checks for the rail world, the scripts held to the live guardrails | Adapted |
| engine | 12 groups: golden figures, passengers counted once, projection, honest negatives, refusals, fact audit, guards, tools, the audit by train, mirror data, texts | Adapted |
| smoke, sims, live, accept, layout, design | 8 cases, 6 simulations with four decision patterns, 6 live cases against the protocol-checking stand-in, 4 acceptance cases, 7 layout checks, 2 design checks | Adapted |
| parity, hygiene, docs | The shared shell against the sister app; no client, contact or meeting named; the documents complete and consistent with the code | New |
| CI | GitHub Actions: Node suites, parity against the public sister repository, browser suites | Same |
| Documents | `README.md`, `DESIGN.md`, `TECH_NOTES.md`, `DATA_SOURCES.md`, `DEMO_SCRIPT.md` (German), `tests/README.md`, this file | Adapted |

## Part 3. Findings

Found and fixed while building and verifying (details in `TECH_NOTES.md` §11):

| ID | Finding | Fix |
|---|---|---|
| T1 | A passenger was counted once per wrong fact: the 104 seat reservations on ICE 618 were added to the 312 passengers boarding (416), and the narration said 312 board | Counted once per stop (`distinctPax`), a golden test and a world check that the groups nest |
| T2 | The engine wrote a normalised train id back into the model's own tool input, which is echoed to the API and recorded | The engine works on copies |
| T3 | A time before a comma or full stop ("07:44,") escaped the fact audit | The pattern ends at a digit boundary; tenths ("08:37.6") stay excluded |
| T4 | Keyboard focus left a mirror row on redraw; a flagged row lost its focus ring; Escape on the legend returned no focus | Fixed, covered by `tests/smoke.mjs` |
| T5 | The longer brand pushed the header to a third badge row at 1280 × 720, so the console overlapped the drawer bar | The brand wraps below 1400 px (app-specific rule) |
| T6 | Option cards overflowed at 1080p; a link with two contradictions read "Time +1"; colour alone carried a state | Shorter texts; one label per contradiction, each with a state mark |

Found by the independent review (an agent that had not built the prototype, 18 October 2026) and fixed:

| ID | Finding | Fix |
|---|---|---|
| R1 | The hygiene check kept its term list in the repository, encoded but readable | The list lives outside the repository (a CI secret, or a file next to the folder) |
| R2 | The fact audit accepted a value any tool had returned, for any train, and read no coach sectors; a passenger message could name the old platform as if it were current | Facts by train, sectors audited, an outdated value only beside the source's value |
| R3 | The agent could turn a contradiction green ("re-publication approved") before anyone decided | Green and amber on a contradiction follow the human decision only |
| R4 | The misinformation model let no correction reach people who had already gone to the platform, so "312 → 90" overstated what a corrected display leaves | The journey planner informs at planning time; displays, announcements, staff, the push and the coach-position displays reach everyone if the correction is in place five minutes before the last moment ("312 → 7") |
| R5 | Retries were counted per run, drafts were possible after the summary, recipients and source titles were not audited, a model-written source line replaced the code's, options needed no verified alert | Retries per text; no drafts after the summary; recipients and source titles audited; the code's lines always; options only after a verified alert |
| R6 | "Next cycle 08:00" at 07:28 for a half-hourly cycle; one cause said the 07:30 import was already missed; "manual release" meant two things | The cycle closes 15 minutes before it runs (stated on the card and in `DATA_SOURCES.md` §4); manual release only for a rejected update |
| R7 | The construction order's sensor evidence predated the order; a point failure without an end time while a later train used its track; RB 48 shown starting at a station without service | The speed restriction is in place from 06:30 and the order adapts the timetable from 08:00; ICE 612 leaves from track 4; RB 48 and RE 7 start in Wuppertal Hbf |
| R8 | Passengers boarding at stops a diverted train skips were counted again among those travelling on (1,122) | The on-board share (856) |
| R9 | The README said the coach sectors were reversed (they shift by one sector), the track note named the wrong direction, a hold counted the passengers it saved among those it delays, sensor texts said "set" for a stored route and "provided" for an arriving train, a double unit was 346 m | All corrected |

Open:

| ID | Finding | Note |
|---|---|---|
| O1 | No run with a real API key in this build | The live loop is verified against the protocol-checking stand-in only. Rehearse live before the first client demo (`DEMO_SCRIPT.md`, Pre-flight) |
| O2 | Cost per run not measured | Estimates carried over from the sister apps; read the cost meter in rehearsal |
| O3 | Counts are per stop, not per journey | Two wrong facts at one stop count once, and the on-board share removes passengers who meant to board where a diverted train skips. A passenger with a wrong departure where they board and a wrong arrival where they alight still counts at both stops; none of the six scenarios has that case, a what-if can (`DATA_SOURCES.md` §4) |
| O4 | English interface for a German-speaking audience | Kept for parity (D-T2); the stage script is German and the passenger messages are German first |
| O5 | Live mode audits facts by train, not by stop | A time of the right train at another stop passes the audit; the source values for the trains concerned are in the draft's source reference for the approver |

## Part 4. Back-port recommendations for the sister apps

| ID | Recommendation |
|---|---|
| B1 | Test whether the rebate and impact engines change their tool input in place (T2). Any normalisation written into the input alters the transcript sent back to the API and the recording |
| B2 | Run the sister apps' figure audits against figures at the end of a sentence or before a comma (T3) |
| B3 | Adopt `tests/parity.mjs` in both directions, with the marked app-specific block at the end of `css/style.css`, so a shared-shell change is caught on push |
| B4 | Adopt `tests/hygiene.mjs` and `tests/docs.mjs`: the first keeps prospect names out of public repositories with its term list kept outside them, the second keeps cited sections and named paths true |
| B5 | Where a centrepiece's legend docks below it on narrow screens, subtract its height before choosing a size class, as `sizeClass` in `js/mirror.js` does |

## Part 5. Decisions and open points

The decisions are logged as D-T1 to D-T19 in `TECH_NOTES.md` §8. Open points for a next version: a rehearsal and a recorded live run per scenario (O1, O2); origin–destination figures if a pilot has them (O3); a German interface if the audience asks for it (O4); an audit by train and stop in live mode (O5); and, for a client setting, the app on its own host rather than a shared `github.io` origin (`README.md`, *Your API key*).
