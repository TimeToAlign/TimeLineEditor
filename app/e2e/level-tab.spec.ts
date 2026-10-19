/**
 * The inspector's level tab: always first, named by the level, kept shown
 * or not as the viewer chose while editors open and close in view, shown
 * when the drawer opens after an editor was entered out of view, and its
 * panel's title line set in the bundled title face. The expected values
 * are derived in `README.md` ("level-tab.spec.ts"); the screenshots are for
 * review and compared with nothing.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { TabName } from "./support.ts";
import { BUNDLES, done, drawer, editing, open, panel, select, tab, tabs } from "./support.ts";

test.use({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: "reduce",
  deviceScaleFactor: 2,
});

const MIXED = BUNDLES.mixed;
/** The bundle, a group in it and a member of that group, each with its level's word and its name. */
const PATH = [
  { target: MIXED, word: "Bundle", name: "Mixed" },
  { target: `${MIXED}/group_1`, word: "Group", name: "Performance" },
  { target: `${MIXED}/score`, word: "Timeline", name: "Score" },
] as const;
const FACE = "TiLiE Plex Mono";

/** Open the editor of `target` through the hook and wait until it is the innermost. */
async function enter(page: Page, target: string): Promise<void> {
  expect(await page.evaluate((address) => window.__tilie.open(address), target)).toBeNull();
  await expect.poll(async () => (await editing(page)).at(-1)?.target).toBe(target);
}

/** The level panel's title line. */
async function titleLine(page: Page, word: TabName) {
  return (await panel(page, word)).getByTestId("level-title");
}

/** The drawer from its top down to the bottom of the shown panel, written to `name` for review. */
async function shoot(page: Page, word: TabName, name: string) {
  const outer = await drawer(page).boundingBox();
  const inner = await (await panel(page, word)).boundingBox();
  if (outer === null || inner === null) throw new Error("the drawer is not shown");
  await page.screenshot({
    path: test.info().outputPath(name),
    clip: {
      x: outer.x,
      y: outer.y,
      width: outer.width,
      height: inner.y + inner.height + 16 - outer.y,
    },
  });
}

test.beforeEach(async ({ page }) => {
  await open(page, "bundles");
  await select(page, [MIXED]);
});

test("entering and leaving editors in view keeps the chosen tab, the level tab renamed", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(tabs(page).getByRole("tab")).toHaveText([
    "Arranger",
    "Properties",
    "Manifest",
    "Journal",
  ]);
  await expect(tab(page, "Properties")).toHaveAttribute("aria-selected", "true");
  for (const { target, word } of PATH) {
    await enter(page, target);
    await expect(tabs(page).getByRole("tab")).toHaveText([
      word,
      "Properties",
      "Manifest",
      "Journal",
    ]);
    await expect(tab(page, "Properties")).toHaveAttribute("aria-selected", "true");
  }
  for (const word of ["Group", "Bundle", "Arranger"] as const) {
    await done(page);
    await expect(tabs(page).getByRole("tab").first()).toHaveText(word);
    await expect(tab(page, "Properties")).toHaveAttribute("aria-selected", "true");
  }
});

test("an editor entered out of view shows the level tab, its title line in the title face", async ({
  page,
}) => {
  const openButton = page.getByRole("button", { name: "Open inspector" });
  const closeButton = page.getByRole("button", { name: "Close inspector" });

  await openButton.click();
  await tab(page, "Arranger").click();
  await expect(await titleLine(page, "Arranger")).toHaveText("Arranger untitled");
  await shoot(page, "Arranger", "level-arranger.png");
  await tab(page, "Journal").click();
  await closeButton.click();
  await expect(drawer(page)).toBeHidden();

  // The first editor opens the closed drawer, on the level tab.
  await enter(page, PATH[0].target);
  await expect(drawer(page)).toBeVisible();
  await expect(tab(page, "Bundle")).toHaveAttribute("aria-selected", "true");
  await expect(await titleLine(page, "Bundle")).toHaveText("Bundle Mixed");
  await shoot(page, "Bundle", "level-bundle.png");

  // An inner editor leaves the drawer closed; the viewer opening it finds the level tab.
  for (const { target, word, name } of PATH.slice(1)) {
    await tab(page, "Journal").click();
    await closeButton.click();
    await enter(page, target);
    await expect(drawer(page)).toBeHidden();
    await openButton.click();
    await expect(tab(page, word)).toHaveAttribute("aria-selected", "true");
    const line = await titleLine(page, word);
    await expect(line).toHaveText(`${word} ${name}`);
    await expect(line.locator(".word")).toHaveText(word);
    await expect(line.locator(".name")).toHaveText(name);
    await shoot(page, word, `level-${word.toLowerCase()}.png`);
  }

  const line = await titleLine(page, "Timeline");
  expect(
    await line.evaluate((element) =>
      getComputedStyle(element).fontFamily.split(",")[0]?.trim().replaceAll('"', ""),
    ),
  ).toBe(FACE);
  await expect
    .poll(() =>
      page.evaluate(async (family) => {
        await document.fonts.ready;
        return [...document.fonts]
          .filter((face) => face.family.replaceAll('"', "") === family)
          .map((face) => face.status);
      }, FACE),
    )
    .toEqual(["loaded"]);
});
