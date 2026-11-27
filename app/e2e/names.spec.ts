/**
 * Cut names in the app, on TimeToShare's `flow/virtual_cards` with
 * `allegro_default` placed: a card's name and a virtual card's name are cut
 * to their `max-width` and end left of their lines, and the pointer on a cut
 * name shows it whole on an opaque box over what lies behind; with the flow
 * editor open, the rows' names are cut the same way in the pane's own name
 * column, end left of their rows' lines, and show whole on hover. The
 * expected values are derived in `README.md` ("names.spec.ts").
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  bandPoint,
  dispatch,
  editing,
  element,
  importFixture,
  part,
  settledDrawing,
  setViewport,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const LONG_ROOT = "Allegro con brio, the first movement of the sonata in full";
const LONG_ROW = "Practice: the opening four times, a breath, then the coda";
const OPAQUE = "rgb(255, 255, 255)";

type Rect = { x: number; y: number; width: number; height: number };

/** The page's own client rectangle of `locator`'s first match. */
function rectOf(locator: Locator): Promise<Rect> {
  return locator.first().evaluate((found) => {
    const { x, y, width, height } = found.getBoundingClientRect();
    return { x, y, width, height };
  });
}

/**
 * `flow/virtual_cards` imported, `allegro_default` placed at (0, 200),
 * `allegro` named `LONG_ROOT` and the FlowMap `by_hand` `LONG_ROW`; the block.
 */
async function start(page: Page): Promise<string> {
  const block = await importFixture(page, "flow/virtual_cards");
  expect(
    await dispatch(page, {
      type: "set",
      changes: [
        { target: { block, id: "allegro_default" }, values: { place: { x: 0, y: 200 } } },
        { target: { block, id: "allegro" }, values: { name: LONG_ROOT } },
        { target: { block, id: "by_hand" }, values: { name: LONG_ROW } },
      ],
    }),
  ).toBeNull();
  await settledDrawing(page, block);
  return block;
}

test("a cut name ends before its line and shows whole under the pointer", async ({ page }) => {
  const block = await start(page);
  for (const id of ["allegro", "allegro_default"]) {
    const name = element(page, block, { id, part: ["name"] });
    await expect(name).toHaveText(/…$/);
    const drawn = await rectOf(name);
    const line = await rectOf(part(page, block, { id }));
    expect(drawn.x + drawn.width).toBeLessThan(line.x);
  }
  const flag = page.getByTestId("name-flag");
  await expect(flag).toHaveCount(0);

  const name = element(page, block, { id: "allegro_default", part: ["name"] });
  const drawn = await rectOf(name);
  await page.mouse.move(Math.round(drawn.x + 20), Math.round(drawn.y + drawn.height / 2));
  await expect(flag).toHaveCount(1);
  await expect(flag.locator("text")).toHaveText(`Allegro, default · unfolded from ${LONG_ROOT}`);
  const box = flag.locator("rect");
  expect(await box.evaluate((found) => getComputedStyle(found).fill)).toBe(OPAQUE);
  // The box holds the whole text and reaches over the line the cut name ends before.
  const whole = await rectOf(flag.locator("text"));
  const covered = await rectOf(box);
  const line = await rectOf(part(page, block, { id: "allegro_default" }));
  expect(covered.x).toBeLessThan(whole.x);
  expect(covered.x + covered.width).toBeGreaterThan(whole.x + whole.width);
  expect(covered.x + covered.width).toBeGreaterThan(line.x);
  // The flag lets the pointer through: the name under it is still what the pointer is on.
  const centre = { x: Math.round(drawn.x + 20), y: Math.round(drawn.y + drawn.height / 2) };
  expect(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.textContent ?? null, centre),
  ).toBe(await name.textContent());

  await page.mouse.move(5, 500);
  await expect(flag).toHaveCount(0);
});

test("the flow editor's rows cut their names before their lines", async ({ page }) => {
  const block = await start(page);
  const place = await page.evaluate((id) => {
    const found = window.__tilie.store().view.blocks[id];
    return found === undefined ? null : { x: found.x, y: found.y };
  }, block);
  if (place === null) throw new Error(`block ${block} is missing`);
  const view = { x: 300 - place.x, y: 40 - place.y, zoom: 1 };
  await setViewport(page, view);
  await settledDrawing(page, block);
  const inBand = await bandPoint(page, block, { id: "allegro", facet: "flow_control" }, 2);
  await page.mouse.dblclick(inBand.x, inBand.y);
  await expect
    .poll(() => editing(page))
    .toEqual([{ target: { block, id: "allegro" }, kind: "flow" }]);
  await setViewport(page, view);
  const pane = page.getByTestId("flow-pane");
  await expect(pane).toBeVisible();

  const rows = pane.getByTestId("flow-row");
  await expect(rows).toHaveCount(4);
  for (const row of await rows.all()) {
    const name = await rectOf(row.getByTestId("flow-row-name"));
    const first = await rectOf(row.getByTestId("flow-entry"));
    expect(name.x + name.width).toBeLessThan(first.x);
  }
  const long = pane.locator('[data-testid="flow-row"][data-flow-map="by_hand"]');
  const name = long.getByTestId("flow-row-name");
  await expect(name).toHaveText("Practice: the opening four times, …");
  await expect(name).toHaveAttribute("data-whole", LONG_ROW);
  await expect(
    pane.locator('[data-testid="flow-row"][data-flow-map="default"]').getByTestId("flow-row-name"),
  ).not.toHaveAttribute("data-whole");

  const shown = () =>
    name.evaluate((found) => {
      const after = getComputedStyle(found, "::after");
      return { content: after.content, background: after.backgroundColor };
    });
  expect((await shown()).content).toBe("none");
  const drawn = await rectOf(name);
  await page.mouse.move(Math.round(drawn.x + 10), Math.round(drawn.y + drawn.height / 2));
  await expect.poll(shown).toEqual({ content: JSON.stringify(LONG_ROW), background: OPAQUE });
});
