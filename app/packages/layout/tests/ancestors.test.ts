import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Graphical } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import { bandOrder, drawFixture, edit, element, loadFile, metrics, set } from "./support.ts";

const only = (select: object, set: object): Graphical[] => [{ statements: [{ select, set }] }];
const drawGroup = (name: string, extra: Graphical[] = [], placement?: Placement) =>
  drawFixture(`groups/${name}`, extra, placement);

/** Every drawing of an address, in descriptor order. */
const all = (drawing: Drawing, address: string): DrawnElement[] =>
  drawing.elements.filter((item) => item.address === address);
/** The card of `member` in the frame of `group_1`, the one group of these manifests. */
const card = (drawing: Drawing, member: string) =>
  element(drawing, `group_1/${member}/card`) as DrawnElement & { height: number };
const xOf = (drawing: Drawing, member: string) => (element(drawing, member) as { xs: number }).xs;

describe("group_child_member: one ancestor", () => {
  const drawing = drawGroup("group_child_member");

  it("runs the ancestor line on to the left and ends it with its own arrowhead", () => {
    expect(element(drawing, "piece")).toMatchObject({
      type: "ancestor",
      xs: 108.61962890625,
      xe: 520.61962890625,
      y: 67.78125,
      start: "chevrons",
      end: "arrowhead",
    });
    expect(element(drawing, "piece").style).toMatchObject({
      stroke: "#00CC00",
      fill: "#00CC00",
      "stroke-width": 3,
      "stroke-dasharray": "none",
      opacity: 0.35,
    });
    expect(xOf(drawing, "second-half")).toBe(120.61962890625);
    expect(element(drawing, "second-half")).toMatchObject({ y: 81.78125, end: "diamond" });
    expect(card(drawing, "second-half").height).toBe(83.953125);
  });

  it("marks the member's start and end above the ancestor line, faded", () => {
    const [startMark, startOwn] = all(drawing, "second-half/start");
    const [endMark, endOwn] = all(drawing, "second-half/end");
    expect(startMark).toMatchObject({
      type: "wedge",
      x: 120.61962890625,
      yt: 66.28125,
      yb: 53.28125,
    });
    expect(endMark).toMatchObject({
      type: "wedge",
      x: 520.61962890625,
      yt: 66.28125,
      yb: 53.28125,
    });
    expect(startOwn).toMatchObject({ x: 120.61962890625, yt: 83.28125, yb: 96.28125 });
    expect(endOwn).toMatchObject({ x: 520.61962890625, yt: 83.28125, yb: 96.28125 });
    expect([startMark, endMark, startOwn, endOwn].map((item) => item?.style.opacity)).toEqual([
      0.35, 0.35, 1, 1,
    ]);
  });

  it("labels the marks on the ancestor's axis in its unit", () => {
    const [start, own] = all(drawing, "second-half/start/label");
    const [end] = all(drawing, "second-half/end/label");
    expect(start).toMatchObject({
      x: 120.61962890625,
      baseline: 49.15869140625,
      anchor: "middle",
      text: "8 ♩",
      coordinate: { unit: "quarters", value: Rational.of(8n) },
    });
    expect(end).toMatchObject({
      x: 520.61962890625,
      baseline: 49.15869140625,
      text: "16 ♩",
      coordinate: { unit: "quarters", value: Rational.of(16n) },
    });
    expect(start?.style.opacity).toBe(0.35);
    expect(own).toMatchObject({ text: "0 ♩", baseline: 106.63525390625 });
    expect(own?.style.opacity).toBe(1);
  });

  it("names the ancestor in the name column, small and grey", () => {
    expect(element(drawing, "piece/name")).toMatchObject({
      type: "name",
      x: 24,
      baseline: 70.89697265625,
      text: "Piece",
    });
    expect(element(drawing, "piece/name").style).toMatchObject({
      fill: "#6B7280",
      "font-size": 9,
      opacity: 1,
    });
  });
});

describe("group_grandchild: every ancestor shown", () => {
  const drawing = drawGroup("group_grandchild");

  it("draws one row per ancestor, the parent nearest", () => {
    expect(element(drawing, "score")).toMatchObject({
      type: "ancestor",
      xs: 99.70361328125,
      xe: 523.70361328125,
      y: 67.78125,
      start: "chevrons",
      end: "chevrons",
    });
    expect(element(drawing, "movement")).toMatchObject({
      type: "ancestor",
      xs: 99.70361328125,
      xe: 511.70361328125,
      y: 101.7578125,
      start: "chevrons",
      end: "diamond",
    });
    expect(xOf(drawing, "theme")).toBe(111.70361328125);
    expect(element(drawing, "theme")).toMatchObject({ y: 115.7578125 });
    expect(card(drawing, "theme").height).toBe(117.9296875);
  });

  it("marks and labels the member on each ancestor's axis", () => {
    const marks = all(drawing, "theme/start").concat(all(drawing, "theme/end"));
    expect(marks.map((item) => [item.type, (item as { yt: number }).yt])).toEqual([
      ["wedge", 66.28125],
      ["wedge", 100.2578125],
      ["wedge", 117.2578125],
      ["wedge", 66.28125],
      ["wedge", 100.2578125],
      ["wedge", 117.2578125],
    ]);
    expect(marks.map((item) => (item as { yb: number }).yb)).toEqual([
      53.28125, 87.2578125, 130.2578125, 53.28125, 87.2578125, 130.2578125,
    ]);
    const labels = all(drawing, "theme/start/label").concat(all(drawing, "theme/end/label"));
    expect(
      labels.map((item) => [
        (item as { text: string }).text,
        (item as { baseline: number }).baseline,
      ]),
    ).toEqual([
      ["24 ♩", 49.15869140625],
      ["8 ♩", 83.13525390625],
      ["0 ♩", 140.61181640625],
      ["32 ♩", 49.15869140625],
      ["16 ♩", 83.13525390625],
      ["8 ♩", 140.61181640625],
    ]);
    expect(element(drawing, "score/name")).toMatchObject({
      baseline: 70.89697265625,
      text: "Score",
    });
    expect(element(drawing, "movement/name")).toMatchObject({
      baseline: 104.87353515625,
      text: "Movement",
    });
  });

  it("counts the outer chevron tip in the right edge", () => {
    expect(drawing.width).toBe(559.70361328125);
  });

  it("orders the ancestors' elements first within each group (section 8.5)", () => {
    const start = drawing.elements.findIndex((item) => item.address === "group_1/theme/card");
    const end = drawing.elements.findIndex((item) => item.address === "group_1/recording/card");
    expect(drawing.elements.slice(start + 1, end).map((item) => [item.type, item.address])).toEqual(
      [
        ["ancestor", "score"],
        ["ancestor", "movement"],
        ["timeline", "theme"],
        ["wedge", "theme/start"],
        ["wedge", "theme/end"],
        ["wedge", "theme/start"],
        ["wedge", "theme/end"],
        ["wedge", "theme/start"],
        ["wedge", "theme/end"],
        ["name", "score/name"],
        ["name", "movement/name"],
        ["name", "theme/name"],
        ["label", "theme/start/label"],
        ["label", "theme/end/label"],
        ["label", "theme/start/label"],
        ["label", "theme/end/label"],
        ["label", "theme/start/label"],
        ["label", "theme/end/label"],
      ],
    );
    const texts = drawing.elements
      .slice(start + 1, end)
      .filter((item) => item.type === "label")
      .map((item) => (item as { text: string }).text);
    expect(texts).toEqual(["24 ♩", "32 ♩", "8 ♩", "16 ♩", "0 ♩", "8 ♩"]);
  });
});

describe("group_parents_mixed: ancestors of three number types", () => {
  const drawing = drawGroup("group_parents_mixed");

  it("starts and ends each ancestor line as its offsets and length say", () => {
    expect(element(drawing, "sonata")).toMatchObject({
      xs: 101.0302734375,
      xe: 513.0302734375,
      y: 67.78125,
      start: "chevrons",
      end: "circle",
    });
    expect(element(drawing, "session")).toMatchObject({
      xs: 101.0302734375,
      xe: 525.0302734375,
      y: 159.734375,
      start: "chevrons",
      end: "chevrons",
    });
    // take's map stack precedes its ancestor band: session lies 10.5 + 7 above take.
    expect(element(drawing, "take")).toMatchObject({ y: 177.234375 });
    expect(element(drawing, "page")).toMatchObject({
      xs: 113.0302734375,
      xe: 525.0302734375,
      y: 255.1875,
      start: "circle",
      end: "chevrons",
    });
    expect(element(drawing, "page").style["stroke-dasharray"]).toBe("3 3");
    expect(xOf(drawing, "exposition")).toBe(113.0302734375);
  });

  it("labels the marks in each ancestor's number type", () => {
    const labels = (member: string) =>
      [`${member}/start/label`, `${member}/end/label`].map((address) => {
        const item = element(drawing, address) as { text: string; baseline: number };
        return [item.text, item.baseline];
      });
    expect(labels("exposition")).toEqual([
      ["16 ♩", 49.15869140625],
      ["48 ♩", 49.15869140625],
    ]);
    expect(labels("take")).toEqual([
      ["30.0 s", 141.11181640625],
      ["55.5 s", 141.11181640625],
    ]);
    expect(labels("system")).toEqual([
      ["0 px", 236.56494140625],
      ["600 px", 236.56494140625],
    ]);
    expect(
      ["sonata", "session", "page"].map(
        (id) => (element(drawing, `${id}/name`) as { baseline: number }).baseline,
      ),
    ).toEqual([70.89697265625, 162.85009765625, 258.30322265625]);
  });
});

describe("single changes to group_child_member", () => {
  const member = (drawing: Drawing) => ({
    x0: xOf(drawing, "second-half"),
    y: (element(drawing, "second-half") as { y: number }).y,
    ya: (element(drawing, "piece") as { y: number }).y,
    height: card(drawing, "second-half").height,
  });

  it("keeps the marks above whatever the member's band order", () => {
    const order = bandOrder(
      "second-half",
      ["children", "conversion_maps", "markers"],
      ["regions", "flow_control"],
    );
    const manifest = edit("groups/group_child_member", set("second-half", { order }));
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 105.7578125,
      ya: 67.78125,
      height: 87.35546875,
    });
    expect(all(drawing, "second-half/start")).toMatchObject([
      { yt: 66.28125, yb: 53.28125 },
      { yt: 104.2578125, yb: 91.2578125 },
    ]);
    expect(all(drawing, "second-half/start/label")[1]).toMatchObject({
      baseline: 87.13525390625,
    });
  });

  it("places the mark labels by first fit into tiers", () => {
    const drawing = drawGroup("group_child_member", [], { ...DEFAULT_PLACEMENT, length: 10 });
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 92.2578125,
      ya: 78.2578125,
      height: 104.90625,
    });
    expect(all(drawing, "second-half/start/label")[0]).toMatchObject({
      x: 120.61962890625,
      baseline: 59.63525390625,
    });
    expect(all(drawing, "second-half/end/label")[0]).toMatchObject({
      x: 130.61962890625,
      baseline: 49.15869140625,
    });
  });

  it("takes an ancestor row's pitch from its name's font size", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ element: "name", inside: "ancestor" }, { "font-size": 20 }),
    );
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 86.421875,
      ya: 67.78125,
      height: 88.59375,
    });
    expect(element(drawing, "piece/name")).toMatchObject({ baseline: 74.705078125 });
  });

  it("gives a row without marks the outer half q / 2", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ element: "wedge", inside: "ancestor" }, { display: "none" }),
    );
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 61.8046875,
      ya: 47.8046875,
      height: 63.9765625,
    });
    expect(all(drawing, "second-half/start")).toHaveLength(1);
    expect(all(drawing, "second-half/start/label")).toHaveLength(1);
    expect(all(drawing, "second-half/start")[0]?.style.opacity).toBe(1);
    expect(element(drawing, "piece/name")).toMatchObject({ baseline: 50.92041015625 });
  });

  it("moves x0 by eight stroke widths of a line running on to the left", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ element: "ancestor" }, { "stroke-width": 5 }),
    );
    expect(member(drawing)).toEqual({
      x0: 136.61962890625,
      y: 82.78125,
      ya: 68.78125,
      height: 84.953125,
    });
    expect(element(drawing, "piece")).toMatchObject({ xs: 116.61962890625 });
    expect(all(drawing, "second-half/start")[0]).toMatchObject({ yt: 66.28125, yb: 53.28125 });
    expect(all(drawing, "second-half/start/label")[0]).toMatchObject({
      baseline: 49.15869140625,
    });
  });

  it("lets marks without labels reach w / 2 + 13 alone", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ element: "label", inside: "ancestor" }, { display: "none" }),
    );
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 69.3046875,
      ya: 55.3046875,
      height: 71.4765625,
    });
    expect(all(drawing, "second-half/start")[0]).toMatchObject({
      yt: 53.8046875,
      yb: 40.8046875,
    });
    expect(all(drawing, "second-half/start/label")).toHaveLength(1);
    expect(all(drawing, "second-half/start/label")[0]?.style.opacity).toBe(1);
  });

  it("counts a mark label as a centred label for x0", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ element: "label", inside: "ancestor" }, { "font-size": 150 }),
    );
    expect(member(drawing)).toEqual({
      x0: 130.93359375,
      y: 245.9140625,
      ya: 231.9140625,
      height: 248.0859375,
    });
    expect(all(drawing, "second-half/start/label")[0]).toMatchObject({
      x: 130.93359375,
      baseline: 180.0380859375,
    });
  });

  it("gives a hidden ancestor no room", () => {
    const drawing = drawGroup("group_child_member", only({ ids: ["piece"] }, { display: "none" }));
    expect(drawing.elements.filter((item) => item.type === "ancestor")).toEqual([]);
    expect(all(drawing, "piece/name")).toEqual([]);
    expect(all(drawing, "second-half/start")).toHaveLength(1);
    expect(xOf(drawing, "second-half")).toBe(96.61962890625);
    expect((element(drawing, "second-half") as { y: number }).y).toBe(47.20703125);
    expect(card(drawing, "second-half").height).toBe(49.37890625);
  });

  it("keeps the ancestor band of a member whose line is hidden, and nothing else", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ ids: ["second-half"] }, { display: "none" }),
    );
    const range = drawing.boxes.find(
      (item) => item.kind === "card" && item.key === "group_1/second-half",
    )?.range;
    expect(
      drawing.elements.slice(range?.start, range?.end).map((item) => [item.type, item.address]),
    ).toEqual([
      ["card", "group_1/second-half/card"],
      ["ancestor", "piece"],
      ["wedge", "second-half/start"],
      ["wedge", "second-half/end"],
      ["name", "piece/name"],
      ["label", "second-half/start/label"],
      ["label", "second-half/end/label"],
    ]);
    expect(all(drawing, "second-half")).toEqual([]);
    expect(drawing.boxes.filter((box) => box.band?.timeline === "second-half")).toEqual([]);
    expect(card(drawing, "second-half")).toMatchObject({ y: 32.8046875, height: 63.37890625 });
    expect(element(drawing, "piece")).toMatchObject({
      type: "ancestor",
      xs: 99.70361328125,
      xe: 511.70361328125,
      y: 67.78125,
    });
  });

  it("keeps the ancestor band B beyond a wide member line's stroke", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ ids: ["second-half"] }, { "stroke-width": 16 }),
    );
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 86.78125,
      ya: 67.78125,
      height: 95.453125,
    });
  });
});

describe("the cascade on each drawing of an address", () => {
  const manifest = loadFile("groups/group_child_member");
  const styleOf = (drawing: Drawing, address: string) =>
    all(drawing, address).map((item) => item.style.fill);

  it("passes an ancestor line's style to its marks, their labels and its name", () => {
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      only({ ids: ["piece"] }, { fill: "#112233" }),
      metrics,
    );
    expect(styleOf(drawing, "second-half/start")).toEqual(["#112233", "none"]);
    expect(styleOf(drawing, "second-half/end/label")).toEqual(["#112233", "none"]);
    expect(styleOf(drawing, "piece/name")).toEqual(["#112233"]);
  });

  it("matches inside: ancestor on the marks and never on the member's own wedges", () => {
    const layers = (extra: Graphical[]) => [DEFAULT_LAYER, ...extra, manifestLayer(manifest)];
    const inside = draw(
      manifest,
      DEFAULT_PLACEMENT,
      layers(only({ element: "wedge", inside: "ancestor" }, { fill: "#123456" })),
      metrics,
    );
    expect(styleOf(inside, "second-half/start")).toEqual(["#123456", "#000000"]);
    const byId = draw(
      manifest,
      DEFAULT_PLACEMENT,
      layers(only({ ids: ["second-half/start"] }, { fill: "#654321" })),
      metrics,
    );
    expect(styleOf(byId, "second-half/start")).toEqual(["#654321", "#654321"]);
  });
});
