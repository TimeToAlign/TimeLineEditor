/**
 * Commands generated against a current view.
 *
 * A seed (a command kind and a few natural numbers) becomes a concrete
 * command once the view is known, so a sequence of seeds stays valid input
 * whatever the earlier commands did. Targets are drawn from what the view
 * holds plus unknown and malformed addresses; properties from the target's
 * table, another kind's table and unknown names; own-axis values on the
 * axis, off it (a coordinate dict, another number type's representation,
 * past int64), negative and past the end, and lengths of null; payloads
 * include ones the schema refuses. Every refusal the commands produce on
 * these targets is reachable.
 */

import { JsonFloat } from "@timetoalign/timeskeleton";
import fc from "fast-check";
import type { AxisValue, Manifest, TimelineManifest, View } from "../src/index.ts";
import { elementAddress } from "../src/index.ts";

export interface Seed {
  readonly kind: number;
  readonly picks: readonly number[];
}

const KINDS = 11;

export const seedArbitrary: fc.Arbitrary<Seed> = fc.record({
  kind: fc.nat({ max: KINDS - 1 }),
  picks: fc.array(fc.nat({ max: 1_000_000 }), { minLength: 8, maxLength: 8 }),
});

export const sequenceArbitrary = fc.array(seedArbitrary, { maxLength: 30, size: "max" });

const pick = <T>(items: readonly T[], n: number): T => items[n % items.length] as T;

interface Place {
  readonly timeline: TimelineManifest;
  readonly parent: TimelineManifest | undefined;
  /** The root qualifying the addresses of its other elements. */
  readonly root: string;
}

/** Every timeline of every root of a manifest. */
function places(manifest: Manifest): Place[] {
  const found: Place[] = [];
  const walk = (timeline: TimelineManifest, parent: TimelineManifest | undefined, root: string) => {
    found.push({ timeline, parent, root });
    for (const child of timeline.children) walk(child, timeline, root);
  };
  for (const root of manifest.timelines) walk(root, undefined, root.id);
  return found;
}

/** Axes a timeline may be created on: unit, number type. */
const AXES = [
  ["quarters", "fraction"],
  ["quarters", "float"],
  ["number", "int"],
  ["ticks", "int"],
  ["seconds", "float"],
  ["samples", "int"],
  ["points", "fraction"],
  ["pixels", "int"],
] as const;

type Axis = Pick<TimelineManifest, "unit" | "number_type" | "length">;

/** An approximate size of an axis, to draw values around its length (8 when it is not known). */
function span(axis: Axis): number {
  const value: AxisValue = axis.length ?? 8;
  const size = Array.isArray(value)
    ? Number(value[0]) / Number(value[1])
    : Number(value instanceof JsonFloat ? value.value : value);
  return Math.min(Math.floor(size), 1_000_000) + 6;
}

/** A bare value for `axis`, mostly on it, sometimes a dict, another representation or too large. */
function coordinate(
  axis: Pick<Axis, "unit" | "number_type"> & Partial<Axis>,
  a: number,
  b: number,
): unknown {
  const variant = a % 12;
  const n = (b % span({ length: null, ...axis })) - 2;
  if (variant === 0) return { unit: axis.unit, number_type: axis.number_type, value: n };
  if (variant === 1) return axis.number_type === "fraction" ? n + 0.5 : [n, 1];
  if (variant === 2) {
    const huge = 2n ** 63n;
    return axis.number_type === "fraction" ? [huge, 1n] : axis.number_type === "int" ? huge : 1;
  }
  if (axis.number_type === "int") return BigInt(n);
  if (axis.number_type === "float") return b % 2 === 0 ? new JsonFloat(n) : n + 0.5;
  const denominator = 1 + (a % 3);
  return [n * denominator + (b % denominator), denominator];
}

function newTimeline(id: string, picks: readonly number[], like: Axis | undefined): object {
  const [a = 0, b = 0, c = 0] = picks;
  let axis: readonly [string, string];
  if (a % 6 === 0) {
    // A random number type on the parent's unit, or on a random one.
    const unit = like !== undefined && c % 2 === 0 ? like.unit : pick(AXES, c)[0];
    axis = [unit, pick(["int", "float", "fraction"], a)];
  } else if (like !== undefined && a % 6 > 1) {
    const match = AXES.find(
      ([unit, numberType]) => unit === like.unit && numberType === like.number_type,
    );
    axis = match ?? pick(AXES, b);
  } else {
    axis = pick(AXES, b);
  }
  const [unit, numberType] = axis;
  const length =
    c % 13 === 0
      ? null
      : coordinate(
          { unit, number_type: numberType, length: 4n } as Axis,
          a % 12 < 3 ? a : 3 + (c % 9),
          c,
        );
  // Mostly the minimal form, sometimes defaults written out.
  return {
    id,
    ...(c % 3 === 0 ? {} : { name: `T${c}` }),
    unit,
    number_type: numberType,
    length,
    locked: c % 11 !== 0,
    ...(c % 2 === 0 ? { meta: {}, children: [], is_segment_line: false } : {}),
  };
}

function conversionMap(id: string, axis: Axis, picks: readonly number[]): object {
  const [a = 0, b = 0, c = 0] = picks;
  const map = {
    type: "LinearMap",
    id,
    name: null,
    source_unit: pick([axis.unit, null, axis.unit === "seconds" ? "quarters" : "seconds"], a),
    target_unit: null,
    scalar: [1 + (b % 3), 2],
    offset: b % 2 === 0 ? 0.5 : 0n,
  };
  if (c % 9 === 0) {
    const { scalar: _, ...withoutScalar } = map;
    return withoutScalar;
  }
  return map;
}

/** A region, break, jump or marker on `axis`, sometimes off it or malformed. */
function flowElement(
  kind: string,
  id: string,
  axis: Axis,
  picks: readonly number[],
  markers: readonly string[],
): object {
  const [a = 0, b = 0, c = 0, d = 0] = picks;
  const common = {
    control_type:
      c % 9 === 0 ? "nonsense" : pick(["fine", "section_break", "segno", "repeat_end"], c),
    condition: pick(["always", "first_n", "after_first", "after_dc_ds"], d),
    repeat_count: 1 + (d % 2),
    label: d % 2 === 0 ? null : "L",
    meta: {},
  };
  const at = coordinate(axis, a, b);
  if (kind === "region") {
    return {
      id,
      name: c % 2 === 0 ? null : "R",
      start: at,
      end: coordinate(axis, 3 + (d % 9), c),
      meta: {},
    };
  }
  if (kind === "marker") return { id, name: null, coordinate: at };
  if (kind === "break") return { id, coordinate: at, ...common, name: null };
  return {
    id,
    from_coordinate: at,
    to_coordinate: coordinate(axis, 3 + (d % 9), c),
    ...common,
    target: pick([null, ...markers, "nothing"], b),
  };
}

/** A canvas number: mostly a plain one, sometimes zero, negative, not finite or not a number. */
function canvas(n: number): unknown {
  return pick([n % 640, 0.5 + (n % 7), 0, -(n % 9) - 1, Number.NaN, "1", null], Math.floor(n / 7));
}

/** The concrete command a seed stands for in `view`, whose blocks are `blocks`. */
export function commandFor(view: View, blocks: readonly string[], seed: Seed): object {
  const [p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0, p7 = 0] = seed.picks;
  const block = pick([...blocks, ...blocks, ...blocks, "0000000009"], p0);
  const manifest = view.blocks[block]?.manifest;
  const all = manifest === undefined ? [] : places(manifest);
  // Maps as [address within the block, id]; the other elements by address.
  const maps = all.flatMap((place) =>
    place.timeline.conversion_maps.map((map) => [elementAddress(place.root, map.id), map.id]),
  );
  const mapIds = maps.map(([, mapId]) => mapId as string);
  const elements = all.flatMap(({ timeline, root }) =>
    [
      timeline.regions,
      timeline.flow_control.breaks,
      timeline.flow_control.jumps,
      timeline.flow_control.markers,
    ].flatMap((list) => list.map((item) => elementAddress(root, item.id))),
  );
  const markers = all.flatMap(({ timeline }) =>
    timeline.flow_control.markers.map((marker) => marker.id),
  );
  const known = all.map((place) => place.timeline.id);
  const groups = manifest?.groups.map((group) => group.id) ?? [];
  const ids = [...known, ...known, ...known, "ghost"];
  const id = pick(ids, p1);
  const place = all.find((item) => item.timeline.id === id);
  const axis: Axis = place?.timeline ?? {
    unit: "quarters",
    number_type: "fraction",
    length: [8n, 1n],
  };
  const element = `${block}/${id}`;
  const set = (target: string, properties: object) => ({
    type: "set",
    changes: [{ target, values: properties }],
  });
  switch (seed.kind) {
    case 0: {
      const property = pick(["name", "length", "locked", "meta", "offset", "offset"], p2);
      const value =
        property === "name"
          ? pick([null, `name ${p3 % 5}`, 3], p3)
          : property === "length"
            ? p5 % 7 === 0
              ? null
              : coordinate(axis, p3, p4)
            : property === "locked"
              ? pick([true, false, "yes"], p3)
              : property === "meta"
                ? pick([{ k: BigInt(p3 % 3) }, [], { k: Number.NaN }], p3)
                : coordinate(place?.parent ?? axis, p3, p4);
      return set(element, { [property]: value });
    }
    case 1: {
      const property = pick(
        ["x", "y", "scale", "length", "spacing", "width", "height", "order", "index", "index"],
        p2,
      );
      const value =
        property === "order"
          ? pick(
              [
                ["flow", "regions", "children"],
                ["children", "children", "flow"],
              ],
              p3,
            )
          : property === "index"
            ? pick([...Object.values(view.blocks).map((item) => item.index), "Zz", "a00"], p3)
            : canvas(p3);
      return set(block, { [property]: value });
    }
    case 2: {
      const member = pick(["grid", "blockDefaults", "graphical"], p2);
      const value =
        member === "grid"
          ? pick([{ size: canvas(p3) }, { snap: p3 % 2 === 0 }, { colour: 1 }], p4)
          : member === "blockDefaults"
            ? pick([{ length: canvas(p3) }, { order: ["regions", "flow", "children"] }], p4)
            : pick([{}, { statements: [{ select: {}, set: { stroke: "red" } }] }], p4);
      return set("workspace", { [member]: value });
    }
    case 3: {
      const fresh = `c${p2 % 7}`;
      const child = newTimeline(
        pick([fresh, fresh, fresh, ...known], p3),
        seed.picks.slice(4),
        axis,
      );
      return {
        type: "add",
        into: pick([element, element, element, element, block, "workspace"], p7 >> 4),
        child: { ...child, offset: coordinate(axis, p7, p2 * 7 + p3) },
      };
    }
    case 4:
      return {
        type: "add",
        into: pick([element, element, element, "workspace"], p6),
        map: conversionMap(pick([`m${p2 % 5}`, ...ids, ...mapIds], p3), axis, seed.picks.slice(4)),
      };
    case 5: {
      const targets = [
        ...ids.map((item) => `${block}/${item}`),
        ...groups.map((item) => `${block}/${item}`),
        ...maps.map(([address]) => `${block}/${address}`),
        ...elements.map((item) => `${block}/${item}`),
        "workspace",
        blocks[1] ?? block,
      ];
      return {
        type: "remove",
        targets: [pick(targets, p2), ...(p3 % 4 === 0 ? [pick(targets, p4)] : [])],
      };
    }
    case 6: {
      const select = pick(
        [{ element: "map" }, { element: "timeline" }, { within: id }, { ids: [id] }, {}],
        p2,
      );
      const value = pick(
        [{ stroke: "#C00000" }, { stroke: null }, { "stroke-width": 2 }, { opacity: 2 }],
        p3,
      );
      return {
        type: "style",
        select,
        set: value,
        ...(p4 % 3 === 0 ? { name: pick(["a", "b"], p5) } : {}),
        ...(p4 % 5 === 0 ? { blocks: [block] } : {}),
      };
    }
    case 7: {
      const [address, mapId] = pick([...maps, ["ghost", "ghost"]], p2) as [string, string];
      const payload = conversionMap(pick([mapId, mapId, "other"], p3), axis, seed.picks.slice(4));
      return set(`${block}/${address}`, { map: payload });
    }
    case 9: {
      const kind = pick(["region", "break", "jump", "marker"], p2);
      return {
        type: "add",
        into: pick([element, element, element, "workspace"], p7 >> 4),
        [kind]: flowElement(
          kind,
          pick([`e${p3 % 5}`, ...ids, "a/b"], p3),
          axis,
          seed.picks.slice(4),
          markers,
        ),
      };
    }
    case 10: {
      const target = pick([...elements, "ghost"], p2);
      const property = pick(
        [
          "name",
          "start",
          "end",
          "coordinate",
          "from_coordinate",
          "label",
          "control_type",
          "meta",
          "target",
        ],
        p3,
      );
      const value =
        property.includes("coordinate") || property === "start" || property === "end"
          ? coordinate(axis, p4, p5)
          : property === "meta"
            ? { k: 1 }
            : property === "target"
              ? pick([null, ...markers, "nothing"], p4)
              : pick(["x", null, "nonsense", 3], p4);
      return set(`${block}/${target}`, { [property]: value });
    }
    default:
      return set(pick([element, block, "workspace", "short", `${block}/`], p2), {
        [pick(["id", "colour", "x", "grid", "offset", "map"], p3)]: 1,
      });
  }
}
