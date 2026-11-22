import {
  type ElementAddress,
  type Manifest,
  sameAddress,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import { canonicalOrder, type Graphical, validate, withFileIds } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { placedAt, placedAxis, placedBox } from "../src/canvas.ts";
import { groupstampElements } from "../src/groupstamps.ts";
import {
  crossedLines,
  crossSection,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnAxis,
  type DrawnBox,
  type DrawnElement,
  draw,
  frameMemberLines,
  type LineAxis,
  lineAxes,
  manifestLayer,
  timestampSegments,
  wedgeAt,
} from "../src/index.ts";
import {
  at,
  BLOCK,
  boxesOf,
  drawFixture,
  edit,
  FULL_CARDS,
  HIDDEN_ANCESTOR_CARDS,
  loadFile,
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
 * behind its two frames, three for the three roots behind the one frame of
 * `group_parents_mixed` and four for the Suite behind the four frames of
 * `bundle_elided_layerit`; none for every fixture not listed.
 */
const ANCESTOR_CARDS: Readonly<Record<string, number>> = {
  "bundles/bundle_arranged_conflict": 2,
  "bundles/bundle_arranged_roots": 5,
  "bundles/bundle_elided_layerit": 4,
  "bundles/bundle_elisions_stored": 2,
  "bundles/bundle_mixed": 1,
  "bundles/bundle_shared_parent": 2,
  "groups/group_child_member": 1,
  "groups/group_child_member_stamps": 1,
  "groups/group_elided_inside": 1,
  "groups/group_elided_members": 1,
  "groups/group_grandchild": 1,
  "groups/group_grandchild_parent_on_top": 1,
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
    expect([drawing.width, drawing.height]).toEqual([887.33544921875, 173.5625]);
    expect(card).toEqual({
      kind: "card",
      key: { item: "group_1", member: "piece" },
      address: { id: "piece", part: ["card"] },
      holder: null,
      x: 8,
      y: 36.20703125,
      width: 869.33544921875,
      height: 63.37890625,
      range: { start: 1, end: 14 },
      displayed: true,
      contentCount: 2,
      ancestor: { group: "group_1", member: "middle" },
    });
    const own = drawnBy(drawing, card);
    expect(own[0]?.type).toBe("ancestor_card");
    expect(span(lineOf(own, "timeline", at("piece")))).toEqual([
      85.18359375, 60.33544921875, 860.33544921875,
    ]);
    expect(span(lineOf(own, "child", at("middle")))).toEqual([
      51.20703125, 260.33544921875, 660.33544921875,
    ]);
    // Its line continues piece's ancestor line in middle's card, below middle's line.
    expect(span(lineOf(drawing.elements, "ancestor", at("piece")))[0]).toBe(85.18359375);
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
    expect([drawing.width, drawing.height]).toEqual([914.70361328125, 173.5625]);
    expect([card.x, card.y, card.width, card.height]).toEqual([
      23.6162109375, 36.20703125, 881.08740234375, 63.37890625,
    ]);
    expect(card.ancestor).toEqual({ group: "group_1", member: "first-half" });
    expect(span(lineOf(drawnBy(drawing, card), "timeline", at("piece")))[1]).toBe(
      79.70361328125 + 8,
    );
  });
});

describe("the ancestor cards of group_parents_mixed", () => {
  // Drawn whole: their strips are the subject of `elisions.test.ts`.
  const drawing = shown("group_parents_mixed", [FULL_CARDS]);

  it("lie behind the one frame, one per root, at their own axes' proportions", () => {
    expect(drawing.origin).toEqual({ x: 423.5276884191177, y: 0 });
    expect([drawing.width, drawing.height]).toEqual([1732.891295189951, 324.515625]);
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
      ["sonata", "exposition", 263.5276884191177, 36.20703125, 690.309326171875, 63.37890625],
      ["session", "take", 8, 111.68359375, 1486.7344324448532, 63.37890625],
      ["page", "system", 479.5389188878677, 187.0625, 1243.3523763020833, 63.37890625],
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
    // The card's corner (8, 36.20703125), its start s0' = 52.33544921875 and LA = 800 (README).
    const piece = axisOf("piece");
    expect([piece.line, piece.xStart, piece.xEnd]).toEqual([
      36.20703125 + 48.9765625,
      8 + 52.33544921875,
      8 + 52.33544921875 + 800,
    ]);
    expect(exact(piece)).toEqual(["quarters", "fraction", "0", "16", "16"]);
    const middle = axisOf("middle");
    expect([middle.line, middle.xStart, middle.xEnd]).toEqual([
      36.20703125 + 15,
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
      ["piece", key, 85.18359375, 60.33544921875, 860.33544921875, ancestor],
      ["middle", key, 51.20703125, 260.33544921875, 660.33544921875, ancestor],
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
    // The pieces of `timestamp_1` alone: `middle`'s `origin` and `length`, groupstamps of the
    // fixture, draw their own at `x0` and `x0 + 400`.
    const pieces = (of: Drawing) =>
      groupstampElements(manifest, of.axes, of.boxes)
        .filter((item) => item.address.id === "timestamp_1")
        .map(({ x, y1, y2 }) => [x, y1, y2]);
    // At `x0 + 100` of `middle`, from the top of `middle`'s card to the bottom of `recording`'s,
    // less `middle`'s card, which its own cross-section line crosses: from the bottom of
    // `middle`'s card to the bottom of `recording`'s.
    const bottoms = (of: Drawing) =>
      ["middle", "recording"].map((member) => {
        const card = of.boxes.find(
          (box) =>
            box.kind === "card" &&
            box.key !== null &&
            samePlaceKey(box.key, { item: "group_1", member }),
        );
        return card === undefined ? Number.NaN : card.y + card.height;
      });
    const [middleBottom, recordingBottom] = bottoms(without);
    expect(pieces(without)).toEqual([[211.70361328125, middleBottom, recordingBottom]]);
    expect(bottoms(drawing)).toEqual(bottoms(without));
    expect(pieces(drawing)).toEqual([
      [211.70361328125 + 148.6318359375, middleBottom, recordingBottom],
    ]);
  });
});

describe("an ancestor card and the alignment anchors", () => {
  const name = "groups/group_child_member_stamps";
  const layers = (manifest: Manifest, extra: Graphical[]) => [
    DEFAULT_LAYER,
    ...extra,
    manifestLayer(manifest),
  ];
  const drawn = (manifest: Manifest, extra: Graphical[] = []) =>
    draw(manifest, DEFAULT_PLACEMENT, layers(manifest, extra), metrics);
  const anchors = (drawing: Drawing) =>
    drawing.elements.filter((item) => item.type === "alignment_anchor");

  it("gives the anchor no segment in the card: the member card's alone", () => {
    const manifest = loadFile(name);
    const drawing = drawn(manifest);
    const without = drawn(manifest, [HIDDEN_ANCESTOR_CARDS]);
    // `middle`'s row in `piece`'s card holds `timestamp_2` at the same abscissa.
    const card = [...lineAxes(drawing).entries()].find(
      ([, line]) => line.ancestor !== undefined && line.timeline === "middle",
    );
    expect(card?.[1].xStart).toBe(260.33544921875);
    // The span of `middle`'s member card, at the same ordinates without the ancestor card.
    const middle = drawing.boxes.find(
      (box) =>
        box.kind === "card" &&
        box.key !== null &&
        samePlaceKey(box.key, { item: "group_1", member: "middle" }),
    );
    if (middle === undefined) throw new Error("no card of middle");
    const [y1, y2] = [middle.y, middle.y + middle.height];
    expect(timestampSegments(drawing.axes, "timestamp_2")).toEqual([
      { x: 460.33544921875, y1, y2 },
    ]);
    expect(timestampSegments(without.axes, "timestamp_2")).toEqual([
      { x: 311.70361328125, y1, y2 },
    ]);
    expect(anchors(drawing)).toEqual(
      anchors(without).map((item) => placedAt(item, 148.6318359375, 0)),
    );
  });

  it("draws the anchor from the member card where a root's timestamp lies on its ancestor line", () => {
    const fixture = loadFile(name);
    const graphical = fixture.graphical ?? {};
    // `timestamp_2` moved onto the root `piece` at quarter 8.
    const manifest: Manifest = canonicalOrder({
      ...fixture,
      graphical: {
        ...graphical,
        timestamps: (graphical.timestamps ?? []).map((timestamp) =>
          timestamp.id === "timestamp_2"
            ? { ...timestamp, timeline: "piece", coordinate: [8, 1] }
            : timestamp,
        ),
      },
    });
    validate(withFileIds(manifest));
    const drawing = drawn(manifest);
    const without = drawn(manifest, [HIDDEN_ANCESTOR_CARDS]);
    // The ancestor card draws `piece`'s line and marks `timestamp_2` on it, yet gives no
    // segment (section 8.8); `middle`'s member card draws it on `piece`'s ancestor line, which
    // gives it the segment of that card (sections 8.3 and 8.7), as the line of `middle` would.
    const held = (of: Drawing, card: boolean) =>
      of.axes.flatMap((axis) =>
        (axis.ancestor !== undefined) === card && axis.marker === null
          ? axis.timestamps.filter((timestamp) => timestamp.id === "timestamp_2")
          : [],
      );
    expect(held(drawing, true).map(({ id }) => id)).toEqual([]);
    const [onAncestorLine] = held(drawing, false);
    if (onAncestorLine === undefined) throw new Error("timestamp_2 is not on piece's line");
    const { x, segment } = onAncestorLine;
    expect(timestampSegments(drawing.axes, "timestamp_2")).toEqual([{ x, ...segment }]);
    expect(anchors(drawing)).toHaveLength(1);
    expect(anchors(drawing)).toEqual(
      anchors(without).map((item) => placedAt(item, 148.6318359375, 0)),
    );
  });
});

describe("the ancestor cards of bundle_shared_parent", () => {
  // Drawn whole: their strips are the subject of `elisions.test.ts`.
  const drawing = drawFixture("bundles/bundle_shared_parent", [FULL_CARDS]);
  const keys = [
    { item: "group_1", member: "score" },
    { item: "group_2", member: "score" },
  ];

  it("lie behind both frames, each at its own frame's proportions", () => {
    expect(drawing.origin).toEqual({ x: 698.6901041666667, y: 3.671875 });
    expect([drawing.width, drawing.height]).toEqual([1928.0259602864583, 501.1796875]);
    expect(
      ancestorsOf(drawing).map((box) => [
        box.key,
        box.address,
        box.holder,
        box.ancestor,
        box.x,
        box.y,
        box.width,
        box.height,
      ]),
    ).toEqual([
      [
        keys[0],
        { id: "score", part: ["card"] },
        null,
        { group: "group_1", member: "exposition" },
        674.6666666666667,
        28.8046875,
        1243.3592936197915,
        154.8828125,
      ],
      [
        keys[1],
        { id: "score", part: ["card"] },
        null,
        { group: "group_2", member: "recapitulation" },
        8,
        254.9921875,
        1243.3592936197917,
        154.8828125,
      ],
    ]);
  });

  it("each is score drawn alone at its length, moved", () => {
    const manifest = edit("bundles/bundle_shared_parent", {
      type: "remove",
      targets: ["group_1", "group_2", "take_1", "take_2", "page"].map((id) => ({
        block: BLOCK,
        id,
      })),
    });
    const reference = draw(
      manifest,
      { ...DEFAULT_PLACEMENT, length: 1066.6666666666665 },
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    const [, rootCard] = reference.boxes;
    if (rootCard === undefined) throw new Error("the reference draws no card");
    expect(rootCard.height).toBe(154.8828125);
    expect(span(lineOf(reference.elements, "timeline", at("score")))[0] - rootCard.y).toBe(
      98.4296875,
    );
    // Its line lies on score's ancestor row in its member's card, as drawn with the hiding layer.
    const without = drawFixture("bundles/bundle_shared_parent", [HIDDEN_ANCESTOR_CARDS]);
    expect(without.origin).toEqual({ x: 0, y: 0 });
    expect(
      without.elements
        .filter((item) => item.type === "ancestor" && sameAddress(item.address, at("score")))
        .map((item) => span(item)[0]),
    ).toEqual([123.5625, 349.75]);
    expect(boxesOf(without, "frame")[0]?.y).toBe(28.8046875);
    expect(without.height).toBe(497.5078125);
  });

  it("draw score's line twice, keyed by each card", () => {
    const lines = [...lineAxes(drawing).values()].filter(
      (line) => line.ancestor !== undefined && line.timeline === "score",
    );
    expect(
      lines.map((line) => [
        line.card,
        line.y,
        line.xStart,
        line.xEnd,
        String(line.drawnLength),
        line.ancestor,
      ]),
    ).toEqual([
      [
        keys[0],
        127.234375,
        834.0802408854167,
        1900.7469075520833,
        "32",
        { group: "group_1", member: "exposition" },
      ],
      [
        keys[1],
        353.421875,
        167.41357421875,
        1234.0802408854167,
        "32",
        { group: "group_2", member: "recapitulation" },
      ],
    ]);
  });
});

describe("the hover readers on the lines of the ancestor card of group_parent_both", () => {
  const drawing = shown("group_parent_both");
  const lines = [...lineAxes(drawing).entries()];
  const keyOf = (id: string, ancestor: boolean): string => {
    const found = lines.find(
      ([, line]: [string, LineAxis]) =>
        line.timeline === id && (line.ancestor !== undefined) === ancestor,
    );
    if (found === undefined) throw new Error(`no line of ${id}`);
    return found[0];
  };
  const piece = keyOf("piece", true);
  const middle = keyOf("middle", true);
  const x = 460.33544921875;

  it("cross piece's whole ancestor card down to the wedge, which cuts the rest", () => {
    const card = drawing.boxes.find((box) => box.kind === "card" && box.ancestor !== undefined);
    const wedge = wedgeAt(drawing, piece, x);
    if (card === undefined || wedge === null) throw new Error("no ancestor card or wedge");
    const [[, tip], [, base]] = wedge.points;
    const pieces = crossSection(drawing, piece, x);
    // The wedge's base lies past the card's bottom: below the gap no line is left to draw.
    expect(base > card.y + card.height).toBe(true);
    expect(pieces.map((item) => ({ x: item.x, y1: item.y1, y2: item.y2 }))).toEqual([
      { x, y1: card.y, y2: tip },
    ]);
    const [line] = pieces;
    expect([
      line?.style.stroke,
      line?.style["stroke-width"],
      line?.style["stroke-dasharray"],
    ]).toEqual(["#1BA1E2", 1, "3 3"]);
    expect(crossedLines(drawing, piece)).toEqual([piece, middle]);
    // `middle`'s line in the card crosses it whole too, cut by its own wedge.
    const own = wedgeAt(drawing, middle, x);
    if (own === null) throw new Error("no wedge on middle's line");
    const [[, top], [, foot]] = own.points;
    expect(crossSection(drawing, middle, x).map(({ y1, y2 }) => [y1, y2])).toEqual([
      [card.y, top],
      [foot, card.y + card.height],
    ]);
    expect(crossedLines(drawing, middle)).toEqual([middle]);
  });

  it("place the wedges in the card's markers bands", () => {
    const own = wedgeAt(drawing, keyOf("middle", false), x);
    expect(own?.style.rotation).toBe(0);
    expect(wedgeAt(drawing, piece, x)).toEqual({
      points: [
        [x, 86.68359375],
        [x - 3, 99.68359375],
        [x + 3, 99.68359375],
      ],
      style: own?.style,
    });
    expect(wedgeAt(drawing, middle, x)).toEqual({
      points: [
        [x, 52.70703125],
        [x - 3, 65.70703125],
        [x + 3, 65.70703125],
      ],
      style: own?.style,
    });
  });
});
