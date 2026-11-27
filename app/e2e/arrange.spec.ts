/**
 * A bundle's Horizontal after other arrangements (TimeToShare's drawing
 * specification, sections 8.6 and 8.8): with the canvas's blocks in a
 * matrix and the bundle's items one under another, the bundle editor's
 * Horizontal stands its items side by side, a bundle whose items hang on
 * no root as one whose groups hang on a shared root; the arranger's
 * Horizontal with the bundle selected arranges the blocks and leaves the
 * bundle's own arrangement alone, and the bundle editor's Horizontal then
 * still stands its items side by side. The expected values are derived in
 * `README.md` ("arrange.spec.ts").
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { cardAddress, idAddress } from "../packages/core/src/index.ts";
import { attributeText } from "../packages/writers/src/svg.ts";
import {
  BUNDLES,
  element,
  enter,
  entriesLength,
  node,
  open,
  select,
  setViewport,
  viewportOf,
} from "./support.ts";

/** Full motion, as the editor runs by default: every check waits until the drawing is at rest. */
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

type Choice = "free" | "vertical" | "horizontal" | "matrix";

/** The Arrange menu's button of `choice`, the menu opened from the canvas controls first. */
async function button(page: Page, choice: Choice): Promise<Locator> {
  const toggle = page.getByTestId("arrange");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return page.getByTestId("arrange-menu").getByTestId(`arrange-${choice}`);
}

/** Choose `choice` in the Arrange menu: one entry more, the choice shown pressed. */
async function choose(page: Page, choice: Choice): Promise<void> {
  const pressed = await button(page, choice);
  const before = await entriesLength(page);
  await pressed.click();
  await expect.poll(() => entriesLength(page)).toBe(before + 1);
  await expect(pressed).toHaveAttribute("aria-pressed", "true");
}

/** Close the Arrange menu. */
async function closeMenu(page: Page): Promise<void> {
  const toggle = page.getByTestId("arrange");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
}

/** The stated arrangement of the workspace (no `block`) or of a block; `null` where none is stated. */
function stated(page: Page, block?: string): Promise<unknown> {
  return page.evaluate((id) => {
    const { view } = window.__tilie.store();
    const arrangement = id === undefined ? view.arrangement : view.blocks[id]?.arrangement;
    return arrangement === undefined ? null : JSON.parse(JSON.stringify(arrangement));
  }, block);
}

/** The drawn `x` and `y` of each of `drawn`'s rectangles (the last part: a box after its shadow). */
function rectanglesAt(drawn: readonly Locator[]): Promise<(string | null)[][]> {
  return Promise.all(
    drawn.map((each) =>
      each.last().evaluate((rect) => [rect.getAttribute("x"), rect.getAttribute("y")]),
    ),
  );
}

/** The number of distinct screen tops of `drawn`'s last parts, motions included. */
async function screenTops(drawn: readonly Locator[]): Promise<number> {
  const tops = await Promise.all(drawn.map(async (each) => (await each.last().boundingBox())?.y));
  return new Set(tops).size;
}

/**
 * Whether block `block`'s node is stated `width` × `height` canvas units: its
 * style compared with this browser's own spelling of those lengths (a probe
 * element given them), as each engine prints a length to its own precision.
 */
function nodeSized(page: Page, block: string, width: number, height: number): Promise<boolean> {
  return node(page, block).evaluate(
    (shown, [w, h]) => {
      const probe = document.createElement("div");
      probe.style.width = `${w}px`;
      probe.style.height = `${h}px`;
      return shown.style.width === probe.style.width && shown.style.height === probe.style.height;
    },
    [width, height],
  );
}

/** The arranger's blocks in a matrix, then the bundle editor of `block` open and its items Vertical. */
async function matrixThenVertical(page: Page, block: string): Promise<void> {
  await open(page, "bundles");
  await setViewport(page, { x: 40, y: 40, zoom: 0.5 });
  await choose(page, "matrix");
  expect(await stated(page)).toEqual({ direction: "matrix", columns: 2 });
  await closeMenu(page);
  await enter(page, { block }, await viewportOf(page));
  await choose(page, "vertical");
}

/** `bundle_ungrouped`'s three cards, in the row's order. */
const UNGROUPED = ["pages", "recording", "score"] as const;

/** The three cards side by side (README): `x` and `y` as the writer prints them. */
const SIDE_BY_SIDE = [8, 565.3271484375, 1122.654296875].map((x) => [
  attributeText(x),
  attributeText(28.8046875),
]);

/** Expect `bungroup00`'s cards side by side at one top, on the screen too, the node the row's size. */
async function expectCardsSideBySide(page: Page): Promise<void> {
  const block = BUNDLES.ungrouped;
  const cards = UNGROUPED.map((id) => element(page, block, cardAddress(id)));
  await expect.poll(() => rectanglesAt(cards)).toEqual(SIDE_BY_SIDE);
  await expect.poll(() => screenTops(cards)).toBe(1);
  expect(await nodeSized(page, block, 1641.9814453125, 120.7265625)).toBe(true);
}

test("the bundle editor's Horizontal stands items hanging on no root side by side after Matrix and Vertical", async ({
  page,
}) => {
  const block = BUNDLES.ungrouped;
  await matrixThenVertical(page, block);
  const cards = UNGROUPED.map((id) => element(page, block, cardAddress(id)));
  await expect
    .poll(() => rectanglesAt(cards))
    .toEqual(
      [28.8046875, 100.2578125, 157.734375].map((y) => [attributeText(8), attributeText(y)]),
    );

  await choose(page, "horizontal");
  expect(await stated(page, block)).toEqual({ direction: "horizontal", order: [...UNGROUPED] });
  await expect(await button(page, "vertical")).toHaveAttribute("aria-pressed", "false");
  await expectCardsSideBySide(page);
});

test("the bundle editor's Horizontal stands groups on a shared root side by side after Matrix and Vertical", async ({
  page,
}) => {
  const block = BUNDLES.shared;
  await matrixThenVertical(page, block);
  const frames = ["group_1", "group_2"].map((group) => element(page, block, idAddress(group)));
  await expect.poll(async () => new Set((await rectanglesAt(frames)).map(([x]) => x)).size).toBe(1);

  await choose(page, "horizontal");
  expect(await stated(page, block)).toEqual({
    direction: "horizontal",
    order: ["group_1", "group_2", "page"],
  });
  await expect
    .poll(() => rectanglesAt(frames))
    .toEqual([
      ["167.4136", "35.8125"],
      ["782.8037", "28.8047"],
    ]);
});

test("the arranger's Horizontal with the bundle selected arranges the blocks, the bundle editor's its items", async ({
  page,
}) => {
  await open(page, "bundles");
  await setViewport(page, { x: 40, y: 40, zoom: 0.5 });
  await choose(page, "matrix");
  await select(page, [{ block: BUNDLES.ungrouped }]);
  await choose(page, "horizontal");
  expect(await stated(page)).toEqual({ direction: "horizontal" });
  expect(await stated(page, BUNDLES.ungrouped)).toBeNull();
  // The blocks stand in one row at one top; the bundle's cards stay one under another.
  const blocks = Object.values(BUNDLES);
  await expect.poll(() => screenTops(blocks.map((id) => node(page, id)))).toBe(1);
  const cards = UNGROUPED.map((id) => element(page, BUNDLES.ungrouped, cardAddress(id)));
  expect(new Set((await rectanglesAt(cards)).map(([x]) => x)).size).toBe(1);
  await closeMenu(page);

  await enter(page, { block: BUNDLES.ungrouped }, await viewportOf(page));
  await choose(page, "horizontal");
  await expectCardsSideBySide(page);
});
