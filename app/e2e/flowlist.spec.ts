/**
 * The Flow list in a browser (the arranger's README, "Virtual cards,
 * ribbons, the flow flag and the flow switch", The switch), on TimeToShare's
 * fixtures `flow/switched_card` (the root `allegro`, its FlowMaps `by_hand`
 * "Practice", `default`, `printed`, `single`, its three virtual timelines
 * applying `by_hand`, `default` and `single`, its card switched to
 * `default`) and `groups/switched_frame` (the same, `allegro` and
 * `recording` members of the group `performance`):
 *
 * - with `allegro`'s card selected the list stands in the resize toolbar's
 *   row, right of Scale, Box and Stretch: its panel's left edge is the
 *   modes' toolbar's right edge, 3 right of Stretch's box (a menu's padding
 *   and border), both panels share their top, the panel's name starts 2 in
 *   and the select 2 beyond the name, and the select and Stretch are
 *   centred on one line, every box read in 1/960 px, a grid holding every
 *   engine's layout unit (`GRID`);
 * - it lists exactly "As written" and the root's four FlowMaps, each once,
 *   no virtual timeline, `default` chosen; choosing `single` journals
 *   exactly the `style` command setting `flow` to `single` on `{id:
 *   "allegro", part: ["card"]}`;
 * - a card whose `flow` names the virtual timeline `allegro_default` shows
 *   `default` chosen, the same five entries listed;
 * - the frame of `performance` shows no list while its resize modes show;
 *   `allegro`'s card in it lists the same five entries, `default` chosen.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  dispatch,
  importFixture,
  journalLength,
  newestCommand,
  select,
  settledDrawing,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

/** The entries of `allegro`'s list: "As written", then each FlowMap once. */
const ENTRIES = ["As written", "Practice", "default", "printed", "single"];

/** The `style` command of block `block` setting `flow` on `allegro`'s cards. */
const flowOn = (block: string, flow: string | null) => ({
  type: "style",
  select: { addresses: [{ id: "allegro", part: ["card"] }] },
  set: { flow },
  blocks: [block],
});

/** Import `fixture`, wait for its drawing and select `allegro`'s card; the block. */
async function allegroSelected(page: Page, fixture: string): Promise<string> {
  const block = await importFixture(page, fixture);
  await settledDrawing(page, block);
  await select(page, [{ block, id: "allegro", part: ["card"] }]);
  return block;
}

/**
 * Parts of a pixel the boxes are read in: 1/960, a grid holding both the 1/64 px layout unit of
 * Chromium and WebKit and Firefox's 1/60 px. Firefox reports a box in single precision, a few
 * ten-thousandths of a pixel off the place it laid out; read on this grid every engine's box is
 * the one laid out, exactly (the toolbar's own offset, a translation each engine keeps as it
 * stands, is the same in every box and cancels out in each comparison).
 */
const GRID = 960;

/** The bounding box of the element `selector` finds, which must be shown, in parts of `GRID`. */
async function boxOf(page: Page, selector: string) {
  const found = await page.locator(selector).boundingBox();
  if (found === null) throw new Error(`${selector} is not shown`);
  const { x, y, width, height } = found;
  const read = (value: number) => Math.round(value * GRID);
  return { x: read(x), y: read(y), width: read(width), height: read(height) };
}

test("the list stands right of Scale, Box and Stretch, on their row", async ({ page }) => {
  await allegroSelected(page, "flow/switched_card");
  const flow = page.getByTestId("flow-switch");
  await expect(flow).toBeVisible();
  const modes = await boxOf(page, '[role="toolbar"][aria-label="Resize mode"]');
  const panel = await boxOf(page, 'label:has([data-testid="flow-switch"])');
  const stretch = await boxOf(page, '[data-testid="mode-stretch"]');
  const list = await boxOf(page, '[data-testid="flow-switch"]');
  const name = await boxOf(page, 'label:has([data-testid="flow-switch"]) > .name');
  expect(panel.x).toBe(modes.x + modes.width);
  expect(panel.y).toBe(modes.y);
  // A menu's padding 2 and border 1 (menu.css): Stretch ends 3 before the modes' right edge; the
  // panel, its left border dropped, holds its name from 2 in and the list 2 (the gap) beyond it.
  expect(modes.x + modes.width).toBe(stretch.x + stretch.width + 3 * GRID);
  expect(name.x).toBe(panel.x + 2 * GRID);
  expect(list.x).toBe(name.x + name.width + 2 * GRID);
  expect(list.y + list.height / 2).toBe(stretch.y + stretch.height / 2);
});

test("the list holds each FlowMap of the root once and sends the style command", async ({
  page,
}) => {
  const block = await allegroSelected(page, "flow/switched_card");
  const flow = page.getByTestId("flow-switch");
  await expect(flow.locator("option")).toHaveText(ENTRIES);
  await expect(flow).toHaveValue("2");
  const before = await journalLength(page);
  await flow.selectOption({ label: "single" });
  await expect.poll(() => journalLength(page)).toBe(before + 1);
  expect(await newestCommand(page)).toEqual(flowOn(block, "single"));
  await expect(flow).toHaveValue("4");
});

test("a card switched by a virtual timeline shows its FlowMap chosen", async ({ page }) => {
  const block = await allegroSelected(page, "flow/switched_card");
  expect(await dispatch(page, flowOn(block, "allegro_default"))).toBeNull();
  await settledDrawing(page, block);
  const flow = page.getByTestId("flow-switch");
  await expect(flow.locator("option")).toHaveText(ENTRIES);
  await expect(flow).toHaveValue("2");
});

test("a frame shows no list; its card lists the FlowMaps once", async ({ page }) => {
  const block = await importFixture(page, "groups/switched_frame");
  await settledDrawing(page, block);
  await select(page, [{ block, id: "performance" }]);
  await expect(page.getByTestId("mode-box")).toBeVisible();
  await expect(page.getByTestId("flow-switch")).toHaveCount(0);
  await select(page, [{ block, id: "allegro", part: ["card"] }]);
  const flow = page.getByTestId("flow-switch");
  await expect(flow.locator("option")).toHaveText(ENTRIES);
  await expect(flow).toHaveValue("2");
});
