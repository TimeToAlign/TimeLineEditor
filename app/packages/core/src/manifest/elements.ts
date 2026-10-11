/**
 * The drawn elements of a manifest and the selector test over them
 * (`docs/drawing.md` in timeskeleton, sections 2.1 to 2.3): what a `graphical`
 * statement can select, for the cascade and for the `style` command alike.
 */

import type { ElementType, Selector, TimeUnit } from "@timetoalign/timeskeleton";
import { canonicalOrder } from "@timetoalign/timeskeleton";
import { compareCodePoints } from "../json.ts";
import { coordinateFromDict } from "../number/coordinate.ts";
import { compareReal, realOf } from "../number/real.ts";
import type { ChildEntry, ConversionMap, Manifest, TimelineManifest } from "./types.ts";

export type Domain = "graphical" | "logical" | "physical";
export type Modality = "continuous" | "discrete";

/** What a selector can test on an element. */
export interface ElementKey {
  readonly type: ElementType;
  /** `null` for the block. */
  readonly address: string | null;
  /** The timeline it belongs to; `null` for the block. */
  readonly timeline: string | null;
  readonly domain: Domain | null;
  readonly modality: Modality | null;
  readonly class: string | null;
}

/** The block's key: it belongs to no timeline and has no address. */
export const BLOCK_KEY: ElementKey = {
  type: "block",
  address: null,
  timeline: null,
  domain: null,
  modality: null,
  class: null,
};

const UNIT_DOMAINS: Readonly<Partial<Record<TimeUnit, readonly [Domain, Modality]>>> = {
  floating_measures: ["logical", "continuous"],
  whole_note: ["logical", "continuous"],
  quarters: ["logical", "continuous"],
  ticks: ["logical", "discrete"],
  milliseconds: ["physical", "continuous"],
  seconds: ["physical", "continuous"],
  minutes: ["physical", "continuous"],
  samples: ["physical", "discrete"],
  frames: ["physical", "discrete"],
  pixels: ["graphical", "discrete"],
  meters: ["graphical", "continuous"],
  centimeters: ["graphical", "continuous"],
  millimeters: ["graphical", "continuous"],
  inches: ["graphical", "continuous"],
  points: ["graphical", "continuous"],
};

/** The domain and modality of a map's `target_unit`, or `null` for none. */
export function unitDomain(unit: string | null | undefined): readonly [Domain, Modality] | null {
  if (unit === null || unit === undefined || !Object.hasOwn(UNIT_DOMAINS, unit)) return null;
  return UNIT_DOMAINS[unit as TimeUnit] ?? null;
}

/** The domain and modality of a timeline class. */
export function classDomain(name: string): readonly [Domain, Modality] {
  const domain: Domain = name.includes("Graphical")
    ? "graphical"
    : name.includes("Physical")
      ? "physical"
      : "logical";
  return [domain, name.startsWith("Discrete") ? "discrete" : "continuous"];
}

/** The key of an element of `timeline`, or of its conversion map `map`. */
export function elementKey(
  type: ElementType,
  address: string,
  timeline: TimelineManifest,
  map?: ConversionMap,
): ElementKey {
  const [domain, modality] =
    map === undefined
      ? classDomain(timeline.class)
      : (unitDomain(map.target_unit as string | null) ?? [null, null]);
  return {
    type,
    address,
    timeline: timeline.id,
    domain,
    modality,
    class: map === undefined ? timeline.class : map.type,
  };
}

/** The key of an element's own text, `name` or `label`. */
export function textKey(owner: ElementKey, type: "name" | "label"): ElementKey {
  return { ...owner, type, address: `${owner.address}/${type}` };
}

/** Every timeline id mapped to the ids from the root down to it. */
export function timelineAncestry(manifest: Manifest): Map<string, readonly string[]> {
  const ancestry = new Map<string, readonly string[]>();
  const collect = (timeline: TimelineManifest, path: readonly string[]) => {
    const own = [...path, timeline.id];
    ancestry.set(timeline.id, own);
    for (const child of Object.values(timeline.children)) collect(child.timeline, own);
  };
  collect(manifest.timeline, []);
  return ancestry;
}

/** Whether an element matches every member present in a selector. */
export function selectorMatches(
  select: Selector,
  element: ElementKey,
  ancestry: ReadonlyMap<string, readonly string[]>,
): boolean {
  if (select.element !== undefined && select.element !== element.type) return false;
  if (select.ids !== undefined) {
    if (element.address === null || !select.ids.includes(element.address)) return false;
  }
  if (select.domain !== undefined && select.domain !== element.domain) return false;
  if (select.modality !== undefined && select.modality !== element.modality) return false;
  if (select.class !== undefined && select.class !== element.class) return false;
  if (select.within !== undefined) {
    if (element.timeline === null) return false;
    if (!(ancestry.get(element.timeline) ?? []).includes(select.within)) return false;
  }
  return true;
}

/** A timeline's children by offset, then id in code-point order, whatever their keys' order. */
export function orderedChildren(timeline: TimelineManifest): ChildEntry[] {
  return Object.values(timeline.children).sort(
    (left, right) =>
      compareReal(
        realOf(coordinateFromDict(left.offset)),
        realOf(coordinateFromDict(right.offset)),
      ) || compareCodePoints(left.timeline.id, right.timeline.id),
  );
}

/**
 * Every element of a manifest's drawing: the block, then per timeline in
 * pre-order, children by offset then id, its line, its name, its maps, its regions, breaks and
 * jumps each followed by its label, and after the root's own elements its
 * two wedges with their labels.
 */
export function manifestElements(manifest: Manifest): ElementKey[] {
  const ordered = canonicalOrder(manifest as never) as unknown as Manifest;
  const keys: ElementKey[] = [BLOCK_KEY];
  const visit = (timeline: TimelineManifest, root: boolean) => {
    const line = elementKey(root ? "timeline" : "child", timeline.id, timeline);
    keys.push(line, textKey(line, "name"));
    for (const map of timeline.conversion_maps) {
      keys.push(elementKey("map", map.id, timeline, map));
    }
    const labelled = (type: ElementType, address: string) => {
      const key = elementKey(type, address, timeline);
      keys.push(key, textKey(key, "label"));
    };
    const { breaks, jumps } = timeline.flow_control;
    for (const [type, entries] of [
      ["region", timeline.regions],
      ["break", breaks],
      ["jump", jumps],
    ] as const) {
      for (const entry of entries) labelled(type, entry.id);
    }
    if (root) {
      labelled("wedge", `${timeline.id}/start`);
      labelled("wedge", `${timeline.id}/end`);
    }
    for (const child of orderedChildren(timeline)) visit(child.timeline, false);
  };
  visit(ordered.timeline, true);
  return keys;
}
