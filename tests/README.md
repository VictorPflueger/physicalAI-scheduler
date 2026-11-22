# Tests (optional, for developers)

The Timetable Translator itself needs no Node.js, npm or build step. These scripts check it after a change to code, data or docs. GitHub Actions runs them on every push and pull request (`.github/workflows/tests.yml`).

## What runs

| Suite | Command | Checks |
| --- | --- | --- |
| `fingerprint` | `node tests/fingerprint.mjs` | The case is intact: the engine, the fifteen tools, the agent, the sensor logic, the data and the seven scripts are version 1.4.0's files byte for byte, and 49 decision paths give 1.4.0's figures (`fixtures/fingerprint-1.4.0.json`, written by 1.4.0's own modules) |
| `world` | `node tools/check_world.mjs` | The operating snapshot, the seven scenarios and their scripts, held to the live guardrails |
| `engine` | `node tests/engine.mjs` | The engine's golden figures for the seven scenarios, the customer projection, honest negatives, refusals, the fact audit in English and German, the guardrails, the live toolbox, the alignment data |
| `unit` | `node tests/unit.mjs` | The streaming client: SSE parsing, retries, aborts, truncated streams; the cost maths per model |
| `figures` | `node tests/figures.mjs` | Every figure in the page, the guide and the Start dialog is the engine's, the four tiles before anything runs too; every placeholder filled on every path; no euro amount typed in; names instead of ids on every state of every path; the docs' figures. Cases: `page names docs` |
| `vici` | `node tests/vici.mjs` | Vici's own checks: the guide and its key figures, the byline, the writing rules, the AI notice and record ids on the page and on all 798 states the presenter draws for the seven scenarios on every path (`lib/pages.mjs` draws them in Node with the page's modules); the docs; `vici/` byte for byte at the commit its README names |
| `lean` | `node tests/lean.mjs` | The limits a change has to argue with: the presenter's modules and lines, one stylesheet, one module that makes requests, the security policy, no link to the repository, the docs' length, nothing of 1.4.0's console left |
| `docs` | `node tests/docs.mjs` | Every path a document names exists; the README names the release and links the site; `DEMO_SCRIPT.md` walks the guide's talk track; this list names every suite |
| `hygiene` | `node tests/hygiene.mjs` | No published file carries a private term or an e-mail address. The list comes from the `HYGIENE_TERMS` secret or a `.hygiene-terms` file next to the repository; without it only the generic checks run |
| `page-icon` | `node tests/page-icon.mjs` | `favicon.svg` byte for byte; the header and the loading screen use the page icon's cell; with Victor's website (`VIP`) next to this repository, its card gives the same icon and kind |
| `showcase` | `node tests/showcase.mjs` | The presenter in Chromium against the engine's figures: the first screen and its four tiles, the header, Your turn wherever the page waits, the network, the five steps by click, key, clicker and link, Start agent, what 2.0.0 keeps (the diagram, the sensors, the AI notice, the decision log), the seven scenarios, Play, and the layout at 1920 × 1080, 1366 × 768 and 1280 × 720 in both themes. Cases: `first-screen header turn network steps start keep scenarios play layout` |
| `guide` | `node tests/guide.mjs` | How the prototype works: ViciDesign's own check-guide-render.mjs against the page over http; it opens in every new tab and not on a reload, `?guide=0` and `?guide=present`, the figure rows and the talk track, every chapter fits 1280 × 720 and 1366 × 768. Cases: `render opening` |
| `contrast` | `node tests/contrast.mjs` | Every visible text at WCAG AA, in both themes at 1920 × 1080 and 1280 × 720, in eleven states |
| `hexagon` | `node tests/hexagon.mjs` | Vici's hexagon rule: nothing round in the app's files or on the rendered page, in both themes |
| `live` | `node tests/live.mjs` | A live run against `lib/fake-claude.mjs`, a stand-in for the Messages API that checks every request: the key check, LIVE and the AI notice, the page following Claude, a rejection and an approval, a draft refused by the fact audit in view, the measured cost, a retry, Stop, keys Anthropic rejects. Cases: `full stop badkey` |

`node tests/run-all.mjs` runs everything in that order and ends with ALL SUITES PASSED when every suite ran and passed. Name suites to run only those (`node tests/run-all.mjs engine showcase`). With `--require-vici`, as on GitHub Actions, the Vici checks fail without a ViciDesign checkout instead of skipping.

Three checks are not part of `run-all`:

| Check | Command | Checks |
| --- | --- | --- |
| `rework` | `node tests/rework.mjs` | The portfolio audit's scoring rule, rows A1 to A5 and B1 to B7, on the page as served and rendered; it ends with REWORK POINTS and the sum. B1 compares `vici/` with ViciDesign's current main, so it moves when Vici does: run it before a release |
| `live_site` | `node tests/live_site.mjs [url]` | GitHub Pages serves this commit's files, and the platform change plays from the guide to Done there. The *live site* workflow runs it after every Pages build |
| `remote_head` | `node tests/remote_head.mjs` | GitHub's `main` holds exactly the local commit, with nothing left uncommitted |

No test calls a real API or spends money; the browser suites block every request to another host.

## Setup

You need Node.js 22 and Playwright with Chromium, installed once outside this folder:

```
npm install -g playwright@1.56.0
npx playwright install chromium
```

Then run with Node's module path pointing at the global packages, and a ViciDesign checkout next to this repository (`../ViciDesign`) or in `VICI_DIR`:

```
NODE_PATH="$(npm root -g)" node tests/run-all.mjs
```

On Windows PowerShell: `$env:NODE_PATH = (npm root -g); node tests/run-all.mjs`. `CHROME_PATH` points the browser suites at another Chromium; `TT_TEST_OUT` says where screenshots go.
