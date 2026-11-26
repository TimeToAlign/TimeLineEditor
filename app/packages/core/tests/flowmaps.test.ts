import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { loads, SCHEMA_VERSION } from "@timetoalign/timetoshare";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FlowMapError,
  type FlowMapErrorCode,
  fold,
  type ResolvedFlowMap,
  resolveFlowMap,
  type Stretch,
  unfold,
} from "../src/manifest/flowmaps.ts";
import type { Manifest } from "../src/manifest/types.ts";
import { foldVirtual, resolveVirtualTimeline, unfoldVirtual } from "../src/manifest/virtual.ts";
import { expressAs } from "../src/maps/express.ts";
import {
  addCoordinates,
  axisCoordinate,
  type Coordinate,
  compareCoordinates,
  subtractCoordinates,
} from "../src/number/coordinate.ts";
import { Rational } from "../src/number/rational.ts";
import { toRational } from "../src/number/real.ts";
import { fileText, load, loadText, manifestValue } from "./support.ts";

/** One expected flow of the schema package (`fixtures/flows/<version>/`), as its README states it. */
interface ExpectedFlow {
  readonly manifest: string;
  readonly timeline: string;
  readonly atomic_sections: readonly {
    readonly name: string;
    readonly start: unknown;
    readonly end: unknown;
  }[];
  readonly conventions: {
    readonly [convention: string]: {
      readonly runs: readonly (readonly [unknown, unknown])[];
      readonly sections: readonly string[];
    };
  };
}

/** A value of the schema package's expected flows, read as its README states it. */
function expectedFlow(value: unknown): ExpectedFlow {
  return value as ExpectedFlow;
}

/** A manifest's value as `manifestValue` gives it, to change before loading it again. */
type JsonObject = { [key: string]: unknown };

const flowsDir = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timetoshare/package.json")),
  "fixtures",
  "flows",
  SCHEMA_VERSION,
);
const EXPECTED: readonly (readonly [string, ExpectedFlow])[] = readdirSync(flowsDir)
  .filter((name) => name.endsWith(".yaml"))
  .sort()
  .map((name) => [name, expectedFlow(loads(readFileSync(path.join(flowsDir, name), "utf8")))]);

type Axis = { readonly unit: Coordinate["unit"]; readonly number_type: Coordinate["numberType"] };

const QUARTERS: Axis = { unit: "quarters", number_type: "fraction" };
const q = (numerator: number, denominator = 1): Coordinate => ({
  unit: "quarters",
  numberType: "fraction",
  value: Rational.fromParts(BigInt(numerator), BigInt(denominator)),
});
const span = (start: Coordinate, end: Coordinate): Stretch => ({ start, end });
const half = (length: Coordinate): Coordinate => {
  const value = expressAs(
    toRational(length.value).divide(Rational.fromParts(2n, 1n)),
    length.numberType,
  );
  if (value === undefined) throw new Error("no half");
  return { ...length, value };
};
const covers = (stretch: Stretch, x: Coordinate) =>
  compareCoordinates(stretch.start, x) <= 0 && compareCoordinates(x, stretch.end) < 0;

/** Stretches in order, each touching the one before it joined to it. */
function joined(stretches: readonly Stretch[]): Stretch[] {
  const result: Stretch[] = [];
  for (const stretch of stretches) {
    const last = result.at(-1);
    if (last !== undefined && compareCoordinates(last.end, stretch.start) === 0) {
      result[result.length - 1] = span(last.start, stretch.end);
    } else result.push(stretch);
  }
  return result;
}

/** The code and path of a `FlowMapError` thrown by `run`. */
function refusal(run: () => unknown): { code: FlowMapErrorCode; path: readonly unknown[] } {
  try {
    run();
  } catch (error) {
    if (error instanceof FlowMapError) return { code: error.code, path: error.path };
    throw error;
  }
  throw new Error("not refused");
}

/** A fixture's value changed by `change` and loaded again. */
function changedFixture(name: string, change: (value: JsonObject) => void): Manifest {
  const value: JsonObject = manifestValue(name);
  change(value);
  return loadText(fileText(value), name);
}

const listOf = (value: JsonObject, key: string): JsonObject[] => {
  const list = (value[key] ?? []) as JsonObject[];
  value[key] = list;
  return list;
};

/**
 * The fixture of an expected flow, its root gaining a Region `section_<X>`
 * per atomic section and a FlowMap `flow_<convention>` per convention,
 * whose chunks are the convention's sections.
 */
function withSections(expected: ExpectedFlow): Manifest {
  return changedFixture(`${expected.manifest}.yaml`, (value) => {
    const root = listOf(value, "timelines").find((item) => item.id === expected.timeline);
    if (root === undefined) throw new Error(`no root ${expected.timeline}`);
    listOf(root, "regions").push(
      ...expected.atomic_sections.map(({ name, start, end }) => ({
        id: `section_${name}`,
        start,
        end,
      })),
    );
    listOf(value, "flow_maps").push(
      ...Object.entries(expected.conventions).map(([convention, flow]) => ({
        id: `flow_${convention}`,
        timeline: expected.timeline,
        chunks: flow.sections.map((section) => `section_${section}`),
      })),
    );
  });
}

describe("the expected flows", () => {
  it("are the ten of the schema package", () => {
    expect(EXPECTED.map(([name]) => name)).toEqual([
      "da_capo_al_fine.yaml",
      "dal_segno_al_coda.yaml",
      "loop.yaml",
      "ossia.yaml",
      "repairs.yaml",
      "repeat_end_and_dal_segno.yaml",
      "sections.yaml",
      "sonata_exposition.yaml",
      "virtual_cards.yaml",
      "volta_passes.yaml",
    ]);
  });

  const cases = EXPECTED.flatMap(([name, expected]) =>
    Object.keys(expected.conventions).map((convention) => [name, convention, expected] as const),
  );

  it.each(cases)("%s, %s", (_name, convention, expected) => {
    const manifest = withSections(expected);
    const root = manifest.timelines.find((item) => item.id === expected.timeline);
    if (root === undefined) throw new Error("no root");
    const at = (value: unknown) => axisCoordinate(value, root);
    const zero = subtractCoordinates(at(root.length), at(root.length));
    const sections = new Map(
      expected.atomic_sections.map((section) => [
        section.name,
        span(at(section.start), at(section.end)),
      ]),
    );
    const flow = expected.conventions[convention];
    if (flow === undefined) throw new Error("no convention");
    const written = flow.sections.map((name) => {
      const found = sections.get(name);
      if (found === undefined) throw new Error(`no section ${name}`);
      return found;
    });
    const starts: Coordinate[] = [];
    let position = zero;
    for (const stretch of written) {
      starts.push(position);
      position = addCoordinates(position, subtractCoordinates(stretch.end, stretch.start));
    }
    const played = written.map((stretch, index) => {
      const start = starts[index] ?? zero;
      return span(start, addCoordinates(start, subtractCoordinates(stretch.end, stretch.start)));
    });

    const resolved = resolveFlowMap(manifest, `flow_${convention}`);
    expect(resolved.timeline).toBe(expected.timeline);
    expect(resolved.unit).toBe(root.unit);
    expect(resolved.numberType).toBe(root.number_type);
    expect(resolved.length).toEqual(position);
    expect(resolved.chunks).toEqual(
      flow.sections.map((name, index) => ({
        kind: "region",
        index,
        source: `section_${name}`,
        written: written[index],
        played: played[index],
      })),
    );

    // The written stretches and the runs, touching ones joined, agree.
    expect(joined(resolved.chunks.map((chunk) => chunk.written as Stretch))).toEqual(
      joined(flow.runs.map(([start, end]) => span(at(start), at(end)))),
    );

    // The runs of equal chunks are the sections grouped.
    const grouped: [string, number][] = [];
    for (const name of flow.sections) {
      const last = grouped.at(-1);
      if (last !== undefined && last[0] === name) last[1] += 1;
      else grouped.push([name, 1]);
    }
    expect(resolved.runs.map((run) => [run.chunk.source, run.count])).toEqual(
      grouped.map(([name, count]) => [`section_${name}`, count]),
    );

    written.forEach((stretch, index) => {
      const start = played[index]?.start ?? zero;
      const middle = half(subtractCoordinates(stretch.end, stretch.start));
      expect(fold(resolved, start)).toEqual(stretch.start);
      expect(fold(resolved, addCoordinates(start, middle))).toEqual(
        addCoordinates(stretch.start, middle),
      );
    });
    expect(refusal(() => fold(resolved, position))).toEqual({
      code: "outside_virtual_axis",
      path: [],
    });

    for (const [name, stretch] of sections) {
      const indices = flow.sections.flatMap((item, index) => (item === name ? [index] : []));
      const middle = half(subtractCoordinates(stretch.end, stretch.start));
      for (const into of [subtractCoordinates(middle, middle), middle]) {
        const x = addCoordinates(stretch.start, into);
        expect(unfold(resolved, x)).toEqual(
          indices.map((index, rank) => ({
            played: addCoordinates(played[index]?.start ?? zero, into),
            occurrence: rank + 1,
            of: indices.length,
            chunk: index,
          })),
        );
      }
    }
    expect(unfold(resolved, at(root.length))).toEqual([]);
  });

  it("plays nothing of a section a convention leaves out", () => {
    const [, sonata] = EXPECTED.find(([name]) => name === "sonata_exposition.yaml") ?? [];
    const [, ossia] = EXPECTED.find(([name]) => name === "ossia.yaml") ?? [];
    if (sonata === undefined || ossia === undefined) throw new Error("missing");
    expect(unfold(resolveFlowMap(withSections(sonata), "flow_single"), q(13))).toEqual([]);
    expect(unfold(resolveFlowMap(withSections(ossia), "flow_default"), q(20))).toEqual([]);
  });
});

describe("the FlowMaps a fixture states", () => {
  const sonata = load("flow/sonata_exposition.yaml");
  const A = span(q(0), q(12));
  const B = span(q(12), q(16));
  const C = span(q(16), q(24));

  it.each([
    ["flow_map_1", [A, B, A, C]],
    ["flow_map_2", [A, C]],
    ["flow_map_3", [A, B, C]],
  ] as const)("%s of sonata_exposition", (id, written) => {
    const resolved = resolveFlowMap(sonata, id);
    expect(resolved.chunks.map((chunk) => chunk.written)).toEqual(written);
    let start = q(0);
    const played = written.map((stretch) => {
      const end = addCoordinates(start, subtractCoordinates(stretch.end, stretch.start));
      const placed = span(start, end);
      start = end;
      return placed;
    });
    expect(resolved.chunks.map((chunk) => chunk.played)).toEqual(played);
    expect(resolved.length).toEqual(start);
  });

  it("resolves virtual_1 to its stated length", () => {
    const virtual = resolveVirtualTimeline(sonata, "virtual_1");
    expect(virtual.kind).toBe("flow_map");
    expect([virtual.map, virtual.source, virtual.unit, virtual.numberType]).toEqual([
      "flow_map_1",
      "score",
      "quarters",
      "fraction",
    ]);
    expect(virtual.length).toEqual(q(36));
    const stated = sonata.virtual_timelines?.[0]?.length;
    expect(virtual.length).toEqual(axisCoordinate(stated, QUARTERS));
  });

  it("reads the Encore order of flow_map_by_hand, its gap included", () => {
    const resolved = resolveFlowMap(load("flow/flow_map_by_hand.yaml"), "flow_map_1");
    expect(resolved.chunks).toEqual([
      {
        kind: "timeline",
        index: 0,
        source: "second",
        written: span(q(8), q(20)),
        played: span(q(0), q(12)),
      },
      { kind: "gap", index: 1, source: null, written: null, played: span(q(12), q(16)) },
      {
        kind: "timeline",
        index: 2,
        source: "first",
        written: span(q(0), q(8)),
        played: span(q(16), q(24)),
      },
    ]);
    expect(resolved.length).toEqual(q(24));
    expect([12, 14].map((y) => fold(resolved, q(y)))).toEqual([null, null]);
    expect(fold(resolved, q(0))).toEqual(q(8));
    expect(fold(resolved, q(16))).toEqual(q(0));
    expect(unfold(resolved, q(8))).toEqual([{ played: q(0), occurrence: 1, of: 1, chunk: 0 }]);
    expect(unfold(resolved, q(0))).toEqual([{ played: q(16), occurrence: 1, of: 1, chunk: 2 }]);
  });
});

describe("children and descendants", () => {
  it("carries a child of ossia to the root", () => {
    const manifest = changedFixture("flow/ossia.yaml", (value) => {
      const root = listOf(value, "timelines")[0] as JsonObject;
      listOf(root, "regions").push(
        { id: "section_A", start: [0, 1], end: [4, 1] },
        { id: "section_B", start: [4, 1], end: [12, 1] },
        { id: "section_C", start: [12, 1], end: [16, 1] },
      );
      listOf(value, "flow_maps").push({
        id: "printed",
        timeline: "score",
        chunks: ["section_A", "section_B", "section_C", "ossia"],
      });
    });
    const resolved = resolveFlowMap(manifest, "printed");
    expect(resolved.chunks[3]).toEqual({
      kind: "timeline",
      index: 3,
      source: "ossia",
      written: span(q(16), q(24)),
      played: span(q(16), q(24)),
    });
  });

  it("adds offsets level by level", () => {
    const manifest = changedFixture("nested.yaml", (value) => {
      const root = listOf(value, "timelines")[0] as JsonObject;
      const middle = listOf(root, "children")[0] as JsonObject;
      const deep = listOf(middle, "children")[0] as JsonObject;
      listOf(deep, "regions").push({ id: "deep", start: [1, 2], end: [1, 1] });
      listOf(value, "flow_maps").push({
        id: "down",
        timeline: "clt_1",
        chunks: ["clt_2", "deep", "clt_3"],
      });
    });
    const resolved = resolveFlowMap(manifest, "down");
    expect(resolved.chunks.map((chunk) => [chunk.kind, chunk.written, chunk.played])).toEqual([
      ["timeline", span(q(11, 2), q(15, 2)), span(q(0), q(2))],
      ["region", span(q(6), q(13, 2)), span(q(2), q(5, 2))],
      ["timeline", span(q(4), q(12)), span(q(5, 2), q(21, 2))],
    ]);
  });
});

describe("a virtual timeline chunk", () => {
  const manifest = changedFixture("flow/sonata_exposition.yaml", (value) => {
    listOf(value, "flow_maps").push({
      id: "twice",
      timeline: "score",
      chunks: ["virtual_1", "region_2"],
    });
  });
  const resolved = resolveFlowMap(manifest, "twice");

  it("plays the stretches of the FlowMap it applies", () => {
    expect(resolved.chunks).toEqual([
      {
        kind: "virtual",
        index: 0,
        source: "virtual_1",
        written: span(q(0), q(36)),
        played: span(q(0), q(36)),
      },
      {
        kind: "region",
        index: 1,
        source: "region_2",
        written: span(q(12), q(16)),
        played: span(q(36), q(40)),
      },
    ]);
    expect(resolved.stretches.map((stretch) => [stretch.written, stretch.chunk])).toEqual([
      [span(q(0), q(12)), 0],
      [span(q(12), q(16)), 0],
      [span(q(0), q(12)), 0],
      [span(q(16), q(24)), 0],
      [span(q(12), q(16)), 1],
    ]);
    expect(resolved.length).toEqual(q(40));
  });

  it("unfolds and folds through it", () => {
    expect(unfold(resolved, q(13))).toEqual([
      { played: q(13), occurrence: 1, of: 2, chunk: 0 },
      { played: q(37), occurrence: 2, of: 2, chunk: 1 },
    ]);
    expect(unfold(resolved, q(2)).map((item) => item.played)).toEqual([q(2), q(18)]);
    expect(fold(resolved, q(20))).toEqual(q(4));
    expect(fold(resolved, q(37))).toEqual(q(13));
  });
});

describe("the root itself as a chunk", () => {
  const byHand = load("flow/flow_map_by_hand.yaml");
  const withChunks = (chunks: readonly string[], first = byHand.timelines[0]?.children[0]) => {
    const [root] = byHand.timelines;
    const [flowMap] = byHand.flow_maps ?? [];
    if (root === undefined || flowMap === undefined || first === undefined) {
      throw new Error("missing");
    }
    return {
      ...byHand,
      timelines: [{ ...root, children: [first, ...root.children.slice(1)] }],
      flow_maps: [{ ...flowMap, chunks }],
    };
  };

  it("is refused, as the validators and timetoalign refuse it", () => {
    expect(refusal(() => resolveFlowMap(withChunks(["set"]), "flow_map_1"))).toEqual({
      code: "flow_map_chunk",
      path: ["flow_maps", 0, "chunks", 0],
    });
    expect(refusal(() => resolveFlowMap(withChunks(["first", "set"]), "flow_map_1"))).toEqual({
      code: "flow_map_chunk",
      path: ["flow_maps", 0, "chunks", 1],
    });
  });

  it("leaves a child of unknown length refused", () => {
    const first = byHand.timelines[0]?.children[0];
    if (first === undefined) throw new Error("first");
    const open = withChunks(["second", "first"], { ...first, length: null });
    expect(refusal(() => resolveFlowMap(open, "flow_map_1"))).toEqual({
      code: "unknown_length",
      path: ["flow_maps", 0, "chunks", 1],
    });
  });

  it("refuses a chunk naming nothing in the tree", () => {
    expect(refusal(() => resolveFlowMap(withChunks(["first", "nothing"]), "flow_map_1"))).toEqual({
      code: "flow_map_chunk",
      path: ["flow_maps", 0, "chunks", 1],
    });
  });
});

describe("a FlowMap with a run and a gap", () => {
  // flow/virtual_cards' by_hand ("Practice"): A four times, a gap of 4, C. Every value below is
  // timetoalign's (`FlowMap.resolve` on the fixture's root `allegro`), see the README.
  const manifest = load("flow/virtual_cards.yaml");
  const A = span(q(0), q(953, 2));
  const C = span(q(500), q(1644));
  const resolved = resolveFlowMap(manifest, "by_hand");

  it("places its stretches as timetoalign does", () => {
    expect(resolved.stretches).toEqual([
      { written: A, played: span(q(0), q(953, 2)), chunk: 0 },
      { written: A, played: span(q(953, 2), q(953)), chunk: 1 },
      { written: A, played: span(q(953), q(2859, 2)), chunk: 2 },
      { written: A, played: span(q(2859, 2), q(1906)), chunk: 3 },
      { written: null, played: span(q(1906), q(1910)), chunk: 4 },
      { written: C, played: span(q(1910), q(3054)), chunk: 5 },
    ]);
    expect(resolved.length).toEqual(q(3054));
    expect(resolveVirtualTimeline(manifest, "allegro_by_hand").length).toEqual(q(3054));
  });

  it("forms one run of the four A, the gap and C each alone", () => {
    expect(resolved.runs.map((run) => [run.chunk.index, run.chunk.source, run.count])).toEqual([
      [0, "section_a", 4],
      [4, null, 1],
      [5, "section_c", 1],
    ]);
  });

  it("forms no run of gaps, whatever their lengths", () => {
    const gaps = changedFixture("flow/virtual_cards.yaml", (value) => {
      const flowMap = listOf(value, "flow_maps").find((item) => item.id === "by_hand");
      if (flowMap === undefined) throw new Error("by_hand");
      flowMap.chunks = [{ gap: [4, 1] }, { gap: [4, 1] }, "section_c", "section_c"];
      const virtual = listOf(value, "virtual_timelines").find(
        (item) => item.id === "allegro_by_hand",
      );
      if (virtual === undefined) throw new Error("allegro_by_hand");
      virtual.length = [2296, 1];
    });
    const runs = resolveFlowMap(gaps, "by_hand").runs;
    expect(runs.map((run) => [run.chunk.index, run.chunk.source, run.count])).toEqual([
      [0, null, 1],
      [1, null, 1],
      [2, "section_c", 2],
    ]);
  });
});

describe("a virtual timeline through a group", () => {
  // groups/switched_frame: allegro (quarters, its FlowMaps) and recording (seconds) in the group
  // performance; by_hand applied to recording through performance plays on allegro's axis.
  const through = (length: unknown) =>
    changedFixture("groups/switched_frame.yaml", (value) => {
      listOf(value, "virtual_timelines").push({
        id: "recording_played",
        map: "by_hand",
        timeline: "recording",
        through: "performance",
        unit: "quarters",
        number_type: "fraction",
        length,
      });
    });

  it("takes the axis and length of the FlowMap's own root", () => {
    const resolved = resolveVirtualTimeline(through([3054, 1]), "recording_played");
    expect([resolved.kind, resolved.source, resolved.unit, resolved.numberType]).toEqual([
      "flow_map",
      "allegro",
      "quarters",
      "fraction",
    ]);
    expect(resolved.length).toEqual(q(3054));
  });
});

describe("refusals", () => {
  const sonata = load("flow/sonata_exposition.yaml");
  const byHand = load("flow/flow_map_by_hand.yaml");

  it("refuses unknown IDs", () => {
    expect(refusal(() => resolveFlowMap(sonata, "nothing"))).toEqual({
      code: "unknown_flow_map",
      path: ["flow_maps"],
    });
    expect(refusal(() => resolveVirtualTimeline(sonata, "nothing"))).toEqual({
      code: "unknown_virtual_timeline",
      path: ["virtual_timelines"],
    });
  });

  it("refuses a FlowMap naming a child", () => {
    const [flowMap] = byHand.flow_maps ?? [];
    if (flowMap === undefined) throw new Error("missing");
    const manifest = { ...byHand, flow_maps: [{ ...flowMap, timeline: "first" }] };
    expect(refusal(() => resolveFlowMap(manifest, "flow_map_1"))).toEqual({
      code: "flow_map_timeline",
      path: ["flow_maps", 0, "timeline"],
    });
  });

  it("refuses a gap that is no value of the axis", () => {
    const loop = load("flow/loop.yaml");
    const manifest = {
      ...loop,
      flow_maps: [
        {
          id: "f",
          timeline: "take",
          chunks: [{ gap: [1, 3] as const }],
          canonical: false,
          name: null,
        },
      ],
    };
    expect(refusal(() => resolveFlowMap(manifest, "f"))).toEqual({
      code: "gap_number_type",
      path: ["flow_maps", 0, "chunks", 0, "gap"],
    });
  });

  it("refuses a FlowMap playing itself through a virtual timeline", () => {
    const circle = changedFixture("flow/sonata_exposition.yaml", (value) => {
      const first = listOf(value, "flow_maps").find((item) => item.id === "flow_map_1");
      if (first === undefined) throw new Error("missing");
      first.chunks = ["virtual_1"];
    });
    expect(refusal(() => resolveFlowMap(circle, "flow_map_1"))).toEqual({
      code: "flow_map_cycle",
      path: ["flow_maps", 0, "chunks"],
    });
  });

  it("refuses a virtual timeline applying a FlowMap to another timeline", () => {
    const manifest = changedFixture("flow/flow_map_by_hand.yaml", (value) => {
      listOf(value, "virtual_timelines").push({
        id: "v",
        map: "flow_map_1",
        timeline: "first",
        unit: "quarters",
        number_type: "fraction",
        length: [24, 1],
      });
    });
    expect(refusal(() => resolveVirtualTimeline(manifest, "v"))).toEqual({
      code: "virtual_unresolved",
      path: ["virtual_timelines", 0, "timeline"],
    });
  });

  it("refuses a position on another unit", () => {
    const resolved = resolveFlowMap(sonata, "flow_map_1");
    const seconds: Coordinate = { unit: "seconds", numberType: "float", value: 1 };
    expect(refusal(() => unfold(resolved, seconds))).toEqual({ code: "unit_mismatch", path: [] });
  });
});

describe("a virtual timeline from a conversion map", () => {
  const applying = (
    fixture: string,
    map: string,
    unit: string,
    numberType: string,
    length: unknown,
  ) =>
    changedFixture(fixture, (value) => {
      listOf(value, "virtual_timelines").push({
        id: "mapped",
        map,
        timeline: (listOf(value, "timelines").find((root) =>
          (listOf(root, "conversion_maps") as JsonObject[]).some((item) => item.id === map),
        )?.id ?? "") as string,
        unit,
        number_type: numberType,
        length,
      });
    });

  it("is evaluated through a LinearMap", () => {
    const manifest = applying("bundles/bundle_mixed.yaml", "cmap_2", "seconds", "float", 6.5);
    const virtual = resolveVirtualTimeline(manifest, "mapped");
    const seconds = (value: number): Coordinate => ({
      unit: "seconds",
      numberType: "float",
      value,
    });
    expect([virtual.kind, virtual.source, virtual.length]).toEqual([
      "conversion_map",
      "score",
      seconds(6),
    ]);
    expect(unfoldVirtual(virtual, q(3))).toEqual([
      { played: seconds(1.5), occurrence: 1, of: 1, chunk: null },
    ]);
    expect(foldVirtual(virtual, seconds(1.5))).toEqual(q(3));
  });

  it("is refused where core does not evaluate the map onto its unit", () => {
    const ticks = applying("bundles/bundle_mixed.yaml", "cmap_1", "seconds", "float", 1.5);
    const error = (() => {
      try {
        resolveVirtualTimeline(ticks, "mapped");
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(FlowMapError);
    expect((error as FlowMapError).code).toBe("map_not_evaluated");
    expect((error as FlowMapError).path).toEqual(["virtual_timelines", 0, "map"]);
    expect((error as FlowMapError).message).toContain("'cmap_1'");
    const measures = applying(
      "conversion_maps__maps_quarters.yaml",
      "cmap_3",
      "floating_measures",
      "fraction",
      [4, 1],
    );
    expect(refusal(() => resolveVirtualTimeline(measures, "mapped"))).toEqual({
      code: "map_not_evaluated",
      path: ["virtual_timelines", 0, "map"],
    });
  });
});

describe("properties", () => {
  const sonata = load("flow/sonata_exposition.yaml");
  const REGIONS: Readonly<Record<string, Stretch>> = {
    region_1: span(q(0), q(12)),
    region_2: span(q(12), q(16)),
    region_3: span(q(16), q(24)),
  };
  type Drawn = string | { readonly gap: readonly [number, number] };
  const chunk = fc.oneof(
    fc.constantFrom("region_1", "region_2", "region_3", "virtual_1"),
    fc.integer({ min: 1, max: 8 }).map((k): Drawn => ({ gap: [k, 2] })),
  );
  const resolvedOf = (chunks: readonly Drawn[]): ResolvedFlowMap =>
    resolveFlowMap(
      {
        ...sonata,
        flow_maps: [
          ...(sonata.flow_maps ?? []),
          { id: "drawn", timeline: "score", chunks, canonical: false, name: null },
        ],
      },
      "drawn",
    );
  /** How often a chunk plays the written position `x`: a region once where it covers it, `virtual_1` A twice and B, C once. */
  const timesPlayed = (drawn: Drawn, x: Coordinate): number => {
    if (typeof drawn !== "string") return 0;
    if (drawn === "virtual_1") {
      return compareCoordinates(x, q(12)) < 0 ? 2 : compareCoordinates(x, q(24)) < 0 ? 1 : 0;
    }
    const region = REGIONS[drawn];
    return region !== undefined && covers(region, x) ? 1 : 0;
  };
  const lengthOf = (drawn: Drawn): Coordinate => {
    if (typeof drawn !== "string") return q(drawn.gap[0], drawn.gap[1]);
    if (drawn === "virtual_1") return q(36);
    const region = REGIONS[drawn];
    if (region === undefined) throw new Error("no region");
    return subtractCoordinates(region.end, region.start);
  };

  it("folds every played position of a written one back to it", () => {
    fc.assert(
      fc.property(fc.array(chunk, { minLength: 1, maxLength: 8 }), (chunks) => {
        const resolved = resolvedOf(chunks);
        for (let n = 0; n <= 96; n += 1) {
          const x = q(n, 4);
          const occurrences = unfold(resolved, x);
          const expected = chunks.reduce((sum, drawn) => sum + timesPlayed(drawn, x), 0);
          expect(occurrences.length).toBe(expected);
          for (const occurrence of occurrences)
            expect(fold(resolved, occurrence.played)).toEqual(x);
        }
      }),
      { numRuns: 200, seed: 20261126 },
    );
  });

  it("unfolds the written position of every played one to include it", () => {
    fc.assert(
      fc.property(fc.array(chunk, { minLength: 1, maxLength: 8 }), (chunks) => {
        const resolved = resolvedOf(chunks);
        let start = q(0);
        const placed = chunks.map((drawn) => {
          const end = addCoordinates(start, lengthOf(drawn));
          const stretch = { drawn, stretch: span(start, end) };
          start = end;
          return stretch;
        });
        expect(resolved.length).toEqual(start);
        for (let n = 0; compareCoordinates(q(n, 4), start) < 0; n += 1) {
          const y = q(n, 4);
          const inGap = placed.some(
            ({ drawn, stretch }) => typeof drawn !== "string" && covers(stretch, y),
          );
          const x = fold(resolved, y);
          expect(x === null).toBe(inGap);
          if (x !== null) expect(unfold(resolved, x).map((item) => item.played)).toContainEqual(y);
        }
      }),
      { numRuns: 200, seed: 20261126 },
    );
  });
});
