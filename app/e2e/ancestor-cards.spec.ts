/**
 * Ancestor cards (TimeToShare's drawing specification, section 8.8) and
 * elisions (section 8.9) in the browser: a root is drawn whole behind the
 * frame of its member's group by default, beyond the frame's borders; the
 * root's block of the Elisions tab, a timeline's block offered for the root
 * and for its grouped child alike and opened by its heading, hides its
 * cards by its checkbox and draws them again, switches to Full and back
 * by the arrow keys, stores the drawn defaults by Custom, adds an elision
 * and removes them all; a selected stored elision opens its blocks, shows
 * its gap's handles and mode menu and moves its end by one keyboard step; a
 * group's block switches its frame's elisions off and on, adds an
 * elision and removes them all; a double-click on an
 * ancestor card opens the root's timeline editor and raises the card over
 * the frame, unfolding it out of the member card and folding it back on
 * Done, at once under reduced motion; Show coordinates reads the card where
 * it is seen and an ancestor line as its ancestor's. The expected values
 * are derived in `README.md` ("ancestor-cards.spec.ts").
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf, nodePosition } from "../packages/arranger/src/drawing.ts";
import type { ElementAddress } from "../packages/core/src/index.ts";
import { cardAddress, idAddress, isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import { lineAxes } from "../packages/layout/src/axes.ts";
import { attributeText } from "../packages/writers/src/svg.ts";
import { FONT_METRICS } from "./schema.ts";
import {
  addressSelector,
  arranger,
  dispatch,
  done,
  editing,
  element,
  enter,
  framePoint,
  importFixture,
  journalLength,
  newestCommand,
  newestMinted,
  node,
  nodeTransform,
  pane,
  placedAt,
  placement,
  select,
  setViewport,
  toScreen,
  viewportOf,
} from "./support.ts";

const PIECE_CARD = cardAddress("piece");
const FRAME = idAddress("group_1");

/** A drawn box's rectangle: its last part, the card itself after its shadow. */
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

/** The frame and the member cards without the ancestor card, as the writer prints them. */
const HELD = [
  ["8", "8", "543.7036", "157.5625"],
  ["16", "32.8047", "527.7036", "67.3789"],
  ["16", "108.1836", "527.7036", "49.3789"],
];

/** The same boxes with the ancestor card drawn: moved right in the drawing by the origin shift. */
const HELD_BESIDE_CARD = [
  ["260.3354", "8", "543.7036", "157.5625"],
  ["268.3354", "32.8047", "527.7036", "67.3789"],
  ["268.3354", "108.1836", "527.7036", "49.3789"],
];

/** The card's attributes (layout's README, "Ancestor cards", case 2). */
const CARD = ["8", "36.207", "1013.0391", "63.3789"];

/** The shift of the block's place origin while the card is drawn (layout's README). */
const SHIFT = 252.33544921875;

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

/** The style command of `piece`'s root rule (every card of `piece`) in block `block`. */
function rootRule(block: string, set: { readonly [property: string]: unknown }) {
  return {
    type: "style",
    select: { addresses: [{ id: "piece", part: ["card"] }] },
    set,
    blocks: [block],
  };
}

/** The root's block's title, naming the root. */
const TITLE = 'Parent timeline "Piece"';

/** The modes of a root's block. */
type Mode = "Full" | "Proportional" | "Custom";

/** The radio of the mode `word` in the root's block. */
function mode(page: Page, word: Mode): Locator {
  return page.getByTestId("elisions").getByRole("radio", { name: word, exact: true });
}

/** The checkbox `label` in the block `section` (its test ID). */
function checkbox(page: Page, label: string, section: string): Locator {
  return page.getByTestId(section).getByRole("checkbox", { name: label, exact: true });
}

/** The root's checkbox drawing its ancestor cards. */
const shownBox = (page: Page) => checkbox(page, "Draw behind its groups", "elisions");

/** The title of the block `section`, in its heading after the kind word. */
function titleOf(page: Page, section: string): Locator {
  return page.getByTestId(section).locator("h3 .title");
}

/** Open the inspector's Elisions tab. */
async function elisionsTab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open inspector" }).click();
  await page.getByRole("tab", { name: "Elisions", exact: true }).click();
}

/** Open the block `section`, collapsed at first, by its heading's disclosure button. */
async function expand(page: Page, section: string): Promise<void> {
  const button = page.getByTestId(`${section}-expand`);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
}

/**
 * The page is wide enough that the canvas left of the open drawer exceeds
 * 1112 pixels, from which width on the automatic proportion of
 * `group_elided_inside`'s card no longer depends on the view (README).
 */
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

/**
 * Import `group_parent_both` and place the block's place origin at (240,
 * 80) on the pane, zoom 1; the block's ID and place.
 */
async function imported(page: Page): Promise<{ block: string; x: number; y: number }> {
  const block = await importFixture(page, "groups/group_parent_both");
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
  await elisionsTab(page);
  await expect(page.getByTestId("elisions-expand")).toHaveAccessibleName(
    `Timeline ${TITLE} Custom, 0 elisions`,
  );
  await expand(page, "elisions");
  await expect(titleOf(page, "elisions")).toHaveText(TITLE);
  await expect(mode(page, "Custom")).toBeChecked();
  await expect(shownBox(page)).toBeChecked();
  await expect(shownBox(page)).toBeEnabled();

  await shownBox(page).click();
  await expect.poll(() => journalLength(page)).toBe(2);
  expect(await newestCommand(page)).toEqual(rootRule(block, { display: "none" }));
  await expect(element(page, block, PIECE_CARD)).toHaveCount(0);
  expect(await heldBoxes(page, block)).toEqual(HELD);
  expect(await nodeTransform(page, block)).toBe(await placedAt(page, x, y));
  const kept = await placement(page, block);
  expect([kept.x, kept.y]).toEqual([x, y]);
  await expect(shownBox(page)).not.toBeChecked();
  await expect(page.getByTestId("elisions").getByRole("radio")).toHaveCount(0);

  await select(page, [{ block, id: "middle" }]);
  await expect(titleOf(page, "elisions")).toHaveText(TITLE);
  await expect(shownBox(page)).not.toBeChecked();
  await shownBox(page).click();
  await expect.poll(() => journalLength(page)).toBe(3);
  expect(await newestCommand(page)).toEqual(rootRule(block, { display: null }));
  await expect(element(page, block, PIECE_CARD)).toHaveCount(2);
  expect(await attributes(box(page, block, PIECE_CARD))).toEqual(CARD);
  expect(await heldBoxes(page, block)).toEqual(HELD_BESIDE_CARD);
  expect(await nodeTransform(page, block)).toBe(await placedAt(page, x - SHIFT, y));
  await expect(mode(page, "Custom")).toBeChecked();
});

/** The stored elisions of block `block`, as the store holds them. */
function storedElisions(page: Page, block: string): Promise<unknown> {
  return page.evaluate(
    (id) =>
      JSON.parse(
        JSON.stringify(window.__tilie.store().view.blocks[id]?.manifest.graphical?.elisions ?? []),
      ),
    block,
  );
}

/**
 * The ellipsis of the default elision of `second`, which `group_elided_inside`'s
 * card derives: its gap draws nothing itself (no fill, no continuation), its
 * one ellipsis three dots.
 */
const SECOND = { id: "second", part: ["elision", "ellipsis"] } as ElementAddress;

/** The rows of a section's list of elisions, each its name, timeline and stretch. */
function rowsOf(section: Locator): Promise<(string | null)[][]> {
  return section
    .locator("button.row")
    .evaluateAll((rows) =>
      rows.map((row) => [...row.querySelectorAll("span")].map((span) => span.textContent)),
    );
}

/** The canvas's width must exceed 1112 pixels for the automatic proportion to be 1/7 (README). */
const WIDE_CANVAS = 1112;

/**
 * Import `group_elided_inside`, give its ancestor cards the mode `auto` (one
 * `style`, the journal's second entry; the initial `custom` derives no
 * elision), select `excerpt`, open the Elisions tab and the root's block,
 * the canvas checked to be wide enough with the drawer open; the block's ID.
 */
async function elidedInside(page: Page): Promise<string> {
  const block = await importFixture(page, "groups/group_elided_inside");
  expect(
    await dispatch(page, {
      type: "style",
      select: { element: "ancestor_card" },
      set: { "elision-mode": "auto" },
      blocks: [block],
    }),
  ).toBeNull();
  expect(await journalLength(page)).toBe(2);
  await select(page, [{ block, id: "excerpt" }]);
  await elisionsTab(page);
  expect(await arranger(page).evaluate((canvas) => canvas.clientWidth)).toBeGreaterThan(
    WIDE_CANVAS,
  );
  await expand(page, "elisions");
  await expect(titleOf(page, "elisions")).toHaveText(TITLE);
  await expect(mode(page, "Proportional")).toBeChecked();
  return block;
}

/** The defaults of `group_elided_inside`'s card as Custom stores them, in drawing order. */
const STORED_DEFAULTS = [
  { timeline: "first", start: [0, 1], end: [8, 1], width: { canvas: 57.14285714285714 } },
  { timeline: "first", start: [16, 1], end: [32, 1], width: { canvas: 114.28571428571428 } },
  { timeline: "second", start: [1, 1], end: [31, 1], width: { canvas: 128.57142857142856 } },
].map((elision) => ({ ...elision, display: ["ellipsis", "name"] }));

/**
 * Choose Custom on `group_elided_inside`'s root: the drawn defaults stored,
 * one entry; the IDs the store gave them, in their order.
 */
async function storeDefaults(page: Page, block: string): Promise<string[]> {
  const before = await journalLength(page);
  await mode(page, "Custom").click();
  await expect.poll(() => journalLength(page)).toBe(before + 1);
  const { command, ids } = await newestMinted(page);
  expect([command, ids.length]).toEqual([
    { type: "add", into: { block }, elision: STORED_DEFAULTS },
    STORED_DEFAULTS.length,
  ]);
  await expect(mode(page, "Custom")).toBeChecked();
  return ids;
}

test("the root's elisions switch to Full and back by the arrow keys", async ({ page }) => {
  const block = await elidedInside(page);
  await expect(element(page, block, SECOND)).toHaveCount(3);

  await mode(page, "Full").click();
  await expect.poll(() => journalLength(page)).toBe(3);
  expect(await newestCommand(page)).toEqual(rootRule(block, { "elision-mode": "full" }));
  await expect(element(page, block, SECOND)).toHaveCount(0);
  await expect(mode(page, "Full")).toBeChecked();

  // The arrow keys move between the options, choosing each as a click does.
  await mode(page, "Full").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => journalLength(page)).toBe(4);
  expect(await newestCommand(page)).toEqual(rootRule(block, { "elision-mode": "proportional" }));
  await expect(mode(page, "Proportional")).toBeChecked();
  await expect(element(page, block, SECOND)).toHaveCount(3);
});

test("Custom stores the drawn defaults, Add elision adds one and Remove all removes them", async ({
  page,
}) => {
  const block = await elidedInside(page);
  const section = page.getByTestId("elisions");
  const [first0, first16, second1] = await storeDefaults(page, block);
  await expect(section.locator(".count")).toHaveText("3 elisions");
  expect(await rowsOf(section)).toEqual([
    ["—", "First", "0–8 ♩"],
    ["—", "First", "16–32 ♩"],
    ["—", "Second", "1–31 ♩"],
  ]);
  // The card now draws the stored elision in the default's place.
  await expect(element(page, block, SECOND)).toHaveCount(0);
  await expect(
    element(page, block, { id: second1, part: ["ellipsis"] } as ElementAddress),
  ).toHaveCount(3);

  await section.getByRole("button", { name: "Add elision" }).click();
  await expect.poll(() => journalLength(page)).toBe(4);
  const added = await newestMinted(page);
  expect([added.command, added.ids.length]).toEqual([
    { type: "add", into: { block, id: "piece" }, elision: { start: [32, 1], end: [48, 1] } },
    1,
  ]);
  const [first32] = added.ids;
  await expect(section.locator(".count")).toHaveText("4 elisions");

  await section.getByRole("button", { name: "Remove all" }).click();
  await expect.poll(() => journalLength(page)).toBe(5);
  expect(await newestCommand(page)).toEqual({
    type: "remove",
    // In canonical order: by timeline, then start.
    targets: [first0, first16, first32, second1].map((id) => ({ block, id })),
  });
  expect(await storedElisions(page, block)).toEqual([]);
  await expect(mode(page, "Proportional")).toBeChecked();
  await expect(element(page, block, SECOND)).toHaveCount(3);
});

test("a selected elision shows its handles and mode menu, and a key moves its end", async ({
  page,
}) => {
  const block = await elidedInside(page);
  const [, , second1] = await storeDefaults(page, block);
  await page.getByTestId("elisions").locator("button.row", { hasText: "Second" }).click();
  await expect
    .poll(() => page.evaluate(() => [...window.__tilie.selection()]))
    .toEqual([{ block, id: second1 }]);
  // The selected elision's blocks are open without a click: the root's, which holds it, and its own.
  await expect(page.getByTestId("elisions-expand")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("elision-form-expand")).toHaveAttribute("aria-expanded", "true");
  const form = page.getByTestId("elision-form");
  await expect(titleOf(page, "elision-form")).toHaveText('Elision on "Second"');
  await expect(form.locator('input[name="start"]')).toHaveValue("1");
  await expect(form.locator('input[name="end"]')).toHaveValue("31");

  // The gap brought to (400, 400) on the canvas, left of the drawer, so its menu takes clicks.
  const dot = await element(page, block, {
    id: second1,
    part: ["ellipsis"],
  } as ElementAddress)
    .nth(1)
    .boundingBox();
  const canvas = await pane(page).boundingBox();
  if (dot === null || canvas === null) throw new Error("the gap is not displayed");
  const view = await viewportOf(page);
  await setViewport(page, {
    x: view.x + canvas.x + 400 - dot.x,
    y: view.y + canvas.y + 400 - dot.y,
    zoom: view.zoom,
  });

  await expect(page.getByTestId("gap-handle-start")).toHaveCount(1);
  await expect(page.getByTestId("gap-handle-end")).toHaveCount(1);
  const coordinates = page.getByTestId("gap-mode-coordinates");
  const width = page.getByTestId("gap-mode-width");
  await expect(coordinates).toHaveAttribute("aria-pressed", "true");
  await expect(width).toHaveAttribute("aria-pressed", "false");
  await width.click();
  await expect(width).toHaveAttribute("aria-pressed", "true");
  await expect(coordinates).toHaveAttribute("aria-pressed", "true");
  await width.click();
  await expect(width).toHaveAttribute("aria-pressed", "false");
  await expect(coordinates).toHaveAttribute("aria-pressed", "true");

  await arranger(page).focus();
  await page.keyboard.press("]");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => journalLength(page)).toBe(4);
  expect(await newestCommand(page)).toEqual({
    type: "set",
    changes: [{ target: { block, id: second1 }, values: { end: [156, 5] } }],
  });
  const stored = (await storedElisions(page, block)) as { id: string; end: unknown }[];
  expect(stored.find((elision) => elision.id === second1)?.end).toEqual([156, 5]);
});

test("a group's elisions switch off and on, and are added to and removed", async ({ page }) => {
  const block = await importFixture(page, "groups/group_elided_members");
  await select(page, [{ block, id: "group_1" }]);
  await elisionsTab(page);
  const section = page.getByTestId("group-elisions");
  await expect(page.getByTestId("group-elisions-expand")).toHaveAccessibleName(
    'Group Elisions in group "Theme" Custom, 2 elisions',
  );
  await expand(page, "group-elisions");
  await expect(titleOf(page, "group-elisions")).toHaveText('Elisions in group "Theme"');
  await expect(page.getByTestId("elisions")).toHaveCount(0);
  const frameBox = checkbox(page, "Draw the group's elisions", "group-elisions");
  await expect(frameBox).toBeChecked();
  await expect(section.locator(".count")).toHaveText("2 elisions");
  expect(await rowsOf(section)).toEqual([
    ["Development", "Excerpt", "2–8 ♩"],
    ["—", "Phrase", "2–6 ♩"],
  ]);
  // Its ellipsis, three dots across the frame and three in `piece`'s card, which carries the gap.
  const development = { id: "elision_1", part: ["ellipsis"] } as ElementAddress;
  await expect(element(page, block, development)).toHaveCount(6);

  const frameRule = (set: { readonly [property: string]: unknown }) => ({
    type: "style",
    select: { addresses: [{ id: "group_1" }] },
    set,
    blocks: [block],
  });
  await frameBox.click();
  await expect.poll(() => journalLength(page)).toBe(2);
  expect(await newestCommand(page)).toEqual(frameRule({ "elision-mode": "full" }));
  await expect(element(page, block, development)).toHaveCount(0);
  await expect(frameBox).not.toBeChecked();

  await frameBox.click();
  await expect.poll(() => journalLength(page)).toBe(3);
  expect(await newestCommand(page)).toEqual(frameRule({ "elision-mode": null }));
  await expect(element(page, block, development)).toHaveCount(6);

  await section.getByRole("button", { name: "Add elision" }).click();
  await expect.poll(() => journalLength(page)).toBe(4);
  const added = await newestMinted(page);
  expect([added.command, added.ids.length]).toEqual([
    { type: "add", into: { block, id: "excerpt" }, elision: { start: [16, 3], end: [32, 3] } },
    1,
  ]);
  const [excerpt16] = added.ids;
  await expect(section.locator(".count")).toHaveText("3 elisions");

  await section.getByRole("button", { name: "Remove all" }).click();
  await expect.poll(() => journalLength(page)).toBe(5);
  expect(await newestCommand(page)).toEqual({
    type: "remove",
    // In canonical order: by timeline, then start.
    targets: ["elision_1", excerpt16, "elision_2"].map((id) => ({ block, id })),
  });
  await expect(section.locator(".count")).toHaveText("0 elisions");
  expect(await storedElisions(page, block)).toEqual([]);
  await expect(section.getByRole("button", { name: "Remove all" })).toBeDisabled();
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
    85.18359375, 60.33544921875, 260.33544921875,
  ]);
  expect(cardMiddle.y).toBe(51.20703125);
  expect([ancestorPiece.y, ancestorPiece.xStart]).toEqual([85.18359375, 364.0390625]);

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
    [844, "14 ♩"],
  ] as const) {
    await hover(dx, cardPiece.y);
    await expect(head("piece")).toHaveText("Piece");
    await expect(row("piece").getByTestId("coordinate")).toHaveText(value);
    await expect(row("piece")).toHaveAttribute("data-hovered", "true");
    expect(await parts()).toEqual(["piece"]);
  }

  // Inside `middle`'s card the ancestor line of `piece` is read as `piece`'s: its row is hovered,
  // below `middle`'s, as the ancestor line lies below `middle`'s line.
  await hover(504, ancestorPiece.y);
  await expect.poll(parts).toEqual(["middle", "piece"]);
  await expect(row("piece").getByTestId("coordinate")).toHaveText("8 ♩");
  await expect(row("piece")).toHaveAttribute("data-hovered", "true");
  await expect(row("middle").getByTestId("coordinate")).toHaveText("4 ♩");
  await expect(row("middle")).toHaveAttribute("data-hovered", "false");

  // The card's `middle` row inside the frame is covered by the frame: not it, but `middle`'s own
  // line 4 above it is read, with its group.
  await hover(504, cardMiddle.y);
  await expect.poll(parts).toEqual(["middle", "piece", "recording"]);
  await expect(row("middle")).toHaveAttribute("data-hovered", "true");
  await expect(row("middle").getByTestId("coordinate")).toHaveText("4 ♩");

  // Raised by `piece`'s timeline editor, the card is read inside the frame too.
  await enter(page, { block, id: "piece" }, measured);
  await expect.poll(() => cardAfterFrame(page, block)).toBe(true);
  await hover(504, cardMiddle.y);
  await expect.poll(parts).toEqual(["middle", "piece"]);
  await expect(row("middle").getByTestId("coordinate")).toHaveText("4 ♩");
  await expect(row("middle")).toHaveAttribute("data-hovered", "true");
  await expect(row("piece").getByTestId("coordinate")).toHaveText("8 ♩");
  await expect(head("piece")).toHaveText("Piece");

  await hover(504, cardPiece.y);
  await expect.poll(parts).toEqual(["middle", "piece"]);
  await expect(row("piece")).toHaveAttribute("data-hovered", "true");
  await expect(row("piece").getByTestId("coordinate")).toHaveText("8 ♩");
  await expect(row("middle").getByTestId("coordinate")).toHaveText("4 ♩");
});
