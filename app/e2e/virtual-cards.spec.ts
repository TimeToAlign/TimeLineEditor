/**
 * Virtual cards in a browser, on TimeToShare's fixture `flow/virtual_cards`
 * (the root `allegro`, its atomic sections A, B and C; the virtual timeline
 * `allegro_default` "Allegro, default" playing A B A C), with
 * `allegro_default` placed by one `set` of its place, the expected values as
 * the arranger's README derives them ("Virtual cards, ribbons, the flow flag
 * and the flow switch"):
 *
 * - the pointer on the label of chunk 0 (A) draws one ribbon, to A's
 *   stretch on `allegro`'s line, and lights the brace of chunk 2, the other
 *   A; leaving the block takes both away;
 * - with Show coordinates on, the pointer on the virtual card's line over
 *   chunk 2 shows the written position in the flag's part `written
 *   allegro_default`, named "Allegro", its occurrence `2 of 2` (A is played
 *   twice), wherever in chunk 2 the pointer lies;
 * - above `allegro`'s selected card the flow switch lists "As written" and
 *   the seven flows of `allegro`, and choosing "Allegro, default" journals
 *   exactly the `style` command setting `flow` on `{id: "allegro", part:
 *   ["card"]}`.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  dispatch,
  importFixture,
  journalLength,
  newestCommand,
  part,
  partCentre,
  select,
  settledDrawing,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const DEFAULT = "allegro_default";

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
  const label = await partCentre(page, block, {
    id: DEFAULT,
    facet: "regions",
    part: [0, "label"],
  });
  await page.mouse.move(label.x, label.y);
  await expect(ribbons.locator("path.tilie-ribbon")).toHaveCount(1);
  const lit = ribbons.locator(".tilie-lit");
  await expect(lit).toHaveCount(1);
  const brace = part(page, block, { id: DEFAULT, facet: "regions", part: [2] });
  expect(await lit.getAttribute("d")).toBe(await brace.getAttribute("d"));
  await page.mouse.move(1, 1);
  await expect(ribbons).toHaveCount(0);
});

test("the flag on a virtual card names the written position's occurrence", async ({ page }) => {
  const block = await start(page);
  await page.getByRole("button", { name: "Show coordinates" }).click();
  const chunk = await partCentre(page, block, { id: DEFAULT, facet: "regions", part: [2] });
  const line = await partCentre(page, block, { id: DEFAULT });
  await page.mouse.move(chunk.x, line.y);
  const written = page.getByTestId("coordinate-flag").locator(`[data-flow="written ${DEFAULT}"]`);
  await expect(written.locator(".tilie-coordinates-head")).toHaveText("Allegro");
  await expect(written.locator('[data-flow-row="occurrence"] .tilie-coordinates-value')).toHaveText(
    "2 of 2",
  );
});

test("the flow switch above a card sends the style command", async ({ page }) => {
  const block = await start(page);
  await select(page, [{ block, id: "allegro", part: ["card"] }]);
  const flow = page.getByTestId("flow-switch");
  await expect(flow.locator("option")).toHaveText([
    "As written",
    "Practice",
    "default",
    "printed",
    "single",
    "Allegro, practice",
    "Allegro, default",
    "Allegro, single",
  ]);
  const before = await journalLength(page);
  await flow.selectOption({ label: "Allegro, default" });
  await expect.poll(() => journalLength(page)).toBe(before + 1);
  expect(await newestCommand(page)).toEqual({
    type: "style",
    select: { addresses: [{ id: "allegro", part: ["card"] }] },
    set: { flow: DEFAULT },
    blocks: [block],
  });
});
