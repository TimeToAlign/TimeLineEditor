/**
 * The windows of a virtual card in the inspector and under a double-click
 * (TimeToShare's `docs/drawing.md`, section 8.10, Windows), in a browser,
 * on the fixture `flow/virtual_cards`. Derivation in `README.md`
 * ("segment-ui.spec.ts"): the band list's switches "From the sources" turn
 * the sources' regions and conversion maps on in every window; a
 * double-click on a region a window shows opens the editor of the timeline
 * where it is written; a chunk's label shows the chunk's facts and opens the
 * flow-control editor of its FlowMap's root.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf } from "../packages/arranger/src/drawing.ts";
import { isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import { FONT_METRICS } from "./schema.ts";
import {
  dispatch,
  done,
  editing,
  element,
  importFixture,
  journalLength,
  newestCommand,
  panel,
  paneOf,
  select,
  settledDrawing,
  tab,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const ROOT = "allegro";
const DEFAULT = "allegro_default";

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

test("a double-click edits a window's region at its source, a chunk in the flow-control editor", async ({
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
    .toEqual([{ target: { block, id: ROOT }, kind: "timeline" }]);
  await done(page);

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
  await page.mouse.dblclick(chunk.x, chunk.y);
  await expect.poll(() => editing(page)).toEqual([{ target: { block, id: ROOT }, kind: "flow" }]);
});
