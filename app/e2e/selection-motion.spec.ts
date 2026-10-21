/**
 * The selection through changes and editors, and the motion of a released
 * card reorder: a change keeps the selection, gesture by gesture; opening
 * an editor selects the edited element; a click outside the edited element
 * deselects; a double-click on it centres the view on it again; a released
 * member card moves from where it was dropped to its new place. The
 * expected values are derived in `README.md` ("selection-motion.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Address } from "../packages/core/src/index.ts";
import type { Handle, ResizeMode, Viewport } from "./support.ts";
import {
  addressSelector,
  arranger,
  BUNDLES,
  editing,
  emptyPoint,
  entriesLength,
  framePoint,
  GROUPS,
  journalLength,
  open,
  partCentre,
  select,
  selection,
  setViewport,
  tab,
  toScreen,
  viewportOf,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 } });

const VIEW = { x: 40, y: 40, zoom: 1 };
const SHARED = BUNDLES.shared;
const BLOCK: Address = { block: SHARED };
const GROUP_2: Address = { block: SHARED, id: "group_2" };

/** The card of timeline `id` in the shared-parent bundle. */
function card(id: string): Address {
  return { block: SHARED, id, part: ["card"] };
}

/** How many entries the open level holds: the journal's on the arranger, the session's in an editor. */
function changes(page: Page): Promise<number> {
  return entriesLength(page);
}

/** Whether the open level has an undone change to redo. */
function canRedo(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__tilie.store().canRedo);
}

/** Drag handle `handle` of the resize toolbar in `mode` by `(dx, dy)` and wait until it is stored. */
async function resize(page: Page, mode: ResizeMode, handle: Handle, dx: number, dy: number) {
  await page.locator(`[data-testid="mode-${mode}"]`).click();
  const grip = await page.locator(`[data-testid="handle-${handle}"]`).boundingBox();
  if (grip === null) throw new Error(`handle ${handle} is not displayed`);
  await page.evaluate(() => Object.assign(window, { viewBefore: window.__tilie.store().view }));
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => window.__tilie.store().view !== Reflect.get(window, "viewBefore")),
    )
    .toBe(true);
}

/**
 * Open the editor of `target` through the hook and wait until the view has
 * stopped moving there; the viewport it settled at.
 */
async function openSettled(page: Page, target: Address): Promise<Viewport> {
  const before = await viewportOf(page);
  expect(await page.evaluate((address) => window.__tilie.open(address), target)).toBeNull();
  await expect.poll(() => viewportOf(page)).not.toEqual(before);
  let last = await viewportOf(page);
  await expect
    .poll(async () => {
      const now = await viewportOf(page);
      const still = JSON.stringify(now) === JSON.stringify(last);
      last = now;
      return still;
    })
    .toBe(true);
  return last;
}

test.describe("the selection", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeEach(async ({ page }) => {
    await open(page, "bundles");
    await setViewport(page, VIEW);
  });

  test("a change keeps the selection, on the arranger and in every editor", async ({ page }) => {
    await select(page, [BLOCK]);
    await resize(page, "box", "right", 40, 0);
    expect(await selection(page)).toEqual([BLOCK]);

    await select(page, [GROUP_2]);
    await resize(page, "stretch", "right", 40, 0);
    expect(await selection(page)).toEqual([GROUP_2]);
    await arranger(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => canRedo(page)).toBe(true);
    expect(await selection(page)).toEqual([GROUP_2]);

    await openSettled(page, BLOCK);
    expect(await selection(page)).toEqual([BLOCK]);
    await resize(page, "box", "bottom", 0, 30);
    expect(await selection(page)).toEqual([BLOCK]);

    await openSettled(page, GROUP_2);
    expect(await selection(page)).toEqual([GROUP_2]);
    await resize(page, "box", "bottom", 0, 30);
    expect(await selection(page)).toEqual([GROUP_2]);

    await tab(page, "Properties").click();
    const height = page.locator('input[name="height"]');
    await height.fill("400");
    await height.press("Enter");
    await expect.poll(() => changes(page)).toBe(2);
    expect(await selection(page)).toEqual([GROUP_2]);
    await arranger(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => canRedo(page)).toBe(true);
    expect(await selection(page)).toEqual([GROUP_2]);

    await openSettled(page, { block: SHARED, id: "take_2" });
    expect(await selection(page)).toEqual([card("take_2")]);
    await resize(page, "box", "right", 30, 0);
    expect(await selection(page)).toEqual([card("take_2")]);
  });

  test("opening an editor selects the edited element", async ({ page }) => {
    const frame = await framePoint(page, SHARED, { id: "group_2" });
    await page.mouse.dblclick(frame.x, frame.y);
    await expect.poll(() => editing(page)).toEqual([{ target: GROUP_2, kind: "group" }]);
    expect(await selection(page)).toEqual([GROUP_2]);

    await select(page, [card("recapitulation")]);
    await arranger(page).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => editing(page)).toHaveLength(2);
    expect(await selection(page)).toEqual([card("recapitulation")]);

    const first: Address = { block: SHARED, id: "recapitulation_first" };
    await openSettled(page, first);
    expect(await selection(page)).toEqual([first]);
  });

  test("a click outside the edited element deselects; Shift keeps the selection", async ({
    page,
  }) => {
    await openSettled(page, GROUP_2);
    await setViewport(page, VIEW);
    // Faded parts take no pointer, so the click aims at the middle of the faded frame's rectangle.
    const faded = await partCentre(page, SHARED, { id: "group_1" });

    await page.keyboard.down("Shift");
    await page.mouse.click(faded.x, faded.y);
    await page.keyboard.up("Shift");
    expect(await selection(page)).toEqual([GROUP_2]);
    await page.mouse.click(faded.x, faded.y);
    await expect.poll(() => selection(page)).toEqual([]);

    await select(page, [card("take_2")]);
    const pane = await emptyPoint(page, -20, 450);
    await page.mouse.click(pane.x, pane.y);
    await expect.poll(() => selection(page)).toEqual([]);
    expect(await editing(page)).toEqual([{ target: GROUP_2, kind: "group" }]);

    await page.mouse.dblclick(faded.x, faded.y);
    await expect.poll(() => editing(page)).toEqual([]);
  });

  test("a double-click on the edited element centres the view on it again", async ({ page }) => {
    const centred = await openSettled(page, GROUP_2);
    const journal = await journalLength(page);
    await setViewport(page, VIEW);
    const own = await framePoint(page, SHARED, { id: "group_2" });
    await page.mouse.dblclick(own.x, own.y);
    await expect.poll(() => viewportOf(page)).toEqual(centred);
    expect(await editing(page)).toEqual([{ target: GROUP_2, kind: "group" }]);
    expect(await journalLength(page)).toBe(journal);
    expect(await changes(page)).toBe(0);
  });
});

/** A client rectangle as `getBoundingClientRect` gives it. */
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What the page shows of the released card on one animation frame. */
interface Shown {
  /** The copy that settles, where it lies; `null` once it is gone. */
  readonly copy: Rect | null;
  /** The card's own rectangle, where it lies, and whether it is hidden. */
  readonly card: Rect;
  readonly hidden: boolean;
}

test.describe("the release of a card reorder", () => {
  test.use({ reducedMotion: "no-preference" });

  test("moves the card from where it was dropped to its new place", async ({ page }) => {
    const block = GROUPS.child;
    await open(page, "groups");
    await setViewport(page, VIEW);
    await openSettled(page, { block, id: "group_1" });
    await setViewport(page, VIEW);
    const secondHalf = { id: "second-half", part: ["card"] } as const;
    const from = await framePoint(page, block, secondHalf);
    const to = await toScreen(page, 0, 172);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, to.y, { steps: 10 });

    // Every frame from the release on, what is shown of the card, read in the page.
    const dropped = await page.evaluate(
      ({ id, cardSelector }) => {
        const node = document.querySelector(`.svelte-flow__node[data-id="${id}"]`);
        const rect = (element: Element): Rect => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const shown = (): Shown => {
          const copy = node?.querySelector(".tilie-dragged");
          const card = [...(node?.querySelectorAll(cardSelector) ?? [])].at(-1);
          if (card === undefined) throw new Error("the card is not drawn");
          return {
            copy: copy == null ? null : rect(copy),
            card: rect(card),
            hidden: card.getAttribute("visibility") === "hidden",
          };
        };
        const frames: Shown[] = [];
        Object.assign(window, { released: frames });
        window.addEventListener(
          "pointerup",
          () => {
            const record = () => {
              frames.push(shown());
              if (frames.length < 90) requestAnimationFrame(record);
            };
            requestAnimationFrame(record);
          },
          { capture: true, once: true },
        );
        return shown();
      },
      { id: block, cardSelector: `.tilie-block svg ${addressSelector(secondHalf)}` },
    );
    await page.mouse.up();
    await expect.poll(() => entriesLength(page)).toBe(1);
    await expect
      .poll(() => page.evaluate((): number => Reflect.get(window, "released").length))
      .toBe(90);
    const frames = await page.evaluate((): Shown[] => Reflect.get(window, "released"));

    expect(dropped.hidden).toBe(true);
    if (dropped.copy === null) throw new Error("no copy follows the pointer");
    const [first] = frames;
    expect(first?.copy).toEqual(dropped.copy);
    expect(first?.hidden).toBe(true);
    const last = frames.at(-1);
    expect(last?.copy).toBeNull();
    expect(last?.hidden).toBe(false);
    // The copy moves monotonically from the drop to the card's new place, where it hands over.
    const ys = frames.flatMap(({ copy }) => (copy === null ? [] : [copy.y]));
    const upward = (last?.card.y ?? 0) < dropped.copy.y;
    expect(ys.length).toBeGreaterThan(2);
    for (const [i, y] of ys.entries()) {
      const before = ys[i - 1];
      if (before !== undefined) expect(upward ? y <= before : y >= before).toBe(true);
    }
  });
});

test.describe("a stretch in the group editor", () => {
  test.use({ reducedMotion: "reduce" });

  /** The stored place of `group_2` in the shared-parent bundle. */
  function place(page: Page): Promise<unknown> {
    return page.evaluate(
      (id) =>
        JSON.parse(JSON.stringify(window.__tilie.store().view.blocks[id]?.places.group_2 ?? null)),
      SHARED,
    );
  }

  test("grows the recapitulation's frame and members larger as well as smaller", async ({
    page,
  }) => {
    await open(page, "bundles");
    await setViewport(page, VIEW);
    await openSettled(page, GROUP_2);
    // The frame's right edge clear of the drawer, at zoom 1.
    await setViewport(page, { x: -400, y: 40, zoom: 1 });
    for (const box of [GROUP_2, card("recapitulation")]) {
      await select(page, [box]);
      await resize(page, "stretch", "right", 60, 0);
      expect(await place(page)).toEqual({ length: 460 });
      await arranger(page).focus();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => place(page)).toBeNull();
      await select(page, [box]);
      await resize(page, "stretch", "right", -60, 0);
      expect(await place(page)).toEqual({ length: 340, width: 567.39013671875 });
      await arranger(page).focus();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => place(page)).toBeNull();
    }
  });
});
