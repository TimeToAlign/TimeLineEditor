/**
 * The editors on the canvas: entering by double-click and Enter, the
 * viewport's move there and back, the faded and inert surroundings, nested
 * editors, Done folding a session into one journal entry undone one change
 * at a time, Cancel and its
 * question, Escape, moving an item in the bundle editor, reordering a
 * group's members in the group editor, the refusal of a change outside the
 * edited element, the Journal tab, and a member's card stretching its group
 * in its timeline editor. The expected values are derived in
 * `README.md` ("editors.spec.ts"); the double tap is in `touch.spec.ts`.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf } from "../packages/arranger/src/drawing.ts";
import { focusViewport } from "../packages/arranger/src/focus.ts";
import { nodePosition } from "../packages/arranger/src/project.ts";
import type { CommandError } from "../packages/core/src/index.ts";
import { isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import {
  BUNDLES,
  drag,
  dragStart,
  emptyPoint,
  fixtureText,
  framePoint,
  GROUPS,
  journalLength,
  marginPoint,
  node,
  OPENED_JOURNAL,
  open,
  partCentre,
  placement,
  selection,
  setViewport,
  toScreen,
  viewportOf,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const VIEW = { x: 40, y: 40, zoom: 1 };
const MIXED = BUNDLES.mixed;
const START = OPENED_JOURNAL.bundles;

/** The bundled face's metrics, from the installed schema package: the data the editor's `fontMetrics` holds. */
const METRICS = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(
        createRequire(path.join(import.meta.dirname, "../packages/core/package.json")).resolve(
          "@timetoalign/timeskeleton/package.json",
        ),
      ),
      "fonts",
      "dejavu-sans-2.37.metrics.json",
    ),
    "utf8",
  ),
) as Parameters<typeof drawingOf>[2];

/**
 * The drawn position of every item of `block` in `bundles.tle.json` (each
 * frame and ungrouped card, from the place origin, defaults applied), by
 * the editor's own drawing code run outside the page.
 */
function drawnPlaces(block: string): Record<string, { x: number; y: number }> {
  const workspace = readWorkspace(fixtureText("bundles"));
  if (isLoadError(workspace)) throw new Error("bundles.tle.json is refused");
  const found = workspace.view.blocks[block];
  if (found === undefined) throw new Error(`block ${block} is missing`);
  const drawing = drawingOf(found, workspace.view.settings, METRICS);
  return Object.fromEntries(
    drawing.items.map((item) => [item.key, { x: item.place.x, y: item.place.y }]),
  );
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
  return node(page, MIXED)
    .locator('[data-address="group_1"]')
    .first()
    .evaluate((rect) => {
      const read = (name: string) => Number(rect.getAttribute(name));
      return { x: read("x"), y: read("y"), width: read("width"), height: read("height") };
    });
}

/** The open editors, each as `{target, kind}`. */
function editing(page: Page): Promise<{ target: string; kind: string }[]> {
  return page.evaluate(() =>
    window.__tilie.editing().map(({ target, kind }) => ({ target, kind })),
  );
}

/**
 * Open the editor of `address` through the hook, wait until the canvas has
 * moved to it, and set the viewport back to `VIEW`, so that pointer
 * positions count at zoom 1.
 */
async function enter(page: Page, address: string): Promise<void> {
  const before = (await editing(page)).length;
  expect(await page.evaluate((target) => window.__tilie.open(target), address)).toBeNull();
  expect((await editing(page)).length).toBe(before + 1);
  await expect.poll(() => viewportOf(page)).not.toEqual(VIEW);
  await setViewport(page, VIEW);
}

/** The JSON text of a member of the store, read in the page (a `bigint` written as its digits). */
function storeText(page: Page, member: "view" | "journal" | "sessions"): Promise<string> {
  return page.evaluate(
    (name) =>
      JSON.stringify(window.__tilie.store()[name], (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    member,
  );
}

function entriesLength(page: Page): Promise<number> {
  return page.evaluate(() => window.__tilie.store().entries.length);
}

/** Block `id`'s stored places. */
function places(page: Page, id: string): Promise<unknown> {
  return page.evaluate(
    (block) => JSON.parse(JSON.stringify(window.__tilie.store().view.blocks[block]?.places)),
    id,
  );
}

/** Dispatch `command` through the hook's store; its refusal or `null`. */
function dispatch(page: Page, command: unknown): Promise<CommandError | null> {
  return page.evaluate((sent) => window.__tilie.store().dispatch(sent), command);
}

const SET_PLACE = {
  type: "set",
  changes: [{ target: `${MIXED}/group_1`, values: { place: { length: 300 } } }],
};
const SET_NAME = {
  type: "set",
  changes: [{ target: `${MIXED}/score`, values: { name: "S" } }],
};

function tabs(page: Page) {
  return page.getByRole("tablist", { name: "Inspector sections" });
}

function tab(page: Page, name: string) {
  return tabs(page).getByRole("tab", { name, exact: true });
}

function editingBar(page: Page) {
  return page.getByRole("group", { name: "Editing" });
}

function editingPath(page: Page) {
  return page.getByRole("list", { name: "Editing path" }).getByRole("listitem");
}

function arranger(page: Page) {
  return page.locator('[role="application"][aria-label="Arranger"]');
}

/**
 * Of the parts of block `id` carrying an address, those naming a frame, a
 * line, the title, a card or a group's title (as `groups.spec.ts` keeps
 * them), each address with whether its parts carry `data-outside`: `true`
 * when all do, `false` when none does, `"mixed"` otherwise.
 */
function outside(page: Page, id: string): Promise<Record<string, boolean | "mixed">> {
  return node(page, id)
    .locator("[data-address]")
    .evaluateAll((items) => {
      const found: Record<string, boolean | "mixed"> = {};
      for (const item of items) {
        const address = item.getAttribute("data-address") ?? "";
        const shown =
          !address.includes("/") || address.endsWith("/card") || /^group_\d+\/name$/.test(address);
        if (!shown) continue;
        const faded = item.hasAttribute("data-outside");
        const seen = found[address];
        found[address] = seen === undefined || seen === faded ? faded : "mixed";
      }
      return found;
    });
}

test.describe("on bundles", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "bundles");
    await setViewport(page, VIEW);
  });

  for (const { what, point, target, kind, text, name } of [
    {
      what: "the block's margin opens the bundle editor",
      point: (page: Page) => marginPoint(page, MIXED),
      target: MIXED,
      kind: "bundle",
      text: "Bundle editor: Mixed",
      name: "Mixed",
    },
    {
      what: "a frame opens the group editor",
      point: (page: Page) => framePoint(page, MIXED, "group_1"),
      target: `${MIXED}/group_1`,
      kind: "group",
      text: "Group editor: Performance",
      name: "Performance",
    },
    {
      what: "a card opens the timeline editor",
      point: (page: Page) => framePoint(page, MIXED, "annotations/card"),
      target: `${MIXED}/annotations`,
      kind: "timeline",
      text: "Timeline editor: Annotations",
      name: "Annotations",
    },
  ]) {
    test(`a double-click on ${what}`, async ({ page }) => {
      await expect(tabs(page)).toBeHidden();
      const { x, y } = await point(page);
      await page.mouse.dblclick(x, y);
      await expect.poll(() => editing(page)).toEqual([{ target, kind }]);
      await expect(tabs(page).getByRole("tab")).toHaveText([
        "Editor",
        "Properties",
        "Manifest",
        "Journal",
      ]);
      await expect(tab(page, "Editor")).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#inspector-panel-editor")).toHaveText(text);
      await expect(editingPath(page)).toHaveText([name]);
      expect(await journalLength(page)).toBe(START);
    });
  }

  test("Enter opens the editor of the one selected box", async ({ page }) => {
    await page.evaluate((address) => window.__tilie.select([address]), `${MIXED}/group_2`);
    await arranger(page).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => editing(page)).toEqual([{ target: `${MIXED}/group_2`, kind: "group" }]);
  });

  test("the viewport moves to the opened editor and back on Done", async ({ page }) => {
    expect(await viewportOf(page)).toEqual(VIEW);
    const { x, y } = await marginPoint(page, MIXED);
    await page.mouse.dblclick(x, y);
    await expect.poll(() => editing(page)).toEqual([{ target: MIXED, kind: "bundle" }]);
    await expect.poll(() => viewportOf(page)).not.toEqual(VIEW);
    await editingBar(page).getByRole("button", { name: "Done", exact: true }).click();
    await expect.poll(() => editing(page)).toEqual([]);
    await expect.poll(() => viewportOf(page)).toEqual(VIEW);
  });

  test("outside the edited element everything is faded and inert", async ({ page }) => {
    await enter(page, `${MIXED}/group_1`);
    const group = [{ target: `${MIXED}/group_1`, kind: "group" }];
    expect(await outside(page, MIXED)).toEqual({
      name: true,
      group_1: false,
      "group_1/name": false,
      "score/card": false,
      score: false,
      "performance/card": false,
      performance: false,
      group_2: true,
      "group_2/name": true,
      "page/card": true,
      page: true,
      "excerpt/card": true,
      recording: true,
      excerpt: true,
      "annotations/card": true,
      annotations: true,
    });
    for (const other of [BUNDLES.shared, BUNDLES.ungrouped]) {
      // Another block is faded and inert as a whole, through its node, not element by element.
      const whole = node(page, other);
      await expect(whole).toHaveClass(/(^|\s)tilie-outside(\s|$)/);
      await expect(whole).not.toHaveClass(/(^|\s)(selectable|draggable)(\s|$)/);
      await expect(whole).toHaveCSS("opacity", "0.3");
      await expect(whole).toHaveCSS("pointer-events", "none");
      await expect(whole.locator("[data-outside]")).toHaveCount(0);
      const card = await whole.locator('[data-address$="/card"]').first().boundingBox();
      if (card === null) throw new Error(`${other} draws no card`);
      const centre = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
      await page.mouse.move(centre.x, centre.y);
      expect(
        await page.evaluate(
          ({ x, y }) =>
            document.elementFromPoint(x, y)?.classList.contains("svelte-flow__pane") === true,
          centre,
        ),
      ).toBe(true);
      await expect(whole.locator("[data-hovered]")).toHaveCount(0);
    }

    await page.evaluate((address) => window.__tilie.select([address]), `${MIXED}/score`);
    for (const [block, address] of [
      [BUNDLES.shared, "take_1/card"],
      [MIXED, "annotations/card"],
    ] as const) {
      const { x, y } = await partCentre(page, block, address);
      await page.mouse.click(x, y);
      expect(await selection(page)).toEqual([`${MIXED}/score`]);
      expect(await editing(page)).toEqual(group);
    }

    const pane = await emptyPoint(page, -20, 450);
    await page.mouse.click(pane.x, pane.y);
    await expect.poll(() => selection(page)).toEqual([]);
    expect(await editing(page)).toEqual(group);

    // A double-click outside closes the editor (see the cases at the end of the file).
    const own = await framePoint(page, MIXED, "group_1");
    await page.mouse.dblclick(own.x, own.y);
    expect(await editing(page)).toEqual(group);
  });

  test("editors nest, and open only inside the innermost", async ({ page }) => {
    const margin = await marginPoint(page, MIXED);
    await page.mouse.dblclick(margin.x, margin.y);
    await expect.poll(() => editing(page)).toEqual([{ target: MIXED, kind: "bundle" }]);
    await expect.poll(() => viewportOf(page)).not.toEqual(VIEW);
    await setViewport(page, VIEW);

    const frame = await framePoint(page, MIXED, "group_1");
    await page.mouse.dblclick(frame.x, frame.y);
    const nested = [
      { target: MIXED, kind: "bundle" },
      { target: `${MIXED}/group_1`, kind: "group" },
    ];
    await expect.poll(() => editing(page)).toEqual(nested);
    await expect(editingPath(page)).toHaveText(["Mixed", "Performance"]);

    const refusal = await page.evaluate(
      (target) => window.__tilie.open(target),
      `${MIXED}/group_2`,
    );
    expect(refusal?.code).toBe("not_inside");
    expect(refusal?.path).toEqual([`${MIXED}/group_2`]);
    expect(await editing(page)).toEqual(nested);

    const done = editingBar(page).getByRole("button", { name: "Done", exact: true });
    await done.click();
    await expect.poll(() => editing(page)).toEqual([{ target: MIXED, kind: "bundle" }]);
    await expect(editingPath(page)).toHaveText(["Mixed"]);
    await expect.poll(() => viewportOf(page)).toEqual(VIEW);
    await done.click();
    await expect.poll(() => editing(page)).toEqual([]);
  });

  test("Done folds the session into one journal entry, undone one change at a time", async ({
    page,
  }) => {
    const view = await storeText(page, "view");
    await enter(page, `${MIXED}/group_1`);
    expect(await dispatch(page, SET_PLACE)).toBeNull();
    const placed = await storeText(page, "view");
    expect(await dispatch(page, SET_NAME)).toBeNull();
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
    ).toEqual({ command: false, target: `${MIXED}/group_1`, entries: 2 });

    await arranger(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => storeText(page, "view")).toBe(placed);
    expect(await journalLength(page)).toBe(START + 1);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => journalLength(page)).toBe(START);
    expect(await storeText(page, "view")).toBe(view);
  });

  test("Cancel without a change closes at once", async ({ page }) => {
    await enter(page, `${MIXED}/group_1`);
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
    await enter(page, `${MIXED}/group_1`);
    const group = [{ target: `${MIXED}/group_1`, kind: "group" }];
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
    await enter(page, MIXED);
    const bundle = [{ target: MIXED, kind: "bundle" }];
    await page.evaluate((address) => window.__tilie.select([address]), `${MIXED}/group_2`);
    await dragStart(page, await framePoint(page, MIXED, "group_2"), 40, 24);
    await page.keyboard.press("Escape");
    expect(await places(page, MIXED)).toEqual({});
    expect(await selection(page)).toEqual([`${MIXED}/group_2`]);
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

    await enter(page, MIXED);
    await drag(page, await framePoint(page, MIXED, "group_1"), 40, 24);
    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(
      await page.evaluate(() => {
        const [entry] = window.__tilie.store().entries;
        return entry !== undefined && "command" in entry ? entry.command.type : null;
      }),
    ).toBe("set");
    expect(await places(page, MIXED)).toEqual({
      group_1: { x: first.x + 40, y: first.y + 24 },
      group_2: { x: second.x, y: second.y },
      annotations: { x: annotations.x, y: annotations.y },
    });
    const { x, y } = await placement(page, MIXED);
    expect({ x, y }).toEqual({ x: 0, y: 0 });
  });

  test("a card moved left of the padding grows the box left and moves nothing else", async ({
    page,
  }) => {
    const drawn = drawnPlaces(MIXED);
    const { group_1: first, group_2: second, annotations } = drawn;
    if (first === undefined || second === undefined || annotations === undefined) {
      throw new Error("an item of bmixed0000 is not drawn");
    }
    expect(annotations.x).toBe(8);
    expect([annotations.x, annotations.y].every(onFreeGrid)).toBe(true);

    await enter(page, MIXED);
    const nodeBefore = await node(page, MIXED).boundingBox();
    if (nodeBefore === null) throw new Error("bmixed0000 is not displayed");
    const frameBefore = await frameRect(page);
    expect(frameBefore.x).toBe(8);

    await drag(page, await framePoint(page, MIXED, "annotations/card"), -40, 16);
    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(await places(page, MIXED)).toEqual({
      group_1: { x: first.x, y: first.y },
      group_2: { x: second.x, y: second.y },
      annotations: { x: -32, y: annotations.y + 16 },
    });
    const { x, y } = await placement(page, MIXED);
    expect({ x, y }).toEqual({ x: 0, y: 0 });
    await expect
      .poll(async () => (await node(page, MIXED).boundingBox())?.x)
      .toBe(nodeBefore.x - 40);
    // In drawing units at scale 1: the frame lies 40 further right in a node 40 further left.
    expect(await frameRect(page)).toEqual({ ...frameBefore, x: frameBefore.x + 40 });
  });

  test("a change outside the edited element is refused", async ({ page }) => {
    await enter(page, `${MIXED}/group_1`);
    const refusal = await dispatch(page, {
      type: "set",
      changes: [{ target: `${MIXED}/group_2`, values: { place: { x: 10 } } }],
    });
    expect(refusal?.code).toBe("side_effect");
    expect(refusal?.path).toEqual([`${MIXED}/group_2`]);
    expect(await entriesLength(page)).toBe(0);
    expect(await places(page, MIXED)).toEqual({});
  });

  test("a refused Delete in the group editor shows the refusal in the status line", async ({
    page,
  }) => {
    await enter(page, `${MIXED}/group_2`);
    const view = await storeText(page, "view");
    await page.evaluate((address) => window.__tilie.select([address]), `${MIXED}/excerpt`);
    await arranger(page).focus();
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("hint")).toHaveText(
      `${MIXED}/recording lies outside ${MIXED}/group_2: an editor changes only what it edits`,
    );
    expect(await entriesLength(page)).toBe(0);
    expect(await storeText(page, "view")).toBe(view);
  });

  test("the Journal tab shows a closed session as one row on the arranger", async ({ page }) => {
    await enter(page, `${MIXED}/group_1`);
    expect(await dispatch(page, SET_PLACE)).toBeNull();
    expect(await dispatch(page, SET_NAME)).toBeNull();
    await editingBar(page).getByRole("button", { name: "Done", exact: true }).click();
    await expect.poll(() => editing(page)).toEqual([]);
    await tab(page, "Journal").click();
    await expect(
      page
        .locator("#inspector-panel-journal")
        .getByText("Edited group Performance (2 changes)", { exact: true }),
    ).toBeVisible();
  });

  test("the Journal tab keeps an undone entry listed, greyed, until redone", async ({ page }) => {
    await enter(page, `${MIXED}/group_1`);
    expect(await dispatch(page, SET_PLACE)).toBeNull();
    expect(await dispatch(page, SET_NAME)).toBeNull();
    await page.evaluate(() => window.__tilie.store().undo());
    await tab(page, "Journal").click();
    const panel = page.locator("#inspector-panel-journal");
    const undone = panel.locator("[data-undone]");
    await expect(undone).toHaveCount(1);
    await expect(undone).toContainText("Set name of bmixed0000/score");
    await expect(undone).toContainText("undone");
    await expect(panel).toContainText("Set place of bmixed0000/group_1");
    await expect(panel.locator("[data-undone]", { hasText: "Set place" })).toHaveCount(0);
    await expect(panel.locator(".text")).toHaveText([
      "Set name of bmixed0000/score",
      "Set place of bmixed0000/group_1",
    ]);
    await page.evaluate(() => window.__tilie.store().redo());
    await expect(undone).toHaveCount(0);
  });

  test("three nested sessions undo one change at a time", async ({ page }) => {
    const view = await storeText(page, "view");
    const rename = (id: string, name: string) => ({
      type: "set",
      changes: [{ target: `${MIXED}/${id}`, values: { name } }],
    });
    const done = () => page.evaluate(() => window.__tilie.done());
    const names = () =>
      page.evaluate((block) => {
        const timelines = window.__tilie.store().view.blocks[block]?.manifest.timelines ?? [];
        return ["score", "performance", "annotations"].map(
          (id) => timelines.find((timeline) => timeline.id === id)?.name ?? null,
        );
      }, MIXED);
    const original = await names();
    expect(original).toEqual(["Score", "Performance", "Annotations"]);
    await enter(page, MIXED);
    await enter(page, `${MIXED}/group_1`);
    await enter(page, `${MIXED}/score`);
    expect(await dispatch(page, rename("score", "c"))).toBeNull();
    await done();
    expect(await dispatch(page, rename("performance", "b"))).toBeNull();
    await done();
    expect(await dispatch(page, rename("annotations", "a"))).toBeNull();
    await done();
    await expect.poll(() => editing(page)).toEqual([]);
    expect(await journalLength(page)).toBe(START + 1);
    await tab(page, "Journal").click();
    const panel = page.locator("#inspector-panel-journal");
    const first = panel.locator(":scope > ol > li").first();
    const firstText = first.locator(":scope > .row > .text");
    await expect(firstText).toHaveText("Edited bundle Mixed (3 changes)");

    await arranger(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(names).toEqual(["c", "b", original[2]]);
    expect(await journalLength(page)).toBe(START + 1);
    await expect(firstText).toHaveText("Edited bundle Mixed (3 changes, 1 undone)");
    const disclosure = first.locator(":scope > .row > button");
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    const children = first.locator(":scope > ol > li");
    await expect(children.locator(":scope > .row > .text")).toHaveText([
      "Set name of bmixed0000/annotations",
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
    await expect(firstText).toHaveText("Edited bundle Mixed (3 changes)");

    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(names).toEqual(["c", original[1], original[2]]);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(names).toEqual(["c", "b", original[2]]);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(names).toEqual(["c", "b", "a"]);
  });
});

test.describe("on groups", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "groups");
    await setViewport(page, VIEW);
  });

  test("a member card dragged below its sibling reorders the group", async ({ page }) => {
    const group = `${GROUPS.child}/group_1`;
    await enter(page, group);
    const from = await framePoint(page, GROUPS.child, "second-half/card");
    // The block lies at (0, 0) at scale 1, so a drawing ordinate is the canvas y.
    const origin = await toScreen(page, 0, 0);
    // Pressed in the card's upper half, so the card's own middle passes recording's as well.
    expect(from.y - origin.y).toBeLessThan(74.78125);
    const to = await toScreen(page, 0, 172);
    await drag(page, from, 0, to.y - from.y);
    await expect.poll(() => entriesLength(page)).toBe(1);
    expect(
      await page.evaluate(() => {
        const [entry] = window.__tilie.store().entries;
        return entry !== undefined && "command" in entry
          ? JSON.parse(JSON.stringify(entry.command))
          : null;
      }),
    ).toEqual({
      type: "set",
      changes: [{ target: group, values: { order: null } }],
    });
    // The new order is the members' own, so the group's entry is deleted, not written out.
    expect(
      await page.evaluate(
        (block) =>
          JSON.parse(
            JSON.stringify(window.__tilie.store().view.blocks[block]?.manifest.graphical?.order),
          ),
        GROUPS.child,
      ),
    ).toEqual({});
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
    const bundle = [{ target: MIXED, kind: "bundle" }];
    const group = [{ target: `${MIXED}/group_1`, kind: "group" }];
    await enter(page, MIXED);
    await enter(page, `${MIXED}/group_1`);
    const pane = await emptyPoint(page, -20, 450);
    await page.mouse.dblclick(pane.x, pane.y);
    await expect.poll(() => editing(page)).toEqual(bundle);
    await expect.poll(() => viewportOf(page)).toEqual(VIEW);

    await enter(page, `${MIXED}/group_1`);
    const other = await partCentre(page, BUNDLES.shared, "group_1");
    await page.mouse.dblclick(other.x, other.y);
    await expect.poll(() => editing(page)).toEqual(bundle);
    await page.mouse.dblclick(other.x, other.y);
    await expect.poll(() => editing(page)).toEqual([]);

    await enter(page, `${MIXED}/group_1`);
    const own = await framePoint(page, MIXED, "group_1");
    await page.mouse.dblclick(own.x, own.y);
    expect(await editing(page)).toEqual(group);
    const faded = await partCentre(page, MIXED, "group_2");
    await page.mouse.dblclick(faded.x, faded.y);
    await expect.poll(() => editing(page)).toEqual([]);
    expect(await journalLength(page)).toBe(START);
  });

  test("a double-click on a box inside the edited element opens its editor", async ({ page }) => {
    await enter(page, `${MIXED}/group_1`);
    const card = await framePoint(page, MIXED, "score/card");
    await page.mouse.dblclick(card.x, card.y);
    await expect
      .poll(() => editing(page))
      .toEqual([
        { target: `${MIXED}/group_1`, kind: "group" },
        { target: `${MIXED}/score`, kind: "timeline" },
      ]);
  });

  test("closing and opening the drawer centres the edited element for the new size", async ({
    page,
  }) => {
    const workspace = readWorkspace(fixtureText("bundles"));
    if (isLoadError(workspace)) throw new Error("bundles.tle.json is refused");
    const block = workspace.view.blocks[MIXED];
    if (block === undefined) throw new Error(`block ${MIXED} is missing`);
    const drawing = drawingOf(block, workspace.view.settings, METRICS);
    const bounds = {
      ...nodePosition(block, drawing),
      width: drawing.width * block.scale,
      height: drawing.height * block.scale,
    };
    /** The bundle editor's viewport for the arranger's size now. */
    const focused = async () =>
      focusViewport(
        bounds,
        await arranger(page).evaluate((element) => ({
          width: element.clientWidth,
          height: element.clientHeight,
        })),
        0,
      );

    expect(await page.evaluate((target) => window.__tilie.open(target), MIXED)).toBeNull();
    await expect(page.locator("#inspector")).toBeVisible();
    const open = await focused();
    await expect.poll(() => viewportOf(page)).toEqual(open);

    await page.getByRole("button", { name: "Close inspector" }).click();
    await expect(page.locator("#inspector")).toBeHidden();
    const closed = await focused();
    expect(closed).not.toEqual(open);
    await expect.poll(() => viewportOf(page)).toEqual(closed);

    await page.getByRole("button", { name: "Open inspector" }).click();
    await expect(page.locator("#inspector")).toBeVisible();
    expect(await focused()).toEqual(open);
    await expect.poll(() => viewportOf(page)).toEqual(open);

    await editingBar(page).getByRole("button", { name: "Done", exact: true }).click();
    await expect.poll(() => editing(page)).toEqual([]);
    await expect.poll(() => viewportOf(page)).toEqual(VIEW);
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
    await enter(page, `${MIXED}/score`);
    await page.evaluate((address) => window.__tilie.select([address]), `${MIXED}/score/card`);
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
    const card = (address: string) =>
      node(page, MIXED)
        .locator(`[data-address="${address}"]`)
        .last()
        .evaluate((rect) => [rect.getAttribute("x"), rect.getAttribute("width")]);
    expect(await card("score/card")).toEqual(["16", "566.4846"]);
    expect(await card("performance/card")).toEqual(["16", "566.4846"]);
  });
});
