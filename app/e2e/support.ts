/**
 * Shared helpers of the end-to-end suite: open a fixture workspace through
 * the test hook, read the store's view and journal, convert canvas units to
 * screen pixels, and drive pointer gestures in steps. Every wait waits on
 * state, never on time.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { Command, Store } from "../packages/core/src/index.ts";

export type ResizeMode = "scale" | "box" | "stretch";
export type Handle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** The hook the editor installs in development and test builds only. */
export interface TilieHook {
  load(text: string): void;
  store(): Store;
  selection(): string[];
  select(addresses: string[]): void;
  viewport(): Viewport;
  setViewport(viewport: Viewport): void;
  locked(): boolean;
  mode(): ResizeMode;
  /** `writeWorkspace` of the store's view and journal. */
  text(): string;
}

declare global {
  interface Window {
    __tilie: TilieHook;
  }
}

/** A block's placement as the store holds it. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly index: string;
  readonly scale: number;
  readonly length: number;
  readonly spacing: number;
  readonly width: number | null;
  readonly height: number | null;
}

export type FixtureName = "small" | "grid-300" | "grid-900";

export function fixtureText(name: FixtureName): string {
  return readFileSync(path.join(import.meta.dirname, "fixtures", `${name}.tle.json`), "utf8");
}

/** The ids of `small`'s blocks, in the order they were added (their index order). */
export const SMALL = {
  bare: "bare000000",
  nested: "nested0000",
  map: "map0000000",
  flow: "flow000000",
  styled: "styled0000",
} as const;

/** The block ids of `small` in index order. */
export const SMALL_ORDER = [SMALL.bare, SMALL.nested, SMALL.map, SMALL.flow, SMALL.styled];

/** The journal length right after a fixture is opened: one `add` per block. */
export const OPENED_JOURNAL = { small: 5, "grid-300": 300, "grid-900": 900 } as const;

/**
 * Open the editor, load a fixture through the hook and wait until the
 * store holds every block of the file.
 */
export async function open(page: Page, name: FixtureName): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  await page.evaluate((text) => window.__tilie.load(text), fixtureText(name));
  await expect
    .poll(() => page.evaluate(() => window.__tilie.store().journal.length))
    .toBe(OPENED_JOURNAL[name]);
}

/** Set the viewport and wait until the canvas reports it. */
export async function setViewport(page: Page, viewport: Viewport): Promise<void> {
  await page.evaluate((v) => window.__tilie.setViewport(v), viewport);
  await expect.poll(() => viewportOf(page)).toEqual(viewport);
}

export function viewportOf(page: Page): Promise<Viewport> {
  return page.evaluate(() => {
    const { x, y, zoom } = window.__tilie.viewport();
    return { x, y, zoom };
  });
}

export function node(page: Page, id: string): Locator {
  return page.locator(`.svelte-flow__node[data-id="${id}"]`);
}

/**
 * The drawn element `element` inside block `block`: every SVG part carrying
 * its address (a timeline is its line, its start dot and its end marker).
 */
export function element(page: Page, block: string, element: string): Locator {
  return node(page, block).locator(`[data-address="${element}"]`);
}

/** The first part of a drawn element, the one a click or a drag aims at. */
export function part(page: Page, block: string, address: string): Locator {
  return element(page, block, address).first();
}

/**
 * The screen point at the centre of a drawn element's first part. A
 * horizontal line has a box of zero height, which Playwright's actionability
 * checks count as invisible, so clicks aim at this point with the mouse.
 */
export async function partCentre(
  page: Page,
  block: string,
  address: string,
): Promise<{ x: number; y: number }> {
  const box = await part(page, block, address).boundingBox();
  if (box === null) throw new Error(`${block}/${address} is not displayed`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Click a drawn element, with Shift when `additive`. */
export async function clickPart(page: Page, block: string, address: string, additive = false) {
  const { x, y } = await partCentre(page, block, address);
  if (additive) await page.keyboard.down("Shift");
  await page.mouse.click(x, y);
  if (additive) await page.keyboard.up("Shift");
}

/** The distinct addresses of the drawn parts marked `[data-selected]`, sorted. */
export function selectedAddresses(page: Page): Promise<string[]> {
  return page
    .locator("[data-selected]")
    .evaluateAll((items) =>
      [...new Set(items.map((item) => item.getAttribute("data-address") ?? ""))].sort(),
    );
}

export function placement(page: Page, id: string): Promise<Placement> {
  return page.evaluate((block) => {
    const found = window.__tilie.store().view.blocks[block];
    if (found === undefined) throw new Error(`block ${block} is missing`);
    const { x, y, index, scale, length, spacing, width, height } = found;
    return { x, y, index, scale, length, spacing, width, height };
  }, id);
}

/** The ids of every block, in index order (the z-order, back to front). */
export function blockOrder(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.values(window.__tilie.store().view.blocks)
      .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
      .map((block) => block.id),
  );
}

export function journalLength(page: Page): Promise<number> {
  return page.evaluate(() => window.__tilie.store().journal.length);
}

/**
 * The commands journalled from entry `from` on. Only `set` and `remove`
 * commands are returned whole; an `add` carries a manifest whose numbers do
 * not survive the trip out of the page, so it is reduced to its type.
 */
export function commandsFrom(page: Page, from: number): Promise<Command[]> {
  return page.evaluate(
    (start) =>
      window.__tilie
        .store()
        .journal.slice(start)
        .map(({ command }) =>
          command.type === "set" || command.type === "remove"
            ? (JSON.parse(JSON.stringify(command)) as Command)
            : ({ type: command.type } as Command),
        ),
    from,
  );
}

/** The selection, sorted, so comparisons ignore the order of additions. */
export async function selection(page: Page): Promise<string[]> {
  return (await page.evaluate(() => window.__tilie.selection())).sort();
}

/** The pane: the element whose top-left corner is the viewport's origin. */
export function pane(page: Page): Locator {
  return page.locator(".svelte-flow");
}

/** The screen point of canvas point `(x, y)` under the current viewport. */
export async function toScreen(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const box = await pane(page).boundingBox();
  if (box === null) throw new Error("the canvas is not displayed");
  const view = await viewportOf(page);
  return { x: box.x + view.x + x * view.zoom, y: box.y + view.y + y * view.zoom };
}

/**
 * A whole-pixel screen point on block `id`'s background: inside its node, on no
 * drawn element and with none at the eight points `clearance` px around it, found by
 * hit-testing a raster of points across the node.
 */
export async function backgroundPoint(
  page: Page,
  id: string,
  clearance = 6,
): Promise<{ x: number; y: number }> {
  const box = await node(page, id).boundingBox();
  if (box === null) throw new Error(`block ${id} is not displayed`);
  const found = await page.evaluate(
    ({ block, clearance, left, top, width, height }) => {
      // Background at a point and at the points `clearance` px around it, so neither
      // pixel rounding nor a finger's contact area reaches a drawn element.
      const background = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        return (
          hit?.closest(".svelte-flow__node")?.getAttribute("data-id") === block &&
          hit?.closest("[data-address]") === null
        );
      };
      const around = [-clearance, 0, clearance];
      for (let fy = 0.1; fy < 1; fy += 0.1) {
        for (let fx = 0.05; fx < 1; fx += 0.05) {
          const x = Math.round(left + width * fx);
          const y = Math.round(top + height * fy);
          if (around.every((dx) => around.every((dy) => background(x + dx, y + dy)))) {
            return { x, y };
          }
        }
      }
      return null;
    },
    { block: id, clearance, left: box.x, top: box.y, width: box.width, height: box.height },
  );
  if (found === null) throw new Error(`block ${id} shows no background point`);
  return found;
}

/** The screen point of canvas point `(x, y)`, which must hit the empty pane itself. */
export async function emptyPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const point = await toScreen(page, x, y);
  const empty = await page.evaluate(
    ({ x: px, y: py }) =>
      document.elementFromPoint(px, py)?.classList.contains("svelte-flow__pane") === true,
    point,
  );
  if (!empty) throw new Error(`canvas point (${x}, ${y}) is not on the empty pane`);
  return point;
}

/** Press at `from`, move by `(dx, dy)` in `steps` pointer moves, and keep the button down. */
export async function dragStart(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  steps = 10,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
}

/**
 * The lead-in of a node drag. Svelte Flow starts moving a node once the
 * pointer has travelled past its drag threshold (1 px) and measures the
 * displacement from the pointer's position at that moment, so the first move
 * of a gesture never moves the node. A node drag therefore first crosses the
 * threshold with a move of `LEAD_IN` px to the right and then travels exactly
 * `(dx, dy)` from there.
 */
export const LEAD_IN = 2;

/** Press on a node at `from`, cross the drag threshold, move by `(dx, dy)`, keep the button down. */
export async function nodeDragStart(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  steps = 10,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + LEAD_IN, from.y);
  await page.mouse.move(from.x + LEAD_IN + dx, from.y + dy, { steps });
}

/** A whole mouse drag from `from` by `(dx, dy)` in `steps` moves. */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  steps = 10,
): Promise<void> {
  await dragStart(page, from, dx, dy, steps);
  await page.mouse.up();
}

/** Drag block `id` by `(dx, dy)` screen pixels from a point on its background. */
export async function dragBlock(page: Page, id: string, dx: number, dy: number, steps = 10) {
  await nodeDragStart(page, await backgroundPoint(page, id), dx, dy, steps);
  await page.mouse.up();
}

/** Resolve after the browser has rendered two more frames. */
export function frames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
}

/** The family the canvas declares for drawn text: the bundled DejaVu Sans. */
export const DRAWING_FACE = "TiLiE DejaVu Sans";

/** The bundled face's advance table, from the installed timeskeleton package. */
const FONT_METRICS = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(
        createRequire(path.join(import.meta.dirname, "../packages/core/package.json")).resolve(
          "@timetoalign/timeskeleton/package.json",
        ),
      ),
      "fonts",
      "dejavu-sans-2.37.metrics.json",
    ),
    "utf8",
  ),
) as { units_per_em: number; advances: Record<string, number> };

/**
 * A text's width as the drawing defines it: the sum of its code points'
 * advances times the font size over the units per em (2048), kerning off.
 * The value is a dyadic fraction and exact as a double. A code point the
 * face lacks throws: the browser would draw it in another font.
 */
export function advanceWidth(text: string, size: number): number {
  let units = 0;
  for (const character of text) {
    const advance = FONT_METRICS.advances[String(character.codePointAt(0))];
    if (advance === undefined) throw new Error(`the face has no glyph for ${character}`);
    units += advance;
  }
  return (units * size) / FONT_METRICS.units_per_em;
}

/**
 * The width an engine reports for a text of exact width `width`, where its
 * rule is known: WebKit stores the exact value (a float32 holds every value
 * the fixtures produce), Chromium rounds a text run's width up to its layout
 * unit, 1/64 px.
 */
const ENGINE_WIDTH: Record<string, (width: number) => number> = {
  webkit: (width) => Math.fround(width),
  chromium: (width) => Math.ceil(width * 64) / 64,
};

/**
 * The drawn texts whose laid-out width is not their width in the bundled
 * face. In Chromium and WebKit the expected width is derived by hand from
 * the advance table (`advanceWidth`, then the engine's rule above). Firefox's
 * stored width differs from the exact one by up to 6e-4 px by a rule no
 * rounding grid reproduces, so there the expected width is the same string
 * laid out afresh, after the face has loaded, in the same `<svg>` with the
 * same font size. Either way an empty list proves every text was laid out
 * with the bundled face, not with a fallback that stood in while it loaded.
 */
export async function textsNotInFace(page: Page, browserName: string): Promise<string[]> {
  const rows = await page.evaluate(async (family) => {
    await document.fonts.load(`11px "${family}"`);
    await document.fonts.ready;
    return [...document.querySelectorAll<SVGTextElement>(".svelte-flow__node text")].map((text) => {
      const size = Number.parseFloat(getComputedStyle(text).fontSize);
      const fresh = document.createElementNS("http://www.w3.org/2000/svg", "text");
      fresh.setAttribute("font-size", String(size));
      fresh.setAttribute("visibility", "hidden");
      fresh.textContent = text.textContent;
      text.ownerSVGElement?.append(fresh);
      const relaid = fresh.getComputedTextLength();
      fresh.remove();
      return {
        name: `${text.closest(".svelte-flow__node")?.getAttribute("data-id")}/${text.getAttribute("data-address")}`,
        text: text.textContent ?? "",
        size,
        width: text.getComputedTextLength(),
        relaid,
      };
    });
  }, DRAWING_FACE);
  const rule = ENGINE_WIDTH[browserName];
  return rows
    .filter((row) => {
      const expected = rule === undefined ? row.relaid : rule(advanceWidth(row.text, row.size));
      return row.width !== expected;
    })
    .map((row) => `${row.name} "${row.text}" ${row.width}`);
}
