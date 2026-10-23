/**
 * Group memberships through the Properties tab on `bundles`: a timeline put
 * into a second group and drawn in both frames, a group's members changed,
 * and a new group. The method is in `README.md` ("memberships.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ElementAddress } from "../packages/core/src/index.ts";
import { addressKey, cardAddress } from "../packages/core/src/index.ts";
import {
  BUNDLES,
  cardsOf,
  commandsFrom,
  journalLength,
  OPENED_JOURNAL,
  open,
  select,
  setViewport,
  tab,
} from "./support.ts";

/** The Properties tab showing the selection `elements` of the mixed bundle. */
async function inspect(page: Page, elements: ElementAddress[]): Promise<void> {
  await select(
    page,
    elements.map((element) => ({ block: BUNDLES.mixed, ...element })),
  );
  await tab(page, "Properties").click();
  await expect(tab(page, "Properties")).toHaveAttribute("aria-selected", "true");
}

/** How many cards the mixed bundle draws for timeline `id`. */
async function cardCount(page: Page, id: string): Promise<number> {
  const card = addressKey(cardAddress(id));
  return (await cardsOf(page, BUNDLES.mixed)).filter((address) => addressKey(address) === card)
    .length;
}

/** The `set` of timeline `id`'s groups. */
function groups(id: string, list: string[]) {
  return {
    type: "set",
    changes: [{ target: { block: BUNDLES.mixed, id }, values: { groups: list } }],
  };
}

test.beforeEach(async ({ page }) => {
  await open(page, "bundles");
  await setViewport(page, { x: 40, y: 40, zoom: 1 });
  await page.getByRole("button", { name: "Open inspector" }).click();
});

test("a timeline put into a second group is drawn in both frames", async ({ page }) => {
  await inspect(page, [{ id: "score", part: ["card"] }]);
  const fieldset = page.getByRole("group", { name: "Groups" });
  await expect(fieldset.getByRole("checkbox", { name: "Performance" })).toBeChecked();
  const facsimile = fieldset.getByRole("checkbox", { name: "Facsimile" });
  await expect(facsimile).not.toBeChecked();
  expect(await cardCount(page, "score")).toBe(1);
  await facsimile.click();
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles + 1);
  expect(await commandsFrom(page, OPENED_JOURNAL.bundles)).toEqual([
    groups("score", ["group_1", "group_2"]),
  ]);
  await expect(facsimile).toBeChecked();
  await expect.poll(() => cardCount(page, "score")).toBe(2);
});

test("a group's members are changed from the group, a nested timeline refused", async ({
  page,
}) => {
  await inspect(page, [{ id: "group_2" }]);
  const fieldset = page.getByRole("group", { name: "Members" });
  await expect(fieldset.getByRole("checkbox", { name: "Recording" })).toBeDisabled();
  await fieldset.getByRole("checkbox", { name: "Page" }).click();
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles + 1);
  expect(await commandsFrom(page, OPENED_JOURNAL.bundles)).toEqual([groups("page", [])]);
  await expect(fieldset.getByRole("checkbox", { name: "Page" })).not.toBeChecked();
});

test("New group adds a group of the selected timelines", async ({ page }) => {
  await inspect(page, [{ id: "annotations", part: ["card"] }]);
  await page.getByRole("button", { name: "New group" }).click();
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles + 1);
  expect(await commandsFrom(page, OPENED_JOURNAL.bundles)).toEqual([{ type: "add" }]);
  expect(
    await page.evaluate(
      (block) =>
        window.__tilie
          .store()
          .view.blocks[block]?.manifest.groups.map(({ id, members }) => ({ id, members })),
      BUNDLES.mixed,
    ),
  ).toEqual([
    { id: "group_1", members: ["performance", "score"] },
    { id: "group_2", members: ["excerpt", "page"] },
    { id: "group_3", members: ["annotations"] },
  ]);
  const fieldset = page.getByRole("group", { name: "Groups" });
  await expect(fieldset.getByRole("checkbox", { name: "group_3" })).toBeChecked();
});
