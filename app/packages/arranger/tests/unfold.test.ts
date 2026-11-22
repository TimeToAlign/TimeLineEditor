/**
 * A raised card unfolding: the pure motion between two drawings and the
 * canvas's reading of a raised ancestor card into it. The cases are in
 * `README.md` ("A raised card unfolding", points 1 to 7).
 */

import { indexOf, samePlaceKey } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import { boundsOf, lineAxes, TextMeasure } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { raiseUnfold } from "../src/animation/raise.ts";
import { durationOf, frameAt, pairRows, rectAt } from "../src/animation/unfold.ts";
import { isAncestorCard, keyedBox } from "../src/boxes.ts";
import { drawingOf } from "../src/drawing.ts";
import { A, blockIn, metrics, viewOf } from "./support.ts";

const FROM = [
  { key: "theme", y: 120 },
  { key: "movement", y: 104 },
  { key: "score", y: 72 },
];
const TO = [
  { key: "top", y: 10 },
  { key: "theme", y: 24 },
  { key: "sibling", y: 40 },
  { key: "movement", y: 56 },
  { key: "score", y: 72 },
  { key: "extra", y: 90 },
];

describe("the motion between two drawings", () => {
  it("pairs rows by key and lets the others travel with their paired neighbours", () => {
    expect(Object.fromEntries(pairRows(FROM, TO))).toEqual({
      top: { shift: 96, enters: true },
      theme: { shift: 96, enters: false },
      sibling: { shift: 72, enters: true },
      movement: { shift: 48, enters: false },
      score: { shift: 0, enters: false },
      extra: { shift: 0, enters: true },
    });
    expect(Object.fromEntries(pairRows([], TO.slice(0, 2)))).toEqual({
      top: { shift: 0, enters: true },
      theme: { shift: 0, enters: true },
    });
    const twice = pairRows(
      [...FROM, { key: "theme", y: 130 }],
      [
        { key: "theme", y: 24 },
        { key: "theme", y: 50 },
      ],
    );
    expect(Object.fromEntries(twice)).toEqual({ theme: { shift: 96, enters: false } });
  });

  it("shifts a row by what is left of its way and blends an entering one in", () => {
    const motions = pairRows(FROM, TO);
    const at = (key: string) => [0, 0.5, 1].map((t) => frameAt(motions.get(key) ?? null, t));
    expect(at("theme")).toEqual([
      { dy: 96, opacity: 1 },
      { dy: 48, opacity: 1 },
      { dy: 0, opacity: 1 },
    ]);
    expect(at("sibling")).toEqual([
      { dy: 72, opacity: 0 },
      { dy: 36, opacity: 0.5 },
      { dy: 0, opacity: 1 },
    ]);
    expect(at("none")).toEqual([
      { dy: 0, opacity: 0 },
      { dy: 0, opacity: 0.5 },
      { dy: 0, opacity: 1 },
    ]);
  });

  it("opens the clip edge by edge", () => {
    const from = { x: 0, y: 0, width: 10, height: 10 };
    const to = { x: -20, y: 4, width: 50, height: 30 };
    expect(rectAt(from, to, 0.5)).toEqual({ x: -10, y: 2, width: 30, height: 20 });
    expect(rectAt(from, to, 0)).toEqual(from);
    expect(rectAt(from, to, 1)).toEqual(to);
  });

  it("takes the part of the time its distance is, and none under reduced motion", () => {
    expect([durationOf(0, 1, false), durationOf(1, 0, false)]).toEqual([400, 400]);
    expect(durationOf(0.25, 0, false)).toBe(100);
    expect([durationOf(0, 1, true), durationOf(0.5, 0, true)]).toEqual([0, 0]);
    expect(durationOf(1, 1, false)).toBe(0);
  });
});

/** A fixture of `groups/` in block A, as the defaults draw it, with its manifest. */
function drawn(fixture: string) {
  const view = viewOf({ id: A, fixture: `groups/${fixture}` });
  const block = blockIn(view, A);
  return { manifest: block.manifest, drawing: drawingOf(block, view.graphical, metrics) };
}

/** The one ancestor card of `root`. */
function ancestorCard(drawing: Drawing, root: string): DrawnBox {
  const found = drawing.boxes.filter((box) => isAncestorCard(box) && box.address.id === root);
  const [card] = found;
  if (found.length !== 1 || card === undefined) throw new Error(`${root}: ${found.length} cards`);
  return card;
}

/** The ordinates of the lines of the card keyed `key`, by timeline; `ancestor` the ancestor card's. */
function linesIn(drawing: Drawing, card: DrawnBox, ancestor: boolean): Map<string, number> {
  const key = ancestor
    ? card.key
    : card.ancestor === undefined
      ? null
      : { item: card.ancestor.group, member: card.ancestor.member };
  const lines = new Map<string, number>();
  for (const axis of lineAxes(drawing).values()) {
    if (key === null || (axis.ancestor !== undefined) !== ancestor) continue;
    if (samePlaceKey(axis.card, key) && !lines.has(axis.timeline)) lines.set(axis.timeline, axis.y);
  }
  return lines;
}

const measure = new TextMeasure(metrics);

describe.each([
  ["group_grandchild", "score", ["theme", "movement", "score"]],
  ["group_parent_both", "piece", ["middle", "piece"]],
])("the raised card of %s", (fixture, root, paired) => {
  const { manifest, drawing } = drawn(fixture);
  const card = ancestorCard(drawing, root);
  const unfold = raiseUnfold(manifest, drawing, card, measure);
  const member = linesIn(drawing, card, false);
  const own = linesIn(drawing, card, true);
  const lineIndexes = (timeline: string) =>
    drawing.elements.flatMap((element, index) =>
      index >= card.range.start &&
      index < card.range.end &&
      (element.type === "timeline" || element.type === "child") &&
      element.address.id === timeline
        ? [index]
        : [],
    );

  it("pairs the rows the records draw in both cards, the root's at 0", () => {
    expect([...own.keys()].filter((timeline) => member.has(timeline)).sort()).toEqual(
      [...paired].sort(),
    );
    for (const timeline of paired) {
      const [index] = lineIndexes(timeline);
      if (index === undefined) throw new Error(`no line of ${timeline}`);
      expect(unfold.motionOf(index), timeline).toEqual({
        shift: (member.get(timeline) ?? Number.NaN) - (own.get(timeline) ?? Number.NaN),
        enters: false,
      });
    }
    const [rootLine] = lineIndexes(root);
    expect(unfold.motionOf(rootLine ?? -1)?.shift).toBe(0);
  });

  it("moves each line from the member card's row to its own", () => {
    for (const timeline of paired) {
      for (const index of lineIndexes(timeline)) {
        const element = drawing.elements[index];
        if (element?.type !== "timeline" && element?.type !== "child") throw new Error("no line");
        const at = (t: number) => element.y + frameAt(unfold.motionOf(index), t).dy;
        const start = member.get(timeline) ?? Number.NaN;
        expect([at(0), at(0.5), at(1)], timeline).toEqual([
          start,
          element.y + (start - element.y) / 2,
          element.y,
        ]);
      }
    }
  });

  it("gives every element its timeline's motion and the card's rectangle none", () => {
    const { owners } = indexOf(manifest);
    const motions = new Map(
      paired.map((timeline) => [timeline, unfold.motionOf(lineIndexes(timeline)[0] ?? -1)]),
    );
    for (let index = card.range.start; index < card.range.end; index += 1) {
      const element = drawing.elements[index];
      if (element === undefined) throw new Error("no element");
      if (element.type === "ancestor_card") {
        expect(unfold.motionOf(index)).toBeNull();
        continue;
      }
      const timeline = owners.get(element.address.id ?? "");
      expect(timeline, element.type).toBeDefined();
      expect(unfold.motionOf(index), `${element.type} ${index}`).toEqual(
        motions.get(timeline ?? "") ?? null,
      );
    }
  });

  it("opens the clip from the member card to everything the card draws", () => {
    const memberCard = keyedBox(drawing, {
      item: card.ancestor?.group ?? "",
      member: card.ancestor?.member ?? "",
    });
    if (memberCard === undefined) throw new Error("no member card");
    const { x, y, width, height } = memberCard;
    expect(unfold.from).toEqual({ x, y, width, height });
    const rectangle = drawing.elements[card.range.start];
    if (rectangle?.type !== "ancestor_card") throw new Error("no card rectangle");
    const { to } = unfold;
    const holds = (left: number, top: number, right: number, bottom: number) =>
      to.x <= left && to.y <= top && to.x + to.width >= right && to.y + to.height >= bottom;
    const shadow = rectangle.shadowOffset;
    expect(holds(card.x, card.y, card.x + card.width + shadow, card.y + card.height + shadow)).toBe(
      true,
    );
    for (let index = card.range.start; index < card.range.end; index += 1) {
      const element = drawing.elements[index];
      if (element === undefined) continue;
      const bounds = boundsOf(element, measure);
      expect(holds(bounds.left, bounds.top, bounds.right, bounds.bottom), String(index)).toBe(true);
    }
  });
});
