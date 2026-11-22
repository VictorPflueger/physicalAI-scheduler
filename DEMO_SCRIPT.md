# Timetable Translator: the five-minute demo

**For** a head of passenger information, operations or customer service at a railway. **Goal:** after five minutes they can repeat one sentence: *"The agent checked a radio message against the source and the sensors, found 312 passengers about to go to the wrong platform, and a person approved the fix in minutes; nothing was published."*

## The four figures at the top

| Figure | What it shows | In the demo |
|---|---|---|
| Misinformed passengers | Who would act on wrong information, then who is left after your decision | 312, then 7 |
| First passenger acts in | Minutes until the first of them acts on it | 14 min, at Köln Hbf |
| Detection → decision | From the lead on screen to your approval, timed on the page | about 4 minutes |
| Session cost | The agent's model fees | ≈ €0.09 for a live run |

## Before the call

1. Chrome or Edge, full screen (F11), standard zoom; other tabs closed, notifications off.
2. Walk the five steps once. The simulation needs no key and no network.
3. Let the guide open, or start at `?guide=0` if you explain the prototype yourself. A link to a step, such as `?step=check`, opens it paused, so the page waits for you.
4. For a live run, bring your own Anthropic API key from a workspace with a spend limit, and keep the simulation as the fallback.

## The five minutes

The same script as the guide's last chapter, *How to present*. Closing the guide starts Play: each step stays 7 to 14 seconds, as long as its words take to read, and Play stops wherever you act, with **Your turn** in the bar under the story. To give a step its minute, press Space to pause; → or a clicker moves on, ← goes back.

1. **Spot: it plays by itself; point at the four figures.** (1 min)
   "312 passengers go to the wrong platform, the first in 14 min."
2. **Check: point at the sensors.** (1 min)
   "Every channel says platform 5, and the interlocking confirms platform 7."
3. **Calculate: point at the first estimate.** (1 min)
   "The app alone looked like 8 passengers; every channel together, 312."
4. **Propose: press Approve option A** in the bar under the story. The first figure falls from 312 to 7 and the clock stops. (1 min)
   "Re-publishing from the source leaves 7; a person decides in about 4 minutes."
5. **Prepare: press Approve both drafts**, then point at the decision log. (1 min)
   "Nothing is published. Live, the agent's run costs about €0.09."

## Questions you will get

**Is this real data?** No. The stations and lines are real; ICE 618, its passengers and the sensor readings are invented.

**Does the AI change the timetable?** No. It keeps no timetable of its own: an engine derives what passengers should be told from the operational timetable, and every time, platform and count the agent writes is checked against what a tool returned.

**Why trust the source over the app?** Because the sensors confirm it: in step 2 the interlocking has stored the route out of platform 7.

**Why not just send a message?** Options B and C do that, by message or by hand. The engine shows that both leave more passengers misled and the data wrong; re-publishing from the source aligns every channel after 8 minutes.

**What does the AI decide?** Nothing. The engine computes, the agent proposes and drafts, a person approves, and nothing is published.

**What would a live run cost?** About €0.09 on Sonnet 5.5, estimated from the run's own prompts; a live run measures it on the tile. It stops at 40 model calls or €3.

## If something goes wrong

- **The page stays on its loading screen.** It was opened from a file; serve the folder over http.
- **A live run stops early.** The bar says why: the key, the network, 40 model calls or €3. Start agent, then Run the simulation.
- **The page moved on while you talked.** Press ← to go back; Space pauses. Replay at the end plays the scenario again from Spot.
- **Someone asks about other failures.** The scenario menu holds six more, from a diversion to a cross-border ICE.
