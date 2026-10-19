/** One timeline's bands, laid out alone; every number is derived in tests/README.md. */

import type { BandKind, Manifest } from "@timetoalign/tilie-core";
import {
  BOX_KEY,
  type MemberDrawing,
  memberDrawings,
  timelineAncestry,
} from "@timetoalign/tilie-core/drawing";
import type { Graphical } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import {
  Cascade,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  manifestLayer,
  TextMeasure,
} from "../src/index.ts";
import {
  childrenStart,
  type LinePlace,
  layoutTimeline,
  type PreparedTimeline,
  prepareTimeline,
  sourcesOf,
  wholeExtent,
} from "../src/timeline.ts";
import { type Entry, type Scope, traverse } from "../src/traversal.ts";
import {
  BLOCK,
  bandOrder,
  edit,
  load,
  loadFile,
  metrics,
  quarters,
  scalarMap,
  set,
} from "./support.ts";

/** One member drawing traversed with the default layer, `extra` and the manifest's own layer. */
function scopeOf(
  manifest: Manifest,
  extra: readonly Graphical[] = [],
  member: MemberDrawing = memberDrawings(manifest).ungrouped[0] as MemberDrawing,
): Scope {
  const cascade = new Cascade(
    [DEFAULT_LAYER, ...extra, manifestLayer(manifest)],
    timelineAncestry(manifest),
  );
  const box = { key: BOX_KEY, style: cascade.resolve(BOX_KEY, undefined) };
  return traverse(
    { manifest, placement: DEFAULT_PLACEMENT, cascade, measure: new TextMeasure(metrics) },
    member,
    box,
  );
}

const entryOf = (scope: Scope, id: string): Entry => {
  const found = scope.entries.find((entry) => entry.manifest.id === id);
  if (found === undefined) throw new Error(`no timeline ${id}`);
  return found;
};

/** The timeline `id` of a member drawing, prepared. */
const prepared = (scope: Scope, id: string): PreparedTimeline =>
  prepareTimeline(scope, entryOf(scope, id));

/** The laid bands of a timeline, top to bottom, as `[kind, level, start, width, edge, elements]`. */
const laid = (timeline: PreparedTimeline, children?: { start: number; width: number }) =>
  layoutTimeline(
    timeline,
    children === undefined ? undefined : { ...children, children: [] },
  ).bands.map((band) => [band.kind, band.level, band.start, band.width, band.edge, band.elements]);

const PLACE: LinePlace = { x0: 0, y: 100, size: 11, top: 0, Pv: 8, Hc: 200 };

const show = (...kinds: BandKind[]): Graphical => ({
  statements: kinds.map((kind) => ({
    select: { element: "band", class: kind },
    set: { display: "inline" },
  })),
});
const hide = (...ids: [string, ...string[]]): Graphical => ({
  statements: [{ select: { ids }, set: { display: "none" } }],
});

describe("sides and levels by band order", () => {
  it("draws melody and phrase of map by the default band order", () => {
    const scope = scopeOf(load("map"));
    const melody = prepared(scope, "melody");
    expect(melody.order).toEqual(
      bandOrder("melody", ["children", "conversion_maps"], ["markers", "regions", "flow_control"]),
    );
    expect(melody.sides).toEqual({
      children: "above",
      conversion_maps: "above",
      markers: "below",
      regions: "below",
      flow_control: "below",
    });
    expect(melody.levels).toEqual({ above: ["conversion_maps", "children"], below: ["markers"] });
    const phrase = prepared(scope, "phrase");
    expect(phrase.order).toEqual(
      bandOrder("phrase", ["children", "conversion_maps"], ["markers", "regions", "flow_control"]),
    );
    expect(phrase.levels).toEqual({ above: ["conversion_maps"], below: [] });
  });

  it("lets a child without an entry follow its parent band by band id", () => {
    const scope = scopeOf(load("map_root_band_order"));
    expect(prepared(scope, "melody").levels).toEqual({
      above: ["children"],
      below: ["conversion_maps", "markers"],
    });
    const phrase = prepared(scope, "phrase");
    expect(phrase.order).toEqual(
      bandOrder("phrase", ["children"], ["conversion_maps", "markers", "regions", "flow_control"]),
    );
    expect(phrase.levels).toEqual({ above: [], below: ["conversion_maps"] });
  });

  it("draws a child with an entry of its own by that entry alone", () => {
    const scope = scopeOf(load("map_child_band_order"));
    expect(prepared(scope, "melody").levels).toEqual({
      above: ["conversion_maps", "children"],
      below: ["markers"],
    });
    expect(prepared(scope, "phrase").levels).toEqual({ above: [], below: ["conversion_maps"] });
  });

  it("lets a member that is a child timeline follow its parent", () => {
    const name = "groups/group_child_member";
    const member = (manifest: Manifest) =>
      memberDrawings(manifest).frames[0]?.members.find(
        (item) => item.timeline.id === "second-half",
      ) as MemberDrawing;
    const own = loadFile(name);
    expect(prepared(scopeOf(own, [], member(own)), "second-half").order).toEqual(
      bandOrder(
        "second-half",
        ["children", "conversion_maps"],
        ["markers", "regions", "flow_control"],
      ),
    );
    const reordered = edit(
      name,
      set("piece", {
        order: bandOrder(
          "piece",
          ["children"],
          ["conversion_maps", "markers", "regions", "flow_control"],
        ),
      }),
    );
    const followed = prepared(scopeOf(reordered, [], member(reordered)), "second-half");
    expect(followed.order).toEqual(
      bandOrder(
        "second-half",
        ["children"],
        ["conversion_maps", "markers", "regions", "flow_control"],
      ),
    );
    expect(followed.levels).toEqual({ above: [], below: ["markers"] });
  });
});

describe("where a band lies", () => {
  it("lays the markers and conversion maps bands against the line and the children band at c0", () => {
    const scope = scopeOf(load("map"));
    const melody = prepared(scope, "melody");
    expect(melody.reach).toEqual({ above: 6.5, below: 0 });
    expect(laid(melody, { start: 10.5, width: 14 })).toEqual([
      ["children", 2, 10.5, 14, 24.5, 1],
      ["conversion_maps", 1, 0, 6.5, 6.5, 1],
      ["markers", -1, 0, 26.9765625, 26.9765625, 2],
    ]);
    const phrase = layoutTimeline(prepared(scope, "phrase"), undefined);
    expect(phrase.bands.map((band) => [band.address, band.level])).toEqual([
      ["phrase/conversion_maps_1", 1],
    ]);
    expect(phrase.edges).toEqual({ above: 6.5, below: 0 });
  });

  it("puts two bands B apart on one side", () => {
    const melody = prepared(scopeOf(load("map_root_band_order")), "melody");
    expect(melody.reach).toEqual({ above: 0, below: 6.5 });
    expect(laid(melody, { start: 7, width: 14 })).toEqual([
      ["children", 1, 7, 14, 21, 1],
      ["conversion_maps", -1, 0, 6.5, 6.5, 1],
      ["markers", -2, 10.5, 26.9765625, 37.4765625, 2],
    ]);
  });

  it("starts any other band at level 1 or −1 B beyond the line's reach or its stroke", () => {
    const movement = prepared(
      scopeOf(load("unknown_length_child"), [
        { statements: [{ select: { ids: ["movement/regions_1"] }, set: { display: "inline" } }] },
      ]),
      "movement",
    );
    expect(movement.reach).toEqual({ above: 0, below: 0 });
    const drawing = layoutTimeline(movement, undefined);
    expect(laid(movement)).toEqual([["regions", -1, 5.5, 18.4765625, 23.9765625, 1]]);
    expect(drawing.edges).toEqual({ above: 0, below: 23.9765625 });

    const form = prepared(
      scopeOf(
        edit(
          "unknown_length_segments",
          set("form", {
            order: bandOrder(
              "form",
              ["children", "conversion_maps", "regions"],
              ["markers", "flow_control"],
            ),
          }),
        ),
        [show("regions")],
      ),
      "form",
    );
    expect(form.reach).toEqual({ above: 8, below: 8 });
    expect(laid(form)).toEqual([
      ["regions", 1, 12, 18.4765625, 30.4765625, 2],
      ["markers", -1, 0, 26.9765625, 26.9765625, 1],
    ]);
  });

  it("starts each further band B beyond the one before it", () => {
    expect(laid(prepared(scopeOf(load("with_region")), "clt_1"), { start: 7, width: 28 })).toEqual([
      ["children", 1, 7, 28, 35, 2],
      ["markers", -1, 0, 26.9765625, 26.9765625, 2],
      ["regions", -2, 30.9765625, 18.4765625, 49.453125, 1],
    ]);
  });

  it("gives a side without a band the line's reach as its outer edge", () => {
    const b = layoutTimeline(prepared(scopeOf(load("segment_line")), "b"), undefined);
    expect(b.bands).toEqual([]);
    expect(b.edges).toEqual({ above: 20.4765625, below: 8 });
  });

  it("widens a markers band at level 1 to the line's reach, its segment labels beyond it", () => {
    const pages = prepared(
      scopeOf(
        edit(
          "segment_pages",
          set("pages", {
            order: bandOrder(
              "pages",
              ["children", "conversion_maps", "markers"],
              ["regions", "flow_control"],
            ),
          }),
        ),
      ),
      "pages",
    );
    expect(pages.reach).toEqual({ above: 39.453125, below: 8 });
    expect(laid(pages)).toEqual([["markers", 1, 0, 26.9765625, 39.453125, 2]]);
    const drawn = layoutTimeline(pages, undefined).elements(PLACE);
    expect(drawn.segmentLabels.map((item) => item.element.baseline)).toEqual([
      68.90087890625, 68.90087890625, 68.90087890625, 68.90087890625,
    ]);
    expect(drawn.wedges.map((wedge) => [wedge.yt, wedge.yb])).toEqual([
      [98.5, 85.5],
      [98.5, 85.5],
    ]);
  });
});

describe("childrenStart", () => {
  it("takes the larger of the rule's start and half the row's pitch", () => {
    const melody = prepared(scopeOf(load("map")), "melody");
    expect([childrenStart(melody, 14), childrenStart(melody, 30)]).toEqual([10.5, 15]);
    const form = prepared(scopeOf(load("segment_line")), "form");
    expect(childrenStart(form, 14)).toBe(24.4765625);
    const score = prepared(scopeOf(load("unknown_length_child")), "score");
    expect(childrenStart(score, 14)).toBe(7);
  });
});

describe("level 0", () => {
  it("counts the conversion maps band as the line's stack at level 1 or −1 only", () => {
    const melody = prepared(
      scopeOf(
        edit(
          "map",
          set("melody", {
            order: bandOrder(
              "melody",
              ["children"],
              ["markers", "conversion_maps", "regions", "flow_control"],
            ),
          }),
        ),
      ),
      "melody",
    );
    expect(melody.reach).toEqual({ above: 0, below: 0 });
    expect(laid(melody, { start: 7, width: 14 })).toEqual([
      ["children", 1, 7, 14, 21, 1],
      ["markers", -1, 0, 26.9765625, 26.9765625, 2],
      ["conversion_maps", -2, 30.9765625, 6.5, 37.4765625, 1],
    ]);
    const drawn = layoutTimeline(melody, { start: 7, width: 14, children: [] }).elements(PLACE);
    expect(drawn.maps.map((map) => [map.address, map.xs, map.xe, map.yc])).toEqual([
      ["melody/tempo", 0, 400, 136.4765625],
    ]);
  });

  it("reaches k both ways with boundaries and puts segment labels above only", () => {
    const b = prepared(scopeOf(load("segment_line")), "b");
    expect(b.reach).toEqual({ above: 20.4765625, below: 8 });
    const drawn = layoutTimeline(b, undefined).elements(PLACE);
    expect(drawn.line.map((line) => [line.type, line.address, line.y, line.end])).toEqual([
      ["child", "b", 100, "diamond"],
    ]);
    expect(
      drawn.boundaries.map(({ element }) => [element.address, element.x, element.y1, element.y2]),
    ).toEqual([["b2/start", 175, 92, 108]]);
    expect(
      drawn.segmentLabels.map(({ element }) => [element.address, element.x, element.baseline]),
    ).toEqual([
      ["b1/label", 137.5, 87.87744140625],
      ["b2/label", 212.5, 87.87744140625],
    ]);
  });
});

describe("segments without a line", () => {
  const region = (id: string, start: number, end: number) => ({
    id,
    name: null,
    start: quarters(start),
    end: quarters(end),
    meta: {},
  });
  const manifest = edit(
    "segment_line",
    { type: "add", into: `${BLOCK}/b`, region: region("b_region", 0, 2) },
    { type: "add", into: `${BLOCK}/b1`, region: region("b1_region", 1, 3) },
    { type: "add", into: `${BLOCK}/b2`, region: region("b2_region", 0, 6) },
    scalarMap("b1", "b1_map"),
    {
      type: "add",
      into: `${BLOCK}/b1`,
      break: {
        id: "b1_break",
        name: null,
        coordinate: quarters(2),
        control_type: "fine",
        condition: "after_dc_ds",
        repeat_count: 1,
        label: null,
        meta: {},
      },
    },
    {
      type: "add",
      into: `${BLOCK}/b1`,
      jump: {
        id: "b1_jump",
        from_coordinate: quarters(4),
        to_coordinate: quarters(1),
        control_type: "repeat_end",
        condition: "first_n",
        repeat_count: 2,
        target: null,
        label: null,
        meta: {},
      },
    },
  );
  const elements = (timeline: PreparedTimeline) =>
    Object.fromEntries(Object.values(timeline.bands).map((band) => [band.kind, band.elements]));

  it("joins each segment's displayed bands to its segment line's, after its own", () => {
    const scope = scopeOf(manifest, [show("regions", "flow_control")]);
    const b = entryOf(scope, "b");
    expect(sourcesOf(scope, b).map((entry) => entry.manifest.id)).toEqual(["b", "b1", "b2"]);
    const timeline = prepareTimeline(scope, b);
    expect(elements(timeline)).toEqual({
      children: 0,
      conversion_maps: 1,
      markers: 0,
      regions: 3,
      flow_control: 2,
    });
    const drawn = layoutTimeline(timeline, undefined).elements(PLACE);
    expect(drawn.regions.map((item) => item.address)).toEqual([
      "form/b_region",
      "form/b1_region",
      "form/b2_region",
    ]);
    expect(drawn.maps.map((map) => [map.address, map.xs, map.xe])).toEqual([
      ["form/b1_map", 100, 175],
    ]);
    expect(drawn.breaks.map((item) => [item.address, item.x])).toEqual([["form/b1_break", 125]]);
    expect(drawn.jumps.map((item) => item.address)).toEqual(["form/b1_jump"]);
  });

  it("joins nothing by default but the maps, and nothing of a hidden segment", () => {
    expect(elements(prepared(scopeOf(manifest), "b"))).toEqual({
      children: 0,
      conversion_maps: 1,
      markers: 0,
      regions: 0,
      flow_control: 0,
    });
    const scope = scopeOf(manifest, [show("regions", "flow_control"), hide("b1")]);
    expect(sourcesOf(scope, entryOf(scope, "b")).map((entry) => entry.manifest.id)).toEqual([
      "b",
      "b2",
    ]);
    expect(elements(prepared(scope, "b"))).toEqual({
      children: 0,
      conversion_maps: 0,
      markers: 0,
      regions: 2,
      flow_control: 0,
    });
  });

  it("keeps a segment line's band present while its own display is none", () => {
    const scope = scopeOf(manifest, [show("regions", "flow_control"), hide("b/regions_1")]);
    const drawn = layoutTimeline(prepared(scope, "b"), undefined).elements(PLACE);
    expect(drawn.regions.map((item) => item.address)).toEqual(["form/b1_region", "form/b2_region"]);
  });

  it("places a segment's content by its segment line's band order, never its own", () => {
    const reordered = edit(
      "segment_line",
      scalarMap("b1", "b1_map"),
      set("b1", {
        order: bandOrder(
          "b1",
          ["children"],
          ["conversion_maps", "markers", "regions", "flow_control"],
        ),
      }),
    );
    const b = prepared(scopeOf(reordered), "b");
    expect(b.levels).toEqual({ above: ["conversion_maps"], below: [] });
  });
});

describe("extents", () => {
  it("runs an open end on 9.5w past its end", () => {
    expect(prepared(scopeOf(load("unknown_length_child")), "movement").extent).toEqual([
      100, 203.5,
    ]);
  });

  it("holds the drawn labels and the points of the breaks", () => {
    const root = prepared(scopeOf(load("flow_control")), "flow:quarters");
    expect(root.extent).toEqual([-7.416015625, 410.279052734375]);
    expect(root.bands.flow_control.extents).toEqual([
      [300, 300],
      [302, 322.91845703125],
      [50, 200],
    ]);
  });

  it("is the smallest interval holding its own extent and its children's", () => {
    expect(
      wholeExtent(
        [0, 10],
        [
          [-5, 3],
          [8, 20],
        ],
      ),
    ).toEqual([-5, 20]);
  });
});

describe("breaks", () => {
  it("end at the padding of the opposite side for the root", () => {
    const below = layoutTimeline(
      prepared(scopeOf(load("flow_control")), "flow:quarters"),
      undefined,
    );
    expect(below.elements(PLACE).breaks.map((item) => [item.y1, item.y2])).toEqual([
      [141.453125, 8],
    ]);
    const above = layoutTimeline(
      prepared(
        scopeOf(
          edit(
            "flow_control",
            set("flow:quarters", {
              order: bandOrder(
                "flow:quarters",
                ["children", "conversion_maps", "flow_control"],
                ["markers", "regions"],
              ),
            }),
          ),
        ),
        "flow:quarters",
      ),
      undefined,
    );
    expect(above.elements(PLACE).breaks.map((item) => [item.y1, item.y2])).toEqual([
      [84.0234375, 192],
    ]);
  });

  it("end max(E, h(s) / 2) beyond any other timeline's line", () => {
    const shown: Graphical[] = [
      { statements: [{ select: { ids: ["verse/flow_control_1"] }, set: { display: "inline" } }] },
    ];
    const ends = (manifest: Manifest, size = 11) =>
      layoutTimeline(prepared(scopeOf(manifest, shown), "verse"), undefined)
        .elements({ ...PLACE, size })
        .breaks.map((item) => item.y2);
    expect(ends(load("child_flow_control"))).toEqual([93.59765625]);
    expect(ends(load("child_flow_control"), 40)).toEqual([76.71875]);
    expect(
      ends(
        edit(
          "child_flow_control",
          set("verse", {
            order: bandOrder(
              "verse",
              ["children", "conversion_maps", "flow_control"],
              ["markers", "regions"],
            ),
          }),
        ),
      ),
    ).toEqual([106.40234375]);
    expect(ends(edit("child_flow_control", scalarMap("verse", "verse_map")))).toEqual([93.5]);
  });
});
