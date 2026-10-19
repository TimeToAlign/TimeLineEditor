/**
 * The canvas with the mouse and the keyboard on `small`. The expected values
 * are derived in `README.md` ("canvas.spec.ts").
 */

import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { addressParts } from "../packages/arranger/src/editing.ts";
import type { Manifest } from "../packages/core/src/index.ts";
import {
  blockOrder,
  cardPoint,
  clickPart,
  commandsFrom,
  drag,
  dragBlock,
  drawer,
  element,
  emptyPoint,
  journalLength,
  marginPoint,
  node,
  nodeDragStart,
  OPENED_JOURNAL,
  open,
  pane,
  part,
  partCentre,
  placement,
  SMALL,
  SMALL_ORDER,
  select,
  selectedAddresses,
  selectedNodes,
  selection,
  setViewport,
  textsNotInFace,
  viewportOf,
} from "./support.ts";

const START = OPENED_JOURNAL.small;
const VIEW = { x: 40, y: 40, zoom: 1 };

/**
 * Where the styled block lands when its plot origin (98.080078125 right of its
 * left edge) is dragged to within 6 px of the flow block's plot origin, 640 +
 * 90.9775390625: 730.9775390625 - 98.080078125 = 632.8974609375, a multiple
 * of 1/2048, so the alignment is stored bit-exact.
 */
const ORIGIN_SNAP_X = 632.8974609375;

/** The blocks of `small` as canvas boxes `[x, y, width, height]` (the drawing table of the README). */
const BOXES: Record<string, readonly [number, number, number, number]> = {
  [SMALL.bare]: [0, 0, 476.5771484375, 67.37890625],
  [SMALL.nested]: [0, 160, 477.194580078125, 95.9765625],
  [SMALL.map]: [0, 320, 490.53662109375, 85.4765625],
  [SMALL.flow]: [640, 0, 518.256591796875, 102.33203125],
  [SMALL.styled]: [640, 160, 528.080078125, 136.921875],
};

/** The `x`, `y` of a block as stored. */
async function position(page: import("@playwright/test").Page, id: string) {
  const { x, y } = await placement(page, id);
  return { x, y };
}

/** Changes sorted by target, so a multi-block command compares regardless of order. */
function byTarget<T extends { target: string }>(changes: readonly T[]): T[] {
  return [...changes].sort((a, b) => (a.target < b.target ? -1 : 1));
}

test.use({ viewport: { width: 1600, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await open(page, "small");
  await setViewport(page, VIEW);
});

test("opening shows one node per block", async ({ page }) => {
  await expect(page.getByTestId("block")).toHaveCount(5);
  for (const id of SMALL_ORDER) await expect(node(page, id)).toHaveCount(1);
  await expect(part(page, SMALL.styled, "score/intro")).toBeAttached();
  await expect(part(page, SMALL.styled, "score/da-capo")).toBeAttached();
  await expect(part(page, SMALL.styled, "score/ticks")).toBeAttached();
});

test("the fixture menu loads small", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-testid="fixture-select"]').selectOption("small");
  await page.locator('[data-testid="fixture-load"]').click();
  await expect(page.getByTestId("block")).toHaveCount(5);
  for (const id of SMALL_ORDER) await expect(node(page, id)).toHaveCount(1);
  expect(await journalLength(page)).toBe(START);
});

test("every drawn text is laid out in the bundled face", async ({ page, browserName }) => {
  expect(await textsNotInFace(page, browserName)).toEqual([]);
});

test.describe("drag", () => {
  test("a drag is one set command at the grid-snapped position; undo and redo keys restore it", async ({
    page,
  }) => {
    await dragBlock(page, SMALL.map, 101, 37);
    expect(await position(page, SMALL.map)).toEqual({ x: 104, y: 360 });
    expect(await commandsFrom(page, START)).toEqual([
      { type: "set", changes: [{ target: SMALL.map, values: { x: 104, y: 360 } }] },
    ]);

    await page.keyboard.press("ControlOrMeta+z");
    expect(await position(page, SMALL.map)).toEqual({ x: 0, y: 320 });
    expect(await journalLength(page)).toBe(START);

    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect(await position(page, SMALL.map)).toEqual({ x: 104, y: 360 });
    expect(await journalLength(page)).toBe(START + 1);
  });

  test("dragging two selected blocks is one command with two changes", async ({ page }) => {
    await select(page, [SMALL.bare, SMALL.nested]);
    await dragBlock(page, SMALL.bare, 21, 13);
    expect(await position(page, SMALL.bare)).toEqual({ x: 24, y: 16 });
    expect(await position(page, SMALL.nested)).toEqual({ x: 24, y: 176 });
    const commands = await commandsFrom(page, START);
    expect(commands).toHaveLength(1);
    const [command] = commands;
    expect(command?.type).toBe("set");
    expect(byTarget(command?.type === "set" ? command.changes : [])).toEqual([
      { target: SMALL.bare, values: { x: 24, y: 16 } },
      { target: SMALL.nested, values: { x: 24, y: 176 } },
    ]);
  });

  test("a block snaps to another block's left edge and shows a guide", async ({ page }) => {
    // Put the flow block's left edge off the grid, at 515, through a command.
    const moved = await page.evaluate((id) => {
      const refused = window.__tilie.store().dispatch({
        type: "set",
        changes: [{ target: id, values: { x: 515 } }],
      });
      return refused === null;
    }, SMALL.flow);
    expect(moved).toBe(true);

    await nodeDragStart(page, await cardPoint(page, SMALL.nested), 512, 0);
    await expect(page.locator('[data-testid="snap-guide"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="snap-guide"]')).toBeVisible();
    await page.mouse.up();
    expect(await position(page, SMALL.nested)).toEqual({ x: 515, y: 160 });
    await expect(page.locator('[data-testid="snap-guide"]')).toHaveCount(0);
  });

  test("a block snaps its plot origin to another block's plot origin and shows a guide", async ({
    page,
  }) => {
    await nodeDragStart(page, await cardPoint(page, SMALL.styled), -8, 160);
    await expect(page.locator('[data-testid="snap-guide"]')).toHaveCount(1);
    await page.mouse.up();
    expect(await position(page, SMALL.styled)).toEqual({ x: ORIGIN_SNAP_X, y: 320 });
  });

  test("with the canvas locked a drag on a block pans by exactly the drag", async ({ page }) => {
    await page.locator('[data-testid="lock"]').click();
    await expect(page.locator('[data-testid="lock"]')).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => window.__tilie.locked())).toBe(true);

    await drag(page, await cardPoint(page, SMALL.bare), 50, 30);
    expect(await viewportOf(page)).toEqual({ x: 90, y: 70, zoom: 1 });
    expect(await position(page, SMALL.bare)).toEqual({ x: 0, y: 0 });
    expect(await journalLength(page)).toBe(START);

    await page.keyboard.press("l");
    expect(await page.evaluate(() => window.__tilie.locked())).toBe(false);
    await expect(page.locator('[data-testid="lock"]')).toHaveAttribute("aria-pressed", "false");
  });

  test("a locked canvas allows no move, nudge or resize and hides the handles", async ({
    page,
  }) => {
    await select(page, [SMALL.bare]);
    await page.keyboard.press("2");
    await expect(page.locator('[data-testid^="handle-"]')).toHaveCount(8);
    await page.keyboard.press("l");
    expect(await page.evaluate(() => window.__tilie.locked())).toBe(true);
    await expect(page.locator('[data-testid^="handle-"]')).toHaveCount(0);
    for (const key of ["ArrowRight", "Shift+ArrowDown", "ArrowUp", "Shift+ArrowLeft"]) {
      await page.keyboard.press(key);
    }
    expect(await position(page, SMALL.bare)).toEqual({ x: 0, y: 0 });
    expect(await journalLength(page)).toBe(START);
  });

  test("a plain drag on the empty canvas pans", async ({ page }) => {
    await drag(page, await emptyPoint(page, -20, 200), 30, 25);
    expect(await viewportOf(page)).toEqual({ x: 70, y: 65, zoom: 1 });
    expect(await journalLength(page)).toBe(START);
    expect(await selection(page)).toEqual([]);
  });
});

test.describe("wheel", () => {
  /** Whether the page's user agent names a Mac, as Svelte Flow's `isMacOs` tests it. */
  function macUserAgent(page: import("@playwright/test").Page): Promise<boolean> {
    return page.evaluate(() => navigator.userAgent.indexOf("Mac") >= 0);
  }

  /** Dispatch one wheel event over the empty canvas point (-20, 200) with `modifier` held. */
  async function wheel(
    page: import("@playwright/test").Page,
    deltaX: number,
    deltaY: number,
    modifier?: string,
  ) {
    const at = await emptyPoint(page, -20, 200);
    await page.mouse.move(at.x, at.y);
    if (modifier !== undefined) await page.keyboard.down(modifier);
    await page.mouse.wheel(deltaX, deltaY);
    if (modifier !== undefined) await page.keyboard.up(modifier);
    return at;
  }

  test("the wheel pans vertically by half its delta at zoom 1", async ({ page }) => {
    await wheel(page, 0, 100);
    await expect.poll(() => viewportOf(page)).toEqual({ x: 40, y: -10, zoom: 1 });
    expect(await journalLength(page)).toBe(START);
  });

  // A browser may report a Shift+wheel as the vertical delta it was or as a
  // horizontal one; both pan horizontally by the same distance.
  for (const [form, deltaX, deltaY] of [
    ["deltaY", 0, 100],
    ["deltaX", 100, 0],
  ] as const) {
    test(`Shift+wheel pans horizontally (${form} only)`, async ({ page }) => {
      // macOS reports a Shift+wheel as horizontal itself, and Svelte Flow then
      // swaps nothing; an engine with a Mac user agent gets only that form.
      test.skip(
        form === "deltaY" && (await macUserAgent(page)),
        "a Mac reports a Shift+wheel as deltaX",
      );
      await wheel(page, deltaX, deltaY, "Shift");
      await expect.poll(() => viewportOf(page)).toEqual({ x: -10, y: 40, zoom: 1 });
      expect(await journalLength(page)).toBe(START);
    });
  }

  test("Ctrl+wheel zooms about the pointer", async ({ page }) => {
    // Svelte Flow's pinch zoom: 2 ** (-deltaY × 0.002 × factor), the factor 10
    // under a Mac user agent (a trackpad pinch reports small deltas there).
    const factor = (await macUserAgent(page)) ? 10 : 1;
    const at = await wheel(page, 0, -10, "Control");
    const box = await pane(page).boundingBox();
    if (box === null) throw new Error("the canvas is not displayed");
    const zoom = 2 ** (10 * 0.002 * factor);
    // The pane point under the pointer keeps its canvas point.
    const px = at.x - box.x;
    const py = at.y - box.y;
    await expect
      .poll(() => viewportOf(page))
      .toEqual({ x: px - (px - VIEW.x) * zoom, y: py - (py - VIEW.y) * zoom, zoom });
    expect(await journalLength(page)).toBe(START);
  });
});

test.describe("marquee", () => {
  // Zoom 1/2 at (100, 100), so the gesture stays clear of the 40 px edge zone
  // in which Svelte Flow pans while a marquee is drawn: the rectangle from canvas (-40, -40) to (1160, 200)
  // holds the bare and flow blocks whole and the nested and styled blocks in
  // part; only whole blocks are selected, and the result replaces the
  // selection held before (the map block).
  const MARQUEE = { x: 100, y: 100, zoom: 0.5 };
  const SPAN = { dx: 600, dy: 120 };

  test("Shift+drag selects exactly the blocks wholly inside, replacing the selection", async ({
    page,
  }) => {
    await setViewport(page, MARQUEE);
    await select(page, [SMALL.map]);
    const from = await emptyPoint(page, -40, -40);
    await page.keyboard.down("Shift");
    await drag(page, from, SPAN.dx, SPAN.dy);
    await page.keyboard.up("Shift");
    expect(await selection(page)).toEqual([SMALL.bare, SMALL.flow]);
    expect(await viewportOf(page)).toEqual(MARQUEE);
  });

  test("a marquee ending in the edge zone pans, keeps its start and selects what it holds", async ({
    page,
  }) => {
    await setViewport(page, MARQUEE);
    const box = await pane(page).boundingBox();
    if (box === null) throw new Error("the canvas is not displayed");
    const from = await emptyPoint(page, -40, -40);
    const end = { x: box.width - 20, y: 170 };
    await page.keyboard.down("Shift");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 10 });
    // Hold in the zone until Svelte Flow has panned.
    await expect.poll(async () => (await viewportOf(page)).x).not.toBe(MARQUEE.x);
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const v = await viewportOf(page);
    expect(v.y).toBe(MARQUEE.y);
    expect(v.zoom).toBe(MARQUEE.zoom);
    const right = (end.x - v.x) / v.zoom;
    const bottom = (end.y - v.y) / v.zoom;
    expect(bottom).toBe(140);
    expect(right > 1158.256591796875).toBe(true);
    const inside = Object.entries(BOXES)
      .filter(([, [x, y, w, h]]) => x >= -40 && y >= -40 && x + w <= right && y + h <= bottom)
      .map(([id]) => id)
      .sort();
    expect(inside).toEqual([SMALL.bare, SMALL.flow]);
    expect(await selection(page)).toEqual(inside);
  });

  test("the marquee toggle turns a plain drag into an additive marquee until toggled off", async ({
    page,
  }) => {
    await setViewport(page, MARQUEE);
    await select(page, [SMALL.map]);
    const toggle = page.locator('[data-testid="marquee"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await drag(page, await emptyPoint(page, -40, -40), SPAN.dx, SPAN.dy);
    // In marquee mode a marquee adds to the selection.
    expect(await selection(page)).toEqual([SMALL.bare, SMALL.flow, SMALL.map]);
    expect(await viewportOf(page)).toEqual(MARQUEE);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Escape");
    await drag(page, await emptyPoint(page, -40, -40), SPAN.dx, SPAN.dy);
    expect(await selection(page)).toEqual([]);
    expect(await viewportOf(page)).toEqual({ x: 700, y: 220, zoom: 0.5 });
  });

  test("in marquee mode clicks and marquees add, a click on a selected item removes it", async ({
    page,
  }) => {
    await setViewport(page, MARQUEE);
    await page.locator('[data-testid="marquee"]').click();
    const bare = await marginPoint(page, SMALL.bare);
    await page.mouse.click(bare.x, bare.y);
    expect(await selection(page)).toEqual([SMALL.bare]);
    await clickPart(page, SMALL.nested, "clt_2");
    expect(await selection(page)).toEqual([SMALL.bare, `${SMALL.nested}/clt_2`]);
    // Canvas (600, -40) to (1160, 140): the flow block whole, nothing else.
    await drag(page, await emptyPoint(page, 600, -40), 280, 90);
    expect(await selection(page)).toEqual([SMALL.bare, SMALL.flow, `${SMALL.nested}/clt_2`]);
    await page.mouse.click(bare.x, bare.y);
    expect(await selection(page)).toEqual([SMALL.flow, `${SMALL.nested}/clt_2`]);
    expect(await viewportOf(page)).toEqual(MARQUEE);
    expect(await journalLength(page)).toBe(START);
  });
});

/**
 * The selection is exactly `expected`, and the canvas shows exactly that:
 * the selected nodes are its block ids, the marked elements its element ids.
 */
async function shows(page: import("@playwright/test").Page, expected: readonly string[]) {
  const sorted = [...expected].sort();
  expect(await selection(page)).toEqual(sorted);
  const parts = sorted.map(addressParts);
  const blocks = parts.flatMap(({ block, element }) => (element === null ? [block] : []));
  const elements = parts.flatMap(({ element }) => (element === null ? [] : [element])).sort();
  await expect.poll(() => selectedNodes(page)).toEqual(blocks);
  await expect.poll(() => selectedAddresses(page)).toEqual(elements);
}

async function clickMargin(page: import("@playwright/test").Page, id: string) {
  const point = await marginPoint(page, id);
  await page.mouse.click(point.x, point.y);
}

async function clickEmpty(page: import("@playwright/test").Page, shift = false) {
  const point = await emptyPoint(page, 400, 120);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(point.x, point.y);
  if (shift) await page.keyboard.up("Shift");
}

/** Press on the empty canvas at (400, 120), move 2 px right in two moves, release. */
async function wobbleEmpty(page: import("@playwright/test").Page, shift = false) {
  const point = await emptyPoint(page, 400, 120);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 2, point.y, { steps: 2 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}

test("a click whose pointer moves 2 px is still a click on the empty canvas", async ({ page }) => {
  await setViewport(page, { x: 100, y: 100, zoom: 0.5 });
  const toggle = page.locator('[data-testid="marquee"]');
  const both = async () => {
    await select(page, [SMALL.bare, SMALL.flow]);
    await shows(page, [SMALL.bare, SMALL.flow]);
  };
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await both();
  await wobbleEmpty(page, true);
  await shows(page, [SMALL.bare, SMALL.flow]);
  await wobbleEmpty(page);
  await shows(page, []);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await setViewport(page, { x: 100, y: 100, zoom: 0.5 });
  await both();
  await wobbleEmpty(page, true);
  await shows(page, [SMALL.bare, SMALL.flow]);
  await wobbleEmpty(page);
  await shows(page, []);
  expect(await journalLength(page)).toBe(START);
});

test("a click on the empty canvas clears the selection in every mode, Shift+click keeps it", async ({
  page,
}) => {
  await setViewport(page, { x: 100, y: 100, zoom: 0.5 });
  const toggle = page.locator('[data-testid="marquee"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await clickMargin(page, SMALL.bare);
  await clickPart(page, SMALL.nested, "clt_2");
  await shows(page, [SMALL.bare, `${SMALL.nested}/clt_2`]);
  await clickEmpty(page);
  await shows(page, []);
  await clickMargin(page, SMALL.flow);
  await shows(page, [SMALL.flow]);
  await clickMargin(page, SMALL.bare);
  await shows(page, [SMALL.bare, SMALL.flow]);
  await clickEmpty(page, true);
  await shows(page, [SMALL.bare, SMALL.flow]);
  await clickMargin(page, SMALL.map);
  await shows(page, [SMALL.bare, SMALL.flow, SMALL.map]);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await clickEmpty(page, true);
  await shows(page, [SMALL.bare, SMALL.flow, SMALL.map]);
  await clickEmpty(page);
  await shows(page, []);
  await clickPart(page, SMALL.nested, "clt_2");
  await shows(page, [`${SMALL.nested}/clt_2`]);
  expect(await journalLength(page)).toBe(START);
});

test.describe("click", () => {
  test("a click on an element selects that element only and outlines its block", async ({
    page,
  }) => {
    await clickPart(page, SMALL.nested, "clt_2");
    expect(await selection(page)).toEqual([`${SMALL.nested}/clt_2`]);
    await expect(part(page, SMALL.nested, "clt_2")).toHaveAttribute("data-selected");
    expect(await selectedAddresses(page)).toEqual(["clt_2"]);
    const nested = node(page, SMALL.nested);
    await expect(nested.locator(".tilie-block[data-contains-selection]")).toHaveCount(1);
    await expect(nested.locator('.tilie-mark[data-mark="holding"][data-box="card"]')).toHaveCount(
      1,
    );
    await expect(page.locator(".tilie-block[data-contains-selection]")).toHaveCount(1);
    await expect(page.locator('.tilie-mark[data-mark="holding"][data-box="card"]')).toHaveCount(1);
    await expect(page.locator('.tilie-mark[data-mark="holding"][data-box="frame"]')).toHaveCount(0);
  });

  test("a click on a card selects the card, a click on the margin the block", async ({ page }) => {
    await clickPart(page, SMALL.nested, "clt_2");
    const card = await cardPoint(page, SMALL.map);
    await page.mouse.click(card.x, card.y);
    expect(await selection(page)).toEqual([`${SMALL.map}/melody/card`]);
    // The card glows on its own rectangle, not on its shadow, in the selection's colour
    // although the pointer is over it: one selection mark copying that rectangle, and no
    // hover mark; its timeline goes with it on Delete.
    const rects = element(page, SMALL.map, "melody/card");
    await expect(rects).toHaveCount(2);
    const glows = node(page, SMALL.map).locator('rect.tilie-mark[data-mark="selection"]');
    await expect(glows).toHaveCount(1);
    await expect(glows).toHaveAttribute("data-marks", "melody/card");
    const outline = (rect: Locator) =>
      rect.evaluate((item) => ["x", "y", "width", "height"].map((name) => item.getAttribute(name)));
    expect(await outline(glows)).toEqual(await outline(rects.nth(1)));
    expect(await outline(glows)).not.toEqual(await outline(rects.nth(0)));
    await expect(page.locator('.tilie-mark[data-mark="hover"]')).toHaveCount(0);
    expect(await selectedAddresses(page)).toEqual(["melody/card"]);
    const glow = await glows.evaluate((rect) => getComputedStyle(rect).filter);
    expect(glow).toContain("rgb(10, 132, 255)");
    expect(glow).not.toContain("rgb(156, 200, 255)");
    await expect(element(page, SMALL.map, "melody").first()).toHaveAttribute("data-affected", "");
    const point = await marginPoint(page, SMALL.map);
    await page.mouse.click(point.x, point.y);
    expect(await selection(page)).toEqual([SMALL.map]);
    await expect(page.locator("[data-contains-selection]")).toHaveCount(0);
    expect(await selectedAddresses(page)).toEqual([]);
  });

  test("Shift+click adds and removes", async ({ page }) => {
    await clickPart(page, SMALL.nested, "clt_2");
    await clickPart(page, SMALL.styled, "score", true);
    expect(await selection(page)).toEqual([`${SMALL.nested}/clt_2`, `${SMALL.styled}/score`]);
    await expect(page.locator(".tilie-block[data-contains-selection]")).toHaveCount(2);
    await expect(page.locator('.tilie-mark[data-mark="holding"][data-box="card"]')).toHaveCount(2);
    await expect(page.locator('.tilie-mark[data-mark="holding"][data-box="frame"]')).toHaveCount(0);

    const point = await marginPoint(page, SMALL.bare);
    await page.keyboard.down("Shift");
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up("Shift");
    expect(await selection(page)).toEqual([
      SMALL.bare,
      `${SMALL.nested}/clt_2`,
      `${SMALL.styled}/score`,
    ]);

    await clickPart(page, SMALL.nested, "clt_2", true);
    expect(await selection(page)).toEqual([SMALL.bare, `${SMALL.styled}/score`]);
  });

  test("a drag that starts on an element moves the block", async ({ page }) => {
    await nodeDragStart(page, await partCentre(page, SMALL.nested, "clt_2"), 101, 37);
    await page.mouse.up();
    expect(await position(page, SMALL.nested)).toEqual({ x: 104, y: 200 });
    expect(await journalLength(page)).toBe(START + 1);
  });

  test("Escape clears the selection", async ({ page }) => {
    await clickPart(page, SMALL.nested, "clt_2");
    await page.keyboard.press("Escape");
    expect(await selection(page)).toEqual([]);
  });
});

test.describe("Delete", () => {
  test("Delete removes the selected element as one remove; undo restores it", async ({ page }) => {
    await select(page, [`${SMALL.styled}/score/intro`]);
    await page.keyboard.press("Delete");
    expect(await commandsFrom(page, START)).toEqual([
      { type: "remove", targets: [`${SMALL.styled}/score/intro`] },
    ]);
    const regions = () =>
      page.evaluate(
        (id) =>
          (
            window.__tilie.store().view.blocks[id]?.manifest as Manifest | undefined
          )?.timelines[0]?.regions.map((r) => r.id) ?? [],
        SMALL.styled,
      );
    expect(await regions()).toEqual([]);
    await expect(element(page, SMALL.styled, "score/intro")).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+z");
    expect(await regions()).toEqual(["intro"]);
    await expect(part(page, SMALL.styled, "score/intro")).toBeAttached();
  });

  test("a selected timeline marks its descendants; Delete removes the subtree in one entry", async ({
    page,
  }) => {
    const timelines = () =>
      page.evaluate((id) => {
        const ids: string[] = [];
        type Tree = { id: string; children: readonly Tree[] };
        const walk = (timeline: Tree) => {
          ids.push(timeline.id);
          for (const child of timeline.children) walk(child);
        };
        const root = (window.__tilie.store().view.blocks[id]?.manifest as Manifest | undefined)
          ?.timelines[0];
        if (root !== undefined) walk(root);
        return ids.sort();
      }, SMALL.nested);
    await select(page, [`${SMALL.nested}/clt_3`]);
    const affected = await page
      .locator("[data-affected]")
      .evaluateAll((items) =>
        [
          ...new Set(
            items.map(
              (item) =>
                `${item.closest(".svelte-flow__node")?.getAttribute("data-id")}/${item.getAttribute("data-address")}`,
            ),
          ),
        ].sort(),
      );
    expect(affected).toEqual([`${SMALL.nested}/clt_2`, `${SMALL.nested}/clt_2/name`]);

    await page.keyboard.press("Delete");
    expect(await commandsFrom(page, START)).toEqual([
      { type: "remove", targets: [`${SMALL.nested}/clt_3`] },
    ]);
    expect(await timelines()).toEqual(["clt_1"]);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await timelines()).toEqual(["clt_1", "clt_2", "clt_3"]);
  });

  test("Backspace removes a selected block and its node", async ({ page }) => {
    await select(page, [SMALL.map]);
    await page.keyboard.press("Backspace");
    expect(await commandsFrom(page, START)).toEqual([{ type: "remove", targets: [SMALL.map] }]);
    await expect(node(page, SMALL.map)).toHaveCount(0);
    expect(await blockOrder(page)).toEqual([SMALL.bare, SMALL.nested, SMALL.flow, SMALL.styled]);
  });

  test("Delete removes a root timeline with its card and a region as one remove", async ({
    page,
  }) => {
    const manifests = () =>
      page.evaluate(() => {
        const { view } = window.__tilie.store();
        return JSON.stringify(
          Object.keys(view.blocks).map((id) => [id, view.blocks[id]?.manifest]),
        );
      });
    const before = await manifests();
    await select(page, [`${SMALL.bare}/bare`, `${SMALL.styled}/score/intro`]);
    await page.keyboard.press("Delete");
    expect(await commandsFrom(page, START)).toEqual([
      { type: "remove", targets: [`${SMALL.bare}/bare`, `${SMALL.styled}/score/intro`] },
    ]);
    const roots = await page.evaluate(
      (id) =>
        (window.__tilie.store().view.blocks[id]?.manifest as Manifest | undefined)?.timelines
          .length,
      SMALL.bare,
    );
    expect(roots).toBe(0);
    await expect(node(page, SMALL.bare)).toHaveCount(1);
    await expect(element(page, SMALL.bare, "bare/card")).toHaveCount(0);
    await expect(element(page, SMALL.styled, "score/intro")).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+z");
    expect(await manifests()).toBe(before);
    await expect(part(page, SMALL.bare, "bare/card")).toBeAttached();
    await expect(part(page, SMALL.styled, "score/intro")).toBeAttached();
  });
});

test.describe("keyboard", () => {
  test("keys pressed while the focus is outside the arranger change nothing", async ({ page }) => {
    const point = await marginPoint(page, SMALL.map);
    await page.mouse.click(point.x, point.y);
    expect(await selection(page)).toEqual([SMALL.map]);
    const mode = await page.evaluate(() => window.__tilie.mode());
    // The focus goes to the inspector's tab, a control outside the arranger.
    await page.getByRole("button", { name: "Open inspector" }).focus();
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null),
    ).toBe("Open inspector");
    for (const key of [
      "ArrowRight",
      "Shift+ArrowDown",
      "ControlOrMeta+Shift+BracketRight",
      "1",
      "2",
      "3",
      "l",
      "Delete",
      "Backspace",
      "Escape",
    ]) {
      await page.keyboard.press(key);
    }
    expect(await journalLength(page)).toBe(START);
    expect(await position(page, SMALL.map)).toEqual({ x: 0, y: 320 });
    expect(await selection(page)).toEqual([SMALL.map]);
    expect(await page.evaluate(() => window.__tilie.mode())).toBe(mode);
    expect(await page.evaluate(() => window.__tilie.locked())).toBe(false);

    // The same key with the focus back on the canvas acts.
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press("ArrowRight");
    expect(await position(page, SMALL.map)).toEqual({ x: 8, y: 320 });

    // The page body is not the arranger.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.keyboard.press("ArrowRight");
    expect(await position(page, SMALL.map)).toEqual({ x: 8, y: 320 });

    // A click on the empty canvas focuses the arranger.
    const empty = await emptyPoint(page, -20, 200);
    await page.mouse.click(empty.x, empty.y);
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.matches('[role="application"][aria-label="Arranger"]') ?? false,
      ),
    ).toBe(true);
    await select(page, [SMALL.map]);
    await page.keyboard.press("ArrowRight");
    expect(await position(page, SMALL.map)).toEqual({ x: 16, y: 320 });
  });

  test("arrow keys move the focus between toolbar buttons and nudge nothing", async ({ page }) => {
    await select(page, [SMALL.map]);
    const focused = () =>
      page.evaluate(
        () =>
          document.activeElement?.getAttribute("data-testid") ??
          document.activeElement?.getAttribute("aria-label") ??
          null,
      );
    await page.getByRole("button", { name: "Zoom in" }).focus();
    const visited: (string | null)[] = [];
    for (let n = 0; n < 5; n += 1) {
      await page.keyboard.press("ArrowDown");
      visited.push(await focused());
    }
    expect(visited).toEqual(["Zoom out", "Fit to view", "lock", "marquee", "Zoom in"]);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    expect(await focused()).toBe("lock");
    await page.keyboard.press("ArrowRight");
    expect(await focused()).toBe("lock");

    await page.locator('[data-testid="mode-scale"]').focus();
    await page.keyboard.press("ArrowRight");
    expect(await focused()).toBe("mode-box");
    await page.keyboard.press("ArrowRight");
    expect(await focused()).toBe("mode-stretch");
    await page.keyboard.press("ArrowLeft");
    expect(await focused()).toBe("mode-box");

    expect(await journalLength(page)).toBe(START);
    expect(await position(page, SMALL.map)).toEqual({ x: 0, y: 320 });
  });

  /** The z-order keys: one `set` of `index` on the selected block each. */
  test("z-order keys reorder the blocks, one command each", async ({ page }) => {
    await select(page, [SMALL.bare]);
    const steps: [string, string[]][] = [
      [
        "ControlOrMeta+Shift+BracketRight",
        [SMALL.nested, SMALL.map, SMALL.flow, SMALL.styled, SMALL.bare],
      ],
      [
        "ControlOrMeta+BracketLeft",
        [SMALL.nested, SMALL.map, SMALL.flow, SMALL.bare, SMALL.styled],
      ],
      [
        "ControlOrMeta+Shift+BracketLeft",
        [SMALL.bare, SMALL.nested, SMALL.map, SMALL.flow, SMALL.styled],
      ],
      [
        "ControlOrMeta+BracketRight",
        [SMALL.nested, SMALL.bare, SMALL.map, SMALL.flow, SMALL.styled],
      ],
    ];
    for (const [count, [key, order]] of steps.entries()) {
      await page.keyboard.press(key);
      expect(await blockOrder(page), key).toEqual(order);
      const commands = await commandsFrom(page, START + count);
      expect(commands).toHaveLength(1);
      const [command] = commands;
      expect(command?.type === "set" && command.changes.map((change) => change.target)).toEqual([
        SMALL.bare,
      ]);
      expect(command?.type === "set" && Object.keys(command.changes[0]?.values ?? {})).toEqual([
        "index",
      ]);
      // The nodes stack in the same order: z-index rises with the index.
      const stacked = await page.evaluate(
        (ids) =>
          ids.map((id) => {
            const found = document.querySelector(`.svelte-flow__node[data-id="${id}"]`);
            return found === null ? Number.NaN : Number(getComputedStyle(found).zIndex);
          }),
        order,
      );
      expect(
        stacked.every((z, i) => i === 0 || z > (stacked[i - 1] as number)),
        key,
      ).toBe(true);
    }
  });

  test("arrows nudge by one grid step, Shift+arrows by eight; undo restores", async ({ page }) => {
    const point = await marginPoint(page, SMALL.map);
    await page.mouse.click(point.x, point.y);
    expect(await selection(page)).toEqual([SMALL.map]);

    await page.keyboard.press("ArrowRight");
    expect(await position(page, SMALL.map)).toEqual({ x: 8, y: 320 });
    await page.keyboard.press("Shift+ArrowDown");
    expect(await position(page, SMALL.map)).toEqual({ x: 8, y: 384 });
    await page.keyboard.press("ArrowUp");
    expect(await position(page, SMALL.map)).toEqual({ x: 8, y: 376 });
    await page.keyboard.press("Shift+ArrowLeft");
    expect(await position(page, SMALL.map)).toEqual({ x: -56, y: 376 });
    const commands = await commandsFrom(page, START);
    expect(
      commands.map((command) => command.type === "set" && command.changes.map((c) => c.target)),
    ).toEqual([[SMALL.map], [SMALL.map], [SMALL.map], [SMALL.map]]);

    for (let n = 0; n < 4; n += 1) await page.keyboard.press("ControlOrMeta+z");
    expect(await position(page, SMALL.map)).toEqual({ x: 0, y: 320 });
    expect(await journalLength(page)).toBe(START);
    for (let n = 0; n < 4; n += 1) await page.keyboard.press("ControlOrMeta+Shift+z");
    expect(await position(page, SMALL.map)).toEqual({ x: -56, y: 376 });
  });
});

test.describe("shell", () => {
  /** The left, top, right and bottom edges of a locator's box. */
  async function edges(locator: Locator) {
    const box = await locator.boundingBox();
    if (box === null) throw new Error("not displayed");
    return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
  }

  test("the canvas controls sit bottom-left in the pane with our five buttons", async ({
    page,
  }) => {
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.matches('[role="application"][aria-label="Arranger"]') ?? false,
      ),
    ).toBe(true);
    const controls = page.locator(".svelte-flow__controls");
    await expect(controls).toHaveCount(1);
    await expect(pane(page).locator(".svelte-flow__controls")).toHaveCount(1);
    expect(await controls.evaluate((panel) => [...panel.classList].sort())).toEqual(
      expect.arrayContaining(["bottom", "left"]),
    );
    const outer = await edges(pane(page));
    const inner = await edges(controls);
    expect(inner.left >= outer.left && inner.right <= (outer.left + outer.right) / 2).toBe(true);
    expect(inner.bottom <= outer.bottom && inner.top >= (outer.top + outer.bottom) / 2).toBe(true);
    expect(
      await controls
        .locator("button")
        .evaluateAll((buttons) =>
          buttons.map((button) => [
            button.getAttribute("data-testid"),
            button.getAttribute("aria-label"),
            button.getAttribute("title"),
          ]),
        ),
    ).toEqual([
      [null, "Zoom in", "Zoom in (+)"],
      [null, "Zoom out", "Zoom out (-)"],
      [null, "Fit to view", "Fit to view (0)"],
      ["lock", "Lock the canvas", "Lock the canvas: dragging pans instead of moving blocks (L)"],
      [
        "marquee",
        "Add to selection (marquee)",
        "Add to selection: dragging on the canvas draws a marquee, and clicks and marquees add to the selection",
      ],
    ]);
    await expect(page.locator(".svelte-flow__controls-interactive")).toHaveCount(0);
  });

  test("lock and marquee toggle by click, lock also by L", async ({ page }) => {
    const lock = page.locator('[data-testid="lock"]');
    const marquee = page.locator('[data-testid="marquee"]');
    const locked = () => page.evaluate(() => window.__tilie.locked());
    await lock.click();
    await expect(lock).toHaveAttribute("aria-pressed", "true");
    expect(await locked()).toBe(true);
    await lock.click();
    await expect(lock).toHaveAttribute("aria-pressed", "false");
    expect(await locked()).toBe(false);
    await page.keyboard.press("l");
    await expect(lock).toHaveAttribute("aria-pressed", "true");
    expect(await locked()).toBe(true);
    await page.keyboard.press("l");
    await expect(lock).toHaveAttribute("aria-pressed", "false");
    expect(await locked()).toBe(false);
    await marquee.click();
    await expect(marquee).toHaveAttribute("aria-pressed", "true");
    await marquee.click();
    await expect(marquee).toHaveAttribute("aria-pressed", "false");
  });

  test("the zoom and fit buttons and keys change the viewport", async ({ page }) => {
    const zoom = async () => (await viewportOf(page)).zoom;
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(zoom).not.toBe(1);
    const zoomedIn = await zoom();
    expect(zoomedIn > 1).toBe(true);
    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect.poll(zoom).not.toBe(zoomedIn);
    const zoomedOut = await zoom();
    expect(zoomedOut < zoomedIn).toBe(true);
    await page.keyboard.press("+");
    await expect.poll(zoom).not.toBe(zoomedOut);
    const keyedIn = await zoom();
    expect(keyedIn > zoomedOut).toBe(true);
    await page.keyboard.press("-");
    await expect.poll(zoom).not.toBe(keyedIn);
    expect((await zoom()) < keyedIn).toBe(true);

    const away = { x: 500, y: 500, zoom: 1 };
    await setViewport(page, away);
    await page.getByRole("button", { name: "Fit to view" }).click();
    await expect.poll(() => viewportOf(page)).not.toEqual(away);
    const fitted = await viewportOf(page);
    await setViewport(page, away);
    await page.keyboard.press("0");
    await expect.poll(() => viewportOf(page)).toEqual(fitted);
  });

  test("the inspector drawer is closed on load and opens without moving the canvas", async ({
    page,
  }) => {
    const inspector = drawer(page);
    const tab = page.getByRole("button", { name: "Open inspector" });
    await expect(inspector).toBeHidden();
    await expect(tab).toBeVisible();
    await expect(tab).toHaveText("«");
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect((await edges(tab)).right).toBe((await edges(pane(page))).right);
    expect((await edges(pane(page))).right).toBe(width);

    await tab.click();
    await expect(inspector).toBeVisible();
    await expect(inspector.getByRole("heading", { level: 2 })).toHaveText("Inspector");
    const close = page.getByRole("button", { name: "Close inspector" });
    await expect(close).toHaveText("»");
    await expect(close).toHaveAttribute("aria-expanded", "true");
    expect((await edges(pane(page))).right).toBe((await edges(inspector)).left);
    expect(await viewportOf(page)).toEqual(VIEW);

    await page.reload();
    await page.waitForFunction(() => window.__tilie !== undefined);
    await expect(inspector).toBeVisible();

    await open(page, "small");
    await setViewport(page, VIEW);
    await page.getByRole("button", { name: "Close inspector" }).click();
    await expect(inspector).toBeHidden();
    expect(await viewportOf(page)).toEqual(VIEW);
    await page.reload();
    await page.waitForFunction(() => window.__tilie !== undefined);
    await expect(inspector).toBeHidden();
  });
});
