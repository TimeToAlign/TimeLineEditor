/**
 * Shared helpers of the end-to-end suite: open a fixture workspace and an
 * editor through the test hook, read the store's view, journal and open
 * session, convert between canvas units and screen pixels, aim at a band,
 * and drive pointer gestures in steps. Every wait waits on state, never on
 * time.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Download, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type {
  BandKind,
  Command,
  CommandError,
  OpenEditor,
  Store,
} from "../packages/core/src/index.ts";

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
  /** The open workspace as Save writes it: `writeWorkspace` of the store's snapshot, every open editor folded. */
  text(): string;
  /** The editing path: the open editors, outermost first. */
  editing(): OpenEditor[];
  /** Open the editor of `address` inside the innermost open one; the refusal, or `null` when it opened. */
  open(address: string): CommandError | null;
  /** Close the innermost editor, keeping its changes. */
  done(): void;
  /** Close the innermost editor, discarding its changes, without the editing bar's question. */
  cancel(): void;
  /** The bands drawn in block `block`, in the drawing's order. */
  bands(block: string): HookBand[];
}

/** A rectangle in client pixels, left and top as `getBoundingClientRect` gives them. */
export interface ClientRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A band of a block's drawing (drawing.md section 6.4), as the hook's `bands` reports it. */
export interface HookBand {
  /** `T/<kind>_1`. */
  readonly address: string;
  /** The id of its timeline. */
  readonly timeline: string;
  readonly kind: BandKind;
  /** Signed and never 0: 1, 2, … above its timeline's line, −1, −2, … below. */
  readonly level: number;
  /** The client ordinate of its timeline's line. */
  readonly line: number;
  /** The displayed elements it holds directly. */
  readonly elements: number;
  /** Where its rectangle lies on the screen. */
  readonly rect: ClientRectangle;
}

/** A band as the specs compare it: what the drawing decides, without where the screen shows it. */
export type BandRecord = Pick<HookBand, "address" | "kind" | "level" | "elements">;

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

export type FixtureName = "small" | "groups" | "bundles" | "grid-300" | "grid-900";

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

/** The ids of `groups`' blocks, one manifest of one group each, in the order they were added. */
export const GROUPS = {
  child: "gchild0000",
  grandchild: "ggrand0000",
  mixed: "gmixed0000",
  styled: "gstyled000",
} as const;

/** The ids of `bundles`' blocks, one named manifest each, in the order they were added. */
export const BUNDLES = {
  mixed: "bmixed0000",
  shared: "bshared000",
  ungrouped: "bungroup00",
} as const;

/** The block ids of `small` in index order. */
export const SMALL_ORDER = [SMALL.bare, SMALL.nested, SMALL.map, SMALL.flow, SMALL.styled];

/** The journal length right after a fixture is opened: one `add` per block. */
export const OPENED_JOURNAL = {
  small: 5,
  groups: 4,
  bundles: 3,
  "grid-300": 300,
  "grid-900": 900,
} as const;

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

/** Choose `label` in the File menu. */
export async function chooseItem(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: label }).click();
}

/** Choose `label` in the File menu and answer the file chooser with `name` holding `text`. */
export async function pick(page: Page, label: string, name: string, text: string): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await chooseItem(page, label);
  await (await chooser).setFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
}

/** A finished download's suggested file name and its text. */
export async function downloaded(download: Promise<Download>): Promise<[string, string]> {
  const done = await download;
  return [done.suggestedFilename(), readFileSync(await done.path(), "utf8")];
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

/** The ids of the nodes Svelte Flow shows as selected (class `selected`), sorted. */
export function selectedNodes(page: Page): Promise<string[]> {
  return page
    .locator(".svelte-flow__node.selected")
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-id") ?? "").sort());
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
 * The commands journalled from entry `from` on, each of which must be a
 * command entry (a closed editor's session entry throws). Only `set` and
 * `remove` commands are returned whole; an `add` carries a manifest whose
 * numbers do not survive the trip out of the page, so it is reduced to its
 * type.
 */
export function commandsFrom(page: Page, from: number): Promise<Command[]> {
  return page.evaluate(
    (start) =>
      window.__tilie
        .store()
        .journal.slice(start)
        .map((entry, at) => {
          if (!("command" in entry)) throw new Error(`journal entry ${start + at} is a session`);
          const { command } = entry;
          return command.type === "set" || command.type === "remove"
            ? (JSON.parse(JSON.stringify(command)) as Command)
            : ({ type: command.type } as Command);
        }),
    from,
  );
}

/** The open editors, outermost first, each as `{target, kind}`. */
export function editing(page: Page): Promise<{ target: string; kind: string }[]> {
  return page.evaluate(() =>
    window.__tilie.editing().map(({ target, kind }) => ({ target, kind })),
  );
}

/**
 * Open the editor of `address` through the hook, wait until the canvas has
 * moved away from the viewport it was opened at, and set the viewport to
 * `view`, so that pointer positions count from a known viewport.
 */
export async function enter(page: Page, address: string, view: Viewport): Promise<void> {
  const before = await viewportOf(page);
  const open = (await editing(page)).length;
  expect(await page.evaluate((target) => window.__tilie.open(target), address)).toBeNull();
  expect((await editing(page)).length).toBe(open + 1);
  await expect.poll(() => viewportOf(page)).not.toEqual(before);
  await setViewport(page, view);
}

/** The JSON text of a member of the store, read in the page (a `bigint` written as its digits). */
export function storeText(page: Page, member: "view" | "journal" | "sessions"): Promise<string> {
  return page.evaluate(
    (name) =>
      JSON.stringify(window.__tilie.store()[name], (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    member,
  );
}

/** How many entries the open editor's session holds; the journal's with no editor open. */
export function entriesLength(page: Page): Promise<number> {
  return page.evaluate(() => window.__tilie.store().entries.length);
}

/**
 * The command of the newest entry of the open editor's session (of the
 * journal with no editor open), as JSON; `null` when there is none or it is
 * a closed session.
 */
export function newestCommand(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const entry = window.__tilie.store().entries.at(-1);
    return entry === undefined || !("command" in entry)
      ? null
      : JSON.parse(JSON.stringify(entry.command));
  });
}

/** Dispatch `command` through the hook's store; its refusal or `null`. */
export function dispatch(page: Page, command: unknown): Promise<CommandError | null> {
  return page.evaluate((sent) => window.__tilie.store().dispatch(sent), command);
}

/**
 * The `graphical.order` of block `id`'s stored manifest, as JSON: the
 * groups' display orders and the timelines' band orders, `null` without one.
 */
export function graphicalOrder(page: Page, id: string): Promise<unknown> {
  return page.evaluate((block) => {
    const found = window.__tilie.store().view.blocks[block];
    if (found === undefined) throw new Error(`block ${block} is missing`);
    return JSON.parse(JSON.stringify(found.manifest.graphical?.order ?? null));
  }, id);
}

/** The arranger, the canvas's root element: focused, it takes the canvas's keys. */
export function arranger(page: Page): Locator {
  return page.locator('[role="application"][aria-label="Arranger"]');
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

/** The canvas point of screen point `(x, y)` under the current viewport, `toScreen` inverted. */
export async function toCanvas(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const box = await pane(page).boundingBox();
  if (box === null) throw new Error("the canvas is not displayed");
  const view = await viewportOf(page);
  return { x: (x - box.x - view.x) / view.zoom, y: (y - box.y - view.y) / view.zoom };
}

/**
 * A whole-pixel screen point on block `id`'s card, away from everything
 * drawn on it: the element hit there and at the eight points `clearance` px
 * around it is a card (`<root>/card`) of that block, found by hit-testing a
 * raster of points across the node (tenths down, twentieths across), and
 * when none of them is clear, every second pixel. A press there selects
 * that card; a drag from there moves the block.
 */
export function cardPoint(
  page: Page,
  id: string,
  clearance = 6,
): Promise<{ x: number; y: number }> {
  return boxPoint(page, id, null, clearance);
}

/**
 * A whole-pixel screen point on the drawn box `address` in block `id` (a
 * group's frame, by the group id, or a card, `<root>/card`), away from what
 * lies on it, found as `cardPoint` finds a card: the element hit there and
 * at the eight points `clearance` px around it carries `data-address`
 * `address`. A press there selects that box.
 */
export function framePoint(
  page: Page,
  id: string,
  address: string,
  clearance = 6,
): Promise<{ x: number; y: number }> {
  return boxPoint(page, id, address, clearance);
}

/** A point whose hit, there and `clearance` px around, is the box `address`, or any card for `null`. */
async function boxPoint(
  page: Page,
  id: string,
  address: string | null,
  clearance: number,
): Promise<{ x: number; y: number }> {
  const box = await node(page, id).boundingBox();
  if (box === null) throw new Error(`block ${id} is not displayed`);
  const found = await page.evaluate(
    ({ block, address, clearance, left, top, width, height }) => {
      // The box at a point and at the points `clearance` px around it, so neither
      // pixel rounding nor a finger's contact area reaches another drawn element.
      const inside = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        const at = hit?.closest("[data-address]")?.getAttribute("data-address");
        return (
          hit?.closest(".svelte-flow__node")?.getAttribute("data-id") === block &&
          at != null &&
          (address === null ? at.endsWith("/card") : at === address)
        );
      };
      const around = [-clearance, 0, clearance];
      const clear = (x: number, y: number) =>
        around.every((dx) => around.every((dy) => inside(x + dx, y + dy)));
      for (let fy = 0.1; fy < 1; fy += 0.1) {
        for (let fx = 0.05; fx < 1; fx += 0.05) {
          const x = Math.round(left + width * fx);
          const y = Math.round(top + height * fy);
          if (clear(x, y)) return { x, y };
        }
      }
      // A box clear only in a strip between the raster's rows or columns (a
      // frame's title row): every second pixel, rows from the top.
      for (let y = Math.ceil(top); y <= top + height; y += 2) {
        for (let x = Math.ceil(left); x <= left + width; x += 2) {
          if (clear(x, y)) return { x, y };
        }
      }
      return null;
    },
    {
      block: id,
      address,
      clearance,
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
    },
  );
  if (found === null) throw new Error(`block ${id} shows no point on ${address ?? "its card"}`);
  return found;
}

/**
 * A whole-pixel screen point on block `id`'s margin, the block's own
 * background outside every card: inside its node, on no drawn element and
 * with none at the eight points 1 px around it. The margin is `P` = 8 canvas
 * units wide, so the points are searched pixel by pixel, rows from the
 * node's vertical centre outwards, each from the left. A click there selects
 * the block.
 */
export async function marginPoint(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await node(page, id).boundingBox();
  if (box === null) throw new Error(`block ${id} is not displayed`);
  const found = await page.evaluate(
    ({ block, left, top, width, height }) => {
      const margin = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        return (
          hit?.closest(".svelte-flow__node")?.getAttribute("data-id") === block &&
          hit?.closest("[data-address]") === null
        );
      };
      const around = [-1, 0, 1];
      const x0 = Math.ceil(left) + 1;
      const x1 = Math.floor(left + width) - 2;
      const y0 = Math.ceil(top) + 1;
      const y1 = Math.floor(top + height) - 2;
      const centre = Math.round(top + height / 2);
      for (let step = 0; step <= y1 - y0 + 1; step += 1) {
        for (const y of step === 0 ? [centre] : [centre - step, centre + step]) {
          if (y < y0 || y > y1) continue;
          for (let x = x0; x <= x1; x += 1) {
            if (around.every((dx) => around.every((dy) => margin(x + dx, y + dy)))) {
              return { x, y };
            }
          }
        }
      }
      return null;
    },
    { block: id, left: box.x, top: box.y, width: box.width, height: box.height },
  );
  if (found === null) throw new Error(`block ${id} shows no point on its margin`);
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

/** Drag block `id` by `(dx, dy)` screen pixels from a point on its card (a drag from anywhere moves the block). */
export async function dragBlock(page: Page, id: string, dx: number, dy: number, steps = 10) {
  await nodeDragStart(page, await cardPoint(page, id), dx, dy, steps);
  await page.mouse.up();
}

/** Resolve after the browser has rendered two more frames. */
export function frames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
}

/** The bands of `timeline` drawn in block `block`, in the hook's order, as specs compare them. */
export function bandsOf(page: Page, block: string, timeline: string): Promise<BandRecord[]> {
  return page.evaluate(
    ({ id, of }) =>
      window.__tilie
        .bands(id)
        .filter((band) => band.timeline === of)
        .map(({ address, kind, level, elements }) => ({ address, kind, level, elements })),
    { id: block, of: timeline },
  );
}

/** Band `address` of block `block` as the hook reports it, its line and rectangle included. */
export async function bandOf(page: Page, block: string, address: string): Promise<HookBand> {
  const found = await page.evaluate(
    ({ id, wanted }) => window.__tilie.bands(id).find((band) => band.address === wanted) ?? null,
    { id: block, wanted: address },
  );
  if (found === null) throw new Error(`block ${block} draws no band ${address}`);
  return found;
}

/** The client ordinate of a band's middle: its position among its timeline's visible entries. */
export function middleOf(band: HookBand): number {
  return band.rect.y + band.rect.height / 2;
}

/** The band addresses of the band marks in block `id`'s node, sorted. */
export function bandMarks(page: Page, id: string): Promise<string[]> {
  return node(page, id)
    .locator("rect.tilie-band")
    .evaluateAll((marks) => marks.map((mark) => mark.getAttribute("data-band") ?? "").sort());
}

/**
 * Centre band `address` of block `block` in the pane at `zoom`, the
 * viewport's offset rounded to whole pixels, and wait until the canvas
 * reports it; the viewport set.
 */
export async function focusBand(
  page: Page,
  block: string,
  address: string,
  zoom: number,
): Promise<Viewport> {
  const { rect } = await bandOf(page, block, address);
  const centre = await toCanvas(page, rect.x + rect.width / 2, rect.y + rect.height / 2);
  const box = await pane(page).boundingBox();
  if (box === null) throw new Error("the canvas is not displayed");
  const view = {
    x: Math.round(box.width / 2 - centre.x * zoom),
    y: Math.round(box.height / 2 - centre.y * zoom),
    zoom,
  };
  await setViewport(page, view);
  return view;
}

/**
 * A whole-pixel screen point inside band `address` of block `block`, at
 * least `clearance` px inside its edges and inside the pane, where the
 * element hit there and at the eight points `clearance` px around it lies in
 * the block's node and carries no address but a card's: the block's
 * background, a card, or a part outside the edited element, which takes no
 * pointer. A press there meets no drawn element, so in the band's timeline
 * editor it hits the band. Rows are searched from the band's vertical
 * middle outwards, each pixel by pixel from the left.
 */
export async function bandPoint(
  page: Page,
  block: string,
  address: string,
  clearance: number,
): Promise<{ x: number; y: number }> {
  const { rect } = await bandOf(page, block, address);
  const box = await pane(page).boundingBox();
  if (box === null) throw new Error("the canvas is not displayed");
  const found = await page.evaluate(
    ({ id, clearance, left, top, right, bottom }) => {
      const empty = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        if (hit?.closest(".svelte-flow__node")?.getAttribute("data-id") !== id) return false;
        const at = hit.closest("[data-address]")?.getAttribute("data-address");
        return at == null || at.endsWith("/card");
      };
      const around = [-clearance, 0, clearance];
      const clear = (x: number, y: number) =>
        around.every((dx) => around.every((dy) => empty(x + dx, y + dy)));
      const x0 = Math.ceil(left + clearance);
      const x1 = Math.floor(right - clearance);
      const y0 = Math.ceil(top + clearance);
      const y1 = Math.floor(bottom - clearance);
      const middle = Math.min(y1, Math.max(y0, Math.round((top + bottom) / 2)));
      for (let step = 0; step <= y1 - y0; step += 1) {
        for (const y of step === 0 ? [middle] : [middle - step, middle + step]) {
          if (y < y0 || y > y1) continue;
          for (let x = x0; x <= x1; x += 1) if (clear(x, y)) return { x, y };
        }
      }
      return null;
    },
    {
      id: block,
      clearance,
      left: Math.max(rect.x, box.x),
      top: Math.max(rect.y, box.y),
      right: Math.min(rect.x + rect.width, box.x + box.width),
      bottom: Math.min(rect.y + rect.height, box.y + box.height),
    },
  );
  if (found === null) throw new Error(`band ${address} of ${block} shows no empty point`);
  return found;
}

/**
 * The middle of the client ordinates from `above` to `below`, where a drop
 * must land; throws when the interval is empty, so a release is never aimed
 * at nothing.
 */
export function between(above: number, below: number): number {
  if (!(above < below)) throw new Error(`no room between ${above} and ${below}`);
  return (above + below) / 2;
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
