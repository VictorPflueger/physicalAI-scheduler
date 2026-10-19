# Timetable Translator — design system

How the Timetable Translator looks, why it looks that way, and how to change it without breaking it. Version 1.2.0, 19 October 2026.

The Timetable Translator shares its design system with its sister prototypes, the **Navigator** (supply-chain disruptions) and **Rebate Hunter** (procurement rebates): the same burgundy source colour, the same generated palette value for value, the same type, components, colour grammar and agentic patterns. The logo, the names and the domain words differ, and so does the centrepiece: where the Navigator shows a map and Rebate Hunter a board, the Timetable Translator shows a **timetable mirror**, built from the same canvas, floating controls, legend card, popovers and colour grammar (§3). `REVIEW.md` lists the parity item by item, and `tests/parity.mjs` checks the shared shell against Rebate Hunter's file by file.

---

## 1. The brief

- **Burgundy at the centre.** White paper, burgundy for identity, mostly pastel colours (the sister apps' brief, adopted unchanged).
- **Legible in 60 seconds.** A partner who has never seen the tool should get the point from across a room, on a 1080p projector, often in a lit room: *this train leaves from another platform than every channel says, this many passengers rely on the wrong one, the first of them in fourteen minutes, and this is the cleanest way to put it right.*
- **Agentic.** An AI agent acts on screen. At every moment the viewer must be able to tell who is acting: the agent, or the person who has to decide.
- **A translator, not a second source.** The screen must show that the customer timetable is derived from the operational one: two timetables side by side, the translation between them drawn as lines, every published fact traceable to its source row.

## 2. Methods, and what each one decided

| Method | Source | What it decided |
|---|---|---|
| Perceptual colour in OKLCH | CSS Color 4; Evil Martians, *OKLCH in CSS* | One generator builds every colour from the brand burgundy. Equal OKLCH lightness means equal visual weight, so tints of different hues line up |
| Functional 12-step scales | Radix Colors, *Understanding the scale* | Each step has one job: 1–2 backgrounds, 3–5 component backgrounds, 6–8 borders, 9–10 solids, 11–12 text |
| Hue harmonisation | Material Color Utilities, `Blend.harmonize` | Supporting hues (the network's slate, blue, violet) turn towards burgundy by half the distance, at most 15° |
| Colour-blind-safe state hues | Okabe & Ito, *Color Universal Design*; Machado, Oliveira & Fernandes (2009) | The red, amber and green of the states are fixed hues, and the build fails if they come too close under simulated colour blindness |
| Design tokens | W3C Design Tokens Format Module 2025.10 | The palette ships as `design/tokens.json` (OKLCH, with hex fallbacks) next to the CSS custom properties |
| Accessibility | WCAG 2.2 | Contrast duties for every pairing, focus ring, target size, no meaning by colour alone |
| Agentic UX patterns | Yocco, *Designing For Agentic AI*, Smashing Magazine, Feb 2026 | The progress rail (intent preview), the handover to the human, the audit trail |
| AI labelling | IBM Carbon for AI; Pickering, *Tooltips & Toggletips* | An **AI** label on the options, drafts and summary the agent wrote, with a short explanation one click away |
| Emphasis | Google, *Expressive Design: Google's UX Research* (Material 3 Expressive) | One emphasised action per moment: colour, size and containment go to the step that needs the person |
| Projection | VUMC Edge for Scholars, *Optimizing Colors for Projected Presentations* | Pastels never carry meaning alone; every pastel fill has a deeper stroke or text step. Layouts are reviewed under a simulated washout |
| Dashboard patterns | Bach et al., *Dashboard Design Patterns* (2022) | Each KPI tile pairs one value (data information) with a line of context (meta information) |

## 3. Colour grammar

Each colour means one thing, everywhere.

| Colour | Means | Where you see it | Never used for |
|---|---|---|---|
| **Burgundy** | Identity, and **the human in charge** | Primary buttons; every Approve button; the progress step that waits for you (*Your decision*, *Your approval*); the recommended option's frame; the recommendation the agent hands to you and your decisions in the console and the audit; the focus ring; the logo; the selected view and channel on the mirror | The state of passenger information |
| **Red, amber, green** | **The state of passenger information**: contradicts the source (affected), informed but the data still behind or the risk accepted (at risk), re-publication from the source approved (resolved) | The mirror's published rows, lines, line labels, corridor rings and monitor rows; KPI tints; status chips; the comparison bars; *Confirmed* and *Not confirmed* in the console | Decoration, and buttons other than the two destructive ones |
| **Blue** | Checking | The column, station or line the agent is reading (a pulse), the tags of what a lookup confirmed (*Source read*, *Physical layer read*), the station a sensor was read at, *Check* steps in the console, links to sources, the *Verified against the source* chip | |
| **Violet** | **The AI's voice** | AI labels, *Hypothesis* and *Revised* lines, the translator between the two timetables (*derived*), what-if alerts and what-if contradictions on the mirror, the *First estimate* chip, the reasoning summaries, the streaming cursor, model calls in the audit, the AI disclosure icon | Anything a person decided |
| **Ink** | Everything else: the agent's work and the timetables at rest | Text, tool calls, separators, neutral controls, Reject, guardrail notes, the timetable rows, the network's lines | |
| **Hazard yellow and black** | **Simulation** | The SIMULATION badge, tape and watermark. Deliberately outside the palette, so a replay can never pass for a live run | |

On stage, in one sentence: *"Burgundy is you, violet is the AI, red, amber and green are what passengers are told."*

Every status colour comes with a second cue (WCAG 1.4.1): a word (*Contradicts the source*, *Re-publication approved*), a mark on every line label (warning triangle, clock, hand, check, spark for a what-if), a dashed line, or an underline on the wrong value. The danger red appears on two buttons only, **Abort** and **Forget key**, because they stop or delete something.

**The timetable mirror in this grammar.** The mirror has three views, and all speak the same colours.
- *Alignment* (the first view: the pitch is told on it). Three columns of white cards on the slate canvas, numbered like the steps of a story. **1 The source**: the operational timetable at one stop of the train (the train itself is the view's caption), with a 2 px ink border (the one truth), its values as large figures (*Platform 7*, *1st class F–G*), when and by whom it changed (the change's id only in the tooltip), and a card for the sensors of the physical layer, which shows the one reading that bears most on the train (*Interlocking: route out of platform 7 stored*, the others in its tooltip) once the agent has read it, tagged in blue while it reads. **2 The translator**: a violet card (the AI's voice) with a few words of what the AI is doing now (*3 options proposed*, *2 drafts ready*) and its one rule, *Keeps no timetable of its own*, and below it the **You decide** card, burgundy when a decision or an approval waits for the person, soft burgundy once decided, amber with the hand when the risk is accepted. **3 What passengers are told**: one card per channel with its value and its verdict (their common age, *as of 05:30*, stands once at the column's head; a channel of another age carries its own), the state carried as a 5 px bar on the card's left edge in the state token, a tint, a mark and a word: *Not checked yet* (ink), *Reading…* (blue), *Read, not compared yet* (ink: the AI has read the channel, the engine has not compared it; a verdict and its colour come only from the engine), *Contradicts the source* (red, warning mark), *Matches the source*, then after the decision *Re-publication approved* (green, check mark, the old value struck through and the source's value after it; approved, not published, as nothing is connected), *Data still wrong* (amber, clock), *Override approved: a second truth* (amber, hand), *Wrong: risk accepted* (amber, hand). Arrows between the columns run dashed blue while the AI reads and turn green or amber with the decision. Under the columns, the **impact line** gives the engine's figure in large type with when the first passenger acts (where, in its tooltip), and after the decision what is left in two clauses, who is still misinformed and whether the data is aligned; it stays red while passengers act on wrong information. The view sizes itself by its own height: on a projector or large screen the figures grow; on a laptop the sub-heads go; with the drawer open the channels sit two by two, then in one row with the verdict as a mark, so the finding is in view at every step of a run. A card is a button: a channel opens its own timetable, the source opens the timetables.
- *Timetables.* At the top, the **corridor strip**: the main line Köln – Düsseldorf – Duisburg – Essen – Bochum – Dortmund along the bottom, the line through Solingen, Wuppertal and Hagen along the top, each station with its Ril 100 code. The train's route today, from the source, is a solid ink line; where the published route differs (a diversion the channels have not taken up) it is dashed. Passenger stops are rings, operational stops (Betriebshalt, no passengers) squares, passes small dots, a stop only the published timetable still has a dashed ring. A filled marker with an arrow shows where the train is at 07:28. A station of a contradiction gets a ring in its state colour (dashed for a what-if), a station the physical layer was read at a small blue mark. Below, the **mirror card**: on the left the Betriebsfahrplan (every operating point, arrival over departure in tenths of a minute, the Ril 100 code, the track, what changed against the base timetable), on the right the Kundenfahrplan of one channel (passenger stops only, whole minutes, platforms, or coach sectors for the coach order), each column with the version of the source it was generated from; a channel generated from an older version has a dashed chip. Between them, the translator: a line from every published row to its source row, so the customer row sits level with the row it was derived from. A line that ends in × is published but no longer in the source; one that ends in + is a passenger stop of the source the channel does not list. When the engine finds a contradiction, the published row takes a bar and a tint in the state colour, the wrong value is underlined in the state's ink, the line turns the state colour and carries a label with the contradiction and the passengers who rely on it, and the source row it refers to gets a bar on its edge toward the line. After a decision the mirror follows it: what an approved option re-publishes turns green, what it only announces turns amber (the data is still behind), and an accepted risk stays visible in amber with a hand on its labels. Green means *re-publication approved*: nothing is published by the app.
- *All trains* (the sync monitor). Every train in the window, first departure first: its run in the corridor, its source version and the change that created it, the channels still behind the source (a dashed chip, a fact of the data, not yet a finding), and what the agent's check found (*N contradictions · P pax* in red, *In sync with the source* in green, a decision in its state colour). A version behind turns red only when the engine says it contradicts what passengers need.

**Why a mirror and not a map.** For a supply-chain disruption, place is the question; for a missed rebate, group membership. For passenger information the question is *correspondence*: does each fact passengers see correspond to a fact of the source? The mirror puts exactly that on screen, so the finding reads from across the room: *the source says platform 7, every channel says platform 5, 312 passengers rely on it.* The alignment view says it in one picture for a five-minute pitch (one stop, every channel, the AI and the person in between); the timetables view says it row against row for the expert; the strip keeps the geography that matters (which line the train really runs on) without making it the centrepiece.

## 4. How the palette is made

`tools/palette.mjs` generates every colour from one input, `SOURCE = "#7a1e3a"`, which is `oklch(0.394 0.127 7.1)`. It is the sister apps' generator with the same source; the token values are identical in all three apps (`tests/parity.mjs` checks it).

1. **Ladder.** Steps 1–8 share one lightness ladder across all families (L 0.993 → 0.772), so a tint of red and a tint of blue at the same step weigh the same. Steps 9–12 are set per family, so that solids and text meet their contrast duties.
2. **Tints.** Chroma grows with the step. Burgundy tints use 75 % of the usual chroma, so the pale steps read as rosewood, not candy pink.
3. **Ink.** The neutrals carry the burgundy hue at very low chroma (0.004–0.02), so every grey on the page belongs to the brand. Shadows are tinted with the darkest burgundy, never black.
4. **Harmonisation.** Where colour is atmosphere, hues turn towards burgundy by Material's rule (half the hue distance, at most 15°; applied to OKLCH hue): the slate and the blue move from 250° to 265°, violet from 295° to 310°.
5. **Fixed state hues.** Where colour is meaning, hues are fixed: danger 29°, warning 57°, success 170°. Red is deeper than amber and the green leans blue (the "bluish green" of Okabe and Ito), so the three differ in lightness and on the blue–yellow axis, which red–green colour blindness preserves. Red also stays clear of burgundy: at least 18° of hue and 0.12 of lightness apart.
6. **Gamut.** Colours outside sRGB are brought in by lowering chroma only; lightness and hue stay.

| Family | Hue | Role |
|---|---|---|
| `wine` | 7.1° (source) | Brand, actions, the human's decisions |
| `ink` | 7.1°, chroma ≤ 0.02 | Text, surfaces, borders, the timetables |
| `slate` | 265° (harmonised) | The network at rest: the strip's lines, the mirror's plain lines, passing points |
| `danger` | 29° (fixed) | Contradicts the source; destructive actions |
| `warning` | 57° (fixed) | Informed but data behind; risk accepted; not confirmed |
| `success` | 170° (fixed) | Re-publication approved; in sync; confirmed |
| `info` | 265° (harmonised) | Checking |
| `violet` | 310° (harmonised) | The AI's voice, the translator, a what-if |

**Outputs.** `css/tokens.css` holds the primitives (`--wine-1` … `--violet-12`) as hex, each with its OKLCH value in a comment. `design/tokens.json` holds the same primitives in the W3C Design Tokens Format 2025.10 plus the role aliases. Both files are generated: never edit them by hand.

**Roles.** `css/style.css` maps primitives to roles and contains no colour values of its own, apart from white and the simulation colours. Components use roles. The mirror (`css/mirror.css`) uses the same roles: `--affected`, `--at-risk`, `--resolved` and their `-fill` variants, `--network`, `--sea` for its canvas, and the danger, warning, success, info and violet families.

**Type.** Barlow for the interface, Barlow Semi Condensed for figures and headings, IBM Plex Mono for tool names, ids, Ril 100 codes and the timetable times; all self-hosted (`fonts/`, SIL Open Font License).

## 5. The checks

`node tools/palette.mjs --check` runs 45 checks and fails the build if any fails. It is the first suite in `node tests/run-all.mjs`.

**Contrast (WCAG 2.2), 32 pairings.** Body text 15.9:1 on paper (AAA, 1.4.6, needs 7). Muted and faint text 6.9:1 and 5.0:1 (1.4.3, needs 4.5). White on burgundy 10.1:1. Burgundy text 8.2:1. Input and toggle borders 4.0:1, and every state stroke and icon on paper: danger 5.7, warning 3.3, success 3.6, blue 4.4, violet 5.0, slate 5.5 (1.4.11, needs 3). Each family's text step is also checked on its own tint. The danger stroke on its mirror fill reaches 3.95:1.

**Brand vs danger, 2 checks.** Hue gap 21.9° (needs 18°), lightness gap 0.14 (needs 0.12).

**Colour-blind separation, 9 pairs.** Each pair is simulated for normal vision, protanopia, deuteranopia and tritanopia with the Machado et al. (2009) matrices at full severity, applied in linear RGB. The smallest OKLab distance must be at least 0.10, five times the 0.02 just-noticeable difference that CSS Color 4 uses for gamut mapping.

| Pair | Smallest ΔEOK | Worst case |
|---|---|---|
| Affected vs at risk | 0.120 | deuteranopia |
| Affected vs resolved | 0.111 | deuteranopia |
| At risk vs resolved | 0.104 | protanopia |
| Affected vs the network at rest (slate) | 0.156 | protanopia |
| At risk vs the network at rest | 0.188 | protanopia |
| Resolved vs the network at rest | 0.113 | deuteranopia |
| Checking (blue) vs at risk | 0.237 | protanopia |
| Checking (blue) vs affected | 0.228 | deuteranopia |
| Burgundy vs danger | 0.130 | protanopia |

**Token files, 2 checks.** `css/tokens.css` and `design/tokens.json` must match what the generator produces now.

The palette meets every check, but distance is not everything: under protanopia and deuteranopia the red of a contradiction and the green of an approved re-publication come out as two olive greys of different lightness. That is why every state also carries a mark (§3); `tests/design.mjs` writes the colour-blind captures to look at.

## 6. Agentic patterns

Yocco's six patterns for agentic AI, and where each one lives:

| Pattern | In the Timetable Translator |
|---|---|
| Intent preview | The **progress rail** shows the agent's five-step plan before the run starts (Spot, Check, Calculate, Propose, Prepare), and the intro window explains it |
| Autonomy dial | Fixed at one level on purpose: *plan and propose, you approve*. Every outbound action (passenger message, re-publication order, override request, staff briefing, hold request) is a draft that needs its own approval |
| Explainable rationale | The recommendation line, *Confirmed:* and *Revised: old → new* with their evidence, the reasoning summaries, the AI label's explanation, and **Guardrail** notes when the code refuses a step |
| Confidence signal | Alerts are *verified* (two distinct sources, and for every train the source record, the published view and a corroborating physical observation from the run, enforced in code) or labelled *what-if*; the mirror's caption chip says whether a result is a first estimate (amber when it left channels, stops or trains out, which the impact line names), verified against the source, or a what-if; *Not confirmed* lines in amber |
| Action audit and undo | The Audit tab and its JSON export. Undo is not needed: nothing leaves the outbox |
| Escalation pathway | The agent hands over at each decision (the rail turns burgundy), continues as a labelled what-if when it cannot confirm, and ends as **Stopped** rather than guess |

**Progress rail** (`js/progress.js`), **handover** (`js/handover.js`), **AI labels** (`js/ai_label.js`), **guardrail notes** (`js/console.js`) and **discarded responses** work exactly as in the sister apps. The AI label says who wrote the content (the live model by name, a recorded run, or the scripted replay), that every time, platform and passenger figure comes from the source and the deterministic sync engine and was checked against tool results, and what approval does. A draft whose facts could not be matched after two refusals carries an amber **Unchecked facts** chip.

**Evidence on the alert.** Below the sources the agent cites, a verified alert card lists what the run actually checked, from the tool results: *Checked in this run: operations log: OPS-05; published customer view: ICE 618; physical layer: PHY-01, PHY-02; source timetable: ICE 618*. The agent's words and the record of the checks stay apart.

**What the agent reads, live on the mirror.** A lookup pulses what it reads (the source column, a channel chip, a station), and its result leaves a tag; a sim_sync call makes the plain lines run blue while the engine compares. Both producers emit the same events, so a replay and a live run look alike.

## 7. Built for the room

- **Projection.** Muted colours blend on a projector (VUMC). Pastels therefore only ever fill; the meaning sits in a deeper stroke or text step at 3:1 or more. The options view is reviewed under a simulated washout (`contrast(0.62) brightness(1.18) saturate(0.8)`).
- **Emphasis.** One thing per moment: the recommended option has the burgundy frame and the only solid Approve; the other options have outline buttons; the rail highlights one step; on the mirror only the rows of a finding carry colour.
- **Size.** The root font scales to about 17 px at 1920 px wide; **Larger text** enlarges the console. Timetable rows are 44 px high on a tall mirror (40 px when it is short), station names about 16 px, platforms about 18 px in the figures face. Every control is at least 40 × 40 px (`tests/layout.mjs`, `tests/smoke.mjs`): rows, channel chips, monitor rows, the strip's stations, the legend's toggles.
- **Nothing covers the finding.** The alignment view sizes itself by its own height (tall, mid, short, tiny): with the drawer open its channels sit two by two, then in one row with the verdict as a mark and the values one under the other; a verdict that does not fit beside its value moves under it, and no source value, channel value or verdict is cut to an ellipsis; centred while it fits, it never pushes its top out of view. The legend docks beside the views (below them on a narrow mirror) and never covers a row, the strip or the caption. When the drawer opens, or the docked legend takes the room, the mirror gives way in order: the strip goes first, then the card's source note, check tags and column titles (the channel chips keep one row where they can), and on the shortest mirror the head, so the timetable rows stay. After the room changes, the first contradiction is scrolled back into view. A card narrower than 760 px drops the Ril 100 code column (the strip and the popovers keep it) and the station names keep their room. The line labels of a link with two contradictions stack one under the other, never on top of each other. `tests/layout.mjs` checks all of it, cut words included, in five viewports and seven states, including the finding during the run, the options, the legend opened by the presenter and the monitor, and the other five scenarios at 1280 × 720 and 1600 × 900.
- **Focus.** A 2 px burgundy ring outside a 2 px white gap: 10:1 against paper, meeting WCAG 2.4.13 Focus Appearance. Rows with a state bar keep the ring next to it. The mirror draws its rows afresh on each event, and a row that has the keyboard focus gets it back after the redraw; a popover finds its row again after one; a monitor row opened by keyboard moves the focus into the card; Escape closes a popover or the legend and gives the focus back to what opened it.
- **Motion.** One pulse on the active rail step, the streaming cursor, and on the mirror: a blue pulse on what the agent reads, plain lines that run blue while the engine compares, a short flash on a row whose state changes. All of it stops under `prefers-reduced-motion`, and the mirror then shows its final state at once (`tests/smoke.mjs`, case *motion*).
- **Words.** Labels name what a person understands: *Your decision*, *Approve*, *Accept the risk*, *Forget key*; on the alignment view *The source*, *The translator*, *What passengers are told*, *Contradicts the source*, *Re-publication approved*; on the timetables *Betriebsfahrplan* and *Kundenfahrplan* with their English roles (*source*, *as published*), *Betriebshalt: no passengers*, *Durchfahrt*. Each tool call in the console is one plain sentence (*Reads what every channel tells passengers about ICE 618*); the tool's own name, its arguments and its result sit behind a closed **Details**, an alert's sources and checks behind **Sources and checks**, the summary's text behind **Read it here** and the run's facts behind **Replay facts** (**Run facts** live), so the console reads as a story and the record stays one click away. The status pill uses the words of the five steps (*Spotting*, *Checking*, *Calculating*, *Proposing*, *Preparing*, and *Assessing* while the agent works out who is affected), never *Simulating*, the word a Simulation run's badge already uses; the console writes a phase line only when the agent hands over (*Phase: Awaiting your decision*, *Phase: Awaiting your approval*); a platform is *platform 7* in English text and *Gleis 7* only in German, on the cards, the sensors and in the console alike. Option cards carry a short title, *All channels aligned*, *Kept by hand* only where values are kept by hand, one big figure, *Still misinformed*, and one short line on who that is (*Some already head for the old platform*); what the option does and the staff effort are in the card's tooltip. The do-nothing card has two rows (*First affected*, *Next cycle*). A draft in the Outbox shows what it is, for whom and its subject line; its text opens with **Show draft**. KPI tiles say what and when in a few words: *Misinformed passengers 312, verified against the source*; *First affected in 14 min, ICE 618, Köln Hbf 07:42*; after a decision *left with option A (was 312)* and *info in 2 min, aligned in 8 min* (the tooltip has the full sentence).

## 8. Testing the design

| Command | What it does |
|---|---|
| `node tools/palette.mjs --check` | The 45 colour checks above (Node.js only) |
| `node tests/layout.mjs` | Five viewports from 1920×1080 to 1280×720: idle, at the finding, with options, with drafts, approved with the drawer hidden, with the legend opened and in all trains; no overflow; badges never overlap the KPI tiles; the header keeps its height; one-row control bar; on the alignment view no card leaves the view or covers another and every value stays in its card; in the timetables nothing leaves the panel and nothing covers anything else, the strip's labels stay apart, rows and lines stay in the card, station names keep their room, and the finding is in view; the other five scenarios at 1280×720 and their findings at 1600×900; targets ≥ 40 px in seven states |
| `node tests/design.mjs` | In the running app: the alignment view's channel bars, the mirror's rows, lines, labels, rings and monitor rows and the legend use the state tokens, before and after the decision, for an option that only informs and for a what-if; pill, console and rail name the human step; AI labels open and close. Writes review screenshots: the options normally and under the washout, and the finished run as seen with protanopia, deuteranopia and tritanopia |

The browser suites need Playwright (`tests/README.md`). The colour-blind screenshots use the same matrices as the palette check, applied by an SVG colour-matrix filter in linear RGB.

## 9. Changing things safely

**Keep the sister apps in step.** The palette, `css/` (except `css/mirror.css` and the marked app block at the end of `css/style.css`) and the shell modules listed in `REVIEW.md` (*Shared shell*) are meant to stay identical to the sister apps'. Change them in all repositories in the same way; `tests/parity.mjs` fails when they drift apart.

**Change the brand colour.** Edit `SOURCE` in `tools/palette.mjs` and run `node tools/palette.mjs`. Both token files are rewritten and the checks run. Then update `favicon.svg`, the only file that cannot read the tokens. The logo in the page is drawn from the tokens.

**Add a colour.** Add a family to `FAMILIES`, give it contrast duties in `PAIRS`, and add separation pairs to `SEPARATE` if it carries meaning next to other colours. Map it to a role in `css/style.css` and use the role, not the primitive.

**Keep the grammar.**
- Burgundy only for identity and what a person does or decides.
- Status colours only for the state of passenger information, and always with a word, a mark or a line style.
- Violet only for what the AI wrote, thinks or assumes. New AI-written content gets an AI label.
- No new hex values in components: use a role.
- New interactive elements are at least 40 × 40 px and use the shared focus ring; an element with its own shadow lists `var(--focus)` with it under `:focus-visible`.

## Sources

- CSS Color Module Level 4, gamut mapping (JND 0.02): https://drafts.csswg.org/css-color-4/
- Evil Martians, *OKLCH in CSS: why we moved from RGB and HSL*: https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl
- Radix Colors, *Understanding the scale*: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Material Color Utilities, `Blend.harmonize`: https://api.flutter.dev/flutter/package-material_color_utilities_blend_blend/Blend/harmonize.html
- Okabe & Ito, *Color Universal Design*: https://jfly.uni-koeln.de/color/
- Machado, Oliveira & Fernandes (2009), *A physiologically-based model for simulation of color vision deficiency*, IEEE TVCG 15(6): https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
- W3C Design Tokens Format Module 2025.10: https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Victor Yocco, *Designing For Agentic AI: Practical UX Patterns For Control, Consent, And Accountability*, Smashing Magazine, 11 Feb 2026: https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/
- IBM Carbon for AI, AI label usage: https://carbondesignsystem.com/components/ai-label/usage/
- Heydon Pickering, *Tooltips & Toggletips*, Inclusive Components: https://inclusive-components.design/tooltips-toggletips/
- Google Design, *Expressive Design: Google's UX Research*: https://design.google/library/expressive-material-design-google-research
- VUMC Edge for Scholars, *Optimizing Colors for Projected Presentations*: https://edgeforscholars.vumc.org/optimizing-colors-for-projected-presentations
- Bach et al., *Dashboard Design Patterns*, IEEE VIS 2022: https://arxiv.org/abs/2205.00757
