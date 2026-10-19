/**
 * The inspector drawer on `small`: its tabs and their keys, with and
 * without an editor open; the manifest as text, applied as one command, refused with
 * its path, and Apply and Revert enabled exactly while the text is edited,
 * in the complete and the minimal form with the styling excluded or
 * included; the properties form of a block, a frame and a card, following a
 * frame's Stretch live in the bundle editor; and what the selection names
 * beside the heading (a bundle, a group, a timeline, a card), on `bundles`
 * and for a pressed card. The method is in `README.md` ("inspector.spec.ts").
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Manifest } from "../packages/core/src/index.ts";
import { isLoadError, loadManifest } from "../packages/core/src/index.ts";
import { dumps, manifestFixture, parseJson } from "./schema.ts";
import {
  BUNDLES,
  cardPoint,
  commandsFrom,
  dragStart,
  drawer,
  element,
  field,
  fixtureText,
  journalLength,
  marginPoint,
  node,
  nodeDragStart,
  OPENED_JOURNAL,
  open,
  panel,
  placement,
  SMALL,
  select,
  selection,
  setViewport,
  subject,
  type TabName,
  tab,
  tabs,
  viewportOf,
} from "./support.ts";

function manifestText(page: Page) {
  return page.getByLabel(/^Manifest \(/);
}

/** Press the Manifest tab and wait until it shows the text. */
async function showManifest(page: Page): Promise<void> {
  await tab(page, "Manifest").click();
  await expect(tab(page, "Manifest")).toHaveAttribute("aria-selected", "true");
  await expect(manifestText(page)).toBeVisible();
}

/** Apply and Revert are both enabled, or both disabled. */
async function expectButtons(page: Page, enabled: boolean): Promise<void> {
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeEnabled({ enabled });
  await expect(page.getByRole("button", { name: "Revert", exact: true })).toBeEnabled({ enabled });
}

/** Block `id`'s stored manifest as JSON text. */
function storedManifest(page: Page, id: string): Promise<string> {
  return page.evaluate(
    (block) => JSON.stringify(window.__tilie.store().view.blocks[block]?.manifest),
    id,
  );
}

/** The stored name of the root timeline of block `id`. */
function storedName(page: Page, id: string): Promise<unknown> {
  return page.evaluate(
    (block) =>
      (window.__tilie.store().view.blocks[block]?.manifest as Manifest | undefined)?.timelines[0]
        ?.name,
    id,
  );
}

test.use({ viewport: { width: 1600, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await open(page, "small");
  await setViewport(page, { x: 40, y: 40, zoom: 1 });
  await select(page, [SMALL.bare]);
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(tab(page, "Properties")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Manifest")).toHaveAttribute("aria-selected", "false");
  await expect(tab(page, "Journal")).toHaveAttribute("aria-selected", "false");
  await expect(manifestText(page)).toBeHidden();
});

test("a YAML edit reaches the canvas as one command and Undo restores it", async ({ page }) => {
  await showManifest(page);
  await page.getByLabel("YAML").check();
  await expect(manifestText(page)).toHaveValue(/\n {4}name: Bare\n/);
  const text = await manifestText(page).inputValue();
  await manifestText(page).fill(text.replace("\n    name: Bare\n", "\n    name: Renamed\n"));
  await page.getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => journalLength(page)).toBe(6);
  expect(await commandsFrom(page, 5)).toEqual([
    { type: "set", changes: [{ target: SMALL.bare, values: { manifest: expect.anything() } }] },
  ]);
  await expect(element(page, SMALL.bare, "bare/name")).toHaveText("Renamed");
  expect(await storedName(page, SMALL.bare)).toBe("Renamed");

  await page.evaluate(() => window.__tilie.store().undo());
  await expect(element(page, SMALL.bare, "bare/name")).toHaveText("Bare");
  await expect(manifestText(page)).toHaveValue(/\n {4}name: Bare\n/);
});

test("a refused edit shows its exact path and keeps the text", async ({ page }) => {
  await showManifest(page);
  await page.getByLabel("YAML").check();
  await expect(manifestText(page)).toHaveValue(/\n {4}locked: false\n/);
  const edited = (await manifestText(page).inputValue()).replace(
    "\n    locked: false\n",
    "\n    locked: yes\n",
  );
  await manifestText(page).fill(edited);
  await page.getByRole("button", { name: "Apply" }).click();
  const problems = page.getByRole("list", { name: "Problems" }).getByRole("listitem");
  await expect(problems).toHaveCount(1);
  await expect(problems).toHaveText(
    /^\s*schema_violation\s+must be boolean\s+at\s+\/timelines\/0\/locked\s*$/,
  );
  await expect(manifestText(page)).toHaveValue(edited);
  await expectButtons(page, true);
  expect(await journalLength(page)).toBe(5);
});

test("the properties form moves the block by the exact amount", async ({ page }) => {
  const before = await node(page, SMALL.bare).boundingBox();
  const x = page.getByLabel("x", { exact: true });
  await expect(x).toHaveValue("0");
  await x.fill("37.5");
  await x.press("Enter");
  await expect.poll(() => journalLength(page)).toBe(6);
  expect(await commandsFrom(page, 5)).toEqual([
    { type: "set", changes: [{ target: SMALL.bare, values: { x: 37.5 } }] },
  ]);
  expect((await placement(page, SMALL.bare)).x).toBe(37.5);
  await expect
    .poll(async () => {
      const after = await node(page, SMALL.bare).boundingBox();
      return after === null || before === null ? null : [after.x - before.x, after.y - before.y];
    })
    .toEqual([37.5, 0]);
});

/** Of the tabs `present`, exactly `name` is selected and focused, and only its panel is shown. */
async function expectTab(page: Page, name: TabName, present: readonly TabName[]): Promise<void> {
  for (const each of present) {
    const chosen = each === name;
    const shown = await panel(page, each);
    await expect(tab(page, each)).toHaveAttribute("aria-selected", String(chosen));
    await expect(tab(page, each)).toHaveAttribute("tabindex", chosen ? "0" : "-1");
    if (chosen) {
      await expect(tab(page, each)).toBeFocused();
      await expect(shown).toBeVisible();
    } else {
      await expect(shown).toBeHidden();
    }
  }
}

/**
 * The tab list holds exactly the tabs `present`, in order, each paired with
 * one panel of its own: the tab controls a tab panel labelled by that tab,
 * and no two tabs share a panel.
 */
async function expectTabPairs(page: Page, present: readonly TabName[]): Promise<void> {
  await expect(tabs(page).getByRole("tab")).toHaveText([...present]);
  const panels = new Set<string>();
  for (const name of present) {
    const id = await tab(page, name).getAttribute("id");
    const controlled = await panel(page, name);
    await expect(controlled).toHaveCount(1);
    await expect(controlled).toHaveAttribute("role", "tabpanel");
    await expect(controlled).toHaveAttribute("aria-labelledby", id ?? "");
    panels.add((await controlled.getAttribute("id")) ?? "");
  }
  expect(panels.size).toBe(present.length);
}

test("the tabs follow the keyboard", async ({ page }) => {
  const arranging = ["Properties", "Manifest", "Journal"] as const;
  await expectTabPairs(page, arranging);
  await tab(page, "Properties").focus();
  for (const [key, name] of [
    ["ArrowRight", "Manifest"],
    ["ArrowRight", "Journal"],
    ["ArrowRight", "Properties"],
    ["ArrowLeft", "Journal"],
    ["ArrowLeft", "Manifest"],
    ["End", "Journal"],
    ["Home", "Properties"],
  ] as const) {
    await page.keyboard.press(key);
    await expectTab(page, name, arranging);
  }

  expect(await page.evaluate((id) => window.__tilie.open(id), SMALL.bare)).toBeNull();
  const editing = ["Editor", "Properties", "Manifest", "Journal"] as const;
  await expectTabPairs(page, editing);
  await expect(tab(page, "Editor")).toHaveAttribute("aria-selected", "true");
  await tab(page, "Editor").focus();
  for (const [key, name] of [
    ["ArrowLeft", "Journal"],
    ["ArrowRight", "Editor"],
    ["ArrowRight", "Properties"],
    ["End", "Journal"],
    ["Home", "Editor"],
  ] as const) {
    await page.keyboard.press(key);
    await expectTab(page, name, editing);
  }
  expect(await journalLength(page)).toBe(5);
});

test("the form follows a drag live, then shows the stored values", async ({ page }) => {
  await nodeDragStart(page, await cardPoint(page, SMALL.bare), 101, 37);
  await expect(field(page, "x")).toHaveValue("104");
  await expect(field(page, "y")).toHaveValue("40");
  expect(await journalLength(page)).toBe(5);
  const held = await placement(page, SMALL.bare);
  expect([held.x, held.y]).toEqual([0, 0]);
  await page.mouse.up();
  await expect.poll(() => journalLength(page)).toBe(6);
  expect(await commandsFrom(page, 5)).toEqual([
    { type: "set", changes: [{ target: SMALL.bare, values: { x: 104, y: 40 } }] },
  ]);
  await expect(field(page, "x")).toHaveValue("104");
  await expect(field(page, "y")).toHaveValue("40");
});

test("the form follows a resize live, rounded to two decimals", async ({ page }) => {
  await page.locator('[data-testid="mode-box"]').click();
  const grip = await page.locator('[data-testid="handle-right"]').boundingBox();
  if (grip === null) throw new Error("the right handle is not displayed");
  await dragStart(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 20, 0);
  await expect(field(page, "width")).toHaveValue("496.58");
  expect(await journalLength(page)).toBe(5);
  expect((await placement(page, SMALL.bare)).width).toBe(null);
  await page.mouse.up();
  await expect.poll(() => journalLength(page)).toBe(6);
  expect((await placement(page, SMALL.bare)).width).toBe(496.5771484375);
  await expect(field(page, "width")).toHaveValue("496.58");
});

test("a step applies at once as one command, from the stored value", async ({ page }) => {
  const refused = await page.evaluate(
    (id) =>
      window.__tilie
        .store()
        .dispatch({ type: "set", changes: [{ target: id, values: { x: 10.123 } }] }),
    SMALL.bare,
  );
  expect(refused).toBe(null);
  const x = field(page, "x");
  await expect(x).toHaveValue("10.12");
  await x.focus();
  await x.press("ArrowUp");
  await expect.poll(() => journalLength(page)).toBe(7);
  expect(await commandsFrom(page, 6)).toEqual([
    { type: "set", changes: [{ target: SMALL.bare, values: { x: 11.123 } }] },
  ]);
  await expect(x).toHaveValue("11.12");
  await x.press("ArrowDown");
  await expect.poll(() => journalLength(page)).toBe(8);
  expect(await commandsFrom(page, 7)).toEqual([
    { type: "set", changes: [{ target: SMALL.bare, values: { x: 10.123 } }] },
  ]);
  await expect(x).toHaveValue("10.12");

  // The upper spin button: 8 px from the right edge (past border and padding), upper half.
  const box = await x.boundingBox();
  if (box === null) throw new Error("the field is not displayed");
  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 4);
  await expect.poll(() => journalLength(page)).toBe(9);
  expect(await commandsFrom(page, 8)).toEqual([
    { type: "set", changes: [{ target: SMALL.bare, values: { x: 11.123 } }] },
  ]);
  await expect(x).toHaveValue("11.12");
  await page.evaluate(() => window.__tilie.store().undo());
  expect(await journalLength(page)).toBe(8);
  expect((await placement(page, SMALL.bare)).x).toBe(10.123);

  await x.focus();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => journalLength(page)).toBe(9);
  expect(await commandsFrom(page, 8)).toEqual([
    { type: "set", changes: [{ target: SMALL.bare, values: { x: 11.123 } }] },
  ]);
  await expect(x).toHaveValue("11.12");

  await x.press("End");
  await x.press("5");
  expect(await journalLength(page)).toBe(9);
});

test("Escape cancels a resize and the form shows the stored values again", async ({ page }) => {
  await page.locator('[data-testid="mode-box"]').click();
  const before = await node(page, SMALL.bare).boundingBox();
  const grip = await page.locator('[data-testid="handle-right"]').boundingBox();
  if (grip === null) throw new Error("the right handle is not displayed");
  await dragStart(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 20, 0);
  await expect(field(page, "width")).toHaveValue("496.58");
  await page.keyboard.press("Escape");
  await expect(field(page, "width")).toHaveValue("");
  await expect.poll(() => node(page, SMALL.bare).boundingBox()).toEqual(before);
  expect(await page.evaluate(() => window.__tilie.selection())).toEqual([SMALL.bare]);
  await page.mouse.up();
  expect(await journalLength(page)).toBe(5);
  expect((await placement(page, SMALL.bare)).width).toBe(null);
});

test("the heading names the selected timeline, bundle and group", async ({ page }) => {
  await page.evaluate((text) => window.__tilie.load(text), fixtureText("bundles"));
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles);
  for (const [id, name] of [
    ["score", "Score"],
    ["pages", "Pages"],
    ["page_1", "Page 1"],
  ] as const) {
    await select(page, [`${BUNDLES.ungrouped}/${id}`]);
    await expect(subject(page)).toHaveText(`Timeline ${name}`);
    await expect(drawer(page).getByRole("heading", { level: 2 })).toHaveText("Inspector");
  }
  await select(page, [BUNDLES.ungrouped]);
  await expect(subject(page)).toHaveText("Bundle Sketches");
  await select(page, [`${BUNDLES.mixed}/group_1`]);
  await expect(subject(page)).toHaveText("Group Performance");
  await select(page, []);
  await expect(subject(page)).toHaveCount(0);
  expect(await journalLength(page)).toBe(OPENED_JOURNAL.bundles);
});

test("a press on a card names its timeline, a press on the margin the bundle", async ({ page }) => {
  const card = await cardPoint(page, SMALL.bare);
  await page.mouse.click(card.x, card.y);
  expect(await selection(page)).toEqual([`${SMALL.bare}/bare/card`]);
  await expect(page.getByRole("form", { name: "Card properties" })).toHaveCount(1);
  await expect(drawer(page).locator("fieldset")).toHaveCount(0);
  await expect(subject(page)).toHaveText("Card of timeline Bare");
  const margin = await marginPoint(page, SMALL.bare);
  await page.mouse.click(margin.x, margin.y);
  expect(await selection(page)).toEqual([SMALL.bare]);
  await expect(subject(page)).toHaveText("Anonymous bundle");
  expect(await journalLength(page)).toBe(OPENED_JOURNAL.small);
});

test("the form edits the selected frame's and card's places, never the block's", async ({
  page,
}) => {
  await page.evaluate((text) => window.__tilie.load(text), fixtureText("bundles"));
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles);
  await select(page, [`${BUNDLES.mixed}/group_1`]);
  const frame = page.getByRole("form", { name: "Frame properties" });
  const length = frame.getByLabel("length", { exact: true });
  await expect(length).toHaveValue("400");
  await expect(frame.getByLabel("scale", { exact: true })).toHaveValue("1");
  await expect(frame.getByLabel("spacing", { exact: true })).toHaveValue("1");
  await expect(frame.getByLabel("x", { exact: true })).toBeDisabled();
  await expect(frame.getByLabel("y", { exact: true })).toBeDisabled();
  await length.fill("300");
  await length.press("Enter");
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles + 1);
  expect(await commandsFrom(page, OPENED_JOURNAL.bundles)).toEqual([
    {
      type: "set",
      changes: [
        { target: `${BUNDLES.mixed}/group_1`, values: { place: { length: 300 } } },
        { target: `${BUNDLES.mixed}/group_2`, values: { place: { x: 8, y: 206.0390625 } } },
        { target: `${BUNDLES.mixed}/annotations`, values: { place: { x: 8, y: 391.7734375 } } },
      ],
    },
  ]);
  expect((await placement(page, BUNDLES.mixed)).length).toBe(400);
  await expect(length).toHaveValue("300");

  await select(page, [`${BUNDLES.mixed}/score/card`]);
  const card = page.getByRole("form", { name: "Card properties" });
  await expect(card.getByLabel("group length", { exact: true })).toHaveValue("300");
  const width = card.getByLabel("width", { exact: true });
  await width.fill("650");
  await width.press("Enter");
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles + 2);
  expect(await commandsFrom(page, OPENED_JOURNAL.bundles + 1)).toEqual([
    {
      type: "set",
      changes: [{ target: `${BUNDLES.mixed}/score`, values: { place: { width: 650 } } }],
    },
  ]);
  await expect(width).toHaveValue("650");
});

test("the form follows a frame's Stretch live in the bundle editor", async ({ page }) => {
  await page.evaluate((text) => window.__tilie.load(text), fixtureText("bundles"));
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles);
  const at = { x: 40, y: 40, zoom: 1 };
  expect(await page.evaluate((target) => window.__tilie.open(target), BUNDLES.mixed)).toBeNull();
  await expect.poll(() => viewportOf(page)).not.toEqual(at);
  await setViewport(page, at);
  await select(page, [`${BUNDLES.mixed}/group_1`]);
  await tab(page, "Properties").click();
  const frame = page.getByRole("form", { name: "Frame properties" });
  const length = frame.getByLabel("length", { exact: true });
  const width = frame.getByLabel("width", { exact: true });
  await expect(length).toHaveValue("400");
  await expect(width).toHaveValue("562.48");
  const entries = () => page.evaluate(() => window.__tilie.store().entries.length);
  await page.locator('[data-testid="mode-stretch"]').click();
  const grip = await page.locator('[data-testid="handle-right"]').boundingBox();
  if (grip === null) throw new Error("the right handle is not displayed");
  await dragStart(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 20, 0);
  await expect(length).toHaveValue("420");
  await expect(width).toHaveValue("582.48");
  expect(await entries()).toBe(0);
  await page.mouse.up();
  await expect.poll(entries).toBe(1);
  expect(
    await page.evaluate(
      (block) => JSON.parse(JSON.stringify(window.__tilie.store().view.blocks[block]?.places)),
      BUNDLES.mixed,
    ),
  ).toEqual({
    group_1: { length: 420 },
    group_2: { x: 8, y: 206.0390625 },
    annotations: { x: 8, y: 391.7734375 },
  });
  await expect(length).toHaveValue("420");
  await expect(width).toHaveValue("582.48");
});

/** The text's form (the checkbox "Minimal") and whether it includes the styling. */
interface Mode {
  readonly minimal: boolean;
  readonly includeStyling: boolean;
}

const MODES: readonly Mode[] = [
  { minimal: false, includeStyling: false },
  { minimal: false, includeStyling: true },
  { minimal: true, includeStyling: false },
  { minimal: true, includeStyling: true },
];

/** The root's name in `styled__score`'s JSON text, in every form. */
const SCORE = '"name": "Score"';
const RENAMED = '"name": "Renamed"';

/**
 * The JSON text of `styled__score` in `mode`, from the fixture files alone:
 * the complete or the minimal file, without its `graphical` member unless
 * the styling is included.
 */
function modeText(mode: Mode): string {
  const text = manifestFixture(mode.minimal ? "styled__score.minimal" : "styled__score");
  if (mode.includeStyling) return text;
  const value = parseJson(text) as Record<string, unknown>;
  return dumps(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "graphical")));
}

for (const mode of MODES) {
  const form = mode.minimal ? "minimal" : "complete";
  const styling = mode.includeStyling ? "included" : "excluded";
  test(`Apply and Revert follow the text, ${form} form, styling ${styling}`, async ({ page }) => {
    await select(page, [`${SMALL.styled}/score`]);
    await expect(subject(page)).toHaveText("Timeline Score");
    await showManifest(page);
    const minimal = page.getByRole("checkbox", { name: "Minimal", exact: true });
    const includeStyling = page.getByRole("checkbox", { name: "Include styling", exact: true });
    await expect(minimal).not.toBeChecked();
    await expect(includeStyling).not.toBeChecked();
    if (mode.minimal) await minimal.check();
    if (mode.includeStyling) await includeStyling.check();
    const shown = modeText(mode);
    expect(shown.split(SCORE)).toHaveLength(2);
    const text = manifestText(page);
    await expect(text).toHaveValue(shown);
    await expectButtons(page, false);

    // One character typed, then deleted again.
    const hint = page.getByText("Apply or Revert to switch", { exact: true });
    await text.press("x");
    await expectButtons(page, true);
    await expect(minimal).toBeDisabled();
    await expect(includeStyling).toBeDisabled();
    await expect(hint).toBeVisible();
    await text.press("Backspace");
    await expect(text).toHaveValue(shown);
    await expectButtons(page, false);
    await expect(hint).toBeHidden();

    await text.fill(shown.replace(SCORE, '"name": "Draft"'));
    await expectButtons(page, true);
    await page.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(text).toHaveValue(shown);
    await expectButtons(page, false);
    expect(await journalLength(page)).toBe(5);

    await text.fill(shown.replace(SCORE, RENAMED));
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect.poll(() => journalLength(page)).toBe(6);
    expect(await commandsFrom(page, 5)).toEqual([
      { type: "set", changes: [{ target: SMALL.styled, values: { manifest: expect.anything() } }] },
    ]);
    const expected = loadManifest(manifestFixture("styled__score").replace(SCORE, RENAMED));
    if (isLoadError(expected)) throw new Error(`the renamed fixture is refused`);
    // Deep equality: the store keeps the key order of the text applied, which no writer shows.
    expect(JSON.parse(await storedManifest(page, SMALL.styled))).toEqual(
      JSON.parse(JSON.stringify(expected)),
    );
    await expect(text).toHaveValue(shown.replace(SCORE, RENAMED));
    await expectButtons(page, false);
    await expect(tab(page, "Manifest")).toHaveAttribute("aria-selected", "true");

    await tab(page, "Properties").click();
    await expect(subject(page)).toHaveText("Timeline Renamed");
    await expect(field(page, "x")).toHaveValue("8");
    await expect(field(page, "y")).toHaveValue("8");
  });
}

test("an unapplied text survives a visit to the Properties tab", async ({ page }) => {
  await showManifest(page);
  const text = manifestText(page);
  await expect(text).toHaveValue(/"name": "Bare"/);
  const shown = await text.inputValue();
  expect(shown.split('"name": "Bare"')).toHaveLength(2);
  const edited = shown.replace('"name": "Bare"', '"name": "Kept"');
  await text.fill(edited);
  await expectButtons(page, true);
  await tab(page, "Properties").click();
  await expect(text).toBeHidden();
  await showManifest(page);
  await expect(text).toHaveValue(edited);
  await expectButtons(page, true);
  expect(await journalLength(page)).toBe(5);
});
