/**
 * The windows of a virtual card in the inspector and under a double-click
 * (TimeToShare's `docs/drawing.md`, section 8.10, Windows), in a browser,
 * on the fixture `flow/virtual_cards`. Derivation in `README.md`
 * ("segment-ui.spec.ts"): the band list's switches "From the sources" turn
 * the sources' regions and conversion maps on in every window; a
 * double-click on a region a window shows opens the virtual card's editor
 * with the region selected, and a drag of its end there changes the source
 * region, every drawing of it at once, the canvas staying on the virtual
 * card; a chunk's label shows the chunk's facts and opens the flow-control
 * editor of its FlowMap's root, the FlowMap's row folded out and the chunk
 * chosen.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf } from "../packages/arranger/src/drawing.ts";
import type { View } from "../packages/core/src/index.ts";
import { apply, isCommandError, isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import type { Drawing } from "../packages/layout/src/index.ts";
import { FONT_METRICS } from "./schema.ts";
import {
  dispatch,
  done,
  drawer,
  editing,
  element,
  entriesLength,
  importFixture,
  journalLength,
  newestCommand,
  panel,
  paneOf,
  select,
  selection,
  settledDrawing,
  setViewport,
  tab,
  viewportOf,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const ROOT = "allegro";
const DEFAULT = "allegro_default";
const BY_HAND = "allegro_by_hand";

/** Import the fixture, place `allegro_default` alone at (0, 200) and add `motto` and `tempo` to `allegro`; the block. */
async function windowed(page: Page): Promise<string> {
  const block = await importFixture(page, "flow/virtual_cards");
  const into = { block, id: ROOT };
  for (const command of [
    {
      type: "set",
      changes: [{ target: { block, id: DEFAULT }, values: { place: { x: 0, y: 200 } } }],
    },
    {
      type: "add",
      into,
      region: { id: "motto", name: "Motto", start: [100, 1], end: [200, 1] },
    },
    {
      type: "add",
      into,
      map: {
        id: "tempo",
        name: "Tempo",
        offset: 0,
        scalar: [1, 2],
        source_unit: "quarters",
        target_unit: "seconds",
        type: "LinearMap",
      },
    },
  ]) {
    expect(await dispatch(page, command)).toBeNull();
  }
  await settledDrawing(page, block);
  return block;
}

/** How often the virtual card draws the element of type `type` at `{id}`, in the drawing the canvas draws now. */
async function drawnInCard(page: Page, block: string, type: string, id: string): Promise<number> {
  await settledDrawing(page, block);
  const workspace = readWorkspace(await page.evaluate(() => window.__tilie.text()));
  if (isLoadError(workspace)) throw new Error("the workspace is refused");
  const found = workspace.view.blocks[block];
  if (found === undefined) throw new Error(`block ${block} is missing`);
  const drawing = drawingOf(
    found,
    workspace.view.graphical,
    FONT_METRICS,
    undefined,
    await paneOf(page),
  );
  const card = drawing.boxes.find((box) => box.kind === "card" && box.address.id === DEFAULT);
  if (card === undefined) throw new Error(`${DEFAULT} draws no card`);
  return drawing.elements
    .slice(card.range.start, card.range.end)
    .filter(
      (item) => item.type === type && item.address.id === id && item.address.part === undefined,
    ).length;
}

/** The style of block `block` turning the sources' band `facet` on in every window of `allegro_default`. */
const sources = (block: string, facet: string) => ({
  type: "style",
  select: { facet, inside: "chunk", within: DEFAULT },
  set: { display: "inline" },
  blocks: [block],
});

/** The centre of the `nth` drawing of `address` on the page. */
async function centreOf(page: Page, block: string, address: object, nth: number) {
  const box = await element(page, block, address)
    .nth(nth)
    .evaluate((drawn) => {
      const { x, y, width, height } = drawn.getBoundingClientRect();
      return { x, y, width, height };
    });
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

test("From the sources shows the sources' regions and conversion maps in every window", async ({
  page,
}) => {
  const block = await windowed(page);
  expect(await drawnInCard(page, block, "region", "motto")).toBe(0);
  expect(await drawnInCard(page, block, "map", "tempo")).toBe(0);
  await select(page, [{ block, id: DEFAULT }]);
  await page.getByRole("button", { name: "Open inspector" }).click();
  const list = (await panel(page, "Properties")).getByRole("table", { name: "Bands" });
  await expect(list.getByRole("columnheader")).toHaveText(["Band", "Visible", "From the sources"]);
  for (const [label, facet] of [
    ["Regions from the sources visible", "regions"],
    ["Conversion maps from the sources visible", "conversion_maps"],
  ] as const) {
    const box = list.getByRole("checkbox", { name: label, exact: true });
    await expect(box).toBeEnabled();
    await expect(box).not.toBeChecked();
    const entries = await journalLength(page);
    await box.click();
    await expect.poll(() => journalLength(page)).toBe(entries + 1);
    expect(await newestCommand(page)).toEqual(sources(block, facet));
    await expect(box).toBeChecked();
  }
  expect(await drawnInCard(page, block, "region", "motto")).toBe(2);
  expect(await drawnInCard(page, block, "map", "tempo")).toBe(4);
});

test("a double-click on a window's region opens the virtual card's editor, its edits going to the source", async ({
  page,
}) => {
  const block = await windowed(page);
  await page.getByRole("button", { name: "Open inspector" }).click();
  expect(await dispatch(page, sources(block, "regions"))).toBeNull();
  await settledDrawing(page, block);
  const labels = element(page, block, { id: "motto", part: ["label"] });
  await expect(labels).toHaveCount(3);
  const shown = await centreOf(page, block, { id: "motto", part: ["label"] }, 1);
  await page.mouse.dblclick(shown.x, shown.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: DEFAULT }, kind: "timeline" }]);
  await expect.poll(() => selection(page)).toEqual([{ block, id: "motto" }]);
  await expectInView(page, block);

  const handles = page.getByTestId("region-handle-end");
  await expect(handles).toHaveCount(3);
  const before = await drawingNow(page, block);
  // 100 quarters of the window's brace (`motto` is [100, 200]), in canvas units, made a whole number
  // of screen pixels by the zoom: Firefox and WebKit deliver a pointer at whole pixels only.
  const [, piece] = before.drawing.elements.filter(
    (item) => item.type === "region" && item.address.id === "motto",
  );
  if (piece?.type !== "region") throw new Error("motto draws no window brace");
  const scale = before.view.blocks[block]?.scale ?? 1;
  const units = (piece.x2 - piece.x1) * scale;
  const shownAt = await viewportOf(page);
  const brace = Math.round(units * shownAt.zoom);
  await setViewport(page, { ...shownAt, zoom: brace / units });
  const handle = await handles.nth(1).boundingBox();
  if (handle === null) throw new Error("the window's end handle is not shown");
  const x = Math.round(handle.x + handle.width / 2);
  const y = Math.round(handle.y + handle.height / 2);
  const entries = await entriesLength(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + brace, y, { steps: 10 });
  await page.mouse.up();
  const command = {
    type: "set",
    changes: [{ target: { block, id: "motto" }, values: { end: [300, 1] } }],
  };
  await expect.poll(() => entriesLength(page)).toBe(entries + 1);
  expect(await newestCommand(page)).toEqual(command);
  // Every drawing of `motto`, on `allegro`'s card and in both windows, is the one the stored set gives.
  const expected = apply(before.view, command);
  if (isCommandError(expected)) throw new Error(expected.message);
  await settledDrawing(page, block);
  const braces = (drawing: Drawing) =>
    drawing.elements.filter((item) => item.type === "region" && item.address.id === "motto");
  const after = await drawingNow(page, block);
  expect(braces(after.drawing)).toEqual(braces(await drawingIn(page, expected, block)));
  expect(braces(after.drawing).length).toBe(3);
  expect(braces(after.drawing)).not.toEqual(braces(before.drawing));
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: DEFAULT }, kind: "timeline" }]);
  await expectInView(page, block);
});

test("a double-click on a chunk opens the flow-control editor, its row folded out and the chunk chosen", async ({
  page,
}) => {
  const block = await windowed(page);
  await page.getByRole("button", { name: "Open inspector" }).click();
  await settledDrawing(page, block);
  const chunk = await centreOf(page, block, { id: DEFAULT, part: [1, "label"] }, 0);
  await page.mouse.click(chunk.x, chunk.y);
  await tab(page, "Properties").click();
  const rows = (await panel(page, "Properties")).getByTestId("chunk-rows");
  await expect(rows.locator("dt")).toHaveText([
    "Entry",
    "FlowMap",
    "Source",
    "Written",
    "Played",
    "Occurrence",
  ]);
  await expect(rows.locator("dd").nth(0)).toHaveText("2 of 4");
  await expect(rows.locator("dd").nth(2)).toHaveText("Region 'B'");
  const opening = await viewportOf(page);
  await page.mouse.dblclick(chunk.x, chunk.y);
  await expect.poll(() => editing(page)).toEqual([{ target: { block, id: ROOT }, kind: "flow" }]);
  const row = page.locator('[data-testid="flow-row"][data-flow-map="default"]');
  const chosen = row.locator('[data-testid="flow-entry"][aria-current="true"]');
  await expect(chosen).toHaveCount(1);
  await expect(chosen).toHaveAttribute("data-index", "1");
  await expect(chosen).toHaveClass(/selected/);
  // `default` is computed, so its row stays read only: no row is the edited one.
  await expect(page.locator(".row.draft")).toHaveCount(0);
  await done(page, opening);

  expect(
    await dispatch(page, {
      type: "set",
      changes: [{ target: { block, id: BY_HAND }, values: { place: { x: 0, y: 400 } } }],
    }),
  ).toBeNull();
  await settledDrawing(page, block);
  // Its card lies partly under the inspector drawer, which is closed for the press.
  await page.getByRole("button", { name: "Close inspector" }).click();
  // The label of C, chunk 5 of `by_hand` (A A A A, a gap, C), the run of As drawn once.
  const practice = await centreOf(page, block, { id: BY_HAND, part: [5, "label"] }, 0);
  await page.mouse.dblclick(practice.x, practice.y);
  await expect.poll(() => editing(page)).toEqual([{ target: { block, id: ROOT }, kind: "flow" }]);
  const edited = page.locator('.row.draft[data-flow-map="by_hand"]');
  await expect(edited).toHaveCount(1);
  const entry = edited.locator('[data-testid="flow-entry"][aria-current="true"]');
  await expect(entry).toHaveAttribute("data-index", "5");
});

/** The workspace's view as stored now and block `block`'s drawing in it, as the canvas draws it. */
async function drawingNow(page: Page, block: string): Promise<{ view: View; drawing: Drawing }> {
  const workspace = readWorkspace(await page.evaluate(() => window.__tilie.text()));
  if (isLoadError(workspace)) throw new Error("the workspace is refused");
  return { view: workspace.view, drawing: await drawingIn(page, workspace.view, block) };
}

/** Block `block`'s drawing in `view`, at the canvas's pane. */
async function drawingIn(page: Page, view: View, block: string): Promise<Drawing> {
  const found = view.blocks[block];
  if (found === undefined) throw new Error(`block ${block} is missing`);
  return drawingOf(found, view.graphical, FONT_METRICS, undefined, await paneOf(page));
}

/** That `allegro_default`'s card lies wholly inside the window, left of the inspector drawer. */
async function expectInView(page: Page, block: string): Promise<void> {
  const card = await element(page, block, { id: DEFAULT, part: ["card"] })
    .first()
    .boundingBox();
  const shelf = await drawer(page).boundingBox();
  if (card === null || shelf === null) throw new Error("the card or the drawer is not shown");
  expect([
    card.x >= 0,
    card.y >= 0,
    card.x + card.width <= shelf.x,
    card.y + card.height <= 1000,
  ]).toEqual([true, true, true, true]);
}
