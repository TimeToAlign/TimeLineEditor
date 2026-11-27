/**
 * The band list's Visible control reaching one timeline or its tree, in a
 * browser: the root's tree box showing its child's atomic sections with
 * one press (the shape of Beethoven's Op. 106, whose movements hold atomic
 * sections and whose root holds none), its conversion maps hidden and
 * shown again on every child, and the root's own empty Regions band hidden
 * and shown, never disabled. The expected values are derived in
 * `README.md` ("controls.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  bandsOf,
  dispatch,
  element,
  importFixture,
  journalLength,
  newestCommand,
  panel,
  select,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

/** The full IRI of the class of an atomic section, which every manifest expands to itself. */
const ATOMIC = "https://timetoalign.github.io/timetoshare/ns#AtomicSection";

/** Select the line of `timeline` in block `block` and open the inspector on Properties; the band list. */
async function bandList(page: Page, block: string, timeline: string) {
  await select(page, [{ block, id: timeline }]);
  await page.getByRole("button", { name: "Open inspector" }).click();
  return (await panel(page, "Properties")).getByRole("table", { name: "Bands" });
}

/** The `style` of block `block` writing `display` in the rule `select`. */
function style(block: string, select: object, display: string | null) {
  return { type: "style", select, set: { display }, blocks: [block] };
}

/** Whether the checkbox `name` of `list` is indeterminate, a property no attribute shows. */
function mixed(list: ReturnType<Page["locator"]>, name: string): Promise<boolean> {
  return list
    .getByRole("checkbox", { name, exact: true })
    .evaluate((box) => (box as HTMLInputElement).indeterminate);
}

test("the root's tree box shows its child's atomic sections with one press", async ({ page }) => {
  const block = await importFixture(page, "unknown_length_child");
  expect(
    await dispatch(page, {
      type: "set",
      changes: [{ target: { block, id: "region_1" }, values: { statements: { type: [ATOMIC] } } }],
    }),
  ).toBeNull();
  const list = await bandList(page, block, "score");
  const own = list.getByRole("checkbox", { name: "Regions visible", exact: true });
  const tree = list.getByRole("checkbox", {
    name: "Regions with its descendants visible",
    exact: true,
  });
  await expect(own).toBeChecked();
  await expect(own).toBeEnabled();
  await expect(tree).toBeEnabled();
  await expect(tree).not.toBeChecked();
  expect(await mixed(list, "Regions with its descendants visible")).toBe(true);
  await expect(element(page, block, { id: "region_1" })).toHaveCount(0);

  const entries = await journalLength(page);
  await tree.click();
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  expect(await newestCommand(page)).toEqual(
    style(block, { element: "region", within: "score" }, "inline"),
  );
  await expect(tree).toBeChecked();
  expect(await mixed(list, "Regions with its descendants visible")).toBe(false);
  await expect(element(page, block, { id: "region_1" })).toHaveCount(1);

  await tree.click();
  await expect.poll(() => journalLength(page)).toBe(entries + 2);
  await expect(tree).not.toBeChecked();
  await expect(own).not.toBeChecked();
  await expect(element(page, block, { id: "region_1" })).toHaveCount(0);
  await expect
    .poll(async () => (await bandsOf(page, block, "movement")).map((band) => band.facet))
    .not.toContain("regions");
});

test("the root's tree box hides and shows every child's conversion maps", async ({ page }) => {
  const block = await importFixture(page, "map_row_moved");
  const list = await bandList(page, block, "piece");
  const own = list.getByRole("checkbox", { name: "Conversion maps visible", exact: true });
  const tree = list.getByRole("checkbox", {
    name: "Conversion maps with its descendants visible",
    exact: true,
  });
  await expect(own).toBeEnabled();
  await expect(own).toBeChecked();
  await expect(tree).toBeChecked();
  const maps = async () =>
    (await Promise.all(["ante", "cons"].map((timeline) => bandsOf(page, block, timeline)))).map(
      (bands) => bands.filter((band) => band.facet === "conversion_maps").length,
    );
  expect(await maps()).toEqual([1, 1]);

  const entries = await journalLength(page);
  const rule = { element: "band", facet: "conversion_maps", within: "piece" };
  await tree.uncheck();
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  expect(await newestCommand(page)).toEqual(style(block, rule, "none"));
  await expect.poll(maps).toEqual([0, 0]);
  await expect(own).not.toBeChecked();

  await tree.check();
  await expect.poll(() => journalLength(page)).toBe(entries + 2);
  expect(await newestCommand(page)).toEqual(style(block, rule, null));
  await expect.poll(maps).toEqual([1, 1]);
  await expect(own).toBeChecked();
});

test("the root's own empty Regions band is hidden and shown, never disabled", async ({ page }) => {
  const block = await importFixture(page, "unknown_length_child");
  const list = await bandList(page, block, "score");
  const own = list.getByRole("checkbox", { name: "Regions visible", exact: true });
  await expect(own).toBeEnabled();
  await expect(list.getByRole("rowheader", { name: /^Regions/ })).toContainText(
    "Timeline 'score' holds no regions; its descendants hold some.",
  );
  const rule = { element: "band", addresses: [{ id: "score", facet: "regions" }] };
  const entries = await journalLength(page);
  await own.uncheck();
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  expect(await newestCommand(page)).toEqual(style(block, rule, "none"));
  await expect(own).not.toBeChecked();
  await expect(own).toBeEnabled();
  await own.check();
  await expect.poll(() => journalLength(page)).toBe(entries + 2);
  expect(await newestCommand(page)).toEqual(style(block, rule, null));
  await expect(own).toBeChecked();
});
