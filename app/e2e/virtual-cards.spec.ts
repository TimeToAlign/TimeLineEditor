/**
 * Virtual cards in a browser, on TimeToShare's fixture `flow/virtual_cards`
 * (the root `allegro`, its atomic sections A, B and C; the virtual timeline
 * `allegro_default` "Allegro, default" playing A B A C), with
 * `allegro_default` placed by one `set` of its place, the expected values as
 * the arranger's README derives them ("Virtual cards, ribbons, the flow flag
 * and the flow switch"):
 *
 * - the pointer on the label of chunk 0 (A) draws one ribbon, to A's
 *   stretch on `allegro`'s line, and lights chunk 2, the other A, as a
 *   line over its drawn span (from its boundary to the next chunk's);
 *   leaving the block takes both away;
 * - with Show coordinates on, the pointer on the virtual card's line over
 *   chunk 2 shows the written position in the flag's part `written
 *   allegro_default`, named "Allegro", its occurrence `2 of 2` (A is played
 *   twice), wherever in chunk 2 the pointer lies;
 * - beside the resize modes of `allegro`'s selected card the flow switch
 *   lists "As written" and the four FlowMaps of `allegro`, each once, no
 *   virtual timeline, and choosing `default` journals exactly the `style`
 *   command setting `flow` to `default` on `{id: "allegro", part:
 *   ["card"]}`;
 * - Delete on the selected card of `allegro_default` hides it: the journal
 *   gains exactly `{type: "set", changes: [{target: {block, id:
 *   "allegro_default"}, values: {place: {x: null, y: null}}}]}`, the block's
 *   places no longer hold it, and the three virtual timelines stay;
 * - with that card selected, the Properties tab's "Delete virtual timeline"
 *   journals exactly `{type: "remove", targets: [{block, id:
 *   "allegro_default"}]}`, and the manifest keeps the FlowMap `default` and
 *   the two other virtual timelines.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf } from "../packages/arranger/src/drawing.ts";
import { isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import type { Drawing } from "../packages/layout/src/index.ts";
import { FONT_METRICS } from "./schema.ts";
import {
  arranger,
  dispatch,
  importFixture,
  journalLength,
  newestCommand,
  panel,
  paneOf,
  partCentre,
  select,
  settledDrawing,
  tab,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const DEFAULT = "allegro_default";

/** Block `block`'s drawing as the canvas draws it now (`settledDrawing` waited for it). */
async function drawingNow(page: Page, block: string): Promise<Drawing> {
  const workspace = readWorkspace(await page.evaluate(() => window.__tilie.text()));
  if (isLoadError(workspace)) throw new Error("the workspace is refused");
  const found = workspace.view.blocks[block];
  if (found === undefined) throw new Error(`block ${block} is missing`);
  return drawingOf(found, workspace.view.graphical, FONT_METRICS, undefined, await paneOf(page));
}

/** Import the fixture and place `allegro_default` at (0, 200); the block. */
async function start(page: Page): Promise<string> {
  const block = await importFixture(page, "flow/virtual_cards");
  expect(
    await dispatch(page, {
      type: "set",
      changes: [{ target: { block, id: DEFAULT }, values: { place: { x: 0, y: 200 } } }],
    }),
  ).toBeNull();
  await settledDrawing(page, block);
  return block;
}

test("a chunk's ribbons and the other chunks of its source follow the pointer", async ({
  page,
}) => {
  const block = await start(page);
  const ribbons = page.locator(".tilie-block g.tilie-ribbons");
  await expect(ribbons).toHaveCount(0);
  const label = await partCentre(page, block, { id: DEFAULT, part: [0, "label"] });
  await page.mouse.move(label.x, label.y);
  await expect(ribbons.locator("path.tilie-ribbon")).toHaveCount(1);
  const lit = ribbons.locator(".tilie-lit");
  await expect(lit).toHaveCount(1);
  // Chunk 2's drawn span: from its boundary to chunk 3's, on the line's ordinate.
  const drawing = await drawingNow(page, block);
  const at = (wanted: readonly (string | number)[] | null) =>
    drawing.elements.find(
      (element) =>
        element.address.id === DEFAULT &&
        element.address.facet === undefined &&
        JSON.stringify(element.address.part ?? null) === JSON.stringify(wanted),
    );
  const [two, three, line] = [at([2, "start"]), at([3, "start"]), at(null)];
  if (two?.type !== "boundary" || three?.type !== "boundary" || line?.type !== "timeline") {
    throw new Error("chunk 2's boundaries and the line");
  }
  expect(
    await lit.evaluate((drawn) => ["x1", "x2", "y1", "y2"].map((name) => drawn.getAttribute(name))),
  ).toEqual([two.x, three.x, line.y, line.y].map(String));
  await page.mouse.move(1, 1);
  await expect(ribbons).toHaveCount(0);
});

test("the flag on a virtual card names the written position's occurrence", async ({ page }) => {
  const block = await start(page);
  await page.getByRole("button", { name: "Show coordinates" }).click();
  // The label of chunk 2 is centred on its drawn span.
  const chunk = await partCentre(page, block, { id: DEFAULT, part: [2, "label"] });
  const line = await partCentre(page, block, { id: DEFAULT });
  await page.mouse.move(chunk.x, line.y);
  const written = page.getByTestId("coordinate-flag").locator(`[data-flow="written ${DEFAULT}"]`);
  await expect(written.locator(".tilie-coordinates-head")).toHaveText("Allegro");
  await expect(written.locator('[data-flow-row="occurrence"] .tilie-coordinates-value')).toHaveText(
    "2 of 2",
  );
});

test("the flow switch of a card sends the style command", async ({ page }) => {
  const block = await start(page);
  await select(page, [{ block, id: "allegro", part: ["card"] }]);
  const flow = page.getByTestId("flow-switch");
  await expect(flow.locator("option")).toHaveText([
    "As written",
    "Practice",
    "default",
    "printed",
    "single",
  ]);
  const before = await journalLength(page);
  await flow.selectOption({ label: "default" });
  await expect.poll(() => journalLength(page)).toBe(before + 1);
  expect(await newestCommand(page)).toEqual({
    type: "style",
    select: { addresses: [{ id: "allegro", part: ["card"] }] },
    set: { flow: "default" },
    blocks: [block],
  });
});

/** Whether block `block` places `id`, and the IDs of its virtual timelines and FlowMaps. */
function heldIn(
  page: Page,
  block: string,
  id: string,
): Promise<{ placed: boolean; virtual: string[]; flowMaps: string[] }> {
  return page.evaluate(
    ([at, held]) => {
      const found = window.__tilie.store().view.blocks[at];
      if (found === undefined) throw new Error(`block ${at} is missing`);
      return {
        placed: Object.hasOwn(found.places, held),
        virtual: (found.manifest.virtual_timelines ?? []).map((item) => item.id),
        flowMaps: (found.manifest.flow_maps ?? []).map((item) => item.id),
      };
    },
    [block, id] as const,
  );
}

test("Delete hides a selected virtual card and keeps its virtual timeline", async ({ page }) => {
  const block = await start(page);
  await select(page, [{ block, id: DEFAULT, part: ["card"] }]);
  const before = await journalLength(page);
  await arranger(page).focus();
  await page.keyboard.press("Delete");
  await expect.poll(() => journalLength(page)).toBe(before + 1);
  expect(await newestCommand(page)).toEqual({
    type: "set",
    changes: [{ target: { block, id: DEFAULT }, values: { place: { x: null, y: null } } }],
  });
  const held = await heldIn(page, block, DEFAULT);
  expect(held.placed).toBe(false);
  expect(held.virtual).toEqual(["allegro_by_hand", DEFAULT, "allegro_single"]);
});

test("the Properties tab deletes the selected card's virtual timeline", async ({ page }) => {
  const block = await start(page);
  await select(page, [{ block, id: DEFAULT, part: ["card"] }]);
  const opener = page.getByRole("button", { name: "Open inspector" });
  if (await opener.isVisible()) await opener.click();
  await tab(page, "Properties").click();
  const before = await journalLength(page);
  await (await panel(page, "Properties"))
    .getByRole("button", { name: "Delete virtual timeline" })
    .click();
  await expect.poll(() => journalLength(page)).toBe(before + 1);
  expect(await newestCommand(page)).toEqual({ type: "remove", targets: [{ block, id: DEFAULT }] });
  const held = await heldIn(page, block, DEFAULT);
  expect(held.virtual).toEqual(["allegro_by_hand", "allegro_single"]);
  expect(held.flowMaps).toContain("default");
});
