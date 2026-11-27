/**
 * The children editor in the real app, on `nested` (root `clt_1`, its
 * child `clt_3`, whose child is `clt_2`). The expected values are derived in
 * `README.md` ("editors-children.spec.ts"): a double-click in `clt_1`'s
 * children band opens the children editor of `clt_1` (not its timeline
 * editor), its level tab "Children" shown with one row, `clt_3`, which
 * selects `clt_3` on the canvas; a double-click on `clt_3`'s line then
 * opens `clt_3`'s timeline editor inside it; Done twice closes both,
 * journalling nothing (no change was made).
 */

import { expect, test } from "@playwright/test";
import {
  bandPoint,
  done,
  drawer,
  editing,
  importFixture,
  journalLength,
  partCentre,
  selection,
  settledDrawing,
  setViewport,
  tabs,
} from "./support.ts";

const VIEW = { x: 40, y: 40, zoom: 1 };
const HALF = { x: 40, y: 40, zoom: 0.5 };

test("a double-click in a children band opens the children editor", async ({ page }) => {
  const block = await importFixture(page, "nested");
  await setViewport(page, VIEW);
  await settledDrawing(page, block);
  const journal = await journalLength(page);
  const inBand = await bandPoint(page, block, { id: "clt_1", facet: "children" }, 2);
  await page.mouse.dblclick(inBand.x, inBand.y);
  const clt1 = { block, id: "clt_1" };
  await expect.poll(() => editing(page)).toEqual([{ target: clt1, kind: "children" }]);

  const level = tabs(page).getByRole("tab", { name: "Children", exact: true });
  await expect(level).toHaveAttribute("aria-selected", "true");
  const rows = drawer(page).getByTestId("child-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("clt_3");
  await rows.first().getByRole("button").click();
  await expect.poll(() => selection(page)).toEqual([{ block, id: "clt_3" }]);

  // The drawer now covers the canvas's right part: at half the zoom the line lies left of it.
  await setViewport(page, HALF);
  await settledDrawing(page, block);
  const line = await partCentre(page, block, { id: "clt_3" });
  await page.mouse.dblclick(line.x, line.y);
  await expect
    .poll(() => editing(page))
    .toEqual([
      { target: clt1, kind: "children" },
      { target: { block, id: "clt_3" }, kind: "timeline" },
    ]);
  await done(page);
  await done(page);
  await expect.poll(() => editing(page)).toEqual([]);
  expect(await journalLength(page)).toBe(journal);
});
