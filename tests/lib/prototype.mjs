// What differs between the prototypes in the shared Vici tests (tests/hexagon.mjs and
// tests/page-icon.mjs). Those files are the same in the sister prototypes; this file is the one place
// that is not. Everything here is the Timetable Translator's.

/** The prototype's name, as on its page and on its card on Victor's website. */
export const NAME = "Timetable Translator";

/**
 * The hexagon test's tour of the app (tests/hexagon.mjs). The page has just been opened in a new tab,
 * so the guide opens by itself. visit(name, { settle }) checks the page as it is, settle ms (250) after
 * the step. The platform change is walked through its five steps with a decision and both drafts; the
 * scenario menu and the Start agent dialog are opened once.
 */
export async function hexagonTour(page, visit) {
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  await page.waitForSelector("#guide[open]", { timeout: 10000 });
  await visit("start screen with the guide");
  await page.keyboard.press("Escape");
  for (const [n, name] of [[1, "the lead"], [2, "every channel"], [3, "who is misled"], [4, "your decision"]]) {
    await page.keyboard.press(String(n));
    await visit(`step ${n}: ${name}`);
  }
  await page.click('.option[data-recommended="true"] [data-action="approve"]');
  await visit("step 4: decided");
  await page.keyboard.press("5");
  await page.waitForSelector('#move-actions #approve-drafts', { timeout: 15000 });
  await visit("step 5: the drafts");
  await page.click("#approve-drafts");
  await page.waitForSelector('.draft[data-status="approved"]', { timeout: 15000 });
  await visit("step 5: drafts approved");
  await page.click("#scenario-button");
  await visit("the scenario menu");
  await page.keyboard.press("Escape");
  await page.click("#start");
  await page.waitForSelector("#start-dialog[open]", { timeout: 5000 });
  await visit("Start agent: simulation or live");
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
