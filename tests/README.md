# Tests (optional, for developers)

The Timetable Translator itself needs no Node.js, npm or build step. These scripts are the checks behind the acceptance checklist in `TECH_NOTES.md` §12. Run them after changing code or data. GitHub Actions runs them on every push and pull request (`.github/workflows/tests.yml`).

## What runs

| Suite | Command | Checks |
|---|---|---|
| tokens | `node tools/palette.mjs --check` | The colour system: WCAG 2.2 contrast for every text and state pairing, burgundy kept apart from danger, the state colours and the brand kept apart under simulated protanopia, deuteranopia and tritanopia, and `css/tokens.css` and `design/tokens.json` up to date with the generator. Node.js only |
| world | `node tools/check_world.mjs` | The operating snapshot (every trip on the network, forwards in time, in tenths of a minute, on existing tracks; changes corroborated by the physical layer; publication states; passenger groups that nest), the six scenarios (each shows its contradictions, every other train matches the source), the reference cases and the six simulation scripts held to the live guardrails (41 checks). Node.js only |
| unit | `node tests/unit.mjs` | Streaming client: SSE parsing, thinking signatures, retries, aborts, truncated streams; cost maths per model. Node.js only |
| engine | `node tests/engine.mjs` | Golden figures of the sync engine for all six scenarios (first estimate, finding, every variant), passengers counted once per stop, the connection hold and the alternatives for stranded passengers; the customer projection (minutes rounded, operational stops hidden unless a conversion fault publishes them, cancelled and extra stops, the new terminus); honest negatives for every other train; refusals and the labels of partial scopes and what-ifs; the fact audit in English and German forms; the guardrail policy (`js/guards.js`); the live toolbox (options only from a full-scope result from the source, stale decisions ignored, drafts per option and fact-checked, the summary after the Outbox); the mirror's data; placeholders, journeys, draft lines and the decision payoff; the alignment view's data for all six scenarios (the stop, the source's values, each channel's value and verdict, the impact, the sensor readings) and the plain sentence for each tool call (13 groups). Node.js only |
| hygiene | `node tests/hygiene.mjs` | No file the repository publishes names a term of a private list (the prospective client, the contact, the meeting, the client's data services) or carries an e-mail address. The list never enters the repository: it is read from the `HYGIENE_TERMS` environment variable (a CI secret), from the file named in `HYGIENE_TERMS_FILE`, or from a `.hygiene-terms` file next to the repository folder. Without it only the e-mail check runs, and the suite ends with HYGIENE GENERIC OK instead of HYGIENE OK. Node.js only |
| docs | `node tests/docs.mjs` | The documents exist with their required sections; every section the code cites ("TECH_NOTES §3") and every path a document names exists; the README links the live site. Node.js only |
| parity | `node tests/parity.mjs <Rebate Hunter checkout>` | The shared shell is the sister app's: the shared modules and stylesheets character for character (names normalised), `style.css` and `modals.css` rule for rule, every colour token, the fonts byte for byte. Without a checkout it says so and exits with 2 (`run-all` reports it as skipped) |
| smoke | `node tests/smoke.mjs` | A full Simulation run of ICE 618 with the finding on the alignment view and in the timetables, the options, the approval's payoff on both views and the KPI tiles, outbox, summary and audit export; the key check and a model that keeps ending early; Diagnostics and a custom what-if; the intro window; the timetable mirror by mouse and keyboard (the alignment view's cards with the focus ring, then the timetables: popovers of both timetables and of a station, Escape returning the focus, channel chips, legend and toggles, focus kept through a redraw, all trains; every control at least 40 px; nothing loaded from outside); reduced motion; `file://`; a missing data file |
| sims | `node tests/sims.mjs` | All six simulations along four decision patterns (approve the recommendation; reject one, approve another; accept the risk; reject all three, then accept the risk): placeholders resolved, SIMULATION markings, no network at all, the payoff on the KPI tiles and on the mirror (green after a re-publication, amber when passengers are only informed, an accepted risk kept and marked, on the alignment view, in the timetables and in all trains), the audit export |
| live | `node tests/live.mjs` | The live agent against `lib/fake-claude.mjs`, a scripted stand-in for the Messages API that checks every request against the protocol rules (assistant turns echoed unchanged, every tool call answered, headers, the fifteen tools, no server tools). Six cases: a full ICE 618 run (parallel lookups, `pause_turn`, a 529 retry, a verified alert, first estimate then verified figure, rejection then approval, a `max_tokens` retry, a draft refused by the fact audit and corrected, report, audit, cost maths, Save run as simulation and its replay); a second decision while the model answers the first; Abort; a rejected key; a Live sweep with no finding; the guardrails (a response that breaks off, alerts without enough evidence, options on a partial scope or a what-if, a stale decision, a draft the option does not contain, a German-format time no tool returned, a contradicting outcome) |
| accept | `node tests/accept.mjs` | Key lifecycle and privacy; Diagnostics with api.anthropic.com unreachable; the Abort/Reset matrix in both modes; Simulation fully offline (the mirror drawn and following the decision, not one request leaving the page's own server) |
| layout | `node tests/layout.mjs` | 1920×1080, 1600×900, 1536×864, 1366×768 and 1280×720, idle, at the finding, with options, with drafts, approved with the drawer hidden, with the legend opened and in all trains: no horizontal overflow, the header keeps its height and two badge rows, one-row control bar; on the alignment view no card leaves the view or covers another, every value stays inside its card, no source value, channel value or verdict is cut to an ellipsis, the finding stays in view; in the timetables nothing leaves the panel or covers anything else, the strip's labels stay apart, the line labels never stack, the finding stays in view; the other five scenarios at 1280×720 and 1600×900; touch targets of at least 40 px (7 checks) |
| design | `node tests/design.mjs` | The colour grammar in the running app: the alignment view's channel cards and the mirror's rows, lines, labels, corridor rings, monitor rows and legend use the state tokens before and after the decision; the status pill and progress rail name the human step; AI labels open and close. Also writes review screenshots: the options under a simulated projector washout and the finished run as seen with protanopia, deuteranopia and tritanopia (`review-*.png` in the design folder of the test output) |

| pitch | `node tests/pitch.mjs` | The five-minute pitch as the audience sees it, every expected figure worked out by the engine in the test: the alignment view as the first view with no verdict before a check; during the run what the AI reads, a channel it has read waiting as *Read, not compared yet*, the first estimate judging the journey planner only, the verified finding on every channel, the sensors confirming it and the impact line; each decision's outcome (re-published and aligned, data still wrong, set by hand, risk accepted); the run reaching the decision within 60 seconds at ×1 with at most eight short paragraphs; a plain sentence on every tool call; the intro (what it does with the engine's example, how the AI aligns the information, what it achieves) without scrolling at 1280×720, 1600×900 and 1920×1080; the option cards, the KPI wording and the passenger message as the first draft |

`node tests/run-all.mjs` runs everything in that order, prints a summary and ends with ALL SUITES PASSED when every suite ran and passed. Name suites to run only those (`node tests/run-all.mjs unit engine live`); name cases to run only those within a suite (`node tests/live.mjs full abort`). The parity suite looks for a Rebate Hunter checkout next to this repository (`../PROC-Rebate-Hunter`) or in `PARITY_REF`; give its path when you run it on its own.

After publishing, `node tests/remote_head.mjs` checks that GitHub's `main` holds exactly the local commit and that nothing is left uncommitted, and `node tests/live_site.mjs [url]` checks the published site: it serves exactly the files of this checkout (retrying while the Pages cache catches up) and a Simulation run of scenario 1 completes there with no error and no request to another host. The *live site* workflow (`.github/workflows/live-site.yml`) runs it after every GitHub Pages build.

No test calls a real API or spends money: the Anthropic API is replaced by the scripted stand-in inside the browser. The app loads nothing else from outside, and the browser suites block any other request.

## Setup for the browser suites

You need Node.js 20 or later and Playwright with Chromium. Install them once, outside this folder:

```
npm install -g playwright@1.56.0
npx playwright install chromium
```

The GitHub Actions workflow pins the same version, the one the suites were last run with.

Then run with Node's module path pointing at the global packages:

```
NODE_PATH="$(npm root -g)" node tests/run-all.mjs
```

On Windows PowerShell: `$env:NODE_PATH = (npm root -g); node tests/run-all.mjs`.

Options (environment variables):
- `PLAYWRIGHT_MODULE`: path to a Playwright installation, instead of `NODE_PATH`.
- `CHROME_PATH`: use this Chrome or Chromium binary instead of Playwright's.
- `TT_TEST_OUT`: folder for screenshots, downloads and result files (default: a folder named timetable-translator-tests in the system temp folder).
- `PARITY_REF`: path to a Rebate Hunter checkout for the parity suite.

The suites serve the app on `127.0.0.1` ports 8765 to 8770 and 8772.
