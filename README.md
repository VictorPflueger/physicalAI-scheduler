# Timetable Translator

An AI agent for railway passenger information. It finds where passengers are told a wrong platform or time, checks the operational timetable and the track's sensors, counts who would act on it and drafts the fix for a person to approve.

Live site: <https://victorpflueger.github.io/physicalAI-scheduler/> · Version 2.0.0

**Fictional trains, no client data.** The stations and lines are real; the trains, times, passengers and sensor readings are invented.

## The four figures

Top right, each a row of the guide's How it works chapter.

| Figure | What it measures | Platform change |
|---|---|---|
| Misinformed passengers | Who would act on wrong information in the next three hours; after your decision, who is left | 312, then 7 with option A |
| First passenger acts in | Minutes until the first of them acts on it | 14 min, at Köln Hbf |
| Detection → decision | From the lead on screen to your approval, timed on the page | about 4 minutes on the talk track |
| Session cost | The agent's model fees: estimated in the replay, measured in a live run | ≈ €0.09 on Sonnet 5.5 |

## The talk track

The guide, *How the prototype works*, opens once per browser tab. When it closes, the story plays: each step stays as long as its words take to read, and Play stops wherever you act, with **Your turn** and the button to press in the bar under the story. Space pauses; the arrow keys, a clicker or 1 to 5 step by hand. The guide's last chapter is the presenter's script; [DEMO_SCRIPT.md](DEMO_SCRIPT.md) adds the questions that come.

1. Spot: a radio message says ICE 618 leaves from platform 7 while the app says 5. The agent checks the operations log first.
2. Check: every channel still says platform 5, and the interlocking has stored the route out of platform 7. The sensors confirm the source.
3. Calculate: the engine counts who would act on it. The app alone misleads 8 passengers; every channel together, 312, the first in 14 minutes.
4. Propose: three responses next to doing nothing, costed by the engine. The agent recommends option A, re-publishing from the source; you approve it.
5. Prepare: the agent drafts the re-publication order and the passenger message. Each waits for your approval, and nothing is published.

A link opens a step, paused: `?step=propose`. The scenario menu holds six more, from a diversion to a cross-border ICE whose European timetable lags; `?scenario=diversion` opens one directly.

## Start agent: the simulation or a live run

The page opens on the simulation: a replay of the agent's run through its live tools, so the engine computes every figure again and no model is called. **Start agent** offers it again first, or a live run with Claude Sonnet 5.5 on your own Anthropic API key, with "You are interacting with an AI system" beside it. The key stays in this tab and goes only to api.anthropic.com. A live run stops at 40 model calls or €3 and says why. The session cost is estimated from the run's own prompts; no live run with a real key has been measured yet.

## What is real

| | |
|---|---|
| Fictional | ICE 618 and every other train, the times, the passengers, the sensor readings, the leads, and the agent's words in the replay |
| Real | The stations and lines, the engine's arithmetic and, on your key, Claude |
| Simulated | The replay: scripted steps played through the real tools |
| In production | The operational timetable and each channel's publication from the railway's own systems, with interlocking and train-position data as the sensors |

## How it works

The AI keeps no timetable of its own. A deterministic engine derives what passengers should be told from the source, finds every contradiction and counts who relies on it. The agent reads, checks against the sensors, proposes and drafts, and every time, platform and count it writes is checked in code against what a tool returned. A person decides. This is the world-model loop of the white paper *Two AI Worlds, One Robot*: the operating snapshot is the world model, the sensors correct it, the agent plans against it.

The engine, the fifteen tools, the agent with its guardrails, the sensor logic and the seven simulation scripts are version 1.4.0's files, byte for byte (`tests/fingerprint.mjs`). Version 2.0.0 replaced the console around them with a presenter on Vici 2.0, Victor's design system (`vici/`): `js/shell.js` holds the steps, keys, tiles and the bar under the story, `js/main.js` the run, Play and the decisions, `js/run.js` and `js/story.js` turn a run into five steps in words, `js/view.js` and `js/diagram.js` draw them, `js/plain.js` puts names where the data has ids, and `js/estimate.js` prices a run before anyone runs it live.

## Run it

No build step and no install. Serve the folder over http and open it in Chrome or Edge:

```
python -m http.server 8000
```

then <http://localhost:8000>. Opened from disk, the browser blocks its modules, and the loading screen says so. GitHub Pages publishes `main`.

## Tests

`node tests/run-all.mjs` runs every suite; [tests/README.md](tests/README.md) lists them. GitHub Actions runs them on every push, with Vici's own checks. No test calls the real API.

## History

Version 1.4.0 was a console with a timetable mirror, a control bar, a console replay and a drawer. Its design notes, data sources, review and technical notes are in the git history (commit `04006b6`), where comments in the engine's files still point.

## Author

Built by Victor Pflüger, on [Vici](https://victorpflueger.github.io/ViciDesign/).
