import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type ElementAddress,
  isLoadError,
  loadManifest,
  type Manifest,
  sameAddress,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { dumps, type Graphical, JsonFloat, loads } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  type ElisionExposure,
  type ExposedGap,
  type LineElement,
  manifestLayer,
  widthAs,
} from "../src/index.ts";
import { at, edit, fixturesDir, loadFile, manifestNames, metrics, target } from "./support.ts";

/** A fixture drawn at the default placement and view, under `extra` layers. */
function drawn(name: string, extra: readonly Graphical[] = []): Drawing {
  return drawnManifest(loadFile(name), extra);
}

/** A manifest drawn at the default placement and view, under `extra` layers. */
function drawnManifest(manifest: Manifest, extra: readonly Graphical[] = []): Drawing {
  return draw(
    manifest,
    DEFAULT_PLACEMENT,
    [DEFAULT_LAYER, ...extra, manifestLayer(manifest)],
    metrics,
  );
}

/** The `add` command of an elision on the timeline `timeline` of the block. */
const elisionOn = (timeline: string, elision: object): object => ({
  type: "add",
  into: target(timeline),
  elision,
});

/** A layer of one rule hiding the element `id`. */
const hiding = (id: string): Graphical[] => [
  { rules: [{ select: { addresses: [{ id }] }, set: { display: "none" } }] },
];

/** The start and end of every axis of a drawn ancestor card's line of `id`, as text. */
const cardRuns = (drawing: Drawing, id: string) =>
  drawing.axes
    .filter((axis) => axis.address.id === id && axis.ancestor !== undefined)
    .map((axis) => [String(axis.start), String(axis.end)]);

/** A layer of one rule setting `set` on the cards of the root `root`. */
const onCards = (root: string, set: Record<string, string | number>): Graphical[] => [
  { rules: [{ select: { addresses: [{ id: root, part: ["card"] }] }, set }] },
];

/** The exposure of the container keyed `key`. */
function exposureOf(drawing: Drawing, key: object): ElisionExposure {
  const found = drawing.elisions.find((each) => JSON.stringify(each.key) === JSON.stringify(key));
  if (found === undefined) throw new Error(`no exposure at ${JSON.stringify(key)}`);
  return found;
}

/** A gap's address, origin, timeline, elided coordinates as text, natural and drawn widths. */
const gapShape = (gap: ExposedGap) => [
  gap.address,
  gap.origin,
  gap.timeline,
  String(gap.start),
  String(gap.end),
  gap.natural,
  gap.drawn,
];

const of = (drawing: Drawing, type: DrawnElement["type"], address: ElementAddress) =>
  drawing.elements.filter(
    (element) => element.type === type && sameAddress(element.address, address),
  );

const derived = (id: string): ElementAddress => ({ id, part: ["elision"] });

/** `a(9)` and `h(9)` of the bundled font metrics (section 5.1): 1901 and 1901 + 483 of 2048. */
const A9 = (1901 * 9) / 2048;
const H9 = ((1901 + 483) * 9) / 2048;

/**
 * Every drawing of a gap with what follows it in the drawing: its ellipses and its labels, the
 * elements of the gap's address written right after it (section 8.5).
 */
function gapDrawings(drawing: Drawing) {
  // An ancestor card's elements are laid out in its own coordinates and then moved (section 8.8),
  // so their middles are the moved middles of the card's own drawing: left to their own tests.
  const moved = drawing.boxes.filter((box) => box.ancestor !== undefined).map((box) => box.range);
  return drawing.elements.flatMap((element, index) => {
    if (element.type !== "elision") return [];
    if (moved.some((range) => range.start <= index && index < range.end)) return [];
    const following: DrawnElement[] = [];
    for (const next of drawing.elements.slice(index + 1)) {
      if (next.type !== "ellipsis" && next.type !== "label") break;
      following.push(next);
    }
    return [{ gap: element, following }];
  });
}

/** The ordinates of the rows whose line, map or region a gap drawn from `x1` to `x2` cuts. */
const crossingYs = (drawing: Drawing, x1: number, x2: number) =>
  drawing.elements.flatMap((element) => {
    if (!("cuts" in element) || !element.cuts.some(([a, b]) => a === x1 && b === x2)) return [];
    return [
      element.type === "map" ? element.yc : element.type === "region" ? element.yb : element.y,
    ];
  });

/** The elided coordinates of a frame's gap, timeline by timeline, as text. */
const membersText = (gap: ExposedGap) =>
  gap.members.map(({ timeline, start, end }) => [timeline, String(start), String(end)]);

/** The text labels drawn at the parts of an elision's address. */
const labelTexts = (drawing: Drawing, address: ElementAddress) =>
  drawing.elements.flatMap((element) =>
    element.type === "label" &&
    element.address.id === address.id &&
    JSON.stringify(element.address.part?.slice(0, -1) ?? []) === JSON.stringify(address.part ?? [])
      ? [element.text]
      : [],
  );

/** The first line element at `address` of `type`. */
function lineOf(
  drawing: Drawing,
  type: LineElement["type"],
  address: ElementAddress,
  from = 0,
): LineElement {
  const found = drawing.elements
    .slice(from)
    .find(
      (element): element is LineElement =>
        element.type === type && sameAddress(element.address, address),
    );
  if (found === undefined) throw new Error(`no ${type} at ${JSON.stringify(address)}`);
  return found;
}

const cardAt = (drawing: Drawing, root: string) =>
  drawing.elements.findIndex(
    (element) => element.type === "ancestor_card" && element.address.id === root,
  );

describe("derived elisions with their middles left out", () => {
  const drawing = drawn("groups/group_elided_inside");
  const card = exposureOf(drawing, { item: "group_1", member: "piece" });

  it("take r = 1/7 on depths 1 and 2", () => {
    expect([card.kind, card.mode, card.drawn, card.proportion, card.automatic]).toEqual([
      "ancestor_card",
      "auto",
      "proportional",
      0.14285714285714285,
      true,
    ]);
    expect([card.chain, card.depths, card.display]).toEqual([
      ["piece", "first"],
      [1, 2],
      ["ellipsis", "name"],
    ]);
    expect(card.gaps.map(gapShape)).toEqual([
      [derived("first"), "default", "first", "0", "8", 400, 57.14285714285714],
      [derived("first"), "default", "first", "16", "32", 800, 114.28571428571428],
      [derived("second"), "default", "second", "1", "31", 1500, 128.57142857142856],
    ]);
  });

  it("draw one ellipsis per gap at the middle of the card, its name below it, no rectangle", () => {
    // The card from 16.23046875 to 113.5859375: `ym` 64.908203125, the name's baseline `ym + 2 + 2
    // + a(9)`.
    const ym = (16.23046875 + 113.5859375) / 2;
    const shown = (id: string) =>
      of(drawing, "ellipsis", { id, part: ["elision", "ellipsis"] }).map(
        (element) => element.type === "ellipsis" && element.y,
      );
    expect(shown("first")).toEqual([ym, ym]);
    expect(shown("second")).toEqual([ym]);
    expect(labelTexts(drawing, derived("first"))).toEqual(["First", "First"]);
    expect(labelTexts(drawing, derived("second"))).toEqual(["Second"]);
    expect(
      of(drawing, "label", { id: "second", part: ["elision", "name"] }).map(
        (element) => element.type === "label" && element.baseline,
      ),
    ).toEqual([ym + 2 + 2 + A9]);
    const gaps = drawing.elements.filter((element) => element.type === "elision");
    expect(
      gaps.map((gap) => gap.type === "elision" && [gap.style.fill, gap.continuations]),
    ).toEqual([
      ["none", []],
      ["none", []],
      ["none", []],
    ]);
  });

  it("cut every row at the gaps it crosses", () => {
    const from = cardAt(drawing, "piece");
    expect(lineOf(drawing, "timeline", at("piece"), from).cuts).toHaveLength(3);
    expect(lineOf(drawing, "child", at("first"), from).cuts).toHaveLength(2);
    expect(lineOf(drawing, "child", at("second"), from).cuts).toHaveLength(1);
  });

  it("leave the member card's ancestor rows at the heights of the card behind, but where a derived label widens a band", () => {
    const from = cardAt(drawing, "piece");
    const piece = lineOf(drawing, "timeline", at("piece"), from).y;
    expect(lineOf(drawing, "ancestor", at("piece")).y).toBe(piece);
    // `first`'s markers band, between its line and `piece`'s on the card behind, takes the room of
    // the derived gaps' name labels, `w/2 + 13 + 2 + h(9)` (section 6.4): `first` lies `7 + 26.9765625`
    // above `piece` there; `dr` counts no derived stack (section 8.3), so `first`'s ancestor line
    // keeps its distance of 14 in the member's card.
    expect(piece - lineOf(drawing, "child", at("first"), from).y).toBe(7 + 1.5 + 13 + 2 + H9);
    expect(piece - lineOf(drawing, "ancestor", at("first")).y).toBe(14);
  });
});

describe("derived elisions on a fraction axis", () => {
  it("leave out each movement's middle", () => {
    const card = exposureOf(drawn("bundles/bundle_elided_layerit"), {
      item: "group_3",
      member: "clt_1",
    });
    expect(card.proportion).toBe(0.016991818753933293);
    expect(
      card.gaps.map((gap) => [gap.timeline, String(gap.start), String(gap.end), gap.drawn]),
    ).toEqual([
      ["clt_2", "1", "355", 59.986481131855626],
      ["clt_3", "1", "311", 48.91033261077412],
      ["clt_4", "28", "323", 45.13437288767693],
      ["clt_5", "4", "620", 38.561405962287324],
    ]);
  });
});

describe("group elisions", () => {
  const drawing = drawn("groups/group_elided_members");
  const frame = exposureOf(drawing, { item: "group_1" });

  it("are drawn across the frame, which shortens by their shrinks", () => {
    expect([frame.kind, frame.mode, frame.drawn]).toEqual(["frame", "auto", "custom"]);
    expect(frame.gaps.map(gapShape)).toEqual([
      [at("elision_1"), "stored", "excerpt", "2", "8", 150, 32],
      [at("elision_2"), "stored", "phrase", "2", "6", 66.66666666666666, 33.33333333333333],
    ]);
    const DG = 151.33333333333331;
    expect(frame.runs.at(-1)?.D).toBe(DG);
    const voice = lineOf(drawing, "timeline", at("voice"));
    expect(voice.xe).toBe(frame.place.x + (frame.x0 + (400 - DG)));
  });

  it("give every timeline of the member cards its elided coordinates, none on an unknown length", () => {
    expect(frame.gaps.map(membersText)).toEqual([
      [
        ["excerpt", "2", "8"],
        ["piece", "18", "24"],
        ["voice", "3", "12"],
        ["sketch", "null", "null"],
      ],
      [
        ["excerpt", "28/3", "12"],
        ["piece", "76/3", "28"],
        ["voice", "14", "18"],
        ["phrase", "2", "6"],
        ["sketch", "null", "null"],
      ],
    ]);
  });

  it("draw one ellipsis centred on the member cards together, their labels once below it", () => {
    // `elision_2` states no `display`: the default, its ellipsis and its name.
    expect(labelTexts(drawing, at("elision_1"))).toEqual(["Development", "2–8 ♩"]);
    expect(labelTexts(drawing, at("elision_2"))).toEqual(["Phrase"]);
    const ys = (id: string) =>
      of(drawing, "ellipsis", { id, part: ["ellipsis"] }).map(
        (element) => element.type === "ellipsis" && element.y,
      );
    // Carried into the ancestor card (46.68359375 to 130.63671875), then across the frame, from the
    // top of `excerpt`'s card, 32.8046875, to the bottom of `sketch`'s, 210.61328125 + 49.37890625.
    const card = (46.68359375 + 130.63671875) / 2;
    const frame = (32.8046875 + (210.61328125 + 49.37890625)) / 2;
    expect(ys("elision_1")).toEqual([card, frame]);
    expect(ys("elision_2")).toEqual([card, frame]);
    const baselines = (id: string) =>
      drawing.elements.flatMap((element) =>
        element.type === "label" && element.address.id === id ? [element.baseline] : [],
      );
    expect(baselines("elision_1")).toEqual([frame + 4 + A9, frame + 4 + H9 + A9]);
    expect(baselines("elision_2")).toEqual([frame + 4 + A9]);
  });

  it("leave out what marks a position in a gap", () => {
    const climax = drawing.elements.filter((element) => element.address.id === "timestamp_1");
    expect(climax).toEqual([]);
    const returned = drawing.elements.filter(
      (element) =>
        element.type === "cross_section" && sameAddress(element.address, at("timestamp_2", "line")),
    );
    expect(returned.some((element) => element.style.opacity === 0.35)).toBe(true);
  });

  it("are carried into the ancestor card behind the frame", () => {
    const card = exposureOf(drawing, { item: "group_1", member: "piece" });
    expect([card.proportion, card.depths]).toEqual([0.31083333333333335, [1]]);
    expect(card.gaps.map(gapShape)).toEqual([
      [derived("piece"), "default", "piece", "1", "15", 350, 74.33333333333334],
      [at("elision_1"), "carried", "excerpt", "2", "8", 150, 32],
      [at("elision_2"), "carried", "phrase", "2", "6", 66.66666666666666, 33.33333333333333],
      [derived("piece"), "default", "piece", "33", "47", 350, 74.33333333333334],
    ]);
  });

  it("are carried exactly onto the fraction axis of the card behind", () => {
    expect(cardRuns(drawing, "piece")).toEqual([
      ["0", "1"],
      ["15", "16"],
      ["16", "18"],
      ["24", "76/3"],
      ["28", "32"],
      ["32", "33"],
      ["47", "48"],
    ]);
  });

  it("are carried exactly where the root's axis is exact, the member's length a float", () => {
    // `excerpt` turned float before loading; its offset keeps `piece`'s number type.
    const value = loads(
      readFileSync(path.join(fixturesDir, "groups/group_elided_members.yaml"), "utf8"),
    ) as {
      timelines: { children: Record<string, unknown>[] }[];
      graphical: {
        elisions: Record<string, unknown>[];
        timestamps: { id: string; coordinate: unknown }[];
      };
    };
    const excerpt = value.timelines[0]?.children[0];
    const elision = value.graphical.elisions[0];
    if (excerpt?.id !== "#excerpt" || elision?.id !== "#elision_1") {
      throw new Error("the fixture changed");
    }
    Object.assign(excerpt, { number_type: "float", length: new JsonFloat(16) });
    Object.assign(elision, { start: new JsonFloat(2), end: new JsonFloat(8) });
    // `excerpt`'s groupstamps, its origin and its length.
    const floats: Record<string, number> = { "#timestamp_3": 0, "#timestamp_4": 16 };
    for (const stamp of value.graphical.timestamps) {
      const float = floats[stamp.id];
      if (float !== undefined) stamp.coordinate = new JsonFloat(float);
    }
    const manifest = loadManifest(dumps(value));
    if (isLoadError(manifest)) throw new Error(manifest.problems[0]?.message);
    const floated = drawnManifest(manifest);
    const runs = floated.axes.filter(
      (axis) => axis.address.id === "piece" && axis.ancestor !== undefined,
    );
    expect(cardRuns(floated, "piece")).toEqual([
      ["0", "1"],
      ["15", "16"],
      ["16", "18"],
      ["24", "76/3"],
      ["28", "32"],
      ["32", "33"],
      ["47", "48"],
    ]);
    expect(
      runs.every((axis) => axis.start instanceof Rational && axis.end instanceof Rational),
    ).toBe(true);
    const members = exposureOf(floated, { item: "group_1" }).gaps.map((gap) =>
      gap.members.filter(({ timeline }) => timeline === "excerpt" || timeline === "piece"),
    );
    expect(members).toEqual([
      [
        { timeline: "excerpt", start: 2, end: 8 },
        { timeline: "piece", start: Rational.of(18n), end: Rational.of(24n) },
      ],
      [
        { timeline: "excerpt", start: 9.333333333333334, end: 12 },
        {
          timeline: "piece",
          start: Rational.fromParts(76n, 3n),
          end: Rational.of(28n),
        },
      ],
    ]);
  });

  it("are left out under the frame's mode full", () => {
    const full = drawn("groups/group_elided_members", [
      { rules: [{ select: { addresses: [{ id: "group_1" }] }, set: { "elision-mode": "full" } }] },
    ]);
    expect(exposureOf(full, { item: "group_1" }).gaps).toEqual([]);
    const card = exposureOf(full, { item: "group_1", member: "piece" });
    expect(card.proportion).toBe(0.5);
    expect(card.gaps.map((gap) => gap.origin)).toEqual(["default", "default"]);
  });
});

describe("stored elisions", () => {
  const drawing = drawn("bundles/bundle_elisions_stored");

  it("are drawn clipped in their four widths, a group's carried", () => {
    const score = exposureOf(drawing, { item: "group_1", member: "score" });
    expect([score.drawn, score.gaps.map(gapShape)]).toEqual([
      "custom",
      [
        [at("elision_4"), "stored", "score", "0", "16", 800, 400],
        [at("elision_3"), "carried", "recording", "0", "2", 80, 32],
        [at("elision_5"), "stored", "score", "32", "48", 800, 200],
        [at("elision_6"), "stored", "score", "48", "56", 400, 30],
      ],
    ]);
    const session = exposureOf(drawing, { item: "group_1", member: "session" });
    expect([session.drawn, session.gaps.map((gap) => gap.address)]).toEqual([
      "full",
      [at("elision_3")],
    ]);
    const frame = exposureOf(drawing, { item: "group_1" });
    expect(frame.gaps.map(gapShape)).toEqual([
      [at("elision_3"), "stored", "recording", "0", "2", 80, 32],
    ]);
    expect(frame.gaps[0]?.members[0]).toEqual({
      timeline: "theme",
      start: Rational.of(0n),
      end: Rational.of([8n, 5n]),
    });
    const page = exposureOf(drawing, { item: "page" });
    expect(page.gaps.map(gapShape)).toEqual([
      [at("elision_2"), "stored", "page", "600", "1754", 263.169897377423, 32],
    ]);
  });

  it("draw what their display lists", () => {
    expect(labelTexts(drawing, at("elision_4"))).toEqual(["elision_4"]);
    expect(labelTexts(drawing, at("elision_5"))).toEqual(["Development"]);
    expect(labelTexts(drawing, at("elision_6"))).toEqual([]);
    expect(labelTexts(drawing, at("elision_2"))).toEqual(["Appendix", "600–1 754 px"]);
    expect(of(drawing, "ellipsis", at("elision_6", "ellipsis"))).toEqual([]);
    expect(of(drawing, "elision", at("elision_1"))).toEqual([]);
    const fourth = of(drawing, "elision", at("elision_4"))[0];
    if (fourth?.type !== "elision") throw new Error("elision_4 draws no gap");
    // A continuation on each row it crosses, one ellipsis in the middle.
    expect(fourth.continuations).toEqual(crossingYs(drawing, fourth.x1, fourth.x2));
    expect(
      of(drawing, "ellipsis", at("elision_4", "ellipsis")).map(
        (element) => element.type === "ellipsis" && [element.x, element.y],
      ),
    ).toEqual([[(fourth.x1 + fourth.x2) / 2, (fourth.yt + fourth.yb) / 2]]);
  });

  it("give score's line one axis per full run, the carried gap's end exact", () => {
    expect(cardRuns(drawing, "score")).toEqual([
      ["88/5", "24"],
      ["24", "32"],
      ["56", "64"],
    ]);
  });

  it("carry a gap onto a float axis in binary64", () => {
    const runs = drawing.axes.filter(
      (axis) => axis.address.id === "session" && axis.ancestor !== undefined,
    );
    expect(runs.map((axis) => [axis.start, axis.end])).toEqual([
      [0, 30],
      [35.1, 55.5],
      [55.5, 90],
    ]);
  });

  it("give the frame's gap its elided coordinates on every timeline of the member cards", () => {
    const frame = exposureOf(drawing, { item: "group_1" });
    expect(frame.gaps.map(membersText)).toEqual([
      [
        ["theme", "0", "8/5"],
        ["score", "16", "88/5"],
        ["take", "0", "5.1"],
        ["session", "30", "35.1"],
        ["recording", "0", "2"],
      ],
    ]);
    const take = frame.gaps[0]?.members[2];
    expect([typeof take?.start, typeof take?.end]).toEqual(["number", "number"]);
  });

  it("write their widths back in each form", () => {
    const score = exposureOf(drawing, { item: "group_1", member: "score" });
    const fifth = score.gaps[2];
    if (fifth === undefined) throw new Error("no gap of elision_5");
    const lambda = Rational.of(64n);
    expect(widthAs("standard", fifth, 3200, lambda, "fraction")).toBeNull();
    expect(widthAs("ratio", fifth, 3200, lambda, "fraction")).toEqual({ ratio: 0.25 });
    expect(widthAs("span", fifth, 3200, lambda, "fraction")).toEqual({ span: Rational.of(4n) });
    expect(widthAs("canvas", fifth, 3200, lambda, "fraction")).toEqual({ canvas: 200 });
    const page = exposureOf(drawing, { item: "page" }).gaps[0];
    if (page === undefined) throw new Error("no gap of elision_2");
    expect(widthAs("span", page, 400, Rational.of(1754n), "int")).toEqual({
      span: Rational.of(140n),
    });
  });
});

describe("the ancestor-row distance", () => {
  const manifest = edit(
    "groups/group_grandchild",
    elisionOn("movement", {
      start: [1, 1],
      end: [6, 1],
      name: "Intro",
      display: ["ellipsis", "name"],
    }),
  );
  const drawing = drawnManifest(manifest);

  it("draws the stored card elision in the card behind", () => {
    const card = exposureOf(drawing, { item: "group_1", member: "score" });
    expect([card.drawn, card.proportion, card.gaps.map(gapShape)]).toEqual([
      "custom",
      1,
      [[at("elision_1"), "stored", "movement", "1", "6", 250, 32]],
    ]);
    expect(labelTexts(drawing, at("elision_1"))).toEqual(["Intro"]);
  });

  it("counts its label stack, so both rows lie at their heights on the card behind", () => {
    const from = cardAt(drawing, "score");
    expect([
      lineOf(drawing, "ancestor", at("movement")).y,
      lineOf(drawing, "ancestor", at("score")).y,
    ]).toEqual([85.18359375, 119.16015625]);
    expect([
      lineOf(drawing, "child", at("movement"), from).y,
      lineOf(drawing, "timeline", at("score"), from).y,
    ]).toEqual([85.18359375, 119.16015625]);
    const card = drawing.boxes.find(
      (box) =>
        box.kind === "card" && JSON.stringify(box.key) === '{"item":"group_1","member":"theme"}',
    );
    expect(card?.height).toBe(101.35546875);
  });
});

describe("an elision that is not drawn", () => {
  it("takes nothing from a later card elision", () => {
    const manifest = edit(
      "groups/group_grandchild",
      elisionOn("score", { start: [0, 1], end: [12, 1] }),
      elisionOn("score", { start: [4, 1], end: [14, 1] }),
    );
    const card = exposureOf(drawnManifest(manifest, hiding("elision_1")), {
      item: "group_1",
      member: "score",
    });
    expect(card.gaps.map(gapShape)).toEqual([
      [at("elision_2"), "stored", "score", "4", "14", 500, 32],
    ]);
  });

  it("takes nothing from a later group elision", () => {
    const manifest = edit(
      "groups/group_elided_members",
      elisionOn("voice", { start: [0, 1], end: [12, 1] }),
    );
    const frame = exposureOf(drawnManifest(manifest, hiding("elision_1")), { item: "group_1" });
    expect(frame.gaps.map(gapShape)).toEqual([
      [at("elision_3"), "stored", "voice", "0", "12", 200, 32],
      [at("elision_2"), "stored", "phrase", "2", "6", 66.66666666666666, 33.33333333333333],
    ]);
  });
});

describe("a cut piece", () => {
  const manifest = edit(
    "groups/group_elided_members",
    elisionOn("voice", { start: [10, 1], end: [14, 1] }),
    elisionOn("voice", { start: [12, 1], end: [20, 1] }),
  );
  const frame = exposureOf(drawnManifest(manifest, hiding("elision_2")), { item: "group_1" });

  it("keeps the exact end of the piece that cut it", () => {
    expect(frame.gaps.map(gapShape)).toEqual([
      [at("elision_1"), "stored", "excerpt", "2", "8", 150, 32],
      [at("elision_3"), "stored", "voice", "12", "14", 33.33333333333334, 32],
      [at("elision_4"), "stored", "voice", "14", "20", 100.00000000000003, 32],
    ]);
  });

  it("gives its elided coordinates at its exact proportions", () => {
    expect(frame.gaps.slice(1).map(membersText)).toEqual([
      [
        ["excerpt", "8", "28/3"],
        ["piece", "24", "76/3"],
        ["voice", "12", "14"],
        ["phrase", "0", "2"],
        ["sketch", "null", "null"],
      ],
      [
        ["excerpt", "28/3", "40/3"],
        ["piece", "76/3", "88/3"],
        ["voice", "14", "20"],
        ["phrase", "2", "8"],
        ["sketch", "null", "null"],
      ],
    ]);
  });
});

describe("modes", () => {
  const card = (extra: Graphical[]) =>
    exposureOf(drawn("groups/group_elided_inside", extra), { item: "group_1", member: "piece" });

  it("full and custom draw no gap where nothing is stored", () => {
    for (const mode of ["full", "custom"]) {
      const exposure = card(onCards("piece", { "elision-mode": mode }));
      expect([exposure.drawn, exposure.gaps]).toEqual([mode, []]);
    }
  });

  it("a stated proportion", () => {
    const exposure = card(
      onCards("piece", { "elision-mode": "proportional", "elision-proportion": 0.05 }),
    );
    expect([exposure.proportion, exposure.automatic]).toEqual([0.05, false]);
    expect(exposure.gaps.map((gap) => [String(gap.start), String(gap.end), gap.drawn])).toEqual([
      ["0", "8", 20],
      ["16", "32", 40],
      ["0", "32", 80],
    ]);
  });

  it("the root's row alone", () => {
    const exposure = card(onCards("piece", { "elision-depths": "1" }));
    const r = 0.14285714285714285;
    const W = r * 2400;
    expect(exposure.depths).toEqual([1]);
    expect(exposure.gaps.map((gap) => [String(gap.start), String(gap.end), gap.drawn])).toEqual([
      ["0", "8", r * 400],
      ["19", "61", W - 150 - 150],
    ]);
  });

  it("labels on the derived elisions", () => {
    const drawing = drawn(
      "groups/group_elided_inside",
      onCards("piece", { "elision-display": "ellipsis name coordinate" }),
    );
    expect(labelTexts(drawing, derived("first"))).toEqual(["First", "0–8 ♩", "First", "16–32 ♩"]);
    expect(labelTexts(drawing, derived("second"))).toEqual(["Second", "1–31 ♩"]);
  });

  it("a hidden card draws and records nothing", () => {
    const drawing = drawn("groups/group_elided_inside", onCards("piece", { display: "none" }));
    expect(drawing.elisions.map((each) => each.kind)).toEqual(["frame"]);
    expect(drawing.elements.filter((element) => element.type === "elision")).toEqual([]);
  });
});

describe("ellipses", () => {
  it("are one per drawing of a gap, at its middle and the middle of its height, its labels below", () => {
    // Every fixture drawn with the defaults (section 6.6), in its member and block-held cards and
    // across its frames: a gap at least 20 wide whose display lists
    // `ellipsis` draws exactly one, at `xm` and `ym`; its labels follow at `xm`, the `i`-th with its
    // baseline at `ym + 2 + 2 + (i − 1) × h(9) + a(9)`.
    for (const name of manifestNames()) {
      for (const { gap, following } of gapDrawings(drawn(name))) {
        if (gap.type !== "elision") continue;
        const xm = (gap.x1 + gap.x2) / 2;
        const ym = (gap.yt + gap.yb) / 2;
        const ellipses = following.filter((element) => element.type === "ellipsis");
        expect(ellipses.length).toBeLessThanOrEqual(1);
        for (const ellipsis of ellipses) {
          expect(ellipsis.type === "ellipsis" && [ellipsis.x, ellipsis.y]).toEqual([xm, ym]);
        }
        if (gap.x2 - gap.x1 < 20) expect(ellipses).toEqual([]);
        const labels = following.filter((element) => element.type === "label");
        expect(labels.map((label) => label.type === "label" && [label.x, label.baseline])).toEqual(
          labels.map((_, index) => [xm, ym + 4 + index * H9 + A9]),
        );
      }
    }
  });

  it("is none on a crossing row but the gap's middle", () => {
    const drawing = drawn("bundles/bundle_shared_parent");
    const gaps = drawing.elements.filter((element) => element.type === "elision");
    // Each of `score`'s two ancestor cards derives one gap cutting `score`'s line and its map
    // `cmap_1`; the gap keeps one ellipsis, at the middle of its card, and the name `Score` below.
    expect(
      gaps.map((gap) => (gap.type === "elision" ? crossingYs(drawing, gap.x1, gap.x2) : [])),
    ).toEqual([
      [127.234375 - 5.5, 127.234375],
      [353.421875 - 5.5, 353.421875],
    ]);
    expect(
      gaps.map((gap) =>
        drawing.elements.flatMap((element) =>
          gap.type === "elision" &&
          element.type === "ellipsis" &&
          element.x === (gap.x1 + gap.x2) / 2
            ? [element.y === (gap.yt + gap.yb) / 2]
            : [],
        ),
      ),
    ).toEqual([[true], [true]]);
    expect(labelTexts(drawing, derived("score"))).toEqual(["Score", "Score"]);
  });
});

describe("the frame's room", () => {
  it("puts what lies outside the member's span outside the frame", () => {
    const drawing = drawn("groups/group_elided_inside");
    const frame = drawing.boxes.find((box) => box.kind === "frame");
    if (frame === undefined) throw new Error("no frame");
    const gaps = of(drawing, "elision", derived("first"));
    // The gap ending at 8 ends at the frame's left edge, the one starting at 16 starts at its right.
    const [before, after] = gaps;
    expect(before?.type === "elision" && before.x2).toBe(frame.x);
    expect(after?.type === "elision" && after.x1).toBe(frame.x + frame.width);
    expect(drawing.elements.filter((element) => element.type === "elision")).toHaveLength(3);
    // `piece`'s run over `excerpt`'s span: from `x0` to `x0 + L'` of the frame.
    const run = drawing.axes.find(
      (axis) =>
        axis.address.id === "piece" && axis.ancestor !== undefined && String(axis.start) === "8",
    );
    expect([run?.xStart, run?.xEnd, String(run?.end)]).toEqual([
      frame.x + 103.70361328125,
      frame.x + 103.70361328125 + 400,
      "16",
    ]);
  });
});

describe("a member's start and end", () => {
  it("are marked on no ancestor line", () => {
    const drawing = drawn("groups/group_child_member");
    const parts = drawing.elements.flatMap((element) => element.address.part ?? []);
    expect(parts.filter((part) => part === "start" || part === "end")).toEqual([]);
  });
});

describe("a member reads its frame's gaps at their exact proportions", () => {
  it("on a fraction axis, over 14 to 18 of voice exactly", () => {
    const drawing = drawn("groups/group_elided_members");
    const runs = (id: string) =>
      drawing.axes
        .filter((axis) => axis.address.id === id && axis.ancestor === undefined)
        .map((axis) => [String(axis.start), String(axis.end)]);
    expect(runs("voice")).toEqual([
      ["0", "3"],
      ["12", "14"],
      ["18", "24"],
    ]);
    expect(runs("phrase")).toEqual([
      ["0", "2"],
      ["6", "8"],
    ]);
  });
});

describe("an ancestor card of length 0", () => {
  it("elides each derived piece whole at drawn width 0 (several_depths)", () => {
    const file = path.join(fixturesDir, "..", "warnings", "0.2.0", "several_depths.yaml");
    const { manifest: value } = loads(readFileSync(file, "utf8")) as { manifest: unknown };
    const manifest = loadManifest(dumps(value));
    if (isLoadError(manifest)) throw new Error(manifest.problems[0]?.message);
    const drawing = drawnManifest(manifest);
    const card = drawing.elisions.filter((exposure) => exposure.kind === "ancestor_card");
    expect(card.map((exposure) => [exposure.mode, exposure.proportion])).toEqual([["auto", 0]]);
    expect(
      card[0]?.gaps.map((gap) => [
        gap.origin,
        String(gap.start),
        String(gap.end),
        gap.natural,
        gap.drawn,
        gap.x2 - gap.x1,
      ]),
    ).toEqual([
      ["default", "0", "4", 0, 0, 0],
      ["default", "4", "32", 0, 0, 0],
    ]);
  });
});
