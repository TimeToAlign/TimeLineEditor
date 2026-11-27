/**
 * The band list's Visible control reaching one timeline or its tree, in a
 * browser: the root's tree box showing its child's atomic sections with
 * one press (the shape of Beethoven's Op. 106, whose movements hold atomic
 * sections and whose root holds none), its conversion maps hidden and
 * shown again on every child, the root's own empty Regions band shown
 * (explicitly, so drawn though empty) and hidden, never disabled, a press
 * of several commands inside an open editor one undo step, and the two
 * boxes drawn as one control in the editor's flag colours. The expected values are derived in
 * `README.md` ("controls.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  arranger,
  bandsOf,
  dispatch,
  element,
  enter,
  entriesLength,
  importFixture,
  journalLength,
  newestCommand,
  panel,
  select,
  storeText,
  tab,
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

/** The rules of block `block`'s manifest, as JSON. */
function rulesOf(page: Page, block: string): Promise<unknown> {
  return page.evaluate(
    (id) =>
      JSON.parse(
        JSON.stringify(window.__tilie.store().view.blocks[id]?.manifest.graphical?.rules ?? []),
      ),
    block,
  );
}

/** The facets of the bands the hook records of `timeline` in block `block`. */
async function facetsOf(page: Page, block: string, timeline: string): Promise<string[]> {
  return (await bandsOf(page, block, timeline)).map((band) => band.facet);
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
  // `score`'s band, displayed by the initial value alone and drawing nothing, is absent.
  await expect(own).not.toBeChecked();
  await expect(own).toBeEnabled();
  await expect(tree).toBeEnabled();
  await expect(tree).not.toBeChecked();
  expect(await mixed(list, "Regions with its descendants visible")).toBe(false);
  await expect(element(page, block, { id: "region_1" })).toHaveCount(0);

  const bands = { element: "band", facet: "regions", within: "score" };
  const regions = { element: "region", within: "score" };
  const entries = await journalLength(page);
  await tree.click();
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  expect(await rulesOf(page, block)).toEqual([
    { select: bands, set: { display: "inline" } },
    { select: regions, set: { display: "inline" } },
  ]);
  await expect(tree).toBeChecked();
  expect(await mixed(list, "Regions with its descendants visible")).toBe(false);
  await expect(own).toBeChecked();
  await expect(element(page, block, { id: "region_1" })).toHaveCount(1);
  await expect.poll(() => facetsOf(page, block, "score")).toContain("regions");

  await tree.click();
  await expect.poll(() => journalLength(page)).toBe(entries + 2);
  expect(await rulesOf(page, block)).toEqual([{ select: bands, set: { display: "none" } }]);
  await expect(tree).not.toBeChecked();
  await expect(own).not.toBeChecked();
  await expect(element(page, block, { id: "region_1" })).toHaveCount(0);
  await expect.poll(() => facetsOf(page, block, "movement")).not.toContain("regions");
});

test("the root's tree box hides and shows every child's conversion maps", async ({ page }) => {
  const block = await importFixture(page, "map_row_moved");
  const list = await bandList(page, block, "piece");
  const own = list.getByRole("checkbox", { name: "Conversion maps visible", exact: true });
  const tree = list.getByRole("checkbox", {
    name: "Conversion maps with its descendants visible",
    exact: true,
  });
  // `piece`'s band, holding no map, is absent; the children's show theirs.
  await expect(own).toBeEnabled();
  await expect(own).not.toBeChecked();
  await expect(tree).not.toBeChecked();
  expect(await mixed(list, "Conversion maps with its descendants visible")).toBe(true);
  const maps = async () =>
    (await Promise.all(["ante", "cons"].map((timeline) => bandsOf(page, block, timeline)))).map(
      (bands) => bands.filter((band) => band.facet === "conversion_maps").length,
    );
  expect(await maps()).toEqual([1, 1]);

  const entries = await journalLength(page);
  const rule = { element: "band", facet: "conversion_maps", within: "piece" };
  await tree.click();
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  expect(await newestCommand(page)).toEqual(style(block, rule, "inline"));
  await expect(own).toBeChecked();
  await expect(tree).toBeChecked();
  await expect.poll(maps).toEqual([1, 1]);

  await tree.click();
  await expect.poll(() => journalLength(page)).toBe(entries + 2);
  expect(await newestCommand(page)).toEqual(style(block, rule, "none"));
  await expect.poll(maps).toEqual([0, 0]);
  await expect(own).not.toBeChecked();

  await tree.click();
  await expect.poll(() => journalLength(page)).toBe(entries + 3);
  expect(await newestCommand(page)).toEqual(style(block, rule, "inline"));
  await expect.poll(maps).toEqual([1, 1]);
  await expect(own).toBeChecked();
});

test("the root's own empty Regions band is shown and hidden, never disabled", async ({ page }) => {
  const block = await importFixture(page, "unknown_length_child");
  const list = await bandList(page, block, "score");
  const own = list.getByRole("checkbox", { name: "Regions visible", exact: true });
  await expect(own).toBeEnabled();
  await expect(own).not.toBeChecked();
  await expect(list.getByRole("rowheader", { name: /^Regions/ })).toContainText(
    "Timeline 'score' holds no regions; its descendants hold some.",
  );
  const rule = { element: "band", addresses: [{ id: "score", facet: "regions" }] };
  const entries = await journalLength(page);
  await own.check();
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  expect(await newestCommand(page)).toEqual(style(block, rule, "inline"));
  await expect(own).toBeChecked();
  await expect.poll(() => facetsOf(page, block, "score")).toContain("regions");
  await own.uncheck();
  await expect.poll(() => journalLength(page)).toBe(entries + 2);
  expect(await newestCommand(page)).toEqual(style(block, rule, "none"));
  await expect(own).not.toBeChecked();
  await expect(own).toBeEnabled();
  await expect.poll(() => facetsOf(page, block, "score")).not.toContain("regions");
});

test("a press of several commands inside an open editor is one undo step", async ({ page }) => {
  const block = await importFixture(page, "unknown_length_child");
  expect(
    await dispatch(page, {
      type: "set",
      changes: [{ target: { block, id: "region_1" }, values: { statements: { type: [ATOMIC] } } }],
    }),
  ).toBeNull();
  await enter(page, { block, id: "score" }, { x: 40, y: 40, zoom: 1 });
  // The editor opens the inspector on its level tab: Properties is one tab over.
  await select(page, [{ block, id: "score" }]);
  await tab(page, "Properties").click();
  const list = (await panel(page, "Properties")).getByRole("table", { name: "Bands" });
  const tree = list.getByRole("checkbox", {
    name: "Regions with its descendants visible",
    exact: true,
  });
  const entries = await entriesLength(page);
  await tree.click();
  await expect.poll(() => entriesLength(page)).toBe(entries + 1);
  await expect(tree).toBeChecked();
  await expect(element(page, block, { id: "region_1" })).toHaveCount(1);
  const shown = await storeText(page, "view");

  await tree.click();
  await expect.poll(() => entriesLength(page)).toBe(entries + 2);
  await expect(tree).not.toBeChecked();
  await expect(element(page, block, { id: "region_1" })).toHaveCount(0);

  await arranger(page).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => entriesLength(page)).toBe(entries + 1);
  expect(await storeText(page, "view")).toBe(shown);
  await expect(tree).toBeChecked();
  await expect(element(page, block, { id: "region_1" })).toHaveCount(1);
});

test("draws the two boxes as one control with the editor's flag face and edge", async ({
  page,
}) => {
  const block = await importFixture(page, "unknown_length_child");
  const list = await bandList(page, block, "score");
  const tree = list.getByRole("checkbox", {
    name: "Regions with its descendants visible",
    exact: true,
  });
  await expect(tree).toBeVisible();
  const look = await tree.evaluate((box) => {
    const control = box.closest(".reach");
    const divider = box.closest(".tree");
    if (control === null || divider === null) return null;
    const own = getComputedStyle(control);
    const sides = ["top", "right", "bottom", "left"].map((side) => [
      own.getPropertyValue(`border-${side}-width`),
      own.getPropertyValue(`border-${side}-style`),
      own.getPropertyValue(`border-${side}-color`),
    ]);
    const line = getComputedStyle(divider);
    return {
      background: own.backgroundColor,
      sides,
      divider: [
        line.borderInlineStartWidth,
        line.borderInlineStartStyle,
        line.borderInlineStartColor,
      ],
    };
  });
  const edge = ["1px", "solid", "rgb(200, 200, 200)"];
  expect(look).toEqual({
    background: "rgb(255, 255, 255)",
    sides: [edge, edge, edge, edge],
    divider: edge,
  });
});
