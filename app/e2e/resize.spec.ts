/**
 * The three resize modes on `small`: choosing the mode by button and by key,
 * the handles each mode shows, and the stored values after dragging one
 * corner and one edge handle in each mode; and on `bundles`, a group's frame
 * scaled on the arranger and stretched vertically, the gap between its cards
 * following the pointer, a member card's margin kept in proportion by
 * stretches that lengthen and shorten its group, and the card of a member
 * of two groups resized in the second group's editor. Derivation in `README.md`
 * ("resize.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { cardAddress, idAddress } from "../packages/core/src/index.ts";
import type { Handle, Placement, ResizeMode } from "./support.ts";
import {
  BUNDLES,
  commandsFrom,
  dragStart,
  element,
  enter,
  entriesLength,
  framePoint,
  journalLength,
  newestCommand,
  node,
  OPENED_JOURNAL,
  open,
  placement,
  SMALL,
  select,
  selection,
  setViewport,
  viewportOf,
} from "./support.ts";

/** The journal after the setup below: the fixture's adds and two moves. */
const START = OPENED_JOURNAL.small + 2;

const CORNERS: readonly Handle[] = ["top-left", "top-right", "bottom-right", "bottom-left"];
const ALL: readonly Handle[] = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
];
const HANDLES: Record<ResizeMode, readonly Handle[]> = { scale: CORNERS, box: ALL, stretch: ALL };

test.use({ viewport: { width: 1600, height: 1000 } });

async function shownHandles(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="handle-"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-testid") ?? ""));
}

async function chooseMode(page: Page, mode: ResizeMode): Promise<void> {
  await page.locator(`[data-testid="mode-${mode}"]`).click();
  expect(await page.evaluate(() => window.__tilie.mode())).toBe(mode);
}

/**
 * Drag handle `handle` of the selected block by `(dx, dy)` pixels at zoom 1:
 * the preview changes the node's box and journals nothing, the release
 * journals exactly one command.
 */
async function resizeBy(page: Page, block: string, handle: Handle, dx: number, dy: number) {
  const box = await node(page, block).boundingBox();
  const grip = await page.locator(`[data-testid="handle-${handle}"]`).boundingBox();
  if (box === null || grip === null) throw new Error(`handle ${handle} is not displayed`);
  const before = await journalLength(page);
  await dragStart(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, dx, dy);
  expect(await journalLength(page)).toBe(before);
  const preview = await node(page, block).boundingBox();
  expect(preview).not.toEqual(box);
  await page.mouse.up();
  expect(await journalLength(page)).toBe(before + 1);
}

/** The stored placement members `values` names. */
async function stored(page: Page, block: string, values: Partial<Placement>) {
  const all = await placement(page, block);
  return Object.fromEntries(
    Object.keys(values).map((key) => [key, all[key as keyof Placement]]),
  ) as Partial<Placement>;
}

test.describe("the blocks of small", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "small");
    // The bare block at (40, 80) as in the arranger's own tables, the nested
    // block clear of every other block at (40, 224), above the map block.
    const refused = await page.evaluate(
      ([bare, nested]) => {
        const store = window.__tilie.store();
        return [
          store.dispatch({
            type: "set",
            changes: [{ target: { block: bare }, values: { x: 40, y: 80 } }],
          }),
          store.dispatch({
            type: "set",
            changes: [{ target: { block: nested }, values: { x: 40, y: 224 } }],
          }),
        ];
      },
      [SMALL.bare, SMALL.nested],
    );
    expect(refused).toEqual([null, null]);
    await setViewport(page, { x: 300, y: 40, zoom: 1 });
  });

  test.describe("choosing the mode", () => {
    for (const [mode, key] of [
      ["scale", "1"],
      ["box", "2"],
      ["stretch", "3"],
    ] as const) {
      test(`key ${key} and the ${mode} button choose ${mode} and show its handles`, async ({
        page,
      }) => {
        await select(page, [{ block: SMALL.bare }]);
        // Start from another mode, so the key visibly changes it.
        await page.keyboard.press(key === "1" ? "2" : "1");
        await page.keyboard.press(key);
        expect(await page.evaluate(() => window.__tilie.mode())).toBe(mode);
        for (const other of ["scale", "box", "stretch"] as const) {
          await expect(page.locator(`[data-testid="mode-${other}"]`)).toHaveAttribute(
            "aria-pressed",
            other === mode ? "true" : "false",
          );
        }
        expect((await shownHandles(page)).sort()).toEqual(
          HANDLES[mode].map((handle) => `handle-${handle}`).sort(),
        );

        await page.keyboard.press(key === "1" ? "2" : "1");
        await chooseMode(page, mode);
        await expect(page.locator(`[data-testid="mode-${mode}"]`)).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      });
    }

    test("the mode is remembered across selections", async ({ page }) => {
      await select(page, [{ block: SMALL.bare }]);
      await chooseMode(page, "stretch");
      await select(page, [{ block: SMALL.map }]);
      expect(await page.evaluate(() => window.__tilie.mode())).toBe("stretch");
      expect(await shownHandles(page)).toHaveLength(8);
    });
  });

  /** One resize: block, mode, handle, pixel delta, the values stored afterwards. */
  type Row = readonly [string, ResizeMode, Handle, number, number, Partial<Placement>];

  const ROWS: readonly Row[] = [
    [SMALL.bare, "box", "right", 20, 0, { width: 496.5771484375, height: null, x: 40, y: 80 }],
    [SMALL.bare, "box", "left", -21, 0, { width: 497.5771484375, x: 19, y: 80 }],
    [
      SMALL.bare,
      "box",
      "bottom-right",
      20,
      11,
      { width: 496.5771484375, height: 78.37890625, x: 40, y: 80 },
    ],
    [SMALL.bare, "box", "top", 0, -16, { height: 83.37890625, y: 64, x: 40 }],
    [SMALL.bare, "scale", "bottom-right", 229, 0, { scale: 1.48046875, x: 40, y: 80 }],
    [
      SMALL.bare,
      "scale",
      "top-left",
      -229,
      0,
      { scale: 1.48046875, x: -188.98046875, y: 47.62646484375 },
    ],
    [SMALL.bare, "scale", "bottom-right", -440, -60, { scale: 0.125, x: 40, y: 80 }],
    [SMALL.bare, "stretch", "right", 20, 0, { length: 420, spacing: 8, x: 40 }],
    [SMALL.bare, "stretch", "left", -21, 0, { length: 421, x: 19 }],
    [SMALL.bare, "stretch", "right", -500, 0, { length: 8, x: 40 }],
    // `nested` holds one item, so it has no gap: a vertical stretch sets its `margin` `V`, which
    // lies above the item (the item's default top moves down by `V`, the block's top and its
    // place origin stay) and again below it, so the block grows by 2V and the dragged edge stays
    // under the pointer at V = dy / 2 (scale 1, zoom 1): 51 / 2 = 25.5, 40 / 2 = 20, both on the
    // 1/2048 grid. `spacing` stays the fixture's 8.
    [
      SMALL.nested,
      "stretch",
      "bottom-right",
      200,
      51,
      { length: 600, spacing: 8, margin: 25.5, x: 40, y: 224 },
    ],
    [SMALL.nested, "stretch", "bottom", 0, 40, { length: 400, spacing: 8, margin: 20, y: 224 }],
  ];

  test.describe("dragging a handle", () => {
    for (const [block, mode, handle, dx, dy, values] of ROWS) {
      test(`${mode} ${handle} by (${dx}, ${dy}) on ${block}`, async ({ page }) => {
        await select(page, [{ block }]);
        await chooseMode(page, mode);
        await resizeBy(page, block, handle, dx, dy);
        expect(await stored(page, block, values)).toEqual(values);
        const [command] = await commandsFrom(page, START);
        expect(command?.type === "set" && command.changes.map((change) => change.target)).toEqual([
          { block },
        ]);
      });
    }

    test("box: dragging below the content's extent keeps the content's own size", async ({
      page,
    }) => {
      await select(page, [{ block: SMALL.bare }]);
      await chooseMode(page, "box");
      const content = await node(page, SMALL.bare).boundingBox();
      // Grow first, so the shrink below the content is a visible change.
      await resizeBy(page, SMALL.bare, "right", 20, 0);
      await resizeBy(page, SMALL.bare, "right", -60, 0);
      expect(await stored(page, SMALL.bare, { width: null, x: 40 })).toEqual({
        width: null,
        x: 40,
      });
      // The node is back at the content's own box, exactly as before the growth.
      expect(await node(page, SMALL.bare).boundingBox()).toEqual(content);
    });

    test("stretch: a block of one item at margin 0 shrinks no further, so a vertical shrink journals nothing", async ({
      page,
    }) => {
      await select(page, [{ block: SMALL.nested }]);
      await chooseMode(page, "stretch");
      const before = await placement(page, SMALL.nested);
      const box = await node(page, SMALL.nested).boundingBox();
      const grip = await page.locator('[data-testid="handle-bottom"]').boundingBox();
      if (grip === null) throw new Error("handle bottom is not displayed");
      await dragStart(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 0, -40);
      await page.mouse.up();
      expect(await journalLength(page)).toBe(START);
      expect(await placement(page, SMALL.nested)).toEqual(before);
      expect(await node(page, SMALL.nested).boundingBox()).toEqual(box);
    });

    test("box: a resize held in the edge zone pans and follows the pointer", async ({ page }) => {
      await select(page, [{ block: SMALL.bare }]);
      await chooseMode(page, "box");
      const box = await page.locator(".svelte-flow").boundingBox();
      const grip = await page.locator('[data-testid="handle-right"]').boundingBox();
      if (box === null || grip === null) throw new Error("the canvas is not displayed");
      // Whole pixels: WebKit and Firefox report pointer positions rounded, so a
      // fractional press or release point would travel a different distance.
      const start = {
        x: Math.round(grip.x + grip.width / 2),
        y: Math.round(grip.y + grip.height / 2),
      };
      const v0 = await viewportOf(page);
      const endX = Math.round(box.x + box.width - 20);
      await dragStart(page, start, endX - start.x, 0);
      // Hold in the zone until the canvas has panned.
      await expect.poll(async () => (await viewportOf(page)).x).not.toBe(v0.x);
      await page.mouse.up();
      const v1 = await viewportOf(page);
      expect(v1.zoom).toBe(1);
      // The pointer's travel in canvas units: its screen travel minus the pan.
      const travel = endX - start.x - (v1.x - v0.x);
      const width = Math.round((476.5771484375 + travel) * 2048) / 2048;
      expect(await stored(page, SMALL.bare, { width: 0, x: 0 })).toEqual({ width, x: 40 });
      expect(await journalLength(page)).toBe(START + 1);
    });

    test("box: a resize that changes no stored value journals nothing", async ({ page }) => {
      await select(page, [{ block: SMALL.bare }]);
      await chooseMode(page, "box");
      const before = await placement(page, SMALL.bare);
      const grip = await page.locator('[data-testid="handle-right"]').boundingBox();
      if (grip === null) throw new Error("handle right is not displayed");
      // Shrinking a box at its content's size asks for less than the content:
      // width stays null, which it already is.
      await dragStart(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, -20, 0);
      await page.mouse.up();
      expect(await journalLength(page)).toBe(START);
      expect(await placement(page, SMALL.bare)).toEqual(before);
    });

    test("undo restores the placement before a resize exactly", async ({ page }) => {
      await select(page, [{ block: SMALL.bare }]);
      await chooseMode(page, "scale");
      const before = await placement(page, SMALL.bare);
      await resizeBy(page, SMALL.bare, "top-left", -229, 0);
      await page.keyboard.press("ControlOrMeta+z");
      expect(await placement(page, SMALL.bare)).toEqual(before);
    });
  });
});

test.describe("a frame on the arranger", () => {
  test("a click selects a group's frame, whose corner scales it, nothing else moving", async ({
    page,
  }) => {
    await open(page, "bundles");
    await setViewport(page, { x: 40, y: 40, zoom: 1 });
    const block = BUNDLES.mixed;
    const frame = await framePoint(page, block, idAddress("group_1"));
    await page.mouse.click(frame.x, frame.y);
    expect(await selection(page)).toEqual([{ block, id: "group_1" }]);
    await chooseMode(page, "scale");
    expect((await shownHandles(page)).sort()).toEqual(
      CORNERS.map((handle) => `handle-${handle}`).sort(),
    );
    const grip = await page.locator('[data-testid="handle-bottom-right"]').boundingBox();
    if (grip === null) throw new Error("handle bottom-right is not displayed");
    await dragStart(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 40, 20);
    await page.mouse.up();
    expect(await journalLength(page)).toBe(OPENED_JOURNAL.bundles + 1);
    expect(
      await page.evaluate(
        (id) => JSON.parse(JSON.stringify(window.__tilie.store().view.blocks[id]?.places)),
        block,
      ),
    ).toEqual({
      group_1: { scale: 2290 / 2048 },
      group_2: { x: 8, y: 206.0390625 },
      annotations: { x: 8, y: 391.7734375 },
    });
  });
});

test.describe("a frame stretched vertically", () => {
  test("widens the gap between its cards by the pointer's travel, nothing else changing", async ({
    page,
  }) => {
    await open(page, "bundles");
    await setViewport(page, { x: 40, y: 40, zoom: 1 });
    const block = BUNDLES.mixed;
    const frame = await framePoint(page, block, idAddress("group_1"));
    await page.mouse.click(frame.x, frame.y);
    expect(await selection(page)).toEqual([{ block, id: "group_1" }]);
    await chooseMode(page, "stretch");
    const grip = await page.locator('[data-testid="handle-bottom"]').boundingBox();
    if (grip === null) throw new Error("handle bottom is not displayed");
    await dragStart(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 0, 44);
    await page.mouse.up();
    expect(await journalLength(page)).toBe(OPENED_JOURNAL.bundles + 1);
    expect(
      await page.evaluate(
        (id) => JSON.parse(JSON.stringify(window.__tilie.store().view.blocks[id]?.places)),
        block,
      ),
    ).toEqual({
      group_1: { spacing: 52 },
      group_2: { x: 8, y: 206.0390625 },
      annotations: { x: 8, y: 391.7734375 },
    });
  });
});

test.describe("a member's card in a group", () => {
  test("keeps its margin in proportion, and its group shortens again", async ({ page }) => {
    // Every pointer move of a Stretch drag re-solves the block's layout, which
    // takes several seconds in WebKit and Firefox under parallel load.
    test.slow();
    await open(page, "bundles");
    await setViewport(page, { x: 40, y: 40, zoom: 1 });
    const block = BUNDLES.shared;
    const places = () =>
      page.evaluate(
        (id) => JSON.parse(JSON.stringify(window.__tilie.store().view.blocks[id]?.places)),
        block,
      );
    /** Drag `handle` of the selected box by `dx`, journalling one command. */
    const drag = async (handle: Handle, dx: number) => {
      const before = await journalLength(page);
      const grip = await page.locator(`[data-testid="handle-${handle}"]`).boundingBox();
      if (grip === null) throw new Error(`handle ${handle} is not displayed`);
      await dragStart(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, dx, 0);
      await page.mouse.up();
      expect(await journalLength(page)).toBe(before + 1);
    };
    const others = { group_2: { x: 8, y: 245.9921875 }, page: { x: 8, y: 478.08203125 } };

    await select(page, [{ block, ...cardAddress("exposition") }]);
    await chooseMode(page, "box");
    await drag("right", 100);
    expect(await places()).toEqual({
      group_1: { cards: { exposition: { width: 651.39013671875 } } },
      ...others,
    });

    await chooseMode(page, "stretch");
    expect((await shownHandles(page)).sort()).toEqual(
      ["handle-bottom", "handle-bottom-right", "handle-right"].sort(),
    );
    await drag("right", 60);
    expect(await places()).toEqual({
      group_1: { length: 450.7890625, cards: { exposition: { width: 711.39013671875 } } },
      ...others,
    });
    const take = await element(page, block, cardAddress("take_1")).last().getAttribute("width");
    expect(take).toBe("602.1792");

    await select(page, [{ block, id: "group_1" }]);
    await drag("right", -120);
    expect(await places()).toEqual({
      group_1: { length: 349.2109375, cards: { exposition: { width: 591.3896484375 } } },
      ...others,
    });
  });
});

test.describe("the card of a member of two groups", () => {
  test("resizes in the second group's editor as the card that group's frame holds", async ({
    page,
  }) => {
    await open(page, "bundles");
    const block = BUNDLES.twoGroups;
    // Opening the editor moves the viewport to it; `enter` puts it back at zoom 1, the block
    // (at (640, 560)) at (80, 80), clear of the drawer the editor opens.
    await enter(page, { block, id: "g2" }, { x: -560, y: -480, zoom: 1 });
    await select(page, [{ block, ...cardAddress("t") }]);
    await chooseMode(page, "box");
    const grip = await page.locator('[data-testid="handle-right"]').boundingBox();
    if (grip === null) throw new Error("handle right is not displayed");
    await dragStart(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 100, 0);
    await page.mouse.up();
    // Inside the editor the change is an entry of its session; the journal waits for Done.
    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await newestCommand(page)).toMatchObject({ type: "set" });
    expect(await journalLength(page)).toBe(OPENED_JOURNAL.bundles);
    expect(
      await page.evaluate(
        (id) => JSON.parse(JSON.stringify(window.__tilie.store().view.blocks[id]?.places)),
        block,
      ),
    ).toEqual({ g2: { cards: { t: { width: 609.83056640625 } } } });
    const cards = element(page, block, cardAddress("t"));
    expect(await cards.first().getAttribute("width")).toBe("509.8306");
    expect(await cards.last().getAttribute("width")).toBe("609.8306");
  });
});
