/**
 * Deleting a segment is not supported yet: Delete and Backspace on a
 * segment show the refusal in the status line, open no menu and change
 * nothing; the status line is cleared between the two keys, so that each
 * shows its own refusal. Derivation in `README.md` ("segments.spec.ts").
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { chooseItem, journalLength, pick, selection } from "./support.ts";

/** The timeskeleton package that `core` depends on, and its schema version's manifest fixtures. */
const packageDir = path.dirname(
  createRequire(path.join(import.meta.dirname, "../packages/core/package.json")).resolve(
    "@timetoalign/timeskeleton/package.json",
  ),
);
const { SCHEMA_VERSION } = (await import(
  pathToFileURL(path.join(packageDir, "dist", "index.js")).href
)) as { readonly SCHEMA_VERSION: string };

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
  // The fallback path: without the pickers the editor uses a file input.
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
});

test("Delete on a segment is refused and changes nothing", async ({ page }) => {
  await chooseItem(page, "New workspace");
  const manifest = path.join(packageDir, "fixtures", SCHEMA_VERSION, "segment_line.json");
  await pick(page, "Import manifest…", "segment_line.json", readFileSync(manifest, "utf8"));
  await expect.poll(() => journalLength(page)).toBe(1);
  const [block] = await selection(page);
  if (block === undefined) throw new Error("the imported block is not selected");
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
  /** Select `address` through the hook and focus the arranger, as a key press needs. */
  const select = async (address: string): Promise<void> => {
    await page.evaluate((selected) => window.__tilie.select([selected]), address);
    await page.locator('[role="application"][aria-label="Arranger"]').focus();
  };
  /** Press `key` on the selected segment `b`: refused, with the journal left at `journal`. */
  const refused = async (key: string, journal: number): Promise<void> => {
    await page.keyboard.press(key);
    await expect(hint).toHaveText("Deleting a segment is not supported yet.");
    await expect(page.locator('[data-testid="gap-menu"]')).toHaveCount(0);
    await expect(page.locator("[data-moved]")).toHaveCount(0);
    expect(await journalLength(page)).toBe(journal);
    expect(await selection(page)).toEqual([`${block}/b`]);
    expect(await form(page, block)).toBe(unchanged);
  };

  await select(`${block}/b`);
  await refused("Delete", 1);
  // The hint clears on the next command the canvas stores: a nudge of the block.
  await select(block);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => journalLength(page)).toBe(2);
  await expect(hint).toBeEmpty();
  await select(`${block}/b`);
  await refused("Backspace", 2);
});
