/**
 * Mounted nodes: every block below the culling threshold, only the blocks
 * the viewport touches above it. Derivation in `README.md` ("culling.spec.ts").
 */

import { expect, test } from "@playwright/test";
import { GRID_PITCH, GRIDS } from "./fixtures/generate.ts";
import { open, pane, setViewport } from "./support.ts";

/** The drawing box of the `bare` manifest at the default placement, scale 1. */
const BLOCK = { width: 476.5771484375, height: 67.37890625 };

/**
 * The grid blocks a pane of `width` × `height` pixels shows under `view`:
 * those whose box overlaps the pane's canvas rectangle by a positive area.
 */
function visible(
  blocks: number,
  columns: number,
  view: { x: number; y: number; zoom: number },
  width: number,
  height: number,
): number {
  const left = -view.x / view.zoom;
  const top = -view.y / view.zoom;
  const right = left + width / view.zoom;
  const bottom = top + height / view.zoom;
  let count = 0;
  for (let n = 0; n < blocks; n += 1) {
    const x = (n % columns) * GRID_PITCH.x;
    const y = Math.floor(n / columns) * GRID_PITCH.y;
    const across = Math.min(right, x + BLOCK.width) - Math.max(left, x);
    const down = Math.min(bottom, y + BLOCK.height) - Math.max(top, y);
    if (across > 0 && down > 0) count += 1;
  }
  return count;
}

test("300 blocks: no culling, every node is mounted at any viewport", async ({ page }) => {
  await open(page, "grid-300");
  await expect(page.getByTestId("block")).toHaveCount(300);
  await setViewport(page, { x: -2000, y: -100, zoom: 1 });
  await expect(page.getByTestId("block")).toHaveCount(300);
});

test("900 blocks: culling on, exactly the nodes the viewport touches are mounted", async ({
  page,
}) => {
  await open(page, "grid-900");
  const view = { x: -2000, y: -100, zoom: 1 };
  await setViewport(page, view);
  const size = await pane(page).evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
  }));
  const { blocks, columns } = GRIDS["grid-900"];
  const expected = visible(blocks, columns, view, size.width, size.height);
  // The pane is a whole number of pixels; the count is exact for that pane.
  await expect(page.getByTestId("block")).toHaveCount(expected);
  // The worked example of the README pins the formula itself.
  expect(visible(blocks, columns, view, 1000, 600)).toBe(24);
});
