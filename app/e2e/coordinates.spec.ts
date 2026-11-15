/**
 * Show coordinates on `small`: the flag, the wedge and the cross-section
 * line follow the pointer along a line and stay over its maps; a click
 * pins the reading in the Timestamp tab, its marks staying, and a click
 * elsewhere clears it; a named timestamp lets the pointer through while
 * Show coordinates is on and is selected by its parts while it is off.
 *
 * The block `map0000000` holds the fixture `map`, its place origin at
 * canvas (0, 320); its node lies where the arranger puts it for the
 * fixture's drawing (`nodePosition`). In its drawing (layout's record)
 * `melody` (8 quarters, fraction) runs at
 * y 40.5 from 63.53662109375 to 463.53662109375, 50 canvas units a
 * quarter, its map `tempo` (×1/2 to seconds) at y 35 over the same span;
 * its child `phrase` (4 quarters) at y 23 from 163.53662109375, with
 * `ticks` (×480 to ticks) at y 17.5. At zoom 1 and one device pixel per
 * CSS pixel a quarter covers 50 device pixels, so half a device pixel is
 * 0.01 quarters, and the default granularity (denominator 2520, 3
 * decimals) picks the simplest fraction within it.
 *
 * - `xStart + 123.75` on `melody`: 2.475 quarters; divisors 1 to 14 miss,
 *   15 gives 37/15, shown `2 7/15 ♩`; `tempo` 37/30 s, shown to 3 places
 *   `1.233 s`. Units are written with the drawing specification's
 *   symbols (`♩`, `s`, `ticks`).
 * - `xStart + 200`: 4 quarters, `tempo` 2.0 s.
 * - The same abscissa on `tempo`'s drawing (y 35): still `melody` at 4,
 *   `tempo`'s row highlighted.
 * - 30 below the line nothing lies within 8 pixels: no flag, no marks.
 * - `phrase` at 263.53662109375: 2 quarters, `ticks` 960, no `tempo` row.
 * - A named timestamp `timestamp_1` added at 4 on `melody` draws its
 *   wedge, label and cross-section line at `xStart + 200`.
 * - The Timestamp tab edits the pin: `4` typed as `melody`'s coordinate
 *   moves the pin there (`tempo` `2.0`), nothing journalled; the name
 *   `Four` then adds `{name: "Four", coordinate: [4, 1]}` into `melody`,
 *   and the named timestamp is drawn as an element, no longer as marks.
 * - The settings line: denominator 4 makes 2.475 quarters `2 1/2 ♩`
 *   (divisors 1, 2 and 4 miss by 0.475, 0.025, 0.025; the nearest
 *   multiple of 1/4 is 5/2), outside the journal.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf, nodePosition } from "../packages/arranger/src/drawing.ts";
import { idAddress, isLoadError, partAddress, readWorkspace } from "../packages/core/src/index.ts";
import { FONT_METRICS } from "./schema.ts";
import {
  arranger,
  clickPart,
  dispatch,
  emptyPoint,
  fixtureText,
  journalLength,
  newestCommand,
  OPENED_JOURNAL,
  open,
  panel,
  part,
  SMALL,
  selection,
  setViewport,
  storeText,
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
/** The marks of the hovered (`hover`) or the pinned (`pin`) position. */
const marks = (page: Page, kind: "hover" | "pin") =>
  page.locator(`.tilie-coordinate-marks[data-mark="${kind}"]`);
const wedge = (page: Page, kind: "hover" | "pin") =>
  marks(page, kind).getByTestId("coordinate-wedge");
const crossSectionLine = (page: Page, kind: "hover" | "pin") =>
  marks(page, kind).getByTestId("coordinate-line");
/** The named timestamp `timestamp_1` of block `map`. */
const TIMESTAMP = { block: SMALL.map, id: "timestamp_1" };
const timestampTab = (page: Page) =>
  tabs(page).getByRole("tab", { name: "Timestamp", exact: true });

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

test.beforeEach(async ({ page }) => {
  await open(page, "small");
  await setViewport(page, VIEW);
  await page.getByRole("button", { name: "Show coordinates" }).click();
  await expect(page.getByTestId("coordinates")).toHaveAttribute("aria-pressed", "true");
});

test("the flag and the marks follow the pointer along a line and stay over its maps", async ({
  page,
}) => {
  await hover(page, MELODY.start + 123.75, MELODY.y);
  await expect(coordinate(page)).toHaveText("2 7/15♩");
  await expect(row(page, "tempo")).toHaveText("Tempo1.233s");
  await expect(footer(page)).toHaveText("click to pin");
  await expect(wedge(page, "hover")).toHaveCount(1);
  await expect(crossSectionLine(page, "hover")).toHaveCount(1);

  await hover(page, MELODY.start + 200, MELODY.y);
  await expect(coordinate(page)).toHaveText("4♩");
  await expect(row(page, "tempo")).toHaveText("Tempo2.0s");
  await expect(row(page, "tempo")).toHaveAttribute("data-hovered", "false");

  await hover(page, MELODY.start + 200, TEMPO_Y);
  await expect(coordinate(page)).toHaveText("4♩");
  await expect(row(page, "tempo")).toHaveAttribute("data-hovered", "true");

  await hover(page, MELODY.start + 200, MELODY.y + 30);
  await expect(flag(page)).toHaveCount(0);
  await expect(marks(page, "hover")).toHaveCount(0);
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
  await expect(marks(page, "hover")).toHaveCount(0);
  await page.keyboard.press("c");
  await hover(page, MELODY.start + 201, MELODY.y);
  await expect(flag(page)).toHaveCount(1);
});

test("a click pins and selects Timestamp; a click elsewhere clears it and restores the tab", async ({
  page,
}) => {
  const point = await onMap(page, MELODY.start + 123.75, MELODY.y);
  await page.mouse.move(point.x, point.y);
  await expect(coordinate(page)).toHaveText("2 7/15♩");
  await page.mouse.click(point.x, point.y);
  await expect(timestampTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("timestamp-where")).toHaveCount(1);
  expect(await journalLength(page)).toBe(OPENED_JOURNAL.small);
  await hover(page, MELODY.start + 200, MELODY.y + 30);
  await expect(wedge(page, "pin")).toHaveCount(1);
  await expect(crossSectionLine(page, "pin")).toHaveCount(1);

  const empty = await emptyPoint(page, 560, 120);
  await page.mouse.click(empty.x, empty.y);
  await expect(page.getByTestId("timestamp-where")).toHaveCount(0);
  await expect(marks(page, "pin")).toHaveCount(0);
  await expect(timestampTab(page)).toHaveAttribute("aria-selected", "false");
  await expect(tabs(page).getByRole("tab", { name: "Properties", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("the Timestamp tab moves the pin, then names it into the manifest", async ({ page }) => {
  const point = await onMap(page, MELODY.start + 123.75, MELODY.y);
  await page.mouse.move(point.x, point.y);
  await expect(coordinate(page)).toHaveText("2 7/15♩");
  await page.mouse.click(point.x, point.y);
  const shown = await panel(page, "Timestamp");
  const own = shown.getByLabel("coordinate of Melody", { exact: true });
  await expect(own).toHaveValue("2 7/15");
  await expect(shown.getByLabel("Show cross-section line")).toBeDisabled();
  await own.fill("4");
  await own.press("Enter");
  await expect(own).toHaveValue("4");
  await expect(shown.getByLabel("Tempo of Melody", { exact: true })).toHaveValue("2.0");
  await expect(wedge(page, "pin")).toHaveCount(1);
  expect(await journalLength(page)).toBe(OPENED_JOURNAL.small);

  const name = shown.getByLabel("Name", { exact: true });
  await name.fill("Four");
  await name.press("Enter");
  expect(await newestCommand(page)).toEqual({
    type: "add",
    into: { block: SMALL.map, id: "melody" },
    timestamp: { name: "Four", coordinate: [4, 1] },
  });
  await expect(shown.getByRole("button", { name: "Delete", exact: true })).toHaveCount(1);
  await expect(shown.getByLabel("Show cross-section line")).toBeChecked();
  await expect(shown.getByLabel("Show cross-section line")).toBeEnabled();
  await expect(marks(page, "pin")).toHaveCount(0);
  await expect(part(page, SMALL.map, { id: TIMESTAMP.id })).toHaveCount(1);
});

test("the settings line sets the granularity outside the journal", async ({ page }) => {
  await timestampTab(page).click();
  const shown = await panel(page, "Timestamp");
  const denominator = shown.getByLabel("Denominator", { exact: true });
  await expect(denominator).toHaveValue("2520");
  await expect(shown.getByLabel("Decimals", { exact: true })).toHaveValue("3");
  await denominator.fill("4");
  const granularity = async () => JSON.parse(await storeText(page, "view")).settings.granularity;
  expect(await granularity()).toEqual({ denominator: 4, decimals: 3 });
  expect(await journalLength(page)).toBe(OPENED_JOURNAL.small);
  await hover(page, MELODY.start + 123.75, MELODY.y);
  await expect(coordinate(page)).toHaveText("2 1/2♩");
  await denominator.fill("0");
  await expect(denominator).toHaveAttribute("aria-invalid", "true");
  expect(await granularity()).toEqual({ denominator: 4, decimals: 3 });
});

test("a named timestamp passes the pointer on while coordinates show, else is selected by its parts", async ({
  page,
}) => {
  const added = await dispatch(page, {
    type: "add",
    into: { block: SMALL.map, id: "melody" },
    timestamp: { name: "Four", coordinate: [4, 1] },
  });
  expect(added).toBeNull();

  await clickPart(page, SMALL.map, { id: TIMESTAMP.id });
  expect(await selection(page)).not.toContainEqual(TIMESTAMP);

  await page.getByRole("button", { name: "Show coordinates" }).click();
  await expect(page.getByTestId("coordinates")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("timestamp-where")).toHaveCount(0);
  const own = idAddress(TIMESTAMP.id);
  for (const address of [own, partAddress(own, "label"), partAddress(own, "line")]) {
    await clickPart(page, SMALL.map, address);
    expect(await selection(page)).toEqual([TIMESTAMP]);
  }
  await expect(timestampTab(page)).toHaveAttribute("aria-selected", "true");
  const shown = await panel(page, "Timestamp");
  await expect(shown.getByLabel("Name", { exact: true })).toHaveValue("Four");
  await expect(shown.getByLabel("coordinate of Melody", { exact: true })).toHaveValue("4");
  await expect(shown.getByRole("button", { name: "Delete", exact: true })).toHaveCount(1);
  await hover(page, MELODY.start + 200, MELODY.y);
  await expect(flag(page)).toHaveCount(0);
  await expect(marks(page, "hover")).toHaveCount(0);
});
