import { type ElementAddress, type Manifest, sameAddress } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Graphical } from "@timetoalign/timetoshare";
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
import { at, loadFile, metrics } from "./support.ts";

/** A fixture drawn at the default placement and view, under `extra` layers. */
function drawn(name: string, extra: readonly Graphical[] = []): Drawing {
  const manifest: Manifest = loadFile(name);
  return draw(
    manifest,
    DEFAULT_PLACEMENT,
    [DEFAULT_LAYER, ...extra, manifestLayer(manifest)],
    metrics,
  );
}

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
      ["ellipsis"],
    ]);
    expect(card.gaps.map(gapShape)).toEqual([
      [derived("first"), "default", "first", "0", "8", 400, 57.14285714285714],
      [derived("first"), "default", "first", "16", "32", 800, 114.28571428571428],
      [derived("second"), "default", "second", "1", "31", 1500, 128.57142857142856],
    ]);
  });

  it("draw an ellipsis on each row crossing a gap, no label, no rectangle", () => {
    expect(of(drawing, "ellipsis", { id: "first", part: ["elision", "ellipsis"] })).toHaveLength(4);
    expect(of(drawing, "ellipsis", { id: "second", part: ["elision", "ellipsis"] })).toHaveLength(
      2,
    );
    expect(labelTexts(drawing, derived("first"))).toEqual([]);
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

  it("leave the member card's ancestor rows at the heights of the card behind", () => {
    const from = cardAt(drawing, "piece");
    for (const id of ["piece", "first"]) {
      const behind = lineOf(drawing, id === "piece" ? "timeline" : "child", at(id), from);
      expect(lineOf(drawing, "ancestor", at(id)).y).toBe(behind.y);
    }
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

  it("give every member its elided coordinates, none on an unknown length", () => {
    const members = (gap: ExposedGap) =>
      gap.members.map(({ timeline, start, end }) => [timeline, String(start), String(end)]);
    expect(frame.gaps.map(members)).toEqual([
      [
        ["excerpt", "2", "8"],
        ["voice", "3", "12"],
        ["sketch", "null", "null"],
      ],
      [
        ["excerpt", "28/3", "12"],
        ["voice", "14", "18"],
        ["sketch", "null", "null"],
      ],
    ]);
  });

  it("draw their labels once and an ellipsis on every crossing row", () => {
    expect(labelTexts(drawing, at("elision_1"))).toEqual(["Development", "2–8 ♩"]);
    expect(labelTexts(drawing, at("elision_2"))).toEqual([]);
    const ys = (id: string) =>
      of(drawing, "ellipsis", { id, part: ["ellipsis"] }).map(
        (element) => element.type === "ellipsis" && element.y,
      );
    const y = (type: LineElement["type"], id: string) => lineOf(drawing, type, at(id)).y;
    const frameGaps = ys("elision_1").slice(-4);
    expect(frameGaps).toEqual([
      y("ancestor", "piece"),
      y("timeline", "excerpt"),
      y("timeline", "voice"),
      y("timeline", "sketch"),
    ]);
    expect(ys("elision_2").slice(-5)).toEqual([
      y("ancestor", "piece"),
      y("timeline", "excerpt"),
      y("timeline", "voice"),
      y("child", "phrase"),
      y("timeline", "sketch"),
    ]);
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
    const rows = of(drawing, "ellipsis", at("elision_4", "ellipsis")).map(
      (element) => element.type === "ellipsis" && element.y,
    );
    expect(fourth?.type === "elision" && fourth.continuations).toEqual(rows);
  });

  it("give score's line one axis per full run", () => {
    const runs = drawing.axes.filter(
      (axis) => axis.address.id === "score" && axis.ancestor !== undefined,
    );
    expect(runs.map((axis) => [String(axis.start), String(axis.end)])).toEqual([
      ["17.6", "32"],
      ["56", "64"],
    ]);
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

describe("a member's start and end", () => {
  it("are marked on no ancestor line", () => {
    const drawing = drawn("groups/group_child_member");
    const parts = drawing.elements.flatMap((element) => element.address.part ?? []);
    expect(parts.filter((part) => part === "start" || part === "end")).toEqual([]);
  });
});
