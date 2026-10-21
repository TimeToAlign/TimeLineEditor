/**
 * The bands of a timeline as boxes of its timeline editor: hovered and
 * selected there, dragged across its line into a gap and along a side,
 * stepped by Ctrl/Cmd+ArrowUp and ArrowDown, a drag aborted by Escape, a
 * child's band offered in the child's editor alone, a root's band order
 * followed by its descendants without one of their own, none offered in the
 * bundle or the group editor, and Delete refused. The expected values are
 * derived in `README.md` ("bands.spec.ts"); the drag on a touch screen is in
 * `touch.spec.ts`.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Address, ElementAddress, Facet } from "../packages/core/src/index.ts";
import { addressKey, bandAddress, partAddress } from "../packages/core/src/index.ts";
import {
  addressSelector,
  arranger,
  type BandRecord,
  BUNDLES,
  bandMarks,
  bandOf,
  bandPoint,
  bandsOf,
  between,
  dispatch,
  done,
  drag,
  dragStart,
  editing,
  emptyPoint,
  enter,
  entriesLength,
  focusBand,
  frames,
  graphicalOrder,
  journalLength,
  keysOf,
  middleOf,
  newestCommand,
  node,
  OPENED_JOURNAL,
  open,
  select,
  selection,
  setViewport,
  storeText,
  toCanvas,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const VIEW = { x: 40, y: 40, zoom: 1 };
const START = OPENED_JOURNAL.bundles;
const MIXED = BUNDLES.mixed;
const SHARED = BUNDLES.shared;

/** `bmixed0000/score`'s band order entries: its facets and its line, as the README names them. */
const C = "children";
const M = "conversion_maps";
const K = "markers";
const R = "regions";
const F = "flow_control";
const LINE = "line";

/** The band of `score` drawing the facet `facet`. */
function scoreBand(facet: Facet): ElementAddress {
  return bandAddress("score", facet);
}

const SCORE_F = scoreBand(F);
const SCORE_K = scoreBand(K);
const SCORE_M = scoreBand(M);
const SELECTED_F: Address[] = [{ block: MIXED, ...SCORE_F }];

/** A band of timeline `timeline` as `bandsOf` gives it. */
function band(timeline: string, facet: Facet, level: number, elements: number): BandRecord {
  return { address: bandAddress(timeline, facet), facet, level, elements };
}

/** `bmixed0000/score`'s bands as the fixture draws them. */
const SCORE = [band("score", M, 1, 2), band("score", K, -1, 2), band("score", F, -2, 1)];

/** The `set` of `bmixed0000/score`'s band order. */
function setScoreOrder(order: string[]) {
  return { type: "set", changes: [{ target: { block: MIXED, id: "score" }, values: { order } }] };
}

/** The client ordinate of the line of the timeline band `address` of block `block` lies at. */
async function lineOf(page: Page, block: string, address: ElementAddress): Promise<number> {
  return (await bandOf(page, block, address)).line;
}

/** Press band `address` of block `block` at `bandPoint` and release it at client ordinate `y`. */
async function dragBand(
  page: Page,
  block: string,
  address: ElementAddress,
  y: number,
  clearance = 2,
): Promise<void> {
  const from = await bandPoint(page, block, address, clearance);
  await drag(page, from, 0, y - from.y);
}

/**
 * The `points` attribute of the one drawn polygon `address` in block
 * `block`, in drawing units, never its screen box, which an engine lays out
 * at its own layout unit when the node's `<svg>` changes size.
 */
async function pointsOf(page: Page, block: string, address: ElementAddress): Promise<string> {
  const points = await node(page, block)
    .locator(`.tilie-block svg polygon${addressSelector(address)}`)
    .getAttribute("points");
  if (points === null) throw new Error(`${block} ${addressKey(address)} has no points`);
  return points;
}

/** The start wedge of `score`. */
const SCORE_START = partAddress({ id: "score" }, "start");

test.describe("on bundles", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "bundles");
    await setViewport(page, VIEW);
  });

  test("a band in its timeline editor is hovered and clicked", async ({ page }) => {
    await enter(page, { block: MIXED, id: "score" }, VIEW);
    await focusBand(page, MIXED, SCORE_F, 1);
    expect(await bandsOf(page, MIXED, "score")).toEqual(SCORE);
    expect(await bandMarks(page, MIXED)).toEqual([]);

    const point = await bandPoint(page, MIXED, SCORE_F, 2);
    await page.mouse.move(point.x, point.y);
    await expect.poll(() => bandMarks(page, MIXED)).toEqual(keysOf([SCORE_F]));
    // Opening the editor selected the edited timeline's card.
    expect(await selection(page)).toEqual([{ block: MIXED, id: "score", part: ["card"] }]);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => selection(page)).toEqual(SELECTED_F);
    expect(await bandMarks(page, MIXED)).toEqual(keysOf([SCORE_F]));

    const markers = await bandPoint(page, MIXED, SCORE_K, 2);
    await page.mouse.move(markers.x, markers.y);
    await expect.poll(() => bandMarks(page, MIXED)).toEqual(keysOf([SCORE_F, SCORE_K]));
    expect(await selection(page)).toEqual(SELECTED_F);

    // Left of every block, at the markers band's ordinate: only the selection's mark stays.
    const at = await toCanvas(page, markers.x, markers.y);
    const off = await emptyPoint(page, -20, at.y);
    await page.mouse.move(off.x, off.y);
    await expect.poll(() => bandMarks(page, MIXED)).toEqual(keysOf([SCORE_F]));
    expect(await entriesLength(page)).toBe(0);
  });

  test("a band dragged across the line into a gap, undone in one step and redone", async ({
    page,
  }) => {
    const order = [C, M, F, LINE, K, R];
    await enter(page, { block: MIXED, id: "score" }, VIEW);
    await focusBand(page, MIXED, SCORE_F, 2);
    const view = await storeText(page, "view");
    const gap = between(
      middleOf(await bandOf(page, MIXED, SCORE_M)),
      await lineOf(page, MIXED, SCORE_M),
    );
    await dragBand(page, MIXED, SCORE_F, gap);

    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await journalLength(page)).toBe(START);
    expect(await newestCommand(page)).toEqual(setScoreOrder(order));
    expect(await graphicalOrder(page, MIXED)).toEqual({
      group_1: ["score", "performance"],
      group_2: ["page", "excerpt"],
      score: order,
    });
    expect(await bandsOf(page, MIXED, "score")).toEqual([
      band("score", M, 2, 2),
      band("score", F, 1, 1),
      band("score", K, -1, 2),
    ]);
    expect(await selection(page)).toEqual(SELECTED_F);
    const after = await storeText(page, "view");

    await arranger(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => entriesLength(page)).toBe(0);
    expect(await storeText(page, "view")).toBe(view);
    expect(await bandsOf(page, MIXED, "score")).toEqual(SCORE);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await storeText(page, "view")).toBe(after);
  });

  test("a band dragged along its side", async ({ page }) => {
    const order = [C, M, LINE, F, K, R];
    await enter(page, { block: MIXED, id: "score" }, VIEW);
    await focusBand(page, MIXED, SCORE_F, 1);
    const inside = between(
      await lineOf(page, MIXED, SCORE_K),
      middleOf(await bandOf(page, MIXED, SCORE_K)),
    );
    await dragBand(page, MIXED, SCORE_F, inside);

    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await newestCommand(page)).toEqual(setScoreOrder(order));
    expect(await bandsOf(page, MIXED, "score")).toEqual([
      band("score", M, 1, 2),
      band("score", F, -1, 1),
      band("score", K, -2, 2),
    ]);
    expect(await selection(page)).toEqual(SELECTED_F);
  });

  test("a child's band is offered in the child's editor and in no other", async ({ page }) => {
    const parent = "recapitulation";
    const child = "recapitulation_second";
    const conversionMaps = bandAddress(child, M);
    const children = bandAddress(parent, C);
    const card: Address[] = [{ block: SHARED, id: parent, part: ["card"] }];

    // Found where every drawn element of the block takes the pointer.
    await enter(page, { block: SHARED }, VIEW);
    const at = await focusBand(page, SHARED, conversionMaps, 2);
    const point = await bandPoint(page, SHARED, conversionMaps, 2);

    /**
     * Hover the point, then click it: the band marks while hovering, the
     * selection the click makes, and the same marks after it (a band both
     * hovered and selected shows one).
     */
    const tryPoint = async (marks: ElementAddress[], selected: Address[]) => {
      await select(page, []);
      await page.mouse.move(point.x, point.y);
      if (marks.length === 0) await frames(page);
      await expect.poll(() => bandMarks(page, SHARED)).toEqual(keysOf(marks));
      await page.mouse.click(point.x, point.y);
      await expect.poll(() => selection(page)).toEqual(selected);
      expect(await bandMarks(page, SHARED)).toEqual(keysOf(marks));
    };

    await tryPoint([], card);
    await done(page, VIEW);

    await enter(page, { block: SHARED, id: "group_2" }, at);
    await tryPoint([], card);
    await done(page, VIEW);

    await enter(page, { block: SHARED, id: parent }, at);
    await tryPoint([children], [{ block: SHARED, ...children }]);
    await done(page, VIEW);

    await enter(page, { block: SHARED, id: child }, at);
    expect(await bandsOf(page, SHARED, child)).toEqual([band(child, M, 1, 1)]);
    await tryPoint([conversionMaps], [{ block: SHARED, ...conversionMaps }]);
    await done(page, VIEW);

    await setViewport(page, at);
    await tryPoint([], card);
    expect(await journalLength(page)).toBe(START);
  });

  test("a root's order change moves a child without an entry of its own", async ({ page }) => {
    const before = {
      exposition: [band("exposition", M, 1, 2), band("exposition", K, -1, 2)],
      recapitulation: [band("recapitulation", C, 1, 2), band("recapitulation", K, -1, 2)],
      recapitulation_first: [],
      recapitulation_second: [band("recapitulation_second", M, 1, 1)],
      take_1: [band("take_1", M, 1, 1), band("take_1", K, -1, 2)],
    };
    const after = {
      ...before,
      exposition: [band("exposition", M, -1, 2), band("exposition", K, -2, 2)],
      recapitulation_second: [band("recapitulation_second", M, -1, 1)],
    };
    const shown = async () =>
      Object.fromEntries(
        await Promise.all(
          Object.keys(before).map(async (id) => [id, await bandsOf(page, SHARED, id)] as const),
        ),
      );
    await expect.poll(shown).toEqual(before);
    const view = await storeText(page, "view");

    expect(
      await dispatch(page, {
        type: "set",
        changes: [
          {
            target: { block: SHARED, id: "score" },
            values: { order: [C, LINE, M, K, R, F] },
          },
        ],
      }),
    ).toBeNull();
    expect(await journalLength(page)).toBe(START + 1);
    await expect.poll(shown).toEqual(after);

    await arranger(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => journalLength(page)).toBe(START);
    expect(await storeText(page, "view")).toBe(view);
    await expect.poll(shown).toEqual(before);
  });

  test("Ctrl/Cmd+ArrowUp and ArrowDown step a band past the next visible entry", async ({
    page,
  }) => {
    await enter(page, { block: MIXED, id: "score" }, VIEW);
    await select(page, SELECTED_F);
    await arranger(page).focus();

    // The bottom visible entry: nothing lies further down.
    await page.keyboard.press("ControlOrMeta+ArrowDown");
    await frames(page);
    expect(await entriesLength(page)).toBe(0);
    expect(await bandsOf(page, MIXED, "score")).toEqual(SCORE);
    expect(await selection(page)).toEqual(SELECTED_F);

    const steps: [string, string[], BandRecord[]][] = [
      [
        "ArrowUp",
        [C, M, LINE, F, K, R],
        [band("score", M, 1, 2), band("score", F, -1, 1), band("score", K, -2, 2)],
      ],
      [
        "ArrowUp",
        [C, M, F, LINE, K, R],
        [band("score", M, 2, 2), band("score", F, 1, 1), band("score", K, -1, 2)],
      ],
      [
        "ArrowUp",
        [C, F, M, LINE, K, R],
        [band("score", F, 2, 1), band("score", M, 1, 2), band("score", K, -1, 2)],
      ],
    ];
    for (const [entries, [key, order, bands]] of steps.entries()) {
      await page.keyboard.press(`ControlOrMeta+${key}`);
      await expect.poll(() => entriesLength(page)).toBe(entries + 1);
      expect(await newestCommand(page)).toEqual(setScoreOrder(order));
      expect(await bandsOf(page, MIXED, "score")).toEqual(bands);
      expect(await selection(page)).toEqual(SELECTED_F);
    }

    // The top visible entry: nothing lies further up.
    await page.keyboard.press("ControlOrMeta+ArrowUp");
    await frames(page);
    expect(await entriesLength(page)).toBe(3);
    expect(await selection(page)).toEqual(SELECTED_F);

    await page.keyboard.press("ControlOrMeta+ArrowDown");
    await expect.poll(() => entriesLength(page)).toBe(4);
    expect(await newestCommand(page)).toEqual(setScoreOrder([C, M, F, LINE, K, R]));
    expect(await bandsOf(page, MIXED, "score")).toEqual([
      band("score", M, 2, 2),
      band("score", F, 1, 1),
      band("score", K, -1, 2),
    ]);
    expect(await selection(page)).toEqual(SELECTED_F);
  });

  test("Escape during a band's drag dispatches nothing", async ({ page }) => {
    await enter(page, { block: MIXED, id: "score" }, VIEW);
    await focusBand(page, MIXED, SCORE_F, 2);
    await select(page, SELECTED_F);
    const view = await storeText(page, "view");
    const wedge = await pointsOf(page, MIXED, SCORE_START);
    const from = await bandPoint(page, MIXED, SCORE_F, 2);
    const gap = between(
      middleOf(await bandOf(page, MIXED, SCORE_M)),
      await lineOf(page, MIXED, SCORE_M),
    );
    await dragStart(page, from, 0, gap - from.y);
    // The preview lays F between the line and the conversion maps band: the
    // line, and the markers band against it, lie lower in the card.
    await expect.poll(() => pointsOf(page, MIXED, SCORE_START)).not.toBe(wedge);

    await page.keyboard.press("Escape");
    await expect.poll(() => pointsOf(page, MIXED, SCORE_START)).toBe(wedge);
    expect(await selection(page)).toEqual(SELECTED_F);
    expect(await editing(page)).toEqual([
      { target: { block: MIXED, id: "score" }, kind: "timeline" },
    ]);
    expect(await bandsOf(page, MIXED, "score")).toEqual(SCORE);
    await page.mouse.up();
    await frames(page);
    expect(await entriesLength(page)).toBe(0);
    expect(await storeText(page, "view")).toBe(view);
  });

  test("no band is offered in the bundle or the group editor, nor on the arranger", async ({
    page,
  }) => {
    const card: Address[] = [{ block: MIXED, id: "score", part: ["card"] }];
    // Found where every drawn element of the block takes the pointer.
    await enter(page, { block: MIXED }, VIEW);
    const at = await focusBand(page, MIXED, SCORE_F, 1);
    const point = await bandPoint(page, MIXED, SCORE_F, 2);

    const tryPoint = async () => {
      await select(page, []);
      await page.mouse.move(point.x, point.y);
      await frames(page);
      expect(await bandMarks(page, MIXED)).toEqual([]);
      await page.mouse.click(point.x, point.y);
      await expect.poll(() => selection(page)).toEqual(card);
      expect(await bandMarks(page, MIXED)).toEqual([]);
    };

    await tryPoint();
    await done(page, VIEW);
    await enter(page, { block: MIXED, id: "group_1" }, at);
    await tryPoint();
    await done(page, VIEW);
    await setViewport(page, at);
    await tryPoint();
  });

  test("Delete with only a band selected removes nothing", async ({ page }) => {
    await enter(page, { block: MIXED, id: "score" }, VIEW);
    await select(page, SELECTED_F);
    const view = await storeText(page, "view");
    await arranger(page).focus();
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("hint")).toHaveText(
      "A band is not deleted; select its elements to delete them.",
    );
    expect(await entriesLength(page)).toBe(0);
    expect(await storeText(page, "view")).toBe(view);
    expect(await selection(page)).toEqual(SELECTED_F);
  });
});
