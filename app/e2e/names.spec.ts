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
import type { Graphical } from "@timetoalign/timetoshare";
import { drawingOf } from "../packages/arranger/src/drawing.ts";
import { flowRows } from "../packages/arranger/src/flowEditor.ts";
import { flowPaneOf } from "../packages/arranger/src/flowEditorRows.ts";
import type { Block } from "../packages/core/src/index.ts";
import { isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import type { Drawing, TextElement } from "../packages/layout/src/index.ts";
import { TextMeasure } from "../packages/layout/src/index.ts";
import { attributeText } from "../packages/writers/src/svg.ts";
import { FONT_METRICS } from "./schema.ts";
import {
  bandPoint,
  dispatch,
  editing,
  element,
  importFixture,
  paneOf,
  part,
  settledDrawing,
  setViewport,
} from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const LONG_ROOT = "Allegro con brio, the first movement of the sonata in full";
const LONG_ROW = "Practice: the opening four times, a breath, then the coda";
const OPAQUE = "rgb(255, 255, 255)";

type Rect = { x: number; y: number; width: number; height: number };

const measure = new TextMeasure(FONT_METRICS);

/**
 * Each card's cut name and line (README, "names.spec.ts"): the name's start `x`, the width of
 * its cut text at size 11, its line's start `s0 = n + N + G'`, `N` the column's widest cut name.
 */
const CARD_NAMES = [
  { id: "allegro", x: 24, width: 151.20703125, start: 189.65771484375 },
  { id: "allegro_default", x: 16, width: 157.65771484375, start: 181.65771484375 },
] as const;

/** Block `block`, its workspace's graphical and its drawing as the canvas draws it now. */
async function drawnNow(
  page: Page,
  block: string,
): Promise<{ found: Block; graphical: Graphical; drawing: Drawing }> {
  await settledDrawing(page, block);
  const workspace = readWorkspace(await page.evaluate(() => window.__tilie.text()));
  if (isLoadError(workspace)) throw new Error("the workspace is refused");
  const found = workspace.view.blocks[block];
  if (found === undefined) throw new Error(`block ${block} is missing`);
  const { graphical } = workspace.view;
  const drawing = drawingOf(found, graphical, FONT_METRICS, undefined, await paneOf(page));
  return { found, graphical, drawing };
}

/** The name element of the card of `id` in `drawing`. */
function nameOf(drawing: Drawing, id: string): TextElement {
  const name = drawing.elements.find(
    (item): item is TextElement => item.type === "name" && item.address.id === id,
  );
  if (name === undefined) throw new Error(`${id} draws no name`);
  return name;
}

/** The start of the line of `id` in `drawing`. */
function lineStart(drawing: Drawing, id: string): number {
  const line = drawing.elements.find(
    (item) => item.type === "timeline" && item.address.id === id && item.address.part === undefined,
  );
  if (line?.type !== "timeline") throw new Error(`${id} draws no line`);
  return line.xs;
}

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
  const { drawing } = await drawnNow(page, block);
  for (const { id, x, width, start: s0 } of CARD_NAMES) {
    const name = element(page, block, { id, part: ["name"] });
    await expect(name).toHaveText(/…$/);
    const cut = nameOf(drawing, id);
    expect([cut.x, measure.width(cut.text, 11), lineStart(drawing, id)]).toEqual([x, width, s0]);
    // On the page at the writer's numbers: the name from `x`, the line's first part from `s0`.
    expect(await name.getAttribute("x")).toBe(attributeText(x));
    expect(await part(page, block, { id }).getAttribute("x1")).toBe(attributeText(s0));
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
  // The box holds the whole text, padded 11 / 4 = 2.75 on every side, and reaches over the line
  // the cut name ends before: from 16 − 2.75 to 16 + 486.041015625 + 2.75 = 504.791015625, past
  // the line's start 181.65771484375; the text where the name's is.
  const whole = nameOf(drawing, "allegro_default").whole ?? "";
  expect(measure.width(whole, 11)).toBe(486.041015625);
  expect(await flag.locator("text").getAttribute("x")).toBe(attributeText(16));
  expect(
    await box.evaluate((found) =>
      ["x", "y", "width", "height"].map((name) => found.getAttribute(name)),
    ),
  ).toEqual([13.25, 219.32421875, 491.541015625, 18.3046875].map(attributeText));
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
  // The pane's numbers (README): names from 8 in pane coordinates, every line from
  // `8 + 159.55224609375 + G' = 175.55224609375`, `by_hand`'s cut name the widest at size 9.
  const { found, graphical, drawing } = await drawnNow(page, block);
  const flowPane = flowPaneOf(
    found,
    drawing,
    graphical,
    FONT_METRICS,
    "allegro",
    flowRows(found.manifest, "allegro"),
  );
  if (flowPane === null) throw new Error("the flow editor's pane is not drawn");
  expect([flowPane.nameX, flowPane.lineStart]).toEqual([8, 175.55224609375]);
  const widths = Object.fromEntries(
    flowPane.rows.map((row) => [row.row.id, measure.width(row.name.text, 9)]),
  );
  expect(widths).toEqual({
    default: 31.6669921875,
    printed: 32.396484375,
    single: 26.64404296875,
    by_hand: 159.55224609375,
  });
  // The browser writes a length back in its own precision: the line start as it serializes
  // `175.55224609375px`, which the pane states.
  const lineLeft = await page.evaluate((value) => {
    const probe = document.createElement("div");
    probe.style.left = `${value}px`;
    return probe.style.left;
  }, 175.55224609375);
  for (const row of flowPane.rows) {
    expect(row.chunks[0]?.x1).toBe(175.55224609375);
    const shown = pane.locator(`[data-testid="flow-row"][data-flow-map="${row.row.id}"]`);
    // At the block's scale 1 a pane unit is a CSS pixel: the name at 8, the first entry at the line.
    expect(await shown.getByTestId("flow-row-name").evaluate((found) => found.style.left)).toBe(
      "8px",
    );
    expect(
      await shown
        .getByTestId("flow-entry")
        .first()
        .evaluate((found) => found.style.left),
    ).toBe(lineLeft);
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
