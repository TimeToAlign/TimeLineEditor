/**
 * The ribbons of a virtual card's chunks under the pointer, in a browser, on
 * TimeToShare's fixture `flow/virtual_cards` (the root `allegro`, 1644
 * quarters, its atomic sections A [0, 953/2), B and C; the virtual timeline
 * `allegro_default` playing A B A C), `allegro_default` placed alone by one
 * `set` of its place and `allegro`'s card selected. The expected ends are
 * derived from the block's drawing as the arranger's README derives them
 * ("Where the pointer shows a chunk"):
 *
 * - the pointer on chunk 2's segment (its brace's middle abscissa on the
 *   virtual line), on its brace's arms, and halfway between the line and the
 *   arms each draws exactly one ribbon, from brace 2's `x1`..`x2` at the
 *   virtual line's ordinate to A's written stretch on `allegro`'s line, and
 *   lights brace 0, the other A;
 * - the pointer on `allegro`'s line over A's middle draws two ribbons, from
 *   braces 0 and 2, both to that stretch, and lights nothing;
 * - moving off the block removes them.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf } from "../packages/arranger/src/drawing.ts";
import { isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import type { Drawing, LineAxis } from "../packages/layout/src/index.ts";
import { lineAxes } from "../packages/layout/src/index.ts";
import { FONT_METRICS } from "./schema.ts";
import { dispatch, importFixture, node, paneOf, part, select, settledDrawing } from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const ROOT = "allegro";
const DEFAULT = "allegro_default";

/** One end of a ribbon: from `x1` to `x2` on the line at the ordinate `y`, in drawing units. */
interface End {
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
}

/** Import the fixture, place `allegro_default` at (0, 200) and select `allegro`'s card; the block. */
async function start(page: Page): Promise<string> {
  const block = await importFixture(page, "flow/virtual_cards");
  expect(
    await dispatch(page, {
      type: "set",
      changes: [{ target: { block, id: DEFAULT }, values: { place: { x: 0, y: 200 } } }],
    }),
  ).toBeNull();
  await settledDrawing(page, block);
  await select(page, [{ block, id: ROOT, part: ["card"] }]);
  return block;
}

/** Block `block`'s drawing as the canvas draws it now (`settledDrawing` waited for it). */
async function drawingNow(page: Page, block: string): Promise<Drawing> {
  const workspace = readWorkspace(await page.evaluate(() => window.__tilie.text()));
  if (isLoadError(workspace)) throw new Error("the workspace is refused");
  const found = workspace.view.blocks[block];
  if (found === undefined) throw new Error(`block ${block} is missing`);
  return drawingOf(found, workspace.view.graphical, FONT_METRICS, undefined, await paneOf(page));
}

/** The one line of `timeline` in `drawing`. */
function lineOf(drawing: Drawing, timeline: string): LineAxis {
  const lines = [...lineAxes(drawing).values()].filter((axis) => axis.timeline === timeline);
  const [one] = lines;
  if (one === undefined || lines.length !== 1) throw new Error(`${timeline} has ${lines.length}`);
  return one;
}

/** The brace of chunk `index` of `allegro_default` in `drawing`. */
function braceOf(drawing: Drawing, index: number): { x1: number; x2: number; yb: number } {
  const found = drawing.elements.find(
    (element) =>
      element.type === "region" &&
      element.address.id === DEFAULT &&
      element.address.part?.length === 1 &&
      element.address.part[0] === index,
  );
  if (found?.type !== "region") throw new Error(`no brace ${index}`);
  return { x1: found.x1, x2: found.x2, yb: found.yb };
}

/** Where `[s, e)` lies on `axis` (its start 0, its drawn length 1644), as layout's `abscissaOf` places it. */
function stretchOn(axis: LineAxis, s: number, e: number): End {
  const at = (value: number) => axis.xStart + (value / 1644) * (axis.xEnd - axis.xStart);
  expect([String(axis.start), String(axis.drawnLength)]).toEqual(["0", "1644"]);
  return { x1: at(s), x2: at(e), y: axis.y };
}

/** Move the pointer to the drawing point `(x, y)` of block `block`, through its `<svg>`'s screen matrix. */
async function hover(page: Page, block: string, x: number, y: number): Promise<void> {
  const screen = await node(page, block)
    .locator(".tilie-block > svg")
    .evaluate(
      (svg, point) => {
        const matrix = (svg as SVGSVGElement).getScreenCTM();
        if (matrix === null) throw new Error("the block's drawing is not displayed");
        return {
          x: matrix.a * point.x + matrix.c * point.y + matrix.e,
          y: matrix.b * point.x + matrix.d * point.y + matrix.f,
        };
      },
      { x, y },
    );
  await page.mouse.move(Math.round(screen.x), Math.round(screen.y));
}

/** The ends of every drawn ribbon, read off its path `M a1 ya L a2 ya C … b2 yb L b1 yb C … Z`. */
async function ribbonEnds(page: Page): Promise<{ from: End; to: End }[]> {
  const paths = await page
    .locator(".tilie-block g.tilie-ribbons path.tilie-ribbon")
    .evaluateAll((found) => found.map((path) => path.getAttribute("d") ?? ""));
  return paths.map((d) => {
    const n = (d.match(/-?[\d.]+(?:e[-+]?\d+)?/g) ?? []).map(Number);
    return {
      from: { x1: n[0] as number, x2: n[2] as number, y: n[1] as number },
      to: { x1: n[10] as number, x2: n[8] as number, y: n[9] as number },
    };
  });
}

test("a chunk's segment, its brace and the space between show its ribbon", async ({ page }) => {
  const block = await start(page);
  const drawing = await drawingNow(page, block);
  const line = lineOf(drawing, DEFAULT);
  const brace = braceOf(drawing, 2);
  const to = stretchOn(lineOf(drawing, ROOT), 0, 953 / 2);
  const ribbons = page.locator(".tilie-block g.tilie-ribbons");
  const lit = ribbons.locator(".tilie-lit");
  const zero = part(page, block, { id: DEFAULT, facet: "regions", part: [0] });
  const x = (brace.x1 + brace.x2) / 2;
  for (const y of [line.y, brace.yb, (line.y + brace.yb) / 2]) {
    await page.mouse.move(1, 1);
    await expect(ribbons).toHaveCount(0);
    await hover(page, block, x, y);
    await expect(ribbons.locator("path.tilie-ribbon")).toHaveCount(1);
    expect(await ribbonEnds(page)).toEqual([
      { from: { x1: brace.x1, x2: brace.x2, y: line.y }, to },
    ]);
    await expect(lit).toHaveCount(1);
    expect(await lit.getAttribute("d")).toBe(await zero.getAttribute("d"));
  }
  await page.mouse.move(1, 1);
  await expect(ribbons).toHaveCount(0);
});

test("a written section shows the ribbons of every chunk playing it", async ({ page }) => {
  const block = await start(page);
  const drawing = await drawingNow(page, block);
  const line = lineOf(drawing, DEFAULT);
  const root = lineOf(drawing, ROOT);
  const to = stretchOn(root, 0, 953 / 2);
  const ribbons = page.locator(".tilie-block g.tilie-ribbons");
  await hover(page, block, stretchOn(root, 953 / 4, 953 / 4).x1, root.y);
  await expect(ribbons.locator("path.tilie-ribbon")).toHaveCount(2);
  expect(await ribbonEnds(page)).toEqual(
    [0, 2].map((index) => {
      const { x1, x2 } = braceOf(drawing, index);
      return { from: { x1, x2, y: line.y }, to };
    }),
  );
  await expect(ribbons.locator(".tilie-lit")).toHaveCount(0);
  await page.mouse.move(1, 1);
  await expect(ribbons).toHaveCount(0);
});
