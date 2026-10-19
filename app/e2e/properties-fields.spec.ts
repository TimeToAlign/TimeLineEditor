/**
 * The Properties tab's fields on `bundles`: a container size committed
 * below its minimum, the size row with the Locked checkbox, and the Name
 * field. The method is in `README.md` ("properties-fields.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  BUNDLES,
  commandsFrom,
  journalLength,
  node,
  OPENED_JOURNAL,
  open,
  select,
  setViewport,
  tab,
} from "./support.ts";

/** The Properties tab showing the selection `elements` of the mixed bundle. */
async function inspect(page: Page, elements: string[]): Promise<void> {
  await select(
    page,
    elements.map((element) => `${BUNDLES.mixed}/${element}`),
  );
  await tab(page, "Properties").click();
  await expect(tab(page, "Properties")).toHaveAttribute("aria-selected", "true");
}

test.beforeEach(async ({ page }) => {
  await open(page, "bundles");
  await setViewport(page, { x: 40, y: 40, zoom: 1 });
  await page.getByRole("button", { name: "Open inspector" }).click();
});

test("a frame height at or below its minimum states none, and the status line says why", async ({
  page,
}) => {
  await inspect(page, ["group_1"]);
  const frame = page.getByRole("form", { name: "Frame properties" });
  const height = frame.getByLabel("container height", { exact: true });
  const drawn = await height.inputValue();
  expect(drawn).not.toBe("");
  const before = await node(page, BUNDLES.mixed).boundingBox();
  const stated = String(Number((Number(drawn) + 10).toFixed(2)));
  await height.fill(stated);
  await height.press("Enter");
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles + 1);
  await expect(height).toHaveValue(stated);
  await height.fill("1");
  await height.press("Enter");
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles + 2);
  const [, command] = await commandsFrom(page, OPENED_JOURNAL.bundles);
  const changes = command?.type === "set" ? command.changes : [];
  const place = changes.find((change) => change.target === `${BUNDLES.mixed}/group_1`)?.values
    .place;
  expect(place).toEqual({ height: null });
  await expect(height).toHaveValue(drawn);
  await expect(page.getByRole("status").filter({ hasText: "To decrease" })).toHaveText(
    `To decrease the height below ${drawn} px, decrease the size of the contained elements first.`,
  );
  await expect.poll(() => node(page, BUNDLES.mixed).boundingBox()).toEqual(before);
});

test("the container size stands in one row, the Locked checkbox right of the height", async ({
  page,
}) => {
  await inspect(page, ["excerpt/card"]);
  const card = page.getByRole("form", { name: "Card properties" });
  const width = card.getByLabel("container width", { exact: true });
  const height = card.getByLabel("container height", { exact: true });
  const locked = card.getByRole("checkbox", { name: "Locked" });
  await expect(locked).toBeDisabled();
  await expect(locked).toBeChecked();
  const [w, h, l] = await Promise.all([
    width.boundingBox(),
    height.boundingBox(),
    locked.boundingBox(),
  ]);
  if (w === null || h === null || l === null) throw new Error("a cell is not displayed");
  expect(h.x).toBeGreaterThan(w.x + w.width - 1);
  expect(l.x).toBeGreaterThan(h.x + h.width - 1);
  expect(w.y).toBe(h.y);
  await inspect(page, ["score/card"]);
  await expect(page.getByRole("checkbox", { name: "Locked" })).not.toBeChecked();
});

test("the Name field comes first and renames the group in one command", async ({ page }) => {
  await inspect(page, ["group_1"]);
  const name = page.getByLabel("Name", { exact: true });
  await expect(name).toHaveValue("Performance");
  await name.fill("Duo");
  await name.press("Enter");
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles + 1);
  expect(await commandsFrom(page, OPENED_JOURNAL.bundles)).toEqual([
    { type: "set", changes: [{ target: `${BUNDLES.mixed}/group_1`, values: { name: "Duo" } }] },
  ]);
  await expect(name).toHaveValue("Duo");
});

test("in an editor with nothing selected, the Name field names the edited group", async ({
  page,
}) => {
  const group = `${BUNDLES.mixed}/group_1`;
  expect(await page.evaluate((address) => window.__tilie.open(address), group)).toBeNull();
  await select(page, []);
  await tab(page, "Properties").click();
  const name = page.getByLabel("Name", { exact: true });
  await expect(name).toHaveValue("Performance");
  await name.fill("Duo");
  await name.press("Enter");
  await expect(name).toHaveValue("Duo");
  expect(
    await page.evaluate(
      (block) =>
        window.__tilie
          .store()
          .view.blocks[block]?.manifest.groups.find((item) => item.id === "group_1")?.name,
      BUNDLES.mixed,
    ),
  ).toBe("Duo");
});
