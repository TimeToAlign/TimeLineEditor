/**
 * Arrangements (TimeToShare's drawing specification, sections 1, 8.5, 8.6
 * and 8.8) in the browser: the Arrange menu switches a bundle's items side
 * by side, the root they hang on drawn once behind the row, and back; the
 * items arranged one under another are reordered by a drag and by a key,
 * and side by side then stores core's row; side by side is refused with its
 * reason where two stretches overlap; the canvas's blocks are packed in a
 * matrix of three and then two columns, and placed freely again. The
 * expected values are derived in `README.md` ("arrangement.spec.ts").
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { cardAddress, idAddress } from "../packages/core/src/index.ts";
import { attributeText } from "../packages/writers/src/svg.ts";
import { manifestFixture } from "./schema.ts";
import {
  arranger,
  boxesOf,
  element,
  enter,
  entriesLength,
  framePoint,
  journalLength,
  newestCommand,
  node,
  open,
  pick,
  placement,
  SMALL,
  selection,
  setViewport,
  viewportOf,
  withoutPickers,
} from "./support.ts";

/** Reduced motion: nothing a press aims at moves; a wide page: four frames one under another fit. */
test.use({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});

const GROUPS = ["group_1", "group_2", "group_3", "group_4"] as const;

/** The root every group of the LayerIt bundle hangs on: its card is the ancestor card. */
const ROOT = "clt_1";

/** Open the editor and import the manifest fixture `name`; the new block's ID. */
async function importFixture(page: Page, name: string): Promise<string> {
  await withoutPickers(page);
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  const file = `${name.slice(name.indexOf("/") + 1)}.yaml`;
  await pick(page, "Import manifest…", file, manifestFixture(name));
  await expect.poll(() => journalLength(page)).toBe(1);
  const [block] = await page.evaluate(() => Object.keys(window.__tilie.store().view.blocks));
  if (block === undefined) throw new Error("the import added no block");
  return block;
}

/** Import `name` and open its block's bundle editor; the block's ID. */
async function inBundleEditor(page: Page, name: string): Promise<string> {
  const block = await importFixture(page, name);
  await enter(page, { block }, await viewportOf(page));
  return block;
}

/**
 * Set the viewport at zoom 1 so that block `block`'s node has its top left
 * corner at (`left`, `top`) of the pane: a drawing unit is then a pixel.
 */
async function nodeAt(page: Page, block: string, left: number, top: number): Promise<void> {
  const shown = await node(page, block).boundingBox();
  const flow = await page.locator(".svelte-flow").boundingBox();
  if (shown === null || flow === null) throw new Error(`block ${block} is not displayed`);
  const view = await viewportOf(page);
  if (view.zoom !== 1) throw new Error("the viewport is not at zoom 1");
  await setViewport(page, {
    x: view.x + left - (shown.x - flow.x),
    y: view.y + top - (shown.y - flow.y),
    zoom: 1,
  });
}

/** Open the Arrange menu from the canvas controls; the menu's panel. */
async function arrangeMenu(page: Page): Promise<Locator> {
  const toggle = page.getByTestId("arrange");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return page.getByTestId("arrange-menu");
}

/** The menu's button of the arrangement `choice`. */
function choice(page: Page, choice: "free" | "vertical" | "horizontal" | "matrix"): Locator {
  return page.getByTestId(`arrange-${choice}`);
}

/** Choose `which` in the open menu: one command more, which is returned. */
async function choose(
  page: Page,
  which: "free" | "vertical" | "horizontal" | "matrix",
): Promise<unknown> {
  const before = await entriesLength(page);
  await choice(page, which).click();
  await expect.poll(() => entriesLength(page)).toBe(before + 1);
  await expect(choice(page, which)).toHaveAttribute("aria-pressed", "true");
  return newestCommand(page);
}

/** The block's arrangement as the store holds it; `null` without one. */
function storedArrangement(page: Page, block: string): Promise<unknown> {
  return page.evaluate((id) => {
    const found = window.__tilie.store().view.blocks[id];
    if (found === undefined) throw new Error(`block ${id} is missing`);
    return found.arrangement === undefined ? null : JSON.parse(JSON.stringify(found.arrangement));
  }, block);
}

/** The `set` of block `block`'s arrangement. */
function arrangementSet(block: string, arrangement: unknown) {
  return { type: "set", changes: [{ target: { block }, values: { arrangement } }] };
}

/** The frame `group`'s drawn `x` and `y`, as the writer prints them (its rectangle after its shadow). */
function frameAt(page: Page, block: string, group: string): Promise<(string | null)[]> {
  return element(page, block, idAddress(group))
    .last()
    .evaluate((drawn) => ["x", "y"].map((name) => drawn.getAttribute(name)));
}

/** The drawn `x` and `y` of each of `groups`' frames, in that order. */
function framesAt(page: Page, block: string, groups: readonly string[]): Promise<unknown> {
  return Promise.all(groups.map((group) => frameAt(page, block, group)));
}

/** The groups behind which the root's ancestor cards are recorded, in record order. */
async function cardsBehind(page: Page, block: string): Promise<string[]> {
  return (await boxesOf(page, block)).flatMap(({ kind, key }) =>
    kind === "card" && key?.member === ROOT ? [key.item] : [],
  );
}

/** The frames' tops one under another in the drawing order (README). */
const TOPS = [88.52734375, 268.08984375, 447.65234375, 675.19140625];

/** The frames side by side, in row order (README): `x`, `y` as the writer prints them. */
const SIDE_BY_SIDE = [179.890625, 850.6943359375, 1521.498046875, 2192.3017578125].map((x) => [
  attributeText(x),
  attributeText(48.57421875),
]);

/** Expect block `block`'s frames to lie one under another, `groups` at `tops`. */
async function expectUnderOneAnother(
  page: Page,
  block: string,
  groups: readonly string[],
  tops: readonly number[],
): Promise<void> {
  await expect
    .poll(async () => {
      const frames = (await framesAt(page, block, groups)) as (string | null)[][];
      return [new Set(frames.map(([x]) => x)).size, frames.map(([, y]) => y)];
    })
    .toEqual([1, tops.map(attributeText)]);
  expect(await cardsBehind(page, block)).toEqual(groups);
  await expect(element(page, block, cardAddress(ROOT))).toHaveCount(8);
}

/** Expect block `block`'s frames side by side in the row, `clt_1` drawn once behind them. */
async function expectSideBySide(page: Page, block: string): Promise<void> {
  await expect.poll(() => framesAt(page, block, GROUPS)).toEqual(SIDE_BY_SIDE);
  expect(await cardsBehind(page, block)).toEqual(["group_1"]);
  await expect(element(page, block, cardAddress(ROOT))).toHaveCount(2);
}

/** Block `block`'s node transform, as the browser holds it in its style. */
function nodeTransform(page: Page, block: string): Promise<string> {
  return node(page, block).evaluate((item) => (item as HTMLElement).style.transform);
}

/**
 * The transform placing a node at `(x, y)`, as this browser writes it: each
 * engine prints a length to its own precision, so a node's transform is
 * compared with the engine's own spelling of the exact position.
 */
function placedAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([left, top]) => {
      const probe = document.createElement("div");
      probe.style.transform = `translate(${left}px, ${top}px)`;
      return probe.style.transform;
    },
    [x, y],
  );
}

/** The stated `x` and `y` of every block of `blocks`. */
function places(page: Page, blocks: readonly string[]): Promise<number[][]> {
  return Promise.all(
    blocks.map(async (block) => {
      const { x, y } = await placement(page, block);
      return [x, y];
    }),
  );
}

test("a bundle's items are put side by side and back through the Arrange menu", async ({
  page,
}) => {
  const block = await inBundleEditor(page, "bundles/bundle_elided_layerit");
  const { x, y } = await placement(page, block);
  const menu = await arrangeMenu(page);
  await expect(menu.getByRole("toolbar").getByRole("button")).toHaveText([
    "Free",
    "Vertical",
    "Horizontal",
  ]);
  await expect(choice(page, "matrix")).toHaveCount(0);
  await expect(choice(page, "free")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "horizontal")).toBeEnabled();
  await expectUnderOneAnother(page, block, GROUPS, TOPS);

  const sideBySide = { direction: "horizontal", order: [...GROUPS] };
  expect(await choose(page, "horizontal")).toEqual(arrangementSet(block, sideBySide));
  expect(await storedArrangement(page, block)).toEqual(sideBySide);
  await expect(choice(page, "free")).toHaveAttribute("aria-pressed", "false");
  await expectSideBySide(page, block);
  expect(await nodeTransform(page, block)).toBe(await placedAt(page, x, y));
  expect(await places(page, [block])).toEqual([[x, y]]);

  expect(await choose(page, "free")).toEqual(arrangementSet(block, null));
  expect(await storedArrangement(page, block)).toBeNull();
  await expectUnderOneAnother(page, block, GROUPS, TOPS);
  expect(await places(page, [block])).toEqual([[x, y]]);
});

test("arranged items are reordered by a drag and by a key, and side by side stores the row", async ({
  page,
}) => {
  const block = await inBundleEditor(page, "bundles/bundle_elided_layerit");
  await arrangeMenu(page);
  expect(await choose(page, "vertical")).toEqual(
    arrangementSet(block, { direction: "vertical", order: [...GROUPS] }),
  );
  await expectUnderOneAnother(page, block, GROUPS, TOPS);

  // The node's top left corner at (40, 40), zoom 1: a drawing ordinate is a screen pixel.
  await nodeAt(page, block, 40, 40);
  const top = (await node(page, block).boundingBox())?.y;
  if (top === undefined) throw new Error("the block is not displayed");
  const from = await framePoint(page, block, idAddress("group_1"));
  const before = await entriesLength(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, top + 440, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => entriesLength(page)).toBe(before + 1);
  const dragged = ["group_2", "group_1", "group_3", "group_4"];
  expect(await newestCommand(page)).toEqual(
    arrangementSet(block, { direction: "vertical", order: dragged }),
  );
  expect(await selection(page)).toEqual([{ block, id: "group_1" }]);
  await expectUnderOneAnother(page, block, dragged, TOPS);

  await arranger(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => entriesLength(page)).toBe(before + 2);
  const stepped = ["group_2", "group_3", "group_1", "group_4"];
  expect(await newestCommand(page)).toEqual(
    arrangementSet(block, { direction: "vertical", order: stepped }),
  );
  await expectUnderOneAnother(
    page,
    block,
    stepped,
    [88.52734375, 268.08984375, 495.62890625, 675.19140625],
  );

  expect(await choose(page, "horizontal")).toEqual(
    arrangementSet(block, { direction: "horizontal", order: stepped }),
  );
  expect(await storedArrangement(page, block)).toEqual({
    direction: "horizontal",
    order: [...GROUPS],
  });
  await expectSideBySide(page, block);
});

test("side by side is refused with its reason where two stretches overlap", async ({ page }) => {
  await inBundleEditor(page, "bundles/bundle_arranged_conflict");
  const before = await entriesLength(page);
  const menu = await arrangeMenu(page);
  const reason = 'Horizontal: "Theme A" and "Theme B" overlap on "Score" (8–16 ♩)';
  await expect(choice(page, "horizontal")).toBeDisabled();
  await expect(choice(page, "horizontal")).toHaveAttribute("title", reason);
  await expect(menu.getByTestId("arrange-refused")).toHaveText(reason);
  await expect(choice(page, "free")).toBeEnabled();
  await expect(choice(page, "free")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "vertical")).toBeEnabled();
  expect(await entriesLength(page)).toBe(before);
});

/** `small`'s blocks in index order. */
const BLOCKS = [SMALL.bare, SMALL.nested, SMALL.map, SMALL.flow, SMALL.styled];

/** Expect every block of `BLOCKS` to lie at its node position of `at`, in that order. */
async function expectNodesAt(page: Page, at: readonly (readonly [number, number])[]) {
  const expected = await Promise.all(at.map(([x, y]) => placedAt(page, x, y)));
  await expect
    .poll(() => Promise.all(BLOCKS.map((block) => nodeTransform(page, block))))
    .toEqual(expected);
}

/** The stated places of `small`'s blocks (the fixture's table). */
const STATED: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 160],
  [0, 320],
  [640, 0],
  [640, 160],
];

test("the canvas's blocks are packed in a matrix and placed freely again", async ({ page }) => {
  await open(page, "small");
  await setViewport(page, { x: 40, y: 40, zoom: 1 });
  const menu = await arrangeMenu(page);
  await expect(menu.getByRole("toolbar").getByRole("button")).toHaveText([
    "Free",
    "Vertical",
    "Horizontal",
    "Matrix",
  ]);
  await expect(choice(page, "free")).toHaveAttribute("aria-pressed", "true");
  await expectNodesAt(page, STATED);

  const workspace = (arrangement: unknown) => ({
    type: "set",
    changes: [{ target: {}, values: { arrangement } }],
  });
  expect(await choose(page, "matrix")).toEqual(workspace({ direction: "matrix", columns: 3 }));
  await expect(menu.getByTestId("arrange-columns")).toHaveText("Columns 3");
  await expectNodesAt(page, [
    [0, 0],
    [550.256591796875, 0],
    [1110.336669921875, 0],
    [0, 127.9765625],
    [550.256591796875, 127.9765625],
  ]);

  const before = await entriesLength(page);
  await menu.getByTestId("arrange-columns-fewer").click();
  await expect.poll(() => entriesLength(page)).toBe(before + 1);
  expect(await newestCommand(page)).toEqual(workspace({ direction: "matrix", columns: 2 }));
  await expect(menu.getByTestId("arrange-columns")).toHaveText("Columns 2");
  await expectNodesAt(page, [
    [0, 0],
    [560.080078125, 0],
    [0, 127.9765625],
    [560.080078125, 127.9765625],
    [0, 282.78515625],
  ]);
  expect(await places(page, BLOCKS)).toEqual(STATED);

  expect(await choose(page, "free")).toEqual(workspace(null));
  await expectNodesAt(page, STATED);
  expect(await places(page, BLOCKS)).toEqual(STATED);
});
