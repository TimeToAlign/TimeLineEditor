/**
 * The three resize modes on `small`: choosing the mode by button and by key,
 * the handles each mode shows, and the stored values after dragging one
 * corner and one edge handle in each mode; and on `bundles`, a group's frame
 * scaled on the arranger. Derivation in `README.md` ("resize.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Handle, Placement, ResizeMode } from "./support.ts";
import {
  BUNDLES,
  commandsFrom,
  dragStart,
  framePoint,
  journalLength,
  node,
  OPENED_JOURNAL,
  open,
  placement,
  SMALL,
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
          store.dispatch({ type: "set", changes: [{ target: bare, values: { x: 40, y: 80 } }] }),
          store.dispatch({ type: "set", changes: [{ target: nested, values: { x: 40, y: 224 } }] }),
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
        await page.evaluate((id) => window.__tilie.select([id]), SMALL.bare);
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
      await page.evaluate((id) => window.__tilie.select([id]), SMALL.bare);
      await chooseMode(page, "stretch");
      await page.evaluate((id) => window.__tilie.select([id]), SMALL.map);
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
    [SMALL.bare, "stretch", "right", 20, 0, { length: 420, spacing: 1, x: 40 }],
    [SMALL.bare, "stretch", "left", -21, 0, { length: 421, x: 19 }],
    [SMALL.bare, "stretch", "right", -500, 0, { length: 8, x: 40 }],
    [SMALL.bare, "stretch", "bottom", 0, 32, { spacing: 3, length: 400, y: 80 }],
    [SMALL.nested, "stretch", "bottom", 0, 51, { spacing: 2, length: 400, y: 224 }],
    [SMALL.nested, "stretch", "bottom-right", 200, 51, { length: 600, spacing: 2, x: 40, y: 224 }],
  ];

  test.describe("dragging a handle", () => {
    for (const [block, mode, handle, dx, dy, values] of ROWS) {
      test(`${mode} ${handle} by (${dx}, ${dy}) on ${block}`, async ({ page }) => {
        await page.evaluate((id) => window.__tilie.select([id]), block);
        await chooseMode(page, mode);
        await resizeBy(page, block, handle, dx, dy);
        expect(await stored(page, block, values)).toEqual(values);
        const [command] = await commandsFrom(page, START);
        expect(command?.type === "set" && command.changes.map((change) => change.target)).toEqual([
          block,
        ]);
      });
    }

    test("box: dragging below the content's extent keeps the content's own size", async ({
      page,
    }) => {
      await page.evaluate((id) => window.__tilie.select([id]), SMALL.bare);
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

    test("stretch: a shrink to the floor and a grow across the kink solve exactly", async ({
      page,
    }) => {
      await page.evaluate((id) => window.__tilie.select([id]), SMALL.nested);
      await chooseMode(page, "stretch");
      // nested's height is 76.98828125 + 16 v below spacing 0.9146… and
      // 44.9765625 + 51 v above it: a target of 95.9765625 − 40 lies below the
      // height at the floor 1/4 (80.98828125), so the solve stops at the floor.
      await resizeBy(page, SMALL.nested, "bottom", 0, -40);
      expect(await stored(page, SMALL.nested, { spacing: 0, y: 0 })).toEqual({
        spacing: 1 / 4,
        y: 224,
      });
      // From there, 80.98828125 + 35 = 44.9765625 + 51 v gives
      // v = 71.01171875 / 51 = 1.392386…; the largest multiple of 1/2048 whose
      // height stays within the pointer is 2851/2048.
      await resizeBy(page, SMALL.nested, "bottom", 0, 35);
      expect(await stored(page, SMALL.nested, { spacing: 0, y: 0 })).toEqual({
        spacing: 2851 / 2048,
        y: 224,
      });
    });

    test("box: a resize held in the edge zone pans and follows the pointer", async ({ page }) => {
      await page.evaluate((id) => window.__tilie.select([id]), SMALL.bare);
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
      await page.evaluate((id) => window.__tilie.select([id]), SMALL.bare);
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
      await page.evaluate((id) => window.__tilie.select([id]), SMALL.bare);
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
    const frame = await framePoint(page, block, "group_1");
    await page.mouse.click(frame.x, frame.y);
    expect(await selection(page)).toEqual([`${block}/group_1`]);
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
      group_1: { scale: 2341 / 2048 },
      group_2: { x: 8, y: 176.3671875 },
      annotations: { x: 8, y: 358.50390625 },
    });
  });
});
