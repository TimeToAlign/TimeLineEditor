// @vitest-environment jsdom
/**
 * The flow editor's pane on the canvas: its rows, its controls, a key and
 * the drags that land, fly back or are ended by Escape. The expected values
 * are derived in `README.md` ("The flow subeditor", "The pane on the
 * canvas").
 */

import type { Manifest, Store } from "@timetoalign/tilie-core";
import { idAddress, inBlock } from "@timetoalign/tilie-core";
import type { Viewport } from "@xyflow/svelte";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawingOf } from "../src/drawing.ts";
import type { FlowServer } from "../src/flowEditor.svelte.ts";
import { flowRows } from "../src/flowEditor.ts";
import type { FlowPane } from "../src/flowEditorRows.ts";
import { flowPaneOf, ROW_HEAD, rowPlace } from "../src/flowEditorRows.ts";
import { GRID_FREE, quantize } from "../src/numbers.ts";
import { type Selection, selectionOf } from "../src/selection.ts";
import Harness from "./CanvasHarness.svelte";
import { pointer, pressEscape, settle, stubCanvasGlobals, withScreenMatrix } from "./dom.ts";
import { A, blockIn, metrics, storeOf, viewOf } from "./support.ts";

const ROOT = "allegro";
const allegro = inBlock(A, idAddress(ROOT));

let mounted: ReturnType<typeof mount> | undefined;
let store: Store;
let refused: string[] = [];

beforeEach(() => {
  stubCanvasGlobals(() => true);
});

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The canvas on a store holding `flow/virtual_cards` at (40, 80), `allegro`'s flow editor open. */
async function show(): Promise<void> {
  store = storeOf(viewOf({ id: A, fixture: "flow/virtual_cards", x: 40, y: 80 }));
  refused = [];
  mounted = mount(Harness, {
    target: document.body,
    props: { store, metrics, onrefuse: (text: string) => refused.push(text) },
  });
  await settle();
  const refusal = store.open(allegro, "flow");
  if (refusal !== null) throw new Error(refusal.message);
  flushSync();
  await settle();
}

const manifest = (): Manifest => blockIn(store.view, A).manifest;

/** The pane of `allegro`'s flow editor as the canvas draws it from the store now. */
function paneNow(): FlowPane {
  const block = blockIn(store.view, A);
  const drawing = drawingOf(block, store.view.graphical, metrics);
  const pane = flowPaneOf(
    block,
    drawing,
    store.view.graphical,
    metrics,
    ROOT,
    flowRows(block.manifest, ROOT),
  );
  if (pane === null) throw new Error("no pane");
  return pane;
}

/** Where "Place as card" puts the card of the row `id`: `rowPlace` less the drawing's origin. */
function placeOfRow(id: string): { x: number; y: number } {
  const pane = paneNow();
  const at = rowPlace(pane, pane.rows, id);
  if (at === null) throw new Error(`no row ${id}`);
  const { origin } = drawingOf(blockIn(store.view, A), store.view.graphical, metrics);
  return { x: quantize(at.x - origin.x, GRID_FREE), y: quantize(at.y - origin.y, GRID_FREE) };
}

/** The virtual timelines `allegro`'s block gained over `before`. */
function virtualAdded(before: readonly string[]): string[] {
  return (manifest().virtual_timelines ?? [])
    .map((item) => item.id)
    .filter((id) => !before.includes(id));
}

/** The chunks of the FlowMap `id` as stored. */
const chunksOf = (id: string) => manifest().flow_maps?.find((item) => item.id === id)?.chunks;

/** The harness's exports, which `tsc` reads through Svelte's generic module declaration, untyped. */
interface Mounted {
  current(): { viewport: Viewport };
  showAt(next: Viewport): void;
  select(next: Selection): void;
}

function harness(): Mounted {
  if (mounted === undefined) throw new Error("nothing mounted");
  return mounted as Mounted;
}

function one(selector: string, within: ParentNode = document): HTMLElement {
  const found = within.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`nothing at ${selector}`);
  return found;
}

function button(text: string, within: ParentNode = document): HTMLButtonElement {
  const found = [...within.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  if (found === undefined) throw new Error(`no button ${text}`);
  return found;
}

/** Give `element` the screen rectangle `rect`, which jsdom does not lay out. */
function placeOnScreen(
  element: Element,
  rect: { left: number; top: number; right: number; bottom: number },
): void {
  Object.assign(element, {
    getBoundingClientRect: () => ({
      ...rect,
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      toJSON() {},
    }),
  });
}

/** The line of `allegro` drawn in block A's node, its drawing read at the identity matrix. */
function rootLine(): Element {
  const node = one('.svelte-flow__node[data-id="0000000000"]');
  const line = [...node.querySelectorAll('svg [data-id="allegro"]')].find(
    (element) =>
      element.getAttribute("data-facet") === null && element.getAttribute("data-part") === null,
  );
  if (line === undefined) throw new Error("no line of allegro");
  const svg = line.closest("svg");
  if (svg !== null) withScreenMatrix(svg, () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }));
  return line;
}

/** The FlowMaps of the rows shown, in the pane's order. */
function rowOrder(): (string | null)[] {
  return [...document.querySelectorAll('[data-testid="flow-row"]')].map((row) =>
    row.getAttribute("data-flow-map"),
  );
}

/** The row of the FlowMap `id`. */
const rowOf = (id: string): HTMLElement => one(`[data-testid="flow-row"][data-flow-map="${id}"]`);

/** Press `key` on `element`. */
function press(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Type `text` into the gap's input inside `within` and press Enter. */
function typeGap(within: ParentNode, text: string): void {
  const input = one('[data-testid="flow-gap"]', within) as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  press(input, "Enter");
}

/** The new FlowMap's ID: the one `allegro` gained over `before`. */
function addedFlowMap(before: readonly string[]): string {
  const [added] = (manifest().flow_maps ?? [])
    .map((item) => item.id)
    .filter((id) => !before.includes(id));
  if (added === undefined) throw new Error("no FlowMap added");
  return added;
}

/** The pane and the new row given screen rectangles: the pane from y 200 to 600, the new row from 500. */
function layOut(): void {
  placeOnScreen(one('[data-testid="flow-pane"]'), { left: 0, top: 200, right: 800, bottom: 600 });
  placeOnScreen(one(".row.draft"), { left: 0, top: 500, right: 800, bottom: 600 });
}

describe("the flow editor's pane", () => {
  it("shows the rows, the head and, without a server, Recompute disabled with its reason", async () => {
    await show();
    const rows = [...document.querySelectorAll('[data-testid="flow-row"]')];
    expect(rows.map((row) => row.getAttribute("data-flow-map"))).toEqual([
      "default",
      "printed",
      "single",
      "by_hand",
    ]);
    expect(button("Recompute").disabled).toBe(true);
    expect(one('[data-testid="flow-pane"]').textContent).toContain("Recomputing needs a server");
    expect(document.querySelector('[data-testid="flow-draft"]')).toBeNull();
    button("Add +").click();
    await settle();
    const draft = one('[data-testid="flow-draft"]');
    expect(button("Done", draft)).toBeDefined();
    expect(button("Cancel", draft)).toBeDefined();
  });

  it("lands an entry with Enter, and Cancel undoes it", async () => {
    await show();
    const mark = store.entries.length;
    const before = (manifest().flow_maps ?? []).map((item) => item.id);
    button("Add +").click();
    await settle();
    const entry = one('[data-flow-map="default"] [data-testid="flow-entry"][data-index="0"]');
    entry.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await settle();
    expect(store.entries.length).toBe(mark + 1);
    const added = (manifest().flow_maps ?? []).filter((item) => !before.includes(item.id));
    expect(added.map((item) => item.chunks)).toEqual([["section_a"]]);
    button("Cancel", one(".row.draft")).click();
    await settle();
    expect(store.entries.length).toBe(mark);
    expect((manifest().flow_maps ?? []).map((item) => item.id)).toEqual([
      "by_hand",
      "default",
      "printed",
      "single",
    ]);
  });

  it("flies a twin back from inside the pane, writing nothing, and lands it on the new row", async () => {
    await show();
    button("Add +").click();
    await settle();
    layOut();
    const mark = store.entries.length;
    const regionsBefore = (manifest().timelines[0]?.regions ?? []).map((item) => item.id);
    const line = rootLine();
    pointer(line, "pointerdown", 100, 100);
    pointer(line, "pointermove", 120, 300);
    expect(document.querySelector('[data-testid="flow-twin"]')).not.toBeNull();
    pointer(line, "pointerup", 120, 300);
    await settle();
    expect(store.entries.length).toBe(mark);
    expect(document.querySelector('[data-testid="flow-twin"]')).toBeNull();

    pointer(line, "pointerdown", 100, 100);
    pointer(line, "pointermove", 120, 550);
    pointer(line, "pointerup", 120, 550);
    await settle();
    expect(store.entries.length).toBe(mark + 2);
    const regions = (manifest().timelines[0]?.regions ?? []).filter(
      (item) => !regionsBefore.includes(item.id),
    );
    expect(regions.map((item) => [item.start, item.end])).toEqual([
      [
        [0, 1],
        [1644, 1],
      ],
    ]);
    const draft = (manifest().flow_maps ?? []).filter((item) =>
      item.chunks.some((entry) => entry === regions[0]?.id),
    );
    expect(draft.map((item) => item.chunks)).toEqual([[regions[0]?.id]]);
  });

  it("places a row once its twin's middle, not the pointer, is past the editor's border", async () => {
    await show();
    // The viewport at the identity: a client point is a canvas point.
    harness().showAt({ x: 0, y: 0, zoom: 1 });
    await settle();
    placeOnScreen(one('[data-testid="flow-pane"]'), { left: 0, top: 200, right: 800, bottom: 600 });
    const row = paneNow().rows.find((item) => item.row.id === "printed");
    if (row === undefined) throw new Error("no row printed");
    // The row's drawing on screen from (0, 280): the twin lifted from there, its middle inside.
    const svg = rowOf("printed").querySelector("svg");
    if (svg === null) throw new Error("no drawing of printed");
    placeOnScreen(svg, { left: 0, top: 280, right: 800, bottom: 280 + row.viewBox.height });
    const mark = store.entries.length;
    const name = one('[data-flow-map="printed"] .name');
    pointer(name, "pointerdown", 100, 300);
    pointer(name, "pointermove", 140, 320);
    pointer(name, "pointerup", 140, 320);
    await settle();
    expect(store.entries.length).toBe(mark);

    // Out past the border and back inside before the release: the release decides.
    pointer(name, "pointerdown", 100, 300);
    pointer(name, "pointermove", 900, 340);
    pointer(name, "pointermove", 140, 320);
    pointer(name, "pointerup", 140, 320);
    await settle();
    expect(store.entries.length).toBe(mark);

    // The pointer past the pane's left border, the twin's middle still inside: back.
    pointer(name, "pointerdown", 100, 300);
    pointer(name, "pointermove", -20, 300);
    pointer(name, "pointerup", -20, 300);
    await settle();
    expect(store.entries.length).toBe(mark);

    // The pointer still inside the pane, the twin's middle past its right border: placed.
    const before = (manifest().virtual_timelines ?? []).map((item) => item.id);
    pointer(name, "pointerdown", 100, 300);
    pointer(name, "pointermove", 700, 300);
    pointer(name, "pointerup", 700, 300);
    await settle();
    expect(store.entries.length).toBe(mark + 1);
    const [V] = virtualAdded(before);
    if (V === undefined) throw new Error("no virtual timeline written");
    // The twin's top left (700 − 100, 300 − 20) less the block's (40, 80), on the grid's 8.
    expect(blockIn(store.view, A).places[V]).toEqual({ x: 560, y: 200 });

    pointer(name, "pointerdown", 100, 300);
    pointer(name, "pointermove", 900, 340);
    pointer(name, "pointerup", 900, 340);
    await settle();
    expect(store.entries.length).toBe(mark + 2);
    // The twin's top left (900 − 100, 340 − 20) less the block's (40, 80), on the grid's 8.
    expect(blockIn(store.view, A).places[V]).toEqual({ x: 760, y: 240 });
  });

  it("places each row's card at the height of its row, one under another", async () => {
    await show();
    const before = (manifest().virtual_timelines ?? []).map((item) => item.id);
    const printed = placeOfRow("printed");
    const mark = store.entries.length;
    button("Place as card", rowOf("printed")).click();
    await settle();
    expect(store.entries.length).toBe(mark + 1);
    const [V] = virtualAdded(before);
    if (V === undefined) throw new Error("no virtual timeline written");
    expect(blockIn(store.view, A).places[V]).toEqual(printed);
    const single = placeOfRow("single");
    button("Place as card", rowOf("single")).click();
    await settle();
    expect(store.entries.length).toBe(mark + 2);
    expect(blockIn(store.view, A).places.allegro_single).toEqual(single);
    expect([printed.x, single.x]).toEqual([56, 56]);
    const row = paneNow().rows.find((item) => item.row.id === "printed");
    expect(single.y).toBe(quantize(printed.y + ROW_HEAD + (row?.viewBox.height ?? 0), GRID_FREE));
    store.done();
    await settle();
    expect(blockIn(store.view, A).places[V]).toEqual(printed);
    expect(blockIn(store.view, A).places.allegro_single).toEqual(single);
  });

  it("edits a hand-made row through its Edit button, computed rows having none", async () => {
    await show();
    const row = (id: string) => one(`[data-testid="flow-row"][data-flow-map="${id}"]`);
    const edit = (within: ParentNode) =>
      [...within.querySelectorAll("button")].filter((item) => item.textContent?.trim() === "Edit");
    expect(["default", "printed", "single"].flatMap((id) => edit(row(id)))).toEqual([]);
    const [editing] = edit(row("by_hand"));
    if (editing === undefined) throw new Error("no Edit button on by_hand");
    editing.click();
    await settle();
    expect(row("by_hand").classList.contains("draft")).toBe(true);
    expect(button("Done", row("by_hand"))).toBeDefined();
    expect(button("Cancel", row("by_hand"))).toBeDefined();
    expect(edit(document)).toEqual([]);
  });

  it("writes nothing for a drag ended by Escape", async () => {
    await show();
    button("Add +").click();
    await settle();
    layOut();
    const mark = store.entries.length;
    const line = rootLine();
    pointer(line, "pointerdown", 100, 100);
    pointer(line, "pointermove", 120, 550);
    pressEscape();
    pointer(line, "pointerup", 120, 550);
    await settle();
    expect(store.entries.length).toBe(mark);
    expect(refused).toEqual([]);
  });

  it("keeps its rows' order while open: a new row last, renamed rows in place", async () => {
    await show();
    expect(document.querySelector('[data-testid="flow-pane"] select')).toBeNull();
    const before = (manifest().flow_maps ?? []).map((item) => item.id);
    button("Add +").click();
    await settle();
    press(one('[data-flow-map="default"] [data-testid="flow-entry"][data-index="0"]'), "Enter");
    await settle();
    const F = addedFlowMap(before);
    expect(rowOrder()).toEqual(["default", "printed", "single", "by_hand", F]);
    expect(document.querySelector('[data-testid="flow-draft"]')).toBeNull();
    const refusal = store.dispatch({
      type: "set",
      changes: [
        { target: inBlock(A, idAddress(F)), values: { name: "Aaa" } },
        { target: inBlock(A, idAddress("by_hand")), values: { name: "Zzz" } },
      ],
    });
    expect(refusal).toBeNull();
    await settle();
    press(one('[data-flow-map="printed"] [data-testid="flow-entry"][data-index="0"]'), "Enter");
    await settle();
    expect(rowOrder()).toEqual(["default", "printed", "single", "by_hand", F]);
    button("Done", rowOf(F)).click();
    await settle();
    store.done();
    await settle();
    expect(store.open(allegro, "flow")).toBeNull();
    flushSync();
    await settle();
    expect(rowOrder()).toEqual(["default", "printed", "single", F, "by_hand"]);
  });

  it("adds a gap at once on + Gap, selected, its length then typed in its row", async () => {
    await show();
    const before = (manifest().flow_maps ?? []).map((item) => item.id);
    button("Add +").click();
    await settle();
    const opened = store.entries.length;
    button("+ Gap", one('[data-testid="flow-draft"]')).click();
    await settle();
    expect(store.entries.length).toBe(opened + 1);
    const F = addedFlowMap(before);
    expect(chunksOf(F)).toEqual([{ gap: [1644, 1] }]);
    const input = one('[data-testid="flow-gap"]', rowOf(F)) as HTMLInputElement;
    expect(input.value).toBe("1644");
    expect(document.activeElement).toBe(input);
    const selected = () =>
      [...rowOf(F).querySelectorAll('[data-testid="flow-entry"].selected')].map((item) =>
        item.getAttribute("data-index"),
      );
    expect(selected()).toEqual(["0"]);
    typeGap(rowOf(F), "4");
    await settle();
    expect(store.entries.length).toBe(opened + 2);
    expect(chunksOf(F)).toEqual([{ gap: [4, 1] }]);
    expect(document.querySelector('[data-testid="flow-gap"]')).toBeNull();
    button("+ Gap", rowOf(F)).click();
    await settle();
    expect(store.entries.length).toBe(opened + 3);
    expect(chunksOf(F)).toEqual([{ gap: [4, 1] }, { gap: [4, 1] }]);
    expect((one('[data-testid="flow-gap"]', rowOf(F)) as HTMLInputElement).value).toBe("4");
    expect(selected()).toEqual(["1"]);
    press(one('[data-testid="flow-gap"]'), "Escape");
    await settle();
    expect(document.querySelector('[data-testid="flow-gap"]')).toBeNull();
    expect(store.entries.length).toBe(opened + 3);
    button("Done", rowOf(F)).click();
    await settle();

    button("Edit", rowOf("by_hand")).click();
    await settle();
    const edited = store.entries.length;
    button("+ Gap", rowOf("by_hand")).click();
    await settle();
    expect(store.entries.length).toBe(edited + 1);
    expect(chunksOf("by_hand")?.[6]).toEqual({ gap: [1144, 1] });
    expect((one('[data-testid="flow-gap"]', rowOf("by_hand")) as HTMLInputElement).value).toBe(
      "1144",
    );
    // A drag swallows the browser's click after it until the next task: let any go first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    one('[data-testid="flow-entry"][data-index="4"]', rowOf("by_hand")).dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    await settle();
    expect((one('[data-testid="flow-gap"]', rowOf("by_hand")) as HTMLInputElement).value).toBe("4");
    const mark = store.entries.length;
    typeGap(rowOf("by_hand"), "8");
    await settle();
    expect(store.entries.length).toBe(mark + 1);
    expect(chunksOf("by_hand")?.[4]).toEqual({ gap: [8, 1] });
    expect(document.querySelector('[data-testid="flow-gap"]')).toBeNull();
  });

  it("changes a gap's length by the handle at its right end, in one change per drag", async () => {
    await show();
    harness().showAt({ x: 0, y: 0, zoom: 1 });
    await settle();
    const handles = () => [...document.querySelectorAll('[data-testid="flow-gap-handle"]')];
    expect(handles()).toEqual([]);
    button("Edit", rowOf("by_hand")).click();
    await settle();
    expect(handles().map((item) => item.getAttribute("data-index"))).toEqual(["4"]);
    expect(handles().every((item) => rowOf("by_hand").contains(item))).toBe(true);
    const handle = one('[data-testid="flow-gap-handle"]', rowOf("by_hand"));
    const mark = store.entries.length;
    pointer(handle, "pointerdown", 300, 300);
    pointer(handle, "pointermove", 340, 300);
    await settle();
    expect(one('[data-testid="flow-gap-flag"]').textContent).toBe("gap 168");
    expect(store.entries.length).toBe(mark);
    pointer(handle, "pointerup", 340, 300);
    await settle();
    expect(store.entries.length).toBe(mark + 1);
    expect(chunksOf("by_hand")).toEqual([
      "section_a",
      "section_a",
      "section_a",
      "section_a",
      { gap: [168, 1] },
      "section_c",
    ]);
    expect(document.querySelector('[data-testid="flow-gap-flag"]')).toBeNull();

    const again = one('[data-testid="flow-gap-handle"]', rowOf("by_hand"));
    pointer(again, "pointerdown", 300, 300);
    pointer(again, "pointermove", 360, 300);
    pressEscape();
    pointer(again, "pointerup", 360, 300);
    await settle();
    expect(store.entries.length).toBe(mark + 1);
    expect(document.querySelector('[data-testid="flow-gap-flag"]')).toBeNull();
  });

  it("pans the canvas on a plain and a Shift wheel over the rows, and zooms it on Ctrl+wheel", async () => {
    await show();
    harness().showAt({ x: 0, y: 0, zoom: 1 });
    await settle();
    const drawing = one(".drawing", rowOf("default"));
    drawing.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40 }));
    await settle();
    expect(harness().current().viewport).toEqual({ x: 0, y: -20, zoom: 1 });
    drawing.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 40, shiftKey: true }),
    );
    await settle();
    expect(harness().current().viewport).toEqual({ x: -20, y: -20, zoom: 1 });
    drawing.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true }),
    );
    await settle();
    expect(harness().current().viewport.zoom).toBe(2 ** 0.2);
  });

  it("asks the findings once, when the flow editor opens, and reads them after", async () => {
    store = storeOf(viewOf({ id: A, fixture: "flow/virtual_cards", x: 40, y: 80 }));
    let asked = 0;
    const flows: FlowServer = {
      withFlowMaps: async (manifest) => manifest,
      findings: async () => {
        asked += 1;
        return new Map([["default", ["one"]]]);
      },
    };
    mounted = mount(Harness, { target: document.body, props: { store, metrics, flows } });
    await settle();
    // Enter on the selected repeat sign, an element the flow control band draws, opens the flow editor.
    harness().select(selectionOf([{ block: A, id: "repeat_end", part: ["symbol"] }]));
    await settle();
    one('[aria-label="Arranger"]').dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await settle();
    expect(store.editing.map(({ target, kind }) => ({ target, kind }))).toEqual([
      { target: allegro, kind: "flow" },
    ]);
    expect(asked).toBe(1);
    expect(one('[data-flow-map="default"] [data-chip="findings"]').textContent).toBe("1 finding");
    button("Add +").click();
    await settle();
    const entry = one('[data-flow-map="default"] [data-testid="flow-entry"][data-index="0"]');
    entry.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await settle();
    expect(asked).toBe(1);
    expect(one('[data-flow-map="default"] [data-chip="findings"]').textContent).toBe("1 finding");
  });
});
