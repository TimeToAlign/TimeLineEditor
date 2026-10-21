/**
 * The canvas on a touch screen. Touch points are dispatched through the
 * Chrome DevTools Protocol, which produces the touch and pointer events of a
 * real screen, one or two fingers; Playwright's own touchscreen only taps.
 * A double tap opens an editor, and outside the edited element closes it;
 * in a timeline editor a finger drags a band. Derivation in `README.md`
 * ("touch.spec.ts").
 */

import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Address } from "../packages/core/src/index.ts";
import { bandAddress } from "../packages/core/src/index.ts";
import {
  BUNDLES,
  bandOf,
  bandPoint,
  bandsOf,
  cardPoint,
  commandsFrom,
  editing,
  emptyPoint,
  enter,
  entriesLength,
  fixtureText,
  focusBand,
  frames,
  journalLength,
  middleOf,
  newestCommand,
  OPENED_JOURNAL,
  open,
  partCentre,
  placement,
  SMALL,
  select,
  selection,
  setViewport,
  viewportOf,
} from "./support.ts";

type Point = { x: number; y: number };

const START = OPENED_JOURNAL.small;
/**
 * The lead-in of a one-finger node drag. Chromium withholds the touch moves
 * inside its touch slop (15 px) at the start of a gesture, so the first move
 * Svelte Flow sees, which only starts the drag, lies past it; the finger first
 * travels this far to the right and the delta counts from there.
 */
const TOUCH_LEAD = 20;
const VIEW = { x: 20, y: 20, zoom: 1 };
/**
 * Chromium moves a tap onto a nearby clickable element (touch adjustment), so
 * a tap meant for a block's card lands at least this far from any other
 * drawn element.
 */
const FINGER = 14;

async function touch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  points: readonly Point[],
): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((point, id) => ({ x: point.x, y: point.y, id })),
  });
}

/**
 * Fingers from `from` each moved by its delta in `steps` moves, then lifted.
 * With `lead` the fingers first move `lead` px to the right, past a node's
 * drag threshold (see `LEAD_IN`), and the deltas count from there.
 */
async function gesture(
  cdp: CDPSession,
  from: readonly Point[],
  deltas: readonly Point[],
  lead = 0,
  steps = 10,
): Promise<void> {
  await touch(cdp, "touchStart", from);
  if (lead !== 0) {
    await touch(
      cdp,
      "touchMove",
      from.map((point) => ({ x: point.x + lead, y: point.y })),
    );
  }
  for (let step = 1; step <= steps; step += 1) {
    const at = from.map((point, i) => ({
      x: point.x + lead + ((deltas[i]?.x ?? 0) * step) / steps,
      y: point.y + ((deltas[i]?.y ?? 0) * step) / steps,
    }));
    await touch(cdp, "touchMove", at);
  }
  await touch(cdp, "touchEnd", []);
}

async function tap(page: Page, point: Point): Promise<void> {
  await page.touchscreen.tap(point.x, point.y);
}

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "touch points are dispatched through Chromium's protocol");
  await open(page, "small");
  await setViewport(page, VIEW);
});

test("a tap on a card selects the card, a tap on an element selects the element", async ({
  page,
}) => {
  await tap(page, await cardPoint(page, SMALL.map, FINGER));
  expect(await selection(page)).toEqual([{ block: SMALL.map, id: "melody", part: ["card"] }]);
  await tap(page, await partCentre(page, SMALL.nested, { id: "clt_2" }));
  expect(await selection(page)).toEqual([{ block: SMALL.nested, id: "clt_2" }]);
});

test("a one-finger drag moves a block by the drag in canvas units, grid-snapped", async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await gesture(cdp, [await cardPoint(page, SMALL.map, FINGER)], [{ x: 101, y: 37 }], TOUCH_LEAD);
  const { x, y } = await placement(page, SMALL.map);
  expect({ x, y }).toEqual({ x: 104, y: 360 });
  expect(await commandsFrom(page, START)).toEqual([
    { type: "set", changes: [{ target: { block: SMALL.map }, values: { x: 104, y: 360 } }] },
  ]);
});

test("a one-finger drag on the empty canvas pans", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await gesture(cdp, [await emptyPoint(page, -20, 100)], [{ x: 30, y: 40 }]);
  expect(await viewportOf(page)).toEqual({ x: 50, y: 60, zoom: 1 });
});

test("a pinch changes the zoom", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  const centre = await emptyPoint(page, -20, 200);
  const before = (await viewportOf(page)).zoom;
  await gesture(
    cdp,
    [
      { x: centre.x, y: centre.y - 20 },
      { x: centre.x, y: centre.y + 20 },
    ],
    [
      { x: 0, y: -60 },
      { x: 0, y: 60 },
    ],
  );
  expect((await viewportOf(page)).zoom).not.toBe(before);
  expect(await journalLength(page)).toBe(START);
});

test("the resize mode buttons respond to taps and show their handles", async ({ page }) => {
  // The block's margin is narrower than a finger, so the block is selected through the hook.
  await select(page, [{ block: SMALL.map }]);
  for (const [mode, handles] of [
    ["box", 8],
    ["stretch", 8],
    ["scale", 4],
  ] as const) {
    const button = page.locator(`[data-testid="mode-${mode}"]`);
    await tap(page, await centre(button));
    await expect(button).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => window.__tilie.mode())).toBe(mode);
    await expect(page.locator('[data-testid^="handle-"]')).toHaveCount(handles);
  }
});

test("the marquee toggle turns a one-finger drag into a marquee", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  const toggle = page.locator('[data-testid="marquee"]');
  await tap(page, await centre(toggle));
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // At zoom 0.4, canvas (-30, -30) to (480, 140): the bare block whole, no other;
  // the finger stays clear of the pane's 40 px auto-pan zone.
  const half = { x: 60, y: 60, zoom: 0.4 };
  await setViewport(page, half);
  await gesture(cdp, [await emptyPoint(page, -30, -30)], [{ x: 204, y: 68 }]);
  expect(await selection(page)).toEqual([{ block: SMALL.bare }]);
  expect(await viewportOf(page)).toEqual(half);
});

test("a double tap on a card opens its timeline editor", async ({ page }) => {
  const point = await cardPoint(page, SMALL.map, FINGER);
  await tap(page, point);
  await tap(page, point);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block: SMALL.map, id: "melody" }, kind: "timeline" }]);
});

test.describe("in an editor", () => {
  test.use({ reducedMotion: "reduce" });

  test("a double tap on the faded surroundings closes the innermost editor, once", async ({
    page,
  }) => {
    await enter(page, { block: SMALL.map }, VIEW);
    await enter(page, { block: SMALL.map, id: "melody" }, VIEW);
    const point = await emptyPoint(page, -20, 100);
    await tap(page, point);
    await tap(page, point);
    const bundle = [{ target: { block: SMALL.map }, kind: "bundle" }];
    await expect.poll(() => editing(page)).toEqual(bundle);
    // A double-click the engine derives from the two taps closes nothing more.
    await frames(page);
    expect(await editing(page)).toEqual(bundle);
  });

  test("a band dragged with one finger moves across the line", async ({ page }) => {
    const block = BUNDLES.mixed;
    const flowControl = bandAddress("score", "flow_control");
    const conversionMaps = bandAddress("score", "conversion_maps");
    const score: Address = { block, id: "score" };
    await page.evaluate((text) => window.__tilie.load(text), fixtureText("bundles"));
    await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles);
    await setViewport(page, VIEW);
    expect(await page.evaluate((address) => window.__tilie.open(address), score)).toBeNull();
    await expect.poll(() => viewportOf(page)).not.toEqual(VIEW);
    const opened = await viewportOf(page);
    // The drawer leaves the phone's arranger too narrow; closed, the edited card is centred again.
    await tap(page, await centre(page.getByRole("button", { name: "Close inspector" })));
    await expect.poll(() => viewportOf(page)).not.toEqual(opened);
    const focused = await focusBand(page, block, flowControl, 2);

    const from = await bandPoint(page, block, flowControl, FINGER);
    // No visible entry lies above the release: the band goes before the first,
    // the conversion maps band.
    const release =
      middleOf(await bandOf(page, block, conversionMaps)) -
      (await bandOf(page, block, flowControl)).rect.height;
    const cdp = await page.context().newCDPSession(page);
    await gesture(cdp, [from], [{ x: 0, y: release - from.y }], TOUCH_LEAD);

    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await newestCommand(page)).toEqual({
      type: "set",
      changes: [
        {
          target: score,
          values: {
            order: ["children", "flow_control", "conversion_maps", "line", "markers", "regions"],
          },
        },
      ],
    });
    expect(await bandsOf(page, block, "score")).toEqual([
      { address: flowControl, facet: "flow_control", level: 2, elements: 1 },
      { address: conversionMaps, facet: "conversion_maps", level: 1, elements: 2 },
      { address: bandAddress("score", "markers"), facet: "markers", level: -1, elements: 2 },
    ]);
    expect(await selection(page)).toEqual([{ block, ...flowControl }]);
    expect(await viewportOf(page)).toEqual(focused);
  });
});

async function centre(locator: import("@playwright/test").Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("not displayed");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
