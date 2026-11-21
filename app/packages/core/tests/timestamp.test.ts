/** Timestamps; the expected values are derived in `README.md` ("Timestamps"). */

import { readFileSync } from "node:fs";
import { JsonFloat, parseJson } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { isCommandError, isLoadError } from "../src/errors.ts";
import { normalizeManifest } from "../src/manifest/io.ts";
import { findTimeline } from "../src/manifest/tree.ts";
import type { Manifest, TimelineManifest } from "../src/manifest/types.ts";
import type {
  CrossSectionMember,
  CrossSectionSpec,
  Knots,
  Pin,
  Row,
  TimelineAxis,
  Timestamp,
} from "../src/maps/timestamp.ts";
import {
  ancestorMembers,
  measureText,
  missingValueText,
  pinAt,
  positionFor,
  rowAxis,
  snapOnRow,
  timestampAt,
  timestampJson,
  timestampRows,
} from "../src/maps/timestamp.ts";
import type { MeasureKnot, MeasureKnots } from "../src/maps/values.ts";
import { axisCoordinate } from "../src/number/coordinate.ts";
import { Rational } from "../src/number/rational.ts";
import { realOf, toRational } from "../src/number/real.ts";
import type { Granularity } from "../src/workspace/view.ts";
import { A, at, block, changed, load, viewOf } from "./support.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));
const GRANULARITY: Granularity = { denominator: 2520, decimals: 3 };

/** A timeline of a fixture as a cross-section reads it. */
function axisOf(node: TimelineManifest): TimelineAxis {
  return {
    timeline: node.id,
    name: node.name ?? node.id,
    unit: node.unit,
    numberType: node.number_type,
    length: node.length === null ? null : realOf(axisCoordinate(node.length, node)),
    maps: node.conversion_maps,
  };
}

/** Every descendant of `node` in traversal order, each offset from `node`'s zero by the sum of the offsets down its path. */
function descendants(node: TimelineManifest, from: Rational): CrossSectionMember[] {
  return node.children.flatMap((child) => {
    const offset = from.add(toRational(realOf(axisCoordinate(child.offset, child))));
    return [{ ...axisOf(child), offset }, ...descendants(child, offset)];
  });
}

/**
 * The spec of `anchor` in `manifest`, its members the descendants named in
 * `members` in that order (every descendant in traversal order when not
 * given).
 */
function specOf(
  manifest: Manifest,
  anchor: string,
  members?: readonly string[],
  granularity: Granularity = GRANULARITY,
): CrossSectionSpec {
  const node = findTimeline(manifest, anchor);
  if (node === undefined) throw new Error(`no timeline ${anchor}`);
  const below = descendants(node, q(0));
  const chosen =
    members === undefined
      ? below
      : members.map((id) => {
          const found = below.find((member) => member.timeline === id);
          if (found === undefined) throw new Error(`${id} lies below no ${anchor}`);
          return found;
        });
  return { block: A, granularity, anchor: axisOf(node), members: chosen };
}

const MIXED = load("bundles/bundle_mixed.yaml");
const SEGMENTS = load("segment_line.yaml");
const MAPS = load("conversion_maps__maps_quarters.yaml");
const NAMED = load("timestamps.yaml");
const SCORE = specOf(MIXED, "score");
const RECORDING = specOf(MIXED, "recording");
const PERFORMANCE = specOf(MIXED, "performance");
const QUARTERS = specOf(MAPS, "maps:quarters");

/** The parity table's manifest and its MeasureMap's expanded rows, as `maps.test.ts` reads them. */
const parity = (() => {
  const table = parseJson(readFileSync(new URL("./parity/maps.json", import.meta.url), "utf-8"));
  if (typeof table !== "object" || table === null || !("manifest" in table)) {
    throw new Error("the parity table holds a manifest");
  }
  const manifest = normalizeManifest(table.manifest);
  if (isLoadError(manifest)) throw new Error("the parity manifest is refused");
  return { manifest, knots: knotsOf("knots" in table ? table.knots : null) };
})();

const pinOf = (spec: CrossSectionSpec, position: Rational, knots: Knots = "no_server"): Pin => ({
  spec,
  knots,
  timestamp: timestampAt(spec, position, knots),
  named: null,
});

/** Each part's timeline and position. */
const positions = (timestamp: Timestamp) =>
  timestamp.parts.map((part) => [part.timeline, part.position]);

const row = (timeline: string, map: string | null = null): Row => ({ timeline, map });

describe("the cross-section", () => {
  it("of an anchor alone holds its coordinate and its maps' values", () => {
    const timestamp = timestampAt(SCORE, q(16, 5));
    expect(timestamp.block).toBe(A);
    expect(timestamp.timeline).toBe("score");
    expect(timestamp.granularity).toBe(SCORE.granularity);
    expect(timestamp.parts).toEqual([
      {
        timeline: "score",
        name: "Score",
        unit: "quarters",
        numberType: "fraction",
        position: q(16, 5),
        maps: [
          {
            id: "cmap_1",
            name: null,
            targetUnit: "ticks",
            value: { unit: "ticks", numberType: "int", value: 1536n },
            missingKnots: null,
          },
          {
            id: "cmap_2",
            name: null,
            targetUnit: "seconds",
            value: { unit: "seconds", numberType: "float", value: 1.6 },
            missingKnots: null,
          },
        ],
      },
    ]);
    const [performance] = timestampAt(PERFORMANCE, q(2)).parts;
    expect(performance?.position).toBe(2);
    expect(performance?.maps[0]?.value).toEqual({
      unit: "samples",
      numberType: "int",
      value: 88200n,
    });
  });

  it("crosses a member whose closed span holds the position", () => {
    const timestamp = timestampAt(RECORDING, q(100000));
    expect(positions(timestamp)).toEqual([
      ["recording", 100000n],
      ["excerpt", 55900n],
    ]);
    expect(timestamp.parts.map((part) => part.maps.map((map) => [map.id, map.value]))).toEqual([
      [["cmap_5", { unit: "seconds", numberType: "float", value: 2.2675736961451247 }]],
      [["cmap_6", { unit: "seconds", numberType: "float", value: 1.2675736961451247 }]],
    ]);
    expect(positions(timestampAt(RECORDING, q(200000)))).toEqual([["recording", 200000n]]);
    expect(positions(timestampAt(RECORDING, q(44100)))).toEqual([
      ["recording", 44100n],
      ["excerpt", 0n],
    ]);
    expect(positions(timestampAt(RECORDING, q(132300)))).toEqual([
      ["recording", 132300n],
      ["excerpt", 88200n],
    ]);
  });

  it("crosses a member of unknown length everywhere from its offset", () => {
    const unknown: CrossSectionSpec = {
      ...RECORDING,
      members: RECORDING.members.map((member) => ({ ...member, length: null })),
    };
    expect(positions(timestampAt(unknown, q(200000)))).toEqual([
      ["recording", 200000n],
      ["excerpt", 155900n],
    ]);
  });

  it("holds the anchor's ancestors, parent first, each crossed wherever the anchor is", () => {
    const ancestors = ancestorMembers(SEGMENTS, "b2");
    expect(ancestors).toEqual([
      {
        timeline: "b",
        name: "B",
        unit: "quarters",
        numberType: "fraction",
        length: q(12),
        maps: [],
        offset: q(-6),
      },
      {
        timeline: "form",
        name: "Form",
        unit: "quarters",
        numberType: "fraction",
        length: q(32),
        maps: [],
        offset: q(-14),
      },
    ]);
    expect(ancestorMembers(SEGMENTS, "form")).toEqual([]);
    expect(ancestorMembers(SEGMENTS, "nope")).toEqual([]);
    const b2 = { ...specOf(SEGMENTS, "b2"), members: ancestors };
    expect(positions(timestampAt(b2, q(1)))).toEqual([
      ["b2", q(1)],
      ["b", q(7)],
      ["form", q(15)],
    ]);
    const excerpt = { ...specOf(MIXED, "excerpt"), members: ancestorMembers(MIXED, "excerpt") };
    expect(
      excerpt.members.map(({ timeline, offset, length }) => [timeline, offset, length]),
    ).toEqual([["recording", q(-44100), q(441000)]]);
    expect(positions(timestampAt(excerpt, q(44100)))).toEqual([
      ["excerpt", 44100n],
      ["recording", 88200n],
    ]);
  });

  it("reads a group's member by its scale, the group's members starting and ending together", () => {
    const grouped = load("groups/group_groupstamp.yaml");
    const performance = findTimeline(grouped, "performance");
    if (performance === undefined) throw new Error("the group has performance");
    const member = { ...axisOf(performance), offset: q(0), scale: q(1, 2) };
    const spec = { ...specOf(grouped, "score", []), members: [member] };
    expect(positions(timestampAt(spec, q(4)))).toEqual([
      ["score", q(4)],
      ["performance", 2.0],
    ]);
    expect(positions(timestampAt(spec, q(8)))).toEqual([
      ["score", q(8)],
      ["performance", 4.0],
    ]);
    const pin = pinOf(spec, q(4));
    expect(positionFor(pin, row("performance"), q(3))).toEqual(q(6));
    const outside = positionFor(pin, row("performance"), q(5));
    expect(isCommandError(outside) && outside.message).toBe(
      "5 lies outside 'performance' (0 to 4)",
    );
    expect(snapOnRow(spec, row("performance"), 3.13, 0.004)).toEqual(q(313, 100));
  });

  it("crosses contiguous members both at their boundary, in the order given", () => {
    const form = specOf(SEGMENTS, "form");
    expect(form.members.map((member) => [member.timeline, member.offset])).toEqual([
      ["a", q(0)],
      ["a1", q(0)],
      ["b", q(8)],
      ["b1", q(8)],
      ["b2", q(14)],
      ["c", q(20)],
      ["c1", q(20)],
    ]);
    expect(positions(timestampAt(form, q(8)))).toEqual([
      ["form", q(8)],
      ["a", q(8)],
      ["a1", q(8)],
      ["b", q(0)],
      ["b1", q(0)],
    ]);
    expect(positions(timestampAt(form, q(27, 2)))).toEqual([
      ["form", q(27, 2)],
      ["b", q(11, 2)],
      ["b1", q(11, 2)],
    ]);
    expect(positions(timestampAt(form, q(32)))).toEqual([
      ["form", q(32)],
      ["c", q(12)],
      ["c1", q(12)],
    ]);
    const reversed = specOf(SEGMENTS, "form", ["b", "a"]);
    expect(positions(timestampAt(reversed, q(8)))).toEqual([
      ["form", q(8)],
      ["b", q(0)],
      ["a", q(8)],
    ]);
  });
});

describe("the rows of a timestamp", () => {
  it("list per part its coordinate, then its maps", () => {
    expect(timestampRows(pinOf(RECORDING, q(100000)))).toEqual([
      {
        row: row("recording"),
        timeline: "recording",
        label: "Recording",
        value: { unit: "samples", numberType: "int", value: 100000n },
        missing: null,
        editable: true,
      },
      {
        row: row("recording", "cmap_5"),
        timeline: "recording",
        label: "cmap_5",
        value: { unit: "seconds", numberType: "float", value: 2.2675736961451247 },
        missing: null,
        editable: true,
      },
      {
        row: row("excerpt"),
        timeline: "excerpt",
        label: "Excerpt",
        value: { unit: "samples", numberType: "int", value: 55900n },
        missing: null,
        editable: true,
      },
      {
        row: row("excerpt", "cmap_6"),
        timeline: "excerpt",
        label: "cmap_6",
        value: { unit: "seconds", numberType: "float", value: 1.2675736961451247 },
        missing: null,
        editable: true,
      },
    ]);
  });

  it("are editable exactly where a map is invertible over its timeline's span", () => {
    const rows = timestampRows(pinOf(QUARTERS, q(2)));
    expect(rows.map((item) => [item.row.map, item.editable])).toEqual([
      [null, true],
      ["cmap_1", false],
      ["cmap_2", false],
      ["cmap_3", false],
      ["cmap_4", true],
      ["cmap_5", false],
      ["cmap_8", false],
      ["lmap_5", true],
      ["pmap_1", true],
      ["tmap_1", false],
      ["tmap_2", false],
      ["tmap_3", false],
      ["tmap_4", true],
    ]);
  });

  it("say why a map has no value", () => {
    const missing = (knots: Knots) =>
      timestampRows(pinOf(QUARTERS, q(2), knots)).flatMap((item) =>
        item.missing === null ? [] : [[item.row.map, item.missing]],
      );
    const server = "needs a server to expand its measure map";
    expect(missing("no_server")).toEqual(
      ["cmap_1", "cmap_2", "cmap_3", "cmap_5", "tmap_1"].map((id) => [id, server]),
    );
    expect(missing("pending")[0]).toEqual(["cmap_1", "waiting for the server"]);
    expect(missing([])[0]).toEqual(["cmap_1", "the server did not expand its measure map"]);
  });

  it("are shown in the texts every reader shows", () => {
    expect(missingValueText({ missingKnots: null })).toBe("no value here");
    expect(missingValueText({ missingKnots: "unsupported" })).toBe(
      "the server cannot expand measure maps",
    );
    expect(missingValueText({ missingKnots: "unreachable" })).toBe(
      "no server answered, so its measure map is not expanded",
    );
    const [first] = parity.knots[0]?.rows ?? [];
    if (first === undefined) throw new Error("the parity rows hold a measure");
    const measure = (name: string, number: number | null, count: number): MeasureKnot => ({
      ...first,
      name,
      number,
      count,
    });
    expect(measureText(measure("m. 3", 3, 3))).toBe("m. 3");
    expect(measureText(measure("", 7, 7))).toBe("7");
    expect(measureText(measure("", null, 9))).toBe("9");
  });
});

describe("snapping on a row", () => {
  it("snaps a coordinate on the timeline's own axis", () => {
    expect(snapOnRow(SCORE, row("score"), 3.13, 0.004)).toEqual(q(47, 15));
  });

  it("steps by 1 on a timeline of an int axis, on its coordinate and on its maps", () => {
    expect(snapOnRow(RECORDING, row("excerpt"), 100012.3, 3000)).toEqual(q(100012));
    expect(snapOnRow(RECORDING, row("recording"), 100012.3, 3000)).toEqual(q(100012));
    expect(snapOnRow(RECORDING, row("excerpt", "cmap_6"), 100000.4, 100)).toEqual(q(100000));
    const tenths = { ...RECORDING, granularity: { denominator: 2520, decimals: 1 } };
    expect(snapOnRow(tenths, row("excerpt", "cmap_6"), 100000.4, 100)).toEqual(q(100000));
  });

  it("snaps a map's value under its target's cap and inverts it exactly", () => {
    const coarse = { ...SCORE, granularity: { denominator: 2520, decimals: 1 } };
    const tenths = snapOnRow(coarse, row("score", "cmap_2"), 3.13, 0.004);
    expect(tenths).toEqual(q(16, 5));
    const [part] = timestampAt(coarse, tenths).parts;
    expect(part?.maps.map((map) => map.value)).toEqual([
      { unit: "ticks", numberType: "int", value: 1536n },
      { unit: "seconds", numberType: "float", value: 1.6 },
    ]);
    expect(snapOnRow(SCORE, row("score", "cmap_1"), 3.13, 0.004)).toEqual(q(751, 240));
  });

  it("holds the position to the member's span", () => {
    expect(snapOnRow(RECORDING, row("excerpt"), 140000, 0.5)).toEqual(q(132300));
  });

  it("falls back to the coordinate for a map without an inverse", () => {
    expect(snapOnRow(QUARTERS, row("maps:quarters", "cmap_8"), 3.13, 0.004)).toEqual(q(47, 15));
  });

  it("refuses a pointer that is not finite, a reach that is not positive and an unknown row", () => {
    for (const p of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => snapOnRow(SCORE, row("score"), p, 0.5)).toThrow(RangeError);
    }
    for (const h of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => snapOnRow(SCORE, row("score"), 1, h)).toThrow(RangeError);
    }
    expect(() => snapOnRow(SCORE, row("nope"), 1, 0.5)).toThrow(RangeError);
    expect(() => snapOnRow(SCORE, row("score", "nope"), 1, 0.5)).toThrow(RangeError);
    expect(rowAxis(SCORE, row("score", "nope"))).toBeNull();
  });
});

describe("a pin", () => {
  it("moves to a position, its spec, knots and named timestamp kept", () => {
    const pin = pinOf(SCORE, q(16, 5));
    const moved = pinAt(pin, q(8));
    expect(moved.spec).toBe(pin.spec);
    expect(moved.knots).toBe(pin.knots);
    expect(moved.named).toBe(pin.named);
    expect(moved.timestamp).toEqual(timestampAt(SCORE, q(8)));
  });

  it("gives the exact position at which a row takes an edited value", () => {
    const score = pinOf(SCORE, q(16, 5));
    expect(positionFor(score, row("score"), q(10))).toEqual(q(10));
    expect(positionFor(score, row("score"), q(1, 7))).toEqual(q(1, 7));
    expect(positionFor(score, row("score", "cmap_1"), q(1536))).toEqual(q(16, 5));
    expect(positionFor(score, row("score", "cmap_2"), q(8, 5))).toEqual(q(16, 5));
    const recording = pinOf(RECORDING, q(100000));
    expect(positionFor(recording, row("excerpt"), q(55900))).toEqual(q(100000));
    expect(positionFor(recording, row("excerpt", "cmap_6"), q(317, 250))).toEqual(q(100019));
    expect(positionFor(recording, row("recording", "cmap_5"), q(2))).toEqual(q(88200));
    const quarters = pinOf(QUARTERS, q(2));
    expect(positionFor(quarters, row("maps:quarters", "tmap_4"), q(1))).toEqual(q(593, 315));
  });

  it("refuses an edited value no position of the timeline gives", () => {
    const refusal = (pin: Pin, at: Row, value: Rational) => {
      const result = positionFor(pin, at, value);
      if (!isCommandError(result)) throw new Error(`expected a refusal, got ${result}`);
      return [result.code, result.message, result.path];
    };
    const outside = (message: string) => ["invalid_value", message, []];
    const score = pinOf(SCORE, q(16, 5));
    expect(refusal(score, row("score"), q(13))).toEqual(
      outside("13 lies outside 'score' (0 to 12)"),
    );
    expect(refusal(score, row("score"), q(-1))).toEqual(
      outside("-1 lies outside 'score' (0 to 12)"),
    );
    expect(refusal(score, row("score", "cmap_1"), q(6240))).toEqual(
      outside("13 lies outside 'score' (0 to 12)"),
    );
    expect(refusal(pinOf(RECORDING, q(100000)), row("excerpt"), q(90000))).toEqual(
      outside("90000 lies outside 'excerpt' (0 to 88200)"),
    );
    expect(refusal(pinOf(QUARTERS, q(2)), row("maps:quarters", "cmap_8"), q(3))).toEqual(
      outside("no position on 'maps:quarters' gives 3"),
    );
    expect(refusal(score, row("score", "nope"), q(1))).toEqual(
      outside("'score' shows no map 'nope'"),
    );
    expect(refusal(pinOf(RECORDING, q(200000)), row("excerpt"), q(1))).toEqual(
      outside("the timestamp shows no 'excerpt'"),
    );
  });

  it("holds an ancestor's edited value to the anchor's span", () => {
    const b2 = pinOf({ ...specOf(SEGMENTS, "b2"), members: ancestorMembers(SEGMENTS, "b2") }, q(1));
    expect(positionFor(b2, row("form"), q(16))).toEqual(q(2));
    const refused = (value: Rational) => {
      const result = positionFor(b2, row("form"), value);
      return isCommandError(result) ? [result.code, result.message, result.path] : result;
    };
    expect(refused(q(40))).toEqual(["invalid_value", "40 lies outside 'form' (0 to 32)", []]);
    expect(refused(q(25))).toEqual(["invalid_value", "11 lies outside 'b2' (0 to 6)", []]);
  });
});

describe("the JSON value of a timestamp", () => {
  it("of an unnamed timestamp is its anchor's coordinate and the mapping", () => {
    expect(timestampJson(pinOf(SCORE, q(16, 5)))).toEqual({
      timeline: "score",
      coordinate: [16, 5],
      mapping: {
        cmap_1: { unit: "ticks", number_type: "int", value: 1536 },
        cmap_2: { unit: "seconds", number_type: "float", value: 1.6 },
      },
    });
    const recording = timestampJson(pinOf(RECORDING, q(100000)));
    expect(recording).toEqual({
      timeline: "recording",
      coordinate: 100000,
      mapping: {
        cmap_5: { unit: "seconds", number_type: "float", value: 2.2675736961451247 },
        excerpt: { unit: "samples", number_type: "int", value: 55900 },
        cmap_6: { unit: "seconds", number_type: "float", value: 1.2675736961451247 },
      },
    });
    expect(Object.keys(mappingOf(recording))).toEqual(["cmap_5", "excerpt", "cmap_6"]);
    expect(timestampJson(pinOf(PERFORMANCE, q(2)))).toEqual({
      timeline: "performance",
      coordinate: new JsonFloat(2),
      mapping: { cmap_3: { unit: "samples", number_type: "int", value: 88200 } },
    });
  });

  it("writes every kind of value", () => {
    expect(mappingOf(timestampJson(pinOf(QUARTERS, q(2))))).toEqual({
      cmap_1: null,
      cmap_2: null,
      cmap_3: null,
      cmap_4: { unit: "minutes", number_type: "float", value: 0.016666666666666666 },
      cmap_5: null,
      cmap_8: "section-a",
      lmap_5: { unit: "seconds", number_type: "float", value: 3.3333333333333335 },
      pmap_1: { unit: "seconds", number_type: "float", value: new JsonFloat(3) },
      tmap_1: null,
      tmap_2: { unit: "seconds", number_type: "float", value: 1.25 },
      tmap_3: { number_type: "int", value: 60 },
      tmap_4: { unit: "seconds", number_type: "float", value: 1.0625 },
    });
    const spec = specOf(parity.manifest, "quarters_root");
    const values = mappingOf(timestampJson(pinOf(spec, q(2), parity.knots)));
    const measure = parity.knots[0]?.rows.find((item) => item.ID === "2");
    expect(values.q_record).toEqual({ ...measure });
    expect(values.q_combination).toEqual({
      seconds: { number_type: "float", value: new JsonFloat(1) },
      file: "a.png",
      count: { number_type: "int", value: 3 },
    });
    expect(values.q_constant_label).toBe("intro");
  });

  it("of a named timestamp is its manifest entry and the mapping", () => {
    const named = NAMED.graphical?.timestamps?.find((item) => item.id === "timestamp_2");
    if (named === undefined) throw new Error("timestamps.yaml holds timestamp_2");
    const spec = specOf(NAMED, "clt_1");
    const pin: Pin = { ...pinOf(spec, q(6)), named };
    const value = timestampJson(pin);
    expect(value).toEqual({
      ...named,
      mapping: { clt_2: { unit: "quarters", number_type: "fraction", value: [4, 1] } },
    });
    expect(Object.keys(value ?? {})).toEqual([...Object.keys(named), "mapping"]);
  });

  it("of a segment's named timestamp has the segment as its anchor, never in its mapping", () => {
    const ticks = load("map.yaml").timelines[0]?.children[0]?.conversion_maps[0];
    if (ticks === undefined) throw new Error("map.yaml has changed");
    const view = [
      { type: "add", into: at("b2"), map: { ...ticks, id: "b2_ticks" } },
      { type: "add", into: at("b2"), timestamp: { name: "Mark", coordinate: [1, 1] } },
    ].reduce(changed, viewOf([A, "segment_line.yaml"]));
    const { manifest } = block(view);
    const named = manifest.graphical?.timestamps?.find((item) => item.timeline === "b2");
    if (named === undefined) throw new Error("b2 holds the timestamp added");
    const pin: Pin = { ...pinOf(specOf(manifest, "b2"), q(1)), named };
    expect(positions(pin.timestamp)).toEqual([["b2", q(1)]]);
    expect(timestampJson(pin)).toEqual({
      ...named,
      mapping: { b2_ticks: { unit: "ticks", number_type: "int", value: 480 } },
    });
  });
});

/** The `mapping` member of a timestamp's JSON value. */
function mappingOf(value: unknown): { readonly [id: string]: unknown } {
  if (typeof value !== "object" || value === null || !("mapping" in value)) {
    throw new Error("a timestamp's JSON value has a mapping");
  }
  const { mapping } = value;
  if (typeof mapping !== "object" || mapping === null) throw new Error("the mapping is an object");
  return Object.fromEntries(Object.entries(mapping));
}

/** The parity table's expanded rows, which hold the members a measure view reads. */
function knotsOf(value: unknown): readonly MeasureKnots[] {
  if (!Array.isArray(value)) throw new Error("the parity table holds its MeasureMap's rows");
  return value;
}
