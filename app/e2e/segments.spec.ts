/**
 * Deleting a segment is not supported yet: Delete and Backspace on a
 * segment show the store's refusal in the status line, open no menu and
 * change nothing; the status line is cleared between the two keys, so that each
 * shows its own refusal. Derivation in `README.md` ("segments.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Address } from "../packages/core/src/index.ts";
import { manifestFixture } from "./schema.ts";
import {
  arranger,
  chooseItem,
  journalLength,
  pick,
  select,
  selection,
  withoutPickers,
} from "./support.ts";

/** The root `form` of a block's manifest: its length, and its segments' ids and offsets, as JSON text. */
function form(page: Page, block: string): Promise<string> {
  return page.evaluate((id) => {
    const root = window.__tilie.store().view.blocks[id]?.manifest.timelines[0];
    const plain = (value: unknown) =>
      JSON.stringify(value, (_, item) => (typeof item === "bigint" ? Number(item) : item));
    return plain({
      length: root?.length,
      segments: root?.children.map((child) => [child.id, child.offset]),
    });
  }, block);
}

test.beforeEach(async ({ page }) => {
  await withoutPickers(page);
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
});

test("Delete on a segment is refused and changes nothing", async ({ page }) => {
  await chooseItem(page, "New workspace");
  await pick(page, "Import manifest…", "segment_line.json", manifestFixture("segment_line"));
  await expect.poll(() => journalLength(page)).toBe(1);
  const [selected] = await selection(page);
  const block = selected?.block;
  if (block === undefined) throw new Error("the imported block is not selected");
  const segment: Address = { block, id: "b" };
  const unchanged = JSON.stringify({
    length: [32, 1],
    segments: [
      ["a", [0, 1]],
      ["b", [8, 1]],
      ["c", [20, 1]],
    ],
  });
  expect(await form(page, block)).toBe(unchanged);

  const hint = page.getByTestId("hint");
  /** Select `address` and focus the arranger, as a key press needs. */
  const selectOne = async (address: Address): Promise<void> => {
    await select(page, [address]);
    await arranger(page).focus();
  };
  /** Press `key` on the selected segment `b`: refused, with the journal left at `journal`. */
  const refused = async (key: string, journal: number): Promise<void> => {
    await page.keyboard.press(key);
    // Core's refusal (`segment_not_removable`), shown as the canvas shows every refusal.
    await expect(hint).toHaveText("Removing segment 'b' of line 'form' is not supported yet");
    await expect(page.locator('[data-testid="gap-menu"]')).toHaveCount(0);
    expect(await journalLength(page)).toBe(journal);
    expect(await selection(page)).toEqual([segment]);
    expect(await form(page, block)).toBe(unchanged);
  };

  await selectOne(segment);
  await refused("Delete", 1);
  // The hint clears on the next command the canvas stores: a nudge of the block.
  await selectOne({ block });
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => journalLength(page)).toBe(2);
  await expect(hint).toBeEmpty();
  await selectOne(segment);
  await refused("Backspace", 2);
});
