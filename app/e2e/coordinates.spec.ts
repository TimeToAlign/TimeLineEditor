/**
 * Show coordinates on `small`: the flag follows the pointer along a line
 * and stays over its maps; a click pins the reading in the Timestamp tab
 * and a click elsewhere clears it; a granularity edit changes the grid,
 * is saved with the workspace and journals nothing.
 *
 * The block `map0000000` holds the fixture `map`, its place origin at
 * canvas (0, 320); its node lies where the arranger puts it for the
 * fixture's drawing (`nodePosition`). In its drawing (layout's record)
 * `melody` (8 quarters, fraction) runs at
 * y 40.5 from 63.53662109375 to 463.53662109375, 50 canvas units a
 * quarter, its map `tempo` (×1/2 to seconds) at y 35 over the same span;
 * its child `phrase` (4 quarters) at y 23 from 163.53662109375, with
 * `ticks` (×480 to ticks) at y 17.5. At zoom 1 and one device pixel per
 * CSS pixel a quarter covers 50 device pixels, so the default fraction
 * grid (denominator 1, refining) steps by 1/32.
 *
 * - `xStart + 123.75` on `melody`: 2.475 quarters → 79/32, shown `2
 *   15/32 ♩`; `tempo` 79/64 = 1.234375 s, shown to 3 places `1.234 s`.
 *   Units are written with the drawing specification's symbols (`♩`,
 *   `s`, `ticks`).
 * - `xStart + 200`: 4 quarters, `tempo` 2.0 s.
 * - The same abscissa on `tempo`'s drawing (y 35): still `melody` at 4,
 *   `tempo`'s row highlighted.
 * - 30 below the line nothing lies within 8 pixels: no flag.
 * - `phrase` at 263.53662109375: 2 quarters, `ticks` 960, no `tempo` row.
 * - Fractions step 1/5, not refining: `xStart + 123.75` is 12.375 steps →
 *   12/5, shown `2 2/5`.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf, nodePosition } from "../packages/arranger/src/drawing.ts";
import { isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import { FONT_METRICS } from "./schema.ts";
import {
  arranger,
  emptyPoint,
  fixtureText,
  journalLength,
  OPENED_JOURNAL,
  open,
  SMALL,
  setViewport,
  tabs,
  toScreen,
} from "./support.ts";

const VIEW = { x: 40, y: 40, zoom: 1 };
/** The node of block `map` on the canvas, as the arranger places it for the fixture's drawing. */
const NODE = (() => {
  const workspace = readWorkspace(fixtureText("small"));
  if (isLoadError(workspace)) throw new Error("small.tle.json is refused");
  const block = workspace.view.blocks[SMALL.map];
  if (block === undefined) throw new Error(`block ${SMALL.map} is missing`);
  return nodePosition(block, drawingOf(block, workspace.view.graphical, FONT_METRICS));
})();
const MELODY = { y: 40.5, start: 63.53662109375 };
const TEMPO_Y = 35;
const PHRASE_Y = 23;

/** The screen point of block `map`'s drawing point `(x, y)`. */
function onMap(page: Page, x: number, y: number) {
  return toScreen(page, NODE.x + x, NODE.y + y);
}

async function hover(page: Page, x: number, y: number): Promise<void> {
  const point = await onMap(page, x, y);
  await page.mouse.move(point.x, point.y);
}

const flag = (page: Page) => page.getByTestId("coordinate-flag");
const coordinate = (page: Page) => flag(page).getByTestId("coordinate").first();
const row = (page: Page, map: string) => flag(page).locator(`[data-map="${map}"]`);
const footer = (page: Page) => flag(page).getByTestId("coordinate-footer");
const timestampTab = (page: Page) =>
  tabs(page).getByRole("tab", { name: "Timestamp", exact: true });

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

test.beforeEach(async ({ page }) => {
  await open(page, "small");
  await setViewport(page, VIEW);
  await page.getByRole("button", { name: "Show coordinates" }).click();
  await expect(page.getByTestId("coordinates")).toHaveAttribute("aria-pressed", "true");
});

test("the flag follows the pointer along a line and stays over its maps", async ({ page }) => {
  await hover(page, MELODY.start + 123.75, MELODY.y);
  await expect(coordinate(page)).toHaveText("2 15/32♩");
  await expect(row(page, "tempo")).toHaveText("Tempo1.234s");
  await expect(footer(page)).toHaveText("grid 1/32 ♩ (fraction base 1, refining) · click to pin");

  await hover(page, MELODY.start + 200, MELODY.y);
  await expect(coordinate(page)).toHaveText("4♩");
  await expect(row(page, "tempo")).toHaveText("Tempo2.0s");
  await expect(row(page, "tempo")).toHaveAttribute("data-hovered", "false");

  await hover(page, MELODY.start + 200, TEMPO_Y);
  await expect(coordinate(page)).toHaveText("4♩");
  await expect(row(page, "tempo")).toHaveAttribute("data-hovered", "true");

  await hover(page, MELODY.start + 200, MELODY.y + 30);
  await expect(flag(page)).toHaveCount(0);
});

test("a child's flag holds its own maps only", async ({ page }) => {
  await hover(page, 263.53662109375, PHRASE_Y);
  await expect(coordinate(page)).toHaveText("2♩");
  await expect(row(page, "ticks")).toHaveText("Ticks960ticks");
  await expect(row(page, "tempo")).toHaveCount(0);
});

test("C toggles the flag", async ({ page }) => {
  await arranger(page).focus();
  await page.keyboard.press("c");
  await expect(page.getByTestId("coordinates")).toHaveAttribute("aria-pressed", "false");
  await hover(page, MELODY.start + 200, MELODY.y);
  await expect(flag(page)).toHaveCount(0);
  await page.keyboard.press("c");
  await hover(page, MELODY.start + 201, MELODY.y);
  await expect(flag(page)).toHaveCount(1);
});

test("a click pins and selects Timestamp; a click elsewhere clears it and restores the tab", async ({
  page,
}) => {
  const point = await onMap(page, MELODY.start + 123.75, MELODY.y);
  await page.mouse.move(point.x, point.y);
  await expect(coordinate(page)).toHaveText("2 15/32♩");
  await page.mouse.click(point.x, point.y);
  await expect(timestampTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("timestamp-where")).toHaveCount(1);
  expect(await journalLength(page)).toBe(OPENED_JOURNAL.small);

  const empty = await emptyPoint(page, 560, 120);
  await page.mouse.click(empty.x, empty.y);
  await expect(page.getByTestId("timestamp-where")).toHaveCount(0);
  await expect(timestampTab(page)).toHaveAttribute("aria-selected", "false");
  await expect(tabs(page).getByRole("tab", { name: "Properties", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("a granularity edit changes the grid, survives save and reopen, and journals nothing", async ({
  page,
}) => {
  const point = await onMap(page, MELODY.start + 123.75, MELODY.y);
  await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y);
  await expect(timestampTab(page)).toHaveAttribute("aria-selected", "true");

  const fractions = page.getByRole("group", { name: "Fractions" });
  await fractions.getByRole("textbox").fill("5");
  await fractions.getByRole("textbox").press("Tab");
  await fractions.getByRole("checkbox", { name: "Refine when zooming" }).uncheck();
  const expected = { denominator: 5, refine: false };
  await expect
    .poll(() => page.evaluate(() => window.__tilie.store().view.settings.granularity.fraction))
    .toEqual(expected);
  expect(await journalLength(page)).toBe(OPENED_JOURNAL.small);
  await expect(page.getByTestId("timestamp-where")).toHaveCount(0);
  await expect(timestampTab(page)).toHaveAttribute("aria-selected", "true");

  await page.mouse.move(point.x, point.y + 1);
  await page.mouse.move(point.x, point.y);
  await expect(coordinate(page)).toHaveText("2 2/5♩");
  await expect(footer(page)).toHaveText("grid 1/5 ♩ (fraction base 1/5, fixed) · click to pin");

  const text = await page.evaluate(() => window.__tilie.text());
  await page.evaluate((saved) => window.__tilie.load(saved), text);
  await expect
    .poll(() => page.evaluate(() => window.__tilie.store().view.settings.granularity.fraction))
    .toEqual(expected);
  expect(await journalLength(page)).toBe(OPENED_JOURNAL.small);
  await setViewport(page, VIEW);
  await page.mouse.move(point.x, point.y + 1);
  await page.mouse.move(point.x, point.y);
  await expect(footer(page)).toHaveText("grid 1/5 ♩ (fraction base 1/5, fixed) · click to pin");
});
