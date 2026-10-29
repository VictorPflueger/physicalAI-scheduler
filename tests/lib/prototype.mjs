// What differs between the four prototypes in the shared Vici tests (tests/tokens.mjs,
// tests/hexagon.mjs, tests/page-icon.mjs and tests/vici-files.mjs). Those four files are the same in
// Rebate Hunter, Navigator, Timetable Translator and Repack Pilot; this file is the one place that is
// not. Everything here is the Timetable Translator's.

/** The prototype's name, as on its page and on its card on Victor's website. */
export const NAME = "Timetable Translator";

/**
 * Colour pairs only this prototype draws (the shared shell's pairs are in tests/tokens.mjs):
 * [what, foreground token, background token, kind]. kind "text" needs 4.5:1, "mark" (a line, an icon,
 * a control's border, a bar) 3:1 (WCAG 2.2, 1.4.3 and 1.4.11). Tokens are Vici's, without "--vc-".
 */
export const COLOUR_PAIRS = [
  // The timetable mirror's canvas (bg-sunken): the alignment view's column heads, the links between
  // its columns and the cards' edges.
  ["Alignment: the column heads, on the canvas", "text", "bg-sunken", "text"],
  ["Alignment: the column sub-heads and the publication time, on the canvas", "text-subtle", "bg-sunken", "text"],
  ["Alignment: the source card's ink frame, on the canvas", "text", "bg-sunken", "mark"],
  ["Alignment: a link between the columns at rest, on the canvas", "border-strong", "bg-sunken", "mark"],
  ["Alignment: the link while the agent is reading the source (fjord), on the canvas", "info-solid", "bg-sunken", "mark"],
  ["Alignment: the link once the decision reached the channels, on the canvas", "text-muted", "bg-sunken", "mark"],
  ["Alignment: the link once re-publication is approved, on the canvas", "success-solid", "bg-sunken", "mark"],
  ["Alignment: the link when only passengers are informed (data still behind), on the canvas", "warning-text", "bg-sunken", "mark"],
  ["Alignment: the bar of a channel that contradicts the source, on the canvas", "danger-solid", "bg-sunken", "mark"],
  ["Alignment: the bar of a channel with data still behind, on the canvas", "warning-text", "bg-sunken", "mark"],
  ["Alignment: the bar of a channel re-published, on the canvas", "success-solid", "bg-sunken", "mark"],
  ["Alignment: the bar of a channel a what-if changes, on the canvas", "feature-solid", "bg-sunken", "mark"],
  ["Alignment: the bar of a channel being checked, on the canvas", "info-solid", "bg-sunken", "mark"],
  ["Alignment: the translator's card (derived values, lilac), on its tint", "feature-text", "feature-bg", "text"],
  ["Alignment: the translator's rule and notes, on its tint", "text-muted", "feature-bg", "text"],
  ["Alignment: the You decide card while a decision waits (solid merlot) and its frame once decided, on the canvas", "accent", "bg-sunken", "mark"],
  ["Alignment: a channel's name and value in ink, on the tint of a contradiction", "text", "danger-bg", "text"],
  ["Alignment: a channel's name and value in ink, on the tint of data still behind", "text", "warning-bg", "text"],
  ["Alignment: a channel's name and value in ink, on the tint of a re-publication", "text", "success-bg", "text"],
  ["Alignment: a channel's name and value in ink, on the tint of a what-if", "text", "feature-bg", "text"],
  ["Alignment: a channel's icon and struck old value, on the tint of a contradiction", "text-muted", "danger-bg", "text"],
  ["Alignment: a channel's icon and struck old value, on the tint of data still behind", "text-muted", "warning-bg", "text"],
  ["Alignment: a channel's icon and struck old value, on the tint of a re-publication", "text-subtle", "success-bg", "text"],
  // The corridor strip and the mirror card's head (surface).
  ["Corridor: a station's ring that contradicts the source", "danger-solid", "surface", "mark"],
  ["Corridor: a station's ring with data still behind (at risk)", "warning-text", "surface", "mark"],
  ["Corridor: a station's ring re-published (resolved)", "success-solid", "surface", "mark"],
  ["Corridor: a station's ring a what-if changes", "feature-solid", "surface", "mark"],
  ["Corridor: the pulse of a station the agent is reading", "info-solid", "surface", "mark"],
  ["Corridor: a sensor mark at a station", "info-solid", "surface", "mark"],
  ["Corridor: the route today (the source), in ink", "text", "surface", "mark"],
  ["Corridor: the route as published and the network at rest", "neutral-solid", "surface", "mark"],
  ["Corridor: the train's position marker", "text", "surface", "mark"],
  ["Corridor: station codes and names", "text-muted", "surface", "text"],
  ["Corridor: the border on the cross-border line (a dashed upright)", "neutral-solid", "surface", "mark"],
  ["Corridor: the two countries' codes at the border", "text-muted", "surface", "text"],
  ["Mirror card: the translator (derived) between the two timetables", "feature-text", "surface", "text"],
  ["Mirror card: the translator while it compares (fjord)", "info-text", "surface", "text"],
  // The two timetables (surface): rows, lines, line labels.
  ["Timetables at rest: stops, times and names in ink", "text", "surface", "text"],
  ["Timetables at rest: a passing point's mark", "neutral-solid", "surface", "mark"],
  ["Timetables: a row's state bar, contradicts the source, on its tint", "danger-solid", "danger-bg", "mark"],
  ["Timetables: a row's state bar, data still behind, on its tint", "warning-text", "warning-bg", "mark"],
  ["Timetables: a row's state bar, re-published, on its tint", "success-solid", "success-bg", "mark"],
  ["Timetables: a row's state bar, a what-if, on its tint", "feature-solid", "feature-bg", "mark"],
  ["Timetables: a flagged row's times and names in ink, on the tint of a contradiction", "text", "danger-bg", "text"],
  ["Timetables: a flagged row's times and names in ink, on the tint of data still behind", "text", "warning-bg", "text"],
  ["Timetables: a flagged row's times and names in ink, on the tint of a re-publication", "text", "success-bg", "text"],
  ["Timetables: a flagged row's times and names in ink, on the tint of a what-if", "text", "feature-bg", "text"],
  ["Timetables: a flagged row's arrival times and codes, on the tint of a contradiction", "text-muted", "danger-bg", "text"],
  ["Timetables: a flagged row's arrival times and codes, on the tint of data still behind", "text-muted", "warning-bg", "text"],
  ["Timetables: a flagged row's arrival times and codes, on the tint of a re-publication", "text-muted", "success-bg", "text"],
  ["Timetables: a flagged row's arrival times and codes, on the tint of a what-if", "text-muted", "feature-bg", "text"],
  ["Timetables: a line from a published row to its source row, at rest", "neutral-solid", "surface", "mark"],
  ["Timetables: a line that contradicts the source", "danger-solid", "surface", "mark"],
  ["Timetables: a line with data still behind", "warning-text", "surface", "mark"],
  ["Timetables: a line re-published", "success-solid", "surface", "mark"],
  ["Timetables: a line a what-if changes", "feature-solid", "surface", "mark"],
  ["Timetables: a line's label (contradicts the source)", "danger-text", "surface", "text"],
  ["Timetables: a line's label (data still behind)", "warning-text", "surface", "text"],
  ["Timetables: a line's label (re-published)", "success-text", "surface", "text"],
  ["Timetables: a line's label (a what-if)", "feature-text", "surface", "text"],
  ["Channel chips: the count of rows that contradict the source", "danger-on-solid", "danger-solid", "text"],
  ["Channel chips: the count of rows with data still behind", "warning-bg", "warning-text", "text"],
  ["Channel chips: the count of rows re-published", "success-on-solid", "success-solid", "text"],
  ["Channel chips: the count of rows a what-if changes", "feature-on-solid", "feature-solid", "text"],
  ["The channel shown and the train in focus: their ink frame", "text", "surface", "mark"],
  // All trains (the monitor, surface).
  ["All trains: a train's state stripe (contradicts the source)", "danger-solid", "surface", "mark"],
  ["All trains: a train's state stripe (data still behind)", "warning-text", "surface", "mark"],
  ["All trains: a train's state stripe (re-published)", "success-solid", "surface", "mark"],
  ["All trains: the stripe of a train being checked", "info-solid", "surface", "mark"],
  ["Timetables: the dashed edge of a channel chip behind the source", "border-strong", "surface", "mark"]
];

/**
 * Colours that must stay apart, beyond the shared ones in tests/tokens.mjs: [what, token, token].
 * The test reports how far apart they stay under colour-vision deficiency; it does not fail on them.
 */
export const SEPARATIONS = [
  ["A what-if (lilac) vs contradicts the source (danger)", "feature-solid", "danger-solid"],
  ["A what-if (lilac) vs being checked (fjord)", "feature-solid", "info-solid"],
  ["A what-if (lilac) vs the network at rest (neutral)", "feature-solid", "neutral-solid"],
  ["The route today (ink) vs the route as published (neutral)", "text", "neutral-solid"]
];

/**
 * The hexagon test's tour of the app (tests/hexagon.mjs): the main states of a simulation run, and
 * the dialogs and mirror views on the way. The page has just been opened, without SKIP_INTRO, so the
 * intro opens by itself. visit(name, { settle }) checks the page as it is, settle ms (250) after the step.
 */
export async function hexagonTour(page, visit) {
  const approve = '.option-card[data-recommended="true"] [data-action="approve"]';
  const view = (name) => page.click(`#mirror .mirror-tools button:has-text("${name}")`);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  await page.waitForSelector(".intro-modal", { timeout: 10000 });
  await visit("start screen with the intro");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".intro-modal", { state: "detached", timeout: 5000 });
  await visit("idle alignment view");
  // The legend opened (it opens from the view buttons and docks beside the views), then closed again.
  const legendBtn = '#mirror .mirror-tools button[aria-controls="mirror-legend"]';
  if ((await page.getAttribute(legendBtn, "aria-expanded")) !== "true") {
    await page.click(legendBtn);
    await page.waitForSelector("#mirror-legend:not([hidden])", { timeout: 5000 });
    await visit("idle alignment view, legend open");
    await page.click(legendBtn);
  }
  // The timetables with the corridor strip, and every train in the window.
  await view("Timetables");
  await page.waitForSelector('#mirror .mirror-view[data-view="train"]:not([hidden]) .mrow', { timeout: 5000 });
  await visit("timetables");
  await view("All trains");
  await page.waitForSelector('#mirror .mirror-view[data-view="monitor"]:not([hidden]) .mon-row', { timeout: 5000 });
  await visit("all trains");
  // A station's details on the corridor strip.
  await view("Timetables");
  await page.waitForSelector('#mirror .mirror-view[data-view="train"]:not([hidden]) .strip-hit', { timeout: 5000 });
  await page.click("#mirror .strip-hit");
  await page.waitForSelector("#mirror .mirror-pop:not([hidden])", { timeout: 5000 });
  await visit("a station's details on the corridor strip");
  await page.keyboard.press("Escape");
  await page.click("#btn-diagnostics");
  await page.waitForSelector(".diag-table", { timeout: 5000 });
  await visit("diagnostics");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".diag-table", { state: "detached", timeout: 5000 });
  // The mode dialog, the key dialog behind the live card, then a simulation at ×1 with the timetables
  // chosen before the start, until a station on the corridor strip pulses while the agent reads it
  // (a reading stays open 0.7 s); then ×4.
  await page.click('button[aria-label="Replay speed ×1"]');
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  await visit("mode dialog");
  await page.click('.mode-card[data-mode="live"] .mode-cta button');
  await page.waitForSelector("#api-key-input", { timeout: 5000 });
  await visit("key dialog");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#api-key-input", { state: "detached", timeout: 5000 });
  if (!(await page.$(".mode-card"))) await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
  await page.waitForSelector('#mirror .strip .node[data-checking="true"]', { state: "attached", timeout: 90000 });
  await visit("a station being read", { settle: 50 });
  await page.click('button[aria-label="Replay speed ×4"]');
  await page.waitForSelector(approve, { state: "visible", timeout: 180000 });
  await page.waitForTimeout(800);
  await visit("decision");
  await page.click(approve);
  await page.waitForSelector('button:has-text("Approve all")', { state: "visible", timeout: 120000 });
  await page.waitForTimeout(800);
  await visit("drafts");
  await page.click('button:has-text("Approve all")');
  await page.waitForFunction(() => /Done/.test(document.querySelector(".status-pill .text")?.textContent || ""), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await visit("finished");
  await page.click("#tab-audit");
  await visit("finished, audit");
  // The drawer hidden: the whole mirror, the decision on it.
  await page.click(".drawer-toggle");
  await page.waitForTimeout(1500);
  await visit("finished, drawer hidden");
  await page.click('button:has-text("Open management summary")');
  await page.waitForSelector(".report-modal", { timeout: 5000 });
  await visit("management summary");
  await page.keyboard.press("Escape");
}

/**
 * The page icon (tests/page-icon.mjs): the icon and kind of this prototype's card on Victor's website
 * (VictorPflueger/VIP, data/prototypes.js), the colour of that kind's cell (Vici's lilac for a
 * prototype), and favicon.svg exactly: the card's cell drawn for small sizes.
 */
export const PAGE_ICON = {
  icon: "clock",
  kind: "prototype",
  tone: "lilac",
  favicon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 103.92">
  <!-- Timetable Translator's page icon: Vici's clock icon in a lilac hexagon cell, the same as its card
       on Victor Pflüger's website (icon and kind: VictorPflueger/VIP, data/prototypes.js). Vici's
       lilac 100 (#f2e9fd) and lilac 900 (#372544); the icon is drawn larger and bolder
       than on the card so that it still reads at 16 px. -->
  <polygon points="120,51.96 90,103.92 30,103.92 0,51.96 30,0 90,0" fill="#f2e9fd"/>
  <g transform="translate(18 9.96) scale(3.5)" fill="none" stroke="#372544" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.4 13 L16.2 20.27 L7.8 20.27 L3.6 13 L7.8 5.73 L16.2 5.73 Z"/>
    <path d="M12 8.4 V13 L15.2 15"/>
    <path d="M9.6 2.6 H14.4 M12 2.6 V4.6"/>
  </g>
</svg>
`
};
