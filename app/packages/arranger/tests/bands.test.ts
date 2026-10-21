/**
 * The bands of a timeline as boxes of its editor: the offered bands, the
 * band under a point, where a dragged or stepped band lands, the one `set`
 * that moves it, and the selection readers.
 */

import type {
  Address,
  BandOrderEntry,
  ElementAddress,
  Facet,
  Store,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  bandAddress,
  cardAddress,
  idAddress,
  inBlock,
  partAddress,
  placeKeyText,
  sameAddress,
} from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { affectedBy } from "../src/affected.ts";
import { bandDrop, bandMoveCommand, bandStep } from "../src/bands.ts";
import type { BandBox } from "../src/boxes.ts";
import { bandAt, hitOf, holdingOf, offeredBands } from "../src/boxes.ts";
import { removeCommand } from "../src/commands.ts";
import { drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { elementsInRect } from "../src/marquee.ts";
import type { BlockNode } from "../src/project.ts";
import type { Selection } from "../src/selection.ts";
import { existing, offersBand, selectedBand, selectionOf } from "../src/selection.ts";
import {
  A,
  B,
  bandRecord,
  bandsOf,
  blockIn,
  load,
  MAP_DRAWN,
  metrics,
  ROOT_ORDER,
  STYLED_DRAWN,
  sourceOf,
  storeOf,
  viewOf,
  withBands,
} from "./support.ts";

const STYLED = "styled__score";

/** A band order: `line` and the five facets, top to bottom. */
type Order = BandOrderEntry[];

/** `styled__score`'s own band order. */
const E: Order = ["children", "markers", "line", "conversion_maps", "regions", "flow_control"];
/** The default band order, `melody`'s and `phrase`'s in `map`. */
const D: Order = ["children", "conversion_maps", "line", "markers", "regions", "flow_control"];
/** `melody`'s own band order in `map_root_band_order`, which `phrase` inherits. */
const R: Order = ["children", "line", "conversion_maps", "markers", "regions", "flow_control"];

/** The record of the band `address` in `drawing`, the first when there are several. */
function record(drawing: Drawing, address: ElementAddress): BandBox {
  const found = bandsOf(drawing).find((band) => sameAddress(band.address, address));
  if (found === undefined) throw new Error(`no record of ${addressKey(address)}`);
  return found;
}

const S = (facet: Facet) => record(STYLED_DRAWN, bandAddress("score", facet));
const M = (timeline: string, facet: Facet) => record(MAP_DRAWN, bandAddress(timeline, facet));

/** The element addresses `addresses` by their keys, as a block's selected elements. */
function elements(...addresses: ElementAddress[]): ReadonlyMap<string, ElementAddress> {
  return new Map(addresses.map((address) => [addressKey(address), address]));
}

/** The README's drawing T: `excerpt` drawn with two lines, records only. */
const TWO_LINES: Drawing = withBands(STYLED_DRAWN, [
  bandRecord("excerpt", "children", 2, 50, [100, 10, 400, 14]),
  bandRecord("excerpt", "conversion_maps", 1, 50, [100, 36, 400, 14]),
  bandRecord("excerpt", "children", 2, 150, [100, 110, 400, 14]),
  bandRecord("excerpt", "conversion_maps", 1, 150, [100, 136, 400, 14]),
]);

describe("the offered bands and the band under a point", () => {
  it("offers every record of a timeline, in order", () => {
    expect(offeredBands(STYLED_DRAWN, "score")).toEqual(bandsOf(STYLED_DRAWN));
    expect(offeredBands(STYLED_DRAWN, "b")).toEqual([]);
    expect(offeredBands(TWO_LINES, "excerpt")).toEqual(bandsOf(TWO_LINES));
  });

  it("finds the offered band holding the point, edges included, the first in order", () => {
    const at = (x: number, y: number) => bandAt(STYLED_DRAWN, "score", { x, y });
    expect(at(150, 55)).toBe(S("children"));
    expect(at(100, 40)).toBe(S("children"));
    expect(at(500, 160)).toBe(S("flow_control"));
    expect(at(150, 100)).toBe(S("markers"));
    expect(at(150, 75)).toBeNull();
    expect(at(99, 55)).toBeNull();
    expect(at(501, 55)).toBeNull();
    expect(bandAt(STYLED_DRAWN, "b", { x: 150, y: 55 })).toBeNull();
  });

  it("holds a band 0 high on its edge only", () => {
    const flat = { ...S("flow_control"), height: 0 };
    const drawing = withBands(STYLED_DRAWN, [...bandsOf(STYLED_DRAWN).slice(0, 4), flat]);
    expect(bandAt(drawing, "score", { x: 150, y: 138 })).toBe(flat);
    expect(bandAt(drawing, "score", { x: 150, y: 138.5 })).toBeNull();
  });
});

describe("bandDrop", () => {
  const drop = (facet: Facet, y: number) => bandDrop(STYLED_DRAWN, S(facet), y, E);

  it("moves a band along its side, outwards and inwards", () => {
    expect(drop("conversion_maps", 140)).toEqual([
      "children",
      "markers",
      "line",
      "regions",
      "conversion_maps",
      "flow_control",
    ]);
    expect(drop("flow_control", 103)).toEqual([
      "children",
      "markers",
      "line",
      "flow_control",
      "conversion_maps",
      "regions",
    ]);
    expect(drop("children", 95)).toEqual([
      "markers",
      "children",
      "line",
      "conversion_maps",
      "regions",
      "flow_control",
    ]);
    expect(drop("markers", 30)).toEqual([
      "markers",
      "children",
      "line",
      "conversion_maps",
      "regions",
      "flow_control",
    ]);
  });

  it("moves a band across the line into a gap between two bands of the other side", () => {
    expect(drop("regions", 75)).toEqual([
      "children",
      "regions",
      "markers",
      "line",
      "conversion_maps",
      "flow_control",
    ]);
    expect(drop("markers", 112)).toEqual([
      "children",
      "line",
      "conversion_maps",
      "markers",
      "regions",
      "flow_control",
    ]);
    expect(drop("regions", 100)).toEqual([
      "children",
      "markers",
      "regions",
      "line",
      "conversion_maps",
      "flow_control",
    ]);
  });

  it("gives null for a release in place", () => {
    expect(drop("regions", 124)).toBeNull();
    expect(drop("regions", 108)).toBeNull();
    expect(drop("children", 10)).toBeNull();
    expect(drop("markers", 99)).toBeNull();
  });

  it("gives null for a release in place with an absent band between the neighbours", () => {
    const markersOuter: Order = [
      "children",
      "conversion_maps",
      "line",
      "regions",
      "markers",
      "flow_control",
    ];
    expect(bandDrop(MAP_DRAWN, M("melody", "markers"), 78, markersOuter)).toBeNull();
    const childrenOuter: Order = [
      "children",
      "regions",
      "conversion_maps",
      "line",
      "markers",
      "flow_control",
    ];
    expect(bandDrop(MAP_DRAWN, M("melody", "children"), 20, childrenOuter)).toBeNull();
  });

  it("moves a band beyond the outermost band of a side", () => {
    expect(drop("conversion_maps", 170)).toEqual([
      "children",
      "markers",
      "line",
      "regions",
      "flow_control",
      "conversion_maps",
    ]);
    expect(drop("flow_control", 5)).toEqual([
      "flow_control",
      "children",
      "markers",
      "line",
      "conversion_maps",
      "regions",
    ]);
  });

  it("moves a child's band across its own line", () => {
    expect(bandDrop(MAP_DRAWN, M("phrase", "conversion_maps"), 33, D)).toEqual([
      "children",
      "line",
      "conversion_maps",
      "markers",
      "regions",
      "flow_control",
    ]);
  });

  it("reads the records of the dragged band's own line", () => {
    const [children] = bandsOf(TWO_LINES) as [BandBox];
    const swapped: Order = [
      "conversion_maps",
      "children",
      "line",
      "markers",
      "regions",
      "flow_control",
    ];
    expect(bandDrop(TWO_LINES, children, 45, D)).toEqual(swapped);
    expect(bandStep(TWO_LINES, children, "down", D)).toEqual(swapped);
  });
});

/** The README's steps of S with `E`: each band's order up, then down. */
const STYLED_STEPS: readonly [Facet, Order | null, Order | null][] = [
  ["children", null, ["markers", "children", "line", "conversion_maps", "regions", "flow_control"]],
  [
    "markers",
    ["markers", "children", "line", "conversion_maps", "regions", "flow_control"],
    ["children", "line", "markers", "conversion_maps", "regions", "flow_control"],
  ],
  [
    "conversion_maps",
    ["children", "markers", "conversion_maps", "line", "regions", "flow_control"],
    ["children", "markers", "line", "regions", "conversion_maps", "flow_control"],
  ],
  [
    "regions",
    ["children", "markers", "line", "regions", "conversion_maps", "flow_control"],
    ["children", "markers", "line", "conversion_maps", "flow_control", "regions"],
  ],
  [
    "flow_control",
    ["children", "markers", "line", "conversion_maps", "flow_control", "regions"],
    null,
  ],
];

/** The README's steps on M: each band's timeline and facet, and its orders up and down from `D`. */
const MAP_STEPS: readonly [string, Facet, Order | null, Order | null][] = [
  [
    "melody",
    "children",
    null,
    ["conversion_maps", "children", "line", "markers", "regions", "flow_control"],
  ],
  [
    "melody",
    "conversion_maps",
    ["conversion_maps", "children", "line", "markers", "regions", "flow_control"],
    ["children", "line", "conversion_maps", "markers", "regions", "flow_control"],
  ],
  [
    "melody",
    "markers",
    ["children", "conversion_maps", "markers", "line", "regions", "flow_control"],
    null,
  ],
  [
    "phrase",
    "conversion_maps",
    null,
    ["children", "line", "conversion_maps", "markers", "regions", "flow_control"],
  ],
];

describe("bandStep", () => {
  it.each(STYLED_STEPS)(
    "steps %s of score up and down past the next visible entry",
    (facet, up, down) => {
      expect(bandStep(STYLED_DRAWN, S(facet), "up", E)).toEqual(up);
      expect(bandStep(STYLED_DRAWN, S(facet), "down", E)).toEqual(down);
    },
  );

  it.each(MAP_STEPS)(
    "steps %s's %s band past the visible entries only",
    (timeline, facet, up, down) => {
      expect(bandStep(MAP_DRAWN, M(timeline, facet), "up", D)).toEqual(up);
      expect(bandStep(MAP_DRAWN, M(timeline, facet), "down", D)).toEqual(down);
    },
  );
});

/** `view`'s block A with the band order of `timeline` set to `next` by `bandMoveCommand`. */
const moving = (view: View, timeline: string, next: readonly string[]) =>
  bandMoveCommand(view, A, timeline, next);

const setting = (timeline: string, value: readonly string[] | null) => ({
  type: "set",
  changes: [{ target: inBlock(A, idAddress(timeline)), values: { order: value } }],
});

/** A band order `R` with `melody`'s conversion maps and markers bands swapped. */
const MOVED: Order = ["children", "line", "markers", "conversion_maps", "regions", "flow_control"];

describe("bandMoveCommand", () => {
  const view = viewOf({ id: A, fixture: ROOT_ORDER });

  it("states the manifest's band orders it reads", () => {
    expect(blockIn(view, A).manifest.graphical?.order).toEqual({ melody: R });
  });

  it("writes null for a root's default and a child's parent's order", () => {
    expect(moving(view, "melody", D)).toEqual(setting("melody", null));
    expect(moving(view, "melody", MOVED)).toEqual(setting("melody", MOVED));
    expect(moving(view, "phrase", R)).toEqual(setting("phrase", null));
    expect(moving(view, "phrase", D)).toEqual(setting("phrase", D));
  });

  it("writes every new order of the drops and steps as it is", () => {
    const styled = viewOf({ id: A, fixture: STYLED });
    for (const [, up, down] of STYLED_STEPS) {
      for (const next of [up, down]) {
        if (next !== null) expect(moving(styled, "score", next)).toEqual(setting("score", next));
      }
    }
  });

  it("throws for a block the view does not hold", () => {
    expect(() => bandMoveCommand(view, "0000000009", "melody", D)).toThrow(RangeError);
  });
});

/**
 * A store holding block A with `fixture`, the editors of the timelines
 * `path` opened in turn, one after the other.
 */
function storeIn(fixture: string, ...path: string[]): Store {
  const store = storeOf(viewOf({ id: A, fixture }));
  for (const timeline of path) expect(store.open(inBlock(A, idAddress(timeline)))).toBeNull();
  return store;
}

/** The entry of `timeline` in block A's `graphical.order`, `undefined` when there is none. */
function entryOf(store: Store, timeline: string): unknown {
  const order = blockIn(store.view, A).manifest.graphical?.order ?? {};
  return Object.hasOwn(order, timeline) ? order[timeline] : undefined;
}

describe("the store accepts every move with its timeline's editor open", () => {
  const styledOrders = [
    ...STYLED_STEPS.flatMap(([, up, down]) => [up, down]),
    bandDrop(STYLED_DRAWN, S("conversion_maps"), 140, E),
    bandDrop(STYLED_DRAWN, S("flow_control"), 103, E),
    bandDrop(STYLED_DRAWN, S("children"), 95, E),
    bandDrop(STYLED_DRAWN, S("regions"), 75, E),
    bandDrop(STYLED_DRAWN, S("markers"), 112, E),
    bandDrop(STYLED_DRAWN, S("regions"), 100, E),
    bandDrop(STYLED_DRAWN, S("conversion_maps"), 170, E),
    bandDrop(STYLED_DRAWN, S("flow_control"), 5, E),
  ].filter((next) => next !== null);

  it.each(styledOrders.map((next) => [next]))("score at %j in score's editor", (next) => {
    const store = storeIn(STYLED, "score");
    expect(store.dispatch(bandMoveCommand(store.view, A, "score", next))).toBeNull();
    expect(entryOf(store, "score")).toEqual(next);
  });

  // A child's editor opens inside its parent's, as a double-click on its line there opens it.
  const mapMoves = MAP_STEPS.flatMap(([timeline, , up, down]) => {
    const path = timeline === "phrase" ? ["melody", "phrase"] : ["melody"];
    return [up, down].flatMap((next) => (next === null ? [] : [[timeline, path, next] as const]));
  });

  it.each(mapMoves)("%s of map in its own editor, %j open", (timeline, path, next) => {
    const store = storeIn("map", ...path);
    expect(store.dispatch(bandMoveCommand(store.view, A, timeline, next))).toBeNull();
    expect(entryOf(store, timeline)).toEqual(next);
  });

  it.each([
    ["melody", ["melody"], D, undefined],
    ["melody", ["melody"], MOVED, MOVED],
    ["phrase", ["melody", "phrase"], D, D],
  ] as const)("%s of map_root_band_order, %j open", (timeline, path, next, entry) => {
    const store = storeIn(ROOT_ORDER, ...path);
    expect(store.dispatch(bandMoveCommand(store.view, A, timeline, next))).toBeNull();
    expect(entryOf(store, timeline)).toEqual(entry);
    expect(entryOf(store, "melody")).toEqual(timeline === "melody" ? entry : R);
  });

  it("refuses the null of a timeline without an entry, which no move gives", () => {
    const store = storeIn(ROOT_ORDER, "melody", "phrase");
    expect(store.dispatch(bandMoveCommand(store.view, A, "phrase", R))).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [addressKey(inBlock(A, idAddress("phrase"))), "order"],
    });
    expect(entryOf(store, "phrase")).toBeUndefined();
    expect(entryOf(store, "melody")).toEqual(R);
  });
});

/** The timeline editor of `timeline` in block `block`. */
const timelineEditor = (block: string, timeline: string): Editing => ({
  target: inBlock(block, idAddress(timeline)),
  kind: "timeline",
});

describe("on layout's drawing of styled__score", () => {
  const view = viewOf({ id: A, fixture: STYLED });
  const drawn = () => drawingOf(blockIn(view, A), view.settings, metrics);
  const editing = timelineEditor(A, "score");

  it("records the present bands of score from its band order", () => {
    const drawing = drawn();
    const lineOf = drawing.elements.find(
      (element) => element.type === "timeline" && sameAddress(element.address, idAddress("score")),
    );
    const y = lineOf?.type === "timeline" ? lineOf.y : Number.NaN;
    expect(
      offeredBands(drawing, "score").map(({ address, band: { facet, level, line, elements } }) => ({
        address,
        facet,
        level,
        line,
        elements,
      })),
    ).toEqual([
      {
        address: bandAddress("score", "children"),
        facet: "children",
        level: 2,
        line: y,
        elements: 1,
      },
      {
        address: bandAddress("score", "markers"),
        facet: "markers",
        level: 1,
        line: y,
        elements: 2,
      },
      {
        address: bandAddress("score", "conversion_maps"),
        facet: "conversion_maps",
        level: -1,
        line: y,
        elements: 1,
      },
      {
        address: bandAddress("score", "regions"),
        facet: "regions",
        level: -2,
        line: y,
        elements: 1,
      },
      {
        address: bandAddress("score", "flow_control"),
        facet: "flow_control",
        level: -3,
        line: y,
        elements: 1,
      },
    ]);
    expect(offeredBands(drawing, "b")).toEqual([]);
  });

  it.each(STYLED_STEPS)("steps, drops and hits %s as the records S do", (facet, up, down) => {
    const drawing = drawn();
    const band = record(drawing, bandAddress("score", facet));
    expect(bandStep(drawing, band, "up", E)).toEqual(up);
    expect(bandStep(drawing, band, "down", E)).toEqual(down);
    const middle = band.y + band.height / 2;
    expect(bandDrop(drawing, band, middle, E)).toBeNull();
    const point = { x: band.x + band.width / 2, y: middle };
    const card = sourceOf(drawing, cardAddress("score"));
    expect(hitOf(A, drawing, card, point, editing).address).toEqual(inBlock(A, band.address));
  });

  it("dispatches a step in score's editor", () => {
    const drawing = drawn();
    const next = bandStep(drawing, record(drawing, bandAddress("score", "markers")), "down", E);
    if (next === null) throw new Error("the markers band steps down");
    const store = storeIn(STYLED, "score");
    expect(store.dispatch(bandMoveCommand(store.view, A, "score", next))).toBeNull();
  });
});

describe("the selection readers", () => {
  const view = viewOf({ id: A, fixture: "map" });
  const mb = inBlock(A, bandAddress("melody", "markers"));
  const pb = inBlock(A, bandAddress("phrase", "conversion_maps"));
  const ticks = inBlock(A, idAddress("ticks"));
  const nobody = inBlock(A, bandAddress("nobody", "regions"));
  const listed = (selection: Selection): Address[] => [...selection.values()];

  it("reads a band address", () => {
    expect(selectedBand(view, mb)).toEqual({ block: A, timeline: "melody", facet: "markers" });
    for (const address of [
      { block: A },
      inBlock(A, idAddress("melody")),
      inBlock(A, idAddress("tempo")),
      inBlock(A, partAddress(partAddress(idAddress("melody"), "start"), "label")),
      nobody,
    ]) {
      expect(selectedBand(view, address)).toBeNull();
    }
  });

  it("keeps a band only in its timeline's editor", () => {
    const selection = selectionOf([mb, pb, ticks, nobody]);
    const kept = (editing: Editing | null) => listed(existing(view, selection, editing));
    expect(kept(timelineEditor(A, "melody"))).toEqual([mb, ticks]);
    expect(kept(timelineEditor(A, "phrase"))).toEqual([pb, ticks]);
    expect(kept(timelineEditor(A, "nobody"))).toEqual([]);
    expect(kept(timelineEditor(B, "melody"))).toEqual([]);
    expect(kept({ target: { block: A }, kind: "bundle" })).toEqual([ticks]);
    expect(kept(null)).toEqual([ticks]);
    const one = selectionOf([mb]);
    expect(existing(view, one, timelineEditor(A, "melody"))).toBe(one);
  });

  it("offers a band by the rule existing keeps it by", () => {
    const bands = [mb, pb];
    const offered = (editing: Editing | null) =>
      bands.filter((address) => {
        const band = selectedBand(view, address);
        if (band === null) throw new Error(`${addressKey(address)} is no band`);
        return offersBand(view, band, editing);
      });
    expect(offered(timelineEditor(A, "melody"))).toEqual([mb]);
    expect(offered(timelineEditor(A, "phrase"))).toEqual([pb]);
    expect(offered(timelineEditor(A, "nobody"))).toEqual([]);
    expect(offered(timelineEditor(B, "melody"))).toEqual([]);
    expect(offered({ target: { block: A }, kind: "bundle" })).toEqual([]);
    expect(offered(null)).toEqual([]);
    const elsewhere = { block: B, timeline: "melody", facet: "markers" } as const;
    expect(offersBand(view, elsewhere, timelineEditor(B, "melody"))).toBe(false);
  });

  it("prunes every other band when an editor opens and closes", () => {
    const store = storeIn("map", "melody");
    const innermost = () => store.editing.at(-1) ?? null;
    const both = selectionOf([mb, ticks]);
    expect(existing(store.view, both, innermost())).toBe(both);
    expect(store.open(inBlock(A, idAddress("phrase")))).toBeNull();
    expect(listed(existing(store.view, both, innermost()))).toEqual([ticks]);
    store.done();
    expect(innermost()?.target).toEqual(inBlock(A, idAddress("melody")));
    expect(listed(existing(store.view, selectionOf([pb]), innermost()))).toEqual([]);
    store.done();
    expect(innermost()).toBeNull();
    expect(listed(existing(store.view, selectionOf([mb]), innermost()))).toEqual([]);
  });

  it("never removes a band", () => {
    const refused = { refused: "A band is not deleted; select its elements to delete them." };
    const remove = (...addresses: Address[]) => removeCommand(view, selectionOf(addresses), null);
    const tempo = inBlock(A, idAddress("tempo"));
    const phrase = inBlock(A, idAddress("phrase"));
    expect(remove(mb)).toEqual(refused);
    expect(remove(mb, pb)).toEqual(refused);
    expect(remove(mb, tempo)).toEqual({ type: "remove", targets: [tempo] });
    expect(remove(pb, phrase)).toEqual({ type: "remove", targets: [phrase] });
    expect(remove()).toEqual({ refused: "Nothing is selected." });
  });

  it("affects nothing through a selected band", () => {
    const manifest = load("map");
    expect(affectedBy(manifest, elements(bandAddress("melody", "markers")), null)).toEqual(
      new Set(),
    );
    expect(
      affectedBy(
        manifest,
        elements(bandAddress("phrase", "conversion_maps"), idAddress("tempo")),
        null,
      ),
    ).toEqual(new Set());
    expect(
      affectedBy(manifest, elements(bandAddress("melody", "children"), idAddress("phrase")), null),
    ).toEqual(new Set([addressKey(idAddress("ticks"))]));
  });

  it("holds a band as its timeline's line", () => {
    expect(holdingOf(STYLED_DRAWN, elements(bandAddress("score", "children")))).toEqual({
      block: true,
      boxes: new Set([placeKeyText({ item: "score" })]),
    });
    expect(holdingOf(MAP_DRAWN, elements(bandAddress("phrase", "conversion_maps")))).toEqual({
      block: true,
      boxes: new Set([placeKeyText({ item: "melody" })]),
    });
    expect(holdingOf(STYLED_DRAWN, elements(bandAddress("a", "conversion_maps")))).toEqual({
      block: false,
      boxes: new Set(),
    });
  });

  it("never selects a band by a marquee", () => {
    const styled = viewOf({ id: A, fixture: STYLED });
    const inside = new Set(
      [
        cardAddress("score"),
        idAddress("b"),
        idAddress("score"),
        idAddress("ticks"),
        ...bandsOf(STYLED_DRAWN).map(({ address }) => address),
      ].map(addressKey),
    );
    const node: BlockNode = {
      id: A,
      type: "block",
      position: { x: 0, y: 0 },
      data: {
        block: blockIn(styled, A),
        drawing: STYLED_DRAWN,
        descriptors: [],
        selectedElements: new Map(),
        affectedElements: new Set(),
        editing: timelineEditor(A, "score"),
        inside,
      },
    };
    const whole = { x: 0, y: 0, width: 600, height: 200 };
    expect(elementsInRect(node, whole, inside, metrics)).toEqual([
      inBlock(A, idAddress("b")),
      inBlock(A, idAddress("score")),
      inBlock(A, idAddress("ticks")),
    ]);
  });
});
