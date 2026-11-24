/**
 * The inspector's tab row wraps: at the drawer's least width the eight tabs
 * take two rows and nothing in the inspector scrolls sideways, whichever tab
 * is shown, in the arranger and in a bundle's editor; every tab is
 * reached by pointer and by the arrow keys in reading order; where the tabs
 * fit, one row. The expected values are derived in `README.md`
 * ("tab-row.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { TabName } from "./support.ts";
import { BUNDLES, drawer, editing, open, select, tab, tabs } from "./support.ts";

test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });

/** The eight tabs at the top level, in reading order. */
const TABS: readonly TabName[] = [
  "Arranger",
  "Properties",
  "Metadata",
  "Manifest",
  "Journal",
  "Timestamp",
  "Matchstamp",
  "Elisions",
];

/** The eight tabs in the bundle's editor: the level tab named Bundle. */
const BUNDLE_TABS: readonly TabName[] = ["Bundle", ...TABS.slice(1)];

/** The tab buttons' tops, left edges and widths, in DOM order. */
function tabBoxes(page: Page): Promise<{ top: number; left: number; width: number }[]> {
  return tabs(page)
    .getByRole("tab")
    .evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return { top: box.top, left: box.left, width: box.width };
      }),
    );
}

/** Whether each tab is underlined: its bottom border drawn in the text colour, not transparent. */
function underlines(page: Page): Promise<boolean[]> {
  return tabs(page)
    .getByRole("tab")
    .evaluateAll((items) =>
      items.map((item) => getComputedStyle(item).borderBottomColor === "rgb(26, 26, 26)"),
    );
}

/** The distinct tops of the tabs: one per row. */
async function rows(page: Page): Promise<number[]> {
  return [...new Set((await tabBoxes(page)).map(({ top }) => top))];
}

/**
 * Every scroll container of the inspector, as [scrollWidth, clientWidth]:
 * the drawer, the inspector's body, the tab list and the panels' scroll
 * container. Equal pairs scroll nothing sideways.
 */
function widths(page: Page): Promise<number[][]> {
  return drawer(page).evaluate((aside) =>
    [
      aside,
      aside.querySelector(".inspector-body"),
      aside.querySelector('[role="tablist"]'),
      aside.querySelector(".panels"),
    ].map((element) => {
      if (element === null) throw new Error("an inspector part is missing");
      return [element.scrollWidth, element.clientWidth];
    }),
  );
}

/** Expect nothing in the inspector to scroll sideways. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  for (const [scroll, client] of await widths(page)) expect(scroll).toBe(client);
}

/** Choose each of `names` by a click, in order, expecting nothing to scroll sideways with it shown. */
async function everyTabFits(page: Page, names: readonly TabName[]): Promise<void> {
  for (const name of names) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
    await expectNoSidewaysScroll(page);
  }
}

async function openInspector(page: Page): Promise<void> {
  await open(page, "bundles");
  await select(page, [{ block: BUNDLES.mixed }]);
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(drawer(page)).toBeVisible();
}

test.describe("at the drawer's least width", () => {
  test.use({ viewport: { width: 1000, height: 800 } });

  test("the tabs take two rows, each reached by pointer and by key", async ({ page }) => {
    await openInspector(page);
    expect(await drawer(page).evaluate((aside) => getComputedStyle(aside).width)).toBe("352px");
    await expect(tabs(page).getByRole("tab")).toHaveText([...TABS]);
    expect((await rows(page)).length).toBe(2);
    await expectNoSidewaysScroll(page);
    await everyTabFits(page, TABS);

    // One strip: the selected tab underlined in either row, the strip's border under the last row.
    expect(await underlines(page)).toEqual(TABS.map((name) => name === "Elisions"));
    const [last, strip] = await tabs(page).evaluate((list) => [
      list.querySelector('[role="tab"]:last-child')?.getBoundingClientRect().bottom,
      list.getBoundingClientRect().bottom -
        Number.parseFloat(getComputedStyle(list).borderBottomWidth),
    ]);
    expect(last).toBe(strip);
    await tab(page, "Arranger").click();
    expect(await underlines(page)).toEqual(TABS.map((name) => name === "Arranger"));
    await tab(page, "Arranger").focus();
    for (const name of [...TABS.slice(1), TABS[0] as TabName]) {
      await page.keyboard.press("ArrowRight");
      await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
      await expect(tab(page, name)).toBeFocused();
    }
    for (const name of [...TABS].reverse()) {
      await page.keyboard.press("ArrowLeft");
      await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
      await expect(tab(page, name)).toBeFocused();
    }
  });

  test("in the bundle's editor every tab fits, the Bundle tab's settings included", async ({
    page,
  }) => {
    await openInspector(page);
    const target = { block: BUNDLES.mixed };
    expect(await page.evaluate((address) => window.__tilie.open(address), target)).toBeNull();
    await expect.poll(async () => (await editing(page)).at(-1)?.target).toEqual(target);
    await expect(tabs(page).getByRole("tab")).toHaveText([...BUNDLE_TABS]);
    await everyTabFits(page, BUNDLE_TABS);
  });
});

test.describe("where the tabs fit", () => {
  test.use({ viewport: { width: 2400, height: 900 } });

  test("the tabs take one row", async ({ page }) => {
    await openInspector(page);
    expect(await drawer(page).evaluate((aside) => getComputedStyle(aside).width)).toBe("640px");
    expect((await rows(page)).length).toBe(1);
    await expectNoSidewaysScroll(page);
  });
});
