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
 * include ones the schema refuses; a timeline's new parent and groups are
 * drawn from the manifest's timelines and groups, itself and unknown ids
 * included. Every refusal the commands produce on these targets is
 * reachable.
 *
 * A step of an editing sequence is such a seed with an operation: a
 * command (`commandIn` the innermost open editor), opening an editor
 * (`editorFor`), reopening the latest session, a whole session, an unfold,
 * Done, Cancel, undo or redo (the property test runs them).
 */

import { JsonFloat } from "@timetoalign/timetoshare";
import fc from "fast-check";
import { DEFAULT_BAND_ORDER } from "../src/manifest/order.ts";
import type { AxisValue, Manifest, TimelineManifest } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import type { View } from "../src/workspace/view.ts";

/** The address of the workspace. */
const WORKSPACE: Address = {};

/** The address of the element `id` of the manifest of block `block`. */
const at = (block: string, id: string): Address => ({ block, id });

export interface Seed {
  readonly kind: number;
  readonly picks: readonly number[];
}

const KINDS = 14;

export const seedArbitrary: fc.Arbitrary<Seed> = fc.record({
  kind: fc.nat({ max: KINDS - 1 }),
  picks: fc.array(fc.nat({ max: 1_000_000 }), { minLength: 8, maxLength: 8 }),
});

export const sequenceArbitrary = fc.array(seedArbitrary, { maxLength: 30, size: "max" });

/** What a step of an editing sequence does with its seed. */
export const OPERATIONS = [
  "command",
  "command",
  "command",
  "command",
  "open",
  "session",
  "reopen",
  "unfold",
  "done",
  "done",
  "cancel",
  "undo",
  "undo",
  "redo",
] as const;

export type Operation = (typeof OPERATIONS)[number];

export interface Step {
  readonly operation: Operation;
  readonly seed: Seed;
}

export const stepsArbitrary: fc.Arbitrary<Step[]> = fc.array(
  fc.record({ operation: fc.constantFrom(...OPERATIONS), seed: seedArbitrary }),
  { maxLength: 30, size: "max" },
);

function pick<T>(items: readonly T[], n: number): T {
  const item = items[n % items.length];
  if (item === undefined) throw new Error("pick from a list that holds items");
  return item;
}

/** `items` turned by `n` places: the item at `n` first. */
const turned = <T>(items: readonly T[], n: number): T[] => {
  const turn = items.length === 0 ? 0 : n % items.length;
  return [...items.slice(turn), ...items.slice(0, turn)];
};

/** The default band order turned by `n` places, a band order of any timeline. */
const bandOrder = (n: number): string[] => turned(DEFAULT_BAND_ORDER, n);

interface Place {
  readonly timeline: TimelineManifest;
  readonly parent: TimelineManifest | undefined;
}

/** Every timeline of every root of a manifest. */
function places(manifest: Manifest): Place[] {
  const found: Place[] = [];
  const walk = (timeline: TimelineManifest, parent: TimelineManifest | undefined) => {
    found.push({ timeline, parent });
    for (const child of timeline.children) walk(child, timeline);
  };
  for (const root of manifest.timelines) walk(root, undefined);
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

/** An axis as the generator draws it: any unit and number type, the schema's or not. */
interface DrawnAxis {
  readonly unit: string;
  readonly number_type: string;
  readonly length?: AxisValue | null;
}

/** An approximate size of an axis, to draw values around its length (8 when it is not known). */
function span(axis: DrawnAxis): number {
  const value: AxisValue = axis.length ?? 8;
  const size = Array.isArray(value)
    ? Number(value[0]) / Number(value[1])
    : Number(value instanceof JsonFloat ? value.value : value);
  return Math.min(Math.floor(size), 1_000_000) + 6;
}

/** A bare value for `axis`, mostly on it, sometimes a dict, another representation or too large. */
function coordinate(axis: DrawnAxis, a: number, b: number): unknown {
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
      : coordinate({ unit, number_type: numberType, length: 4n }, a % 12 < 3 ? a : 3 + (c % 9), c);
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

/** A region or flow-control element on `axis`, sometimes off it or malformed. */
function flowElement(
  kind: string,
  id: string,
  axis: Axis,
  picks: readonly number[],
  targets: readonly string[],
): object {
  const [a = 0, b = 0, c = 0, d = 0] = picks;
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
  const type = pick(["jump_from", "jump_to", "flow_marker"], c);
  // A manifestation of the element's type, sometimes another type's or none of them.
  const manifestation = pick(
    [
      { jump_from: "repeat_end", jump_to: "segno", flow_marker: "fine" }[type],
      { jump_from: "dal_segno", jump_to: "coda", flow_marker: "section_break" }[type],
      "da_capo",
      "nonsense",
    ],
    d,
  );
  // Mostly no target, sometimes a jump target of the timeline, sometimes none of them.
  const target = pick(["", "", ...targets, "nothing"], b);
  return {
    id,
    type,
    manifestation,
    coordinate: at,
    ...(target === "" ? {} : { target }),
    ...(d % 3 === 0 ? { repeat_count: 1 + (d % 2) } : {}),
    label: d % 2 === 0 ? null : "L",
    meta: {},
  };
}

/** A canvas number: mostly a plain one, sometimes zero, negative, not finite or not a number. */
function canvas(n: number): unknown {
  return pick([n % 640, 0.5 + (n % 7), 0, -(n % 9) - 1, Number.NaN, "1", null], Math.floor(n / 7));
}

/** The ids of the timelines a group's members or a timeline hold, themselves included. */
function heldBy(manifest: Manifest, element: string): string[] {
  const group = manifest.groups.find((item) => item.id === element);
  const tops = group === undefined ? [element] : group.members;
  const held = places(manifest).filter(
    (place) => tops.includes(place.timeline.id) || place.parent === undefined,
  );
  const ids: string[] = [];
  const walk = (timeline: TimelineManifest, inside: boolean) => {
    const now = inside || tops.includes(timeline.id);
    if (now) ids.push(timeline.id);
    for (const child of timeline.children) walk(child, now);
  };
  for (const place of held) if (place.parent === undefined) walk(place.timeline, false);
  return ids;
}

/**
 * The target of an editor to open in `view`, whose blocks are `blocks`,
 * inside the editor of `within` (`null`: none is open): mostly a group or a
 * timeline that editor holds (any block, group or timeline when none is
 * open), sometimes any of those, what has no editor or what names nothing.
 */
export function editorFor(
  view: View,
  blocks: readonly string[],
  within: Address | null,
  seed: Seed,
): Address {
  const [p0 = 0, p1 = 0, p2 = 0] = seed.picks;
  const inner = within?.block ?? "";
  const element = within?.id;
  const nested = within !== null && p2 % 4 !== 0;
  const block = nested ? inner : pick(blocks, p0);
  const manifest = view.blocks[block]?.manifest;
  if (manifest === undefined || p2 % 8 === 1) {
    return pick<Address>([{ block, part: ["name"] }, at(block, "ghost"), WORKSPACE], p1);
  }
  const all = [
    ...manifest.groups.map((group) => group.id),
    ...places(manifest).map((place) => place.timeline.id),
  ];
  const held =
    nested && element !== undefined
      ? heldBy(manifest, element).filter((id) => id !== element)
      : all;
  const targets = held.map((id) => at(block, id));
  const own: Address = { block };
  return pick(nested || targets.length === 0 ? [...targets, own] : [own, ...targets], p1);
}

/**
 * The command a seed stands for in the editor of `target` (`null`: no
 * editor is open): mostly one that changes only what the editor edits (a
 * name or a band order of a timeline it holds, its place, a group's
 * display order, a member's group length and scale, or the block's width),
 * sometimes any command of `commandFor`. In the bundle editor
 * every command is `commandFor`'s on its block.
 */
export function commandIn(
  view: View,
  blocks: readonly string[],
  target: Address | null,
  seed: Seed,
): object {
  const block = target?.block ?? "";
  const element = target?.id;
  const manifest = view.blocks[block]?.manifest;
  const [, p1 = 0, p2 = 0, p3 = 0, , , , p7 = 0] = seed.picks;
  if (target === null || manifest === undefined || p7 % 4 === 0) {
    return commandFor(view, blocks, seed);
  }
  if (element === undefined) return commandFor(view, [block], seed);
  const held = heldBy(manifest, element);
  const timeline = pick(held.length > 0 ? held : [element], p1);
  const members = manifest.groups.find((group) => group.id === element)?.members ?? [];
  // A member's editor also resizes its group's frame: the length and scale the members share.
  const sharing = manifest.groups.find((group) => group.members.includes(element))?.id;
  const scale = 0.5 + (p3 % 4) / 2;
  const changes = [
    { target: at(block, timeline), values: { name: `N${p3 % 7}` } },
    {
      target: at(block, timeline),
      values: { order: pick([bandOrder(p3), null], p3 >> 3) },
    },
    {
      target: at(block, element),
      values: {
        place: pick(
          [
            { x: (p3 % 64) - 8 },
            { scale },
            { spacing: scale },
            { margin: scale },
            { width: 100 + (p3 % 900) },
          ],
          p1,
        ),
      },
    },
    { target: at(block, element), values: { order: turned(members, p3) } },
    { target: { block }, values: { width: 100 + (p3 % 900) } },
    ...(sharing === undefined
      ? []
      : [{ target: at(block, sharing), values: { place: { length: 100 + (p3 % 400), scale } } }]),
  ];
  return { type: "set", changes: [pick(changes, p2)] };
}

/** The concrete command a seed stands for in `view`, whose blocks are `blocks`. */
export function commandFor(view: View, blocks: readonly string[], seed: Seed): object {
  const [p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0, p7 = 0] = seed.picks;
  const block = pick([...blocks, ...blocks, ...blocks, "0000000009"], p0);
  const manifest = view.blocks[block]?.manifest;
  const all = manifest === undefined ? [] : places(manifest);
  // The IDs of the maps, and of the regions and flow-control elements.
  const mapIds = all.flatMap((place) => place.timeline.conversion_maps.map((map) => map.id));
  const elements = all.flatMap(({ timeline }) =>
    [timeline.regions, timeline.flow_control].flatMap((list) => list.map((item) => item.id)),
  );
  const targets = all.flatMap(({ timeline }) =>
    timeline.flow_control.flatMap((item) => (item.type === "jump_to" ? [item.id] : [])),
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
  const element = at(block, id);
  const own: Address = { block };
  const set = (target: Address, properties: object) => ({
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
        ["x", "y", "scale", "length", "spacing", "margin", "width", "height", "index", "index"],
        p2,
      );
      const value =
        property === "index"
          ? pick([...Object.values(view.blocks).map((item) => item.index), "Zz", "a00"], p3)
          : canvas(p3);
      return set(own, { [property]: value });
    }
    case 2: {
      const member = pick(["grid", "blockDefaults", "graphical"], p2);
      const value =
        member === "grid"
          ? pick([{ size: canvas(p3) }, { snap: p3 % 2 === 0 }, { colour: 1 }], p4)
          : member === "blockDefaults"
            ? pick([{ length: canvas(p3) }, { width: canvas(p3) }], p4)
            : pick([{}, { statements: [{ select: {}, set: { stroke: "red" } }] }], p4);
      return set(WORKSPACE, { [member]: value });
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
        into: pick([element, element, element, element, own, WORKSPACE], p7 >> 4),
        child: { ...child, offset: coordinate(axis, p7, p2 * 7 + p3) },
      };
    }
    case 4:
      return {
        type: "add",
        into: pick([element, element, element, WORKSPACE], p6),
        map: conversionMap(pick([`m${p2 % 5}`, ...ids, ...mapIds], p3), axis, seed.picks.slice(4)),
      };
    case 5: {
      const targets: Address[] = [
        ...[...ids, ...groups, ...mapIds, ...elements].map((item) => at(block, item)),
        WORKSPACE,
        { block: blocks[1] ?? block },
      ];
      return {
        type: "remove",
        targets: [pick(targets, p2), ...(p3 % 4 === 0 ? [pick(targets, p4)] : [])],
      };
    }
    case 6: {
      const select = pick(
        [
          { element: "map" },
          { element: "timeline" },
          { within: id },
          { addresses: [{ id }] },
          { addresses: [{ id, facet: "regions" }] },
          { facet: "markers" },
          { element: "frame" },
          {},
        ],
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
      const mapId = pick([...mapIds, "ghost"], p2);
      const payload = conversionMap(pick([mapId, mapId, "other"], p3), axis, seed.picks.slice(4));
      return set(at(block, mapId), { map: payload });
    }
    case 9: {
      const kind = pick(["region", "flow_control"], p2);
      return {
        type: "add",
        into: pick([element, element, element, WORKSPACE], p7 >> 4),
        [kind]: flowElement(
          kind,
          pick([`e${p3 % 5}`, ...ids, "a\tb"], p3),
          axis,
          seed.picks.slice(4),
          targets,
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
          "label",
          "manifestation",
          "repeat_count",
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
              ? pick([null, ...targets, "nothing"], p4)
              : pick(["x", null, "nonsense", 3], p4);
      return set(at(block, target), { [property]: value });
    }
    case 11: {
      // What a group or timeline states for its drawing: its place and its
      // order, a group's display order or a timeline's band order, valid or not.
      const target = pick([...groups, ...groups, ...known, "ghost", ""], p2);
      const property = pick(["place", "place", "order", "order"], p3);
      const group = manifest?.groups.find((item) => item.id === target);
      const members = group?.members ?? [];
      const bands = bandOrder(p5);
      const value =
        property === "place"
          ? pick(
              [
                { x: canvas(p4) },
                { y: -(p4 % 50), length: 1 + (p4 % 400) },
                { width: canvas(p4), height: 1 + (p4 % 90) },
                { scale: canvas(p4) },
                { spacing: canvas(p4) },
                { margin: canvas(p4) },
                { width: 1 + (p4 % 700) },
                { x: null, length: null },
                {},
                { depth: 1 },
              ],
              p5,
            )
          : group !== undefined
            ? pick([turned(members, p5), turned(members, p5), null, members.slice(1)], p4)
            : pick(
                [
                  bands,
                  bands,
                  null,
                  bands.slice(1),
                  bands.map((entry) => (entry === "regions" ? "region" : entry)),
                  "line",
                ],
                p4,
              );
      return set(target === "" ? own : at(block, target), { [property]: value });
    }
    case 12: {
      // Where a timeline lies: under which parent at which offset, a root, in which group.
      if (p2 % 2 === 0) {
        const host = pick([...ids, id], p3);
        const on = all.find((item) => item.timeline.id === host)?.timeline ?? axis;
        const parent = p4 % 4 === 0 ? null : { timeline: host, offset: coordinate(on, p5, p6) };
        return set(element, { parent });
      }
      const [first = "ghost"] = groups;
      const listed = [groups.length === 0 ? first : pick(groups, p4)];
      const value = pick(
        [listed, listed, groups, [], ["ghost"], [first, first], [3], "group_1"],
        p3,
      );
      return set(element, { groups: value });
    }
    case 13: {
      // A new root timeline or a new group of a block's manifest.
      const into = pick([own, own, own, element, WORKSPACE], p7 >> 4);
      if (p2 % 2 === 0) {
        const root = newTimeline(
          pick([`r${p3 % 5}`, `r${p3 % 5}`, ...ids, ...groups], p3),
          seed.picks.slice(4),
          undefined,
        );
        return { type: "add", into, timeline: root };
      }
      const members = known.length === 0 ? [] : [pick(known, p4), pick(known, p5)].slice(p6 % 2);
      return {
        type: "add",
        into,
        group: {
          id: pick([`g${p3 % 4}`, `g${p3 % 4}`, ...ids], p3),
          members: [...members, ...(p5 % 7 === 0 ? ["ghost"] : [])],
        },
      };
    }
    default: {
      const addresses: Address[] = [
        element,
        own,
        WORKSPACE,
        { block: "short" },
        { block, facet: "regions" },
        { block, id, facet: "regions" },
        { block, id, part: ["card"] },
      ];
      return set(pick(addresses, p2), {
        [pick(["id", "colour", "x", "grid", "offset", "map"], p3)]: 1,
      });
    }
  }
}
