/**
 * Ancestor cards (TimeToShare's drawing specification, section 8.8): the
 * Properties checkbox "Card behind its groups" draws a root whole behind
 * the frame of its member's group, beyond the frame's borders, moving
 * nothing else; a double-click on it opens the root's timeline editor and
 * raises it over the frame. The expected values are derived in `README.md`
 * ("ancestor-cards.spec.ts").
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ElementAddress } from "../packages/core/src/index.ts";
import { cardAddress, idAddress } from "../packages/core/src/index.ts";
import { manifestFixture } from "./schema.ts";
import {
  done,
  editing,
  element,
  framePoint,
  journalLength,
  node,
  pick,
  placement,
  select,
  setViewport,
  withoutPickers,
} from "./support.ts";

const PIECE_CARD = cardAddress("piece");
const FRAME = idAddress("group_1");

/** The rectangle of a drawn box: its last part, the card itself after its shadow. */
function box(page: Page, block: string, address: ElementAddress): Locator {
  return element(page, block, address).last();
}

/** A drawn box's `x`, `y`, `width` and `height` attributes, as the writer prints them. */
function attributes(rect: Locator): Promise<(string | null)[]> {
  return rect.evaluate((drawn) =>
    ["x", "y", "width", "height"].map((name) => drawn.getAttribute(name)),
  );
}

/** The drawn attributes of the frame and of both member cards, in that order. */
function heldBoxes(page: Page, block: string): Promise<(string | null)[][]> {
  return Promise.all(
    [FRAME, cardAddress("middle"), cardAddress("recording")].map((address) =>
      attributes(box(page, block, address)),
    ),
  );
}

/**
 * The canvas position of block `block`'s node, read from its transform,
 * which Chromium writes to six significant digits.
 */
async function nodeAt(page: Page, block: string): Promise<number[]> {
  const transform = await node(page, block).evaluate(
    (item) => (item as HTMLElement).style.transform,
  );
  const found = /^translate\((-?[\d.e+-]+)px, (-?[\d.e+-]+)px\)$/.exec(transform);
  if (found === null) throw new Error(`block ${block}'s node is placed by ${transform}`);
  return [Number(found[1]), Number(found[2])];
}

/** The frame and the member cards before the ancestor card is shown, as the writer prints them. */
const HELD = [
  ["8", "8", "543.7036", "174.1367"],
  ["16", "32.8047", "527.7036", "83.9531"],
  ["16", "124.7578", "527.7036", "49.3789"],
];

/** The shift of the block's place origin while the card is shown (layout's README). */
const SHIFT = 148.6318359375;

/** Whether the piece's card rectangle comes after the frame's in the DOM, so it is drawn over it. */
async function cardAfterFrame(page: Page, block: string): Promise<boolean> {
  const frame = await box(page, block, FRAME).elementHandle();
  return box(page, block, PIECE_CARD).evaluate(
    (card, held) =>
      held !== null &&
      (held.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    frame,
  );
}

test.use({ viewport: { width: 1280, height: 800 } });

test("an ancestor card is drawn beyond the frame, opened by a double-click and raised", async ({
  page,
}) => {
  await withoutPickers(page);
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  await pick(
    page,
    "Import manifest…",
    "group_parent_both.yaml",
    manifestFixture("groups/group_parent_both"),
  );
  await expect.poll(() => journalLength(page)).toBe(1);
  const [block] = await page.evaluate(() => Object.keys(window.__tilie.store().view.blocks));
  if (block === undefined) throw new Error("the import added no block");
  const place = await placement(page, block);
  await setViewport(page, { x: 240 - place.x, y: 80 - place.y, zoom: 1 });

  await select(page, [{ block, id: "piece" }]);
  await page.getByRole("button", { name: "Open inspector" }).click();
  await page.getByRole("tab", { name: "Properties", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "Card behind its groups" });
  await expect(checkbox).not.toBeChecked();
  await expect(element(page, block, PIECE_CARD)).toHaveCount(0);
  expect(await heldBoxes(page, block)).toEqual(HELD);
  expect(await nodeAt(page, block)).toEqual([place.x, place.y]);

  await checkbox.check();
  await expect.poll(() => journalLength(page)).toBe(2);
  await expect(element(page, block, PIECE_CARD)).toHaveCount(2);
  expect(await attributes(box(page, block, PIECE_CARD))).toEqual([
    "8",
    "18.8047",
    "869.3354",
    "63.3789",
  ]);
  // The node moves left by the shift and its drawing right by it, so on the canvas the frame and
  // the cards stay: 156.6318359375 − 148.6318359375 = 8, 164.6318359375 − 148.6318359375 = 16.
  expect(await heldBoxes(page, block)).toEqual([
    ["156.6318", "8", "543.7036", "174.1367"],
    ["164.6318", "32.8047", "527.7036", "83.9531"],
    ["164.6318", "124.7578", "527.7036", "49.3789"],
  ]);
  expect(await nodeAt(page, block)).toEqual([Number((place.x - SHIFT).toPrecision(6)), place.y]);
  expect(await placement(page, block)).toEqual(place);
  expect(await cardAfterFrame(page, block)).toBe(false);

  const visible = await framePoint(page, block, PIECE_CARD);
  await page.mouse.dblclick(visible.x, visible.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: "piece" }, kind: "timeline" }]);
  await expect.poll(() => cardAfterFrame(page, block)).toBe(true);

  await done(page);
  await select(page, [{ block, id: "piece" }]);
  await page.getByRole("tab", { name: "Properties", exact: true }).click();
  const entries = await journalLength(page);
  await checkbox.uncheck();
  await expect.poll(() => journalLength(page)).toBe(entries + 1);
  await expect(element(page, block, PIECE_CARD)).toHaveCount(0);
  expect(await heldBoxes(page, block)).toEqual(HELD);
  expect(await nodeAt(page, block)).toEqual([place.x, place.y]);
});
