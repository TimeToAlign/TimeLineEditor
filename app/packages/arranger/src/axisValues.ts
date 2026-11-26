/**
 * Values of a timeline's own axis as fields and keys read and write them: an
 * exact value as the manifest writes it on that axis, and a text typed as
 * one. Shared by everything that reads a position or a length typed on an
 * axis: the flow editor's "+ Gap", and the inspector's fields of an elision
 * and a region.
 */

import type { AxisValue, TimelineManifest } from "@timetoalign/tilie-core";
import { parseAxisValue } from "@timetoalign/tilie-core";
import type { Real } from "@timetoalign/tilie-core/numbers";
import { exactCoordinate, Rational, toAxisValue, toFloat } from "@timetoalign/tilie-core/numbers";

/** A value of the axis of `timeline` as the manifest writes it; `undefined` where it does not fit. */
export function axisValueAt(value: Real, timeline: TimelineManifest): AxisValue | undefined {
  const exact = exactCoordinate(value, timeline.unit, timeline.number_type);
  return exact === undefined ? undefined : toAxisValue(exact);
}

/**
 * The value typed as `text` on `timeline`'s axis, exact (`parseAxisValue`),
 * as the manifest writes it there: a decimal on a fraction axis is the value
 * it denotes, on a float axis the nearest double; a message where none fits.
 */
export function typedValue(text: string, timeline: TimelineManifest): AxisValue | string {
  const parsed = parseAxisValue(text, timeline.number_type);
  if (!(parsed instanceof Rational)) return parsed.message;
  const value = axisValueAt(timeline.number_type === "float" ? toFloat(parsed) : parsed, timeline);
  return value ?? `${text.trim()} is no ${timeline.number_type} value of '${timeline.id}'`;
}
