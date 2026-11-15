// @vitest-environment jsdom
/**
 * Show coordinates on the canvas: the wedge and the cross-section line of
 * the hovered and the pinned position, what a click pins, what turning it
 * off clears, how a named timestamp is selected in either mode, and the
 * zoom's range. Derived in `README.md` ("The coordinate marks and the mode
 * split").
 */

import type { Address, Manifest, MeasureKnots, Pin, Store, View } from "@timetoalign/tilie-core";
import {
  DEFAULT_GRANULARITY,
  idAddress,
  inBlock,
  partAddress,
  pinAt,
  timestampAt,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import { crossSection, wedgeAt } from "@timetoalign/tilie-layout";
import { attributeText } from "@timetoalign/tilie-writers";
import type { Viewport } from "@xyflow/svelte";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KnotsOf } from "../src/coordinates.ts";
import { axesOf, namedPin, readingAt } from "../src/coordinates.ts";
import { drawingOf } from "../src/drawing.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED, type Selection, selectionOf } from "../src/selection.ts";
import Harness from "./CanvasHarness.svelte";
import { settle, stubCanvasGlobals } from "./dom.ts";
import { A, blockIn, changed, metrics, storeOf, viewOf } from "./support.ts";

interface Mounted {
  current(): { selection: Selection; viewport: Viewport };
  select(next: Selection): void;
  showAt(next: Viewport): void;
  pin(next: Pin | null): void;
  knotsOf(manifest: Manifest): ReturnType<KnotsOf>;
  readKnots(manifest: Manifest): void;
  read(): ReturnType<KnotsOf>;
}

type MeasureMaps = (manifest: string) => Promise<readonly MeasureKnots[] | "unsupported">;

/** `melody`'s line in `map` and the abscissas of 4 and 2 quarters on it (50 units a quarter). */
const MELODY_Y = 40.5;
const AT_4 = 263.53662109375;
const AT_2 = 163.53662109375;
const VIEW: Viewport = { x: 0, y: 0, zoom: 1 };

/** Block A holding `map` at (40, 80). */
const mapView = (): View => viewOf({ id: A, fixture: "map", x: 40, y: 80 });

/** `map` with the named timestamp `timestamp_1` ("Four") at 4 quarters on `melody`. */
const namedView = (): View =>
  changed(mapView(), {
    type: "add",
    into: inBlock(A, idAddress("melody")),
    timestamp: { name: "Four", coordinate: [4, 1] },
  });

let mounted: ReturnType<typeof mount> | undefined;
let harness: Mounted;
let store: Store;
let pins: (Pin | null)[];

beforeEach(() => {
  stubCanvasGlobals();
  pins = [];
});

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function show(view: View, measureMaps?: MeasureMaps): Promise<void> {
  store = storeOf(view);
  const instance = mount(Harness, {
    target: document.body,
    props: {
      store,
      metrics,
      oncoordinatepin: (pin: Pin | null) => pins.push(pin),
      ...(measureMaps === undefined ? {} : { measureMaps }),
    },
  });
  mounted = instance;
  // `tsc` reads the harness through Svelte's generic module declaration, which leaves its exports untyped.
  harness = instance as Mounted;
  await settle();
  harness.showAt(VIEW);
  await settle();
}

function arranger(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[aria-label="Arranger"]');
  if (found === null) throw new Error("no arranger");
  return found;
}

function one(selector: string, root: ParentNode = document): Element {
  const found = root.querySelector(selector);
  if (found === null) throw new Error(`nothing matches ${selector}`);
  return found;
}

/** The drawing of block A in the store's view, and its node's top-left corner on the canvas. */
function shown(): { drawing: Drawing; x: number; y: number } {
  const { view } = store;
  const [node] = project(view, NOTHING_SELECTED, [], metrics, null);
  if (node === undefined) throw new Error("no node");
  return { drawing: drawingOf(blockIn(view, A), view.graphical, metrics), ...node.position };
}

/** The key of `melody`'s line in block A's drawing (layout's `lineAxes`). */
function melodyKey(drawing: Drawing): string {
  const found = [...axesOf(drawing)].find(([, axis]) => axis.timeline === "melody");
  if (found === undefined) throw new Error("no line of melody");
  return found[0];
}

/** The client point of block A's drawing point `(x, y)` at `VIEW` (jsdom puts the canvas at 0, 0). */
function client(x: number, y: number): { clientX: number; clientY: number } {
  const node = shown();
  return { clientX: node.x + x, clientY: node.y + y };
}

function pointerOn(target: EventTarget, type: string, at: { clientX: number; clientY: number }) {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 0,
      bubbles: true,
      cancelable: true,
      ...at,
    }),
  );
}

/** Move the pointer to `at` and let the frame that reads it run. */
async function hoverAt(at: { clientX: number; clientY: number }): Promise<void> {
  pointerOn(arranger(), "pointermove", at);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await settle();
}

/** A press released where it began, on the arranger. */
async function clickAt(at: { clientX: number; clientY: number }): Promise<void> {
  pointerOn(arranger(), "pointerdown", at);
  pointerOn(arranger(), "pointerup", at);
  await settle();
}

async function toggleCoordinates(): Promise<void> {
  one('[data-testid="coordinates"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await settle();
}

/** The attributes of `element` named in `names`, absent ones `null`. */
function attributes(element: Element, names: readonly string[]): Record<string, string | null> {
  return Object.fromEntries(names.map((name) => [name, element.getAttribute(name)]));
}

const LINE = ["x1", "y1", "x2", "y2", "stroke", "stroke-width", "stroke-dasharray", "opacity"];
const WEDGE = ["points", "fill", "opacity"];

/** The attributes the marks of `kind` must carry: layout's wedge and line at `x` on `key`. */
function expectedMarks(drawing: Drawing, key: string, x: number) {
  const wedge = wedgeAt(drawing, key, x);
  const line = crossSection(drawing, key, x);
  if (wedge === null || line === null) throw new Error("melody's line draws no marks");
  return {
    wedge: { points: attributeText(wedge.points), fill: wedge.style.fill, opacity: null },
    line: {
      x1: attributeText(x),
      y1: attributeText(line.y1),
      x2: attributeText(x),
      y2: attributeText(line.y2),
      stroke: line.style.stroke,
      "stroke-width": attributeText(line.style["stroke-width"]),
      "stroke-dasharray": line.style["stroke-dasharray"],
      opacity: null,
    },
  };
}

/** The marks drawn for `kind` (`hover` or `pin`), as attributes; `null` when none are. */
function marks(kind: "hover" | "pin") {
  const svg = document.querySelector(`.tilie-coordinate-marks[data-mark="${kind}"]`);
  if (svg === null) return null;
  return {
    wedge: attributes(one('[data-testid="coordinate-wedge"]', svg), WEDGE),
    line: attributes(one('[data-testid="coordinate-line"]', svg), LINE),
  };
}

/** The pin `readingAt` makes on `melody` at its abscissa `x`, unnamed. */
function pinOnMelody(x: number): Pin {
  const reading = readingAt(
    project(store.view, NOTHING_SELECTED, [], metrics, null),
    { x: shown().x + x, y: shown().y + MELODY_Y },
    { zoom: 1, ratio: 1, granularity: DEFAULT_GRANULARITY },
  );
  if (reading === null) throw new Error("melody is not read there");
  return reading.pin;
}

describe("the hovered position", () => {
  it("is marked with layout's wedge and cross-section line, in the drawing's units over the node", async () => {
    await show(mapView());
    await toggleCoordinates();
    await hoverAt(client(AT_4, MELODY_Y));
    const { drawing, x, y } = shown();
    expect(marks("hover")).toEqual(expectedMarks(drawing, melodyKey(drawing), AT_4));
    const svg = one('.tilie-coordinate-marks[data-mark="hover"]');
    const node = one(".svelte-flow__node[data-id] svg");
    expect(attributes(svg, ["width", "height", "viewBox"])).toEqual(
      attributes(node, ["width", "height", "viewBox"]),
    );
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${drawing.width} ${drawing.height}`);
    expect([(svg as SVGElement).style.left, (svg as SVGElement).style.top]).toEqual([
      `${x}px`,
      `${y}px`,
    ]);
    expect(marks("pin")).toBeNull();
  });

  it("is marked exactly as a named timestamp there is drawn", async () => {
    await show(namedView());
    await toggleCoordinates();
    await hoverAt(client(AT_4, MELODY_Y));
    const node = one(".svelte-flow__node[data-id] svg");
    const wedge = one('polygon[data-id="timestamp_1"]:not([data-part])', node);
    const line = one('line[data-id="timestamp_1"][data-part="line"]', node);
    expect(marks("hover")).toEqual({
      wedge: attributes(wedge, WEDGE),
      line: attributes(line, LINE),
    });
  });

  it("is not marked with Show coordinates off", async () => {
    await show(mapView());
    await hoverAt(client(AT_4, MELODY_Y));
    expect(marks("hover")).toBeNull();
    expect(document.querySelector('[data-testid="coordinate-flag"]')).toBeNull();
  });
});

describe("the pinned timestamp", () => {
  it("is marked at its position and follows a replaced pin; a named one or none is not", async () => {
    await show(mapView());
    const pin = pinOnMelody(AT_4);
    harness.pin(pin);
    await settle();
    const { drawing } = shown();
    const key = melodyKey(drawing);
    expect(marks("pin")).toEqual(expectedMarks(drawing, key, AT_4));

    harness.pin(pinAt(pin, Rational.of([2, 1])));
    await settle();
    expect(marks("pin")).toEqual(expectedMarks(drawing, key, AT_2));

    harness.pin({ ...pin, named: "timestamp_1" });
    await settle();
    expect(marks("pin")).toBeNull();

    harness.pin(null);
    await settle();
    expect(marks("pin")).toBeNull();
  });
});

describe("pinning", () => {
  it("pins on a line, clears elsewhere, and clears when Show coordinates is turned off", async () => {
    await show(mapView());
    await toggleCoordinates();
    await clickAt(client(AT_4, MELODY_Y));
    expect(pins).toHaveLength(1);
    const [pin] = pins;
    expect(pin?.named).toBeNull();
    expect(pin?.spec.line.timeline).toBe("melody");
    expect(pin?.timestamp.parts[0]?.position).toEqual(Rational.of([4, 1]));

    await clickAt(client(AT_4, MELODY_Y + 30));
    expect(pins.slice(1)).toEqual([null]);

    await toggleCoordinates();
    expect(pins.slice(2)).toEqual([null]);

    await clickAt(client(AT_4, MELODY_Y));
    expect(pins).toHaveLength(3);
  });
});

describe("the mode split", () => {
  const timestamp: Address = inBlock(A, idAddress("timestamp_1"));

  /** The drawn elements of block A letting the pointer through, as `[tag, data-id, data-part]`. */
  function passing(): (string | null)[][] {
    const node = one(".svelte-flow__node[data-id] svg");
    return [...node.querySelectorAll('[pointer-events="none"]')].map((element) => [
      element.tagName,
      element.getAttribute("data-id"),
      element.getAttribute("data-part"),
    ]);
  }

  /** The drawn elements of `timestamp_1` that show the selection, as `data-part`. */
  function glowing(): (string | null)[] {
    const node = one(".svelte-flow__node[data-id] svg");
    return [...node.querySelectorAll('[data-id="timestamp_1"][data-selected]')].map((element) =>
      element.getAttribute("data-part"),
    );
  }

  it("lets the pointer through a named timestamp only while Show coordinates is on", async () => {
    await show(namedView());
    expect(passing()).toEqual([]);
    await toggleCoordinates();
    expect(passing()).toEqual([
      ["polygon", "timestamp_1", null],
      ["text", "timestamp_1", "label"],
      ["line", "timestamp_1", "line"],
    ]);
    await toggleCoordinates();
    expect(passing()).toEqual([]);
  });

  it.each([
    ["wedge", 'polygon[data-id="timestamp_1"]:not([data-part])'],
    ["label", 'text[data-id="timestamp_1"][data-part="label"]'],
    ["line", 'line[data-id="timestamp_1"][data-part="line"]'],
  ])("selects the timestamp by its %s with Show coordinates off", async (_, selector) => {
    await show(namedView());
    const element = one(selector, one(".svelte-flow__node[data-id] svg"));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
    expect([...harness.current().selection.values()]).toEqual([timestamp]);
    expect(glowing()).toEqual([null, "label", "line"]);
  });

  it("shows a selected label part on the label alone", async () => {
    await show(namedView());
    harness.select(selectionOf([inBlock(A, partAddress(idAddress("timestamp_1"), "label"))]));
    await settle();
    expect(glowing()).toEqual(["label"]);
  });
});

describe("the zoom", () => {
  it.each([
    ["+", 250, 256],
    ["+", 2, 2.4],
    ["-", 0.055, 0.05],
  ])("%s from %d is %d", async (key, from, zoom) => {
    await show(mapView());
    harness.showAt({ x: 0, y: 0, zoom: from });
    await settle();
    arranger().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(harness.current().viewport.zoom).toBe(zoom));
  });
});

describe("the canvas's MeasureMaps for others", () => {
  const measureView = (): View => viewOf({ id: A, fixture: "groups/group_measure_map" });

  it("hands out its one source's answer, read again in a reaction when it arrives", async () => {
    const answer: readonly MeasureKnots[] = [{ id: "measuremap_1", rows: [] }];
    const fetch = vi.fn((_text: string) => Promise.resolve(answer));
    await show(measureView(), fetch);
    const { manifest } = blockIn(store.view, A);
    expect(harness.knotsOf(manifest)).toBe("pending");
    harness.readKnots(manifest);
    expect(harness.read()).toBe("pending");
    await vi.waitFor(() => expect(harness.read()).toBe(answer));
    expect(harness.knotsOf(manifest)).toBe(answer);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(harness.knotsOf(blockIn(mapView(), A).manifest)).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives nothing without a server", async () => {
    await show(measureView());
    expect(harness.knotsOf(blockIn(store.view, A).manifest)).toBeUndefined();
  });
});

describe("a named timestamp's pin", () => {
  /** The pin of `timestamp_1` in block A of `view`, read without a server. */
  const pinIn = (view: View) => {
    const block = blockIn(view, A);
    const drawing = drawingOf(block, view.graphical, metrics);
    return namedPin(block.manifest, A, drawing, "timestamp_1", DEFAULT_GRANULARITY, "no_server");
  };

  it("is read on its line, and on its own axis with its own maps while no line draws it", () => {
    const spec = {
      block: A,
      granularity: DEFAULT_GRANULARITY,
      line: {
        timeline: "melody",
        name: "Melody",
        unit: "quarters",
        numberType: "fraction",
        length: Rational.fromParts(8n, 1n),
        maps: [
          {
            id: "tempo",
            name: "Tempo",
            offset: 0,
            scalar: [1, 2],
            source_unit: "quarters",
            target_unit: "seconds",
            type: "LinearMap",
          },
        ],
      },
      segments: [],
    } as const;
    const expected = {
      spec,
      knots: "no_server",
      timestamp: timestampAt(spec, Rational.fromParts(4n, 1n), "no_server"),
      named: "timestamp_1",
    };
    const hidden = changed(namedView(), {
      type: "style",
      select: { addresses: [{ id: "melody" }] },
      set: { display: "none" },
      blocks: [A],
    });
    expect(axesOf(drawingOf(blockIn(hidden, A), hidden.graphical, metrics)).size).toBe(0);
    expect([pinIn(namedView()), pinIn(hidden)]).toEqual([expected, expected]);
  });
});
