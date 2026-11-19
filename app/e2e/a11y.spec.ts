/**
 * Accessibility of the canvas page with `small` open: axe-core reports no
 * violation, with the inspector on its Properties, Manifest and Metadata
 * tabs (the LayerIt recording imported, a composer listbox open) and the
 * "Your name" dialog open too, in the "Type profiles" dialog, and the
 * keyboard reaches, selects and releases the blocks.
 * Derivation in `README.md` ("a11y.spec.ts").
 */

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { statementsFixture } from "./schema.ts";
import {
  chooseItem,
  drawer,
  field,
  open,
  pick,
  SMALL,
  select,
  selection,
  withoutPickers,
} from "./support.ts";

/** The hosts the Metadata tab looks values up at; this spec answers none of them. */
const LOOKUP_HOSTS =
  /^https:\/\/(www\.wikidata\.org|lobid\.org|www\.youtube\.com|commons\.wikimedia\.org)\//u;

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
  await select(page, [{ block: SMALL.styled, id: "intro" }]);
  await expect(page.locator(".tilie-block[data-contains-selection]")).toHaveCount(1);
  await expect(page.locator('.tilie-mark[data-mark="holding"][data-box="card"]')).toHaveCount(1);
  await expect(page.locator('.tilie-mark[data-mark="holding"][data-box="frame"]')).toHaveCount(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("axe-core reports no violation with the inspector drawer open", async ({ page }) => {
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(drawer(page)).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("axe-core reports no violation on either tab of the inspector", async ({ page }) => {
  await select(page, [{ block: SMALL.styled, id: "score" }]);
  await page.getByRole("button", { name: "Open inspector" }).click();
  const properties = page.getByRole("tab", { name: "Properties", exact: true });
  await expect(properties).toHaveAttribute("aria-selected", "true");
  await expect(field(page, "x")).toBeVisible();
  const onProperties = await new AxeBuilder({ page }).analyze();
  expect(onProperties.violations).toEqual([]);

  const manifest = page.getByRole("tab", { name: "Manifest", exact: true });
  await manifest.click();
  await expect(manifest).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel(/^Manifest \(/)).toBeVisible();
  const onManifest = await new AxeBuilder({ page }).analyze();
  expect(onManifest.violations).toEqual([]);
});

test("axe-core reports no violation on the Metadata tab with a listbox open and in the Your name dialog", async ({
  page,
}) => {
  await withoutPickers(page);
  await page.route(LOOKUP_HOSTS, (route) => route.abort());
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  await pick(
    page,
    "Import manifest…",
    "layerit_recording.yaml",
    statementsFixture("layerit_recording"),
  );
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__tilie.store().view.blocks).length))
    .toBe(1);
  const block = await page.evaluate(() => Object.keys(window.__tilie.store().view.blocks)[0] ?? "");
  await select(page, [{ block, id: "cpt_1" }]);
  await page.getByRole("button", { name: "Open inspector" }).click();
  const metadata = page.getByRole("tab", { name: "Metadata", exact: true });
  await metadata.click();
  await expect(metadata).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("metadata-rectangle")).toHaveCount(3);
  await page.getByRole("button", { name: "＋ Add statement" }).click();
  const composer = page.getByTestId("metadata-composer");
  await composer.getByRole("combobox", { name: "Verb", exact: true }).fill("derived from");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await composer.getByRole("combobox", { name: "Vocabulary", exact: true }).fill("element");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const value = composer.getByRole("combobox", { name: "Value", exact: true });
  await expect(value).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox", { name: "Value" })).toBeVisible();
  const onMetadata = await new AxeBuilder({ page }).analyze();
  expect(onMetadata.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await page.getByTestId("metadata-user").getByRole("button", { name: "Change…" }).click();
  await expect(page.getByRole("dialog", { name: "Your name" })).toBeVisible();
  const inDialog = await new AxeBuilder({ page }).analyze();
  expect(inDialog.violations).toEqual([]);
});

test("axe-core reports no violation with the File menu open", async ({ page }) => {
  await page.getByRole("button", { name: "File" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("axe-core reports no violation in the Type profiles dialog with a profile and a service", async ({
  page,
}) => {
  await chooseItem(page, "Type profiles…");
  const dialog = page.getByRole("dialog", { name: "Type profiles" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Add profile" }).click();
  await dialog.getByRole("button", { name: "Add service" }).click();
  await expect(dialog.getByTestId("profile-editor")).toBeVisible();
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
    window.__tilie
      .store()
      .dispatch({ type: "set", changes: [{ target: { block: id }, values: { x: 8 } }] });
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
  expect(await selection(page)).toEqual([{ block: SMALL.bare }]);
  await page.keyboard.press("Escape");
  expect(await selection(page)).toEqual([]);

  await page.keyboard.press("Tab");
  expect(await focusedNode(page)).toBe(SMALL.nested);
  await page.keyboard.press("Enter");
  expect(await selection(page)).toEqual([{ block: SMALL.nested }]);
});
