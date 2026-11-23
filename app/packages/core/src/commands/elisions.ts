/**
 * Elisions as commands give and take them: the readers of the values a
 * command gives one (its start and end, its width, its display) and the
 * check of its stretch, each refusing as TimeToShare's validators refuse
 * (`elision_stretch`, with their messages), with core's own codes where
 * the schema alone would refuse (`invalid_value`, `non_positive_number`,
 * `unknown_property`), so that no elision a command makes reaches the
 * schema check at settle as a `schema_violation`.
 */

import { DEFAULTS, ELISION_DISPLAY } from "@timetoalign/timetoshare";
import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import { lengthOf, readOnAxis, spelled } from "../manifest/invariants.ts";
import type { AxisValue, Elision, TimelineManifest } from "../manifest/types.ts";
import type { Coordinate } from "../number/coordinate.ts";
import { axisCoordinate, toAxisValue } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import { compareReal, realOf } from "../number/real.ts";
import {
  readFinite,
  readName,
  readObject,
  readPositive,
  toJson,
  unknownMember,
} from "../values.ts";
import { readDisplay } from "./timestamps.ts";

/** The width of an elision as stored: exactly one of its three forms. */
export type ElisionWidth = NonNullable<Elision["width"]>;

/** The forms of an elision's `width`, of which it states exactly one. */
const WIDTH_FORMS = ["ratio", "span", "canvas"] as const;

/** A bare value given to a command on the own axis of `timeline`, read. */
function readOwn(
  value: unknown,
  timeline: TimelineManifest,
  path: readonly PathSegment[],
): Coordinate | CommandError {
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  return readOnAxis(json, timeline, path);
}

/**
 * The `start` of the elision `id` lying on `timeline`, given to a command:
 * a bare value on the timeline's own axis (`invalid_coordinate` where it
 * does not read as the axis's number type), as stored, at or after 0
 * (`elision_stretch` at `path`, worded as TimeToShare words it).
 */
export function readElisionStart(
  value: unknown,
  timeline: TimelineManifest,
  id: string,
  path: readonly PathSegment[],
): AxisValue | CommandError {
  const read = readOwn(value, timeline, path);
  if (isCommandError(read)) return read;
  const start = toAxisValue(read);
  if (compareReal(realOf(read), Rational.of(0n)) < 0) {
    return problem(
      ErrorCode.elisionStretch,
      `start ${spelled(start)} of '${id}' lies before the start of its timeline '${timeline.id}'`,
      path,
    );
  }
  return start;
}

/**
 * The `end` of the elision `id` lying on `timeline`, given to a command: a
 * bare value on the timeline's own axis, as stored, at or before its
 * length where that is known (`elision_stretch` at `path`); an unknown
 * length bounds nothing.
 */
export function readElisionEnd(
  value: unknown,
  timeline: TimelineManifest,
  id: string,
  path: readonly PathSegment[],
): AxisValue | CommandError {
  const read = readOwn(value, timeline, path);
  if (isCommandError(read)) return read;
  const end = toAxisValue(read);
  const length = lengthOf(timeline);
  if (length !== null && compareReal(realOf(read), realOf(length)) > 0) {
    return problem(
      ErrorCode.elisionStretch,
      `end ${spelled(end)} of '${id}' is beyond the length ${spelled(timeline.length)} of its timeline '${timeline.id}'`,
      path,
    );
  }
  return end;
}

/**
 * Why the stretch of `elision`, lying on `timeline`, is refused, if it is:
 * its end does not lie after its start (`elision_stretch` at `path`).
 */
export function stretchProblem(
  elision: Pick<Elision, "id" | "start" | "end">,
  timeline: TimelineManifest,
  path: readonly PathSegment[],
): CommandError | undefined {
  const start = realOf(axisCoordinate(elision.start, timeline));
  const end = realOf(axisCoordinate(elision.end, timeline));
  if (compareReal(start, end) < 0) return undefined;
  return problem(
    ErrorCode.elisionStretch,
    `end ${spelled(elision.end)} of '${elision.id}' does not lie after its start ${spelled(elision.start)}`,
    path,
  );
}

/**
 * An elision's `width` given to a command, for an elision lying on
 * `timeline`: an object stating exactly one of `ratio`, a number above 0
 * and at most 1, `span`, a bare value on the timeline's own axis above 0,
 * stored as read, and `canvas`, a finite number above 0
 * (`invalid_value`, `non_positive_number`; any other member
 * `unknown_property`).
 */
export function readElisionWidth(
  value: unknown,
  timeline: TimelineManifest,
  path: readonly PathSegment[],
): ElisionWidth | CommandError {
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const extra = unknownMember(object, WIDTH_FORMS, path, ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  const forms = WIDTH_FORMS.filter((form) => Object.hasOwn(object, form));
  const [form] = forms;
  if (form === undefined || forms.length > 1) {
    return problem(
      ErrorCode.invalidValue,
      "a width is exactly one of ratio, span and canvas",
      path,
    );
  }
  const at = [...path, form];
  switch (form) {
    case "ratio": {
      const ratio = readFinite(object.ratio, at);
      if (isCommandError(ratio)) return ratio;
      return ratio > 0 && ratio <= 1
        ? { ratio }
        : problem(ErrorCode.invalidValue, "a ratio lies above 0 and at most 1", at);
    }
    case "span": {
      const read = readOnAxis(object.span, timeline, at);
      if (isCommandError(read)) return read;
      return compareReal(realOf(read), Rational.of(0n)) > 0
        ? { span: toAxisValue(read) }
        : problem(ErrorCode.nonPositiveNumber, "the span must be positive", at);
    }
    case "canvas": {
      const canvas = readPositive(object.canvas, at);
      return isCommandError(canvas) ? canvas : { canvas };
    }
  }
}

/** The members an elision given to `add` must have; its ID is minted. */
const ELISION_REQUIRED = ["start", "end"];

/** Every member an elision given to `add` into a timeline may have. */
const ELISION_VALUE = [...ELISION_REQUIRED, "name", "width", "display"];

/**
 * An elision given to `add`, lying on `timeline` and given the ID `id`:
 * `{start, end, name?, width?, display?}` at `path`, start and end
 * required (`invalid_value`), no other member (`unknown_property`), its
 * start and end read (`readElisionStart`, `readElisionEnd`) and its stretch
 * checked (`stretchProblem` at `end`), its name a non-empty string
 * (`invalid_value`) and its width read by `readElisionWidth`, each left out
 * where it is not given, its display read by `readDisplay` over
 * `ELISION_DISPLAY`, the schema's default (`["ellipsis", "name"]`) where it is not
 * given.
 */
export function readElision(
  object: JsonObject,
  timeline: TimelineManifest,
  id: string,
  path: readonly PathSegment[],
): Elision | CommandError {
  const extra = unknownMember(object, ELISION_VALUE, path, ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  for (const member of ELISION_REQUIRED) {
    if (!Object.hasOwn(object, member)) {
      return problem(ErrorCode.invalidValue, `a new elision needs ${member}`, [...path, member]);
    }
  }
  const start = readElisionStart(object.start, timeline, id, [...path, "start"]);
  if (isCommandError(start)) return start;
  const end = readElisionEnd(object.end, timeline, id, [...path, "end"]);
  if (isCommandError(end)) return end;
  const refused = stretchProblem({ id, start, end }, timeline, [...path, "end"]);
  if (refused !== undefined) return refused;
  const name = object.name === undefined ? undefined : readName(object.name, [...path, "name"]);
  if (isCommandError(name)) return name;
  const width =
    object.width === undefined
      ? undefined
      : readElisionWidth(object.width, timeline, [...path, "width"]);
  if (isCommandError(width)) return width;
  const display =
    object.display === undefined
      ? [...DEFAULTS.elision.display]
      : readDisplay(object.display, ELISION_DISPLAY, [...path, "display"]);
  if (isCommandError(display)) return display;
  return {
    id,
    timeline: timeline.id,
    start,
    end,
    ...(name === undefined ? {} : { name }),
    ...(width === undefined ? {} : { width }),
    display,
  };
}
