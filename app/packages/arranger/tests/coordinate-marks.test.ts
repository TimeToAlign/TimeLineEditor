// @vitest-environment jsdom
/**
 * Show coordinates on the canvas: the wedge and the cross-section line of
 * the hovered and the pinned position, the flag, what a click pins, what
 * turning it off clears, how a named timestamp is selected in either mode
 * (one that draws nothing too) and deleted, and the zoom's range. Derived
 * in `README.md` ("The coordinate marks and the mode split").
 */

import type { Address, Manifest, MeasureKnots, Pin, Store, View } from "@timetoalign/tilie-core";
import {
  DEFAULT_GRANULARITY,
  idAddress,
  inBlock,
  partAddress,
  pinAt,
  sameAddress,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import { crossSection, groupCrossSections, wedgeAt } from "@timetoalign/tilie-layout";
import { ADDRESS_ATTRIBUTES, attributeText, writeSvg } from "@timetoalign/tilie-writers";
import type { Viewport } from "@xyflow/svelte";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { KnotsOf } from "../src/coordinates.ts";
import { axesOf, readingAt, timelinePin } from "../src/coordinates.ts";
import { descriptorsOf, drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED, type Selection, selectionOf } from "../src/selection.ts";
import { ownerOf } from "../src/selectionRules.ts";
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

/** `map` with the named timestamp `timestamp_3` ("Four") at 4 quarters on `melody`. */
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
/** The line each pin was read on, as the canvas hands it over with the pin. */
let lines: (string | null)[];
let resize: ReturnType<typeof stubCanvasGlobals>["resize"];

beforeEach(() => {
  ({ resize } = stubCanvasGlobals());
  pins = [];
  lines = [];
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
      oncoordinatepin: (pin: Pin | null, line: string | null) => {
        pins.push(pin);
        lines.push(line);
      },
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

/** The key of the line of timeline `id` in block A's drawing (layout's `lineAxes`). */
function lineKey(drawing: Drawing, id: string): string {
  const found = [...axesOf(drawing)].find(([, axis]) => axis.timeline === id);
  if (found === undefined) throw new Error(`no line of ${id}`);
  return found[0];
}

const melodyKey = (drawing: Drawing): string => lineKey(drawing, "melody");

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
    const wedge = one('polygon[data-id="timestamp_3"]:not([data-part])', node);
    const line = one('line[data-id="timestamp_3"][data-part="line"]', node);
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

describe("a position on an ancestor line", () => {
  /** `piece`'s ancestor line in `middle`'s card, and 8 quarters of `piece` on it (`README.md`). */
  const PIECE_Y = 67.78125;
  const AT_PIECE_8 = 460.33544921875;
  const parentView = (): View =>
    viewOf({ id: A, fixture: "groups/group_parent_both", x: 40, y: 80 });

  /** The wedge of the marks of `kind` as attributes, and whether a cross-section line is drawn. */
  function wedgeMarks(kind: "hover" | "pin") {
    const svg = document.querySelector(`.tilie-coordinate-marks[data-mark="${kind}"]`);
    if (svg === null) return null;
    return {
      wedge: attributes(one('[data-testid="coordinate-wedge"]', svg), WEDGE),
      line: svg.querySelector('[data-testid="coordinate-line"]') !== null,
    };
  }

  /**
   * The ancestor line's mark at 8: above the line, in the style the cascade gives a wedge of
   * `piece` on its ancestor line, faded as what lies inside an ancestor line is by default.
   */
  const MARK = {
    wedge: {
      points: "460.3354,66.2812 457.3354,53.2812 463.3354,53.2812",
      fill: "#000000",
      opacity: "0.35",
    },
    line: false,
  };

  it("is marked by the ancestor line's mark, and flags the ancestor", async () => {
    await show(parentView());
    await toggleCoordinates();
    await hoverAt(client(AT_PIECE_8, PIECE_Y));
    const node = one(".svelte-flow__node[data-id] svg");
    expect(attributes(one('polygon[data-id="middle"][data-part="start"]', node), WEDGE)).toEqual({
      points: "260.3354,66.2812 257.3354,53.2812 263.3354,53.2812",
      fill: "#000000",
      opacity: "0.35",
    });
    expect(wedgeMarks("hover")).toEqual(MARK);
    expect(
      [...document.querySelectorAll(".tilie-coordinates-part")].map((part) => [
        part.querySelector(".tilie-coordinates-head")?.textContent,
        [...part.querySelectorAll(".tilie-coordinates-row")].map((row) => [
          row.querySelector(".tilie-coordinates-value")?.textContent,
          row.getAttribute("data-hovered"),
        ]),
      ]),
    ).toEqual([
      ["Piece", [["8 ♩", "true"]]],
      ["Middle", [["4 ♩", "false"]]],
    ]);
  });

  it("pins the ancestor's timestamp with its ancestor line, marked at the same place", async () => {
    await show(parentView());
    await toggleCoordinates();
    await clickAt(client(AT_PIECE_8, PIECE_Y));
    const [pin] = pins;
    expect([pin?.named, pin?.spec.anchor.timeline, pin?.timestamp.parts[0]?.position]).toEqual([
      null,
      "piece",
      Rational.of([8, 1]),
    ]);
    const ancestorLine = [...axesOf(shown().drawing)].find(
      ([, axis]) => axis.timeline === "piece" && axis.ancestor === undefined,
    )?.[0];
    expect([ancestorLine === undefined, lines]).toEqual([false, [ancestorLine]]);
    if (pin === undefined || pin === null) throw new Error("nothing pinned");
    harness.pin(pin);
    await settle();
    expect(wedgeMarks("pin")).toEqual(MARK);
  });

  it("is marked alike while a rule hides the drawn mark of the member's start", async () => {
    const hiding = {
      select: { element: "wedge", addresses: [partAddress(idAddress("middle"), "start")] },
      set: { display: "none" },
    };
    const view = parentView();
    await show(
      changed(view, {
        type: "set",
        changes: [
          {
            target: WORKSPACE,
            values: {
              graphical: { ...view.graphical, rules: [...(view.graphical.rules ?? []), hiding] },
            },
          },
        ],
      }),
    );
    const node = one(".svelte-flow__node[data-id] svg");
    expect(node.querySelector('polygon[data-id="middle"][data-part="start"]')).toBeNull();
    await toggleCoordinates();
    await hoverAt(client(AT_PIECE_8, PIECE_Y));
    expect(wedgeMarks("hover")).toEqual(MARK);
  });

  it("marks a pin in a gap only while the card is raised, on the card's line", async () => {
    await show(parentView());
    const { manifest } = blockIn(store.view, A);
    const drawing = drawingOf(blockIn(store.view, A), store.view.graphical, metrics);
    const pin = timelinePin(
      manifest,
      A,
      drawing,
      "piece",
      Rational.of([3, 1]),
      DEFAULT_GRANULARITY,
      "no_server",
      false,
      null,
      null,
    );
    if (pin === null) throw new Error("no pin of piece");
    harness.pin(pin);
    await settle();
    expect(wedgeMarks("pin")).toBeNull();
    expect(store.open(inBlock(A, idAddress("piece")))).toBeNull();
    await settle();
    harness.showAt(VIEW);
    await settle();
    expect(wedgeMarks("pin")).toEqual({
      wedge: {
        points: "210.3354,69.2812 207.3354,82.2812 213.3354,82.2812",
        fill: "#000000",
        opacity: null,
      },
      line: true,
    });
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

    const timestamps = blockIn(namedView(), A).manifest.graphical?.timestamps ?? [];
    harness.pin({ ...pin, named: timestamps.find((item) => item.id === "timestamp_3") ?? null });
    await settle();
    expect(marks("pin")).toBeNull();

    harness.pin(null);
    await settle();
    expect(marks("pin")).toBeNull();
  });
});

describe("a pinned timestamp read across its group", () => {
  /** The pin a reading at the middle of `score`'s line makes with the editor `editing` open. */
  function pinOnScore(editing: Editing | null): { pin: Pin; key: string; x: number } {
    const { drawing, x: left, y: top } = shown();
    const key = lineKey(drawing, "score");
    const score = axesOf(drawing).get(key);
    if (score === undefined) throw new Error("no line of score");
    const x = score.xStart + (score.xEnd - score.xStart) / 2;
    const reading = readingAt(
      project(store.view, NOTHING_SELECTED, [], metrics, editing),
      { x: left + x, y: top + score.y },
      { zoom: 1, ratio: 1, granularity: DEFAULT_GRANULARITY },
    );
    if (reading === null) throw new Error("score is not read there");
    return { pin: reading.pin, key, x };
  }

  /** The group lines the marks of `kind` draw, as attributes. */
  const groupLines = (kind: "hover" | "pin" = "pin") =>
    [
      ...document.querySelectorAll(
        `.tilie-coordinate-marks[data-mark="${kind}"] [data-testid="coordinate-group-line"]`,
      ),
    ].map((element) => attributes(element, LINE));

  /** The attributes of layout's group lines at the abscissa `x` of the line keyed `key`. */
  const expectedGroupLines = (key: string, x: number) =>
    groupCrossSections(shown().drawing, key, x).map((line) => ({
      x1: attributeText(line.x),
      y1: attributeText(line.y1),
      x2: attributeText(line.x),
      y2: attributeText(line.y2),
      stroke: line.style.stroke,
      "stroke-width": attributeText(line.style["stroke-width"]),
      "stroke-dasharray": line.style["stroke-dasharray"],
      opacity: null,
    }));

  it("is marked across the frame holding its line while it is hovered", async () => {
    await show(viewOf({ id: A, fixture: "groups/group_groupstamp", x: 40, y: 80 }));
    await toggleCoordinates();
    const { key, x } = pinOnScore(null);
    const score = axesOf(shown().drawing).get(key);
    if (score === undefined) throw new Error("no line of score");
    await hoverAt(client(x, score.y));
    const expected = expectedGroupLines(key, x);
    expect(expected).toHaveLength(2);
    expect(groupLines("hover")).toEqual(expected);
  });

  it("is not marked across the frame while hovered on a block without groups", async () => {
    await show(mapView());
    await toggleCoordinates();
    await hoverAt(client(AT_4, MELODY_Y));
    expect(marks("hover")).not.toBeNull();
    expect(groupLines("hover")).toEqual([]);
  });

  it("is marked across the frame holding its line, as layout's group lines", async () => {
    await show(viewOf({ id: A, fixture: "groups/group_groupstamp", x: 40, y: 80 }));
    const { pin, key, x } = pinOnScore(null);
    harness.pin(pin);
    await settle();
    const expected = groupCrossSections(shown().drawing, key, x).map((line) => ({
      x1: attributeText(line.x),
      y1: attributeText(line.y1),
      x2: attributeText(line.x),
      y2: attributeText(line.y2),
      stroke: line.style.stroke,
      "stroke-width": attributeText(line.style["stroke-width"]),
      "stroke-dasharray": line.style["stroke-dasharray"],
      opacity: null,
    }));
    expect(expected).toHaveLength(2);
    expect(groupLines()).toEqual(expected);

    harness.pin(pinOnScore({ target: inBlock(A, idAddress("score")), kind: "timeline" }).pin);
    await settle();
    expect(groupLines()).toEqual([]);
  });

  it("is never marked across a group on a block without groups", async () => {
    await show(mapView());
    harness.pin(pinOnMelody(AT_4));
    await settle();
    expect(groupLines()).toEqual([]);
  });
});

describe("pinning", () => {
  it("pins on a line with its key, clears elsewhere, and clears when Show coordinates is turned off", async () => {
    await show(mapView());
    await toggleCoordinates();
    await clickAt(client(AT_4, MELODY_Y));
    expect(pins).toHaveLength(1);
    const [pin] = pins;
    expect(pin?.named).toBeNull();
    expect(pin?.spec.anchor.timeline).toBe("melody");
    expect(pin?.timestamp.parts[0]?.position).toEqual(Rational.of([4, 1]));
    expect(one('[data-testid="coordinate-pinned"]').textContent).toBe("Pinned Melody at 4 ♩");

    await clickAt(client(AT_4, MELODY_Y + 30));
    expect(pins.slice(1)).toEqual([null]);

    await toggleCoordinates();
    expect(pins.slice(2)).toEqual([null]);

    await clickAt(client(AT_4, MELODY_Y));
    expect(pins).toHaveLength(3);
    const melody = melodyKey(shown().drawing);
    expect(lines).toEqual([melody, null, null]);
  });
});

describe("the mode split", () => {
  const timestamp: Address = inBlock(A, idAddress("timestamp_3"));

  /** The elements of block A's node letting the pointer through, as `[tag, data-id, data-part]`. */
  function passing(): (string | null)[][] {
    const node = one(".svelte-flow__node[data-id] svg");
    return [...node.querySelectorAll('[pointer-events="none"]')].map((element) => [
      element.tagName,
      element.getAttribute("data-id"),
      element.getAttribute("data-part"),
    ]);
  }

  /** The drawn elements of block A carrying a named timestamp's address, as `passing` lists them. */
  function stampParts(): (string | null)[][] {
    const { manifest } = blockIn(store.view, A);
    return descriptorsOf(shown().drawing).flatMap(({ tag, source }) =>
      ownerOf(manifest, source.address)?.kind !== "timestamp"
        ? []
        : [[tag, source.address.id ?? null, source.address.part?.join(" ") ?? null]],
    );
  }

  /** The drawn elements of `timestamp_3` that show the selection, as `data-part`. */
  function glowing(): (string | null)[] {
    const node = one(".svelte-flow__node[data-id] svg");
    return [...node.querySelectorAll('[data-id="timestamp_3"][data-selected]')].map((element) =>
      element.getAttribute("data-part"),
    );
  }

  it("lets the pointer through every named timestamp only while Show coordinates is on", async () => {
    await show(namedView());
    expect(passing()).toEqual([]);
    await toggleCoordinates();
    expect(
      stampParts()
        .map(([, id, part]) => `${id} ${part}`)
        .sort(),
    ).toEqual([
      "timestamp_1 coordinate",
      "timestamp_1 null",
      "timestamp_2 coordinate",
      "timestamp_2 null",
      "timestamp_3 line",
      "timestamp_3 name",
      "timestamp_3 null",
    ]);
    expect(passing()).toEqual(stampParts());
    await toggleCoordinates();
    expect(passing()).toEqual([]);
  });

  it.each([
    ["wedge", 'polygon[data-id="timestamp_3"]:not([data-part])'],
    ["name label", 'text[data-id="timestamp_3"][data-part="name"]'],
    ["line", 'line[data-id="timestamp_3"][data-part="line"]'],
  ])("selects the timestamp by its %s with Show coordinates off", async (_, selector) => {
    await show(namedView());
    const element = one(selector, one(".svelte-flow__node[data-id] svg"));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
    expect([...harness.current().selection.values()]).toEqual([timestamp]);
    expect(glowing()).toEqual([null, "name", "line"]);
  });

  it("selects a groupstamp by its line across the other members of its group", async () => {
    await show(viewOf({ id: A, fixture: "groups/group_groupstamp", x: 40, y: 80 }));
    const node = one(".svelte-flow__node[data-id] svg");
    const lines = [...node.querySelectorAll('line[data-id="timestamp_1"][data-part="line"]')];
    const stamp = partAddress(idAddress("timestamp_1"), "line");
    const drawn = shown().drawing.elements.filter(
      (item) => item.type === "cross_section" && sameAddress(item.address, stamp),
    );
    expect(lines).toHaveLength(drawn.length);
    for (const line of lines) {
      harness.select(NOTHING_SELECTED);
      await settle();
      line.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await settle();
      expect([...harness.current().selection.values()]).toEqual([
        inBlock(A, idAddress("timestamp_1")),
      ]);
    }
  });

  it("shows a selected name label part on the label alone", async () => {
    await show(namedView());
    harness.select(selectionOf([inBlock(A, partAddress(idAddress("timestamp_3"), "name"))]));
    await settle();
    expect(glowing()).toEqual(["name"]);
  });

  it("deletes a selected timestamp with Delete", async () => {
    // The drawing's elements slide when the deletion moves them; jsdom has no Web Animations.
    for (const [name, value] of [
      ["animate", () => ({ cancel() {}, onfinish: null })],
      ["getAnimations", () => []],
    ] as const) {
      Object.defineProperty(Element.prototype, name, { value, configurable: true, writable: true });
    }
    onTestFinished(() => {
      for (const name of ["animate", "getAnimations"])
        Reflect.deleteProperty(Element.prototype, name);
    });
    await show(namedView());
    harness.select(selectionOf([timestamp]));
    await settle();
    arranger().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
    );
    await settle();
    expect(blockIn(store.view, A).manifest.graphical?.timestamps?.map((item) => item.id)).toEqual([
      "timestamp_1",
      "timestamp_2",
    ]);
    expect(harness.current().selection.size).toBe(0);
  });
});

describe("a timestamp that draws nothing", () => {
  /** `timestamps` with `display` `[]` set on `timestamp_2` ("Climax", 6 on `clt_1`). */
  const silentView = (): View =>
    changed(viewOf({ id: A, fixture: "timestamps", x: 40, y: 80 }), {
      type: "set",
      changes: [{ target: inBlock(A, idAddress("timestamp_2")), values: { display: [] } }],
    });

  const affordances = () => [...document.querySelectorAll(".tilie-timestamp-affordance")];

  it("is shown on the canvas alone as a light-grey wedge where its wedge would lie", async () => {
    await show(silentView());
    const { drawing } = shown();
    expect(
      descriptorsOf(drawing).filter(({ source }) => source.address.id === "timestamp_2"),
    ).toEqual([]);
    const figure = writeSvg([{ drawing, x: 0, y: 0, scale: 1 }]);
    expect(figure).toContain('data-id="timestamp_1"');
    expect(figure).not.toContain('data-id="timestamp_2"');
    const [affordance, ...more] = affordances();
    expect(more).toEqual([]);
    const wedge = wedgeAt(drawing, lineKey(drawing, "clt_1"), 349.91552734375);
    if (affordance === undefined || wedge === null) throw new Error("no affordance");
    expect(attributes(affordance, ["points", "fill", "pointer-events"])).toEqual({
      points: attributeText(wedge.points),
      fill: null,
      "pointer-events": null,
    });
    expect(ADDRESS_ATTRIBUTES.map((name) => affordance.getAttribute(name))).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("is never shown for a timestamp that displays something", async () => {
    await show(namedView());
    expect(affordances()).toEqual([]);
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    await show(viewOf({ id: A, fixture: "timestamps", x: 40, y: 80 }));
    expect(affordances()).toEqual([]);
  });

  it("selects the timestamp with Show coordinates off and lets the pointer through while on", async () => {
    await show(silentView());
    const [affordance] = affordances();
    affordance?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
    expect([...harness.current().selection.values()]).toEqual([
      inBlock(A, idAddress("timestamp_2")),
    ]);
    expect(affordances()[0]?.hasAttribute("data-selected")).toBe(true);
    await toggleCoordinates();
    expect(affordances()[0]?.getAttribute("pointer-events")).toBe("none");
  });
});

describe("the flag", () => {
  /** The flag shown hovering `melody` at 4 on a canvas `width` pixels wide, the flag 180 wide. */
  async function flagAt(width: number) {
    await show(mapView());
    Object.defineProperty(arranger(), "clientWidth", { value: width, configurable: true });
    await toggleCoordinates();
    await hoverAt(client(AT_4, MELODY_Y));
    const flag = one(".tilie-coordinates-flag");
    Object.defineProperty(flag, "offsetWidth", { value: 180, configurable: true });
    resize(flag, 180, 100);
    await settle();
    return {
      flag: one(".tilie-coordinates-flag") as HTMLElement,
      pole: one('[data-testid="coordinate-pole"]') as HTMLElement,
    };
  }

  it("hangs at its pole, opening to the right", async () => {
    const { flag, pole } = await flagAt(1000);
    const { x, y } = shown();
    expect([pole.style.left, pole.style.width, pole.style.top, pole.style.height]).toEqual([
      `${x + AT_4 - 0.5}px`,
      "1px",
      `${y + 16 - 22}px`,
      "46.5px",
    ]);
    expect([flag.style.left, flag.style.top]).toEqual([`${x + AT_4 + 0.5}px`, `${y + 16 - 22}px`]);
  });

  it("keeps its side where it would leave the canvas, shifted by exactly the overflow", async () => {
    const { flag, pole } = await flagAt(400);
    const { x, y } = shown();
    // Started right of the pole (the node at 40), the flag would end 84.03662109375 past 400.
    expect(x + AT_4 + 0.5 + 180).toBe(484.03662109375);
    expect([flag.style.left, flag.style.top, pole.style.left]).toEqual([
      `${400 - 180}px`,
      `${y + 16 - 22}px`,
      `${x + AT_4 - 0.5}px`,
    ]);
  });

  it("lists the parts with their rows, the hovered one highlighted", async () => {
    await flagAt(1000);
    const rows = () =>
      [...document.querySelectorAll(".tilie-coordinates-part")].map((part) => [
        part.querySelector(".tilie-coordinates-head")?.textContent,
        [...part.querySelectorAll(".tilie-coordinates-row")].map((row) => [
          row.querySelector(".tilie-coordinates-name")?.textContent,
          row.querySelector(".tilie-coordinates-value")?.textContent,
          row.getAttribute("data-hovered"),
        ]),
      ]);
    // Top to bottom: `phrase`'s line lies above `melody`'s, and each one's maps above its line.
    expect(rows()).toEqual([
      [
        "Phrase",
        [
          ["Ticks", "960 ticks", "false"],
          ["coordinate", "2 ♩", "false"],
        ],
      ],
      [
        "Melody",
        [
          ["Tempo", "2″", "false"],
          ["coordinate", "4 ♩", "true"],
        ],
      ],
    ]);
    await hoverAt(client(AT_4, 35));
    expect(
      [...document.querySelectorAll('.tilie-coordinates-row[data-hovered="true"]')].map((row) =>
        row.getAttribute("data-map"),
      ),
    ).toEqual(["tempo"]);
    expect(one('[data-testid="coordinate-footer"]').textContent).toBe("click to pin");
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
