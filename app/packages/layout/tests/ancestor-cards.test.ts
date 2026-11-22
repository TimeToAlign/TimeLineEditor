import { type ElementAddress, type Manifest, sameAddress } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { placedAt, placedAxis, placedBox } from "../src/canvas.ts";
import { groupstampElements } from "../src/groupstamps.ts";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnAxis,
  type DrawnBox,
  type DrawnElement,
  draw,
  frameMemberLines,
  lineAxes,
  manifestLayer,
} from "../src/index.ts";
import {
  at,
  BLOCK,
  drawFixture,
  edit,
  HIDDEN_ANCESTOR_CARDS,
  manifestNames,
  metrics,
  set,
} from "./support.ts";

/** A group fixture drawn with the defaults, which show every ancestor card (section 8.8). */
const shown = (name: string, extra: Graphical[] = []) => drawFixture(`groups/${name}`, extra);
/** The same with the application layer hiding every ancestor card. */
const plain = (name: string, extra: Graphical[] = []) =>
  drawFixture(`groups/${name}`, [HIDDEN_ANCESTOR_CARDS, ...extra]);

/**
 * The number of ancestor cards each manifest fixture draws with the defaults (section 8.8, Which):
 * one per group and root of a child member, so two for the score of `bundle_shared_parent`
 * behind its two frames and three for the three roots behind the one frame of
 * `group_parents_mixed`; none for every fixture not listed.
 */
const ANCESTOR_CARDS: Readonly<Record<string, number>> = {
  "bundles/bundle_mixed": 1,
  "bundles/bundle_shared_parent": 2,
  "groups/group_child_member": 1,
  "groups/group_child_member_stamps": 1,
  "groups/group_grandchild": 1,
  "groups/group_parent_both": 1,
  "groups/group_parent_exact": 1,
  "groups/group_parent_right": 1,
  "groups/group_parents_mixed": 3,
};

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

describe("ancestor cards shown by default, hidden by a rule", () => {
  it.each(manifestNames())("%s draws its own, and none under the hiding rule", (name) => {
    const count = ANCESTOR_CARDS[name] ?? 0;
    const drawing = drawFixture(name);
    expect(drawing.elements.filter((item) => item.type === "ancestor_card")).toHaveLength(count);
    expect(ancestorsOf(drawing)).toHaveLength(count);
    const hidden = drawFixture(name, [HIDDEN_ANCESTOR_CARDS]);
    expect(hidden.elements.filter((item) => item.type === "ancestor_card")).toEqual([]);
    expect(ancestorsOf(hidden)).toEqual([]);
    expect(hidden.axes.filter((axis) => axis.ancestor !== undefined)).toEqual([]);
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
    expect(drawing.axes.slice(0, without.axes.length)).toEqual(
      without.axes.map((axis) => placedAxis(axis, dx, dy)),
    );
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

describe("the axes of the ancestor card of group_parent_both", () => {
  const drawing = shown("group_parent_both");
  const without = plain("group_parent_both");
  const key = { item: "group_1", member: "piece" };
  const ancestor = { group: "group_1", member: "middle" };
  const own = drawing.axes.slice(without.axes.length);
  const axisOf = (id: string): DrawnAxis => {
    const found = own.find((axis) => axis.address.id === id);
    if (found === undefined) throw new Error(`the card draws no axis of ${id}`);
    return found;
  };
  const exact = (axis: DrawnAxis) => [
    axis.unit,
    axis.numberType,
    String(axis.start),
    String(axis.end),
    String(axis.drawnEnd),
  ];

  it("follow every member card's axes, one per line the card draws, marked", () => {
    expect(drawing.axes.slice(0, without.axes.length)).toEqual(
      without.axes.map((axis) => placedAxis(axis, 148.6318359375, 0)),
    );
    expect(own.map((axis) => [axis.address, axis.card, axis.ancestor])).toEqual([
      [at("piece"), key, ancestor],
      [at("middle"), key, ancestor],
    ]);
  });

  it("lie on the card's lines, at their timelines' own coordinates", () => {
    // The card's corner (8, 18.8046875), its start s0' = 52.33544921875 and LA = 800 (README).
    const piece = axisOf("piece");
    expect([piece.line, piece.xStart, piece.xEnd]).toEqual([
      18.8046875 + 48.9765625,
      8 + 52.33544921875,
      8 + 52.33544921875 + 800,
    ]);
    expect(exact(piece)).toEqual(["quarters", "fraction", "0", "16", "16"]);
    const middle = axisOf("middle");
    expect([middle.line, middle.xStart, middle.xEnd]).toEqual([
      18.8046875 + 15,
      8 + 52.33544921875 + 200,
      8 + 52.33544921875 + 600,
    ]);
    expect(exact(middle)).toEqual(["quarters", "fraction", "0", "8", "8"]);
    // The lines the card draws: `piece`'s ends where its axis does; `middle`'s, a child's, stops
    // short of its end mark, so only its ordinate and start are its axis's.
    const card = drawnBy(drawing, cardOf(drawing, "piece"));
    expect(span(lineOf(card, "timeline", at("piece")))).toEqual([
      piece.line,
      piece.xStart,
      piece.xEnd,
    ]);
    expect(span(lineOf(card, "child", at("middle"))).slice(0, 2)).toEqual([
      middle.line,
      middle.xStart,
    ]);
  });

  it("are hit-test lines as any card's, marked as the ancestor card's", () => {
    const lines = [...lineAxes(drawing).values()].filter((line) => line.ancestor !== undefined);
    expect(
      lines.map((line) => [
        line.timeline,
        line.card,
        line.y,
        line.xStart,
        line.xEnd,
        line.ancestor,
      ]),
    ).toEqual([
      ["piece", key, 67.78125, 60.33544921875, 860.33544921875, ancestor],
      ["middle", key, 33.8046875, 260.33544921875, 660.33544921875, ancestor],
    ]);
    expect(lines.map((line) => String(line.drawnLength))).toEqual(["16", "8"]);
  });

  it("are no member lines of the frame", () => {
    expect(frameMemberLines(drawing.axes, "group_1").map((axis) => axis.address.id)).toEqual([
      "middle",
      "recording",
    ]);
  });
});

describe("a groupstamp on a child member beside an ancestor card", () => {
  // `timestamp_1` "Bar 2" at 2 on `middle`, drawing its cross-section line alone, made a groupstamp.
  const manifest = edit(
    "groups/group_child_member_stamps",
    set("timestamp_1", { groupstamp: true }),
  );
  const layers = (extra: Graphical[]) => [DEFAULT_LAYER, ...extra, manifestLayer(manifest)];
  const drawing = draw(manifest, DEFAULT_PLACEMENT, layers([]), metrics);
  const without = draw(manifest, DEFAULT_PLACEMENT, layers([HIDDEN_ANCESTOR_CARDS]), metrics);

  it("crosses the frame's member cards only, as without the card", () => {
    const pieces = (of: Drawing) =>
      groupstampElements(manifest, of.axes, of.boxes).map(({ x, y1, y2 }) => [x, y1, y2]);
    // At `x0 + 100` of `middle`, from the top of `middle`'s card to the bottom of `recording`'s,
    // less `middle`'s own cross-section line, from `piece`'s ancestor line to `middle`'s.
    expect(pieces(without)).toEqual([
      [211.70361328125, 32.8046875, 67.78125],
      [211.70361328125, 81.78125, 174.13671875],
    ]);
    expect(pieces(drawing)).toEqual([
      [211.70361328125 + 148.6318359375, 32.8046875, 67.78125],
      [211.70361328125 + 148.6318359375, 81.78125, 174.13671875],
    ]);
  });
});
