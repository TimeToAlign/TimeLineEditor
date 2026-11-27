/**
 * A card's elisions moving: the canvas's reading of two drawings into the
 * motion sideways and the unfolding of an ancestor card shown or hidden.
 * The cases are in `README.md` ("A card's elisions moving", points 17 to
 * 22); every expected abscissa is read from the drawing records.
 */

import type { View } from "@timetoalign/tilie-core";
import { placeKeyText, samePlaceKey } from "@timetoalign/tilie-core";
import { toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { lineAxes, TextMeasure } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import type { CardMotion, Drawn } from "../src/animation/elide.ts";
import { blockMotion, unfoldingMotion } from "../src/animation/elide.ts";
import { raiseUnfold } from "../src/animation/raise.ts";
import { placedAt, spanAt } from "../src/animation/unfold.ts";
import { descriptorsOf, drawingOf } from "../src/drawing.ts";
import {
  A,
  blockIn,
  changed,
  metrics,
  viewOf,
  withAutoElisions,
  withFullCards,
  withoutAncestorCards,
} from "./support.ts";

/** One `set` of `values` on the elision `id` of block A. */
const setOf = (id: string, values: object) => ({
  type: "set",
  changes: [{ target: { block: A, id }, values }],
});

const measure = new TextMeasure(metrics);
const float = (value: Parameters<typeof toRational>[0]) => toFloat(toRational(value));

/** Block A of `view`, drawn, with its manifest and descriptors. */
function drawnOf(view: View): Drawn {
  const block = blockIn(view, A);
  const drawing = drawingOf(block, view.graphical, metrics);
  return { manifest: block.manifest, drawing, descriptors: descriptorsOf(drawing) };
}

/**
 * A `groups/` fixture in block A drawn Elided (its ancestor cards deriving their elisions under
 * `elision-mode` `auto`), Full and with its ancestor cards hidden.
 */
function views(fixture: string) {
  const view = withAutoElisions(viewOf({ id: A, fixture: `groups/${fixture}` }));
  return {
    elided: drawnOf(view),
    full: drawnOf(withFullCards(view)),
    hidden: drawnOf(withoutAncestorCards(view)),
  };
}

/** The one ancestor card of `drawn`. */
function ancestorCard({ drawing }: Drawn): DrawnBox {
  const cards = drawing.boxes.filter((box) => box.ancestor !== undefined);
  const [card] = cards;
  if (cards.length !== 1 || card === undefined) throw new Error(`${cards.length} ancestor cards`);
  return card;
}

/** Linear between two abscissas, exactly an end at its value. */
function between(x1: number, x2: number, v1: number, v2: number, v: number): number {
  if (v === v1) return x1;
  if (v === v2) return x2;
  return x1 + ((x2 - x1) * (v - v1)) / (v2 - v1);
}

/**
 * Where the Full drawing `full` draws `value` of `timeline` in its ancestor
 * card: on that timeline's own line, which the Full card draws whole.
 */
/**
 * The abscissa the Full card draws `value` of `timeline` at, as the `edge` of a piece: a run of
 * its line starting there for a piece's start, one ending there for its end, so that the two
 * sides of a seam (where one run ends and the next starts at one value) stay apart.
 */
function fullAt(full: Drawn, timeline: string, value: number, edge: "start" | "end"): number {
  const card = ancestorCard(full);
  let inside: number | undefined;
  for (const axis of lineAxes(full.drawing).values()) {
    if (axis.timeline !== timeline || card.key === null || !samePlaceKey(axis.card, card.key)) {
      continue;
    }
    const start = float(axis.start);
    const end = start + float(axis.drawnLength);
    if (edge === "start" && value === start) return axis.xStart;
    if (edge === "end" && value === end) return axis.xEnd;
    if (value >= start && value <= end) inside = between(axis.xStart, axis.xEnd, start, end, value);
  }
  if (inside === undefined) throw new Error(`${timeline} ${value} is not drawn`);
  return inside;
}

interface Piece {
  readonly elided: readonly [number, number];
  readonly full: readonly [number, number];
}

/**
 * The pieces of the Elided card of `elided`: each full run (an axis of its
 * card) and each strip, its two abscissas against the two abscissas the
 * Full card of `full` draws the same values at (`fullAt`).
 */
function piecesOf(elided: Drawn, full: Drawn): Piece[] {
  const card = ancestorCard(elided);
  const pieces: Piece[] = [];
  for (const axis of lineAxes(elided.drawing).values()) {
    if (card.key === null || !samePlaceKey(axis.card, card.key)) continue;
    const start = float(axis.start);
    const end = start + float(axis.drawnLength);
    pieces.push({
      elided: [axis.xStart, axis.xEnd],
      full: [fullAt(full, axis.timeline, start, "start"), fullAt(full, axis.timeline, end, "end")],
    });
  }
  for (let index = card.range.start; index < card.range.end; index += 1) {
    const element = elided.drawing.elements[index];
    if (element?.type !== "elision") continue;
    const { timeline, start, end } = element.elided;
    pieces.push({
      elided: [element.x1, element.x2],
      full: [
        fullAt(full, timeline, float(start), "end"),
        fullAt(full, timeline, float(end), "start"),
      ],
    });
  }
  return pieces;
}

/**
 * The abscissa `x` of one card stands for in the other: with `toFull` an
 * Elided abscissa read in the Full card, else a Full abscissa read in the
 * Elided card, through the first piece holding it, linear in it.
 */
function across(elided: Drawn, full: Drawn, x: number, toFull: boolean): number {
  for (const piece of piecesOf(elided, full)) {
    const [from, to] = toFull ? [piece.elided, piece.full] : [piece.full, piece.elided];
    if (x >= from[0] && x <= from[1]) return between(to[0], to[1], from[0], from[1], x);
  }
  throw new Error(`${x} lies in no piece`);
}

/** A card's place key text. */
function keyText(card: DrawnBox): string {
  if (card.key === null) throw new Error("no place key");
  return placeKeyText(card.key);
}

/** The indexes of the elements of the drawing after that `motion` moves. */
function indexesOf(motion: CardMotion, drawn: Drawn): number[] {
  return drawn.drawing.elements.flatMap((_, index) => (motion.holds(index) ? [index] : []));
}

/** The one card that moves from `before` to `after`, nothing leaving. */
function onlyCard(before: Drawn, after: Drawn): CardMotion {
  const { cards, leaving } = blockMotion(before, after, measure);
  expect(leaving).toEqual([]);
  expect(cards.map((card) => card.key)).toEqual([keyText(ancestorCard(after))]);
  const [card] = cards;
  if (card === undefined) throw new Error("no card moves");
  return card;
}

/**
 * The distances the ancestor card's lines move between Elided and Full: none for a row above
 * the derived elisions' label stacks, one stack line of size 9 (`h(9)` 10.4765625 and the
 * band's spacing) for every row below them (`README.md`, "Elisions moving", item 18).
 */
const ROW_SHIFTS = [0, 19.9765625];

const isLine = (drawn: Drawn, index: number) => {
  const type = drawn.drawing.elements[index]?.type;
  return type === "timeline" || type === "child";
};

/** The lines of each fixture's ancestor card (one element each) and its default gaps, as drawn. */
const CARDS = {
  group_elided_inside: {
    lines: ["piece", "first", "excerpt", "second"],
    gaps: ["first", "first", "second"],
  },
  group_grandchild: { lines: ["score", "movement", "theme"], gaps: ["score", "movement", "score"] },
} as const;

describe.each([
  ["group_elided_inside", "piece", []],
  ["group_grandchild", "score", []],
] as const)("%s between Elided and Full", (fixture, root, hidden) => {
  const { elided, full } = views(fixture);

  it("moves the ancestor card alone", () => {
    expect(ancestorCard(elided).key).toEqual({ item: "group_1", member: root });
    onlyCard(elided, full);
    onlyCard(full, elided);
  });

  it.each([
    ["Elided → Full", elided, full],
    ["Full → Elided", full, elided],
  ])("moves each line's row by the change of its ordinate, %s", (_way, before, after) => {
    const card = onlyCard(before, after);
    const rowOf = (drawn: Drawn, timeline: string) => {
      const key = ancestorCard(drawn).key;
      const axis = [...lineAxes(drawn.drawing).values()].find(
        (line) => line.timeline === timeline && key !== null && samePlaceKey(line.card, key),
      );
      if (axis === undefined) throw new Error(`no row of ${timeline}`);
      return axis.y;
    };
    const shifts = new Set<number>();
    for (const index of indexesOf(card, after).filter((at) => isLine(after, at))) {
      const id = String(after.drawing.elements[index]?.address.id);
      const shift = rowOf(before, id) - rowOf(after, id);
      shifts.add(Math.abs(shift));
      expect([0, 0.5, 1].map((t) => placedAt(card.motionOf(index), t).dy)).toEqual([
        shift,
        shift / 2,
        0,
      ]);
    }
    // Elided, the derived elisions' label stacks lower the rows below them (one line of 9).
    expect([...shifts].sort((left, right) => left - right)).toEqual(ROW_SHIFTS);
  });

  it.each([
    ["Elided → Full", elided, full, false],
    ["Full → Elided", full, elided, true],
  ])(
    "starts each line where the other drawing draws its ends, %s",
    (_way, before, after, toFull) => {
      const card = onlyCard(before, after);
      const moved = after.drawing.origin.x - before.drawing.origin.x;
      const lines = indexesOf(card, after).filter((index) => isLine(after, index));
      expect(lines.map((index) => after.drawing.elements[index]?.address.id)).toEqual(
        CARDS[fixture].lines,
      );
      for (const index of lines) {
        const element = after.drawing.elements[index];
        if (element?.type !== "timeline" && element?.type !== "child") throw new Error("no line");
        const motion = card.motionOf(index).across;
        if (motion === null) throw new Error("no move sideways");
        expect([motion.left, motion.right]).toEqual([element.xs, element.xe]);
        const from = {
          left: across(elided, full, element.xs, toFull) + moved,
          right: across(elided, full, element.xe, toFull) + moved,
        };
        const name = String(element.address.id);
        expect(spanAt(motion, 0), name).toEqual(from);
        expect(spanAt(motion, 0.5), name).toEqual({
          left: from.left + (element.xs - from.left) * 0.5,
          right: from.right + (element.xe - from.right) * 0.5,
        });
        expect(spanAt(motion, 1), name).toEqual({ left: element.xs, right: element.xe });
      }
    },
  );

  it("lets what lies in a gap enter, Full → Elided, in place", () => {
    const after = elided;
    const card = onlyCard(full, elided);
    const gaps = indexesOf(card, after).flatMap((index) => {
      const element = elided.drawing.elements[index];
      return element?.type === "elision" ? [element] : [];
    });
    expect(gaps.map((gap) => gap.address.id)).toEqual(CARDS[fixture].gaps);
    const inGap = (left: number, right: number) =>
      gaps.some((gap) => left >= gap.x1 && right <= gap.x2 && left < gap.x2 && right > gap.x1);
    for (const index of indexesOf(card, after)) {
      const element = elided.drawing.elements[index];
      const inside =
        element?.type === "elision" ||
        element?.type === "ellipsis" ||
        (element?.type === "label" && element.address.part?.includes("elision") === true);
      const motion = card.motionOf(index);
      expect(motion.enters, `${element?.type} ${index}`).toBe(inside);
      if (motion.enters && motion.across !== null) {
        const { left, right } = motion.across;
        expect(inGap(left, right) || left === right).toBe(true);
        expect(spanAt(motion.across, 0)).toEqual({ left, right });
        expect([0, 0.5, 1].map((t) => placedAt(motion, t).opacity)).toEqual([0, 0.5, 1]);
      }
    }
  });

  it("lets a line enter whose whole stretch a gap elided, Elided → Full", () => {
    const card = onlyCard(elided, full);
    const entering = indexesOf(card, full)
      .filter((index) => isLine(full, index) && card.motionOf(index).enters)
      .map((index) => full.drawing.elements[index]?.address.id);
    expect(entering).toEqual(hidden);
  });
});

describe.each([
  ["group_elided_inside", "excerpt"],
  ["group_grandchild", "theme"],
])("%s between Hidden and Elided", (fixture, member) => {
  const { elided, hidden } = views(fixture);
  const card = ancestorCard(elided);

  /** The member's line in its member card: its two abscissas. */
  function memberLine(): readonly [number, number] {
    for (const axis of lineAxes(elided.drawing).values()) {
      if (axis.ancestor !== undefined || axis.timeline !== member) continue;
      if (samePlaceKey(axis.card, { item: "group_1", member })) return [axis.xStart, axis.xEnd];
    }
    throw new Error("no member line");
  }

  it("unfolds the card out of its member card, down as a raise and sideways out of its ends", () => {
    const motion = onlyCard(hidden, elided);
    const rows = raiseUnfold(elided.manifest, elided.drawing, card, measure);
    const [xs, xe] = memberLine();
    let down = false;
    let sideways = false;
    for (const index of indexesOf(motion, elided)) {
      const element = elided.drawing.elements[index];
      const { across, dy, enters } = motion.motionOf(index);
      expect(dy, String(index)).toBe(rows.motionOf(index)?.shift ?? 0);
      if (across === null) throw new Error("no move sideways");
      const startOf = (x: number) => (x <= xs ? xs : x >= xe ? xe : x);
      if (element?.type !== "name" && element?.type !== "ancestor_card") {
        expect([across.fromLeft, across.fromRight], `${element?.type} ${index}`).toEqual([
          startOf(across.left),
          startOf(across.right),
        ]);
      }
      down ||= dy !== 0;
      sideways ||= across.fromLeft !== across.left || across.fromRight !== across.right;
      const own =
        element?.type === "ancestor_card" ||
        element?.type === "elision" ||
        element?.type === "ellipsis";
      const label = element?.type === "label" && element.address.part?.includes("elision") === true;
      if (own || label) expect(enters, `${element?.type} ${index}`).toBe(true);
      if (isLine(elided, index) && element?.address.id === member) expect(enters).toBe(false);
    }
    expect([down, sideways]).toEqual([true, true]);
  });

  it("starts the root's line as wide as the member line", () => {
    const motion = onlyCard(hidden, elided);
    const lines = indexesOf(motion, elided).filter(
      (index) =>
        isLine(elided, index) && elided.drawing.elements[index]?.address.id === card.address.id,
    );
    expect(lines.length).toBe(1);
    const [xs, xe] = memberLine();
    const first = motion.motionOf(lines[0] ?? -1).across;
    const last = motion.motionOf(lines.at(-1) ?? -1).across;
    expect([first?.fromLeft, last?.fromRight]).toEqual([xs, xe]);
  });

  it("folds a hidden card back into its member card", () => {
    const { cards, leaving } = blockMotion(elided, hidden, measure);
    expect(cards).toEqual([]);
    expect(leaving.map((each) => each.key)).toEqual([keyText(card)]);
    const [folding] = leaving;
    if (folding === undefined) throw new Error("nothing leaves");
    expect(folding.descriptors).toEqual(
      elided.descriptors.filter(
        ({ source }) => source.element >= card.range.start && source.element < card.range.end,
      ),
    );
    const unfolding = unfoldingMotion(elided, card, measure);
    const dx = hidden.drawing.origin.x - elided.drawing.origin.x;
    const dy = hidden.drawing.origin.y - elided.drawing.origin.y;
    for (const descriptor of folding.descriptors) {
      for (const t of [0, 0.5, 1]) {
        const placed = placedAt(unfolding.motionOf(descriptor.source.element), 1 - t);
        expect(folding.placedAt(descriptor, t)).toEqual({
          ...placed,
          dx: placed.dx + dx,
          dy: placed.dy + dy,
        });
      }
    }
    const [one] = folding.descriptors;
    if (one === undefined) throw new Error("no descriptor");
    expect(folding.placedAt(one, 0)).toEqual({ sx: 1, dx, dy, opacity: 1 });
  });
});

describe("a group elision changed", () => {
  const view = viewOf({ id: A, fixture: "groups/group_elided_members" });
  const before = drawnOf(view);
  const after = drawnOf(changed(view, setOf("elision_1", { width: { canvas: 60 } })));

  it("moves the frame, its member cards and the ancestor card behind it", () => {
    const { cards, leaving } = blockMotion(before, after, measure);
    expect(leaving).toEqual([]);
    expect(cards.map((card) => card.key).sort()).toEqual(
      [
        { item: "group_1", member: "excerpt" },
        { item: "group_1", member: "piece" },
        { item: "group_1", member: "sketch" },
        { item: "group_1", member: "voice" },
        { item: "group_1" },
      ]
        .map(placeKeyText)
        .sort(),
    );
  });

  it("starts the frame's rectangle where the drawing before drew it", () => {
    const frame = blockMotion(before, after, measure).cards.find(
      (card) => card.key === placeKeyText({ item: "group_1" }),
    );
    const index = after.drawing.elements.findIndex((element) => element.type === "frame");
    const was = before.drawing.elements.find((element) => element.type === "frame");
    const motion = frame?.motionOf(index).across;
    if (was?.type !== "frame" || motion == null) throw new Error("no frame motion");
    const offset = after.drawing.origin.x - before.drawing.origin.x;
    // The axis's end: the last run's end at `x = place.x + scale × (x0 + L × u1 − D)`.
    const end = ({ drawing }: Drawn) => {
      const exposure = drawing.elisions.find(({ kind }) => kind === "frame");
      const run = exposure?.runs.at(-1);
      if (exposure === undefined || run === undefined) throw new Error("no frame axis");
      const { place, x0 } = exposure;
      return place.x + place.scale * (x0 + (run.L * run.u1 - run.D));
    };
    const now = after.drawing.elements[index];
    if (now?.type !== "frame") throw new Error("no frame");
    expect(spanAt(motion, 0)).toEqual({
      left: was.x + offset,
      right: end(before) + offset + (now.x + now.width - end(after)),
    });
  });
});

describe("elision labels shown", () => {
  const view = withAutoElisions(viewOf({ id: A, fixture: "groups/group_elided_inside" }));
  const before = drawnOf(view);
  const after = drawnOf(
    changed(view, {
      type: "style",
      select: { addresses: [{ id: "piece", part: ["card"] }] },
      set: { "elision-display": "ellipsis name coordinate" },
      blocks: [A],
    }),
  );

  it("moves the card's rows down by their new bands", () => {
    const card = ancestorCard(after);
    const [motion] = blockMotion(before, after, measure).cards;
    if (motion === undefined || card.key === null) throw new Error("nothing moves");
    const rowOf = ({ drawing }: Drawn, timeline: string) => {
      for (const axis of lineAxes(drawing).values()) {
        if (axis.timeline === timeline && card.key !== null && samePlaceKey(axis.card, card.key)) {
          return axis.y - drawing.origin.y;
        }
      }
      throw new Error(`no row of ${timeline}`);
    };
    let moved = false;
    for (const index of indexesOf(motion, after)) {
      const element = after.drawing.elements[index];
      if (element?.type !== "timeline" && element?.type !== "child") continue;
      const timeline = String(element.address.id);
      const shift = rowOf(before, timeline) - rowOf(after, timeline);
      expect(motion.motionOf(index).dy, timeline).toBe(shift);
      moved ||= shift !== 0;
    }
    expect(moved).toBe(true);
  });
});
