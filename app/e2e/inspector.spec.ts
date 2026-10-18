/**
 * The inspector drawer on `small`: its tabs and their keys, with and
 * without an editor open; the manifest as text, applied as one command, refused with
 * its path, and Apply and Revert enabled exactly while the text is edited,
 * in the complete and the minimal form with the styling excluded or
 * included; the properties form of a block, a frame and a card, following a
 * frame's Stretch live in the bundle editor; and the disabled Locked checkbox
 * of a selected timeline, and what the selection names beside the heading
 * (a bundle, a group, a timeline, a card), on `bundles` and for a pressed
 * card. The expected values are derived in `README.md` ("inspector.spec.ts").
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Manifest } from "../packages/core/src/index.ts";
import { isLoadError, loadManifest } from "../packages/core/src/index.ts";
import {
  BUNDLES,
  cardPoint,
  commandsFrom,
  dragStart,
  element,
  fixtureText,
  journalLength,
  marginPoint,
  node,
  nodeDragStart,
  OPENED_JOURNAL,
  open,
  placement,
  SMALL,
  selection,
  setViewport,
  viewportOf,
} from "./support.ts";

function manifestText(page: Page) {
  return page.getByLabel(/^Manifest \(/);
}

type TabName = "Editor" | "Properties" | "Manifest" | "Journal";

/** The drawer's tab `name`. */
function tab(page: Page, name: TabName) {
  return page
    .getByRole("tablist", { name: "Inspector sections" })
    .getByRole("tab", { name, exact: true });
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

/** The type, targets and value names of the journal entries from `from` on, each a command entry. */
function changesFrom(page: Page, from: number) {
  return page.evaluate(
    (start) =>
      window.__tilie
        .store()
        .journal.slice(start)
        .map((entry, at) => {
          if (!("command" in entry)) throw new Error(`journal entry ${start + at} is a session`);
          const { command } = entry;
          return {
            type: command.type,
            changes:
              command.type === "set"
                ? command.changes.map(({ target, values }) => [target, Object.keys(values)])
                : [],
          };
        }),
    from,
  );
}

test.use({ viewport: { width: 1600, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await open(page, "small");
  await setViewport(page, { x: 40, y: 40, zoom: 1 });
  await page.evaluate((id) => window.__tilie.select([id]), SMALL.bare);
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
  expect(await changesFrom(page, 5)).toEqual([
    { type: "set", changes: [[SMALL.bare, ["manifest"]]] },
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
  const problems = page.locator("#inspector-problems li");
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
    const panel = page.locator(`#inspector-panel-${each.toLowerCase()}`);
    await expect(tab(page, each)).toHaveAttribute("aria-selected", String(chosen));
    await expect(tab(page, each)).toHaveAttribute("tabindex", chosen ? "0" : "-1");
    if (chosen) {
      await expect(tab(page, each)).toBeFocused();
      await expect(panel).toBeVisible();
    } else {
      await expect(panel).toBeHidden();
    }
  }
}

/** The tab list holds exactly the tabs `present`, in order, each with its id and its panel. */
async function expectTabIds(page: Page, present: readonly TabName[]): Promise<void> {
  await expect(
    page.getByRole("tablist", { name: "Inspector sections" }).getByRole("tab"),
  ).toHaveText([...present]);
  for (const name of present) {
    const id = name.toLowerCase();
    await expect(tab(page, name)).toHaveAttribute("id", `inspector-tab-${id}`);
    await expect(tab(page, name)).toHaveAttribute("aria-controls", `inspector-panel-${id}`);
    const panel = page.locator(`#inspector-panel-${id}`);
    await expect(panel).toHaveAttribute("role", "tabpanel");
    await expect(panel).toHaveAttribute("aria-labelledby", `inspector-tab-${id}`);
  }
}

test("the tabs follow the keyboard", async ({ page }) => {
  const arranging = ["Properties", "Manifest", "Journal"] as const;
  await expectTabIds(page, arranging);
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
  await expectTabIds(page, editing);
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

/** The text of the properties form's field `name`. */
function field(page: Page, name: string) {
  return page.getByLabel(name, { exact: true });
}

/** What the inspector shows, named beside its heading. */
function subject(page: Page) {
  return page.locator("#inspector-subject");
}

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

test("a selected timeline shows its locked as a disabled checkbox", async ({ page }) => {
  await page.evaluate((text) => window.__tilie.load(text), fixtureText("bundles"));
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles);
  const refused = await page.evaluate(
    (target) =>
      window.__tilie
        .store()
        .dispatch({ type: "set", changes: [{ target, values: { locked: true } }] }),
    `${BUNDLES.ungrouped}/score`,
  );
  expect(refused).toBe(null);
  const locked = page.getByRole("checkbox", { name: "Locked", exact: true });
  const unavailable = "Locking and unlocking is not available yet.";
  for (const [id, checked, name] of [
    ["score", true, "Score"],
    ["pages", false, "Pages"],
    ["page_1", false, "Page 1"],
  ] as const) {
    await page.evaluate(
      (address) => window.__tilie.select([address]),
      `${BUNDLES.ungrouped}/${id}`,
    );
    await expect(locked).toHaveCount(1);
    await expect(locked).toBeDisabled();
    await expect(locked, id).toBeChecked({ checked });
    await expect(locked).toHaveAttribute("title", unavailable);
    await expect(locked).toHaveAccessibleDescription(unavailable);
    await expect(subject(page)).toHaveText(`Timeline ${name}`);
    await expect(page.locator("#inspector-heading")).toHaveText("Inspector");
  }
  await page.evaluate((id) => window.__tilie.select([id]), BUNDLES.ungrouped);
  await expect(locked).toHaveCount(0);
  await expect(subject(page)).toHaveText("Bundle Sketches");
  await page.evaluate((address) => window.__tilie.select([address]), `${BUNDLES.mixed}/group_1`);
  await expect(locked).toHaveCount(0);
  await expect(subject(page)).toHaveText("Group Performance");
  await page.evaluate(() => window.__tilie.select([]));
  await expect(subject(page)).toHaveCount(0);
});

test("a press on a card shows its timeline's checkbox", async ({ page }) => {
  const refused = await page.evaluate(
    (target) =>
      window.__tilie
        .store()
        .dispatch({ type: "set", changes: [{ target, values: { locked: true } }] }),
    `${SMALL.bare}/bare`,
  );
  expect(refused).toBe(null);
  await expect.poll(() => journalLength(page)).toBe(6);
  const card = await cardPoint(page, SMALL.bare);
  await page.mouse.click(card.x, card.y);
  expect(await selection(page)).toEqual([`${SMALL.bare}/bare/card`]);
  const locked = page.getByRole("checkbox", { name: "Locked", exact: true });
  await expect(locked).toHaveCount(1);
  // The cell right after the height field's.
  await expect(
    page
      .getByRole("form", { name: "Card properties" })
      .locator("label:has(input[name=height]) + label")
      .getByRole("checkbox", { name: "Locked", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator("#inspector fieldset")).toHaveCount(0);
  await expect(locked).toBeDisabled();
  await expect(locked).toBeChecked();
  await expect(subject(page)).toHaveText("Card of timeline Bare");
  const margin = await marginPoint(page, SMALL.bare);
  await page.mouse.click(margin.x, margin.y);
  expect(await selection(page)).toEqual([SMALL.bare]);
  await expect(locked).toHaveCount(0);
  await expect(subject(page)).toHaveText("Anonymous bundle");
  expect(await journalLength(page)).toBe(6);
});

test("the form edits the selected frame's and card's places, never the block's", async ({
  page,
}) => {
  await page.evaluate((text) => window.__tilie.load(text), fixtureText("bundles"));
  await expect.poll(() => journalLength(page)).toBe(OPENED_JOURNAL.bundles);
  await page.evaluate((address) => window.__tilie.select([address]), `${BUNDLES.mixed}/group_1`);
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

  await page.evaluate((address) => window.__tilie.select([address]), `${BUNDLES.mixed}/score/card`);
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
  await page.evaluate((address) => window.__tilie.select([address]), `${BUNDLES.mixed}/group_1`);
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

/** The timeskeleton package that `core` depends on, and its schema version's manifest fixtures. */
const packageDir = path.dirname(
  createRequire(path.join(import.meta.dirname, "../packages/core/package.json")).resolve(
    "@timetoalign/timeskeleton/package.json",
  ),
);
const { SCHEMA_VERSION, dumps, parseJson } = (await import(
  pathToFileURL(path.join(packageDir, "dist", "index.js")).href
)) as {
  readonly SCHEMA_VERSION: string;
  readonly dumps: (value: unknown) => string;
  readonly parseJson: (text: string) => unknown;
};

/** A manifest fixture's text by its name below the schema version's fixtures. */
function fixtureFile(name: string): string {
  return readFileSync(path.join(packageDir, "fixtures", SCHEMA_VERSION, `${name}.json`), "utf8");
}

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
  const text = fixtureFile(mode.minimal ? "styled__score.minimal" : "styled__score");
  if (mode.includeStyling) return text;
  const value = parseJson(text) as Record<string, unknown>;
  return dumps(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "graphical")));
}

for (const mode of MODES) {
  const form = mode.minimal ? "minimal" : "complete";
  const styling = mode.includeStyling ? "included" : "excluded";
  test(`Apply and Revert follow the text, ${form} form, styling ${styling}`, async ({ page }) => {
    await page.evaluate((address) => window.__tilie.select([address]), `${SMALL.styled}/score`);
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
    expect(await changesFrom(page, 5)).toEqual([
      { type: "set", changes: [[SMALL.styled, ["manifest"]]] },
    ]);
    const expected = loadManifest(fixtureFile("styled__score").replace(SCORE, RENAMED));
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
    const locked = page.getByRole("checkbox", { name: "Locked", exact: true });
    await expect(locked).toHaveCount(1);
    await expect(locked).not.toBeChecked();
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
