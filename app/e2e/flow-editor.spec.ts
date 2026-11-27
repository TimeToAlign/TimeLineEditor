/**
 * The flow editor in the browser: opened on the arranger by a double-click
 * in a root card's flow control band, and in the root's timeline editor by
 * a double-click on what that band draws; its pane
 * under the card with one row per FlowMap and no axe-core violation, a new
 * FlowMap landed by a key and kept last, a row dragged out onto the canvas
 * as a card named as its row, a plain wheel over the rows panning the
 * canvas and Ctrl+wheel zooming it, and Done folding it all into one
 * journal entry. The expected values are
 * derived in `README.md` ("flow-editor.spec.ts"). A hand-made row is
 * edited in place: on the arranger's flow editor, the Edit button of
 * `by_hand` (A A A A, a gap of 4, C) makes its row the edited one (Done and
 * Cancel in it, no Edit button left); Delete on its entry 4 (the gap)
 * stores one entry, `{type: "set", changes: [{target: {block, id:
 * "by_hand"}, values: {chunks: [section_a ×4, section_c]}}]}`; the row's
 * Done keeps it and leaves no edited row; the computed rows offer no Edit.
 */

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  bandPoint,
  done,
  editing,
  enter,
  entriesLength,
  entryCommands,
  importFixture,
  journalLength,
  macUserAgent,
  partCentre,
  settledDrawing,
  setViewport,
  viewportOf,
} from "./support.ts";

const VIEW = { x: 40, y: 40, zoom: 1 };

/**
 * The viewport at zoom 1 that shows block `block`'s place at canvas pixel
 * (40, 40): the card, its flow pane with every row and the new one, and the
 * canvas 80 px below the pane all lie inside the window (at `VIEW` the pane
 * runs past the window's bottom edge).
 */
async function viewAtBlock(page: Page, block: string): Promise<typeof VIEW> {
  const place = await page.evaluate((id) => {
    const found = window.__tilie.store().view.blocks[id];
    return found === undefined ? null : { x: found.x, y: found.y };
  }, block);
  if (place === null) throw new Error(`block ${block} is missing`);
  return { x: 40 - place.x, y: 40 - place.y, zoom: 1 };
}

test("the flow editor opens from the flow control band, lands, places and folds", async ({
  page,
}) => {
  const block = await importFixture(page, "flow/virtual_cards");
  const allegro = { block, id: "allegro" };
  const view = await viewAtBlock(page, block);
  await enter(page, allegro, view);
  const symbol = await partCentre(page, block, { id: "repeat_end", part: ["symbol"] });
  await page.mouse.dblclick(symbol.x, symbol.y);
  await expect
    .poll(() => editing(page))
    .toEqual([
      { target: allegro, kind: "timeline" },
      { target: allegro, kind: "flow" },
    ]);
  await setViewport(page, view);

  const pane = page.getByTestId("flow-pane");
  await expect(pane).toBeVisible();
  const rows = pane.getByTestId("flow-row");
  await expect(rows).toHaveCount(4);
  expect(await rows.evaluateAll((items) => items.map((item) => item.dataset.flowMap))).toEqual([
    "default",
    "printed",
    "single",
    "by_hand",
  ]);
  expect(
    (await new AxeBuilder({ page }).include('[data-testid="flow-pane"]').analyze()).violations,
  ).toEqual([]);

  // A new FlowMap: Add +, then Enter on the first entry of `default`.
  const entries = await entriesLength(page);
  await pane.getByRole("button", { name: "Add +" }).click();
  await expect(pane.getByTestId("flow-draft")).toBeVisible();
  const first = rows.nth(0).getByTestId("flow-entry").first();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => entriesLength(page)).toBe(entries + 1);
  const [added] = await entryCommands(page, entries);
  expect(added).toMatchObject({
    type: "add",
    into: allegro,
    flow_map: { chunks: ["section_a"] },
  });
  await pane.getByRole("button", { name: "Done" }).click();
  // The new FlowMap's row stays last, after the rows ordered by name.
  await expect(rows).toHaveCount(5);
  expect(
    (await rows.evaluateAll((items) => items.map((item) => item.dataset.flowMap))).slice(0, 4),
  ).toEqual(["default", "printed", "single", "by_hand"]);

  // The row `printed` dragged by its name below the pane: written and placed as a card.
  const name = rows.nth(1).locator(".name");
  const from = await name.boundingBox();
  const below = await pane.boundingBox();
  if (from === null || below === null) throw new Error("the pane is not laid out");
  const placedFrom = await entriesLength(page);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, below.y + below.height + 80, { steps: 8 });
  await page.mouse.up();
  // One step of the flow editor: a closed session of the virtual timeline's `add` and its place's `set`.
  await expect.poll(() => entriesLength(page)).toBe(placedFrom + 1);
  const step = await page.evaluate((start) => {
    const store = window.__tilie.store();
    const entry = store.entries[start];
    return entry === undefined || "command" in entry
      ? []
      : (store.sessions[entry.session]?.entries ?? []).map((item) =>
          "command" in item ? item.command : null,
        );
  }, placedFrom);
  const [virtual, placed, ...more] = step;
  expect(virtual).toMatchObject({
    type: "add",
    into: { block },
    virtual_timeline: { map: "printed", timeline: "allegro", name: "printed" },
  });
  expect(placed).toMatchObject({ type: "set" });
  expect(more).toEqual([]);

  // Over the rows a plain wheel pans the canvas as anywhere else; Ctrl+wheel zooms it.
  await setViewport(page, view);
  const over = await rows.nth(0).locator(".drawing").boundingBox();
  if (over === null) throw new Error("the row is not laid out");
  await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2);
  await page.mouse.wheel(0, 40);
  await expect.poll(() => viewportOf(page)).toEqual({ ...view, y: view.y - 20 });
  await setViewport(page, view);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  // Svelte Flow's pinch zoom, 2 ** (100 × 0.002 × factor): the factor 10 under a Mac user agent.
  const factor = (await macUserAgent(page)) ? 10 : 1;
  await expect.poll(async () => (await viewportOf(page)).zoom).toBe(2 ** (0.2 * factor));
  await setViewport(page, view);

  // Done closes the flow editor, then the timeline editor: one journal entry each level.
  const journal = await journalLength(page);
  await done(page);
  await done(page);
  await expect.poll(() => editing(page)).toEqual([]);
  expect(await journalLength(page)).toBe(journal + 1);
});

test("on the arranger a double-click in the root card's flow control band opens the flow editor", async ({
  page,
}) => {
  const block = await importFixture(page, "flow/virtual_cards");
  const allegro = { block, id: "allegro" };
  await setViewport(page, VIEW);
  await settledDrawing(page, block);
  const journal = await journalLength(page);
  const inBand = await bandPoint(page, block, { id: "allegro", facet: "flow_control" }, 2);
  await page.mouse.dblclick(inBand.x, inBand.y);
  await expect.poll(() => editing(page)).toEqual([{ target: allegro, kind: "flow" }]);
  await expect(page.getByTestId("flow-pane")).toBeVisible();
  await done(page, VIEW);
  await expect.poll(() => editing(page)).toEqual([]);
  expect(await journalLength(page)).toBe(journal);

  const symbol = await partCentre(page, block, { id: "repeat_end", part: ["symbol"] });
  await page.mouse.dblclick(symbol.x, symbol.y);
  await expect.poll(() => editing(page)).toEqual([{ target: allegro, kind: "flow" }]);
});

test("a hand-made row is edited in place, a computed one never", async ({ page }) => {
  const block = await importFixture(page, "flow/virtual_cards");
  await setViewport(page, VIEW);
  await settledDrawing(page, block);
  const inBand = await bandPoint(page, block, { id: "allegro", facet: "flow_control" }, 2);
  await page.mouse.dblclick(inBand.x, inBand.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: "allegro" }, kind: "flow" }]);
  const pane = page.getByTestId("flow-pane");
  const row = (id: string) => pane.locator(`[data-testid="flow-row"][data-flow-map="${id}"]`);
  for (const computed of ["default", "printed", "single"]) {
    await expect(row(computed).getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  }
  await row("by_hand").getByRole("button", { name: "Edit", exact: true }).click();
  await expect(row("by_hand")).toHaveClass(/\bdraft\b/);
  await expect(pane.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  const entries = await entriesLength(page);
  await row("by_hand").locator('[data-testid="flow-entry"][data-index="4"]').focus();
  await page.keyboard.press("Delete");
  await expect.poll(() => entriesLength(page)).toBe(entries + 1);
  expect(await entryCommands(page, entries)).toEqual([
    {
      type: "set",
      changes: [
        {
          target: { block, id: "by_hand" },
          values: {
            chunks: ["section_a", "section_a", "section_a", "section_a", "section_c"],
          },
        },
      ],
    },
  ]);
  await row("by_hand").getByRole("button", { name: "Done", exact: true }).click();
  await expect(row("by_hand")).not.toHaveClass(/\bdraft\b/);
  expect(await entriesLength(page)).toBe(entries + 1);
});
