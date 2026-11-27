/**
 * Elisions on the canvas (README, "Elisions on the canvas", items 1–4 and
 * 7–16): the pieces of a drawing's gaps, what a gap and its parts stand
 * for, what it says, what takes handles, the changes a drag and a step
 * make under the gap modes, the commands storing them, the defaults
 * persisted and removed, and the readings, presses, holding marks,
 * marquees and picks around gaps.
 */

import type { Address, ElementAddress, View } from "@timetoalign/tilie-core";
import {
  addressKey,
  DEFAULT_GRANULARITY,
  elisionsUnder,
  idAddress,
  inBlock,
  partAddress,
  placeKeyText,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { holdingOf } from "../src/boxes.ts";
import { readingAt } from "../src/coordinates.ts";
import { descriptorsOf, drawingOf } from "../src/drawing.ts";
import type { GapContext, GapEdge, GapModes, GapSubject } from "../src/gaps.ts";
import {
  defaultsRemoval,
  defaultsStored,
  gapCommand,
  gapDrag,
  gapHoverAt,
  gapOf,
  gapStep,
  gapsOf,
  gapText,
  isDefaultGap,
  piecesOf,
  storedAs,
  subjectOf,
} from "../src/gaps.ts";
import { elementsInRect } from "../src/marquee.ts";
import type { BlockNode } from "../src/node.ts";
import { pickable } from "../src/picking.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { pressedIn } from "../src/selectionRules.ts";
import { A, blockIn, changed, metrics, storeOf, viewOf, withAutoElisions } from "./support.ts";

const STORED = viewOf({ id: A, fixture: "bundles/bundle_elisions_stored" });
/** The two fixtures whose ancestor cards derive their elisions, under `elision-mode` `auto`. */
const MEMBERS = withAutoElisions(viewOf({ id: A, fixture: "groups/group_elided_members" }));
const INSIDE = withAutoElisions(viewOf({ id: A, fixture: "groups/group_elided_inside" }));

const drawingIn = (view: View): Drawing => drawingOf(blockIn(view, A), view.graphical, metrics);

function nodeOf(view: View): BlockNode {
  const [node] = project(view, NOTHING_SELECTED, [], metrics, null);
  if (node === undefined) throw new Error("no node");
  return node;
}

const ELISION = (id: string): ElementAddress => idAddress(id);
const DEFAULT = (id: string): ElementAddress => partAddress(idAddress(id), "elision");
const SCORE_CARD = { item: "group_1", member: "score" };
const FRAME = { item: "group_1" };

/** The subject of the piece of `address` in the container `key`. */
function subject(view: View, address: ElementAddress, key: object = SCORE_CARD): GapSubject {
  const drawing = drawingIn(view);
  const piece = piecesOf(drawing, address).find(
    ({ exposure }) => placeKeyText(exposure.key) === placeKeyText(key as never),
  );
  const found = piece === undefined ? null : subjectOf(blockIn(view, A).manifest, drawing, piece);
  if (found === null) throw new Error(`no subject at ${addressKey(address)}`);
  return found;
}

function context(view: View): GapContext {
  return {
    block: A,
    manifest: blockIn(view, A).manifest,
    drawing: drawingIn(view),
    granularity: DEFAULT_GRANULARITY,
  };
}

const COORDINATES: GapModes = { coordinates: true, width: false };
const WIDTH: GapModes = { coordinates: false, width: true };
const BOTH: GapModes = { coordinates: true, width: true };

const q = (n: bigint, d = 1n) => Rational.fromParts(n, d);
const text = (value: Rational | undefined) => value?.toString();

/** The command a drag of `edge` of `address` by `dx` stores, under `modes`. */
function dragged(
  view: View,
  address: ElementAddress,
  edge: GapEdge,
  dx: number,
  modes: GapModes,
  key: object = SCORE_CARD,
) {
  const at = subject(view, address, key);
  const change = gapDrag(context(view), at, edge, dx, modes, 8, 0.5);
  return change === null ? null : gapCommand(view, A, at, change);
}

/** The values one `set` on `{block: A, id}` writes. */
const set = (id: string, values: object) => ({
  type: "set",
  changes: [{ target: inBlock(A, ELISION(id)), values }],
});

describe("what is drawn and what it stands for", () => {
  it("lists the pieces of bundle_elisions_stored in drawing order with their containers", () => {
    expect(
      gapsOf(drawingIn(STORED)).map(({ element, exposure, gap }) => [
        addressKey(element.address),
        exposure.kind,
        placeKeyText(exposure.key),
        gap.origin,
      ]),
    ).toEqual([
      [addressKey(ELISION("elision_4")), "ancestor_card", placeKeyText(SCORE_CARD), "stored"],
      [addressKey(ELISION("elision_3")), "ancestor_card", placeKeyText(SCORE_CARD), "carried"],
      [addressKey(ELISION("elision_5")), "ancestor_card", placeKeyText(SCORE_CARD), "stored"],
      [addressKey(ELISION("elision_6")), "ancestor_card", placeKeyText(SCORE_CARD), "stored"],
      [
        addressKey(ELISION("elision_3")),
        "ancestor_card",
        placeKeyText({ item: "group_1", member: "session" }),
        "carried",
      ],
      [addressKey(ELISION("elision_2")), "card", placeKeyText({ item: "page" }), "stored"],
      [addressKey(ELISION("elision_3")), "frame", placeKeyText(FRAME), "stored"],
    ]);
  });

  it("folds a gap's ellipses and labels into the gap", () => {
    const stored = blockIn(STORED, A).manifest;
    for (const part of [[], ["ellipsis"], ["name"], ["id"], ["coordinate"]]) {
      expect(gapOf(stored, { id: "elision_4", part } as ElementAddress)).toEqual(
        ELISION("elision_4"),
      );
    }
    expect(gapOf(stored, idAddress("score"))).toBeNull();
    const inside = blockIn(INSIDE, A).manifest;
    for (const part of [["elision"], ["elision", "ellipsis"], ["elision", "coordinate"]]) {
      expect(gapOf(inside, { id: "first", part } as ElementAddress)).toEqual(DEFAULT("first"));
    }
    expect(gapOf(inside, { id: "first", part: ["elision", "id"] } as ElementAddress)).toBeNull();
    expect([isDefaultGap(DEFAULT("first")), isDefaultGap(ELISION("elision_4"))]).toEqual([
      true,
      false,
    ]);
  });

  it("says what a gap elides", () => {
    const texts = (view: View) =>
      gapsOf(drawingIn(view)).map((piece) => gapText(blockIn(view, A).manifest, piece));
    expect(texts(STORED)).toEqual([
      "Score, 0–16 ♩, elided",
      "Recording, 0″–2″, elided",
      "Score, 32–48 ♩, elided",
      "Score, 48–56 ♩, elided",
      "Recording, 0″–2″, elided",
      "Page, 600–1 754 px, elided",
      "Recording, 0″–2″, elided",
    ]);
    expect(texts(MEMBERS)[0]).toBe("Piece, 1–15 ♩, elided");
  });

  it("gives handles to stored gaps alone, on the edges each piece reaches", () => {
    const drawing = drawingIn(STORED);
    const manifest = blockIn(STORED, A).manifest;
    expect(
      gapsOf(drawing).map((piece) => subjectOf(manifest, drawing, piece)?.edges ?? null),
    ).toEqual([
      ["start"],
      null,
      ["start", "end"],
      ["end"],
      null,
      ["start", "end"],
      ["start", "end"],
    ]);
    const defaults = drawingIn(MEMBERS);
    const [first] = gapsOf(defaults);
    expect(first === undefined ? 0 : subjectOf(blockIn(MEMBERS, A).manifest, defaults, first)).toBe(
      null,
    );
  });

  it("keeps an edge from crossing the protected span and the frame's other gaps", () => {
    const kept = (at: GapSubject) => at.kept.map(([a, b]) => [a.toString(), b.toString()]);
    expect(kept(subject(STORED, ELISION("elision_5")))).toEqual([["16", "24"]]);
    expect(kept(subject(STORED, ELISION("elision_2"), { item: "page" }))).toEqual([]);
    expect(kept(subject(MEMBERS, ELISION("elision_1"), FRAME))).toEqual([["28/3", "12"]]);
    expect(kept(subject(MEMBERS, ELISION("elision_2"), FRAME))).toEqual([["-9", "0"]]);
  });
});

describe("handles and keys", () => {
  it("moves the coordinates by the scale of the run beside the edge", () => {
    expect(dragged(STORED, ELISION("elision_5"), "start", -100, COORDINATES)).toEqual(
      set("elision_5", { start: [30, 1] }),
    );
    expect(dragged(STORED, ELISION("elision_5"), "start", -400, COORDINATES)).toEqual(
      set("elision_5", { start: [24, 1] }),
    );
    expect(dragged(STORED, ELISION("elision_5"), "start", -450, COORDINATES)).toEqual(
      set("elision_5", { start: [24, 1] }),
    );
    expect(dragged(STORED, ELISION("elision_5"), "end", 50, COORDINATES)).toEqual(
      set("elision_5", { end: [49, 1] }),
    );
    expect(dragged(STORED, ELISION("elision_6"), "end", 50, COORDINATES)).toEqual(
      set("elision_6", { end: [57, 1] }),
    );
    expect(dragged(STORED, ELISION("elision_6"), "end", 450, COORDINATES)).toEqual(
      set("elision_6", { end: [64, 1] }),
    );
    expect(dragged(STORED, ELISION("elision_4"), "start", -50, COORDINATES)).toBeNull();
    expect(dragged(MEMBERS, ELISION("elision_1"), "end", 50, COORDINATES, FRAME)).toEqual(
      set("elision_1", { end: [28, 3] }),
    );
    expect(
      dragged(STORED, ELISION("elision_2"), "start", -50, COORDINATES, { item: "page" }),
    ).toEqual(set("elision_2", { start: 381 }));
  });

  it("moves the width alone, written in the elision's form", () => {
    expect(dragged(STORED, ELISION("elision_4"), "start", -50, WIDTH)).toEqual(
      set("elision_4", { width: { ratio: 0.5625 } }),
    );
    expect(dragged(STORED, ELISION("elision_6"), "end", 15, WIDTH)).toEqual(
      set("elision_6", { width: { canvas: 45 } }),
    );
    expect(dragged(STORED, ELISION("elision_6"), "end", 50, WIDTH)).toEqual(
      set("elision_6", { width: { canvas: 80 } }),
    );
    expect(dragged(STORED, ELISION("elision_5"), "end", 50, WIDTH)).toEqual(
      set("elision_5", { width: { span: [5, 1] } }),
    );
    expect(dragged(STORED, ELISION("elision_2"), "end", 50, WIDTH, { item: "page" })).toEqual(
      set("elision_2", { width: { canvas: 82 } }),
    );
    expect(dragged(MEMBERS, ELISION("elision_2"), "end", 50, WIDTH, FRAME)).toEqual(
      set("elision_2", { width: { ratio: 1 } }),
    );
  });

  it("writes a canvas width in the frame's own units, its scale divided out", () => {
    const shared = viewOf({ id: A, fixture: "bundles/bundle_groupstamp_shared_member" });
    const scaled = changed(shared, {
      type: "set",
      changes: [{ target: { block: A, id: "g2" }, values: { place: { scale: 1.5 } } }],
    });
    expect(dragged(scaled, ELISION("elision_1"), "end", 15, WIDTH, { item: "g2" })).toEqual(
      set("elision_1", { width: { canvas: 34 } }),
    );
    expect(dragged(scaled, ELISION("elision_1"), "end", 15, WIDTH, { item: "g1" })).toEqual(
      set("elision_1", { width: { canvas: 39 } }),
    );
  });

  it("moves both, the drawn width following the natural one", () => {
    expect(dragged(STORED, ELISION("elision_5"), "end", 50, BOTH)).toEqual(
      set("elision_5", { end: [49, 1], width: { span: [5, 1] } }),
    );
    expect(dragged(STORED, ELISION("elision_6"), "end", 50, BOTH)).toEqual(
      set("elision_6", { end: [57, 1], width: { canvas: 80 } }),
    );
    const natural = 66.66666666666666 + 2 * (400 / 24);
    const drawn = 33.33333333333333 + (natural - 66.66666666666666);
    expect(dragged(MEMBERS, ELISION("elision_2"), "end", 50, BOTH, FRAME)).toEqual(
      set("elision_2", { end: [8, 1], width: { ratio: drawn / natural } }),
    );
    expect(drawn / natural).toBe(0.6666666666666667);
  });

  it("steps an edge by the grid under the modes", () => {
    const step = (
      address: ElementAddress,
      edge: GapEdge,
      direction: -1 | 1,
      size: number,
      modes: GapModes,
    ) => {
      const at = subject(STORED, address);
      const change = gapStep(context(STORED), at, edge, direction, size, modes);
      return change === null ? null : gapCommand(STORED, A, at, change);
    };
    expect(step(ELISION("elision_5"), "start", -1, 50, COORDINATES)).toEqual(
      set("elision_5", { start: [31, 1] }),
    );
    expect(step(ELISION("elision_5"), "end", 1, 50, COORDINATES)).toEqual(
      set("elision_5", { end: [49, 1] }),
    );
    expect(step(ELISION("elision_5"), "start", -1, 500, COORDINATES)).toEqual(
      set("elision_5", { start: [24, 1] }),
    );
    expect(step(ELISION("elision_4"), "start", -1, 50, COORDINATES)).toBeNull();
    expect(step(ELISION("elision_6"), "end", 1, 50, WIDTH)).toEqual(
      set("elision_6", { width: { canvas: 80 } }),
    );
    expect(step(ELISION("elision_4"), "start", -1, 50, WIDTH)).toEqual(
      set("elision_4", { width: { ratio: 0.5625 } }),
    );
  });

  it("stores nothing where nothing changes", () => {
    const at = subject(STORED, ELISION("elision_5"));
    expect(gapCommand(STORED, A, at, { start: q(32n) })).toBeNull();
    expect(gapCommand(STORED, A, at, { start: q(30n) })).toEqual(
      set("elision_5", { start: [30, 1] }),
    );
  });
});

describe("the defaults", () => {
  it("persists a card's default gaps as drawn, in one add", () => {
    const card = { item: "group_1", member: "piece" };
    const command = defaultsStored(INSIDE, A, drawingIn(INSIDE), card);
    expect(command).toEqual({
      type: "add",
      into: { block: A },
      elision: [
        {
          timeline: "first",
          start: [0, 1],
          end: [8, 1],
          width: { canvas: 57.14285714285714 },
          display: ["ellipsis", "name"],
        },
        {
          timeline: "first",
          start: [16, 1],
          end: [32, 1],
          width: { canvas: 114.28571428571428 },
          display: ["ellipsis", "name"],
        },
        {
          timeline: "second",
          start: [1, 1],
          end: [31, 1],
          width: { canvas: 128.57142857142856 },
          display: ["ellipsis", "name"],
        },
      ],
    });
    const store = storeOf(INSIDE);
    if ("refused" in command) throw new Error(command.refused);
    // Given an ID each, in list order: the second gap of the list is stored as the second ID.
    expect(store.dispatch({ ...command, ids: ["gap_1", "gap_2", "gap_3"] })).toBeNull();
    const entry = { timeline: "first", start: q(16n), end: q(32n) };
    expect(storedAs(store.view, A, entry)).toEqual(inBlock(A, ELISION("gap_2")));
    const members = defaultsStored(MEMBERS, A, drawingIn(MEMBERS), card);
    expect("refused" in members || members.type !== "add" ? null : members.elision).toEqual(
      [
        [1, 15],
        [33, 47],
      ].map(([start, end]) => ({
        timeline: "piece",
        start: [start, 1],
        end: [end, 1],
        width: { canvas: 74.33333333333334 },
        display: ["ellipsis", "name"],
      })),
    );
    expect(defaultsStored(STORED, A, drawingIn(STORED), SCORE_CARD)).toEqual({
      refused: "The card draws no automatic elision.",
    });
  });

  it("removes a root's card elisions in one remove", () => {
    const stored = elisionsUnder(blockIn(STORED, A).manifest, "score");
    expect(defaultsRemoval(STORED, A, "score")).toEqual({
      type: "remove",
      targets: stored.map((elision) => inBlock(A, ELISION(elision.id))),
    });
    expect(stored.map(({ id }) => id).sort()).toEqual([
      "elision_1",
      "elision_4",
      "elision_5",
      "elision_6",
    ]);
    expect(defaultsRemoval(MEMBERS, A, "piece")).toBeNull();
  });
});

describe("on the canvas", () => {
  const LINE = 105.98828125;

  it("reads nothing inside a gap, which says what it elides", () => {
    const at = { x: nodeOf(STORED).position.x + 1532.2615751378676, y: LINE };
    const point = { x: at.x, y: nodeOf(STORED).position.y + LINE };
    expect(
      readingAt([nodeOf(STORED)], point, { zoom: 1, ratio: 1, granularity: DEFAULT_GRANULARITY }),
    ).toBeNull();
    expect(gapHoverAt([nodeOf(STORED)], point)?.text).toBe("Score, 32–48 ♩, elided");
  });

  /** What a press on the first descriptor drawing `address` selects. */
  function pressOn(view: View, address: ElementAddress): Address | null {
    const node = nodeOf(view);
    const source = descriptorsOf(node.data.drawing).find(
      (descriptor) => addressKey(descriptor.source.address) === addressKey(address),
    )?.source;
    if (source === undefined) throw new Error(`nothing drawn at ${addressKey(address)}`);
    return pressedIn({ node, source, point: null, pane: false }, null);
  }

  it("selects the gap for its ellipsis", () => {
    expect(pressOn(STORED, { id: "elision_4", part: ["ellipsis"] })).toEqual(
      inBlock(A, ELISION("elision_4")),
    );
  });

  it("holds a group elision by its frame and the cards carrying it", () => {
    const holding = (id: string) => {
      const address = ELISION(id);
      return [
        ...holdingOf(drawingIn(STORED), new Map([[addressKey(address), address]])).boxes,
      ].sort();
    };
    expect(holding("elision_3")).toEqual(
      [FRAME, SCORE_CARD, { item: "group_1", member: "session" }].map(placeKeyText).sort(),
    );
    expect(holding("elision_5")).toEqual([placeKeyText(SCORE_CARD)]);
  });

  it("takes a gap whole with its parts", () => {
    const node = nodeOf(STORED);
    const taken = (x1: number, y1: number, x2: number, y2: number) => {
      const rect = {
        x: node.position.x + x1,
        y: node.position.y + y1,
        width: x2 - x1,
        height: y2 - y1,
      };
      return elementsInRect(node, rect, node.data.inside, metrics).filter(
        (address) => address.id === "elision_2",
      );
    };
    expect(taken(700, 265, 880, 335)).toEqual([inBlock(A, ELISION("elision_2"))]);
    expect(taken(700, 265, 880, 320)).toEqual([]);
  });

  it("picks nothing on a gap and its parts", () => {
    const hit = (address: ElementAddress) => ({
      block: A,
      kind: "element" as const,
      address: inBlock(A, address),
      box: null,
      boundary: false,
      within: null,
    });
    const inside = blockIn(INSIDE, A).manifest;
    expect(pickable(hit(DEFAULT("first")), inside)).toBeNull();
    expect(pickable(hit({ id: "first", part: ["elision", "ellipsis"] }), inside)).toBeNull();
    const stored = blockIn(STORED, A).manifest;
    expect(pickable(hit({ id: "elision_5", part: ["name"] }), stored)).toBeNull();
  });
});

describe("the values", () => {
  it("writes the README's stretches exactly", () => {
    expect(text(subject(STORED, ELISION("elision_6")).start)).toBe("40");
  });
});
