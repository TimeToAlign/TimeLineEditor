import { type ElementAddress, type Manifest, sameAddress } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { placedAt, placedAxis, placedBox } from "../src/canvas.ts";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnBox,
  type DrawnElement,
  draw,
  manifestLayer,
} from "../src/index.ts";
import { at, BLOCK, drawFixture, edit, manifestNames, metrics } from "./support.ts";

/** The application layer that shows every ancestor card (section 8.8). */
const SHOWN: Graphical = {
  rules: [{ select: { element: "ancestor_card" }, set: { display: "inline" } }],
};
const shown = (name: string, extra: Graphical[] = []) =>
  drawFixture(`groups/${name}`, [SHOWN, ...extra]);
const plain = (name: string, extra: Graphical[] = []) => drawFixture(`groups/${name}`, extra);

/** The records of the ancestor cards of a drawing, in drawing order. */
const ancestorsOf = (drawing: Drawing): DrawnBox[] =>
  drawing.boxes.filter((box) => box.ancestor !== undefined);

/** The one record of the ancestor card of `root`. */
function cardOf(drawing: Drawing, root: string): DrawnBox {
  const found = ancestorsOf(drawing).filter((box) => box.address.id === root);
  if (found.length !== 1) throw new Error(`${root} has ${found.length} ancestor cards`);
  return found[0] as DrawnBox;
}

/** The elements an ancestor card's record draws, its rectangle first. */
const drawnBy = (drawing: Drawing, box: DrawnBox) =>
  drawing.elements.slice(box.range.start, box.range.end);

/** The first element of `type` at `address` among `elements`. */
function lineOf(
  elements: readonly DrawnElement[],
  type: DrawnElement["type"],
  address: ElementAddress,
): DrawnElement {
  const found = elements.find((item) => item.type === type && sameAddress(item.address, address));
  if (found === undefined) throw new Error(`no ${type} at ${JSON.stringify(address)}`);
  return found;
}

/** The ordinate and ends of a line element. */
function span(element: DrawnElement): [number, number, number] {
  if (element.type !== "timeline" && element.type !== "child" && element.type !== "ancestor") {
    throw new Error(`a ${element.type} is no line`);
  }
  return [element.y, element.xs, element.xe];
}

/** `name` with its one group and the roots `others` removed, so one root is its only card. */
function alone(name: string, others: readonly string[]): Manifest {
  const targets = ["group_1", ...others].map((id) => ({ block: BLOCK, id }));
  return edit(`groups/${name}`, { type: "remove", targets });
}

describe("ancestor cards hidden by default", () => {
  it.each(manifestNames())("draw nothing in %s", (name) => {
    const drawing = drawFixture(name);
    expect(drawing.elements.filter((item) => item.type === "ancestor_card")).toEqual([]);
    expect(ancestorsOf(drawing)).toEqual([]);
  });
});

describe("the ancestor card of group_parent_both", () => {
  const drawing = shown("group_parent_both");
  const card = cardOf(drawing, "piece");

  it("lies behind the frame at the proportions of piece's axis, on piece's ancestor row", () => {
    expect(drawing.origin).toEqual({ x: 148.6318359375, y: 0 });
    expect([drawing.width, drawing.height]).toEqual([887.33544921875, 190.13671875]);
    expect(card).toEqual({
      kind: "card",
      key: { item: "group_1", member: "piece" },
      address: { id: "piece", part: ["card"] },
      holder: null,
      x: 8,
      y: 18.8046875,
      width: 869.33544921875,
      height: 63.37890625,
      range: { start: 1, end: 10 },
      displayed: true,
      contentCount: 2,
      ancestor: { group: "group_1", member: "middle" },
    });
    const own = drawnBy(drawing, card);
    expect(own[0]?.type).toBe("ancestor_card");
    expect(span(lineOf(own, "timeline", at("piece")))).toEqual([
      67.78125, 60.33544921875, 860.33544921875,
    ]);
    expect(span(lineOf(own, "child", at("middle")))).toEqual([
      33.8046875, 260.33544921875, 660.33544921875,
    ]);
    // Its line continues piece's ancestor line in middle's card.
    expect(span(lineOf(drawing.elements, "ancestor", at("piece")))[0]).toBe(67.78125);
  });

  it("is piece drawn alone as an ungrouped root, moved", () => {
    const manifest = alone("group_parent_both", ["recording"]);
    const reference = draw(
      manifest,
      { ...DEFAULT_PLACEMENT, length: 800 },
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    const [, rootCard] = reference.boxes;
    if (rootCard === undefined) throw new Error("the reference draws no card");
    expect([rootCard.width, rootCard.height]).toEqual([869.33544921875, 63.37890625]);
    expect(span(lineOf(reference.elements, "timeline", at("piece")))[0] - rootCard.y).toBe(
      48.9765625,
    );
    const moved = drawnBy(reference, rootCard).map((item) =>
      placedAt(item, card.x - rootCard.x, card.y - rootCard.y),
    );
    const [rectangle, ...rest] = drawnBy(drawing, card);
    expect(rectangle).toEqual({ ...moved[0], type: "ancestor_card" });
    expect(rest).toEqual(moved.slice(1));
  });

  it("takes no room: everything else lies where it lies without it", () => {
    const without = plain("group_parent_both");
    const dx = drawing.origin.x - without.origin.x;
    const dy = drawing.origin.y - without.origin.y;
    expect([dx, dy]).toEqual([148.6318359375, 0]);
    const [background, ...others] = drawing.elements;
    const [plainBackground, ...plainOthers] = without.elements;
    expect(background?.type).toBe("block");
    expect(plainBackground?.type).toBe("block");
    expect(others.slice(card.range.end - 1)).toEqual(
      plainOthers.map((item) => placedAt(item, dx, dy)),
    );
    const boxes = drawing.boxes.filter((box) => box.ancestor === undefined && box.kind !== "block");
    expect(boxes.map(({ range: _, ...box }) => box)).toEqual(
      without.boxes
        .filter((box) => box.kind !== "block")
        .map((box) => placedBox(box, dx, dy))
        .map(({ range: _, ...box }) => box),
    );
    expect(drawing.axes).toEqual(without.axes.map((axis) => placedAxis(axis, dx, dy)));
    // The order: the background, the ancestor card and its drawing, then the frame.
    expect(drawing.boxes.map((box) => [box.kind, box.range.start])).toEqual(
      without.boxes
        .map((box, index) => [
          box.kind,
          index === 0 ? 0 : box.range.start + card.range.end - card.range.start,
        ])
        .toSpliced(1, 0, ["card", 1]),
    );
  });
});

describe("the ancestor card of group_parent_right", () => {
  it("runs on to the right only", () => {
    const drawing = shown("group_parent_right");
    const card = cardOf(drawing, "piece");
    expect(drawing.origin).toEqual({ x: 0, y: 0 });
    expect([drawing.width, drawing.height]).toEqual([914.70361328125, 190.13671875]);
    expect([card.x, card.y, card.width, card.height]).toEqual([
      23.6162109375, 18.8046875, 881.08740234375, 63.37890625,
    ]);
    expect(card.ancestor).toEqual({ group: "group_1", member: "first-half" });
    expect(span(lineOf(drawnBy(drawing, card), "timeline", at("piece")))[1]).toBe(
      79.70361328125 + 8,
    );
  });
});

describe("the ancestor cards of group_parents_mixed", () => {
  const drawing = shown("group_parents_mixed");

  it("lie behind the one frame, one per root, at their own axes' proportions", () => {
    expect(drawing.origin).toEqual({ x: 423.5276884191177, y: 0 });
    expect([drawing.width, drawing.height]).toEqual([1732.891295189951, 377.640625]);
    expect(
      ancestorsOf(drawing).map((box) => [
        box.address.id,
        box.ancestor?.member,
        box.x,
        box.y,
        box.width,
        box.height,
      ]),
    ).toEqual([
      ["sonata", "exposition", 263.5276884191177, 18.8046875, 690.309326171875, 63.37890625],
      ["session", "take", 8, 110.7578125, 1486.7344324448532, 63.37890625],
      ["page", "system", 479.5389188878677, 206.2109375, 1243.3523763020833, 63.37890625],
    ]);
  });

  it("each is its root drawn alone, moved", () => {
    const roots = ["sonata", "session", "page", "audio"];
    // Each root's graphical length `LA`, derived in the README.
    const lengths = { sonata: 600, session: 1411.7647058823532, page: 1169.3333333333333 };
    for (const [root, length] of Object.entries(lengths)) {
      const manifest = alone(
        "group_parents_mixed",
        roots.filter((other) => other !== root),
      );
      const reference = draw(
        manifest,
        { ...DEFAULT_PLACEMENT, length },
        [DEFAULT_LAYER, manifestLayer(manifest)],
        metrics,
      );
      const [, rootCard] = reference.boxes;
      const card = cardOf(drawing, root);
      expect([rootCard?.width, rootCard?.height], root).toEqual([card.width, card.height]);
      const line = lineOf(drawnBy(drawing, card), "timeline", at(root));
      expect(span(line)[0] - card.y, root).toBe(48.9765625);
    }
  });

  it("leave out a card hidden by a rule, and the block does not grow for it", () => {
    const hidden = shown("group_parents_mixed", [
      {
        rules: [
          {
            select: { addresses: [{ id: "session", part: ["card"] }] },
            set: { display: "none" },
          },
        ],
      },
    ]);
    expect(ancestorsOf(hidden).map((box) => box.address.id)).toEqual(["sonata", "page"]);
    expect(hidden.origin).toEqual({ x: 168, y: 0 });
    expect(
      hidden.elements
        .filter((item) => sameAddress(item.address, at("session")))
        .map((item) => item.type),
    ).toEqual(["ancestor"]);
  });
});

describe("an ancestor card without its ancestor line", () => {
  it("lies on the member's own line", () => {
    const hide: Graphical = {
      rules: [{ select: { element: "ancestor" }, set: { display: "none" } }],
    };
    const drawing = shown("group_parent_both", [hide]);
    const card = cardOf(drawing, "piece");
    const member = lineOf(drawing.elements, "timeline", at("middle"));
    expect(span(lineOf(drawnBy(drawing, card), "timeline", at("piece")))[0]).toBe(span(member)[0]);
    expect(drawing.elements.some((item) => item.type === "ancestor")).toBe(false);
  });
});
