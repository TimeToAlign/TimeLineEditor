/**
 * Bands shown explicitly that draw nothing (section 6.4, Empty bands), read from the drawing's
 * band records; every number is derived in tests/README.md ("Empty bands").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { type Facet, isLoadError, loadManifest, type Manifest } from "@timetoalign/tilie-core";
import type { Graphical, Selector } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  manifestLayer,
} from "../src/index.ts";
import { boxesOf, edit, loadFile, metrics, target } from "./support.ts";

/** `manifest` drawn with the default layer, the application's layers `extra` and its own. */
const drawn = (manifest: Manifest, extra: readonly Graphical[] = []): Drawing =>
  draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, ...extra, manifestLayer(manifest)], metrics);

/** A layer of one rule displaying what `select` selects. */
const showing = (select: Selector): Graphical => ({
  rules: [{ select, set: { display: "inline" } }],
});

/** The band's own rule, as an editor's control writes it. */
const own = (id: string, facet: Facet): Selector => ({
  element: "band",
  addresses: [{ id, facet }],
});

type Row = readonly [string, Facet, number, number, number, number];

/**
 * Every band record, in drawing order, as `[timeline, facet, level, elements, start, width]`:
 * `start` the distance `c` of its start from its line, `width` its rectangle's height.
 */
const bands = (drawing: Drawing): Row[] =>
  boxesOf(drawing, "band").map((box) => {
    const { band } = box;
    if (band === undefined) throw new Error("a band record without its band");
    const start = band.level > 0 ? band.line - (box.y + box.height) : box.y - band.line;
    return [band.timeline, band.facet, band.level, band.elements, start, box.height];
  });

/** `Wb = 6 + 2 + h(9)`. */
const Wb = 18.4765625;

/** `child_flow_control` with its root's named timestamps removed: the shape of Op. 106. */
const op106 = (): Manifest =>
  edit("child_flow_control", {
    type: "remove",
    targets: [target("timestamp_1"), target("timestamp_2")],
  });

/** The root of `data/op106.manifest.json`, "Op. 106". */
const OP106_ROOT = "clt_0is8auvrgrzyd";

const REGIONS_WITHIN_PIECE = showing({ facet: "regions", within: "piece" });

describe("empty bands", () => {
  it("lays out the specification's worked example", () => {
    expect(bands(drawn(op106()))).toEqual([
      ["piece", "children", 1, 1, 7, 14],
      ["piece", "flow_control", -1, 2, 5.5, 28.4453125],
    ]);
    expect(bands(drawn(op106(), [REGIONS_WITHIN_PIECE]))).toEqual([
      ["piece", "children", 1, 1, 7, 30.9765625],
      ["piece", "regions", -1, 0, 5.5, Wb],
      ["piece", "flow_control", -2, 2, 27.9765625, 28.4453125],
      ["verse", "regions", -1, 0, 5.5, Wb],
    ]);
  });

  it("lays out the worked example's numbers on Op. 106 itself", () => {
    const manifest = loadManifest(
      readFileSync(path.join(import.meta.dirname, "data", "op106.manifest.json"), "utf8"),
    );
    if (isLoadError(manifest)) throw new Error("the Op. 106 manifest is refused");
    const root = (drawing: Drawing) =>
      bands(drawing).filter(([timeline, facet]) => timeline === OP106_ROOT && facet !== "children");
    // The movements' 11 drawn flow-control elements (a break, eight barlines, two jumps), the
    // band `Hs + Hf = 17.96875 + 20.8009383552` wide (tests/README.md, "Op. 106").
    const width = 38.7696883552;
    expect(root(drawn(manifest))).toEqual([[OP106_ROOT, "flow_control", -1, 11, 5.5, width]]);
    expect(root(drawn(manifest, [showing({ facet: "regions", within: OP106_ROOT })]))).toEqual([
      [OP106_ROOT, "regions", -1, 0, 5.5, Wb],
      [OP106_ROOT, "flow_control", -2, 11, 27.9765625, width],
    ]);
  });

  it("draws a band not shown explicitly as no rule does", () => {
    expect(bands(drawn(op106(), [showing({ facet: "regions" })]))).toEqual(bands(drawn(op106())));
    const bare = loadFile("bare");
    expect(
      bands(drawn(bare, [showing(own("bare", "regions")), showing({ facet: "regions" })])),
    ).toEqual(bands(drawn(bare)));
  });

  it("shows each facet's empty band by its own rule, at least Wb wide", () => {
    const bare = loadFile("bare");
    const markers: Row = ["bare", "markers", -1, 4, 0, 26.9765625];
    const of = (facet: Facet) => bands(drawn(bare, [showing(own("bare", facet))]));
    expect(of("markers")).toEqual([markers]);
    expect(of("regions")).toEqual([markers, ["bare", "regions", -2, 0, 30.9765625, Wb]]);
    expect(of("flow_control")).toEqual([markers, ["bare", "flow_control", -2, 0, 30.9765625, Wb]]);
    expect(of("conversion_maps")).toEqual([["bare", "conversion_maps", 1, 0, 0, Wb], markers]);
    expect(of("children")).toEqual([["bare", "children", 1, 0, 7, Wb], markers]);
  });

  it("never widens a band that draws", () => {
    const wedges = edit("bare", {
      type: "set",
      changes: ["timestamp_1", "timestamp_2"].map((id) => ({
        target: target(id),
        values: { display: ["wedge"] },
      })),
    });
    const expected: Row[] = [["bare", "markers", -1, 2, 0, 14.5]];
    expect(bands(drawn(wedges))).toEqual(expected);
    expect(bands(drawn(wedges, [showing(own("bare", "markers"))]))).toEqual(expected);
  });

  it("shows no flow control band but the root's", () => {
    const nested = loadFile("nested");
    expect(
      bands(drawn(nested, [showing({ element: "band", facet: "flow_control", within: "clt_1" })])),
    ).toEqual([
      ["clt_1", "children", 1, 1, 7, 28],
      ["clt_1", "markers", -1, 4, 0, 26.9765625],
      ["clt_1", "flow_control", -2, 0, 30.9765625, Wb],
      ["clt_3", "children", 1, 1, 7, 14],
    ]);
  });

  it("makes the band present for every line of a row of one band order", () => {
    const siblings = loadFile("map_row_siblings");
    const maps = (id: string): Row => [id, "conversion_maps", 1, 2, 0, 11.5];
    const markers: Row = ["piece", "markers", -1, 4, 0, 26.9765625];
    expect(bands(drawn(siblings))).toEqual([
      ["piece", "children", 1, 2, 7, 18.5],
      markers,
      maps("ante"),
      maps("cons"),
    ]);
    expect(bands(drawn(siblings, [showing(own("ante", "regions"))]))).toEqual([
      ["piece", "children", 1, 2, 7, 35.4765625],
      markers,
      maps("ante"),
      ["ante", "regions", -1, 0, 5.5, Wb],
      maps("cons"),
      ["cons", "regions", -1, 0, 5.5, Wb],
    ]);
  });

  it("records no band of a hidden line", () => {
    const hidden: Graphical = {
      rules: [{ select: { addresses: [{ id: "piece" }] }, set: { display: "none" } }],
    };
    expect(bands(drawn(op106(), [REGIONS_WITHIN_PIECE, hidden]))).toEqual([]);
  });
});
