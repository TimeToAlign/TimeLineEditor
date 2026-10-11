/**
 * Manifest commands generated against a current manifest.
 *
 * A seed (a command kind and a few natural numbers) becomes a concrete
 * command once the manifest is known, so a sequence of seeds stays valid
 * input whatever the earlier commands did. Addresses are drawn from what the
 * manifest holds plus unknown ones; coordinates on the axis, off it (another
 * unit, another number type, past int64), negative and past the end;
 * payloads include ones the schema refuses. Every refusal a reducer can
 * produce is reachable.
 */

import { JsonFloat } from "@timetoalign/timeskeleton";
import fc from "fast-check";
import type { Manifest, TimelineManifest } from "../src/index.ts";
import { MANIFEST_COMMAND_TYPES } from "../src/index.ts";

export interface Seed {
  readonly kind: number;
  readonly picks: readonly number[];
}

export const seedArbitrary: fc.Arbitrary<Seed> = fc.record({
  kind: fc.nat({ max: MANIFEST_COMMAND_TYPES.length - 1 }),
  picks: fc.array(fc.nat({ max: 1_000_000 }), { minLength: 8, maxLength: 8 }),
});

export const sequenceArbitrary = fc.array(seedArbitrary, { maxLength: 50, size: "max" });

const pick = <T>(items: readonly T[], n: number): T => items[n % items.length] as T;

interface Place {
  readonly timeline: TimelineManifest;
  readonly parent: TimelineManifest | undefined;
}

function places(manifest: Manifest): Place[] {
  const found: Place[] = [];
  const walk = (timeline: TimelineManifest, parent: TimelineManifest | undefined) => {
    found.push({ timeline, parent });
    for (const entry of Object.values(timeline.children)) walk(entry.timeline, timeline);
  };
  walk(manifest.timeline, undefined);
  return found;
}

/** Axes a timeline may be created on: class, unit, number type. */
const AXES = [
  ["ContinuousLogicalTimeline", "quarters", "fraction"],
  ["ContinuousLogicalTimeline", "quarters", "float"],
  ["ContinuousLogicalTimeline", "number", "int"],
  ["DiscreteLogicalTimeline", "ticks", "int"],
  ["ContinuousPhysicalTimeline", "seconds", "float"],
  ["DiscretePhysicalTimeline", "samples", "int"],
  ["ContinuousGraphicalTimeline", "points", "fraction"],
  ["DiscreteGraphicalTimeline", "pixels", "int"],
] as const;

type Axis = Pick<TimelineManifest, "unit" | "number_type" | "length">;

/** An approximate size of an axis, to draw values around its length. */
function span(axis: Axis): number {
  const { value } = axis.length;
  const size = Array.isArray(value)
    ? Number(value[0]) / Number(value[1])
    : Number(value instanceof JsonFloat ? value.value : value);
  return Math.min(Math.floor(size), 1_000_000) + 6;
}

/** A coordinate dict for `axis`, mostly on it, sometimes off it. */
function coordinate(axis: Axis, a: number, b: number): object {
  const variant = a % 12;
  const n = (b % span(axis)) - 2;
  if (variant === 0) {
    return axis.unit === "seconds"
      ? { unit: "quarters", number_type: "fraction", value: [n, 1] }
      : { unit: "seconds", number_type: "float", value: n + 0.5 };
  }
  if (variant === 1) {
    const other = axis.number_type === "float" ? "fraction" : "float";
    return { unit: axis.unit, number_type: other, value: other === "float" ? n + 0.5 : [n, 1] };
  }
  if (variant === 2) {
    const huge = 2n ** 63n;
    const value =
      axis.number_type === "fraction" ? [huge, 1n] : axis.number_type === "int" ? huge : 1;
    return { unit: axis.unit, number_type: axis.number_type, value };
  }
  if (axis.number_type === "int") return { unit: axis.unit, number_type: "int", value: BigInt(n) };
  if (axis.number_type === "float") {
    return { unit: axis.unit, number_type: "float", value: b % 2 === 0 ? n : n + 0.5 };
  }
  const denominator = 1 + (a % 3);
  return {
    unit: axis.unit,
    number_type: "fraction",
    value: [n * denominator + (b % denominator), denominator],
  };
}

function newTimeline(id: string, picks: readonly number[], like: Axis | undefined): object {
  const [a = 0, b = 0, c = 0] = picks;
  let axis: readonly [string, string, string];
  if (a % 6 === 0) {
    const random = pick(AXES, b);
    axis = [random[0], pick(AXES, c)[1], pick(["int", "float", "fraction"], a)];
  } else if (like !== undefined && a % 6 > 1) {
    const match = AXES.find(
      ([, unit, numberType]) => unit === like.unit && numberType === like.number_type,
    );
    axis = match ?? pick(AXES, b);
  } else {
    axis = pick(AXES, b);
  }
  const [cls, unit, numberType] = axis;
  const length = coordinate(
    { unit, number_type: numberType, length: { unit, number_type: "int", value: 4n } } as Axis,
    a % 12 < 3 ? a : 3 + (c % 9),
    c,
  );
  return {
    id,
    class: cls,
    unit,
    number_type: numberType,
    length,
    name: c % 3 === 0 ? null : `T${c}`,
  };
}

function flowEntry(kind: "break" | "jump", axis: Axis, picks: readonly number[]): object {
  const [a = 0, b = 0, c = 0, d = 0] = picks;
  const common = {
    control_type:
      c % 9 === 0 ? "nonsense" : pick(["fine", "section_break", "segno", "repeat_end"], c),
    condition: pick(["always", "first_n", "after_first", "after_dc_ds"], d),
    repeat_count: 1 + (d % 2),
    label: d % 2 === 0 ? null : "L",
    meta: {},
  };
  if (kind === "break") return { coordinate: coordinate(axis, a, b), ...common, name: null };
  return {
    from_coordinate: coordinate(axis, a, b),
    to_coordinate: coordinate(axis, 3 + (d % 9), c),
    ...common,
    target_name: null,
  };
}

/** The concrete command a seed stands for in `manifest`. */
export function commandFor(manifest: Manifest, seed: Seed): object {
  const type = MANIFEST_COMMAND_TYPES[seed.kind] as (typeof MANIFEST_COMMAND_TYPES)[number];
  const [p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0] = seed.picks;
  const all = places(manifest);
  const ids = [...all.map((place) => place.timeline.id), "ghost"];
  const id = pick(ids, p0);
  const place = all.find((item) => item.timeline.id === id);
  const target: Axis = place?.timeline ?? {
    unit: "quarters",
    number_type: "fraction",
    length: { unit: "quarters", number_type: "fraction", value: [8n, 1n] },
  };
  const regions = [...(place?.timeline.regions.map((region) => region.name) ?? []), "r0", "r1"];
  const markers = [...Object.keys(place?.timeline.flow_control.markers ?? {}), "m0", "m1"];
  const maps = [...(place?.timeline.conversion_maps.map((map) => map.id) ?? []), "map0"];
  switch (type) {
    case "removeChild":
      return { type, id };
    case "setName":
      return { type, id, name: p1 % 3 === 0 ? null : `name ${p1 % 5}` };
    case "setLength":
      return { type, id, length: coordinate(target, p1, p2) };
    case "addChild": {
      const child = newTimeline(`c${p2 % 7}`, seed.picks.slice(3), target);
      return { type, parent: id, offset: coordinate(target, p4, p5), child };
    }
    case "setChildOffset":
      return { type, id, offset: coordinate(place?.parent ?? target, p1, p2) };
    case "addRegion":
    case "setRegion": {
      const name = pick(regions, p1);
      const start = coordinate(target, p2, p3);
      const end = coordinate(target, p4 % 12 < 3 ? p4 : p2 + 3, p3 + (p5 % 5));
      const meta = { k: BigInt(p5 % 3) };
      if (type === "addRegion") return { type, timeline: id, name, start, end, meta };
      const mask = 1 + (p5 % 7);
      return {
        type,
        timeline: id,
        name,
        ...(mask & 1 ? { start } : {}),
        ...(mask & 2 ? { end } : {}),
        ...(mask & 4 ? { meta } : {}),
      };
    }
    case "removeRegion":
      return { type, timeline: id, name: pick(regions, p1) };
    case "addBreak":
    case "removeBreak": {
      const existing = place?.timeline.flow_control.breaks ?? [];
      const entry =
        type === "removeBreak" && existing.length > 0 && p1 % 3 !== 0
          ? pick(existing, p2)
          : flowEntry("break", target, seed.picks.slice(2));
      return { type, timeline: id, break: entry };
    }
    case "addJump":
    case "removeJump": {
      const existing = place?.timeline.flow_control.jumps ?? [];
      const entry =
        type === "removeJump" && existing.length > 0 && p1 % 3 !== 0
          ? pick(existing, p2)
          : flowEntry("jump", target, seed.picks.slice(2));
      return { type, timeline: id, jump: entry };
    }
    case "setMarker":
      return {
        type,
        timeline: id,
        name: pick(markers, p1),
        coordinate: coordinate(target, p2, p3),
      };
    case "removeMarker":
      return { type, timeline: id, name: pick(markers, p1) };
    case "addConversionMap": {
      const sourceUnit = pick(
        [target.unit, null, target.unit === "seconds" ? "quarters" : "seconds"],
        p2,
      );
      const map = {
        type: "LinearMap",
        id: pick(maps, p1),
        name: null,
        source_unit: sourceUnit,
        target_unit: null,
        scalar: [1 + (p3 % 3), 2],
        offset: p3 % 2 === 0 ? 0.5 : 0n,
      };
      if (p4 % 9 === 0) {
        const { scalar: _, ...withoutScalar } = map;
        return { type, timeline: id, map: withoutScalar };
      }
      return { type, timeline: id, map };
    }
    case "removeConversionMap":
      return { type, timeline: id, map_id: pick(maps, p1) };
  }
}
