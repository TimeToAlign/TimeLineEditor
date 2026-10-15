/**
 * Accessibility of the canvas page with `small` open: axe-core reports no
 * violation, and the keyboard reaches, selects and releases the blocks.
 * Derivation in `README.md` ("a11y.spec.ts").
 */

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { open, SMALL, selection } from "./support.ts";

/** The `data-id` of the focused node, or `null` when focus is elsewhere. */
function focusedNode(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.closest(".svelte-flow__node")?.getAttribute("data-id") ?? null,
  );
}

/** Press Tab until a node has the focus; the page's tab stops are finite. */
async function tabToNode(page: Page): Promise<string> {
  const stops = await page.evaluate(
    () => document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]").length,
  );
  for (let n = 0; n <= stops; n += 1) {
    await page.keyboard.press("Tab");
    const id = await focusedNode(page);
    if (id !== null) return id;
  }
  throw new Error("Tab never reaches a node");
}

test.beforeEach(async ({ page }) => {
  await open(page, "small");
});

test("axe-core reports no violation on the canvas page", async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("axe-core reports no violation with an element selected", async ({ page }) => {
  await page.evaluate((address) => window.__tilie.select([address]), `${SMALL.styled}/score/intro`);
  await expect(page.locator("[data-contains-selection]")).toHaveCount(1);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("axe-core reports no violation with the inspector drawer open", async ({ page }) => {
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(page.locator("#inspector")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("axe-core reports no violation with the File menu open", async ({ page }) => {
  await page.getByRole("button", { name: "File" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("axe-core reports no violation with the About dialog open", async ({ page }) => {
  await page.getByRole("button", { name: "About" }).click();
  await expect(page.getByRole("dialog", { name: "About TimeLineEditor" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("axe-core reports no violation with the discard question open", async ({ page }) => {
  await page.evaluate((id) => {
    window.__tilie.store().dispatch({ type: "set", changes: [{ target: id, values: { x: 8 } }] });
  }, SMALL.bare);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "New workspace" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("Tab focuses the nodes in z-order, Enter selects, Escape clears", async ({ page }) => {
  expect(await tabToNode(page)).toBe(SMALL.bare);
  await page.keyboard.press("Enter");
  expect(await selection(page)).toEqual([SMALL.bare]);
  await page.keyboard.press("Escape");
  expect(await selection(page)).toEqual([]);

  await page.keyboard.press("Tab");
  expect(await focusedNode(page)).toBe(SMALL.nested);
  await page.keyboard.press("Enter");
  expect(await selection(page)).toEqual([SMALL.nested]);
});
