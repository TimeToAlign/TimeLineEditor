/**
 * Switched cards and switched frames (`docs/drawing.md` in TimeToShare,
 * section 8.10): the cascade setting no `flow`, a card drawn on its FlowMap's virtual
 * axis with its tree unfolded, and a frame carried onto one member's
 * FlowMap. The strategy and every expected value are in `README.md`,
 * "Switched cards".
 */

import type { ElementAddress, Manifest } from "@timetoalign/tilie-core";
import { BLOCK_KEY, elementKey } from "@timetoalign/tilie-core/drawing";
import type { Address, Graphical, Rule } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { Cascade } from "../src/cascade.ts";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  lineAxes,
  manifestLayer,
} from "../src/index.ts";
import {
  ARCS_ALONE,
  boxesOf,
  childMemberTwice,
  edit,
  element,
  HIDDEN_ANCESTOR_CARDS,
  linearMap,
  load,
  loadFile,
  metrics,
  quarters,
} from "./support.ts";

const L = 400;
/** `x(t) − x0` on the virtual axis of `default`, `Λ` = 4241/2. */
const lx = (t: number, lambda = 4241 / 2) => L * (t / lambda);
/** The card address of `id`. */
const card = (id: string): Address => ({ id, part: ["card"] });
/** The manifest's rule switching the cards of `id` to `flow`. */
const switching = (id: string, flow: string): Rule => ({
  select: { addresses: [card(id)] },
  set: { flow },
});
/** Every region drawn, its atomic sections included. */
const REGIONS_SHOWN: Graphical = {
  rules: [{ select: { element: "region" }, set: { display: "inline" } }],
};

/** `manifest` drawn at the default placement with the defaults, `extra` and its own layer. */
function drawn(manifest: Manifest, extra: readonly Graphical[] = []): Drawing {
  return draw(
    manifest,
    DEFAULT_PLACEMENT,
    [DEFAULT_LAYER, ...extra, manifestLayer(manifest)],
    metrics,
  );
}

/** `manifest` with the rules of its own layer replaced by `rules`. */
function withRules(manifest: Manifest, rules: readonly Rule[]): Manifest {
  return { ...manifest, graphical: { ...manifest.graphical, rules: [...rules] } };
}

/** The line elements at `{id}`, each its type, x, ends and marks. */
function linesOf(drawing: Drawing, id: string) {
  return drawing.elements.flatMap((item) =>
    (item.type === "timeline" || item.type === "child") && item.address.id === id
      ? [{ type: item.type, xs: item.xs, xe: item.xe, start: item.start, end: item.end }]
      : [],
  );
}

/** The chunk elements of the line of `id`: type, part and their x or text. */
function chunksOf(drawing: Drawing, id: string) {
  const at = (item: DrawnElement) => {
    switch (item.type) {
      case "region":
        return [item.x1, item.x2];
      case "label":
        return [item.text];
      case "boundary":
        return [item.x, item.y1, item.y2];
      default:
        return [item.type];
    }
  };
  return drawing.elements
    .filter((item) => item.address.id === id && item.address.facet === "regions")
    .map((item) => [item.type, item.address.part, ...at(item)]);
}

/** The IDs of the flow control of `flow/switched_card`. */
const FLOW_CONTROL = ["volta_jump", "repeat_end", "second_ending", "volta_break"];

/** One drawing of a flow-control element: its type, its address and its x. */
type FlowDrawing = readonly [DrawnElement["type"], ElementAddress, ...number[]];

/** Every drawing of `ids`: its type, address and x (a fork's branch point, a jump's ends). */
function flowOf(drawing: Drawing, ids: readonly string[]): FlowDrawing[] {
  return drawing.elements.flatMap((item): FlowDrawing[] => {
    if (!ids.includes(item.address.id ?? "")) return [];
    switch (item.type) {
      case "fork":
        return [[item.type, item.address, item.point[0]]];
      case "jump":
        return [[item.type, item.address, item.start[0], item.tip[0]]];
      case "symbol":
      case "break":
      case "section_break":
      case "barline":
        return [[item.type, item.address, item.x]];
      default:
        return [[item.type, item.address]];
    }
  });
}

/** The text of the element at `address`. */
function textAt(drawing: Drawing, address: ElementAddress): string {
  const item = element(drawing, address);
  return item.type === "name" || item.type === "label" ? item.text : item.type;
}

/** The x of every wedge of the named timestamp `id`, and the texts of its coordinate labels. */
function stampsOf(drawing: Drawing, id: string) {
  return {
    wedges: drawing.elements.flatMap((item) =>
      item.type === "wedge" && item.address.id === id && item.address.part === undefined
        ? [item.x]
        : [],
    ),
    labels: drawing.elements.flatMap((item) =>
      item.type === "label" && item.address.id === id && item.address.part?.[0] === "coordinate"
        ? [item.text]
        : [],
    ),
  };
}

/** `groups/switched_frame` or `groups/virtual_member` with the region `take` and FlowMap `twice` of `recording`, `recording`'s card switched to it. */
function recordingTwice(name: "groups/switched_frame" | "groups/virtual_member"): Manifest {
  const source = loadFile(name);
  const timelines = source.timelines.map((timeline) =>
    timeline.id === "recording"
      ? { ...timeline, regions: [{ id: "take", name: "Take", start: 0.0, end: 702.5 }] }
      : timeline,
  );
  const twice = {
    id: "twice",
    timeline: "recording",
    chunks: ["take", "take"],
    provenance: [{ method: "manual" as const }],
  };
  const rules = [...(source.graphical?.rules ?? []), switching("recording", "twice")];
  return withRules(
    { ...source, timelines, flow_maps: [...(source.flow_maps ?? []), twice] } as Manifest,
    rules,
  );
}

describe("the cascade's flow", () => {
  const manifest = loadFile("flow/switched_card");
  const [allegro] = manifest.timelines;
  if (allegro === undefined) throw new Error("allegro");
  const ancestry = new Map([["allegro", ["allegro"]]]);
  const cardKey = elementKey("card", card("allegro"), allegro, BLOCK_KEY);

  it("is no style: the switch is core's reading of the manifest's own layer", () => {
    const style = new Cascade([{ rules: [switching("allegro", "default")] }], ancestry).resolve(
      cardKey,
      undefined,
    );
    expect(Object.hasOwn(style, "flow")).toBe(false);
  });
});

describe("a switched card", () => {
  it("draws its timeline on the virtual axis with the chunks of its FlowMap", () => {
    const drawing = drawn(loadFile("flow/switched_card"));
    const [line] = linesOf(drawing, "allegro");
    if (line === undefined) throw new Error("allegro's line");
    const x = (t: number) => line.xs + lx(t);
    expect(linesOf(drawing, "allegro")).toEqual([
      { type: "timeline", xs: x(0), xe: x(4241 / 2), start: "circle", end: "circle" },
    ]);
    const lineElement = element(drawing, { id: "allegro" });
    const y = lineElement.type === "timeline" ? lineElement.y : 0;
    const starts = [0, 953 / 2, 500, 1953 / 2, 4241 / 2];
    expect(chunksOf(drawing, "allegro")).toEqual([
      ...[0, 1, 2, 3].map((k) => ["region", [k], x(starts[k] ?? 0), x(starts[k + 1] ?? 0)]),
      ...[1, 2, 3].map((k) => ["boundary", [k, "start"], x(starts[k] ?? 0), y - 8, y + 8]),
      ...["A", "B", "A", "C"].map((text, k) => ["label", [k, "label"], text]),
    ]);
    expect(textAt(drawing, { id: "allegro", part: ["name"] })).toBe("Allegro · default");
  });

  it("is drawn as written where another layer sets flow", () => {
    const manifest = withRules(loadFile("flow/switched_card"), []);
    const drawing = drawn(manifest, [{ rules: [switching("allegro", "default")] }]);
    const [line] = linesOf(drawing, "allegro");
    if (line === undefined) throw new Error("allegro's line");
    expect(line.xe).toBe(line.xs + L);
    expect(chunksOf(drawing, "allegro").filter(([type]) => type !== "label")).toEqual([]);
    expect(textAt(drawing, { id: "allegro", part: ["name"] })).toBe("Allegro");
    expect(drawing.elements.some((item) => item.address.id === "volta_jump")).toBe(true);
  });

  it("is switched by a virtual timeline applying a FlowMap of its timeline", () => {
    const manifest = withRules(loadFile("flow/switched_card"), [
      switching("allegro", "allegro_single"),
    ]);
    const drawing = drawn(manifest);
    const [line] = linesOf(drawing, "allegro");
    if (line === undefined) throw new Error("allegro's line");
    const x = (t: number) => line.xs + lx(t, 3241 / 2);
    expect(chunksOf(drawing, "allegro").filter(([type]) => type === "region")).toEqual([
      ["region", [0], x(0), x(953 / 2)],
      ["region", [1], x(953 / 2), x(3241 / 2)],
    ]);
    expect(textAt(drawing, { id: "allegro", part: ["name"] })).toBe("Allegro · Allegro, single");
  });

  it("draws a run once on the card of an ungrouped root", () => {
    const drawing = drawn(
      withRules(loadFile("flow/switched_card"), [switching("allegro", "by_hand")]),
    );
    const [line] = linesOf(drawing, "allegro");
    if (line === undefined) throw new Error("allegro's line");
    const u = (t: number) => lx(t, 3054);
    expect(line.xe).toBe(line.xs + (u(953 / 2) + (L - u(1906))));
    expect(chunksOf(drawing, "allegro").filter(([type]) => type !== "boundary")).toEqual([
      ["region", [0], line.xs, line.xs + u(953 / 2)],
      [
        "region",
        [5],
        line.xs + (u(953 / 2) + (u(1910) - u(1906))),
        line.xs + (u(953 / 2) + (L - u(1906))),
      ],
      ["label", [0, "label"], "A × 4"],
      ["label", [4, "label"], "4 ♩"],
      ["label", [5, "label"], "C"],
    ]);
  });

  it("unfolds its timeline's regions piece by piece", () => {
    const drawing = drawn(loadFile("flow/switched_card"), [REGIONS_SHOWN]);
    const [line] = linesOf(drawing, "allegro");
    if (line === undefined) throw new Error("allegro's line");
    const x = (t: number) => line.xs + lx(t);
    const regions = drawing.elements.flatMap((item) =>
      item.type === "region" && item.address.facet === undefined
        ? [[item.address.id, item.x1, item.x2]]
        : [],
    );
    expect(regions).toEqual([
      ["section_a", x(0), x(953 / 2)],
      ["section_b", x(953 / 2), x(500)],
      ["section_a", x(500), x(1953 / 2)],
      ["section_c", x(1953 / 2), x(4241 / 2)],
    ]);
    const labels = drawing.elements.flatMap((item) =>
      item.type === "label" && item.address.id?.startsWith("section_") === true ? [item.text] : [],
    );
    expect(labels).toEqual(["A", "B", "A", "C"]);
  });

  it("draws a child once in every piece it reaches into, its marks at its own ends only", () => {
    const source = loadFile("flow/switched_card");
    const [bare] = load("bare").timelines;
    if (bare === undefined) throw new Error("bare");
    const motif = {
      ...bare,
      id: "motif",
      name: null,
      offset: quarters(400),
      length: quarters(200),
      locked: true,
    };
    const timelines = source.timelines.map((timeline) => ({ ...timeline, children: [motif] }));
    const drawing = drawn({ ...source, timelines } as Manifest);
    const [line] = linesOf(drawing, "allegro");
    if (line === undefined) throw new Error("allegro's line");
    const x = (t: number) => line.xs + lx(t);
    expect(linesOf(drawing, "motif")).toEqual([
      { type: "child", xs: x(400), xe: x(953 / 2), start: "circle", end: "none" },
      { type: "child", xs: x(953 / 2), xe: x(500), start: "none", end: "none" },
      { type: "child", xs: x(900), xe: x(1953 / 2), start: "circle", end: "none" },
      { type: "child", xs: x(1953 / 2), xe: x(2153 / 2), start: "none", end: "diamond" },
    ]);
    const names = drawing.elements.flatMap((item) =>
      item.type === "name" && item.address.id === "motif" ? [item.text] : [],
    );
    expect(names).toEqual(["motif"]);
  });
});

describe("a switched card's bands", () => {
  const source = loadFile("flow/switched_card");
  const xOf = (drawing: Drawing) => {
    const [line] = linesOf(drawing, "allegro");
    if (line === undefined) throw new Error("allegro's line");
    return (t: number) => line.xs + lx(t);
  };

  it("draw its flow control at every played position", () => {
    const drawing = drawn(source);
    const x = xOf(drawing);
    expect(flowOf(drawing, FLOW_CONTROL)).toEqual([
      ["break", { id: "volta_break" }, x(500)],
      ["break", { id: "volta_break" }, x(1953 / 2)],
      ["fork", { id: "volta_jump", part: ["fork"] }, x(953 / 2)],
      ["fork", { id: "volta_jump", part: ["fork"] }, x(1953 / 2)],
      ["symbol", { id: "repeat_end", part: ["symbol"] }, x(500)],
      ["symbol", { id: "repeat_end", part: ["symbol"] }, x(1953 / 2)],
    ]);
    expect(
      boxesOf(drawing, "band").filter((box) => box.address.facet === "flow_control"),
    ).toHaveLength(1);
  });

  it("draw an arc only in a piece holding both its from and its to", () => {
    const arcs: Graphical = { rules: ARCS_ALONE.rules?.slice(0, 1) ?? [] };
    const plain = drawn(source, [arcs]);
    expect(flowOf(plain, FLOW_CONTROL).filter(([type]) => type === "jump")).toEqual([]);
    const timelines = source.timelines.map((timeline) => ({
      ...timeline,
      flow_control: [
        ...timeline.flow_control,
        {
          id: "dal_segno",
          role: "jump" as const,
          coordinate: quarters(1000),
          name: null,
          label: null,
          meta: {},
          targets: [
            {
              determined: true,
              label: null,
              manifestation: "dal_segno",
              reset: true,
              to: "section_c",
            },
          ],
        },
      ],
    }));
    const drawing = drawn({ ...source, timelines } as Manifest, [arcs]);
    const x = xOf(drawing);
    expect(flowOf(drawing, ["dal_segno"]).filter(([type]) => type === "jump")).toEqual([
      ["jump", { id: "dal_segno" }, x(2953 / 2), x(1953 / 2)],
    ]);
  });

  it("hide what the card drawn as written hides", () => {
    const hidden: Rule = {
      select: { addresses: [{ id: "allegro", facet: "flow_control" }] },
      set: { display: "none" },
    };
    const drawing = drawn(withRules(source, [...(source.graphical?.rules ?? []), hidden]));
    expect(flowOf(drawing, FLOW_CONTROL)).toEqual([]);
  });

  it("draw a conversion map once in every piece, clipped to it", () => {
    const drawing = drawn(edit("flow/switched_card", linearMap("allegro", "tempo")));
    const x = xOf(drawing);
    const maps = drawing.elements.flatMap((item) =>
      item.type === "map" && item.address.id === "tempo" ? [item] : [],
    );
    const [first] = maps;
    if (first === undefined) throw new Error("tempo's map");
    expect(maps.map((item) => [item.xs, item.xe, item.yc])).toEqual([
      [x(0), x(953 / 2), first.yc],
      [x(953 / 2), x(500), first.yc],
      [x(500), x(1953 / 2), first.yc],
      [x(1953 / 2), x(4241 / 2), first.yc],
    ]);
  });

  it("draw a segment's boundary at every played position of its start", () => {
    const [bare] = load("bare").timelines;
    if (bare === undefined) throw new Error("bare");
    const segment = (id: string, name: string, offset: number) => ({
      ...bare,
      id,
      name,
      offset: quarters(offset),
      length: null,
      locked: false,
    });
    const timelines = source.timelines.map((timeline) => ({
      ...timeline,
      is_segment_line: true,
      children: [segment("s1", "S1", 0), segment("s2", "S2", 500)],
    }));
    const drawing = drawn({ ...source, timelines } as Manifest);
    const x = xOf(drawing);
    const boundaries = drawing.elements.flatMap((item) =>
      item.type === "boundary" && item.address.facet === undefined ? [[item.address, item.x]] : [],
    );
    expect(boundaries).toEqual([
      [{ id: "s2", part: ["start"] }, x(500)],
      [{ id: "s2", part: ["start"] }, x(1953 / 2)],
    ]);
    const labels = drawing.elements.flatMap((item) =>
      item.type === "label" && (item.address.id === "s1" || item.address.id === "s2")
        ? [[item.text, item.x]]
        : [],
    );
    expect(labels).toEqual([
      ["S1", x(953 / 4)],
      ["S1", x(1953 / 4)],
      ["S1", x(2953 / 4)],
      ["S2", x(6194 / 4)],
    ]);
  });
});

describe("a switched frame", () => {
  it("draws the switched card's flow control at every played position", () => {
    const drawing = drawn(loadFile("groups/switched_frame"));
    const [line] = linesOf(drawing, "allegro");
    if (line === undefined) throw new Error("allegro's line");
    const x = (t: number) => line.xs + lx(t);
    expect(flowOf(drawing, ["volta_break"])).toEqual([
      ["break", { id: "volta_break" }, x(500)],
      ["break", { id: "volta_break" }, x(1953 / 2)],
    ]);
  });

  it("draws the switched card's timestamps at every played position, labelled as written", () => {
    const drawing = drawn(loadFile("groups/switched_frame"));
    const [line] = linesOf(drawing, "allegro");
    if (line === undefined) throw new Error("allegro's line");
    const x = (t: number) => line.xs + lx(t);
    expect([stampsOf(drawing, "timestamp_1"), stampsOf(drawing, "timestamp_2")]).toEqual([
      { wedges: [x(0), x(500)], labels: ["0 ♩", "0 ♩"] },
      { wedges: [x(4241 / 2)], labels: ["1644 ♩"] },
    ]);
  });

  it("carries every other member through the group, its line drawn once per piece", () => {
    const drawing = drawn(loadFile("groups/switched_frame"));
    const [line] = linesOf(drawing, "allegro");
    if (line === undefined) throw new Error("allegro's line");
    const x = (t: number) => line.xs + lx(t);
    expect(linesOf(drawing, "recording")).toEqual([
      { type: "timeline", xs: x(0), xe: x(953 / 2), start: "circle", end: "none" },
      { type: "timeline", xs: x(953 / 2), xe: x(500), start: "none", end: "none" },
      { type: "timeline", xs: x(500), xe: x(1953 / 2), start: "circle", end: "none" },
      { type: "timeline", xs: x(1953 / 2), xe: x(4241 / 2), start: "none", end: "arrowhead" },
    ]);
    expect([stampsOf(drawing, "timestamp_3"), stampsOf(drawing, "timestamp_4")]).toEqual([
      { wedges: [x(0), x(500)], labels: ["0″", "0″"] },
      { wedges: [x(4241 / 2)], labels: ["11′42.5″"] },
    ]);
    expect(chunksOf(drawing, "recording")).toEqual([]);
    expect(drawing.elements.filter((item) => item.type === "elision")).toEqual([]);
  });

  it("is drawn as written where two of its cards are switched", () => {
    const drawing = drawn(recordingTwice("groups/switched_frame"));
    expect(linesOf(drawing, "allegro")).toHaveLength(1);
    expect(linesOf(drawing, "recording")).toHaveLength(1);
    expect(chunksOf(drawing, "allegro")).toEqual([]);
    expect(chunksOf(drawing, "recording")).toEqual([]);
  });

  it("carries a virtual member, its chunks unfolded with its line", () => {
    const drawing = drawn(recordingTwice("groups/virtual_member"));
    expect(linesOf(drawing, "allegro_default")).toHaveLength(2);
    const parts = (id: string, type: DrawnElement["type"]) =>
      chunksOf(drawing, id).flatMap(([kind, part]) => (kind === type ? [part] : []));
    expect(parts("allegro_default", "region")).toEqual([0, 1, 2, 3, 0, 1, 2, 3].map((k) => [k]));
    expect(parts("allegro_default", "boundary")).toEqual(
      [1, 2, 3, 1, 2, 3].map((k) => [k, "start"]),
    );
    const [recording] = linesOf(drawing, "recording");
    if (recording === undefined) throw new Error("recording's line");
    const x = (t: number) => recording.xs + lx(t, 1405);
    expect(chunksOf(drawing, "recording").filter(([type]) => type !== "boundary")).toEqual([
      ["region", [0], x(0), x(702.5)],
      ["region", [1], x(702.5), x(1405)],
      ["label", [0, "label"], "Take"],
      ["label", [1, "label"], "Take"],
    ]);
  });

  it("unfolds the ancestor lines of a carried child member", () => {
    const { written, manifest } = childMemberTwice();
    const drawing = drawn(manifest, [HIDDEN_ANCESTOR_CARDS]);
    const [recording] = linesOf(drawing, "recording");
    if (recording === undefined) throw new Error("recording's line");
    const x = (t: number) => recording.xs + L * (t / 20.0);
    expect(chunksOf(drawing, "recording").filter(([type]) => type !== "boundary")).toEqual([
      ["region", [0], x(0), x(10)],
      ["region", [1], x(10), x(20)],
      ["label", [0, "label"], "Take"],
      ["label", [1, "label"], "Take"],
    ]);
    expect(linesOf(drawing, "second-half")).toHaveLength(2);
    const ancestors = drawing.elements.flatMap((item) => (item.type === "ancestor" ? [item] : []));
    const [first] = ancestors;
    if (first === undefined) throw new Error("piece's ancestor line");
    const w = first.style["stroke-width"];
    expect(
      ancestors.map((item) => [item.address, item.xs, item.xe, item.start, item.end, item.y]),
    ).toEqual([
      [{ id: "piece" }, x(0) - 4 * w, x(10), "chevrons", "arrowhead", first.y],
      [{ id: "piece" }, x(10) - 4 * w, x(20), "chevrons", "arrowhead", first.y],
    ]);
    const axes = [...lineAxes(drawing).entries()].filter(([, axis]) => axis.timeline === "piece");
    expect(
      axes.map(([, axis]) => [
        axis.xStart,
        axis.xEnd,
        String(axis.start),
        String(axis.length),
        String(axis.drawnLength),
        axis.unit,
        axis.numberType,
      ]),
    ).toEqual([
      [x(0), x(10), "8", "8", "8", "quarters", "fraction"],
      [x(10), x(20), "8", "8", "8", "quarters", "fraction"],
    ]);
    expect(axes.map(([key]) => key.endsWith("#1"))).toEqual([false, true]);
    const pieces = drawing.axes.filter((axis) => axis.address.id === "piece");
    expect(pieces.map((axis) => [String(axis.end), axis.timestamps.map((item) => item.x)])).toEqual(
      [
        ["16", [x(5)]],
        ["16", [x(15)]],
      ],
    );
    expect(stampsOf(drawing, "bar_7")).toEqual({
      wedges: [x(5), x(15)],
      labels: ["12 ♩", "12 ♩"],
    });
    const names = drawing.elements.filter(
      (item) => item.type === "name" && item.address.id === "piece",
    );
    expect(names).toHaveLength(1);
    const asWritten = drawn(written, [HIDDEN_ANCESTOR_CARDS]);
    const [member] = linesOf(asWritten, "second-half");
    if (member === undefined) throw new Error("second-half's line");
    expect(
      asWritten.elements.flatMap((item) =>
        item.type === "ancestor" ? [[item.xs, item.xe, item.start, item.end]] : [],
      ),
    ).toEqual([[member.xs - 4 * w, member.xs + L, "chevrons", "arrowhead"]]);
    expect(chunksOf(asWritten, "recording")).toEqual([]);
  });
});
