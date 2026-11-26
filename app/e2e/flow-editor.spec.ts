/**
 * The flow editor in the browser: opened by a double-click on what a
 * root's flow control band draws in the root's timeline editor, its pane
 * under the card with one row per FlowMap and no axe-core violation, a new
 * FlowMap landed by a key, a row dragged out onto the canvas as a card,
 * and Done folding it all into one journal entry. The expected values are
 * derived in `README.md` ("flow-editor.spec.ts").
 */

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  done,
  editing,
  enter,
  entriesLength,
  importFixture,
  journalLength,
  partCentre,
  setViewport,
} from "./support.ts";

const VIEW = { x: 40, y: 40, zoom: 1 };

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

test("the flow editor opens from the flow control band, lands, places and folds", async ({
  page,
}) => {
  const block = await importFixture(page, "flow/virtual_cards");
  const allegro = { block, id: "allegro" };
  await enter(page, allegro, VIEW);
  const symbol = await partCentre(page, block, { id: "repeat_end", part: ["symbol"] });
  await page.mouse.dblclick(symbol.x, symbol.y);
  await expect
    .poll(() => editing(page))
    .toEqual([
      { target: allegro, kind: "timeline" },
      { target: allegro, kind: "flow" },
    ]);
  await setViewport(page, VIEW);

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
  await expect.poll(() => entriesLength(page)).toBe(placedFrom + 2);
  const [virtual, placed] = await entryCommands(page, placedFrom);
  expect(virtual).toMatchObject({
    type: "add",
    into: { block },
    virtual_timeline: { map: "printed", timeline: "allegro" },
  });
  expect(placed).toMatchObject({ type: "set" });

  // Done closes the flow editor, then the timeline editor: one journal entry each level.
  const journal = await journalLength(page);
  await done(page);
  await done(page);
  await expect.poll(() => editing(page)).toEqual([]);
  expect(await journalLength(page)).toBe(journal + 1);
});
