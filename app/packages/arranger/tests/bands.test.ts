/**
 * The bands of a timeline as boxes of its editor: the offered bands, the
 * band under a point, where a dragged or stepped band lands, the one `set`
 * that moves it, and the selection readers.
 */

import type { BandKind, Store, View } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { affectedBy } from "../src/affected.ts";
import { bandDrop, bandMoveCommand, bandStep } from "../src/bands.ts";
import type { BandBox } from "../src/boxes.ts";
import { bandAt, hitOf, holdingOf, offeredBands } from "../src/boxes.ts";
import { removeCommand } from "../src/commands.ts";
import { drawingOf } from "../src/drawing.ts";
import { elementsInRect } from "../src/marquee.ts";
import type { BlockNode } from "../src/project.ts";
import { existing, offersBand, selectedBand } from "../src/selection.ts";
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

/**
 * The band order of `timeline` written by short names: a band kind stands
 * for the timeline's band of that kind, the timeline's id for itself.
 */
function order(timeline: string, ...entries: (BandKind | string)[]): string[] {
  return entries.map((entry) => (entry === timeline ? entry : `${timeline}/${entry}_1`));
}

const score = (...entries: string[]) => order("score", ...entries);
const melody = (...entries: string[]) => order("melody", ...entries);
const phrase = (...entries: string[]) => order("phrase", ...entries);
const excerpt = (...entries: string[]) => order("excerpt", ...entries);

/** `styled__score`'s own band order. */
const E = score("children", "markers", "score", "conversion_maps", "regions", "flow_control");
/** `melody`'s band order in `map`, the default band order. */
const D = melody("children", "conversion_maps", "melody", "markers", "regions", "flow_control");
/** `phrase`'s band order in `map`, the default band order by band id. */
const P = phrase("children", "conversion_maps", "phrase", "markers", "regions", "flow_control");

/** The record of `address` in `drawing`, the first when there are several. */
function record(drawing: Drawing, address: string): BandBox {
  const found = bandsOf(drawing).find((band) => band.address === address);
  if (found === undefined) throw new Error(`no record of ${address}`);
  return found;
}

const S = (kind: BandKind) => record(STYLED_DRAWN, `score/${kind}_1`);
const M = (address: string) => record(MAP_DRAWN, address);

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
  const drop = (kind: BandKind, y: number) => bandDrop(STYLED_DRAWN, S(kind), y, E);

  it("moves a band along its side, outwards and inwards", () => {
    expect(drop("conversion_maps", 140)).toEqual(
      score("children", "markers", "score", "regions", "conversion_maps", "flow_control"),
    );
    expect(drop("flow_control", 103)).toEqual(
      score("children", "markers", "score", "flow_control", "conversion_maps", "regions"),
    );
    expect(drop("children", 95)).toEqual(
      score("markers", "children", "score", "conversion_maps", "regions", "flow_control"),
    );
    expect(drop("markers", 30)).toEqual(
      score("markers", "children", "score", "conversion_maps", "regions", "flow_control"),
    );
  });

  it("moves a band across the line into a gap between two bands of the other side", () => {
    expect(drop("regions", 75)).toEqual(
      score("children", "regions", "markers", "score", "conversion_maps", "flow_control"),
    );
    expect(drop("markers", 112)).toEqual(
      score("children", "score", "conversion_maps", "markers", "regions", "flow_control"),
    );
    expect(drop("regions", 100)).toEqual(
      score("children", "markers", "regions", "score", "conversion_maps", "flow_control"),
    );
  });

  it("gives null for a release in place", () => {
    expect(drop("regions", 124)).toBeNull();
    expect(drop("regions", 108)).toBeNull();
    expect(drop("children", 10)).toBeNull();
    expect(drop("markers", 99)).toBeNull();
  });

  it("gives null for a release in place with an absent band between the neighbours", () => {
    const markersOuter = melody(
      "children",
      "conversion_maps",
      "melody",
      "regions",
      "markers",
      "flow_control",
    );
    expect(bandDrop(MAP_DRAWN, M("melody/markers_1"), 78, markersOuter)).toBeNull();
    const childrenOuter = melody(
      "children",
      "regions",
      "conversion_maps",
      "melody",
      "markers",
      "flow_control",
    );
    expect(bandDrop(MAP_DRAWN, M("melody/children_1"), 20, childrenOuter)).toBeNull();
  });

  it("moves a band beyond the outermost band of a side", () => {
    expect(drop("conversion_maps", 170)).toEqual(
      score("children", "markers", "score", "regions", "flow_control", "conversion_maps"),
    );
    expect(drop("flow_control", 5)).toEqual(
      score("flow_control", "children", "markers", "score", "conversion_maps", "regions"),
    );
  });

  it("moves a child's band across its own line", () => {
    expect(bandDrop(MAP_DRAWN, M("phrase/conversion_maps_1"), 33, P)).toEqual(
      phrase("children", "phrase", "conversion_maps", "markers", "regions", "flow_control"),
    );
  });

  it("reads the records of the dragged band's own line", () => {
    const [children] = bandsOf(TWO_LINES) as [BandBox];
    const defaults = excerpt(
      "children",
      "conversion_maps",
      "excerpt",
      "markers",
      "regions",
      "flow_control",
    );
    const swapped = excerpt(
      "conversion_maps",
      "children",
      "excerpt",
      "markers",
      "regions",
      "flow_control",
    );
    expect(bandDrop(TWO_LINES, children, 45, defaults)).toEqual(swapped);
    expect(bandStep(TWO_LINES, children, "down", defaults)).toEqual(swapped);
  });
});

/** The README's steps of S with `E`: each band's order up, then down. */
const STYLED_STEPS: readonly [BandKind, string[] | null, string[] | null][] = [
  [
    "children",
    null,
    score("markers", "children", "score", "conversion_maps", "regions", "flow_control"),
  ],
  [
    "markers",
    score("markers", "children", "score", "conversion_maps", "regions", "flow_control"),
    score("children", "score", "markers", "conversion_maps", "regions", "flow_control"),
  ],
  [
    "conversion_maps",
    score("children", "markers", "conversion_maps", "score", "regions", "flow_control"),
    score("children", "markers", "score", "regions", "conversion_maps", "flow_control"),
  ],
  [
    "regions",
    score("children", "markers", "score", "regions", "conversion_maps", "flow_control"),
    score("children", "markers", "score", "conversion_maps", "flow_control", "regions"),
  ],
  [
    "flow_control",
    score("children", "markers", "score", "conversion_maps", "flow_control", "regions"),
    null,
  ],
];

/** The README's steps on M: each band's address, its order, and its orders up and down. */
const MAP_STEPS: readonly [string, string[], string[] | null, string[] | null][] = [
  [
    "melody/children_1",
    D,
    null,
    melody("conversion_maps", "children", "melody", "markers", "regions", "flow_control"),
  ],
  [
    "melody/conversion_maps_1",
    D,
    melody("conversion_maps", "children", "melody", "markers", "regions", "flow_control"),
    melody("children", "melody", "conversion_maps", "markers", "regions", "flow_control"),
  ],
  [
    "melody/markers_1",
    D,
    melody("children", "conversion_maps", "markers", "melody", "regions", "flow_control"),
    null,
  ],
  [
    "phrase/conversion_maps_1",
    P,
    null,
    phrase("children", "phrase", "conversion_maps", "markers", "regions", "flow_control"),
  ],
];

describe("bandStep", () => {
  it.each(STYLED_STEPS)(
    "steps %s of score up and down past the next visible entry",
    (kind, up, down) => {
      expect(bandStep(STYLED_DRAWN, S(kind), "up", E)).toEqual(up);
      expect(bandStep(STYLED_DRAWN, S(kind), "down", E)).toEqual(down);
    },
  );

  it.each(MAP_STEPS)("steps %s past the visible entries only", (address, from, up, down) => {
    expect(bandStep(MAP_DRAWN, M(address), "up", from)).toEqual(up);
    expect(bandStep(MAP_DRAWN, M(address), "down", from)).toEqual(down);
  });
});

/** `view`'s block A with the band order of `timeline` set to `next` by `bandMoveCommand`. */
const moving = (view: View, timeline: string, next: readonly string[]) =>
  bandMoveCommand(view, A, timeline, next);

const setting = (timeline: string, value: readonly string[] | null) => ({
  type: "set",
  changes: [{ target: `${A}/${timeline}`, values: { order: value } }],
});

describe("bandMoveCommand", () => {
  const view = viewOf({ id: A, fixture: ROOT_ORDER });
  const R = melody("children", "melody", "conversion_maps", "markers", "regions", "flow_control");
  const Rp = phrase("children", "phrase", "conversion_maps", "markers", "regions", "flow_control");
  const moved = melody(
    "children",
    "melody",
    "markers",
    "conversion_maps",
    "regions",
    "flow_control",
  );

  it("states the manifest's band orders it reads", () => {
    expect(blockIn(view, A).manifest.graphical?.order).toEqual({ melody: R });
  });

  it("writes null for a root's default and a child's parent's order", () => {
    expect(moving(view, "melody", D)).toEqual(setting("melody", null));
    expect(moving(view, "melody", moved)).toEqual(setting("melody", moved));
    expect(moving(view, "phrase", Rp)).toEqual(setting("phrase", null));
    expect(moving(view, "phrase", P)).toEqual(setting("phrase", P));
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
 * A store holding block A with `fixture`, the editors `path` opened in
 * turn, one after the other.
 */
function storeIn(fixture: string, ...path: string[]): Store {
  const store = storeOf(viewOf({ id: A, fixture }));
  for (const target of path) expect(store.open(`${A}/${target}`)).toBeNull();
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
  const mapMoves = MAP_STEPS.flatMap(([address, , up, down]) => {
    const timeline = address.slice(0, address.indexOf("/"));
    const path = timeline === "phrase" ? ["melody", "phrase"] : ["melody"];
    return [up, down].flatMap((next) => (next === null ? [] : [[timeline, path, next] as const]));
  });

  it.each(mapMoves)("%s of map in its own editor, %j open", (timeline, path, next) => {
    const store = storeIn("map", ...path);
    expect(store.dispatch(bandMoveCommand(store.view, A, timeline, next))).toBeNull();
    expect(entryOf(store, timeline)).toEqual(next);
  });

  const R = melody("children", "melody", "conversion_maps", "markers", "regions", "flow_control");
  const Rp = phrase("children", "phrase", "conversion_maps", "markers", "regions", "flow_control");
  const moved = melody(
    "children",
    "melody",
    "markers",
    "conversion_maps",
    "regions",
    "flow_control",
  );

  it.each([
    ["melody", ["melody"], D, undefined],
    ["melody", ["melody"], moved, moved],
    ["phrase", ["melody", "phrase"], P, P],
  ] as const)("%s of map_root_band_order, %j open", (timeline, path, next, entry) => {
    const store = storeIn(ROOT_ORDER, ...path);
    expect(store.dispatch(bandMoveCommand(store.view, A, timeline, next))).toBeNull();
    expect(entryOf(store, timeline)).toEqual(entry);
    expect(entryOf(store, "melody")).toEqual(timeline === "melody" ? entry : R);
  });

  it("refuses the null of a timeline without an entry, which no move gives", () => {
    const store = storeIn(ROOT_ORDER, "melody", "phrase");
    expect(store.dispatch(bandMoveCommand(store.view, A, "phrase", Rp))).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [`${A}/phrase`, "order"],
    });
    expect(entryOf(store, "phrase")).toBeUndefined();
    expect(entryOf(store, "melody")).toEqual(R);
  });
});

describe("on layout's drawing of styled__score", () => {
  const view = viewOf({ id: A, fixture: STYLED });
  const drawn = () => drawingOf(blockIn(view, A), view.settings, metrics);
  const editing = { target: `${A}/score`, kind: "timeline" } as const;

  it("records the present bands of score from its band order", () => {
    const drawing = drawn();
    const lineOf = drawing.elements.find(
      (element) => element.type === "timeline" && element.address === "score",
    );
    const y = lineOf?.type === "timeline" ? lineOf.y : Number.NaN;
    expect(
      offeredBands(drawing, "score").map(({ address, band: { level, line, elements } }) => ({
        address,
        level,
        line,
        elements,
      })),
    ).toEqual([
      { address: "score/children_1", level: 2, line: y, elements: 1 },
      { address: "score/markers_1", level: 1, line: y, elements: 2 },
      { address: "score/conversion_maps_1", level: -1, line: y, elements: 1 },
      { address: "score/regions_1", level: -2, line: y, elements: 1 },
      { address: "score/flow_control_1", level: -3, line: y, elements: 1 },
    ]);
    expect(offeredBands(drawing, "b")).toEqual([]);
  });

  it.each(STYLED_STEPS)("steps, drops and hits %s as the records S do", (kind, up, down) => {
    const drawing = drawn();
    const band = record(drawing, `score/${kind}_1`);
    expect(bandStep(drawing, band, "up", E)).toEqual(up);
    expect(bandStep(drawing, band, "down", E)).toEqual(down);
    const middle = band.y + band.height / 2;
    expect(bandDrop(drawing, band, middle, E)).toBeNull();
    const point = { x: band.x + band.width / 2, y: middle };
    const card = sourceOf(drawing, "score/card");
    expect(hitOf(A, drawing, card, point, editing).address).toBe(`${A}/${band.address}`);
  });

  it("dispatches a step in score's editor", () => {
    const drawing = drawn();
    const next = bandStep(drawing, record(drawing, "score/markers_1"), "down", E);
    if (next === null) throw new Error("the markers band steps down");
    const store = storeIn(STYLED, "score");
    expect(store.dispatch(bandMoveCommand(store.view, A, "score", next))).toBeNull();
  });
});

describe("the selection readers", () => {
  const view = viewOf({ id: A, fixture: "map" });
  const timeline = (target: string) => ({ target, kind: "timeline" }) as const;

  it("reads a band address", () => {
    expect(selectedBand(view, `${A}/melody/markers_1`)).toEqual({
      block: A,
      timeline: "melody",
      kind: "markers",
    });
    for (const address of [
      A,
      `${A}/melody`,
      `${A}/melody/tempo`,
      `${A}/melody/start/label`,
      `${A}/nobody/regions_1`,
    ]) {
      expect(selectedBand(view, address)).toBeNull();
    }
  });

  it("keeps a band only in its timeline's editor", () => {
    const selection = new Set([
      `${A}/melody/markers_1`,
      `${A}/phrase/conversion_maps_1`,
      `${A}/melody/ticks`,
      `${A}/nobody/regions_1`,
    ]);
    const kept = (editing: Parameters<typeof existing>[2]) => [
      ...existing(view, selection, editing),
    ];
    expect(kept(timeline(`${A}/melody`))).toEqual([`${A}/melody/markers_1`, `${A}/melody/ticks`]);
    expect(kept(timeline(`${A}/phrase`))).toEqual([
      `${A}/phrase/conversion_maps_1`,
      `${A}/melody/ticks`,
    ]);
    expect(kept(timeline(`${A}/nobody`))).toEqual([]);
    expect(kept(timeline(`${B}/melody`))).toEqual([]);
    expect(kept({ target: A, kind: "bundle" })).toEqual([`${A}/melody/ticks`]);
    expect(kept(null)).toEqual([`${A}/melody/ticks`]);
    const one = new Set([`${A}/melody/markers_1`]);
    expect(existing(view, one, timeline(`${A}/melody`))).toBe(one);
  });

  it("offers a band by the rule existing keeps it by", () => {
    const bands = [`${A}/melody/markers_1`, `${A}/phrase/conversion_maps_1`];
    const offered = (editing: Parameters<typeof offersBand>[2]) =>
      bands.filter((address) => {
        const band = selectedBand(view, address);
        if (band === null) throw new Error(`${address} is no band`);
        return offersBand(view, band, editing);
      });
    expect(offered(timeline(`${A}/melody`))).toEqual([`${A}/melody/markers_1`]);
    expect(offered(timeline(`${A}/phrase`))).toEqual([`${A}/phrase/conversion_maps_1`]);
    expect(offered(timeline(`${A}/nobody`))).toEqual([]);
    expect(offered(timeline(`${B}/melody`))).toEqual([]);
    expect(offered({ target: A, kind: "bundle" })).toEqual([]);
    expect(offered(null)).toEqual([]);
    const elsewhere = { block: B, timeline: "melody", kind: "markers" } as const;
    expect(offersBand(view, elsewhere, timeline(`${B}/melody`))).toBe(false);
  });

  it("prunes every other band when an editor opens and closes", () => {
    const store = storeIn("map", "melody");
    const innermost = () => store.editing.at(-1) ?? null;
    const both = new Set([`${A}/melody/markers_1`, `${A}/melody/ticks`]);
    expect(existing(store.view, both, innermost())).toBe(both);
    expect(store.open(`${A}/phrase`)).toBeNull();
    expect([...existing(store.view, both, innermost())]).toEqual([`${A}/melody/ticks`]);
    store.done();
    expect(innermost()?.target).toBe(`${A}/melody`);
    expect([
      ...existing(store.view, new Set([`${A}/phrase/conversion_maps_1`]), innermost()),
    ]).toEqual([]);
    store.done();
    expect(innermost()).toBeNull();
    expect([...existing(store.view, new Set([`${A}/melody/markers_1`]), innermost())]).toEqual([]);
  });

  it("never removes a band", () => {
    const refused = { refused: "A band is not deleted; select its elements to delete them." };
    const remove = (...addresses: string[]) => removeCommand(view, new Set(addresses));
    expect(remove(`${A}/melody/markers_1`)).toEqual(refused);
    expect(remove(`${A}/melody/markers_1`, `${A}/phrase/conversion_maps_1`)).toEqual(refused);
    expect(remove(`${A}/melody/markers_1`, `${A}/melody/tempo`)).toEqual({
      type: "remove",
      targets: [`${A}/melody/tempo`],
    });
    expect(remove(`${A}/phrase/conversion_maps_1`, `${A}/phrase`)).toEqual({
      type: "remove",
      targets: [`${A}/phrase`],
    });
    expect(remove()).toEqual({ refused: "Nothing is selected." });
  });

  it("affects nothing through a selected band", () => {
    const manifest = load("map");
    expect(affectedBy(manifest, new Set(["melody/markers_1"]))).toEqual(new Set());
    expect(affectedBy(manifest, new Set(["phrase/conversion_maps_1", "melody/tempo"]))).toEqual(
      new Set(),
    );
    expect(affectedBy(manifest, new Set(["melody/children_1", "phrase"]))).toEqual(
      new Set(["melody/ticks"]),
    );
  });

  it("holds a band as its timeline's line", () => {
    expect(holdingOf(STYLED_DRAWN, new Set(["score/children_1"]))).toEqual({
      block: true,
      boxes: new Set(["score/card"]),
    });
    expect(holdingOf(MAP_DRAWN, new Set(["phrase/conversion_maps_1"]))).toEqual({
      block: true,
      boxes: new Set(["melody/card"]),
    });
    expect(holdingOf(STYLED_DRAWN, new Set(["a/conversion_maps_1"]))).toEqual({
      block: false,
      boxes: new Set(),
    });
  });

  it("never selects a band by a marquee", () => {
    const styled = viewOf({ id: A, fixture: STYLED });
    const inside = new Set([
      "score/card",
      "b",
      "score",
      "score/ticks",
      ...bandsOf(STYLED_DRAWN).map(({ address }) => address),
    ]);
    const node: BlockNode = {
      id: A,
      type: "block",
      position: { x: 0, y: 0 },
      data: {
        block: blockIn(styled, A),
        drawing: STYLED_DRAWN,
        descriptors: [],
        selectedElements: new Set(),
        affectedElements: new Set(),
        editing: timeline(`${A}/score`),
        inside,
      },
    };
    const whole = { x: 0, y: 0, width: 600, height: 200 };
    expect(elementsInRect(node, whole, inside, metrics)).toEqual([
      `${A}/b`,
      `${A}/score`,
      `${A}/score/ticks`,
    ]);
  });
});
