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
import type { FlowServer } from "../src/flowEditor.svelte.ts";
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

/** The harness's exports, which `tsc` reads through Svelte's generic module declaration, untyped. */
interface Mounted {
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

  it("places a row dragged out past the editor's border as a card, and flies one back inside", async () => {
    await show();
    // The viewport at the identity: a client point is a canvas point.
    harness().showAt({ x: 0, y: 0, zoom: 1 });
    await settle();
    placeOnScreen(one('[data-testid="flow-pane"]'), { left: 0, top: 200, right: 800, bottom: 600 });
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

    const virtualBefore = (manifest().virtual_timelines ?? []).map((item) => item.id);
    pointer(name, "pointerdown", 100, 300);
    pointer(name, "pointermove", 900, 340);
    pointer(name, "pointerup", 900, 340);
    await settle();
    expect(store.entries.length).toBe(mark + 2);
    const [V] = (manifest().virtual_timelines ?? [])
      .map((item) => item.id)
      .filter((id) => !virtualBefore.includes(id));
    if (V === undefined) throw new Error("no virtual timeline written");
    // The twin's top left (900 − 100, 340 − 300) less the block's (40, 80), on the grid's 8.
    expect(blockIn(store.view, A).places[V]).toEqual({ x: 760, y: -40 });
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
