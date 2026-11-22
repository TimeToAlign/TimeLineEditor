/**
 * Elisions on the canvas (README, "Elisions on the canvas"): the pieces of
 * a drawing's strips, what a strip and its labels stand for, what it says,
 * the edges and widths its handles set, the commands storing them, and the
 * readings, places, presses and marquees around strips.
 */

import type { Address, ElementAddress, View } from "@timetoalign/tilie-core";
import {
  addressKey,
  apply,
  DEFAULT_GRANULARITY,
  idAddress,
  inBlock,
  isCommandError,
  partAddress,
  placeKeyText,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { holdingOf } from "../src/boxes.ts";
import { placesAt, readingAt } from "../src/coordinates.ts";
import { descriptorsOf, drawingOf } from "../src/drawing.ts";
import { elementsInRect } from "../src/marquee.ts";
import type { BlockNode } from "../src/node.ts";
import { pickable } from "../src/picking.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { pressedIn } from "../src/selectionRules.ts";
import type { EdgeContext, StripPiece, StripSubject } from "../src/strips.ts";
import {
  defaultsRemoval,
  edgeAt,
  edgeStep,
  piecesOf,
  storedAs,
  stripCommand,
  stripHoverAt,
  stripOf,
  stripsOf,
  stripText,
  subjectOf,
  widthFor,
} from "../src/strips.ts";
import { A, blockIn, metrics, storeOf, viewOf } from "./support.ts";

const STORED = viewOf({ id: A, fixture: "bundles/bundle_elisions_stored" });
const GRANDCHILD = viewOf({ id: A, fixture: "groups/group_grandchild" });

function drawingIn(view: View): Drawing {
  return drawingOf(blockIn(view, A), view.graphical, metrics);
}

function nodeOf(view: View): BlockNode {
  const [node] = project(view, NOTHING_SELECTED, [], metrics, null);
  if (node === undefined) throw new Error("no node");
  return node;
}

/** The canvas point of block A's local point. */
function canvas(view: View, x: number, y: number) {
  const { position } = nodeOf(view);
  return { x: position.x + x, y: position.y + y };
}

const ELISION = (id: string): ElementAddress => idAddress(id);
const DEFAULT = (id: string): ElementAddress => partAddress(idAddress(id), "elision");

/** The pieces of `address`, failing loudly without one. */
function pieces(view: View, address: ElementAddress): readonly StripPiece[] {
  const found = piecesOf(drawingIn(view), address);
  if (found.length === 0) throw new Error(`no piece at ${addressKey(address)}`);
  return found;
}

/** The subject of the `at`-th piece of `address`. */
function subject(view: View, address: ElementAddress, at = 0): StripSubject {
  const piece = pieces(view, address)[at];
  const found = piece === undefined ? null : subjectOf(blockIn(view, A).manifest, piece);
  if (found === null) throw new Error(`no subject at ${addressKey(address)}`);
  return found;
}

function context(view: View): EdgeContext {
  return {
    block: A,
    manifest: blockIn(view, A).manifest,
    drawing: drawingIn(view),
    granularity: DEFAULT_GRANULARITY,
  };
}

const q = (n: bigint, d = 1n) => Rational.fromParts(n, d);
const text = (value: Rational | null) => (value === null ? null : value.toString());

describe("the pieces", () => {
  it("lists the strips of bundle_elisions_stored in drawing order with their cards", () => {
    const listed = stripsOf(drawingIn(STORED)).map(({ element, card }) => [
      addressKey(element.address),
      card.key === null ? null : placeKeyText(card.key),
    ]);
    const score = placeKeyText({ item: "group_1", member: "score" });
    expect(listed).toEqual([
      [addressKey(ELISION("elision_4")), score],
      [addressKey(ELISION("elision_5")), score],
      [addressKey(ELISION("elision_6")), score],
      [addressKey(ELISION("elision_2")), placeKeyText({ item: "page" })],
    ]);
  });

  it("reads a strip and its labels as the strip, anything else as none", () => {
    const { manifest } = blockIn(STORED, A);
    expect(stripOf(manifest, ELISION("elision_4"))).toEqual(ELISION("elision_4"));
    expect(stripOf(manifest, { id: "elision_4", part: ["name"] })).toEqual(ELISION("elision_4"));
    expect(stripOf(manifest, { id: "elision_4", part: ["coordinate"] })).toEqual(
      ELISION("elision_4"),
    );
    expect(stripOf(manifest, idAddress("score"))).toBeNull();
    expect(stripOf(manifest, { id: "timestamp_1", part: ["name"] })).toBeNull();
    const grand = blockIn(GRANDCHILD, A).manifest;
    expect(stripOf(grand, DEFAULT("movement"))).toEqual(DEFAULT("movement"));
    expect(stripOf(grand, { id: "movement", part: ["elision", "coordinate"] })).toEqual(
      DEFAULT("movement"),
    );
  });

  it("says what each strip elides", () => {
    const say = (view: View) =>
      stripsOf(drawingIn(view)).map((piece) => stripText(blockIn(view, A).manifest, piece));
    expect(say(STORED)).toEqual([
      "Score, 0–16 quarters, elided",
      "Score, 32–48 quarters, elided",
      "Score, 48–56 quarters, elided",
      "Page, 600–1 754 pixels, elided",
    ]);
    expect(say(GRANDCHILD)).toEqual([
      "Score, 0–16 quarters, elided",
      "Movement, 0–8 quarters, elided",
      "Score, 32–64 quarters, elided",
    ]);
  });

  it("moves a stored elision's edges on the pieces reaching them, a default piece's both", () => {
    const edges = (view: View, address: ElementAddress) => {
      const found = subject(view, address);
      return [found.edges, text(found.start), text(found.end)];
    };
    expect(edges(STORED, ELISION("elision_4"))).toEqual([["start"], "0", "20"]);
    expect(edges(STORED, ELISION("elision_5"))).toEqual([["start", "end"], "32", "48"]);
    expect(edges(STORED, ELISION("elision_6"))).toEqual([["end"], "40", "56"]);
    expect(edges(STORED, ELISION("elision_2"))).toEqual([["start", "end"], "600", "1754"]);
    expect(edges(GRANDCHILD, DEFAULT("movement"))).toEqual([["start", "end"], "0", "8"]);
  });
});

describe("an edge under the pointer", () => {
  const at = (view: View, address: ElementAddress, edge: "start" | "end", x: number) =>
    text(edgeAt(context(view), subject(view, address), edge, x, 8, 0.5));

  it("reads the coordinate on the card's runs and strips, snapped and held", () => {
    expect(at(STORED, ELISION("elision_5"), "start", 1236.5579618566176)).toBe("30");
    expect(at(STORED, ELISION("elision_5"), "start", 936.5579618566177 + 5)).toBe("24");
    expect(at(STORED, ELISION("elision_5"), "start", 886.5579618566177)).toBe("24");
    expect(at(STORED, ELISION("elision_5"), "end", 1551.5579618566176)).toBe("52");
    expect(at(STORED, ELISION("elision_5"), "end", 2066.5579618566176)).toBe("64");
    expect(at(STORED, ELISION("elision_6"), "end", 1581.5579618566176)).toBe("563/10");
    expect(at(STORED, ELISION("elision_6"), "end", 1566.5579618566176 + 5)).toBe("56");
    expect(at(GRANDCHILD, DEFAULT("movement"), "end", 253.69419642857133 + 15)).toBe("8");
  });

  it("steps by the grid at the card's scale, stopping at a snapping value and a limit", () => {
    const step = (
      view: View,
      address: ElementAddress,
      edge: "start" | "end",
      direction: -1 | 1,
      size: number,
    ) => text(edgeStep(context(view), subject(view, address), edge, direction, size));
    expect(step(STORED, ELISION("elision_5"), "start", -1, 50)).toBe("31");
    expect(step(STORED, ELISION("elision_5"), "end", 1, 50)).toBe("49");
    expect(step(STORED, ELISION("elision_5"), "start", -1, 500)).toBe("24");
    expect(step(STORED, ELISION("elision_4"), "start", -1, 50)).toBeNull();
    expect(step(GRANDCHILD, DEFAULT("movement"), "end", 1, 50)).toBeNull();
    expect(step(STORED, ELISION("elision_2"), "start", -1, 50)).toBe("381");
  });
});

describe("a width", () => {
  const width = (view: View, address: ElementAddress, drawn: number) =>
    widthFor(context(view), subject(view, address), drawn, 0.5);

  it("is written in the elision's form, Automatic becoming Proportional", () => {
    expect(width(STORED, ELISION("elision_4"), 300)).toEqual({ ratio: 0.375 });
    expect(width(STORED, ELISION("elision_4"), 1000)).toEqual({ ratio: 1 });
    expect(width(STORED, ELISION("elision_5"), 250)).toEqual({ span: [5, 1] });
    expect(width(STORED, ELISION("elision_6"), 45.678)).toEqual({ canvas: 45.68 });
    expect(width(GRANDCHILD, DEFAULT("movement"), 100)).toEqual({ ratio: 0.25 });
  });
});

describe("the command", () => {
  it("sets the members of a stored elision that change", () => {
    const drawing = drawingIn(STORED);
    const moved = stripCommand(STORED, A, drawing, subject(STORED, ELISION("elision_5")), {
      start: q(30n),
    });
    expect(moved).toEqual({
      command: {
        type: "set",
        changes: [{ target: inBlock(A, ELISION("elision_5")), values: { start: [30, 1] } }],
      },
      stores: null,
    });
    expect(moved === null ? null : isCommandError(apply(STORED, moved.command))).toBe(false);
    expect(
      stripCommand(STORED, A, drawing, subject(STORED, ELISION("elision_5")), { start: q(32n) }),
    ).toBeNull();
    expect(
      stripCommand(STORED, A, drawing, subject(STORED, ELISION("elision_2")), { end: q(1700n) })
        ?.command,
    ).toEqual({
      type: "set",
      changes: [{ target: inBlock(A, ELISION("elision_2")), values: { end: 1700 } }],
    });
  });

  it("stores a default piece with its card's defaults in one add", () => {
    const drawing = drawingIn(GRANDCHILD);
    const changed = stripCommand(GRANDCHILD, A, drawing, subject(GRANDCHILD, DEFAULT("movement")), {
      start: q(4n),
    });
    expect(changed?.command).toEqual({
      type: "add",
      into: { block: A },
      elision: [
        { timeline: "score", start: [0, 1], end: [16, 1] },
        { timeline: "movement", start: [4, 1], end: [8, 1] },
        { timeline: "score", start: [32, 1], end: [64, 1] },
      ],
    });
    if (changed === null || changed.stores === null) throw new Error("nothing stored");
    const store = storeOf(GRANDCHILD);
    const before = store.journal.length;
    expect(store.dispatch(changed.command)).toBeNull();
    expect(store.journal.length).toBe(before + 1);
    expect(storedAs(store.view, A, changed.stores)).toEqual(inBlock(A, ELISION("elision_2")));
    const widened = stripCommand(GRANDCHILD, A, drawing, subject(GRANDCHILD, DEFAULT("score")), {
      width: { ratio: 0.125 },
    });
    expect(widened?.command).toEqual({
      type: "add",
      into: { block: A },
      elision: [
        { timeline: "score", start: [0, 1], end: [16, 1], width: { ratio: 0.125 } },
        { timeline: "movement", start: [0, 1], end: [8, 1] },
        { timeline: "score", start: [32, 1], end: [64, 1] },
      ],
    });
  });

  it("deletes defaults by storing the others of their card", () => {
    const drawing = drawingIn(GRANDCHILD);
    expect(defaultsRemoval(GRANDCHILD, A, drawing, [DEFAULT("movement")])).toEqual({
      type: "add",
      into: { block: A },
      elision: [
        { timeline: "score", start: [0, 1], end: [16, 1] },
        { timeline: "score", start: [32, 1], end: [64, 1] },
      ],
    });
    expect(defaultsRemoval(GRANDCHILD, A, drawing, [DEFAULT("score")])).toEqual({
      type: "add",
      into: { block: A },
      elision: [{ timeline: "movement", start: [0, 1], end: [8, 1] }],
    });
    expect(
      defaultsRemoval(GRANDCHILD, A, drawing, [DEFAULT("score"), DEFAULT("movement")]),
    ).toEqual({
      refused:
        "The last automatic elisions of a card are not deleted: choose Full to draw it whole.",
    });
  });
});

describe("readings around strips", () => {
  const read = (x: number, y: number) =>
    readingAt([nodeOf(STORED)], canvas(STORED, x, y), {
      zoom: 1,
      ratio: 1,
      granularity: DEFAULT_GRANULARITY,
    });
  const LINE = 105.98828125;

  it("reads every run of the elided line", () => {
    const second = read(1766.5579618566176, LINE);
    expect([second?.hit.axis.timeline, text(second?.position ?? null), second?.at.x]).toEqual([
      "score",
      "60",
      1766.5579618566176,
    ]);
    expect(text(read(1616.5579618566176, LINE)?.position ?? null)).toBe("57");
    expect(text(read(1236.5579618566176, LINE)?.position ?? null)).toBe("30");
  });

  it("places nothing inside a strip, which says what it elides", () => {
    expect(read(1551.5579618566176, LINE)).toBeNull();
    expect(read(1563.5579618566176, LINE)).toBeNull();
    const point = canvas(STORED, 1551.5579618566176, LINE);
    const hover = stripHoverAt([nodeOf(STORED)], point);
    expect(hover === null ? null : [hover.block, hover.text, hover.x, hover.top]).toEqual([
      A,
      "Score, 48–56 quarters, elided",
      point.x,
      canvas(STORED, 0, 57.01171875).y,
    ]);
  });

  it("places a coordinate on the run holding it, none in an elided stretch", () => {
    const drawing = drawingIn(STORED);
    const sixty = placesAt(drawing, "score", q(60n), null);
    expect(sixty.map((place) => [place.axis.xStart, place.x])).toEqual([
      [1566.5579618566176, 1766.5579618566176],
    ]);
    expect(placesAt(drawing, "score", q(40n), null)).toEqual([]);
  });
});

describe("a press, the holding mark, the marquee and picking", () => {
  /** What a press on the first descriptor drawing `address` selects. */
  function pressOn(view: View, address: ElementAddress): Address | null {
    const node = nodeOf(view);
    const source = descriptorsOf(node.data.drawing).find(
      (descriptor) => addressKey(descriptor.source.address) === addressKey(address),
    )?.source;
    if (source === undefined) throw new Error(`nothing drawn at ${addressKey(address)}`);
    return pressedIn({ node, source, point: null, pane: false }, null);
  }

  it("selects the strip for itself and its labels", () => {
    expect(pressOn(STORED, { id: "elision_5", part: ["name"] })).toEqual(
      inBlock(A, ELISION("elision_5")),
    );
    expect(pressOn(STORED, ELISION("elision_5"))).toEqual(inBlock(A, ELISION("elision_5")));
    expect(pressOn(GRANDCHILD, { id: "movement", part: ["elision", "coordinate"] })).toEqual(
      inBlock(A, DEFAULT("movement")),
    );
  });

  it("marks the card holding a selected strip", () => {
    const address = ELISION("elision_5");
    const holding = holdingOf(drawingIn(STORED), new Map([[addressKey(address), address]]));
    expect(holding.block).toBe(true);
    expect(holding.boxes.has(placeKeyText({ item: "group_1", member: "score" }))).toBe(true);
    expect(holding.boxes.has(placeKeyText({ item: "group_1" }))).toBe(false);
  });

  it("takes a strip whole with its labels folded into it", () => {
    const node = nodeOf(STORED);
    const taken = (x1: number, y1: number, x2: number, y2: number) => {
      const from = canvas(STORED, x1, y1);
      const rect = { x: from.x, y: from.y, width: x2 - x1, height: y2 - y1 };
      return elementsInRect(node, rect, node.data.inside, metrics).filter(
        (address) => address.id === "elision_2",
      );
    };
    expect(taken(670, 305, 815, 363)).toEqual([inBlock(A, ELISION("elision_2"))]);
    expect(taken(670, 305, 815, 330)).toEqual([]);
  });

  it("picks nothing on a default strip and its labels", () => {
    const node = nodeOf(GRANDCHILD);
    const { manifest } = node.data.block;
    const hit = (address: ElementAddress) => ({
      block: A,
      kind: "element" as const,
      address: inBlock(A, address),
      box: null,
      boundary: false,
      within: null,
    });
    expect(pickable(hit(DEFAULT("movement")), manifest)).toBeNull();
    expect(pickable(hit({ id: "movement", part: ["elision", "name"] }), manifest)).toBeNull();
    const stored = blockIn(STORED, A).manifest;
    expect(pickable(hit({ id: "elision_5", part: ["name"] }), stored)).toBeNull();
  });
});
