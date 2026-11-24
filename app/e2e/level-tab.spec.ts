/**
 * The inspector's level tab: always first, named by the level, kept shown
 * or not as the viewer chose while editors open and close in view, shown
 * when the drawer opens after an editor was entered out of view, and its
 * panel's title line set in the bundled title face; the Arranger and
 * Bundle tabs hold the arrangement the canvas's Arrange menu shows, and
 * the Bundle tab the switches the Manifest tab's text follows. The expected values
 * are derived in `README.md` ("level-tab.spec.ts"); the screenshots are for
 * review and compared with nothing.
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Address } from "../packages/core/src/index.ts";
import { idAddress } from "../packages/core/src/index.ts";
import { manifestFixture } from "./schema.ts";
import type { TabName } from "./support.ts";
import {
  BUNDLES,
  done,
  drawer,
  editing,
  element,
  importFixture,
  node,
  open,
  panel,
  select,
  tab,
  tabs,
  titleLine,
} from "./support.ts";

test.use({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: "reduce",
  deviceScaleFactor: 2,
});

const MIXED = BUNDLES.mixed;
/** The bundle, a group in it and a member of that group, each with its level's word and its name. */
const PATH = [
  { target: { block: MIXED }, word: "Bundle", name: "Mixed" },
  { target: { block: MIXED, id: "group_1" }, word: "Group", name: "Performance" },
  { target: { block: MIXED, id: "score" }, word: "Timeline", name: "Score" },
] as const;
const FACE = "TiLiE Plex Mono";

/** Open the editor of `target` through the hook and wait until it is the innermost. */
async function enter(page: Page, target: Address): Promise<void> {
  expect(await page.evaluate((address) => window.__tilie.open(address), target)).toBeNull();
  await expect.poll(async () => (await editing(page)).at(-1)?.target).toEqual(target);
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
  await select(page, [{ block: MIXED }]);
});

test("entering and leaving editors in view keeps the chosen tab, the level tab renamed", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(tabs(page).getByRole("tab")).toHaveText([
    "Arranger",
    "Properties",
    "Metadata",
    "Manifest",
    "Journal",
    "Timestamp",
    "Matchstamp",
    "Elisions",
  ]);
  await expect(tab(page, "Properties")).toHaveAttribute("aria-selected", "true");
  for (const { target, word } of PATH) {
    await enter(page, target);
    await expect(tabs(page).getByRole("tab")).toHaveText([
      word,
      "Properties",
      "Metadata",
      "Manifest",
      "Journal",
      "Timestamp",
      "Matchstamp",
      "Elisions",
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

/** Whether each button of `menu`'s arrangement toolbar is pressed, in order. */
function pressed(menu: Locator): Promise<(string | null)[]> {
  return menu
    .getByRole("toolbar")
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-pressed")));
}

/** The pressed state of `count` buttons with the `at`th pressed. */
const only = (at: number, count: number) =>
  Array.from({ length: count }, (_, index) => String(index === at));

/** The canvas's Arrange menu, opened from the canvas controls. */
async function canvasMenu(page: Page): Promise<Locator> {
  const toggle = page.getByTestId("arrange");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  return page.getByTestId("arrange-menu");
}

/** How many distinct left edges and tops the four blocks' nodes have. */
async function nodeSpread(page: Page): Promise<number[]> {
  const boxes = await Promise.all(Object.values(BUNDLES).map((id) => node(page, id).boundingBox()));
  return [new Set(boxes.map((box) => box?.x)).size, new Set(boxes.map((box) => box?.y)).size];
}

/** How many distinct `x` and `y` the frames of `groups` are drawn at in block `block`. */
async function frameSpread(
  page: Page,
  block: string,
  groups: readonly string[],
): Promise<number[]> {
  const places = await Promise.all(
    groups.map((group) =>
      element(page, block, idAddress(group))
        .last()
        .evaluate((drawn) => [drawn.getAttribute("x"), drawn.getAttribute("y")]),
    ),
  );
  return [new Set(places.map(([x]) => x)).size, new Set(places.map(([, y]) => y)).size];
}

/** The groups of the LayerIt bundle, each drawn as a frame. */
const LAYERIT_GROUPS = ["group_1", "group_2", "group_3", "group_4"] as const;

/** The block's arrangement direction as the store holds it. */
function direction(page: Page, block: string): Promise<string | undefined> {
  return page.evaluate(
    (id) => window.__tilie.store().view.blocks[id]?.arrangement?.direction,
    block,
  );
}

/** How many entries the open editor's session (else the journal) holds. */
function entries(page: Page): Promise<number> {
  return page.evaluate(() => window.__tilie.store().entries.length);
}

function undo(page: Page): Promise<void> {
  return page.evaluate(() => window.__tilie.store().undo());
}

test.describe("the level tab's settings", () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  test("the Arranger tab and the canvas's Arrange menu show and set one arrangement", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Open inspector" }).click();
    await tab(page, "Arranger").click();
    const settings = (await panel(page, "Arranger")).getByTestId("level-arrangement");
    const menu = await canvasMenu(page);
    await expect(settings.getByRole("toolbar").getByRole("button")).toHaveText([
      "Free",
      "Vertical",
      "Horizontal",
      "Matrix",
    ]);
    expect([await pressed(settings), await pressed(menu)]).toEqual([only(0, 4), only(0, 4)]);
    expect(await nodeSpread(page)).toEqual([4, 4]);

    // Chosen in the tab: one journal entry, shown by the canvas's menu, the blocks one under another.
    const before = await entries(page);
    await settings.getByTestId("arrange-vertical").click();
    await expect.poll(() => entries(page)).toBe(before + 1);
    expect(await page.evaluate(() => window.__tilie.store().view.arrangement)).toEqual({
      direction: "vertical",
    });
    await expect.poll(() => pressed(menu)).toEqual(only(1, 4));
    await expect.poll(() => nodeSpread(page)).toEqual([1, 4]);

    // Chosen in the canvas's menu: shown by the tab, the blocks side by side.
    await menu.getByTestId("arrange-horizontal").click();
    await expect.poll(() => pressed(settings)).toEqual(only(2, 4));
    await expect.poll(() => nodeSpread(page)).toEqual([4, 1]);

    // Undone: both show Vertical again, the blocks one under another.
    await undo(page);
    await expect.poll(() => pressed(settings)).toEqual(only(1, 4));
    await expect.poll(() => pressed(menu)).toEqual(only(1, 4));
    await expect.poll(() => nodeSpread(page)).toEqual([1, 4]);
  });

  test("the Bundle tab and the canvas's Arrange menu show and set one arrangement of the items", async ({
    page,
  }) => {
    const block = await importFixture(page, "bundles/bundle_elided_layerit");
    // The first editor opens the closed drawer on the level tab.
    await enter(page, { block });
    await expect(tab(page, "Bundle")).toHaveAttribute("aria-selected", "true");
    const settings = (await panel(page, "Bundle")).getByTestId("level-arrangement");
    const menu = await canvasMenu(page);
    await expect(settings.getByRole("toolbar").getByRole("button")).toHaveText([
      "Free",
      "Vertical",
      "Horizontal",
    ]);
    expect([await pressed(settings), await pressed(menu)]).toEqual([only(0, 3), only(0, 3)]);
    expect(await frameSpread(page, block, LAYERIT_GROUPS)).toEqual([1, 4]);

    // Chosen in the tab: one entry of the editor's session, shown by the menu, the frames side by side.
    const before = await entries(page);
    await settings.getByTestId("arrange-horizontal").click();
    await expect.poll(() => entries(page)).toBe(before + 1);
    expect(await direction(page, block)).toBe("horizontal");
    await expect.poll(() => pressed(menu)).toEqual(only(2, 3));
    await expect.poll(() => frameSpread(page, block, LAYERIT_GROUPS)).toEqual([4, 1]);

    // Chosen in the canvas's menu: shown by the tab, the frames one under another.
    await menu.getByTestId("arrange-vertical").click();
    await expect.poll(() => pressed(settings)).toEqual(only(1, 3));
    expect(await direction(page, block)).toBe("vertical");
    await expect.poll(() => frameSpread(page, block, LAYERIT_GROUPS)).toEqual([1, 4]);

    // Undone: both show Horizontal again, the frames side by side.
    await undo(page);
    await expect.poll(() => pressed(settings)).toEqual(only(2, 3));
    await expect.poll(() => pressed(menu)).toEqual(only(2, 3));
    await expect.poll(() => frameSpread(page, block, LAYERIT_GROUPS)).toEqual([4, 1]);
  });

  test("a switch of the Bundle tab is seen in the Manifest tab and its text, and back", async ({
    page,
  }) => {
    const COMPLETE = manifestFixture("bundles/bundle_mixed");
    const MINIMAL = manifestFixture("bundles/bundle_mixed.minimal");
    const minimal = page.getByRole("checkbox", { name: "Minimal", exact: true });
    const text = page.getByRole("textbox", { name: "Manifest (YAML)" });
    await page.getByRole("button", { name: "Open inspector" }).click();
    await enter(page, PATH[0].target);
    await tab(page, "Manifest").click();
    await expect(minimal).toBeChecked();
    await expect(text).toHaveValue(MINIMAL);

    // Unticked in the Bundle tab: unticked in the Manifest tab, its text the complete form.
    await tab(page, "Bundle").click();
    await minimal.uncheck();
    await tab(page, "Manifest").click();
    await expect(minimal).not.toBeChecked();
    await expect(text).toHaveValue(COMPLETE);

    // Ticked in the Manifest tab: the minimal form, ticked in the Bundle tab.
    await minimal.check();
    await expect(text).toHaveValue(MINIMAL);
    await tab(page, "Bundle").click();
    await expect(minimal).toBeChecked();

    // Settings lie outside the journal: an undo leaves the switch as it is.
    const before = await entries(page);
    await minimal.uncheck();
    expect(await entries(page)).toBe(before);
    await undo(page);
    await expect(minimal).not.toBeChecked();
  });

  test("the canvas lock disables the level tab's arrangement as it does the canvas's menu", async ({
    page,
  }) => {
    const lock = page.getByTestId("lock");
    /** Whether each button of `menu`'s arrangement toolbar is disabled, in order. */
    const disabled = (menu: Locator) =>
      menu
        .getByRole("toolbar")
        .getByRole("button")
        .evaluateAll((buttons) => buttons.map((button) => (button as HTMLButtonElement).disabled));
    await page.getByRole("button", { name: "Open inspector" }).click();
    await tab(page, "Arranger").click();
    const settings = (await panel(page, "Arranger")).getByTestId("level-arrangement");
    const menu = await canvasMenu(page);

    // Locked: every button of both controls disabled; a forced click stores nothing.
    await lock.click();
    await expect(lock).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => disabled(settings)).toEqual([true, true, true, true]);
    await expect.poll(() => disabled(menu)).toEqual([true, true, true, true]);
    const before = await entries(page);
    await settings.getByTestId("arrange-vertical").click({ force: true });
    expect(await entries(page)).toBe(before);
    expect(await page.evaluate(() => window.__tilie.store().view.arrangement)).toBeUndefined();

    // Unlocked: both enabled, and a choice in the tab is stored.
    await lock.click();
    await expect(lock).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => disabled(settings)).toEqual([false, false, false, false]);
    await expect.poll(() => disabled(menu)).toEqual([false, false, false, false]);
    await settings.getByTestId("arrange-vertical").click();
    await expect.poll(() => entries(page)).toBe(before + 1);

    // In the bundle editor: the Bundle tab's three buttons follow the lock as the menu's do.
    await enter(page, PATH[0].target);
    await expect(tab(page, "Bundle")).toHaveAttribute("aria-selected", "true");
    const bundle = (await panel(page, "Bundle")).getByTestId("level-arrangement");
    const items = await canvasMenu(page);
    await lock.click();
    await expect.poll(() => disabled(bundle)).toEqual([true, true, true]);
    await expect.poll(() => disabled(items)).toEqual([true, true, true]);
    await lock.click();
    await expect.poll(() => disabled(bundle)).toEqual([false, false, false]);
    await expect.poll(() => disabled(items)).toEqual([false, false, false]);
  });
});
