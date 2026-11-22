/**
 * Ancestor cards (TimeToShare's drawing specification, section 8.8): a root
 * is drawn whole behind the frame of its member's group by default, beyond
 * the frame's borders; the Properties button "Hide parent timelines",
 * offered for the root and for its grouped child alike, hides it with one
 * style entry and "Show parent timelines" draws it again; a double-click on it opens the root's timeline editor and raises
 * it over the frame, unfolding it out of the member card and folding it back on Done, at once under
 * reduced motion; Show coordinates reads the card where it is seen and an
 * ancestor line as its ancestor's. The expected values are derived in
 * `README.md` ("ancestor-cards.spec.ts").
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf, nodePosition } from "../packages/arranger/src/drawing.ts";
import type { ElementAddress } from "../packages/core/src/index.ts";
import { cardAddress, idAddress, isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import { lineAxes } from "../packages/layout/src/axes.ts";
import { attributeText } from "../packages/writers/src/svg.ts";
import { FONT_METRICS, manifestFixture } from "./schema.ts";
import {
  addressSelector,
  done,
  editing,
  element,
  enter,
  framePoint,
  journalLength,
  newestCommand,
  node,
  pick,
  placement,
  select,
  setViewport,
  toScreen,
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

/** Block `block`'s node transform, as the browser holds it in its style. */
function nodeTransform(page: Page, block: string): Promise<string> {
  return node(page, block).evaluate((item) => (item as HTMLElement).style.transform);
}

/**
 * The transform placing a node at `(x, y)`, as this browser writes it: each
 * engine prints a length to its own precision (Chromium and Firefox to six
 * significant digits, WebKit to six decimals), so the node's transform is
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

/** The frame and the member cards without the ancestor card, as the writer prints them. */
const HELD = [
  ["8", "8", "543.7036", "177.5391"],
  ["16", "32.8047", "527.7036", "87.3555"],
  ["16", "128.1602", "527.7036", "49.3789"],
];

/** The same boxes with the ancestor card drawn: moved right in the drawing by the origin shift. */
const HELD_BESIDE_CARD = [
  ["156.6318", "8", "543.7036", "177.5391"],
  ["164.6318", "32.8047", "527.7036", "87.3555"],
  ["164.6318", "128.1602", "527.7036", "49.3789"],
];

/** The card's attributes (layout's README, "Ancestor cards", case 2). */
const CARD = ["8", "36.207", "869.3354", "63.3789"];

/** The shift of the block's place origin while the card is drawn (layout's README). */
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

/** The style command the button sends for `piece`'s card in block `block`. */
function cardCommand(block: string, display: "none" | null) {
  return {
    type: "style",
    select: { element: "ancestor_card", addresses: [{ id: "piece", part: ["card"] }] },
    set: { display },
    blocks: [block],
  };
}

/** The button's title, naming the root. */
const TITLE = "The card of 'Piece' behind the frames of its members' groups";

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

/**
 * Open the editor, import `group_parent_both` and place the block's place
 * origin at (240, 80) on the pane, zoom 1; the block's ID and place.
 */
async function imported(page: Page): Promise<{ block: string; x: number; y: number }> {
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
  return { block, x: place.x, y: place.y };
}

test("an ancestor card is drawn by default, hidden from its root and shown from its child", async ({
  page,
}) => {
  const { block, x, y } = await imported(page);
  await expect(element(page, block, PIECE_CARD)).toHaveCount(2);
  expect(await attributes(box(page, block, PIECE_CARD))).toEqual(CARD);
  expect(await heldBoxes(page, block)).toEqual(HELD_BESIDE_CARD);
  expect(await nodeTransform(page, block)).toBe(await placedAt(page, x - SHIFT, y));
  expect(await cardAfterFrame(page, block)).toBe(false);

  await select(page, [{ block, id: "piece" }]);
  await page.getByRole("button", { name: "Open inspector" }).click();
  await page.getByRole("tab", { name: "Properties", exact: true }).click();
  const button = page.getByTestId("ancestor-card");
  await expect(button).toHaveText("Hide parent timelines");
  await expect(button).toHaveAttribute("title", TITLE);
  await expect(button).not.toHaveAttribute("aria-disabled", "true");

  await button.click();
  await expect.poll(() => journalLength(page)).toBe(2);
  expect(await newestCommand(page)).toEqual(cardCommand(block, "none"));
  await expect(element(page, block, PIECE_CARD)).toHaveCount(0);
  expect(await heldBoxes(page, block)).toEqual(HELD);
  expect(await nodeTransform(page, block)).toBe(await placedAt(page, x, y));
  const kept = await placement(page, block);
  expect([kept.x, kept.y]).toEqual([x, y]);

  await expect(button).toHaveText("Show parent timelines");
  await expect(button).not.toHaveAttribute("aria-disabled", "true");

  await select(page, [{ block, id: "middle" }]);
  await expect(button).toHaveText("Show parent timelines");
  await expect(button).toHaveAttribute("title", TITLE);
  await button.click();
  await expect.poll(() => journalLength(page)).toBe(3);
  expect(await newestCommand(page)).toEqual(cardCommand(block, null));
  await expect(element(page, block, PIECE_CARD)).toHaveCount(2);
  expect(await attributes(box(page, block, PIECE_CARD))).toEqual(CARD);
  expect(await heldBoxes(page, block)).toEqual(HELD_BESIDE_CARD);
  expect(await nodeTransform(page, block)).toBe(await placedAt(page, x - SHIFT, y));
  await expect(button).toHaveText("Hide parent timelines");
});

test("a double-click on an ancestor card opens its root's editor and raises it", async ({
  page,
}) => {
  const { block } = await imported(page);
  const visible = await framePoint(page, block, PIECE_CARD);
  await page.mouse.dblclick(visible.x, visible.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: "piece" }, kind: "timeline" }]);
  await expect.poll(() => cardAfterFrame(page, block)).toBe(true);
  await done(page);
  await expect.poll(() => cardAfterFrame(page, block)).toBe(false);
});

/** What the page shows of a raised card's layer, recorded on every change of block `block`'s node. */
interface Shown {
  /** Whether a change found the layer moving (`data-unfolding`). */
  moved: boolean;
  /** The `transform` of `middle`'s line in the layer when the layer first appeared. */
  first: string | null;
}

/** Record what the raised layer of block `block` shows from now on; read it with `.evaluate`. */
function recordRaise(page: Page, block: string) {
  const line = `g.tilie-raised line${addressSelector(idAddress("middle"))}`;
  return node(page, block).evaluateHandle((held, selector): Shown => {
    const shown: Shown = { moved: false, first: null };
    let present = false;
    new MutationObserver(() => {
      const layer = held.querySelector("g.tilie-raised");
      if (layer?.hasAttribute("data-unfolding")) shown.moved = true;
      if (layer !== null && !present)
        shown.first = held.querySelector(selector)?.getAttribute("transform") ?? null;
      present = layer !== null;
    }).observe(held, { subtree: true, childList: true, attributes: true });
    return shown;
  }, line);
}

test("the raised card unfolds out of the member card and folds back into it", async ({ page }) => {
  const { block } = await imported(page);
  const workspace = readWorkspace(await page.evaluate(() => window.__tilie.text()));
  if (isLoadError(workspace)) throw new Error("the page's workspace is refused");
  const drawn = workspace.view.blocks[block];
  if (drawn === undefined) throw new Error(`block ${block} is missing`);
  const axes = [...lineAxes(drawingOf(drawn, workspace.view.graphical, FONT_METRICS)).values()];
  const middleIn = (card: boolean) =>
    axes.find(
      (axis) =>
        axis.timeline === "middle" &&
        (card ? axis.ancestor !== undefined : axis.card.member === "middle"),
    )?.y ?? Number.NaN;
  const shift = middleIn(false) - middleIn(true);
  const layer = node(page, block).locator("g.tilie-raised");
  const raisedMiddle = layer.locator(`line${addressSelector(idAddress("middle"))}`);

  // At rest on the arranger: no raised layer, the card behind the frame.
  await expect(layer).toHaveCount(0);
  expect(await cardAfterFrame(page, block)).toBe(false);

  const opening = await recordRaise(page, block);
  const visible = await framePoint(page, block, PIECE_CARD);
  await page.mouse.dblclick(visible.x, visible.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: "piece" }, kind: "timeline" }]);
  // At rest in the editor: the card raised in its own layer, unclipped, nothing shifted.
  await expect(layer).toHaveCount(1);
  await expect(layer).not.toHaveAttribute("data-unfolding");
  await expect(layer).not.toHaveAttribute("clip-path");
  await expect(node(page, block).locator("clipPath")).toHaveCount(0);
  await expect(layer.locator("[transform]")).toHaveCount(0);
  await expect(raisedMiddle).toHaveAttribute("y1", attributeText(middleIn(true)));
  expect(await cardAfterFrame(page, block)).toBe(true);
  // It started on the member card's row of `middle` and moved.
  const opened = await opening.evaluate((shown) => ({ ...shown }));
  expect(opened).toEqual({ moved: true, first: `translate(0 ${attributeText(shift)})` });

  const closing = await recordRaise(page, block);
  await done(page);
  // At rest on the arranger again: the layer gone, the card behind the frame.
  await expect(layer).toHaveCount(0);
  expect(await cardAfterFrame(page, block)).toBe(false);
  expect((await closing.evaluate((shown) => ({ ...shown }))).moved).toBe(true);
});

test("the raised card switches at once under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { block } = await imported(page);
  const layer = node(page, block).locator("g.tilie-raised");
  const opening = await recordRaise(page, block);
  const visible = await framePoint(page, block, PIECE_CARD);
  await page.mouse.dblclick(visible.x, visible.y);
  await expect(layer).toHaveCount(1);
  await expect(layer).not.toHaveAttribute("data-unfolding");
  expect(await opening.evaluate((shown) => ({ ...shown }))).toEqual({ moved: false, first: null });
  const closing = await recordRaise(page, block);
  await done(page);
  await expect(layer).toHaveCount(0);
  expect((await closing.evaluate((shown) => ({ ...shown }))).moved).toBe(false);
});

test("Show coordinates reads the card where it is seen and an ancestor line as its ancestor's", async ({
  page,
}) => {
  const { block } = await imported(page);
  const workspace = readWorkspace(await page.evaluate(() => window.__tilie.text()));
  if (isLoadError(workspace)) throw new Error("the page's workspace is refused");
  const drawn = workspace.view.blocks[block];
  if (drawn === undefined) throw new Error(`block ${block} is missing`);
  const drawing = drawingOf(drawn, workspace.view.graphical, FONT_METRICS);
  const origin = nodePosition(drawn, drawing);
  const axes = [...lineAxes(drawing).values()];
  /** The line of `timeline` in the ancestor card (`card`) or in `middle`'s member card. */
  const line = (timeline: string, card: boolean) => {
    const found = axes.find(
      (axis) =>
        axis.timeline === timeline &&
        (card
          ? axis.ancestor !== undefined
          : axis.ancestor === undefined && axis.card.member === "middle"),
    );
    if (found === undefined) throw new Error(`no line of ${timeline}`);
    return found;
  };
  const cardPiece = line("piece", true);
  const cardMiddle = line("middle", true);
  const ancestorPiece = line("piece", false);
  expect([cardPiece.y, cardPiece.xStart, cardPiece.xEnd]).toEqual([
    85.18359375, 60.33544921875, 860.33544921875,
  ]);
  expect(cardMiddle.y).toBe(51.20703125);
  expect([ancestorPiece.y, ancestorPiece.xStart]).toEqual([85.18359375, 260.33544921875]);

  const view = await page.evaluate(() => window.__tilie.viewport());
  const start = await toScreen(page, origin.x + cardPiece.xStart, origin.y + cardPiece.y);
  const measured = { ...view, x: view.x + Math.ceil(start.x) - start.x };
  await setViewport(page, measured);
  /** Hover the drawing point `cardPiece.xStart + dx`, `y`, the ordinate on a whole pixel. */
  const hover = async (dx: number, y: number) => {
    const point = await toScreen(page, origin.x + cardPiece.xStart + dx, origin.y + y);
    if (!Number.isInteger(point.x)) throw new Error(`${dx} lies at ${point.x}, off a whole pixel`);
    await page.mouse.move(point.x, Math.round(point.y));
  };
  const flag = page.getByTestId("coordinate-flag");
  const parts = () =>
    flag
      .locator("[data-timeline]")
      .evaluateAll((found) => found.map((part) => part.getAttribute("data-timeline")));
  /** `timeline`'s coordinate row in the flag. */
  const row = (timeline: string) =>
    flag.locator(`[data-timeline="${timeline}"] .tilie-coordinates-row:not([data-map])`);
  const head = (timeline: string) =>
    flag.locator(`[data-timeline="${timeline}"] .tilie-coordinates-head`);

  await page.getByRole("button", { name: "Show coordinates" }).click();
  await expect(page.getByTestId("coordinates")).toHaveAttribute("aria-pressed", "true");

  // Beyond the frame's borders the card's line is read: `piece` alone, under the root's name.
  for (const [dx, value] of [
    [50, "1 ♩"],
    [700, "14 ♩"],
  ] as const) {
    await hover(dx, cardPiece.y);
    await expect(head("piece")).toHaveText("Piece");
    await expect(row("piece").getByTestId("coordinate")).toHaveText(value);
    await expect(row("piece")).toHaveAttribute("data-hovered", "true");
    expect(await parts()).toEqual(["piece"]);
  }

  // Inside `middle`'s card the ancestor line of `piece` is read as `piece`'s: its row is hovered,
  // below `middle`'s, as the ancestor line lies below `middle`'s line.
  await hover(400, ancestorPiece.y);
  await expect.poll(parts).toEqual(["middle", "piece"]);
  await expect(row("piece").getByTestId("coordinate")).toHaveText("8 ♩");
  await expect(row("piece")).toHaveAttribute("data-hovered", "true");
  await expect(row("middle").getByTestId("coordinate")).toHaveText("4 ♩");
  await expect(row("middle")).toHaveAttribute("data-hovered", "false");

  // The card's `middle` row inside the frame is covered by the frame: not it, but `middle`'s own
  // line 4 above it is read, with its group.
  await hover(400, cardMiddle.y);
  await expect.poll(parts).toEqual(["middle", "piece", "recording"]);
  await expect(row("middle")).toHaveAttribute("data-hovered", "true");
  await expect(row("middle").getByTestId("coordinate")).toHaveText("4 ♩");

  // Raised by `piece`'s timeline editor, the card is read inside the frame too.
  await enter(page, { block, id: "piece" }, measured);
  await expect.poll(() => cardAfterFrame(page, block)).toBe(true);
  await hover(400, cardMiddle.y);
  await expect.poll(parts).toEqual(["middle", "piece"]);
  await expect(row("middle").getByTestId("coordinate")).toHaveText("4 ♩");
  await expect(row("middle")).toHaveAttribute("data-hovered", "true");
  await expect(row("piece").getByTestId("coordinate")).toHaveText("8 ♩");
  await expect(head("piece")).toHaveText("Piece");

  await hover(400, cardPiece.y);
  await expect.poll(parts).toEqual(["middle", "piece"]);
  await expect(row("piece")).toHaveAttribute("data-hovered", "true");
  await expect(row("piece").getByTestId("coordinate")).toHaveText("8 ♩");
  await expect(row("middle").getByTestId("coordinate")).toHaveText("4 ♩");
});
