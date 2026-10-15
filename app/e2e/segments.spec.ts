/**
 * Deleting a segment: Delete opens the menu asking how to close the gap,
 * the menu offers only the permitted ways and passes axe, and Enter removes
 * the segment closing its gap as chosen. Derivation in `README.md`
 * ("segments.spec.ts").
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { chooseItem, commandsFrom, journalLength, pick, selection } from "./support.ts";

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

const radio = (page: Page, option: string) => page.locator(`[data-testid="gap-${option}"]`);

test.beforeEach(async ({ page }) => {
  // The fallback path: without the pickers the editor uses a file input.
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
});

test("Delete on a segment asks how to close its gap and closes it so", async ({ page }) => {
  await chooseItem(page, "New workspace");
  const manifest = path.join(packageDir, "fixtures", SCHEMA_VERSION, "segment_line.json");
  await pick(page, "Import manifest…", "segment_line.json", readFileSync(manifest, "utf8"));
  await expect.poll(() => journalLength(page)).toBe(1);
  const [block] = await selection(page);
  if (block === undefined) throw new Error("the imported block is not selected");
  expect(await form(page, block)).toBe(
    JSON.stringify({
      length: [32, 1],
      segments: [
        ["a", [0, 1]],
        ["b", [8, 1]],
        ["c", [20, 1]],
      ],
    }),
  );

  await page.evaluate((address) => window.__tilie.select([address]), `${block}/b`);
  await page.locator('[role="application"][aria-label="Arranger"]').focus();
  await page.keyboard.press("Delete");

  const menu = page.locator('[data-testid="gap-menu"]');
  await expect(menu).toBeVisible();
  await expect(radio(page, "left")).toBeDisabled();
  await expect(radio(page, "right")).toBeEnabled();
  await expect(radio(page, "extend")).toBeDisabled();
  await expect(radio(page, "shift")).toBeEnabled();
  await expect(radio(page, "right")).toBeChecked();
  await expect(radio(page, "shift")).toBeChecked();
  await expect(radio(page, "right")).toBeFocused();
  await expect(menu.locator("label").filter({ has: radio(page, "left") })).toHaveAttribute(
    "title",
    "the preceding segment a is locked; its segment line form is a root and has no offset to move",
  );
  await expect(menu.locator("label").filter({ has: radio(page, "extend") })).toHaveAttribute(
    "title",
    "the preceding segment a is locked; the following segment c is locked",
  );
  expect(
    await page
      .locator("[data-moved]")
      .evaluateAll((items) =>
        [...new Set(items.map((item) => item.getAttribute("data-address") ?? ""))].sort(),
      ),
  ).toEqual([
    "c",
    "c/label",
    "c/start",
    "form",
    "form/card",
    "form/end",
    "form/end/label",
    "form/name",
    "form/start",
    "form/start/label",
  ]);
  expect(await journalLength(page)).toBe(1);

  const results = await new AxeBuilder({ page }).include('[data-testid="gap-menu"]').analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press("Enter");
  await expect.poll(() => journalLength(page)).toBe(2);
  expect(await commandsFrom(page, 1)).toEqual([
    { type: "remove", targets: [`${block}/b`], gap: { side: "right", verb: "shift" } },
  ]);
  await expect(menu).toHaveCount(0);
  await expect(page.locator("[data-moved]")).toHaveCount(0);
  expect(await selection(page)).toEqual([]);
  expect(await form(page, block)).toBe(
    JSON.stringify({
      length: [20, 1],
      segments: [
        ["a", [0, 1]],
        ["c", [8, 1]],
      ],
    }),
  );
});
