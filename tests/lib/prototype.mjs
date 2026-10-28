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
  ["Mirror card: the translator (derived) between the two timetables", "feature-text", "surface", "text"],
  ["Mirror card: the translator while it compares (fjord)", "info-text", "surface", "text"],
  // The two timetables (surface): rows, lines, line labels.
  ["Timetables at rest: stops, times and names in ink", "text", "surface", "text"],
  ["Timetables at rest: a passing point's mark", "neutral-solid", "surface", "mark"],
  ["Timetables: a row's state bar, contradicts the source, on its tint", "danger-solid", "danger-bg", "mark"],
  ["Timetables: a row's state bar, data still behind, on its tint", "warning-text", "warning-bg", "mark"],
  ["Timetables: a row's state bar, re-published, on its tint", "success-solid", "success-bg", "mark"],
  ["Timetables: a row's state bar, a what-if, on its tint", "feature-solid", "feature-bg", "mark"],
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
  ["All trains: a channel behind the source (dashed chip)", "border-strong", "surface", "mark"]
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
