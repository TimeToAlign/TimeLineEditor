/**
 * A virtual card is a segment line of its chunks (TimeToShare's
 * `docs/drawing.md`, section 8.10), in a browser, on the fixture
 * `flow/virtual_cards`. Derivation in `README.md` ("segment-lines.spec.ts"):
 *
 * - the practice card (`allegro_by_hand`, placed alone) labels its chunks
 *   `A × 4`, `4 ♩` and `C` above its line, and draws its gap entry 32 wide
 *   (the least gap width), the numbers of section 8.10's worked example;
 * - with the region `motto` added inside A, the one rule turning on the
 *   sources' Regions of `allegro_default` (placed alone) draws `motto` in the
 *   window of both chunks playing A, and nowhere on that card before.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { drawingOf } from "../packages/arranger/src/drawing.ts";
import { isLoadError, readWorkspace } from "../packages/core/src/index.ts";
import type { Drawing, LineElement } from "../packages/layout/src/index.ts";
import { formatNumber } from "../packages/writers/src/index.ts";
import { FONT_METRICS } from "./schema.ts";
import { dispatch, element, importFixture, paneOf, settledDrawing } from "./support.ts";

test.use({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });

const PRACTICE = "allegro_by_hand";
const DEFAULT = "allegro_default";

/** Import the fixture and place the virtual timeline `id` alone at (0, 200); the block. */
async function placed(page: Page, id: string): Promise<string> {
  const block = await importFixture(page, "flow/virtual_cards");
  expect(
    await dispatch(page, {
      type: "set",
      changes: [{ target: { block, id }, values: { place: { x: 0, y: 200 } } }],
    }),
  ).toBeNull();
  await settledDrawing(page, block);
  return block;
}

/** Block `block`'s drawing as the canvas draws it now (`settledDrawing` waited for it). */
async function drawingNow(page: Page, block: string): Promise<Drawing> {
  await settledDrawing(page, block);
  const workspace = readWorkspace(await page.evaluate(() => window.__tilie.text()));
  if (isLoadError(workspace)) throw new Error("the workspace is refused");
  const found = workspace.view.blocks[block];
  if (found === undefined) throw new Error(`block ${block} is missing`);
  return drawingOf(found, workspace.view.graphical, FONT_METRICS, undefined, await paneOf(page));
}

/** The line element of `id` in `drawing`. */
function lineOf(drawing: Drawing, id: string): LineElement {
  const line = drawing.elements.find(
    (item) => item.type === "timeline" && item.address.id === id && item.address.part === undefined,
  );
  if (line?.type !== "timeline") throw new Error(`${id} draws no line`);
  return line;
}

test("the practice card labels its chunks above its line and draws its gap 32 wide", async ({
  page,
}) => {
  const block = await placed(page, PRACTICE);
  const drawing = await drawingNow(page, block);
  const line = lineOf(drawing, PRACTICE);
  const x0 = line.xs;
  // Section 8.10, worked example: the gap entry [1906, 1910] widened from 0.5239… to 32.
  const gap = [x0 + 62.40995415848069, x0 + 94.40995415848069];
  expect(line.gapLines).toEqual([gap]);
  expect(line.xe).toBe(x0 + 244.2462344466274);
  // The gap line on the page, in the fixed grey, at the writer's numbers.
  const grey = element(page, block, { id: PRACTICE }).and(page.locator('line[stroke="#9CA3AF"]'));
  await expect(grey).toHaveCount(1);
  expect(
    await grey.evaluate((drawn) => [drawn.getAttribute("x1"), drawn.getAttribute("x2")]),
  ).toEqual(gap.map(formatNumber));
  // The chunks' labels, segment labels above the line, centred on their drawn spans.
  const labels = [
    [0, "A × 4", x0 + 31.204977079240344],
    [4, "4 ♩", x0 + 78.40995415848069],
    [5, "C", x0 + 169.328094302554],
  ] as const;
  for (const [k, text, x] of labels) {
    const label = element(page, block, { id: PRACTICE, part: [k, "label"] });
    await expect(label).toHaveText(text);
    const [lx, baseline] = await label.evaluate((drawn) =>
      ["x", "y"].map((name) => Number(drawn.getAttribute(name))),
    );
    expect(lx).toBe(Number(formatNumber(x)));
    expect(baseline).toBeLessThan(line.y);
  }
  // The boundaries of the gap's chunk and of C at the gap's two ends.
  for (const [k, x] of [
    [4, gap[0]],
    [5, gap[1]],
  ] as const) {
    const boundary = element(page, block, { id: PRACTICE, part: [k, "start"] });
    expect(await boundary.getAttribute("x1")).toBe(formatNumber(x ?? Number.NaN));
  }
});

test("one rule turns the sources' Regions on in every window", async ({ page }) => {
  const block = await placed(page, DEFAULT);
  expect(
    await dispatch(page, {
      type: "add",
      into: { block, id: "allegro" },
      region: { id: "motto", name: "Motto", start: [100, 1], end: [200, 1] },
    }),
  ).toBeNull();
  const braces = element(page, block, { id: "motto" });
  const labels = element(page, block, { id: "motto", part: ["label"] });
  // Stripped down: only allegro's own card draws motto.
  await settledDrawing(page, block);
  await expect(braces).toHaveCount(1);
  await expect(labels).toHaveCount(1);
  expect(
    await dispatch(page, {
      type: "style",
      select: { facet: "regions", inside: "chunk", within: DEFAULT },
      set: { display: "inline" },
      blocks: [block],
    }),
  ).toBeNull();
  // Both windows of A show it, at 100 and 500 + 100 of the played axis.
  const drawing = await drawingNow(page, block);
  const line = lineOf(drawing, DEFAULT);
  const x = (t: number) => line.xs + 400 * (t / (4241 / 2));
  const card = drawing.boxes.find((box) => box.kind === "card" && box.address.id === DEFAULT);
  if (card === undefined) throw new Error(`${DEFAULT} draws no card`);
  const onCard = drawing.elements
    .slice(card.range.start, card.range.end)
    .flatMap((item) =>
      item.type === "region" && item.address.id === "motto" ? [[item.x1, item.x2]] : [],
    );
  expect(onCard).toEqual([
    [x(100), x(200)],
    [x(600), x(700)],
  ]);
  await expect(braces).toHaveCount(3);
  await expect(labels).toHaveCount(3);
  await expect(labels.nth(1)).toHaveText("Motto");
  await expect(labels.nth(2)).toHaveText("Motto");
});
