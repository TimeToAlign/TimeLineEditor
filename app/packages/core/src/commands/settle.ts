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
import type { ContainerRef, PlaceKey, Places } from "../manifest/containers.ts";
import {
  containersOf,
  keptPlace,
  placedContainer,
  placeEntries,
  placeKeyText,
  samePlaceKey,
  withPlaceAt,
} from "../manifest/containers.ts";
import { isUnit, timelineClass } from "../manifest/elements.ts";
import { checkOrdered } from "../manifest/invariants.ts";
import { completeOrdered, normalizeManifest, schemaProblems } from "../manifest/io.ts";
import type { Manifest } from "../manifest/types.ts";
import type { CoordinateValue } from "../number/coordinate.ts";
import { toAxisValue } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import { nextId, TIMELINE_PREFIX } from "../workspace/ids.ts";
import type { View } from "../workspace/view.ts";
import type { ChangeSet } from "./mutations.ts";
import { withBlock } from "./mutations.ts";

/** The zero of each number type, the offset of a line's first segment. */
const ZEROS: { readonly [type in NumberType]: CoordinateValue } = {
  int: 0n,
  float: 0,
  fraction: Rational.fromParts(0n, 1n),
};

/**
 * Every ID a manifest value states, read as JSON before the schema checks
 * it, added to `ids`: the manifest's own, its timelines' at any depth with
 * their conversion maps' (and the maps those hold, at any depth), regions'
 * and flow-control elements', its groups' and its MeasureMaps'; never a
 * string under `meta` or `graphical`.
 */
function idsIn(manifest: JsonObject, ids: Set<string>): Set<string> {
  const note = (value: unknown) => {
    if (isJsonObject(value) && typeof value.id === "string") ids.add(value.id);
  };
  const listed = (value: unknown, member: string): readonly unknown[] => {
    const list = isJsonObject(value) ? value[member] : undefined;
    return Array.isArray(list) ? list : [];
  };
  const map = (value: unknown) => {
    note(value);
    const held = isJsonObject(value) ? value.maps : undefined;
    for (const item of isJsonObject(held) ? Object.values(held) : listed(value, "maps")) map(item);
  };
  const timeline = (value: unknown) => {
    note(value);
    for (const item of listed(value, "conversion_maps")) map(item);
    for (const item of [...listed(value, "regions"), ...listed(value, "flow_control")]) note(item);
    for (const item of listed(value, "children")) timeline(item);
  };
  note(manifest);
  for (const item of listed(manifest, "timelines")) timeline(item);
  for (const item of [...listed(manifest, "groups"), ...listed(manifest, "measure_maps")])
    note(item);
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
    const id = nextId(prefix, ids);
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
 * the command: every place lying where a frame or a card of `manifest` has
 * its place is kept, and a place that was a card's in `was` and names
 * nothing now moves to the timeline's one card in `manifest` (a root that
 * became a member, from `places[T]` to `places[G].cards[T]`; a member that
 * left its group, the other way) unless that card's place is stated
 * already; every other place goes. Each place is cut to the members its
 * holder lets it state (`placeMembersOf`) and dropped when nothing is left,
 * so a root that became a member keeps its card's size, spacing and margin.
 * `places` itself when nothing changes.
 */
function keptPlaces(places: Places, was: Manifest | undefined, manifest: Manifest): Places {
  const { cards } = containersOf(manifest);
  const stated = placeEntries(places);
  const statedAt = new Set(stated.map(([key]) => placeKeyText(key)));
  const movedTo = (key: PlaceKey): ContainerRef | undefined => {
    const timeline = was === undefined ? null : (placedContainer(was, key)?.timeline ?? null);
    if (timeline === null) return undefined;
    const [card, ...others] = cards.get(timeline) ?? [];
    if (card === undefined || others.length > 0 || card.key === null) return undefined;
    return statedAt.has(placeKeyText(card.key)) ? undefined : card;
  };
  let changed = false;
  let kept: Places = {};
  for (const [key, place] of stated) {
    const container = placedContainer(manifest, key) ?? movedTo(key);
    const fitted = container === undefined ? undefined : keptPlace(container, place);
    const placed = container?.key ?? null;
    if (fitted !== place || placed === null || !samePlaceKey(placed, key)) changed = true;
    if (fitted !== undefined && placed !== null) kept = withPlaceAt(kept, placed, fitted);
  }
  return changed ? kept : places;
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
