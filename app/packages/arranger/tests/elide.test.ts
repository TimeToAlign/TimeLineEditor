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
import { A, blockIn, metrics, viewOf, withFullCards, withoutAncestorCards } from "./support.ts";

const measure = new TextMeasure(metrics);
const float = (value: Parameters<typeof toRational>[0]) => toFloat(toRational(value));

/** Block A of `view`, drawn, with its manifest and descriptors. */
function drawnOf(view: View): Drawn {
  const block = blockIn(view, A);
  const drawing = drawingOf(block, view.graphical, metrics);
  return { manifest: block.manifest, drawing, descriptors: descriptorsOf(drawing) };
}

/** A `groups/` fixture in block A drawn Elided (the defaults), Full and with its ancestor cards hidden. */
function views(fixture: string) {
  const view = viewOf({ id: A, fixture: `groups/${fixture}` });
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
function fullAt(full: Drawn, timeline: string, value: number): number {
  const card = ancestorCard(full);
  for (const axis of lineAxes(full.drawing).values()) {
    if (axis.timeline !== timeline || card.key === null || !samePlaceKey(axis.card, card.key)) {
      continue;
    }
    const start = float(axis.start);
    const end = start + float(axis.drawnLength);
    if (value >= start && value <= end) return between(axis.xStart, axis.xEnd, start, end, value);
  }
  throw new Error(`${timeline} ${value} is not drawn whole`);
}

/** A full run or a strip: its two abscissas in the Elided card and those of its values in the Full card. */
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
      full: [fullAt(full, axis.timeline, start), fullAt(full, axis.timeline, end)],
    });
  }
  for (let index = card.range.start; index < card.range.end; index += 1) {
    const element = elided.drawing.elements[index];
    if (element?.type !== "elision") continue;
    const { timeline, start, end } = element.elided;
    pieces.push({
      elided: [element.x1, element.x2],
      full: [fullAt(full, timeline, float(start)), fullAt(full, timeline, float(end))],
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

/** The indexes of the card's elements in `drawn`. */
function indexesOf(motion: CardMotion): number[] {
  return Array.from({ length: motion.end - motion.start }, (_, i) => motion.start + i);
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

const isLine = (drawn: Drawn, index: number) => {
  const type = drawn.drawing.elements[index]?.type;
  return type === "timeline" || type === "child";
};

describe.each([
  ["group_elided_inside", "piece", ["second"]],
  ["group_grandchild", "score", []],
])("%s between Elided and Full", (fixture, root, hidden) => {
  const { elided, full } = views(fixture);

  it("moves the ancestor card alone", () => {
    expect(ancestorCard(elided).key).toEqual({ item: "group_1", member: root });
    onlyCard(elided, full);
    onlyCard(full, elided);
  });

  it.each([
    ["Elided → Full", elided, full],
    ["Full → Elided", full, elided],
  ])("keeps every row, %s", (_way, before, after) => {
    const card = onlyCard(before, after);
    for (const index of indexesOf(card)) {
      for (const t of [0, 0.5, 1]) expect(placedAt(card.motionOf(index), t).dy).toBe(0);
    }
  });

  it.each([
    ["Elided → Full", elided, full, false],
    ["Full → Elided", full, elided, true],
  ])(
    "starts each line where the other drawing draws its ends, %s",
    (_way, before, after, toFull) => {
      const card = onlyCard(before, after);
      const moved = after.drawing.origin.x - before.drawing.origin.x;
      const lines = indexesOf(card).filter((index) => isLine(after, index));
      expect(lines.length).toBeGreaterThan(0);
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

  it("starts the root's line at its outer strips' edges, Elided → Full", () => {
    const card = onlyCard(elided, full);
    const [line] = indexesOf(card).filter(
      (index) => full.drawing.elements[index]?.address.id === root && isLine(full, index),
    );
    const across = line === undefined ? null : card.motionOf(line).across;
    const strips = indexesOf(onlyCard(full, elided)).flatMap((index) => {
      const element = elided.drawing.elements[index];
      return element?.type === "elision" ? [element] : [];
    });
    const moved = full.drawing.origin.x - elided.drawing.origin.x;
    expect(across?.fromLeft).toBe((strips[0]?.x1 ?? Number.NaN) + moved);
    expect(across?.fromRight).toBe((strips.at(-1)?.x2 ?? Number.NaN) + moved);
  });

  it("lets what lies in a strip enter, Full → Elided, each strip as wide as its stretch", () => {
    const card = onlyCard(full, elided);
    const moved = elided.drawing.origin.x - full.drawing.origin.x;
    const strips = indexesOf(card).flatMap((index) => {
      const element = elided.drawing.elements[index];
      return element?.type === "elision" ? [{ index, element }] : [];
    });
    expect(strips.length).toBeGreaterThan(0);
    for (const { index, element } of strips) {
      const { across: motion } = card.motionOf(index);
      if (motion === null) throw new Error("no move sideways");
      const { timeline, start, end } = element.elided;
      expect(spanAt(motion, 0)).toEqual({
        left: fullAt(full, timeline, float(start)) + moved,
        right: fullAt(full, timeline, float(end)) + moved,
      });
    }
    const inStrip = (left: number, right: number) =>
      strips.some(({ element }) => left >= element.x1 && right <= element.x2);
    for (const index of indexesOf(card)) {
      const element = elided.drawing.elements[index];
      const inside =
        element?.type === "elision" ||
        (element?.type === "label" && element.address.part?.includes("elision") === true) ||
        ((element?.type === "timeline" || element?.type === "child") &&
          inStrip(element.xs, element.xe));
      const motion = card.motionOf(index);
      expect(motion.enters, `${element?.type} ${index}`).toBe(inside);
      if (motion.enters) {
        expect([0, 0.5, 1].map((t) => placedAt(motion, t).opacity)).toEqual([0, 0.5, 1]);
      }
    }
  });

  it("lets a line enter whose whole stretch a strip elided, Elided → Full", () => {
    const card = onlyCard(elided, full);
    const entering = indexesOf(card)
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
    for (const index of indexesOf(motion)) {
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
      const own = element?.type === "ancestor_card" || element?.type === "elision";
      const label = element?.type === "label" && element.address.part?.includes("elision") === true;
      if (own || label) expect(enters, `${element?.type} ${index}`).toBe(true);
      if (isLine(elided, index) && element?.address.id === member) expect(enters).toBe(false);
    }
    expect([down, sideways]).toEqual([true, true]);
  });

  it("starts the root's line as wide as the member line", () => {
    const motion = onlyCard(hidden, elided);
    const lines = indexesOf(motion).filter(
      (index) =>
        isLine(elided, index) && elided.drawing.elements[index]?.address.id === card.address.id,
    );
    expect(lines.length).toBeGreaterThan(0);
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
