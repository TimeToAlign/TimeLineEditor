import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type ElementAddress,
  isLoadError,
  loadManifest,
  type Manifest,
  type PlaceKey,
  sameAddress,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  manifestLayer,
  type Placement,
  TextMeasure,
  timestampSegments,
} from "../src/index.ts";
import {
  at,
  bandOrder,
  baseOf,
  child,
  drawFixture,
  edit,
  element,
  HIDDEN_ANCESTOR_CARDS,
  loadFile,
  metrics,
  set,
  target,
  unturned,
} from "./support.ts";

const only = (select: object, set: object): Graphical[] => [{ rules: [{ select, set }] }];
/**
 * A group fixture drawn without its ancestor cards (section 8.8), the subject here being the
 * ancestor lines in the member's own card; `ancestor-cards.test.ts` draws the cards.
 */
const drawGroup = (name: string, extra: Graphical[] = [], placement?: Placement) =>
  drawFixture(`groups/${name}`, [HIDDEN_ANCESTOR_CARDS, ...extra], placement);

/** Every drawing of an address, in descriptor order. */
const all = (drawing: Drawing, address: ElementAddress): DrawnElement[] =>
  drawing.elements.filter((item) => sameAddress(item.address, address));
/** The card of `member`, in the frame of `group_1`, the one group of these manifests. */
const card = (drawing: Drawing, member: string) =>
  element(drawing, at(member, "card")) as DrawnElement & { height: number };
const xOf = (drawing: Drawing, member: string) =>
  (element(drawing, at(member)) as { xs: number }).xs;

/** The top and bottom of the card keyed `key` in `drawing`, as `{y1, y2}`. */
function cardSpan(drawing: Drawing, key: PlaceKey): { readonly y1: number; readonly y2: number } {
  const card = drawing.boxes.find(
    (box) => box.kind === "card" && box.key !== null && samePlaceKey(box.key, key),
  );
  if (card === undefined) throw new Error("no such card");
  return { y1: card.y, y2: card.y + card.height };
}

describe("group_child_member: one ancestor", () => {
  const drawing = drawGroup("group_child_member");

  it("runs the ancestor line on to the left and ends it with its own arrowhead", () => {
    expect(element(drawing, at("piece"))).toMatchObject({
      type: "ancestor",
      xs: 108.61962890625,
      xe: 520.61962890625,
      y: 85.18359375,
      start: "chevrons",
      end: "arrowhead",
    });
    expect(element(drawing, at("piece")).style).toMatchObject({
      stroke: "#00CC00",
      fill: "#00CC00",
      "stroke-width": 3,
      "stroke-dasharray": "none",
      opacity: 0.35,
    });
    expect(xOf(drawing, "second-half")).toBe(120.61962890625);
    expect(element(drawing, at("second-half"))).toMatchObject({
      y: 47.20703125,
      end: "diamond",
    });
    expect(card(drawing, "second-half").height).toBe(87.35546875);
  });

  it("marks the member's start and end below the ancestor line, away from the member, faded", () => {
    const [startMark] = all(drawing, at("second-half", "start"));
    const [endMark] = all(drawing, at("second-half", "end"));
    // The member's own start and end are its named timestamps `origin` and `length`.
    const startOwn = element(drawing, at("timestamp_3"));
    const endOwn = element(drawing, at("timestamp_4"));
    expect(startMark).toMatchObject({
      type: "wedge",
      x: 120.61962890625,
      yt: 86.68359375,
      corners: unturned(99.68359375),
    });
    expect(endMark).toMatchObject({
      type: "wedge",
      x: 520.61962890625,
      yt: 86.68359375,
      corners: unturned(99.68359375),
    });
    expect(startOwn).toMatchObject({
      x: 120.61962890625,
      yt: 48.70703125,
      corners: unturned(61.70703125),
    });
    expect(endOwn).toMatchObject({
      x: 520.61962890625,
      yt: 48.70703125,
      corners: unturned(61.70703125),
    });
    expect([startMark, endMark, startOwn, endOwn].map((item) => item?.style.opacity)).toEqual([
      0.35, 0.35, 1, 1,
    ]);
  });

  it("labels the marks on the ancestor's axis in its unit", () => {
    const [start] = all(drawing, at("second-half", "start", "label"));
    const own = element(drawing, at("timestamp_3", "coordinate"));
    const [end] = all(drawing, at("second-half", "end", "label"));
    expect(start).toMatchObject({
      x: 120.61962890625,
      baseline: 110.03759765625,
      anchor: "middle",
      text: "8 ♩",
      coordinate: { unit: "quarters", value: Rational.of(8n) },
    });
    expect(end).toMatchObject({
      x: 520.61962890625,
      baseline: 110.03759765625,
      text: "16 ♩",
      coordinate: { unit: "quarters", value: Rational.of(16n) },
    });
    expect(start?.style.opacity).toBe(0.35);
    expect(own).toMatchObject({ text: "0 ♩", baseline: 72.06103515625 });
    expect(own?.style.opacity).toBe(1);
  });

  it("names the ancestor in the name column, small and grey", () => {
    expect(element(drawing, at("piece", "name"))).toMatchObject({
      type: "name",
      x: 24,
      baseline: 88.29931640625,
      text: "Piece",
    });
    expect(element(drawing, at("piece", "name")).style).toMatchObject({
      fill: "#6B7280",
      "font-size": 9,
      opacity: 1,
    });
  });
});

describe("group_grandchild: every ancestor shown", () => {
  const drawing = drawGroup("group_grandchild");

  it("draws one row per ancestor, the parent nearest", () => {
    expect(element(drawing, at("score"))).toMatchObject({
      type: "ancestor",
      xs: 99.70361328125,
      xe: 523.70361328125,
      y: 119.16015625,
      start: "chevrons",
      end: "chevrons",
    });
    expect(element(drawing, at("movement"))).toMatchObject({
      type: "ancestor",
      xs: 99.70361328125,
      xe: 511.70361328125,
      y: 85.18359375,
      start: "chevrons",
      end: "diamond",
    });
    expect(xOf(drawing, "theme")).toBe(111.70361328125);
    expect(element(drawing, at("theme"))).toMatchObject({ y: 47.20703125 });
    expect(card(drawing, "theme").height).toBe(121.33203125);
  });

  it("marks and labels the member on each ancestor's axis", () => {
    const marks = all(drawing, at("theme", "start")).concat(all(drawing, at("theme", "end")));
    expect(marks.map((item) => [item.type, (item as { yt: number }).yt])).toEqual([
      ["wedge", 120.66015625],
      ["wedge", 86.68359375],
      ["wedge", 120.66015625],
      ["wedge", 86.68359375],
    ]);
    expect(marks.map(baseOf)).toEqual([133.66015625, 99.68359375, 133.66015625, 99.68359375]);
    // The member's own `origin` and `length`, below its line, nearer it than the ancestor band.
    expect(element(drawing, at("timestamp_3"))).toMatchObject({
      yt: 48.70703125,
      corners: unturned(61.70703125),
    });
    expect(element(drawing, at("timestamp_4"))).toMatchObject({
      yt: 48.70703125,
      corners: unturned(61.70703125),
    });
    expect(element(drawing, at("timestamp_3", "coordinate"))).toMatchObject({
      text: "0 ♩",
      baseline: 72.06103515625,
    });
    expect(element(drawing, at("timestamp_4", "coordinate"))).toMatchObject({
      text: "8 ♩",
      baseline: 72.06103515625,
    });
    const labels = all(drawing, at("theme", "start", "label")).concat(
      all(drawing, at("theme", "end", "label")),
    );
    expect(
      labels.map((item) => [
        (item as { text: string }).text,
        (item as { baseline: number }).baseline,
      ]),
    ).toEqual([
      ["24 ♩", 144.01416015625],
      ["8 ♩", 110.03759765625],
      ["32 ♩", 144.01416015625],
      ["16 ♩", 110.03759765625],
    ]);
    expect(element(drawing, at("score", "name"))).toMatchObject({
      baseline: 122.27587890625,
      text: "Score",
    });
    expect(element(drawing, at("movement", "name"))).toMatchObject({
      baseline: 88.29931640625,
      text: "Movement",
    });
  });

  it("counts the outer chevron tip in the right edge", () => {
    expect(drawing.width).toBe(559.70361328125);
  });

  it("orders the ancestors' elements first within each group (section 8.5)", () => {
    const start = drawing.elements.findIndex((item) =>
      sameAddress(item.address, at("theme", "card")),
    );
    const end = drawing.elements.findIndex((item) =>
      sameAddress(item.address, at("recording", "card")),
    );
    expect(drawing.elements.slice(start + 1, end).map((item) => [item.type, item.address])).toEqual(
      [
        ["ancestor", at("score")],
        ["ancestor", at("movement")],
        ["timeline", at("theme")],
        ["wedge", at("theme", "start")],
        ["wedge", at("theme", "end")],
        ["wedge", at("theme", "start")],
        ["wedge", at("theme", "end")],
        ["wedge", at("timestamp_3")],
        ["wedge", at("timestamp_4")],
        ["name", at("score", "name")],
        ["name", at("movement", "name")],
        ["name", at("theme", "name")],
        ["label", at("theme", "start", "label")],
        ["label", at("theme", "end", "label")],
        ["label", at("theme", "start", "label")],
        ["label", at("theme", "end", "label")],
        ["label", at("timestamp_3", "coordinate")],
        ["label", at("timestamp_4", "coordinate")],
      ],
    );
    const texts = drawing.elements
      .slice(start + 1, end)
      .filter((item) => item.type === "label")
      .map((item) => (item as { text: string }).text);
    expect(texts).toEqual(["24 ♩", "32 ♩", "8 ♩", "16 ♩", "0 ♩", "8 ♩"]);
  });
});

describe("group_grandchild_parent_on_top: an ancestor line on each side", () => {
  const drawing = drawGroup("group_grandchild_parent_on_top");
  const recordOf = (member: string) =>
    drawing.boxes.find(
      (item) =>
        item.kind === "card" &&
        item.key !== null &&
        samePlaceKey(item.key, { item: "group_1", member }),
    );

  it("lays movement above the member and score below, each by its own band order", () => {
    expect(element(drawing, at("movement"))).toMatchObject({
      type: "ancestor",
      xs: 99.70361328125,
      xe: 511.70361328125,
      y: 67.78125,
      start: "chevrons",
      end: "diamond",
    });
    expect(element(drawing, at("score"))).toMatchObject({
      type: "ancestor",
      xs: 99.70361328125,
      xe: 523.70361328125,
      y: 119.7578125,
      start: "chevrons",
      end: "chevrons",
    });
    expect(element(drawing, at("theme"))).toMatchObject({ y: 81.78125 });
    expect(recordOf("theme")).toMatchObject({ y: 32.8046875, height: 121.9296875 });
    // Its root's row, its markers band and the two ancestor bands.
    expect(recordOf("theme")?.contentCount).toBe(4);
  });

  it("marks and labels the member on each line on its side away from the member", () => {
    const marks = all(drawing, at("theme", "start")).concat(all(drawing, at("theme", "end")));
    expect(marks.map((item) => (item as { yt: number }).yt)).toEqual([
      121.2578125, 66.28125, 121.2578125, 66.28125,
    ]);
    expect(marks.map(baseOf)).toEqual([134.2578125, 53.28125, 134.2578125, 53.28125]);
    const labels = all(drawing, at("theme", "start", "label")).concat(
      all(drawing, at("theme", "end", "label")),
    );
    expect(
      labels.map((item) => [
        (item as { text: string }).text,
        (item as { baseline: number }).baseline,
      ]),
    ).toEqual([
      ["24 ♩", 144.61181640625],
      ["8 ♩", 49.15869140625],
      ["32 ♩", 144.61181640625],
      ["16 ♩", 49.15869140625],
    ]);
    expect(element(drawing, at("timestamp_3"))).toMatchObject({
      yt: 83.28125,
      corners: unturned(96.28125),
    });
    expect(element(drawing, at("timestamp_3", "coordinate"))).toMatchObject({
      baseline: 106.63525390625,
    });
    expect(
      ["score", "movement"].map(
        (id) => (element(drawing, at(id, "name")) as { baseline: number }).baseline,
      ),
    ).toEqual([122.87353515625, 70.89697265625]);
  });

  it("crosses the ancestor lines on both sides with the member's cross-section lines", () => {
    const theme = drawing.axes.find((axis) => axis.address.id === "theme" && axis.marker !== null);
    if (theme === undefined) throw new Error("no line of theme");
    const card = cardSpan(drawing, theme.card);
    expect(theme.marker?.crossSection.span).toEqual(card);
    const manifest = edit("groups/group_grandchild_parent_on_top", {
      type: "add",
      into: target("theme"),
      timestamp: { name: "Here", coordinate: [2, 1], display: ["cross_section"] },
    });
    const edited = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, HIDDEN_ANCESTOR_CARDS, manifestLayer(manifest)],
      metrics,
    );
    const crossing = element(edited, at("timestamp_5", "line")) as DrawnElement & {
      x: number;
      y1: number;
      y2: number;
    };
    expect([crossing.x, crossing.y1, crossing.y2]).toEqual([
      111.70361328125 + 100,
      card.y1,
      card.y2,
    ]);
  });
});

describe("group_parents_mixed: ancestors of three number types", () => {
  const drawing = drawGroup("group_parents_mixed");

  it("starts and ends each ancestor line as its offsets and length say", () => {
    expect(element(drawing, at("sonata"))).toMatchObject({
      xs: 101.0302734375,
      xe: 513.0302734375,
      y: 85.18359375,
      start: "chevrons",
      end: "circle",
    });
    expect(element(drawing, at("session"))).toMatchObject({
      xs: 101.0302734375,
      xe: 525.0302734375,
      y: 180.63671875,
      start: "chevrons",
      end: "chevrons",
    });
    // take's map stack lies above its line, its markers band below, before its ancestor band:
    // session lies 30.9765625 + 7 below take.
    expect(element(drawing, at("take"))).toMatchObject({ y: 142.66015625 });
    expect(element(drawing, at("page"))).toMatchObject({
      xs: 113.0302734375,
      xe: 525.0302734375,
      y: 275.9921875,
      start: "circle",
      end: "chevrons",
    });
    expect(element(drawing, at("page")).style["stroke-dasharray"]).toBe("3 3");
    expect(xOf(drawing, "exposition")).toBe(113.0302734375);
  });

  it("labels the marks in each ancestor's number type", () => {
    const labels = (member: string) =>
      [at(member, "start", "label"), at(member, "end", "label")].map((address) => {
        const item = element(drawing, address) as { text: string; baseline: number };
        return [item.text, item.baseline];
      });
    expect(labels("exposition")).toEqual([
      ["16 ♩", 110.03759765625],
      ["48 ♩", 110.03759765625],
    ]);
    expect(labels("take")).toEqual([
      ["30″", 205.49072265625],
      ["55.5″", 205.49072265625],
    ]);
    expect(labels("system")).toEqual([
      ["0 px", 300.84619140625],
      ["600 px", 300.84619140625],
    ]);
    expect(
      ["sonata", "session", "page"].map(
        (id) => (element(drawing, at(id, "name")) as { baseline: number }).baseline,
      ),
    ).toEqual([88.29931640625, 183.75244140625, 279.10791015625]);
  });
});

describe("single changes to group_child_member", () => {
  const member = (drawing: Drawing) => ({
    x0: xOf(drawing, "second-half"),
    y: (element(drawing, at("second-half")) as { y: number }).y,
    ya: (element(drawing, at("piece")) as { y: number }).y,
    height: card(drawing, "second-half").height,
  });

  it("keeps the ancestor line on the side its own band order gives, whatever the member's", () => {
    const order = bandOrder(
      ["children", "conversion_maps", "markers"],
      ["regions", "flow_control"],
    );
    const manifest = edit("groups/group_child_member", set("second-half", { order }));
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, HIDDEN_ANCESTOR_CARDS, manifestLayer(manifest)],
      metrics,
    );
    // The member's markers band lies above its line; `piece`'s own order keeps it below.
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 67.78125,
      ya: 81.78125,
      height: 83.953125,
    });
    expect(all(drawing, at("second-half", "start"))).toMatchObject([
      { yt: 83.28125, corners: unturned(96.28125) },
    ]);
    expect(element(drawing, at("timestamp_3"))).toMatchObject({
      yt: 66.28125,
      corners: unturned(53.28125),
    });
    expect(element(drawing, at("timestamp_3", "coordinate"))).toMatchObject({
      baseline: 49.15869140625,
    });
  });

  it("places the mark labels by first fit into tiers", () => {
    const drawing = drawGroup("group_child_member", [], { ...DEFAULT_PLACEMENT, length: 10 });
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 47.20703125,
      ya: 95.66015625,
      height: 108.30859375,
    });
    expect(all(drawing, at("second-half", "start", "label"))[0]).toMatchObject({
      x: 120.61962890625,
      baseline: 120.51416015625,
    });
    expect(all(drawing, at("second-half", "end", "label"))[0]).toMatchObject({
      x: 130.61962890625,
      baseline: 130.99072265625,
    });
  });

  it("takes an ancestor row's pitch from its name's font size", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ element: "name", inside: "ancestor" }, { "font-size": 20 }),
    );
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 47.20703125,
      ya: 89.82421875,
      height: 91.99609375,
    });
    expect(element(drawing, at("piece", "name"))).toMatchObject({ baseline: 96.748046875 });
  });

  it("gives a row without marks the outer half q / 2", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ element: "wedge", inside: "ancestor" }, { display: "none" }),
    );
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 47.20703125,
      ya: 85.18359375,
      height: 67.37890625,
    });
    expect(all(drawing, at("second-half", "start"))).toEqual([]);
    expect(all(drawing, at("second-half", "start", "label"))).toEqual([]);
    expect(element(drawing, at("timestamp_3")).style.opacity).toBe(1);
    expect(element(drawing, at("piece", "name"))).toMatchObject({ baseline: 88.29931640625 });
  });

  it("moves x0 by eight stroke widths of a line running on to the left", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ element: "ancestor" }, { "stroke-width": 5 }),
    );
    expect(member(drawing)).toEqual({
      x0: 136.61962890625,
      y: 47.20703125,
      ya: 85.18359375,
      height: 88.35546875,
    });
    expect(element(drawing, at("piece"))).toMatchObject({ xs: 116.61962890625 });
    expect(all(drawing, at("second-half", "start"))[0]).toMatchObject({
      yt: 87.68359375,
      corners: unturned(100.68359375),
    });
    expect(all(drawing, at("second-half", "start", "label"))[0]).toMatchObject({
      baseline: 111.03759765625,
    });
  });

  it("lets marks without labels reach w / 2 + 13 alone", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ element: "label", inside: "ancestor" }, { display: "none" }),
    );
    expect(member(drawing)).toEqual({
      x0: 120.61962890625,
      y: 47.20703125,
      ya: 85.18359375,
      height: 74.87890625,
    });
    expect(all(drawing, at("second-half", "start"))[0]).toMatchObject({
      yt: 86.68359375,
      corners: unturned(99.68359375),
    });
    expect(all(drawing, at("second-half", "start", "label"))).toEqual([]);
    expect(element(drawing, at("timestamp_3", "coordinate")).style.opacity).toBe(1);
  });

  it("counts a mark label as a centred label for x0", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ element: "label", inside: "ancestor" }, { "font-size": 150 }),
    );
    expect(member(drawing)).toEqual({
      x0: 130.93359375,
      y: 47.20703125,
      ya: 85.18359375,
      height: 251.48828125,
    });
    expect(all(drawing, at("second-half", "start", "label"))[0]).toMatchObject({
      x: 130.93359375,
      baseline: 240.9169921875,
    });
  });

  it("gives a hidden ancestor no room", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ addresses: [at("piece")] }, { display: "none" }),
    );
    expect(drawing.elements.filter((item) => item.type === "ancestor")).toEqual([]);
    expect(all(drawing, at("piece", "name"))).toEqual([]);
    expect(all(drawing, at("second-half", "start"))).toEqual([]);
    expect(all(drawing, at("timestamp_3"))).toHaveLength(1);
    expect(xOf(drawing, "second-half")).toBe(96.61962890625);
    expect((element(drawing, at("second-half")) as { y: number }).y).toBe(47.20703125);
    expect(card(drawing, "second-half").height).toBe(49.37890625);
  });

  it("keeps the ancestor band of a member whose line is hidden, and nothing else", () => {
    const drawing = drawGroup(
      "group_child_member",
      only({ addresses: [at("second-half")] }, { display: "none" }),
    );
    const range = drawing.boxes.find(
      (item) =>
        item.kind === "card" &&
        item.key !== null &&
        samePlaceKey(item.key, { item: "group_1", member: "second-half" }),
    )?.range;
    expect(
      drawing.elements.slice(range?.start, range?.end).map((item) => [item.type, item.address]),
    ).toEqual([
      ["card", at("second-half", "card")],
      ["ancestor", at("piece")],
      ["wedge", at("second-half", "start")],
      ["wedge", at("second-half", "end")],
      ["name", at("piece", "name")],
      ["label", at("second-half", "start", "label")],
      ["label", at("second-half", "end", "label")],
    ]);
    expect(all(drawing, at("second-half"))).toEqual([]);
    expect(drawing.boxes.filter((box) => box.band?.timeline === "second-half")).toEqual([]);
    expect(card(drawing, "second-half")).toMatchObject({ y: 32.8046875, height: 63.37890625 });
    expect(element(drawing, at("piece"))).toMatchObject({
      type: "ancestor",
      xs: 99.70361328125,
      xe: 511.70361328125,
      y: 61.20703125,
    });
  });

  it("keeps the ancestor band B beyond a wide member line's stroke", () => {
    // `piece` lays its children below its line, so its line lies above the member's, whose
    // markers band (following `piece`'s order) stays below: nothing but the stroke lies between.
    const order = bandOrder(
      [],
      ["children", "conversion_maps", "markers", "regions", "flow_control"],
    );
    const manifest = edit("groups/group_child_member", set("piece", { order }));
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [
        DEFAULT_LAYER,
        HIDDEN_ANCESTOR_CARDS,
        ...only({ addresses: [at("second-half")] }, { "stroke-width": 16 }),
        manifestLayer(manifest),
      ],
      metrics,
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
  const styleOf = (drawing: Drawing, address: ElementAddress) =>
    all(drawing, address).map((item) => item.style.fill);

  it("passes an ancestor line's style to its marks, their labels and its name", () => {
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [
        ...only({ addresses: [at("piece")] }, { fill: "#112233" }),
        // Without the default layer the secondary coordinates are shown too (section 2).
        { rules: [{ select: { coordinates: "secondary" }, set: { display: "none" } }] },
      ],
      metrics,
    );
    expect(styleOf(drawing, at("second-half", "start"))).toEqual(["#112233"]);
    expect(styleOf(drawing, at("second-half", "end", "label"))).toEqual(["#112233"]);
    // Without the default layer `piece`'s ancestor card is drawn: `timestamp_3` lies there first,
    // on the row of `second-half` inside `piece`'s own line, then on the member's line.
    expect(styleOf(drawing, at("timestamp_3"))).toEqual(["#112233", "none"]);
    expect(styleOf(drawing, at("piece", "name"))).toEqual(["#112233", "#112233"]);
  });

  it("matches inside: ancestor on the marks and never on the member's own wedges", () => {
    const layers = (extra: Graphical[]) => [
      DEFAULT_LAYER,
      HIDDEN_ANCESTOR_CARDS,
      ...extra,
      manifestLayer(manifest),
    ];
    const inside = draw(
      manifest,
      DEFAULT_PLACEMENT,
      layers(only({ element: "wedge", inside: "ancestor" }, { fill: "#123456" })),
      metrics,
    );
    expect(styleOf(inside, at("second-half", "start"))).toEqual(["#123456"]);
    expect(styleOf(inside, at("timestamp_3"))).toEqual(["#000000"]);
    const byId = draw(
      manifest,
      DEFAULT_PLACEMENT,
      layers(only({ addresses: [at("second-half", "start")] }, { fill: "#654321" })),
      metrics,
    );
    expect(styleOf(byId, at("second-half", "start"))).toEqual(["#654321"]);
    expect(styleOf(byId, at("timestamp_3"))).toEqual(["#000000"]);
  });
});

describe("a member's cross-section lines cross its whole card", () => {
  const here = {
    type: "add",
    into: target("middle"),
    timestamp: { name: "Here", coordinate: [2, 1], display: ["cross_section"] },
  };
  const drawEdited = (manifest: Manifest, extra: Graphical[] = []) =>
    draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, HIDDEN_ANCESTOR_CARDS, ...extra, manifestLayer(manifest)],
      metrics,
    );
  const yOf = (drawing: Drawing, id: string) => (element(drawing, at(id)) as { y: number }).y;
  /** The pieces of the cross-section line of the timestamp `id`, as `[x, y1, y2]`. */
  const piecesOf = (drawing: Drawing, id: string) =>
    all(drawing, at(id, "line")).flatMap((item) =>
      item.type === "cross_section" ? [[item.x, item.y1, item.y2]] : [],
    );
  /** Whether every drawn line's marker spans the card that draws it, top to bottom. */
  const spansCards = (drawing: Drawing) =>
    drawing.axes
      .filter((axis) => axis.marker !== null)
      .every((axis) => {
        const card = cardSpan(drawing, axis.card);
        const span = axis.marker?.crossSection.span;
        return span?.y1 === card.y1 && span?.y2 === card.y2;
      });

  it("runs across the member's card, its ancestor line below the member included", () => {
    const drawing = drawEdited(edit("groups/group_parent_both", here));
    expect([yOf(drawing, "middle"), yOf(drawing, "piece")]).toEqual([47.20703125, 85.18359375]);
    const { y1, y2 } = cardSpan(drawing, { item: "group_1", member: "middle" });
    expect(piecesOf(drawing, "timestamp_5")).toEqual([[xOf(drawing, "middle") + 100, y1, y2]]);
    expect(spansCards(drawing)).toBe(true);
  });

  it("runs across the member's card from a descendant of the member", () => {
    const manifest = edit("groups/group_parent_both", here, child("middle", "inner", 1, 2), {
      type: "add",
      into: target("inner"),
      timestamp: { name: "In", coordinate: [1, 1], display: ["cross_section"] },
    });
    const drawing = drawEdited(manifest);
    const { y1, y2 } = cardSpan(drawing, { item: "group_1", member: "middle" });
    expect(piecesOf(drawing, "timestamp_6")).toEqual([[xOf(drawing, "middle") + 100, y1, y2]]);
    expect(spansCards(drawing)).toBe(true);
  });

  it("runs across the member's card where its ancestor line is not displayed", () => {
    const drawing = drawEdited(edit("groups/group_parent_both", here), [
      { rules: [{ select: { addresses: [at("piece")] }, set: { display: "none" } }] },
    ]);
    expect(all(drawing, at("piece"))).toEqual([]);
    const { y1, y2 } = cardSpan(drawing, { item: "group_1", member: "middle" });
    expect(piecesOf(drawing, "timestamp_5")).toEqual([[xOf(drawing, "middle") + 100, y1, y2]]);
  });

  it("spans every card of a recorded session", () => {
    const text = readFileSync(
      path.join(import.meta.dirname, "data", "clair-de-lune-session.yaml"),
      "utf8",
    );
    const manifest = loadManifest(text);
    if (isLoadError(manifest)) throw new Error(manifest.problems[0]?.message);
    expect(spansCards(drawEdited(manifest))).toBe(true);
  });
});

describe("named timestamps of an ancestor, on its line in the member's card", () => {
  // `piece` (16 quarters) holds `second-half` at 8 for 8: the window on `piece`'s axis is 8 to 16,
  // its ends included. Four timestamps of `piece`, minted in this order: `timestamp_5` at 4
  // (outside), `timestamp_6` at 8 (the start: wedge and name), `timestamp_7` at 12 (wedge, name,
  // line), `timestamp_8` at 16 (the end: wedge alone).
  const stamp = (name: string, coordinate: number, display: readonly string[]) => ({
    type: "add",
    into: target("piece"),
    timestamp: { name, coordinate: [coordinate, 1], display },
  });
  const manifest = edit(
    "groups/group_child_member",
    stamp("Before", 4, ["wedge", "name", "cross_section"]),
    stamp("B", 8, ["wedge", "name"]),
    stamp("C", 12, ["wedge", "name", "cross_section"]),
    stamp("D", 16, ["wedge"]),
  );
  const layers = (extra: Graphical[]) => [DEFAULT_LAYER, ...extra, manifestLayer(manifest)];
  const drawing = draw(manifest, DEFAULT_PLACEMENT, layers([HIDDEN_ANCESTOR_CARDS]), metrics);
  const measure = new TextMeasure(metrics);
  const h = measure.lineHeight(9);
  const a = measure.ascent(9);
  // The member's line at 47.20703125, `piece`'s line one ancestor row below at 85.18359375, the
  // member drawn from x0 = 120.61962890625 to x0 + 400 (the fixture's quantities above).
  const x0 = 120.61962890625;
  const ya = 85.18359375;

  it("draws those whose position lies within the member's span, its ends included", () => {
    expect(all(drawing, at("timestamp_5"))).toEqual([]);
    expect(all(drawing, at("timestamp_5", "line"))).toEqual([]);
    expect(
      ["timestamp_6", "timestamp_7", "timestamp_8"].map((id) => {
        const wedge = element(drawing, at(id));
        return wedge.type === "wedge" ? [wedge.x, wedge.yt, baseOf(wedge)] : [];
      }),
    ).toEqual([
      [x0, ya + 1.5, ya + 14.5],
      [x0 + 200, ya + 1.5, ya + 14.5],
      [x0 + 400, ya + 1.5, ya + 14.5],
    ]);
  });

  it("stacks their labels after the marks' in one first fit, tiers counted in lines", () => {
    // The start mark's label `8 ♩` takes tier 1 at x0, the end mark's at x0 + 400; `B` at x0
    // meets the first and goes to tier 2, `C` at x0 + 200 stays in tier 1.
    expect(
      ["timestamp_6", "timestamp_7"].map((id) => {
        const label = element(drawing, at(id, "name"));
        return label.type === "label" ? [label.text, label.x, label.baseline] : [];
      }),
    ).toEqual([
      ["B", x0, ya + (1.5 + 13 + 2 + h) + a],
      ["C", x0 + 200, ya + (1.5 + 13 + 2) + a],
    ]);
    // Two lines of labels on the row's outer side: the card grows by one h(9) (87.35546875
    // with one line, as `group_child_member` draws it).
    expect(card(drawing, "second-half").height).toBe(87.35546875 + h);
  });

  it("draws the line, the primary wedge and the labels at full opacity, the marks faded", () => {
    const opacities = [
      at("timestamp_6"),
      at("timestamp_6", "name"),
      at("timestamp_7"),
      at("timestamp_7", "name"),
      at("timestamp_7", "line"),
      at("timestamp_8"),
      at("second-half", "start"),
      at("second-half", "start", "label"),
    ].map((address) => element(drawing, address).style.opacity);
    expect(opacities).toEqual([1, 1, 1, 1, 1, 1, 0.35, 0.35]);
  });

  it("runs the line across the member's card, its gap measured out from the ancestor line", () => {
    // `C` draws its wedge (tip 1.5 below `piece`'s line) and its name in tier 1, which ends
    // `1.5 + 13 + 2 + h(9)` below it.
    const { y1, y2 } = cardSpan(drawing, { item: "group_1", member: "second-half" });
    expect(
      all(drawing, at("timestamp_7", "line")).map((item) =>
        item.type === "cross_section" ? [item.x, item.y1, item.y2] : [],
      ),
    ).toEqual([
      [x0 + 200, y1, ya + 1.5],
      [x0 + 200, ya + (1.5 + 13 + 2 + h), y2],
    ]);
  });

  it("gives the anchors a segment in the member's card, never in the ancestor card", () => {
    const shown = draw(manifest, DEFAULT_PLACEMENT, layers([]), metrics);
    const { y1, y2 } = cardSpan(shown, { item: "group_1", member: "second-half" });
    // The ancestor card of `piece` draws `C` as `piece`'s own timestamp, its line across that
    // card in two pieces too; its segment is the member card's alone (sections 8.7, 8.8). The
    // ancestor card is aligned to the member, so its row `second-half` starts at the member's x0.
    expect(all(shown, at("timestamp_7", "line")).length).toBe(4);
    expect(timestampSegments(shown.axes, "timestamp_7")).toEqual([
      { x: xOf(shown, "second-half") + 200, y1, y2 },
    ]);
  });
});
