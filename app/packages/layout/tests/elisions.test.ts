import { type ElementAddress, type Manifest, sameAddress } from "@timetoalign/tilie-core";
import { canonicalOrder, type Graphical, validate, withFileIds } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  type LineElement,
  lineAxes,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import { at, child, drawFixture, edit, FULL_CARDS, loadFile, metrics, target } from "./support.ts";

type Strip = Extract<DrawnElement, { type: "elision" }>;

/** The strips of a drawing, in drawing order. */
const stripsOf = (drawing: Drawing): Strip[] =>
  drawing.elements.filter((item): item is Strip => item.type === "elision");

/** A strip's geometry and what it carries, its stretch's bounds as text. */
const shape = (strip: Strip) => [
  strip.address,
  strip.x1,
  strip.x2,
  strip.yt,
  strip.yb,
  strip.rule,
  strip.continuations,
  [strip.elided.timeline, String(strip.elided.start), String(strip.elided.end)],
];

/** The labels of the strips: address, text, centre and baseline. */
const labelsOf = (drawing: Drawing) =>
  drawing.elements.flatMap((item) =>
    item.type === "label" &&
    (item.address.part?.includes("elision") === true ||
      (item.address.id?.startsWith("elision_") === true && item.address.part !== undefined))
      ? [[item.address, item.text, item.x, item.baseline]]
      : [],
  );

/** The first line element at `address` drawn in the elements `range` of `drawing`. */
function lineIn(drawing: Drawing, address: ElementAddress, from = 0): LineElement {
  const found = drawing.elements
    .slice(from)
    .find(
      (item): item is LineElement =>
        (item.type === "timeline" || item.type === "child") && sameAddress(item.address, address),
    );
  if (found === undefined) throw new Error(`no line at ${JSON.stringify(address)}`);
  return found;
}

/** The index of the ancestor card of `root` among the drawing's elements. */
const cardIndex = (drawing: Drawing, root: string) =>
  drawing.elements.findIndex((item) => item.type === "ancestor_card" && item.address.id === root);

const SCORE = { id: "score", part: ["elision"] } as const;
const MOVEMENT = { id: "movement", part: ["elision"] } as const;

describe("group_grandchild's default elisions", () => {
  const drawing = drawFixture("groups/group_grandchild");

  it("take r = 1/7, set by the member's line", () => {
    expect(drawing.origin).toEqual({ x: 141.99058314732133, y: 0 });
    expect([drawing.width, drawing.height]).toEqual([909.265625, 227.515625]);
    const card = drawing.elements[cardIndex(drawing, "score")];
    expect(card?.type === "ancestor_card" && [card.x, card.y, card.width, card.height]).toEqual([
      8, 56.18359375, 891.265625, 77.37890625,
    ]);
    expect(stripsOf(drawing).map(shape)).toEqual([
      [
        SCORE,
        82.265625,
        196.55133928571422,
        56.18359375,
        133.5625,
        false,
        [119.16015625],
        ["score", "0", "16"],
      ],
      [
        MOVEMENT,
        196.55133928571422,
        253.69419642857133,
        56.18359375,
        133.5625,
        true,
        [119.16015625, 105.16015625],
        ["movement", "0", "8"],
      ],
      [
        SCORE,
        653.6941964285713,
        882.265625,
        56.18359375,
        133.5625,
        false,
        [119.16015625],
        ["score", "32", "64"],
      ],
    ]);
  });

  it("label each strip with its timeline's name and its stretch", () => {
    const name = (id: string) => ({ id, part: ["elision", "name"] });
    const coordinate = (id: string) => ({ id, part: ["elision", "coordinate"] });
    expect(labelsOf(drawing)).toEqual([
      [name("score"), "Score", 139.4084821428571, 113.53759765625],
      [coordinate("score"), "0–16 ♩", 139.4084821428571, 131.01416015625],
      [name("movement"), "Movement", 225.12276785714278, 99.53759765625],
      [coordinate("movement"), "0–8 ♩", 225.12276785714278, 117.01416015625],
      [name("score"), "Score", 767.9799107142857, 113.53759765625],
      [coordinate("score"), "32–64 ♩", 767.9799107142857, 131.01416015625],
    ]);
  });

  it("draw the elided lines", () => {
    const from = cardIndex(drawing, "score");
    const lines = ["score", "movement", "theme"].map((id) => lineIn(drawing, at(id), from));
    expect(lines.map((line) => [line.xs, line.xe, line.start, line.end])).toEqual([
      [82.265625, 882.265625, "circle", "arrowhead"],
      [196.55133928571422, 653.6941964285713, "circle", "diamond"],
      [253.69419642857133, 653.6941964285713, "circle", "diamond"],
    ]);
  });

  it("write the strips after the card's member drawing, then their labels", () => {
    const card = drawing.boxes.find((box) => box.ancestor !== undefined);
    if (card === undefined) throw new Error("no ancestor card");
    const types = drawing.elements.slice(card.range.start, card.range.end).map((item) => item.type);
    const first = types.indexOf("elision");
    expect(types.slice(first)).toEqual([
      "elision",
      "elision",
      "elision",
      "label",
      "label",
      "label",
      "label",
      "label",
      "label",
    ]);
    expect(types.slice(0, first)).not.toContain("elision");
    expect(drawing.elements.findIndex((item) => item.type === "frame")).toBe(card.range.end);
  });
});

describe("group_grandchild_parent_on_top's default elisions", () => {
  it("lie as group_grandchild's, at the card's own ordinates", () => {
    const drawing = drawFixture("groups/group_grandchild_parent_on_top");
    const strips = stripsOf(drawing);
    expect(strips.map((strip) => [strip.x1, strip.x2, strip.yt, strip.continuations])).toEqual([
      [82.265625, 196.55133928571422, 56.78125, [119.7578125]],
      [196.55133928571422, 253.69419642857133, 56.78125, [119.7578125, 71.78125]],
      [653.6941964285713, 882.265625, 56.78125, [119.7578125]],
    ]);
    expect(labelsOf(drawing).map(([, text, , baseline]) => [text, baseline])).toEqual([
      ["Score", 114.13525390625],
      ["0–16 ♩", 131.61181640625],
      ["Movement", 66.15869140625],
      ["0–8 ♩", 83.63525390625],
      ["Score", 114.13525390625],
      ["32–64 ♩", 131.61181640625],
    ]);
  });
});

describe("group_parents_mixed's default elisions", () => {
  const drawing = drawFixture("groups/group_parents_mixed");

  it("leave sonata whole and elide session and page", () => {
    expect(drawing.origin).toEqual({ x: 168, y: 0 });
    expect([drawing.width, drawing.height]).toEqual([1108.0302734375, 384.4453125]);
    const cards = drawing.elements.flatMap((item) =>
      item.type === "ancestor_card" ? [[item.address.id, item.x, item.width]] : [],
    );
    expect(cards).toEqual([
      ["sonata", 8, 690.309326171875],
      ["session", 37.014035247093034, 874.9697265625001],
      ["page", 224.01123046875, 874.01904296875],
    ]);
    expect(
      stripsOf(drawing).map((strip) => [strip.address.id, strip.x1, strip.x2, strip.rule]),
    ).toEqual([
      ["session", 94.98376180959303, 281.0302734375, false],
      ["session", 681.0302734375001, 894.9837618095931, false],
      ["page", 681.0302734375, 1081.0302734375, false],
    ]);
    expect(labelsOf(drawing).map(([, text]) => text)).toEqual([
      "Session",
      "0″–30″",
      "Session",
      "55.5″–1′30″",
      "Page",
      "600–1 754 px",
    ]);
  });
});

describe("group_elided_inside's default elisions", () => {
  it("fall to the member's parent and its sibling, none to the root", () => {
    const drawing = drawFixture("groups/group_elided_inside");
    expect(drawing.origin).toEqual({ x: 40.86404854910711, y: 0 });
    expect([drawing.width, drawing.height]).toEqual([922.4248046875, 227.515625]);
    expect(
      stripsOf(drawing).map((strip) => [
        strip.address,
        strip.x1,
        strip.x2,
        strip.rule,
        strip.continuations,
        String(strip.elided.start),
        String(strip.elided.end),
      ]),
    ).toEqual([
      [
        { id: "first", part: ["elision"] },
        95.4248046875,
        152.5676618303571,
        false,
        [119.16015625, 105.16015625],
        "0",
        "8",
      ],
      [
        { id: "first", part: ["elision"] },
        552.5676618303571,
        666.8533761160713,
        false,
        [119.16015625, 105.16015625],
        "16",
        "32",
      ],
      [
        { id: "second", part: ["elision"] },
        666.8533761160713,
        895.4248046875,
        true,
        [119.16015625, 105.16015625],
        "0",
        "32",
      ],
    ]);
  });
});

describe("bundle_elisions_stored", () => {
  const drawing = drawFixture("bundles/bundle_elisions_stored");

  it("draws the stored elisions of score's card, clipped, in their four widths", () => {
    const score = stripsOf(drawing).filter((strip) => strip.elided.timeline === "score");
    expect(
      score.map((strip) => [
        strip.address,
        strip.x2 - strip.x1,
        strip.rule,
        String(strip.elided.start),
        String(strip.elided.end),
      ]),
    ).toEqual([
      [{ id: "elision_4" }, 400, false, "0", "16"],
      [{ id: "elision_5" }, 200, false, "32", "48"],
      [{ id: "elision_6" }, 30, true, "48", "56"],
    ]);
    expect(labelsOf(drawing).map(([address, text]) => [address, text])).toEqual([
      [{ id: "elision_4", part: ["name"] }, "Score"],
      [{ id: "elision_4", part: ["coordinate"] }, "0–16 ♩"],
      [{ id: "elision_5", part: ["name"] }, "Score"],
      [{ id: "elision_5", part: ["coordinate"] }, "32–48 ♩"],
      [{ id: "elision_6", part: ["name"] }, "Score"],
      [{ id: "elision_6", part: ["coordinate"] }, "48–…"],
      [{ id: "elision_2", part: ["name"] }, "Page"],
      [{ id: "elision_2", part: ["coordinate"] }, "600–1 754 px"],
    ]);
  });

  it("draws no default, nothing on a hidden timeline, a member or under the Full rule", () => {
    expect(stripsOf(drawing).map((strip) => strip.address.id)).toEqual([
      "elision_4",
      "elision_5",
      "elision_6",
      "elision_2",
    ]);
    const session = drawing.elements.find(
      (item) => item.type === "ancestor_card" && item.address.id === "session",
    );
    expect(session?.type === "ancestor_card" && session.width).toBe(1486.7344324448532);
  });

  it("draws page's stored elision on its ungrouped card at its own proportion", () => {
    const [page] = stripsOf(drawing).filter((strip) => strip.elided.timeline === "page");
    expect(page && [page.x1, page.x2, String(page.elided.start), String(page.elided.end)]).toEqual([
      673.3880644791947,
      810.2181671017717,
      "600",
      "1754",
    ]);
    const line = lineIn(drawing, at("page"));
    expect([line.xs, line.xe]).toEqual([536.5579618566177, 810.2181671017717]);
  });

  it("gives score's line one axis per full run", () => {
    const [first, , third] = stripsOf(drawing);
    const runs = [...lineAxes(drawing).entries()].filter(
      ([, line]) => line.timeline === "score" && line.ancestor !== undefined,
    );
    const end = lineIn(drawing, at("score")).xe;
    expect(
      runs.map(([, line]) => [
        line.xStart,
        line.xEnd,
        String(line.start),
        String(line.length),
        String(line.drawnLength),
      ]),
    ).toEqual([
      [first?.x2, stripsOf(drawing)[1]?.x1, "16", "16", "16"],
      [third?.x2, end, "56", "8", "8"],
    ]);
    expect(new Set(runs.map(([key]) => key)).size).toBe(2);
    expect(
      drawing.axes
        .filter((axis) => axis.address.id === "score" && axis.ancestor !== undefined)
        .map((axis) => axis.run),
    ).toEqual([undefined, 1]);
  });
});

describe("a line in one run", () => {
  it("has one axis without a run", () => {
    const drawing = drawFixture("groups/group_grandchild");
    const axes = drawing.axes.filter(
      (axis) => axis.address.id === "score" && axis.ancestor !== undefined,
    );
    expect(
      axes.map((axis) => [axis.xStart, axis.xEnd, String(axis.start), String(axis.end), axis.run]),
    ).toEqual([[253.69419642857133, 653.6941964285713, "24", "32", undefined]]);
  });
});

describe("what lies in a strip", () => {
  it("is not drawn: a named timestamp", () => {
    const manifest = edit("groups/group_grandchild", {
      type: "add",
      into: target("score"),
      timestamp: { name: "Here", coordinate: [4, 1] },
    });
    const drawn = (extra: Graphical[]) =>
      draw(
        manifest,
        DEFAULT_PLACEMENT,
        [DEFAULT_LAYER, ...extra, manifestLayer(manifest)],
        metrics,
      );
    const id = manifest.graphical?.timestamps?.find((item) => item.name === "Here")?.id;
    if (id === undefined) throw new Error("no timestamp named");
    const elided = drawn([]);
    expect(elided.elements.filter((item) => item.address.id === id)).toEqual([]);
    expect(elided.axes.flatMap((axis) => axis.timestamps).map((item) => item.id)).not.toContain(id);
    const full = drawn([FULL_CARDS]);
    expect(
      full.elements.filter((item) => item.address.id === id).map((item) => item.type),
    ).toContain("wedge");
  });

  it("cuts a line starting in a strip at the strip's right edge", () => {
    const manifest = edit("bundles/bundle_elisions_stored", child("score", "inner", 8, 16));
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    const [first] = stripsOf(drawing);
    const from = cardIndex(drawing, "score");
    const inner = lineIn(drawing, at("inner"), from);
    const theme = lineIn(drawing, at("theme"), from);
    expect([inner.xs, inner.xe, inner.start, inner.end]).toEqual([
      first?.x2,
      theme.xe,
      "none",
      "diamond",
    ]);
  });
});

describe("elided and full", () => {
  const widthOf = (drawing: Drawing) =>
    drawing.elements.find((item) => item.type === "ancestor_card");

  it("draws every card whole under the Full rule, or one root's within it", () => {
    for (const layer of [
      FULL_CARDS,
      { rules: [{ select: { element: "elision", within: "score" }, set: { display: "none" } }] },
    ] satisfies Graphical[]) {
      const drawing = drawFixture("groups/group_grandchild", [layer]);
      expect(stripsOf(drawing)).toEqual([]);
      const card = widthOf(drawing);
      expect(card?.type === "ancestor_card" && card.width).toBe(3291.265625);
    }
  });

  /** `bundle_elisions_stored` with `elision_4`'s `display` replaced, validated. */
  function withDisplay(display: ("strip" | "name" | "coordinate")[]): Manifest {
    const source = loadFile("bundles/bundle_elisions_stored");
    const graphical = source.graphical ?? {};
    const manifest: Manifest = canonicalOrder({
      ...source,
      graphical: {
        ...graphical,
        elisions: (graphical.elisions ?? []).map((item) =>
          item.id === "elision_4" ? { ...item, display } : item,
        ),
      },
    });
    validate(withFileIds(manifest));
    return manifest;
  }

  it("draws an elision whose display leaves out its strip nowhere", () => {
    const manifest = withDisplay(["name", "coordinate"]);
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    expect(stripsOf(drawing).map((strip) => strip.address.id)).toEqual([
      "elision_5",
      "elision_6",
      "elision_2",
    ]);
  });

  it("draws a strip without the labels its display leaves out", () => {
    const manifest = withDisplay(["strip"]);
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    expect(stripsOf(drawing).map((strip) => strip.address.id)).toEqual([
      "elision_4",
      "elision_5",
      "elision_6",
      "elision_2",
    ]);
    expect(
      labelsOf(drawing).filter(([address]) => (address as ElementAddress).id === "elision_4"),
    ).toEqual([]);
  });
});

describe("the view", () => {
  it("sets the default proportion where the elided card must lie within it", () => {
    const placement: Placement = { ...DEFAULT_PLACEMENT, view: { width: 640, height: 360 } };
    const drawing = drawFixture("groups/group_grandchild", [], placement);
    expect(drawing.origin).toEqual({ x: 59.47315673828143, y: 0 });
    expect(stripsOf(drawing).map((strip) => [strip.x1, strip.x2])).toEqual([
      [82.265625, 141.53972167968755],
      [141.53972167968755, 171.17677001953143],
      [571.1767700195314, 689.7249633789065],
    ]);
  });
});

describe("other ancestor cards", () => {
  it.each([
    ["bundles/bundle_shared_parent", 2],
    ["bundles/bundle_mixed", 2],
    ["groups/group_parent_both", 0],
    ["groups/group_parent_right", 0],
    ["groups/group_parent_exact", 0],
    ["groups/group_child_member", 0],
    ["groups/group_child_member_stamps", 0],
  ])("%s draws %i strips", (name, count) => {
    expect(stripsOf(drawFixture(name))).toHaveLength(count);
  });
});
