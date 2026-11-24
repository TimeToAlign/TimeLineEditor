/**
 * The editors on the canvas: entering by double-click and Enter, the
 * viewport's move there and back, the faded and inert surroundings, nested
 * editors, Done folding a session into one journal entry undone by runs of
 * its closed sessions, Cancel and its question, Escape, moving one item or several
 * selected ones in the bundle editor, reordering a group's members in the
 * group editor, the refusal of a change outside the
 * edited element, the Journal tab, and a member's card stretching its group
 * in its timeline editor, and a pan during the view's move kept when the
 * canvas's pane settles. The expected values are derived in
 * `README.md` ("editors.spec.ts"); the double tap is in `touch.spec.ts`.
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf, nodePosition } from "../packages/arranger/src/drawing.ts";
import { FOCUS_DURATION, focusViewport } from "../packages/arranger/src/focus.ts";
import type { PaneSource } from "../packages/arranger/src/pane.ts";
import { PANE_SETTLE } from "../packages/arranger/src/pane.ts";
import type { Address, ElementAddress } from "../packages/core/src/index.ts";
import { addressKey, cardAddress, isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import type { Drawing } from "../packages/layout/src/index.ts";
import { attributeText } from "../packages/writers/src/svg.ts";
import { FONT_METRICS } from "./schema.ts";
import {
  addressSelector,
  arranger,
  BUNDLES,
  byKey,
  cardsOf,
  dispatch,
  done,
  drag,
  dragStart,
  drawer,
  editing,
  element,
  emptyPoint,
  enter,
  entriesLength,
  fixtureText,
  framePoint,
  GROUPS,
  graphicalOrder,
  journalLength,
  marginPoint,
  messageTexts,
  newestCommand,
  node,
  nodeTransform,
  OPENED_JOURNAL,
  open,
  panel,
  paneOf,
  partCentre,
  placedAt,
  placement,
  select,
  selection,
  setViewport,
  storeText,
  structure,
  tab,
  tabs,
  titleLine,
  toScreen,
  viewportOf,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const VIEW = { x: 40, y: 40, zoom: 1 };
const MIXED = BUNDLES.mixed;
const START = OPENED_JOURNAL.bundles;

/** The element `id` of `bmixed0000`, as a selection, an editor or a command names it. */
const mixed = (id: string): Address => ({ block: MIXED, id });
/** The block `bmixed0000`, its bundle's address. */
const BUNDLE: Address = { block: MIXED };

/**
 * The drawing of `block` in `bundles.tle.json`, by the editor's own drawing
 * code run outside the page, for the canvas's pane `pane` (layout's default
 * view without one).
 */
function bundlesDrawing(block: string, pane?: PaneSource): Drawing {
  const workspace = readWorkspace(fixtureText("bundles"));
  if (isLoadError(workspace)) throw new Error("bundles.tle.json is refused");
  const found = workspace.view.blocks[block];
  if (found === undefined) throw new Error(`block ${block} is missing`);
  return drawingOf(found, workspace.view.graphical, FONT_METRICS, undefined, pane);
}

/**
 * The drawn position of every item of `block` in `bundles.tle.json` (each
 * frame and ungrouped card, from the place origin, defaults applied), for
 * the canvas's pane `pane` (`bundlesDrawing`).
 */
function drawnPlaces(block: string, pane?: PaneSource): Record<string, { x: number; y: number }> {
  const drawing = bundlesDrawing(block, pane);
  return Object.fromEntries(
    drawing.boxes.flatMap(({ key, item }) =>
      key === null || item === undefined ? [] : [[key.item, { x: item.place.x, y: item.place.y }]],
    ),
  );
}

/**
 * How far right of its node's left edge `bmixed0000`'s place origin lies in its drawing at the
 * canvas's pane `pane`: its ancestor card of `recording` reaches that far left of its items. The
 * card is elided by default, at the automatic proportion, which reads the pane (section 8.9), so
 * the shift is the drawing's origin abscissa at that pane; at layout's default view it is
 * 121.70361328125 (the arranger's tests README, "`bundle_mixed`'s `score`", With `recording`'s
 * ancestor card), which `MIXED_DEFAULT_SHIFT` states and the bundle editor's first case checks.
 */
function mixedShift(pane: PaneSource): number {
  return bundlesDrawing(MIXED, pane).origin.x;
}

/** `mixedShift` at layout's default view, derived in the arranger's tests README. */
const MIXED_DEFAULT_SHIFT = 121.70361328125;

/**
 * The canvas's pane in an editor: the arranger's size at the page's 1600 × 1000 with the
 * drawer open (README, "editors.spec.ts").
 */
const EDITOR_PANE = { view: { width: 1087, height: 968 } };

/** `mixedShift` at `EDITOR_PANE`: layout's record at that pane (README, "editors.spec.ts"). */
const MIXED_EDITOR_SHIFT = 117.44561314174106;

/**
 * `mixedShift` in the editor open now: the canvas's pane is `EDITOR_PANE`, and the editor's
 * drawing code gives `MIXED_EDITOR_SHIFT` there, which is returned. A value read from the page
 * then waits for the drawing at that pane, which settles `PANE_SETTLE` after the drawer opened.
 */
async function editorShift(page: Page): Promise<number> {
  const pane = await paneOf(page);
  expect(pane).toEqual(EDITOR_PANE);
  expect(mixedShift(pane)).toBe(MIXED_EDITOR_SHIFT);
  return MIXED_EDITOR_SHIFT;
}

/**
 * A held card's width in `bmixed0000` at length `L`: `Wc(L) = 145.052001953125 + L` (the
 * arranger's tests README, "`bundle_mixed`'s `score`", Widths: the name column, `recording`'s
 * ancestor line running on to the left, half of `excerpt`'s `88 200 smp` label beyond the end).
 */
function mixedCardWidth(length: number): number {
  return 145.052001953125 + length;
}

/** A drawing abscissa as a drawn `rect`'s `x` attribute reads back: the writer's text, as a number. */
function drawnX(value: number): number {
  return Number(attributeText(value));
}

/** Whether `value` is a multiple of 1/2048, so a quantization to that step leaves it unchanged. */
function onFreeGrid(value: number): boolean {
  return Number.isInteger(value * 2048);
}

/**
 * `bmixed0000`'s `group_1` frame as drawn, its `x`, `y`, `width` and
 * `height` in drawing units: the attributes of its `rect`, never its screen box, which
 * an engine lays out at its own layout unit (a node growing changes the
 * `<svg>`'s scale in the last digits).
 */
function frameRect(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return element(page, MIXED, { id: "group_1" })
    .first()
    .evaluate((rect) => {
      const read = (name: string) => Number(rect.getAttribute(name));
      return { x: read("x"), y: read("y"), width: read("width"), height: read("height") };
    });
}

/** Block `id`'s stored places. */
function places(page: Page, id: string): Promise<unknown> {
  return page.evaluate(
    (block) => JSON.parse(JSON.stringify(window.__tilie.store().view.blocks[block]?.places)),
    id,
  );
}

const SET_PLACE = {
  type: "set",
  changes: [{ target: mixed("group_1"), values: { place: { length: 300 } } }],
};
const SET_NAME = {
  type: "set",
  changes: [{ target: mixed("score"), values: { name: "S" } }],
};

/** The `set` of the name of `bmixed0000`'s timeline `id`. */
const rename = (id: string, name: string) => ({
  type: "set",
  changes: [{ target: mixed(id), values: { name } }],
});

/** The names of `bmixed0000`'s roots `score`, `performance` and `annotations` in the view. */
function rootNames(page: Page): Promise<(string | null)[]> {
  return page.evaluate((block) => {
    const timelines = window.__tilie.store().view.blocks[block]?.manifest.timelines ?? [];
    return ["score", "performance", "annotations"].map(
      (id) => timelines.find((timeline) => timeline.id === id)?.name ?? null,
    );
  }, MIXED);
}

function editingBar(page: Page) {
  return page.getByRole("group", { name: "Editing" });
}

/**
 * The rows of a journal list, by role: the panel's top list (named
 * "Journal") or the changes a session row's disclosure shows, the first list
 * inside that row. Only expanded sessions show their changes, so the rows
 * of an unexpanded list are its own.
 */
function journalRows(within: Locator) {
  return within.getByRole("list").first().getByRole("listitem");
}

function editingPath(page: Page) {
  return page.getByRole("list", { name: "Editing path" }).getByRole("listitem");
}

/**
 * Of the parts of block `id` showing its structure (`support.ts`'s
 * `structure`: a frame, a line, the title, a card or a group's title), each
 * address's key (`addressKey`) with whether its parts carry `data-outside`:
 * `true` when all do, `false` when none does, `"mixed"` otherwise.
 */
async function outside(page: Page, id: string): Promise<Record<string, boolean | "mixed">> {
  const found: Record<string, boolean | "mixed"> = {};
  for (const { address, outside: faded } of await structure(page, id)) {
    const key = addressKey(address);
    const seen = found[key];
    found[key] = seen === undefined || seen === faded ? faded : "mixed";
  }
  return found;
}

/** The record `outside` gives for the addresses of `entries`, each with its value. */
function keyed(entries: readonly (readonly [ElementAddress, boolean])[]): Record<string, boolean> {
  return Object.fromEntries(entries.map(([address, value]) => [addressKey(address), value]));
}

test.describe("on bundles", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "bundles");
    await setViewport(page, VIEW);
  });

  for (const { what, point, target, kind, word, text, name } of [
    {
      what: "the block's margin opens the bundle editor",
      point: (page: Page) => marginPoint(page, MIXED),
      target: BUNDLE,
      kind: "bundle",
      word: "Bundle" as const,
      text: "Bundle Mixed",
      name: "Mixed",
    },
    {
      what: "a frame opens the group editor",
      point: (page: Page) => framePoint(page, MIXED, { id: "group_1" }),
      target: mixed("group_1"),
      kind: "group",
      word: "Group" as const,
      text: "Group Performance",
      name: "Performance",
    },
    {
      what: "a card opens the timeline editor",
      point: (page: Page) => framePoint(page, MIXED, cardAddress("annotations")),
      target: mixed("annotations"),
      kind: "timeline",
      word: "Timeline" as const,
      text: "Timeline Annotations",
      name: "Annotations",
    },
  ]) {
    test(`a double-click on ${what}`, async ({ page }) => {
      await expect(tabs(page)).toBeHidden();
      const { x, y } = await point(page);
      await page.mouse.dblclick(x, y);
      await expect.poll(() => editing(page)).toEqual([{ target, kind }]);
      // Opened while the drawer was closed: the drawer opens on the level tab.
      await expect(tabs(page).getByRole("tab")).toHaveText([
        word,
        "Properties",
        "Metadata",
        "Manifest",
        "Journal",
        "Timestamp",
        "Matchstamp",
        "Elisions",
      ]);
      await expect(tab(page, word)).toHaveAttribute("aria-selected", "true");
      await expect(await titleLine(page, word)).toHaveText(text);
      await expect(editingPath(page)).toHaveText([name]);
      expect(await journalLength(page)).toBe(START);
    });
  }

  test("Enter opens the editor of the one selected box", async ({ page }) => {
    await select(page, [mixed("group_2")]);
    await arranger(page).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => editing(page)).toEqual([{ target: mixed("group_2"), kind: "group" }]);
  });

  test("the viewport moves to the opened editor and back on Done", async ({ page }) => {
    expect(await viewportOf(page)).toEqual(VIEW);
    const { x, y } = await marginPoint(page, MIXED);
    await page.mouse.dblclick(x, y);
    await expect.poll(() => editing(page)).toEqual([{ target: BUNDLE, kind: "bundle" }]);
    await expect.poll(() => viewportOf(page)).not.toEqual(VIEW);
    await editingBar(page).getByRole("button", { name: "Done", exact: true }).click();
    await expect.poll(() => editing(page)).toEqual([]);
    await expect.poll(() => viewportOf(page)).toEqual(VIEW);
  });

  test("outside the edited element everything is faded and inert", async ({ page }) => {
    await enter(page, mixed("group_1"), VIEW);
    const group = [{ target: mixed("group_1"), kind: "group" }];
    expect(await outside(page, MIXED)).toEqual(
      keyed([
        [{ part: ["name"] }, true],
        [{ id: "group_1" }, false],
        [{ id: "group_1", part: ["name"] }, false],
        [cardAddress("score"), false],
        [{ id: "score" }, false],
        [cardAddress("performance"), false],
        [{ id: "performance" }, false],
        [{ id: "group_2" }, true],
        [{ id: "group_2", part: ["name"] }, true],
        [cardAddress("page"), true],
        [{ id: "page" }, true],
        [cardAddress("excerpt"), true],
        [cardAddress("recording"), true],
        [{ id: "recording" }, true],
        [{ id: "excerpt" }, true],
        [cardAddress("annotations"), true],
        [{ id: "annotations" }, true],
      ]),
    );
    for (const other of [BUNDLES.twoGroups, BUNDLES.ungrouped]) {
      // Another block is faded and inert as a whole, through its node, not element by element.
      const whole = node(page, other);
      await expect(whole).toHaveClass(/(^|\s)tilie-outside(\s|$)/);
      await expect(whole).not.toHaveClass(/(^|\s)(selectable|draggable)(\s|$)/);
      await expect(whole).toHaveCSS("opacity", "0.3");
      await expect(whole).toHaveCSS("pointer-events", "none");
      await expect(whole.locator("[data-outside]")).toHaveCount(0);
      const [first] = await cardsOf(page, other);
      const drawn =
        first === undefined ? null : await element(page, other, first).first().boundingBox();
      if (drawn === null) throw new Error(`${other} draws no card`);
      const centre = { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height / 2 };
      await page.mouse.move(centre.x, centre.y);
      expect(
        await page.evaluate(
          ({ x, y }) =>
            document.elementFromPoint(x, y)?.classList.contains("svelte-flow__pane") === true,
          centre,
        ),
      ).toBe(true);
      await expect(whole.locator('.tilie-mark[data-mark="hover"]')).toHaveCount(0);
    }

    // A click outside the edited element, on another block or on a faded part of its own, deselects.
    for (const [block, address] of [
      [BUNDLES.twoGroups, cardAddress("u")],
      [MIXED, cardAddress("annotations")],
    ] as const) {
      await select(page, [mixed("score")]);
      const { x, y } = await partCentre(page, block, address);
      await page.mouse.click(x, y);
      await expect.poll(() => selection(page)).toEqual([]);
      expect(await editing(page)).toEqual(group);
    }

    await select(page, [mixed("score")]);
    // Below `bmixed0000` and left of `bungroup00`: `bmixed0000`'s ancestor card fills its left.
    const pane = await emptyPoint(page, -20, 600);
    await page.mouse.click(pane.x, pane.y);
    await expect.poll(() => selection(page)).toEqual([]);
    expect(await editing(page)).toEqual(group);

    // A double-click outside closes the editor (see the cases at the end of the file).
    const own = await framePoint(page, MIXED, { id: "group_1" });
    await page.mouse.dblclick(own.x, own.y);
    expect(await editing(page)).toEqual(group);
  });

  test("editors nest, and open only inside the innermost", async ({ page }) => {
    const margin = await marginPoint(page, MIXED);
    await page.mouse.dblclick(margin.x, margin.y);
    await expect.poll(() => editing(page)).toEqual([{ target: BUNDLE, kind: "bundle" }]);
    await expect.poll(() => viewportOf(page)).not.toEqual(VIEW);
    await setViewport(page, VIEW);

    const frame = await framePoint(page, MIXED, { id: "group_1" });
    await page.mouse.dblclick(frame.x, frame.y);
    const nested = [
      { target: BUNDLE, kind: "bundle" },
      { target: mixed("group_1"), kind: "group" },
    ];
    await expect.poll(() => editing(page)).toEqual(nested);
    await expect(editingPath(page)).toHaveText(["Mixed", "Performance"]);

    const refusal = await page.evaluate((target) => window.__tilie.open(target), mixed("group_2"));
    expect(refusal?.code).toBe("not_inside");
    expect(refusal?.path).toEqual([addressKey(mixed("group_2"))]);
    expect(await editing(page)).toEqual(nested);

    const done = editingBar(page).getByRole("button", { name: "Done", exact: true });
    await done.click();
    await expect.poll(() => editing(page)).toEqual([{ target: BUNDLE, kind: "bundle" }]);
    await expect(editingPath(page)).toHaveText(["Mixed"]);
    await expect.poll(() => viewportOf(page)).toEqual(VIEW);
    await done.click();
    await expect.poll(() => editing(page)).toEqual([]);
  });

  test("Done folds the session into one journal entry, undone as one step", async ({ page }) => {
    const view = await storeText(page, "view");
    await enter(page, mixed("group_1"), VIEW);
    expect(await dispatch(page, SET_PLACE)).toBeNull();
    expect(await dispatch(page, SET_NAME)).toBeNull();
    const after = await storeText(page, "view");
    expect(await entriesLength(page)).toBe(2);
    expect(await journalLength(page)).toBe(START);

    await editingBar(page).getByRole("button", { name: "Done", exact: true }).click();
    await expect.poll(() => editing(page)).toEqual([]);
    expect(await journalLength(page)).toBe(START + 1);
    expect(
      await page.evaluate(() => {
        const { journal, sessions } = window.__tilie.store();
        const last = journal[journal.length - 1] as object;
        const id = "session" in last ? String(last.session) : "";
        return {
          command: "command" in last,
          target: sessions[id]?.target,
          entries: sessions[id]?.entries.length,
        };
      }),
    ).toEqual({ command: false, target: mixed("group_1"), entries: 2 });

    // The two commands are one run of the closed session: one undo reverts both.
    await arranger(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => journalLength(page)).toBe(START);
    expect(await storeText(page, "view")).toBe(view);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(() => journalLength(page)).toBe(START + 1);
    expect(await storeText(page, "view")).toBe(after);
  });

  test("Cancel without a change closes at once", async ({ page }) => {
    await enter(page, mixed("group_1"), VIEW);
    await editingBar(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect.poll(() => editing(page)).toEqual([]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Cancel with changes asks first; No, Escape and the backdrop keep the editor", async ({
    page,
  }) => {
    const before = {
      view: await storeText(page, "view"),
      journal: await storeText(page, "journal"),
      sessions: await storeText(page, "sessions"),
    };
    await enter(page, mixed("group_1"), VIEW);
    const group = [{ target: mixed("group_1"), kind: "group" }];
    const cancel = editingBar(page).getByRole("button", { name: "Cancel", exact: true });
    const dialog = page.getByRole("dialog");
    const question = (n: string) =>
      dialog.getByText(`Are you sure you want to discard ${n}?`, { exact: true });

    expect(await dispatch(page, SET_PLACE)).toBeNull();
    expect(await page.evaluate(() => window.__tilie.store().changes)).toBe(1);

    await cancel.click();
    await expect(question("1 change")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Yes", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "No", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await editing(page)).toEqual(group);
    expect(await entriesLength(page)).toBe(1);

    await cancel.click();
    await expect(question("1 change")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await editing(page)).toEqual(group);
    expect(await entriesLength(page)).toBe(1);

    await cancel.click();
    await expect(question("1 change")).toBeVisible();
    const box = await dialog.boundingBox();
    if (box === null) throw new Error("the dialog is not displayed");
    const backdrop = [
      { x: 10, y: 10 },
      { x: 1590, y: 10 },
      { x: 10, y: 990 },
      { x: 1590, y: 990 },
    ].find(({ x, y }) => x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height);
    if (backdrop === undefined) throw new Error("the dialog covers the page");
    await page.mouse.click(backdrop.x, backdrop.y);
    await expect(dialog).toBeHidden();
    expect(await editing(page)).toEqual(group);
    expect(await entriesLength(page)).toBe(1);

    expect(await dispatch(page, SET_NAME)).toBeNull();
    await cancel.click();
    await expect(question("2 changes")).toBeVisible();
    await dialog.getByRole("button", { name: "Yes", exact: true }).click();
    await expect.poll(() => editing(page)).toEqual([]);
    expect({
      view: await storeText(page, "view"),
      journal: await storeText(page, "journal"),
      sessions: await storeText(page, "sessions"),
    }).toEqual(before);
  });

  test("Escape aborts the gesture, then clears the selection, then acts as Done", async ({
    page,
  }) => {
    await enter(page, BUNDLE, VIEW);
    const bundle = [{ target: BUNDLE, kind: "bundle" }];
    await select(page, [mixed("group_2")]);
    await dragStart(page, await framePoint(page, MIXED, { id: "group_2" }), 40, 24);
    await page.keyboard.press("Escape");
    expect(await places(page, MIXED)).toEqual({});
    expect(await selection(page)).toEqual([mixed("group_2")]);
    expect(await editing(page)).toEqual(bundle);
    await page.mouse.up();
    expect(await entriesLength(page)).toBe(0);
    expect(await places(page, MIXED)).toEqual({});

    await arranger(page).focus();
    await page.keyboard.press("Escape");
    await expect.poll(() => selection(page)).toEqual([]);
    expect(await editing(page)).toEqual(bundle);
    await page.keyboard.press("Escape");
    await expect.poll(() => editing(page)).toEqual([]);
    expect(await journalLength(page)).toBe(START);
  });

  test("a frame moved in the bundle editor states every item's place", async ({ page }) => {
    const drawn = drawnPlaces(MIXED);
    expect(Object.keys(drawn).sort()).toEqual(["annotations", "group_1", "group_2"]);
    const { group_1: first, group_2: second, annotations } = drawn;
    if (first === undefined || second === undefined || annotations === undefined) {
      throw new Error("an item of bmixed0000 is not drawn");
    }
    expect([first.x, first.y].every(onFreeGrid)).toBe(true);

    await enter(page, BUNDLE, VIEW);
    await drag(page, await framePoint(page, MIXED, { id: "group_1" }), 40, 24);
    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await newestCommand(page)).toMatchObject({ type: "set" });
    expect(await places(page, MIXED)).toEqual({
      group_1: { x: first.x + 40, y: first.y + 24 },
      group_2: { x: second.x, y: second.y },
      annotations: { x: annotations.x, y: annotations.y },
    });
    const { x, y } = await placement(page, MIXED);
    expect({ x, y }).toEqual({ x: 0, y: 0 });
  });

  test("a card moved left of everything drawn grows the box left and moves nothing else", async ({
    page,
  }) => {
    const drawn = drawnPlaces(MIXED);
    const { group_1: first, group_2: second, annotations } = drawn;
    if (first === undefined || second === undefined || annotations === undefined) {
      throw new Error("an item of bmixed0000 is not drawn");
    }
    expect(annotations.x).toBe(8);
    expect([annotations.x, annotations.y].every(onFreeGrid)).toBe(true);
    expect(bundlesDrawing(MIXED).origin.x).toBe(MIXED_DEFAULT_SHIFT);

    // The view leaves room left of the block for the drag.
    const view = { ...VIEW, x: VIEW.x + 300 };
    await enter(page, BUNDLE, view);
    // `recording`'s ancestor card reaches `shift − P` left of the place origin; a card moved 200
    // left, to −192, lies `192 − (shift − P)` beyond it, so the box grows left by that much.
    const shift = await editorShift(page);
    expect(drawnPlaces(MIXED, EDITOR_PANE)).toEqual(drawn);
    const grown = 192 - (shift - 8);
    await expect.poll(async () => (await frameRect(page)).x).toBe(drawnX(8 + shift));
    // The node, at the block's place (0, 0) less the drawing's origin, in canvas units.
    expect(await nodeTransform(page, MIXED)).toBe(await placedAt(page, -shift, 0));
    const frameBefore = await frameRect(page);

    await drag(page, await framePoint(page, MIXED, cardAddress("annotations")), -200, 16);
    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await places(page, MIXED)).toEqual({
      group_1: { x: first.x, y: first.y },
      group_2: { x: second.x, y: second.y },
      annotations: { x: -192, y: annotations.y + 16 },
    });
    const { x, y } = await placement(page, MIXED);
    expect({ x, y }).toEqual({ x: 0, y: 0 });
    // The drawing's origin is now the moved card's left edge and the padding, 192 + 8 left of
    // the place origin: the node lies at −200.
    await expect.poll(() => nodeTransform(page, MIXED)).toBe(await placedAt(page, -200, 0));
    // In drawing units at scale 1: the frame lies `grown` further right in a node as much further left.
    expect(await frameRect(page)).toEqual({ ...frameBefore, x: drawnX(8 + shift + grown) });
  });

  test("two selected items move together, the selection kept, undone as one", async ({ page }) => {
    const { group_1: first, group_2: second, annotations } = drawnPlaces(MIXED);
    if (first === undefined || second === undefined || annotations === undefined) {
      throw new Error("an item of bmixed0000 is not drawn");
    }
    expect([first.x, first.y, annotations.x, annotations.y].every(onFreeGrid)).toBe(true);
    expect([first.x, annotations.x]).toEqual([8, 8]);

    await enter(page, BUNDLE, VIEW);
    // Drawn right of the place origin by `recording`'s ancestor card, which stays the leftmost.
    const shift = await editorShift(page);
    await expect.poll(async () => (await frameRect(page)).x).toBe(drawnX(8 + shift));
    const view = await storeText(page, "view");
    const frame = await framePoint(page, MIXED, { id: "group_1" });
    const held = await framePoint(page, MIXED, cardAddress("annotations"));
    await page.mouse.click(frame.x, frame.y);
    await page.keyboard.down("Shift");
    await page.mouse.click(held.x, held.y);
    await page.keyboard.up("Shift");
    const both = byKey([{ block: MIXED, ...cardAddress("annotations") }, mixed("group_1")]);
    await expect.poll(() => selection(page)).toEqual(both);

    /** The `x` attribute of the `index`-th `rect` of `address`, in drawing units. */
    const rectX = (address: ElementAddress, index: number) =>
      node(page, MIXED)
        .locator(`.tilie-block svg rect${addressSelector(address)}`)
        .nth(index)
        .evaluate((rect) => Number(rect.getAttribute("x")));
    await dragStart(page, frame, 40, 24);
    await expect.poll(() => rectX({ id: "group_1" }, 0)).toBe(drawnX(48 + shift));
    expect(await rectX(cardAddress("annotations"), 1)).toBe(drawnX(48 + shift));
    await page.mouse.up();

    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await newestCommand(page)).toEqual({
      type: "set",
      changes: [
        { target: mixed("group_1"), values: { place: { x: first.x + 40, y: first.y + 24 } } },
        {
          target: mixed("annotations"),
          values: { place: { x: annotations.x + 40, y: annotations.y + 24 } },
        },
        { target: mixed("group_2"), values: { place: { x: second.x, y: second.y } } },
      ],
    });
    expect(await places(page, MIXED)).toEqual({
      group_1: { x: first.x + 40, y: first.y + 24 },
      group_2: { x: second.x, y: second.y },
      annotations: { x: annotations.x + 40, y: annotations.y + 24 },
    });
    expect(await selection(page)).toEqual(both);

    await arranger(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => places(page, MIXED)).toEqual({});
    expect(await storeText(page, "view")).toBe(view);
  });

  test("a change outside the edited element is refused", async ({ page }) => {
    await enter(page, mixed("group_1"), VIEW);
    const refusal = await dispatch(page, {
      type: "set",
      changes: [{ target: mixed("group_2"), values: { place: { x: 10 } } }],
    });
    expect(refusal?.code).toBe("side_effect");
    expect(refusal?.path).toEqual([addressKey(mixed("group_2"))]);
    expect(await entriesLength(page)).toBe(0);
    expect(await places(page, MIXED)).toEqual({});
  });

  test("a refused Delete in the group editor shows the refusal as information", async ({
    page,
  }) => {
    await enter(page, mixed("group_2"), VIEW);
    const view = await storeText(page, "view");
    await select(page, [mixed("excerpt")]);
    await arranger(page).focus();
    await page.keyboard.press("Delete");
    await expect(messageTexts(page, "info")).toHaveText([
      "timeline 'Recording' in bundle 'Mixed' lies outside group 'Facsimile' in bundle 'Mixed': an editor changes only what it edits",
    ]);
    expect(await entriesLength(page)).toBe(0);
    expect(await storeText(page, "view")).toBe(view);
  });

  test("Delete on the edited element asks to close its editor first", async ({ page }) => {
    await enter(page, mixed("group_1"), VIEW);
    await expect.poll(() => selection(page)).toEqual([mixed("group_1")]);
    const journal = await journalLength(page);
    await arranger(page).focus();
    await page.keyboard.press("Delete");
    await expect(messageTexts(page, "info")).toHaveText([
      "Close its editor to delete the edited element.",
    ]);
    expect(await journalLength(page)).toBe(journal);
    expect(await entriesLength(page)).toBe(0);
  });

  test("the Journal tab shows a closed session as one row on the arranger", async ({ page }) => {
    await enter(page, mixed("group_1"), VIEW);
    expect(await dispatch(page, SET_PLACE)).toBeNull();
    expect(await dispatch(page, SET_NAME)).toBeNull();
    await editingBar(page).getByRole("button", { name: "Done", exact: true }).click();
    await expect.poll(() => editing(page)).toEqual([]);
    await tab(page, "Journal").click();
    await expect(
      (await panel(page, "Journal")).getByText("Edited group Performance (2 changes)", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("the Journal tab keeps an undone entry listed, greyed, until redone", async ({ page }) => {
    await enter(page, mixed("group_1"), VIEW);
    expect(await dispatch(page, SET_PLACE)).toBeNull();
    expect(await dispatch(page, SET_NAME)).toBeNull();
    await page.evaluate(() => window.__tilie.store().undo());
    await tab(page, "Journal").click();
    const journal = await panel(page, "Journal");
    const undone = journal.locator("[data-undone]");
    await expect(undone).toHaveCount(1);
    await expect(undone).toContainText("Set name of timeline 'Score' in bundle 'Mixed'");
    await expect(undone).toContainText("undone");
    await expect(journal).toContainText("Set place of group 'Performance' in bundle 'Mixed'");
    await expect(journal.locator("[data-undone]", { hasText: "Set place" })).toHaveCount(0);
    const rows = journal.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows).toContainText([
      "Set name of timeline 'Score' in bundle 'Mixed'",
      "Set place of group 'Performance' in bundle 'Mixed'",
    ]);
    await page.evaluate(() => window.__tilie.store().redo());
    await expect(undone).toHaveCount(0);
  });

  test("three nested sessions with one change each undo one session at a time", async ({
    page,
  }) => {
    const view = await storeText(page, "view");
    const close = () => done(page);
    const names = () => rootNames(page);
    const original = await names();
    expect(original).toEqual(["Score", "Performance", "Annotations"]);
    await enter(page, BUNDLE, VIEW);
    await enter(page, mixed("group_1"), VIEW);
    await enter(page, mixed("score"), VIEW);
    expect(await dispatch(page, rename("score", "c"))).toBeNull();
    await close();
    expect(await dispatch(page, rename("performance", "b"))).toBeNull();
    await close();
    expect(await dispatch(page, rename("annotations", "a"))).toBeNull();
    await close();
    await expect.poll(() => editing(page)).toEqual([]);
    expect(await journalLength(page)).toBe(START + 1);
    await tab(page, "Journal").click();
    const first = journalRows(await panel(page, "Journal")).first();
    // A session's row is named by its disclosure button, labelled by the row's text.
    const disclosure = first.getByRole("button").first();
    await expect(disclosure).toHaveAccessibleName("Edited bundle Mixed (3 changes)");

    await arranger(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(names).toEqual(["c", "b", original[2]]);
    expect(await journalLength(page)).toBe(START + 1);
    await expect(disclosure).toHaveAccessibleName("Edited bundle Mixed (3 changes, 1 undone)");
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    const children = journalRows(first);
    await expect(children).toHaveCount(2);
    await expect(children).toContainText([
      "Set name of timeline 'Annotations' in bundle 'Mixed'",
      "Edited group Performance (2 changes)",
    ]);
    await expect(children.first()).toHaveAttribute("data-undone");
    await expect(children.nth(1)).not.toHaveAttribute("data-undone");

    await arranger(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(names).toEqual(["c", original[1], original[2]]);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(names).toEqual(original);
    expect(await storeText(page, "view")).toBe(view);
    expect(await journalLength(page)).toBe(START);
    await expect(first).toHaveAttribute("data-undone");
    await expect(disclosure).toHaveAccessibleName("Edited bundle Mixed (3 changes)");

    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(names).toEqual(["c", original[1], original[2]]);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(names).toEqual(["c", "b", original[2]]);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(names).toEqual(["c", "b", "a"]);
  });

  test("an interleaved session undoes by runs, newest first, and redoes in mirror", async ({
    page,
  }) => {
    const view = await storeText(page, "view");
    expect(await rootNames(page)).toEqual(["Score", "Performance", "Annotations"]);
    await enter(page, BUNDLE, VIEW);
    expect(await dispatch(page, rename("annotations", "a1"))).toBeNull();
    await enter(page, mixed("group_1"), VIEW);
    expect(await dispatch(page, rename("performance", "b1"))).toBeNull();
    await enter(page, mixed("score"), VIEW);
    expect(await dispatch(page, rename("score", "c1"))).toBeNull();
    expect(await dispatch(page, rename("score", "c2"))).toBeNull();
    await done(page);
    expect(await dispatch(page, rename("performance", "b2"))).toBeNull();
    await done(page);
    expect(await dispatch(page, rename("annotations", "a2"))).toBeNull();
    await done(page);
    await expect.poll(() => editing(page)).toEqual([]);
    expect(await journalLength(page)).toBe(START + 1);
    await tab(page, "Journal").click();
    const first = journalRows(await panel(page, "Journal")).first();
    const disclosure = first.getByRole("button").first();
    /** Whether each item carries `data-undone`. */
    const undone = (items: ReturnType<Page["locator"]>) =>
      items.evaluateAll((all) => all.map((item) => item.hasAttribute("data-undone")));

    // The names and the bundle session's row before each undo; the runs are
    // a1, b1, c1 c2, b2, a2, undone newest first.
    const states: [(string | null)[], string][] = [
      [["c2", "b2", "a2"], "Edited bundle Mixed (6 changes)"],
      [["c2", "b2", "a1"], "Edited bundle Mixed (6 changes, 1 undone)"],
      [["c2", "b1", "a1"], "Edited bundle Mixed (6 changes, 2 undone)"],
      [["Score", "b1", "a1"], "Edited bundle Mixed (6 changes, 4 undone)"],
      [["Score", "Performance", "a1"], "Edited bundle Mixed (6 changes, 5 undone)"],
      [["Score", "Performance", "Annotations"], "Edited bundle Mixed (6 changes)"],
    ];
    await expect(disclosure).toHaveAccessibleName("Edited bundle Mixed (6 changes)");
    for (const [index, [names, text]] of states.entries()) {
      if (index === 0) continue;
      await arranger(page).focus();
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(() => rootNames(page)).toEqual(names);
      await expect(disclosure).toHaveAccessibleName(text);
      if (index !== 3) continue;
      // Both of the timeline session's changes went with one key press.
      await disclosure.click();
      const children = journalRows(first);
      await expect(children).toHaveCount(3);
      await expect(children).toContainText([
        "Set name of timeline 'a1' in bundle 'Mixed'",
        "Edited group Performance (4 changes, 3 undone)",
        "Set name of timeline 'a1' in bundle 'Mixed'",
      ]);
      expect(await undone(children)).toEqual([true, false, false]);
      const group = children.nth(1);
      await expect(group.getByRole("button").first()).toHaveAccessibleName(
        "Edited group Performance (4 changes, 3 undone)",
      );
      await group.getByRole("button").first().click();
      const members = journalRows(group);
      await expect(members).toHaveCount(3);
      await expect(members).toContainText([
        "Set name of timeline 'b1' in bundle 'Mixed'",
        "Edited timeline Score (2 changes)",
        "Set name of timeline 'b1' in bundle 'Mixed'",
      ]);
      expect(await undone(members)).toEqual([true, true, false]);
    }
    await expect(first).toHaveAttribute("data-undone");
    expect(await journalLength(page)).toBe(START);
    expect(await storeText(page, "view")).toBe(view);

    for (const [names, text] of states.slice(0, -1).reverse()) {
      await arranger(page).focus();
      await page.keyboard.press("ControlOrMeta+Shift+z");
      await expect.poll(() => rootNames(page)).toEqual(names);
      await expect(disclosure).toHaveAccessibleName(text);
    }
    await expect(first).not.toHaveAttribute("data-undone");
  });
});

test.describe("on groups", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "groups");
    await setViewport(page, VIEW);
  });

  test("a member card dragged below its sibling reorders the group", async ({ page }) => {
    const group = { block: GROUPS.child, id: "group_1" };
    await enter(page, group, VIEW);
    const from = await framePoint(page, GROUPS.child, cardAddress("second-half"));
    // The block lies at (0, 0) at scale 1, so a drawing ordinate is the canvas y.
    const origin = await toScreen(page, 0, 0);
    // Pressed in the card's upper half, so the card's own middle passes recording's as well.
    expect(from.y - origin.y).toBeLessThan(74.78125);
    const to = await toScreen(page, 0, 172);
    await drag(page, from, 0, to.y - from.y);
    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await newestCommand(page)).toEqual({
      type: "set",
      changes: [{ target: group, values: { order: null } }],
    });
    // The new order is the members' own, so the group's entry is deleted, not written out.
    expect(await graphicalOrder(page, GROUPS.child)).toEqual({});
  });
});

test.describe("leaving by a double-click, and the view when the canvas changes size", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "bundles");
    await setViewport(page, VIEW);
  });

  test("a double-click outside the edited element closes the innermost editor", async ({
    page,
  }) => {
    const bundle = [{ target: BUNDLE, kind: "bundle" }];
    const group = [{ target: mixed("group_1"), kind: "group" }];
    await enter(page, BUNDLE, VIEW);
    await enter(page, mixed("group_1"), VIEW);
    // Below `bmixed0000` and left of `bungroup00`: `bmixed0000`'s ancestor card fills its left.
    const pane = await emptyPoint(page, -20, 600);
    await page.mouse.dblclick(pane.x, pane.y);
    await expect.poll(() => editing(page)).toEqual(bundle);
    await expect.poll(() => viewportOf(page)).toEqual(VIEW);

    await enter(page, mixed("group_1"), VIEW);
    const other = await partCentre(page, BUNDLES.twoGroups, { id: "g1" });
    await page.mouse.dblclick(other.x, other.y);
    await expect.poll(() => editing(page)).toEqual(bundle);
    await page.mouse.dblclick(other.x, other.y);
    await expect.poll(() => editing(page)).toEqual([]);

    await enter(page, mixed("group_1"), VIEW);
    const own = await framePoint(page, MIXED, { id: "group_1" });
    await page.mouse.dblclick(own.x, own.y);
    expect(await editing(page)).toEqual(group);
    const faded = await partCentre(page, MIXED, { id: "group_2" });
    await page.mouse.dblclick(faded.x, faded.y);
    await expect.poll(() => editing(page)).toEqual([]);
    expect(await journalLength(page)).toBe(START);
  });

  test("a double-click on a box inside the edited element opens its editor", async ({ page }) => {
    await enter(page, mixed("group_1"), VIEW);
    const held = await framePoint(page, MIXED, cardAddress("score"));
    await page.mouse.dblclick(held.x, held.y);
    await expect
      .poll(() => editing(page))
      .toEqual([
        { target: mixed("group_1"), kind: "group" },
        { target: mixed("score"), kind: "timeline" },
      ]);
  });

  test("closing and opening the drawer centres the edited element for the new size", async ({
    page,
  }) => {
    const workspace = readWorkspace(fixtureText("bundles"));
    if (isLoadError(workspace)) throw new Error("bundles.tle.json is refused");
    const block = workspace.view.blocks[MIXED];
    if (block === undefined) throw new Error(`block ${MIXED} is missing`);
    /**
     * The bundle editor's viewport for the arranger's size now: the block's bounds as the
     * canvas draws it at that size, its pane (its ancestor card of `recording` is elided at the
     * automatic proportion, which reads the pane: section 8.9).
     */
    const focused = async () => {
      const size = await arranger(page).evaluate((element) => ({
        width: element.clientWidth,
        height: element.clientHeight,
      }));
      const drawing = drawingOf(block, workspace.view.graphical, FONT_METRICS, undefined, {
        view: size,
      });
      const bounds = {
        ...nodePosition(block, drawing),
        width: drawing.width * block.scale,
        height: drawing.height * block.scale,
      };
      return focusViewport(bounds, size, 0);
    };

    expect(await page.evaluate((target) => window.__tilie.open(target), BUNDLE)).toBeNull();
    await expect(drawer(page)).toBeVisible();
    const open = await focused();
    await expect.poll(() => viewportOf(page)).toEqual(open);

    await page.getByRole("button", { name: "Close inspector" }).click();
    await expect(drawer(page)).toBeHidden();
    const closed = await focused();
    expect(closed).not.toEqual(open);
    await expect.poll(() => viewportOf(page)).toEqual(closed);

    await page.getByRole("button", { name: "Open inspector" }).click();
    await expect(drawer(page)).toBeVisible();
    expect(await focused()).toEqual(open);
    await expect.poll(() => viewportOf(page)).toEqual(open);

    await editingBar(page).getByRole("button", { name: "Done", exact: true }).click();
    await expect.poll(() => editing(page)).toEqual([]);
    await expect.poll(() => viewportOf(page)).toEqual(VIEW);
  });
});

test.describe("a pan while the view moves to the edited element", () => {
  test.use({ reducedMotion: "no-preference" });

  test("is kept when the pane settles at the canvas's new size", async ({ page }) => {
    // The page's clock runs on its own until it is paused: the view's moves and the pane's
    // settling then wait for the test to run the clock.
    await page.clock.install();
    await open(page, "bundles");
    await setViewport(page, VIEW);
    expect(await page.evaluate((target) => window.__tilie.open(target), BUNDLE)).toBeNull();
    await expect(drawer(page)).toBeVisible();
    await page.getByRole("button", { name: "Close inspector" }).click();
    await expect(drawer(page)).toBeHidden();
    const wide = await arranger(page).evaluate((item) => item.clientWidth);
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + FOCUS_DURATION + 1000);
    const centred = await viewportOf(page);

    // The drawer opens: the canvas narrows, the view starts its move to the block centred for
    // the narrower canvas, and the pane waits PANE_SETTLE before it settles at that size.
    await page.getByRole("button", { name: "Open inspector" }).click();
    await expect(drawer(page)).toBeVisible();
    await expect.poll(() => arranger(page).evaluate((item) => item.clientWidth)).toBeLessThan(wide);
    // A resize observer made now reports in the same rendering step as the canvas's own, which
    // has then measured the narrower canvas.
    await arranger(page).evaluate(
      (item) =>
        new Promise<void>((resolve) => {
          const observer = new ResizeObserver(() => {
            observer.disconnect();
            resolve();
          });
          observer.observe(item);
        }),
    );
    const box = await arranger(page).boundingBox();
    if (box === null) throw new Error("the arranger is not displayed");
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.wheel(0, 40);
    // The move had not begun: the pan starts from where the view was, and only moves it up.
    await expect.poll(() => viewportOf(page)).not.toEqual(centred);
    const panned = await viewportOf(page);
    expect([panned.x, panned.zoom]).toEqual([centred.x, centred.zoom]);
    expect(panned.y).toBeLessThan(centred.y);

    // The pane settles, and the drawings are drawn again for it; then as long as a move takes.
    await page.clock.runFor(PANE_SETTLE);
    await page.clock.runFor(FOCUS_DURATION);
    expect(await viewportOf(page)).toEqual(panned);
    await page.clock.resume();
  });
});

test.describe("resizing in an editor", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "bundles");
    await setViewport(page, VIEW);
  });

  test("a member's card stretched in its timeline editor stretches every member", async ({
    page,
  }) => {
    await enter(page, mixed("score"), VIEW);
    const shift = await editorShift(page);
    await select(page, [{ block: MIXED, ...cardAddress("score") }]);
    await page.locator('[data-testid="mode-stretch"]').click();
    const handles = page.locator('[data-testid^="handle-"]');
    await expect(handles).toHaveCount(3);
    expect(
      await handles.evaluateAll((items) => items.map((item) => item.getAttribute("data-testid"))),
    ).toEqual(["handle-right", "handle-bottom-right", "handle-bottom"]);
    const grip = await page.locator('[data-testid="handle-right"]').boundingBox();
    if (grip === null) throw new Error("handle right is not displayed");
    await drag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 20, 0);
    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await places(page, MIXED)).toEqual({ group_1: { length: 420 } });
    // Both member cards of the frame end at one x, 20 further right than before.
    const drawn = (id: string) =>
      element(page, MIXED, cardAddress(id))
        .last()
        .evaluate((rect) => [rect.getAttribute("x"), rect.getAttribute("width")]);
    // 565.052001953125 wide at length 420, written as the writer's text.
    expect(attributeText(mixedCardWidth(420))).toBe("565.052");
    const card = [attributeText(16 + shift), "565.052"];
    expect(await drawn("score")).toEqual(card);
    expect(await drawn("performance")).toEqual(card);
  });
});
