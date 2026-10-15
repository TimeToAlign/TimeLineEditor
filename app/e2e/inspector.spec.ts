/**
 * The inspector drawer on `small`: the manifest as text, applied as one
 * command, refused with its path, and the block properties form; and the
 * disabled Locked checkbox of a selected timeline, on `bundles` and for a
 * pressed card. The expected values are derived in `README.md`
 * ("inspector.spec.ts").
 */

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Manifest } from "../packages/core/src/index.ts";
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
} from "./support.ts";

function manifestText(page: Page) {
  return page.getByLabel(/^Manifest \(/);
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

/** The type, targets and value names of the journal entries from `from` on. */
function changesFrom(page: Page, from: number) {
  return page.evaluate(
    (start) =>
      window.__tilie
        .store()
        .journal.slice(start)
        .map(({ command }) => ({
          type: command.type,
          changes:
            command.type === "set"
              ? command.changes.map(({ target, values }) => [target, Object.keys(values)])
              : [],
        })),
    from,
  );
}

test.use({ viewport: { width: 1600, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await open(page, "small");
  await setViewport(page, { x: 40, y: 40, zoom: 1 });
  await page.evaluate((id) => window.__tilie.select([id]), SMALL.bare);
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(manifestText(page)).toBeVisible();
});

test("a YAML edit reaches the canvas as one command and Undo restores it", async ({ page }) => {
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

test("axe-core reports no violation with the manifest shown", async ({ page }) => {
  await page.getByLabel("YAML").check();
  await expect(manifestText(page)).toHaveValue(/^groups: \[\]\n/);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

/** The text of the properties form's field `name`. */
function field(page: Page, name: string) {
  return page.getByLabel(name, { exact: true });
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
  for (const [id, checked] of [
    ["score", true],
    ["pages", false],
    ["page_1", false],
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
  }
  await page.evaluate((id) => window.__tilie.select([id]), BUNDLES.ungrouped);
  await expect(locked).toHaveCount(0);
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
  await expect(
    page.getByRole("group", { name: "Timeline bare", exact: true }).getByRole("checkbox"),
  ).toHaveCount(1);
  await expect(locked).toBeDisabled();
  await expect(locked).toBeChecked();
  const margin = await marginPoint(page, SMALL.bare);
  await page.mouse.click(margin.x, margin.y);
  expect(await selection(page)).toEqual([SMALL.bare]);
  await expect(locked).toHaveCount(0);
  expect(await journalLength(page)).toBe(6);
});
