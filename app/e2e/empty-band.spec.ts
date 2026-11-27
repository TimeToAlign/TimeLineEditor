/**
 * A band shown explicitly that draws nothing, an empty band, in a browser:
 * on a fixture of Beethoven's Op. 106's shape (a root holding no region
 * whose child holds one), the root's empty Regions band drawn under its
 * line, marked on hover, opening the root's timeline editor on a
 * double-click, where Add region adds a region into it; and the root's own
 * Regions box showing it with one press. The expected values are derived
 * in `README.md` ("empty-band.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf } from "../packages/arranger/src/drawing.ts";
import { addressKey, bandAddress, isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import { FONT_METRICS } from "./schema.ts";
import {
  bandMarks,
  bandOf,
  bandPoint,
  bandsOf,
  dispatch,
  editing,
  element,
  importFixture,
  journalLength,
  keysOf,
  newestCommand,
  panel,
  paneOf,
  select,
  settledDrawing,
  setViewport,
  tab,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const VIEW = { x: 40, y: 40, zoom: 1 };
/** The root's regions band. */
const REGIONS = bandAddress("score", "regions");
/** The band's own rule, which its Visible box writes. */
const OWN = { element: "band", addresses: [{ id: "score", facet: "regions" }] };
/** `Wb = 6 + 2 + h(9)`. */
const Wb = 18.4765625;

/** The facets of the bands the hook records for `score`. */
async function facets(page: Page, block: string): Promise<string[]> {
  return (await bandsOf(page, block, "score")).map((band) => band.facet);
}

/**
 * The root's regions band in the drawing the canvas shows, in the drawing's
 * own units (the hook's client rectangles carry the screen's scale): level,
 * elements, start below the line and height.
 */
async function regionsBand(page: Page, block: string) {
  const workspace = readWorkspace(await page.evaluate(() => window.__tilie.text()));
  if (isLoadError(workspace)) throw new Error("the workspace is refused");
  const found = workspace.view.blocks[block];
  if (found === undefined) throw new Error(`block ${block} is missing`);
  const drawing = drawingOf(
    found,
    workspace.view.graphical,
    FONT_METRICS,
    undefined,
    await paneOf(page),
  );
  const box = drawing.boxes.find(
    (each) => each.band !== undefined && addressKey(each.address) === addressKey(REGIONS),
  );
  if (box?.band === undefined) throw new Error("the root's regions band is not drawn");
  return [box.band.level, box.band.elements, box.y - box.band.line, box.height];
}

/** The regions `score` holds, by their IDs. */
function regionsOfScore(page: Page, block: string): Promise<string[]> {
  return page.evaluate(
    (id) =>
      (window.__tilie.store().view.blocks[id]?.manifest.timelines[0]?.regions ?? []).map(
        (region) => region.id,
      ),
    block,
  );
}

test("the root's empty Regions band is drawn, hovered, opened and filled", async ({ page }) => {
  const block = await importFixture(page, "unknown_length_child");
  await setViewport(page, VIEW);
  await settledDrawing(page, block);
  expect(await facets(page, block)).not.toContain("regions");

  const entries = await journalLength(page);
  expect(
    await dispatch(page, {
      type: "style",
      select: OWN,
      set: { display: "inline" },
      blocks: [block],
    }),
  ).toBeNull();
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  await settledDrawing(page, block);
  expect(await regionsBand(page, block)).toEqual([-2, 0, 30.9765625, Wb]);

  const point = await bandPoint(page, block, REGIONS, 2);
  await page.mouse.move(point.x, point.y);
  await expect.poll(() => bandMarks(page, block)).toEqual(keysOf([REGIONS]));

  await page.mouse.dblclick(point.x, point.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: "score" }, kind: "timeline" }]);

  await tab(page, "Regions").click();
  await (await panel(page, "Regions")).getByRole("button", { name: "Add region" }).click();
  await expect.poll(() => regionsOfScore(page, block)).toHaveLength(1);
  const [added] = await regionsOfScore(page, block);
  if (added === undefined) throw new Error("Add region added no region");
  await expect(element(page, block, { id: added })).toHaveCount(1);
  await expect.poll(async () => (await bandOf(page, block, REGIONS)).elements).toBe(1);
  // The first region added, its label in tier 1, leaves the band as wide as it was, `Wb`.
  expect(await regionsBand(page, block)).toEqual([-2, 1, 30.9765625, Wb]);
});

test("one press of the root's own Regions box shows its empty band", async ({ page }) => {
  const block = await importFixture(page, "unknown_length_child");
  await setViewport(page, VIEW);
  await settledDrawing(page, block);
  await select(page, [{ block, id: "score" }]);
  await page.getByRole("button", { name: "Open inspector" }).click();
  const list = (await panel(page, "Properties")).getByRole("table", { name: "Bands" });
  const own = list.getByRole("checkbox", { name: "Regions visible", exact: true });
  await expect(own).toBeEnabled();
  await expect(own).not.toBeChecked();

  const entries = await journalLength(page);
  await own.click();
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  expect(await newestCommand(page)).toEqual({
    type: "style",
    select: OWN,
    set: { display: "inline" },
    blocks: [block],
  });
  await expect(own).toBeChecked();
  await settledDrawing(page, block);
  expect(await regionsBand(page, block)).toEqual([-2, 0, 30.9765625, Wb]);
});
