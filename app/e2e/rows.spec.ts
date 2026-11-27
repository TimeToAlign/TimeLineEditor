/**
 * The FlowMap rows of the flow editor in the app, on TimeToShare's
 * `flow/virtual_cards`: the wheel over the pane pans the canvas as anywhere
 * else, "Place as card" puts each card at the height of its row, "+ Gap"
 * adds a gap at once whose handle sets its length in one change, and a row
 * dragged out becomes a card once the middle of its twin, not the pointer,
 * has crossed the editor's border. The expected values are derived in
 * `README.md` ("rows.spec.ts").
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  bandPoint,
  done,
  editing,
  entriesLength,
  importFixture,
  part,
  settledDrawing,
  setViewport,
  viewportOf,
} from "./support.ts";

type View = { x: number; y: number; zoom: number };

/** The viewport at zoom 1 that shows block `block`'s place at canvas pixel (300, 40). */
async function viewAt(page: Page, block: string): Promise<View> {
  const place = await page.evaluate((id) => {
    const found = window.__tilie.store().view.blocks[id];
    return found === undefined ? null : { x: found.x, y: found.y };
  }, block);
  if (place === null) throw new Error(`block ${block} is missing`);
  return { x: 300 - place.x, y: 40 - place.y, zoom: 1 };
}

/** `flow/virtual_cards` imported, `allegro`'s flow editor opened on the arranger at `view`. */
async function opened(page: Page): Promise<{ block: string; view: View; pane: Locator }> {
  const block = await importFixture(page, "flow/virtual_cards");
  const view = await viewAt(page, block);
  await setViewport(page, view);
  await settledDrawing(page, block);
  const inBand = await bandPoint(page, block, { id: "allegro", facet: "flow_control" }, 2);
  await page.mouse.dblclick(inBand.x, inBand.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: "allegro" }, kind: "flow" }]);
  await setViewport(page, view);
  const pane = page.getByTestId("flow-pane");
  await expect(pane).toBeVisible();
  return { block, view, pane };
}

/** The row of the FlowMap `id` in `pane`. */
function rowOf(pane: Locator, id: string): Locator {
  return pane.locator(`[data-testid="flow-row"][data-flow-map="${id}"]`);
}

/**
 * The commands of the open editor's session from entry `from` on, as JSON
 * (a `bigint` written as its digits); a closed session's entry is `null`.
 */
function entryCommands(page: Page, from: number): Promise<unknown[]> {
  return page.evaluate(
    (start) =>
      window.__tilie
        .store()
        .entries.slice(start)
        .map((entry) =>
          "command" in entry
            ? JSON.parse(
                JSON.stringify(entry.command, (_key, value) =>
                  typeof value === "bigint" ? value.toString() : value,
                ),
              )
            : null,
        ),
    from,
  );
}

/** The rectangle of `locator` on screen; throws where it is not laid out. */
async function rectOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("not laid out");
  return box;
}

/** The places of block `block`'s items as the store holds them. */
function placesOf(page: Page, block: string): Promise<Record<string, { x: number; y: number }>> {
  return page.evaluate((id) => {
    const found = window.__tilie.store().view.blocks[id];
    if (found === undefined) throw new Error(`block ${id} is missing`);
    return JSON.parse(JSON.stringify(found.places));
  }, block);
}

/** The virtual timelines of block `block`'s manifest that apply the FlowMap `map`. */
function virtualsOf(page: Page, block: string, map: string): Promise<string[]> {
  return page.evaluate(
    ([id, flowMap]) =>
      (window.__tilie.store().view.blocks[id]?.manifest.virtual_timelines ?? []).flatMap((item) =>
        item.map === flowMap ? [item.id] : [],
      ),
    [block, map] as const,
  );
}

test("the wheel over the pane pans the canvas, plain and with Shift", async ({ page }) => {
  const { view, pane } = await opened(page);
  const over = await rectOf(rowOf(pane, "default").locator(".drawing"));
  await page.mouse.move(Math.round(over.x + over.width / 2), Math.round(over.y + over.height / 2));
  await page.mouse.wheel(0, 40);
  await expect.poll(() => viewportOf(page)).toEqual({ ...view, y: view.y - 20 });
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 40);
  await page.keyboard.up("Shift");
  await expect.poll(() => viewportOf(page)).toEqual({ x: view.x - 20, y: view.y - 20, zoom: 1 });
});

test("Place as card puts each card at the height of its row, one under another", async ({
  page,
}) => {
  const { block, view, pane } = await opened(page);
  const from = await entriesLength(page);
  await rowOf(pane, "printed").getByRole("button", { name: "Place as card" }).click();
  await expect.poll(() => entriesLength(page)).toBe(from + 2);
  const [printed] = await virtualsOf(page, block, "printed");
  if (printed === undefined) throw new Error("no virtual timeline of printed");
  await rowOf(pane, "single").getByRole("button", { name: "Place as card" }).click();
  await expect.poll(() => entriesLength(page)).toBe(from + 3);
  const commands = await entryCommands(page, from);
  expect(commands.map((command) => (command as { type: string }).type)).toEqual([
    "add",
    "set",
    "set",
  ]);

  const places = await placesOf(page, block);
  const first = places[printed];
  const second = places.allegro_single;
  if (first === undefined || second === undefined) throw new Error("a card is not placed");
  expect(second.x).toBe(first.x);
  const height = Number(
    await rowOf(pane, "printed").locator(".drawing svg").getAttribute("height"),
  );
  // One row's head (16) and the height of `printed`'s row drawing, at scale 1, apart.
  expect(second.y - first.y).toBe(16 + height);

  // While the editor is open the card's line runs on right of the pane, at the height of its row.
  const paneRect = await rectOf(pane);
  const line = await rectOf(part(page, block, { id: printed }));
  expect(line.x + line.width > paneRect.x + paneRect.width).toBe(true);
  expect(line.y > paneRect.y && line.y < paneRect.y + paneRect.height).toBe(true);

  // Closed, the cards stand under the root's card, indented, `single`'s under `printed`'s.
  await done(page, view);
  const root = await rectOf(part(page, block, { id: "allegro" }));
  const shownPrinted = await rectOf(part(page, block, { id: printed }));
  const shownSingle = await rectOf(part(page, block, { id: "allegro_single" }));
  expect(shownPrinted.y > root.y).toBe(true);
  expect(shownSingle.y > shownPrinted.y).toBe(true);
  expect(shownPrinted.x > root.x).toBe(true);
  expect(shownSingle.x).toBe(shownPrinted.x);
  expect(await placesOf(page, block)).toEqual(places);
});

test("+ Gap adds a gap at once, and its handle sets the length in one change", async ({ page }) => {
  const { block, pane } = await opened(page);
  const row = rowOf(pane, "by_hand");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(row).toHaveClass(/\bdraft\b/);
  const from = await entriesLength(page);
  await row.getByRole("button", { name: "+ Gap" }).click();
  await expect.poll(() => entriesLength(page)).toBe(from + 1);
  const A4 = ["section_a", "section_a", "section_a", "section_a"];
  expect(await entryCommands(page, from)).toEqual([
    {
      type: "set",
      changes: [
        {
          target: { block, id: "by_hand" },
          values: { chunks: [...A4, { gap: [4, 1] }, "section_c", { gap: [1144, 1] }] },
        },
      ],
    },
  ]);
  const input = row.getByTestId("flow-gap");
  await expect(input).toHaveValue("1144");
  await expect(input).toBeFocused();

  // The handle of the gap of 4 (entry 4) dragged 40 px right: 4 + 40 × 1644 / 400 = 168.4.
  const handle = row.locator('[data-testid="flow-gap-handle"][data-index="4"]');
  const box = await rectOf(handle);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 4 });
  await expect(pane.getByTestId("flow-gap-flag")).toHaveText("gap 168");
  expect(await entriesLength(page)).toBe(from + 1);
  await page.mouse.up();
  await expect.poll(() => entriesLength(page)).toBe(from + 2);
  expect(await entryCommands(page, from + 1)).toEqual([
    {
      type: "set",
      changes: [
        {
          target: { block, id: "by_hand" },
          values: { chunks: [...A4, { gap: [168, 1] }, "section_c", { gap: [1144, 1] }] },
        },
      ],
    },
  ]);
  await expect(pane.getByTestId("flow-gap-flag")).toHaveCount(0);
});

test("a row dragged out becomes a card once its twin's middle has crossed the border", async ({
  page,
}) => {
  const { block, pane } = await opened(page);
  const paneRect = await rectOf(pane);
  const name = await rectOf(rowOf(pane, "printed").locator(".name"));
  const x = Math.round(name.x + name.width / 2);
  const y = Math.round(name.y + name.height / 2);
  const from = await entriesLength(page);

  // The pointer past the pane's left border, the twin's middle still inside: it flies back.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(Math.round(paneRect.x) - 40, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("flow-twin")).toHaveCount(0);
  expect(await entriesLength(page)).toBe(from);

  // The pointer still inside the pane, the twin's middle past its right border: placed.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(Math.round(paneRect.x + paneRect.width) - 60, y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => entriesLength(page)).toBe(from + 2);
  const [virtual, placed] = await entryCommands(page, from);
  expect(virtual).toMatchObject({
    type: "add",
    into: { block },
    virtual_timeline: { map: "printed", timeline: "allegro", name: "printed" },
  });
  expect(placed).toMatchObject({ type: "set" });
});
