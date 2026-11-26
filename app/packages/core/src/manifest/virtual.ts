/**
 * Virtual timelines resolved: the statement that a map was applied to a
 * timeline read as an axis of its own, through a FlowMap (`flowmaps.ts`)
 * or through a conversion map core evaluates (`maps/`), as timetoalign's
 * `VirtualTimeline.resolve` reads the first. Every refusal is a
 * `FlowMapError`.
 */

import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import type { MapEvaluator } from "../maps/compile.ts";
import { compileMap } from "../maps/compile.ts";
import { expressAs } from "../maps/express.ts";
import { invert } from "../maps/invert.ts";
import { isMapValue } from "../maps/values.ts";
import type { Coordinate } from "../number/coordinate.ts";
import { axisCoordinate } from "../number/coordinate.ts";
import { realOf } from "../number/real.ts";
import type { Axis, Occurrence, ResolvedFlowMap, Stretch } from "./flowmaps.ts";
import {
  appliedFlowMap,
  FlowMapError,
  fold,
  onAxis,
  positionOn,
  quoted,
  resolveFlowMap,
  unfold,
  virtualIndex,
  ZERO,
} from "./flowmaps.ts";
import type { ConversionMap, Manifest, TimelineManifest } from "./types.ts";

/** What a virtual timeline states of itself and of the map it rests on. */
interface VirtualAxis {
  /** The virtual timeline's ID. */
  readonly id: string;
  /** The ID of the map applied. */
  readonly map: string;
  /** The ID of the timeline it is applied to, as stated. */
  readonly timeline: string;
  /** The group or conversion map that carries the map there, as stated; never evaluated. */
  readonly through: string | null;
  /** The timeline on whose axis written positions lie: the FlowMap's root, or the timeline holding the conversion map. */
  readonly source: string;
  readonly unit: TimeUnit;
  readonly numberType: NumberType;
  /** Its length: the FlowMap's virtual length, or the conversion map's value at its source's length. */
  readonly length: Coordinate;
}

/** A virtual timeline applying a FlowMap. */
export interface FlowVirtualTimeline extends VirtualAxis {
  readonly kind: "flow_map";
  readonly flow: ResolvedFlowMap;
}

/** A virtual timeline applying a conversion map that core evaluates. */
export interface MappedVirtualTimeline extends VirtualAxis {
  readonly kind: "conversion_map";
  readonly evaluator: MapEvaluator;
  /** The source's axis, from 0 to its length, over which the map is inverted. */
  readonly span: Stretch;
}

/** A virtual timeline resolved: through a FlowMap or a conversion map. */
export type ResolvedVirtualTimeline = FlowVirtualTimeline | MappedVirtualTimeline;

/** The conversion map `id` among the top-level maps of every timeline, at any depth, with its holder. */
function conversionMapOf(
  manifest: Manifest,
  id: string,
): { map: ConversionMap; holder: TimelineManifest } | undefined {
  const pending = [...manifest.timelines];
  for (let timeline = pending.pop(); timeline !== undefined; timeline = pending.pop()) {
    const map = timeline.conversion_maps.find((item) => item.id === id);
    if (map !== undefined) return { map, holder: timeline };
    pending.push(...timeline.children);
  }
  return undefined;
}

/**
 * The virtual timeline `virtualId` of `manifest` resolved: its unit and
 * number type as stated, its length, and the map it rests on. A FlowMap is
 * resolved against its root (`resolveFlowMap`); its length is the virtual
 * length written in the stated number type, or, where `through` carries
 * the FlowMap to another timeline, the stated length, the FlowMap's
 * positions staying on its root's axis. A conversion map of a timeline's
 * `conversion_maps` is evaluated by core into the virtual timeline's unit,
 * its length the map's value at the end of the timeline holding it.
 *
 * @throws {FlowMapError} `unknown_virtual_timeline`; as `resolveFlowMap`
 * and `virtual_unresolved` for a FlowMap; `unit_mismatch` where a FlowMap
 * applied without `through` lies on another unit; `map_not_evaluated`,
 * naming the map, where core does not evaluate the conversion map onto the
 * virtual timeline's unit (a measure view, a label, named outputs, another
 * target unit); `unknown_length` where its timeline's length is unknown.
 */
export function resolveVirtualTimeline(
  manifest: Manifest,
  virtualId: string,
): ResolvedVirtualTimeline {
  const index = virtualIndex(manifest, virtualId, ["virtual_timelines"]);
  const virtual = (manifest.virtual_timelines ?? [])[index];
  if (virtual === undefined) throw new RangeError(`no virtual timeline at ${index}`);
  const at = ["virtual_timelines", index];
  const axis: Axis = { unit: virtual.unit, numberType: virtual.number_type };
  const stated = {
    id: virtual.id,
    map: virtual.map,
    timeline: virtual.timeline,
    through: virtual.through ?? null,
    unit: axis.unit,
    numberType: axis.numberType,
  };
  const flowMap = (manifest.flow_maps ?? []).find((item) => item.id === virtual.map);
  if (flowMap !== undefined) {
    if (virtual.through !== undefined) {
      const flow = resolveFlowMap(manifest, flowMap.id);
      const length = axisCoordinate(virtual.length, virtual, [...at, "length"]);
      return { kind: "flow_map", ...stated, source: flow.timeline, length, flow };
    }
    const flow = appliedFlowMap(manifest, virtual, flowMap.timeline, [], at);
    if (flow.unit !== axis.unit) {
      throw new FlowMapError(
        "unit_mismatch",
        `virtual timeline ${quoted(virtual.id)} is in ${axis.unit}; FlowMap ${quoted(flowMap.id)} plays ${quoted(flow.timeline)} in ${flow.unit}`,
        [...at, "unit"],
      );
    }
    return {
      kind: "flow_map",
      ...stated,
      source: flow.timeline,
      length: onAxis(axis, flow.length.value),
      flow,
    };
  }
  const notEvaluated = (why: string) =>
    new FlowMapError(
      "map_not_evaluated",
      `virtual timeline ${quoted(virtual.id)} applies ${quoted(virtual.map)}, ${why}`,
      [...at, "map"],
    );
  const found = conversionMapOf(manifest, virtual.map);
  if (found === undefined) {
    throw notEvaluated("which is neither a FlowMap nor a conversion map of a timeline");
  }
  const { map, holder } = found;
  const evaluator = compileMap(map);
  if (evaluator.missingKnots || evaluator.targetUnit !== axis.unit) {
    throw notEvaluated(
      `a ${map.type} giving ${evaluator.targetUnit ?? "no unit"}, which core does not evaluate onto ${axis.unit}`,
    );
  }
  if (holder.length === null) {
    throw new FlowMapError(
      "unknown_length",
      `virtual timeline ${quoted(virtual.id)} applies ${quoted(map.id)} of ${quoted(holder.id)}, whose length is unknown`,
      [...at, "map"],
    );
  }
  const source = axisCoordinate(holder.length, holder);
  const end = evaluator.evaluate(source.value);
  if (end === undefined || !isMapValue(end) || expressAs(end, axis.numberType) === undefined) {
    throw notEvaluated(`which gives no ${axis.unit} value at the end of ${quoted(holder.id)}`);
  }
  return {
    kind: "conversion_map",
    ...stated,
    source: holder.id,
    length: onAxis(axis, end),
    evaluator,
    span: { start: onAxis(source, ZERO), end: source },
  };
}

/**
 * Every position of a virtual timeline played at the written position
 * `written` of its source (`source`): through a FlowMap as `unfold`;
 * through a conversion map the map's one value there, or none where it
 * gives no number.
 *
 * @throws {FlowMapError} `unit_mismatch` where `written` is on another unit.
 */
export function unfoldVirtual(
  resolved: ResolvedVirtualTimeline,
  written: Coordinate,
): Occurrence[] {
  if (resolved.kind === "flow_map") return unfold(resolved.flow, written);
  const x = positionOn(resolved.span.end, written, `axis of ${quoted(resolved.source)}`);
  const value = resolved.evaluator.evaluate(x.value);
  if (value === undefined || !isMapValue(value)) return [];
  const played = expressAs(value, resolved.numberType);
  if (played === undefined) return [];
  return [
    {
      played: { unit: resolved.unit, numberType: resolved.numberType, value: played },
      occurrence: 1,
      of: 1,
      chunk: null,
    },
  ];
}

/**
 * The written position of its source played at `played` on a virtual
 * timeline: through a FlowMap as `fold` (null inside a gap); through a
 * conversion map the position where the map gives `played`, read over the
 * source's axis, null where the map is not invertible there or never gives
 * it.
 *
 * @throws {FlowMapError} as `fold` through a FlowMap; `unit_mismatch`.
 */
export function foldVirtual(
  resolved: ResolvedVirtualTimeline,
  played: Coordinate,
): Coordinate | null {
  if (resolved.kind === "flow_map") return fold(resolved.flow, played);
  const y = positionOn(resolved, played, `axis of ${quoted(resolved.id)}`);
  const x = invert(resolved.evaluator.map, y.value, {
    span: { start: realOf(resolved.span.start), end: realOf(resolved.span.end) },
  });
  return x === null ? null : onAxis(resolved.span.end, x);
}
