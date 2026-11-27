/**
 * The flow-control editor's inspector side and its closing, in the real
 * app, on `flow/virtual_cards` (root `allegro`, four flow-control
 * elements). The expected values are derived in `README.md`
 * ("editors-flow.spec.ts"): opening it by a double-click in `allegro`'s
 * flow control band, with the drawer open on Journal, shows the "Flow
 * control" tab and gives its button the focus; its panel adds a Repeat
 * start at 100, which is stored as one entry of the open session, listed,
 * and selected on the canvas; a double-click on the edited card (a free
 * spot of its flow control band, then its line) closes the editor, as a
 * double-click outside the edited element does elsewhere.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  bandPoint,
  drawer,
  editing,
  entriesLength,
  importFixture,
  partCentre,
  selection,
  settledDrawing,
  setViewport,
  tab,
  tabs,
} from "./support.ts";

const VIEW = { x: 40, y: 40, zoom: 1 };
const HALF = { x: 40, y: 40, zoom: 0.5 };

/** The IDs and coordinates of `allegro`'s flow-control elements, in the manifest's order. */
function allegroFlow(page: Page, block: string): Promise<{ id: string; coordinate: unknown }[]> {
  return page.evaluate((id) => {
    const manifest = window.__tilie.store().view.blocks[id]?.manifest;
    const allegro = manifest?.timelines.find((item) => item.id === "allegro");
    return (allegro?.flow_control ?? []).map((item) => ({
      id: item.id,
      coordinate: item.coordinate,
    }));
  }, block);
}

/** Open `allegro`'s flow-control editor by a double-click in its flow control band, at `VIEW`. */
async function openFlow(page: Page, block: string): Promise<void> {
  await setViewport(page, VIEW);
  await settledDrawing(page, block);
  const inBand = await bandPoint(page, block, { id: "allegro", facet: "flow_control" }, 2);
  await page.mouse.dblclick(inBand.x, inBand.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: "allegro" }, kind: "flow" }]);
}

test("opening the flow-control editor shows its tab, where elements are added", async ({
  page,
}) => {
  const block = await importFixture(page, "flow/virtual_cards");
  await page.getByRole("button", { name: "Open inspector" }).click();
  await tab(page, "Journal").click();
  await expect(tab(page, "Journal")).toHaveAttribute("aria-selected", "true");
  await openFlow(page, block);

  const flowTab = tabs(page).getByRole("tab", { name: "Flow control", exact: true });
  await expect(flowTab).toHaveAttribute("aria-selected", "true");
  await expect(flowTab).toBeFocused();

  const add = drawer(page).getByTestId("flow-control-add");
  const rows = drawer(page).getByTestId("flow-control-row");
  await expect(rows).toHaveCount(4);
  const before = await allegroFlow(page, block);
  const entries = await entriesLength(page);
  await add.getByLabel("Element").selectOption({ label: "Repeat start" });
  await add.getByLabel("Position").fill("100");
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(() => entriesLength(page)).toBe(entries + 1);
  const added = (await allegroFlow(page, block)).filter(
    (item) => !before.some((known) => known.id === item.id),
  );
  expect(added.map((item) => item.coordinate)).toEqual([[100, 1]]);
  await expect.poll(() => selection(page)).toEqual([{ block, id: added[0]?.id }]);
  await expect(rows).toHaveCount(5);
  await expect(drawer(page).locator('[data-testid="flow-control-row"].selected')).toHaveCount(1);
});

test("a double-click on the edited card closes the flow-control editor", async ({ page }) => {
  const block = await importFixture(page, "flow/virtual_cards");
  await openFlow(page, block);
  await setViewport(page, VIEW);
  const inBand = await bandPoint(page, block, { id: "allegro", facet: "flow_control" }, 2);
  await page.mouse.dblclick(inBand.x, inBand.y);
  await expect.poll(() => editing(page)).toEqual([]);

  await openFlow(page, block);
  // The drawer, opened with the editor, covers the canvas's right part: at half the zoom the
  // line's centre lies left of it.
  await setViewport(page, HALF);
  await settledDrawing(page, block);
  const line = await partCentre(page, block, { id: "allegro" });
  await page.mouse.dblclick(line.x, line.y);
  await expect.poll(() => editing(page)).toEqual([]);
});
