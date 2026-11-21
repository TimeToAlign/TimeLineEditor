/**
 * Named timestamps as commands give and take them: the readers of the
 * values a command gives one (its coordinate, its `display`), and the two
 * timestamps every new root is given, `origin` and `length`, which the
 * editor also gives every root of a manifest it imports without a
 * `graphical` object. Once made they are like any other named timestamp.
 */

import { canonicalOrder, complete } from "@timetoalign/timetoshare";
import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { lengthOf, readOnAxis } from "../manifest/invariants.ts";
import type {
  AxisValue,
  Manifest,
  NamedTimestamp,
  TimelineManifest,
  TimestampDisplay,
} from "../manifest/types.ts";
import { toAxisValue } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import { compareReal, exactCoordinate, realOf } from "../number/real.ts";
import { toJson } from "../values.ts";
import { manifestIds } from "../workspace/address.ts";
import { nextId, TIMESTAMP_PREFIX } from "../workspace/ids.ts";
import { withTimestamps } from "./mutations.ts";

/**
 * A named timestamp's coordinate given to a command, as stored: a bare
 * value on the own axis of `timeline`, the timeline it lies on
 * (`invalid_coordinate` where it does not read as the axis's number type),
 * from 0 to the timeline's length, or from 0 where the length is unknown
 * (`invalid_value` before its start or after its end).
 */
export function readTimestampCoordinate(
  value: unknown,
  timeline: TimelineManifest,
  path: readonly PathSegment[],
): AxisValue | CommandError {
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  const read = readOnAxis(json, timeline, path);
  if (isCommandError(read)) return read;
  const position = realOf(read);
  if (compareReal(position, Rational.of(0n)) < 0) {
    return problem(
      ErrorCode.invalidValue,
      `the coordinate lies before the start of timeline '${timeline.id}'`,
      path,
    );
  }
  const length = lengthOf(timeline);
  if (length !== null && compareReal(position, realOf(length)) > 0) {
    return problem(
      ErrorCode.invalidValue,
      `the coordinate lies after the end of timeline '${timeline.id}'`,
      path,
    );
  }
  return toAxisValue(read);
}

/**
 * A `display` given to a command, as stored: a list of the display words
 * `words` (a named timestamp's `TIMESTAMP_DISPLAY`, an alignment anchor's
 * `ANCHOR_DISPLAY`), each at most once, in any order, stored in the
 * canonical order of `words`. Anything else is `invalid_value` at `path`.
 */
export function readDisplay<W extends string>(
  value: unknown,
  words: readonly W[],
  path: readonly PathSegment[],
): W[] | CommandError {
  const refused = (message: string) => problem(ErrorCode.invalidValue, message, path);
  if (!Array.isArray(value)) return refused("a display is a list of display words");
  const given = new Set<W>();
  for (const item of value) {
    if (typeof item !== "string") return refused("a display is a list of display words");
    const word = words.find((known) => known === item);
    if (word === undefined) return refused(`'${item}' is no display word`);
    if (given.has(word)) return refused(`'${word}' is given twice`);
    given.add(word);
  }
  return words.filter((word) => given.has(word));
}

/** What the timestamps a new root is given show: a wedge and the coordinate. */
const DEFAULT_TIMESTAMP_DISPLAY: readonly TimestampDisplay[] = ["wedge", "coordinate"];

/**
 * `manifest` with the default timestamps of the root `timeline`: `origin`
 * at the zero of its number type and, where its length is known, `length`
 * at its length, each showing its wedge and coordinate, each given the next
 * free `timestamp_N` of the manifest, appended to its named timestamps.
 */
export function withDefaultTimestamps(manifest: Manifest, timeline: TimelineManifest): Manifest {
  const zero = exactCoordinate(Rational.of(0n), timeline.unit, timeline.number_type);
  if (zero === undefined) throw new Error("every number type holds zero");
  const places: (readonly [string, AxisValue])[] = [["origin", toAxisValue(zero)]];
  if (timeline.length !== null) places.push(["length", timeline.length]);
  const taken = new Set(manifestIds(manifest));
  const added = places.map(([name, coordinate]): NamedTimestamp => {
    const id = nextId(TIMESTAMP_PREFIX, taken);
    taken.add(id);
    const display = [...DEFAULT_TIMESTAMP_DISPLAY];
    return { id, timeline: timeline.id, coordinate, name, display, matchstamp: false };
  });
  return withTimestamps(manifest, [...(manifest.graphical?.timestamps ?? []), ...added]);
}

/**
 * A manifest as the editor imports it: one without a `graphical` object has
 * every root given its default timestamps (`withDefaultTimestamps`, in root
 * order), its `graphical` object completed and the whole in canonical
 * order; one with a `graphical` object, which states its own timestamps, is
 * returned as it is.
 */
export function importedManifest(manifest: Manifest): Manifest {
  if (manifest.graphical !== undefined) return manifest;
  return canonicalOrder(complete(manifest.timelines.reduce(withDefaultTimestamps, manifest)));
}
