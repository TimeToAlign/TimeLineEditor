/**
 * Named MatchStamps as commands give and take them. Naming a potential
 * MatchStamp (`add {into: <block>, matchstamp}`) and updating a named one
 * (`set {anchors, match_claims}` on it) both give its alignment anchors as
 * pairs of coordinates, `[{timeline, coordinate}, {timeline, coordinate}]`,
 * in screen order (top to bottom, then left to right), and the IDs of the
 * MatchClaims behind it. Every coordinate becomes the match timestamp
 * lying there: the one the manifest holds, else a new one (`timestamp_N`),
 * so at most one lies on a coordinate. Naming turns `name` on for the
 * middle anchor in screen order. The match timestamps no MatchStamp names
 * any more go (`removedBy`). The manifest's rules of MatchStamps
 * (an anchor joining two timelines, its anchors one connected set, a claim
 * ID listed once) are the schema package's check of the settled manifest.
 * A coordinate may lie on a virtual timeline, read as the root its axis is
 * (`locateVirtual`), as on any timeline of the manifest.
 */

import { ANCHOR_DISPLAY, DEFAULTS } from "@timetoalign/timetoshare";
import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { locateVirtual, virtualDrawing } from "../manifest/files.ts";
import type { Located } from "../manifest/tree.ts";
import { findTimeline, locateTimeline } from "../manifest/tree.ts";
import type {
  AlignmentAnchor,
  AnchorDisplay,
  AxisValue,
  Manifest,
  NamedMatchStamp,
  NamedTimestamp,
  TimelineManifest,
} from "../manifest/types.ts";
import type { NamedMatchStampSpec } from "../matches/compare.ts";
import type { CoordinateValue } from "../number/coordinate.ts";
import { axisCoordinate } from "../number/coordinate.ts";
import type { Real } from "../number/real.ts";
import { compareReal, realOf } from "../number/real.ts";
import { readObject, unknownMember } from "../values.ts";
import type { Mint } from "../workspace/ids.ts";
import { ANCHOR_PREFIX, TIMESTAMP_PREFIX } from "../workspace/ids.ts";
import { isGroupMember, readTimestampCoordinate } from "./timestamps.ts";

/** A coordinate of an anchor as a command gives it: the timeline it lies on and its value there. */
export interface AnchorCoordinate {
  readonly at: Located;
  readonly coordinate: AxisValue;
}

/** An alignment anchor as a command gives it: its two coordinates. */
export type GivenAnchor = readonly [AnchorCoordinate, AnchorCoordinate];

const COORDINATE_MEMBERS = ["timeline", "coordinate"];

function readAnchorCoordinate(
  value: unknown,
  manifest: Manifest,
  path: readonly PathSegment[],
): AnchorCoordinate | CommandError {
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const extra = unknownMember(object, COORDINATE_MEMBERS, path, ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  for (const member of COORDINATE_MEMBERS) {
    if (!Object.hasOwn(object, member)) {
      return problem(ErrorCode.invalidValue, `a coordinate needs ${member}`, [...path, member]);
    }
  }
  const { timeline } = object;
  const at =
    typeof timeline === "string"
      ? (locateTimeline(manifest, timeline) ?? locateVirtual(manifest, timeline))
      : undefined;
  if (at === undefined) {
    const named = typeof timeline === "string" ? `'${timeline}'` : "a timeline";
    return problem(ErrorCode.invalidValue, `${named} names no timeline of this manifest`, [
      ...path,
      "timeline",
    ]);
  }
  const coordinate = readTimestampCoordinate(object.coordinate, at.timeline, [
    ...path,
    "coordinate",
  ]);
  return isCommandError(coordinate) ? coordinate : { at, coordinate };
}

/** Whether two coordinates lie on one timeline at one exact value. */
function sameCoordinate(left: AnchorCoordinate, right: AnchorCoordinate): boolean {
  if (left.at.timeline.id !== right.at.timeline.id) return false;
  const axis = left.at.timeline;
  const exact = (item: AnchorCoordinate) => realOf(axisCoordinate(item.coordinate, axis));
  return compareReal(exact(left), exact(right)) === 0;
}

/** Whether two anchors join the same two coordinates, in either order. */
function sameAnchor(left: GivenAnchor, right: GivenAnchor): boolean {
  const [a, b] = left;
  const [c, d] = right;
  return (
    (sameCoordinate(a, c) && sameCoordinate(b, d)) || (sameCoordinate(a, d) && sameCoordinate(b, c))
  );
}

/**
 * The alignment anchors a command gives, in screen order: a non-empty list
 * of pairs of coordinates, each `{timeline, coordinate}` naming a timeline
 * of `manifest` and a value on its own axis within it
 * (`readTimestampCoordinate`), no anchor given twice. Anything else is
 * `invalid_value` (`unknown_property` for an unknown member of a
 * coordinate) at its path below `path`.
 */
export function readAnchors(
  value: unknown,
  manifest: Manifest,
  path: readonly PathSegment[],
): GivenAnchor[] | CommandError {
  if (!Array.isArray(value) || value.length === 0) {
    return problem(ErrorCode.invalidValue, "anchors is a non-empty list of anchors", path);
  }
  const anchors: GivenAnchor[] = [];
  for (const [index, item] of value.entries()) {
    const at = [...path, index];
    if (!Array.isArray(item) || item.length !== 2) {
      return problem(ErrorCode.invalidValue, "an anchor is a pair of coordinates", at);
    }
    const left = readAnchorCoordinate(item[0], manifest, [...at, 0]);
    if (isCommandError(left)) return left;
    const right = readAnchorCoordinate(item[1], manifest, [...at, 1]);
    if (isCommandError(right)) return right;
    const anchor: GivenAnchor = [left, right];
    if (anchors.some((given) => sameAnchor(given, anchor))) {
      return problem(ErrorCode.invalidValue, "the anchor is given twice", at);
    }
    anchors.push(anchor);
  }
  return anchors;
}

/**
 * The IDs of the MatchClaims behind a MatchStamp, as a command gives them:
 * a list of non-empty strings, kept in the order given; a repeated ID is the
 * schema's refusal.
 */
export function readMatchClaims(
  value: unknown,
  path: readonly PathSegment[],
): string[] | CommandError {
  const valid =
    Array.isArray(value) && value.every((item) => typeof item === "string" && item !== "");
  return valid
    ? [...value]
    : problem(ErrorCode.invalidValue, "match_claims is a list of MatchClaim IDs", path);
}

/** The position of the middle one of `count` anchors in screen order: the upper of two middles. */
export function middleAnchor(count: number): number {
  return Math.floor((count - 1) / 2);
}

/** `display` with `name` turned on, in the schema package's canonical order (`ANCHOR_DISPLAY`). */
function withName(display: readonly AnchorDisplay[]): AnchorDisplay[] {
  return ANCHOR_DISPLAY.filter((word) => word === "name" || display.includes(word));
}

/** The timeline `id` of `manifest`, or its virtual timeline `id` read as the root its axis is. */
function timelineOrVirtual(manifest: Manifest, id: string): TimelineManifest | undefined {
  return findTimeline(manifest, id) ?? virtualDrawing(manifest, id)?.timeline;
}

/** The match timestamp of `timestamps` on `timeline` at `at`, exact on its own axis; none is undefined. */
function matchTimestampIn(
  timestamps: readonly NamedTimestamp[],
  timeline: TimelineManifest,
  at: Real,
): NamedTimestamp | undefined {
  return timestamps.find(
    (item) =>
      item.matchstamp &&
      item.timeline === timeline.id &&
      compareReal(realOf(axisCoordinate(item.coordinate, timeline)), at) === 0,
  );
}

/**
 * Whether naming a MatchStamp one of whose coordinates lies on `timeline`
 * at `value` (exact, on the timeline's own axis) stores the match timestamp
 * there as a groupstamp: the match timestamp `manifest` holds there, which
 * naming takes, keeps its own `groupstamp`; a new one is a groupstamp
 * exactly where its timeline lies in a group (`isGroupMember`), as naming
 * adds it (`namedMatchStamp`). False where the manifest holds no timeline
 * `timeline`.
 */
export function namedAsGroupstamp(
  manifest: Manifest,
  timeline: string,
  value: CoordinateValue,
): boolean {
  const found = timelineOrVirtual(manifest, timeline);
  if (found === undefined) return false;
  const at = realOf({ unit: found.unit, numberType: found.number_type, value });
  const held = matchTimestampIn(manifest.graphical?.timestamps ?? [], found, at);
  return held?.groupstamp ?? isGroupMember(manifest, timeline);
}

/**
 * The match timestamps the given anchors lie on, and the manifest's named
 * timestamps with the new ones appended: each coordinate's match timestamp
 * is the one the manifest holds there, else a new one with the ID `mint`
 * gives, without a name, with
 * the default `display` of a match timestamp and a groupstamp exactly where
 * its timeline lies in a group (`isGroupMember`). A named timestamp that is
 * no match timestamp is never taken for one; one taken keeps its own
 * `groupstamp`.
 */
function placedTimestamps(
  manifest: Manifest,
  anchors: readonly GivenAnchor[],
  mint: Mint,
): { readonly ends: (readonly [string, string])[]; readonly timestamps: NamedTimestamp[] } {
  const timestamps = [...(manifest.graphical?.timestamps ?? [])];
  const idOf = (given: AnchorCoordinate): string => {
    const { timeline } = given.at;
    const at = realOf(axisCoordinate(given.coordinate, timeline));
    const found = matchTimestampIn(timestamps, timeline, at);
    if (found !== undefined) return found.id;
    const id = mint(TIMESTAMP_PREFIX);
    const display = [...DEFAULTS.match_timestamp.display];
    timestamps.push({
      id,
      timeline: timeline.id,
      coordinate: given.coordinate,
      display,
      matchstamp: true,
      groupstamp: isGroupMember(manifest, timeline.id),
    });
    return id;
  };
  const ends = anchors.map(([left, right]) => [idOf(left), idOf(right)] as const);
  return { ends, timestamps };
}

/**
 * A new named MatchStamp with the ID `id`: its anchors those given, each
 * with the ID `mint` gives, after those of the new match timestamps, and the
 * default `display`, the middle one
 * in screen order showing the name too; and the named timestamps with the
 * match timestamps it needs added.
 */
export function namedMatchStamp(
  manifest: Manifest,
  mint: Mint,
  id: string,
  name: string,
  anchors: readonly GivenAnchor[],
  claims: readonly string[],
): { readonly matchstamp: NamedMatchStamp; readonly timestamps: NamedTimestamp[] } {
  const { ends, timestamps } = placedTimestamps(manifest, anchors, mint);
  const middle = middleAnchor(ends.length);
  const listed = ends.map((pair, index): AlignmentAnchor => {
    const anchorId = mint(ANCHOR_PREFIX);
    const display = [...DEFAULTS.alignment_anchor.display];
    return {
      id: anchorId,
      timestamps: pair,
      display: index === middle ? withName(display) : display,
    };
  });
  const [first, ...more] = listed;
  if (first === undefined) throw new Error("a MatchStamp is named with an anchor");
  return {
    matchstamp: { id, name, alignment_anchors: [first, ...more], match_claims: [...claims] },
    timestamps,
  };
}

/**
 * The named MatchStamp `matchstamp` with its anchors rewritten from those
 * given: an anchor joining the same two match timestamps as one it has
 * keeps that anchor (its ID and `display`), any other is new, with the ID
 * `mint` gives and the default `display`. Where an anchor showing the
 * name is gone and no kept one shows it, the middle anchor in screen order
 * shows it. With the named timestamps the new anchors need added.
 */
export function rewrittenMatchStamp(
  manifest: Manifest,
  mint: Mint,
  matchstamp: NamedMatchStamp,
  anchors: readonly GivenAnchor[],
): { readonly matchstamp: NamedMatchStamp; readonly timestamps: NamedTimestamp[] } {
  const { ends, timestamps } = placedTimestamps(manifest, anchors, mint);
  const old = matchstamp.alignment_anchors;
  const joins = (anchor: AlignmentAnchor, [left, right]: readonly [string, string]) => {
    const [a, b] = anchor.timestamps;
    return (a === left && b === right) || (a === right && b === left);
  };
  const listed = ends.map((pair): AlignmentAnchor => {
    const kept = old.find((anchor) => joins(anchor, pair));
    if (kept !== undefined) return kept;
    const id = mint(ANCHOR_PREFIX);
    return { id, timestamps: pair, display: [...DEFAULTS.alignment_anchor.display] };
  });
  const shows = (anchor: AlignmentAnchor) => anchor.display.includes("name");
  const middle = middleAnchor(listed.length);
  const named =
    old.some(shows) && !listed.some(shows)
      ? listed.map((anchor, index) =>
          index === middle ? { ...anchor, display: withName(anchor.display) } : anchor,
        )
      : listed;
  const [first, ...more] = named;
  if (first === undefined) throw new Error("a MatchStamp keeps an anchor");
  return { matchstamp: { ...matchstamp, alignment_anchors: [first, ...more] }, timestamps };
}

/** A coordinate as a command gives an anchor's: a timeline ID and a bare value on its axis. */
export interface AnchorValue {
  readonly timeline: string;
  readonly coordinate: AxisValue;
}

/**
 * What the comparison with the current table reads of a named MatchStamp
 * of `manifest` (`checkMatchStamp`): each anchor's two coordinates, the
 * values of its match timestamps on their timelines' axes, and whether it
 * shows the name; and the claim IDs it records.
 */
export function matchStampSpec(
  manifest: Manifest,
  matchstamp: NamedMatchStamp,
): NamedMatchStampSpec {
  const timestamps = new Map((manifest.graphical?.timestamps ?? []).map((item) => [item.id, item]));
  const coordinateOf = (id: string) => {
    const timestamp = timestamps.get(id);
    const timeline =
      timestamp === undefined ? undefined : timelineOrVirtual(manifest, timestamp.timeline);
    if (timestamp === undefined || timeline === undefined) {
      throw new Error(`the anchors of '${matchstamp.id}' name match timestamps`);
    }
    return { timeline: timeline.id, value: axisCoordinate(timestamp.coordinate, timeline).value };
  };
  return {
    anchors: matchstamp.alignment_anchors.map((anchor) => ({
      coordinates: [coordinateOf(anchor.timestamps[0]), coordinateOf(anchor.timestamps[1])],
      carriesName: anchor.display.includes("name"),
    })),
    claims: matchstamp.match_claims,
  };
}
