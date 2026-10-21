/**
 * What every command leaves behind it: each manifest it changed with every
 * segment line given its first segment (`withSegmentLinesCovered`), in its
 * complete form and canonical order (an added element may leave out what
 * has a default), checked against the schema and the invariants, and the
 * block's places fitted to the drawing the manifest now makes.
 */

import type { NumberType } from "@timetoalign/timetoshare";
import { numberTypeOf } from "@timetoalign/timetoshare";
import type { CommandError } from "../errors.ts";
import { isLoadError } from "../errors.ts";
import type { Json, JsonObject } from "../json.ts";
import { isJsonObject } from "../json.ts";
import type { ContainerRef } from "../manifest/containers.ts";
import { containersOf, keptPlace } from "../manifest/containers.ts";
import { isUnit, timelineClass } from "../manifest/elements.ts";
import { checkOrdered } from "../manifest/invariants.ts";
import { completeOrdered, normalizeManifest, schemaProblems } from "../manifest/io.ts";
import type { Manifest } from "../manifest/types.ts";
import type { CoordinateValue } from "../number/coordinate.ts";
import { toAxisValue } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import type { Block } from "../workspace/blocks.ts";
import { TIMELINE_PREFIX } from "../workspace/ids.ts";
import type { View } from "../workspace/view.ts";
import type { ChangeSet } from "./mutations.ts";
import { withBlock } from "./mutations.ts";

/** The zero of each number type, the offset of a line's first segment. */
const ZEROS: { readonly [type in NumberType]: CoordinateValue } = {
  int: 0n,
  float: 0,
  fraction: Rational.fromParts(0n, 1n),
};

/** Every string a value holds under an `id` key, at any depth. */
function idsIn(value: unknown, ids: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) idsIn(item, ids);
  } else if (isJsonObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === "id" && typeof item === "string") ids.add(item);
      else idsIn(item, ids);
    }
  }
  return ids;
}

/**
 * The first segment of `line` when it is a segment line of known length
 * holding no segment: from 0, on the line's unit and number type, as long as
 * the line, its id minted by `mint`; `undefined` for any other timeline,
 * and for a line whose members the schema will refuse.
 */
function firstSegment(line: JsonObject, mint: (prefix: string) => string): JsonObject | undefined {
  const { unit, length, children = [], number_type: stated } = line;
  if (line.is_segment_line !== true || !Array.isArray(children) || children.length > 0) {
    return undefined;
  }
  if (typeof unit !== "string" || !isUnit(unit) || length === null || length === undefined) {
    return undefined;
  }
  const numberType =
    stated === "int" || stated === "float" || stated === "fraction"
      ? stated
      : numberTypeOf({ unit });
  const offset = toAxisValue({ unit, numberType, value: ZEROS[numberType] });
  const id = mint(TIMELINE_PREFIX[timelineClass(unit)]);
  const own = stated === undefined ? {} : { number_type: stated };
  return { id, unit, ...own, offset, length };
}

/**
 * `value`, a manifest an edit leaves, with every segment line of known
 * length that holds no segment given one segment from 0 covering its whole
 * length, of its unit and number type, unlocked as every segment is; its id
 * the smallest `{prefix}_{N}` of its unit's timeline class that no `id` of
 * the value nor any of `taken` (the ids of the manifest a timeline is added
 * into) equals. A segment line of unknown length is left as it is: nothing
 * fixes where its segments end. `value` itself when no line needs a
 * segment. Every edited value goes through this before the schema checks
 * it; reading a manifest from a file never does, so a file holding a
 * segment line without segments is refused.
 */
export function withSegmentLinesCovered(value: unknown, taken: Iterable<string> = []): unknown {
  if (!isJsonObject(value) || !Array.isArray(value.timelines)) return value;
  let ids: Set<string> | undefined;
  const mint = (prefix: string): string => {
    ids ??= idsIn(value, new Set(taken));
    let suffix = 1;
    while (ids.has(`${prefix}_${suffix}`)) suffix += 1;
    const id = `${prefix}_${suffix}`;
    ids.add(id);
    return id;
  };
  const covered = (timeline: Json): Json => {
    if (!isJsonObject(timeline)) return timeline;
    const segment = firstSegment(timeline, mint);
    if (segment !== undefined) return { ...timeline, children: [segment] };
    const { children } = timeline;
    if (!Array.isArray(children)) return timeline;
    const next = children.map(covered);
    return next.every((child, index) => child === children[index])
      ? timeline
      : { ...timeline, children: next };
  };
  const timelines: readonly Json[] = value.timelines;
  const next = timelines.map(covered);
  return next.every((timeline, index) => timeline === timelines[index])
    ? value
    : { ...value, timelines: next };
}

/**
 * `manifest` with its segment lines covered (`withSegmentLinesCovered`),
 * read again through the schema boundary when a line gained a segment;
 * `manifest` itself when none did, and, unchecked, when the covered value
 * is refused.
 */
function covered(manifest: Manifest, checked: boolean): Manifest | CommandError {
  const value = withSegmentLinesCovered(manifest);
  if (value === manifest) return manifest;
  const read = normalizeManifest(value);
  if (!isLoadError(read)) return read;
  const [first] = read.problems;
  if (first === undefined) throw new Error("a refused manifest names its problem");
  return checked ? first : manifest;
}

/**
 * `places` fitted to the drawing of `manifest`, `was` the manifest before
 * the command: every key naming a frame or a card of `manifest` is kept,
 * and a key that named a card of a timeline in `was` and names nothing now
 * moves to the timeline's one card in `manifest` (a root that became a
 * member, `T` to `G/T`; a member that left its group, `G/T` to `T`) unless
 * that card's key is stated already; every other key goes. Each place is cut
 * to the members its holder lets it state (`placeMembersOf`) and dropped
 * when nothing is left, so a root that became a member keeps its card's size
 * and spacing. `places` itself when nothing changes.
 */
function keptPlaces(
  places: Block["places"],
  was: Manifest | undefined,
  manifest: Manifest,
): Block["places"] {
  const { byKey, cards } = containersOf(manifest);
  const before = was === undefined ? undefined : containersOf(was).byKey;
  const movedTo = (key: string): ContainerRef | undefined => {
    const timeline = before?.get(key)?.timeline ?? null;
    if (timeline === null) return undefined;
    const [card, ...others] = cards.get(timeline) ?? [];
    if (card === undefined || others.length > 0 || card.key === null) return undefined;
    return Object.hasOwn(places, card.key) ? undefined : card;
  };
  let changed = false;
  const kept = Object.entries(places).flatMap(([key, place]) => {
    const container = byKey.get(key) ?? movedTo(key);
    const fitted = container === undefined ? undefined : keptPlace(container, place);
    const placed = container?.key ?? null;
    if (fitted !== place || placed !== key) changed = true;
    return fitted === undefined || placed === null ? [] : [[placed, fitted] as const];
  });
  return changed ? Object.fromEntries(kept) : places;
}

/**
 * Settle each manifest `changes` names: cover its segment lines, complete
 * it, order it and, with
 * `checked`, refuse its first schema or invariant problem, at `[<block id>,
 * "manifest", …]`; then fit its block's places to it (`keptPlaces`, the
 * block's manifest in `before` telling which card a stale key named). A
 * block the command removed is passed over.
 */
export function settle(
  before: View,
  view: View,
  changes: ChangeSet,
  checked: boolean,
): View | CommandError {
  let current = view;
  for (const id of changes.manifests) {
    const block = current.blocks[id];
    if (block === undefined) continue;
    const lines = covered(block.manifest, checked);
    if ("code" in lines) return { ...lines, path: [id, "manifest", ...lines.path] };
    const manifest = completeOrdered(lines);
    if ("code" in manifest) return { ...manifest, path: [id, "manifest", ...manifest.path] };
    if (checked) {
      // The invariants read a manifest the schema accepts, so they run only then.
      const schema = schemaProblems(manifest);
      const [first] = schema.length > 0 ? schema : checkOrdered(manifest);
      if (first !== undefined) return { ...first, path: [id, "manifest", ...first.path] };
    }
    current = withBlock(current, {
      ...block,
      places: keptPlaces(block.places, before.blocks[id]?.manifest, manifest),
      manifest,
    });
  }
  return current;
}
