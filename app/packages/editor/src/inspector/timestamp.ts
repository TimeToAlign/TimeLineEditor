/**
 * A pinned timestamp as the Timestamp tab shows and copies it: one section
 * per part, one row per value, each in the texts core gives for it; the
 * whole as coordinate dicts in the standard writer's text; and the grid
 * the position was picked on. Nothing here computes a value, and every text
 * the coordinate flag shows too is core's.
 */

import type { Expressed, Granularity, Timestamp, TimestampPart } from "@timetoalign/tilie-core";
import {
  coordinateDict,
  copyValue,
  displayValue,
  gridText,
  measureText,
  missingValueText,
  timestampGrid,
  timestampPlace,
  unitSymbol,
} from "@timetoalign/tilie-core";
import type { CoordinateValue } from "@timetoalign/tilie-core/numbers";
import { jsonFloat, jsonInteger, Rational } from "@timetoalign/tilie-core/numbers";
import { dumps } from "@timetoalign/timetoshare";

/** One shown value: its label, its text, and what Copy writes (`null`: nothing to copy). */
export interface TimestampRow {
  readonly label: string;
  readonly shown: string;
  readonly copied: string | null;
}

/** One part of a timestamp: its heading, then its coordinate's row and its maps' rows. */
export interface TimestampSection {
  readonly heading: string;
  readonly name: string;
  readonly rows: readonly TimestampRow[];
}

function valueRows(label: string, value: Expressed): TimestampRow[] {
  if (typeof value === "string") return [{ label, shown: value, copied: value }];
  if ("record" in value) {
    const text = measureText(value.record);
    return [{ label, shown: text, copied: text }];
  }
  if ("outputs" in value) {
    return Object.entries(value.outputs).flatMap(([output, inner]) =>
      valueRows(`${label} · ${output}`, inner),
    );
  }
  const shown = displayValue(value.value, value.numberType);
  return [
    {
      label,
      shown: value.unit === null ? shown : `${shown} ${unitSymbol(value.unit)}`,
      copied: copyValue(value.value, value.numberType),
    },
  ];
}

function sectionOf(part: TimestampPart): TimestampSection {
  return {
    heading: part.segment ? `${part.name} · segment` : part.name,
    name: part.name,
    rows: [
      {
        label: "coordinate",
        shown: `${displayValue(part.position, part.numberType)} ${unitSymbol(part.unit)}`,
        copied: copyValue(part.position, part.numberType),
      },
      ...part.maps.flatMap((map) => {
        const label = map.name ?? map.id;
        return map.value === null
          ? [{ label, shown: missingValueText(map), copied: null }]
          : valueRows(label, map.value);
      }),
    ],
  };
}

/** The sections of a timestamp, its line's first. */
export function timestampSections(timestamp: Timestamp): TimestampSection[] {
  return timestamp.parts.map(sectionOf);
}

/** A number without a unit as a manifest writes a bare value: an integer, a float, a Fraction pair. */
function bareValue(value: CoordinateValue): unknown {
  if (value instanceof Rational) {
    return [jsonInteger(value.numerator), jsonInteger(value.denominator)];
  }
  return typeof value === "bigint" ? jsonInteger(value) : jsonFloat(value);
}

function jsonOf(value: Expressed | null): unknown {
  if (value === null || typeof value === "string") return value;
  if ("record" in value) return value.record;
  if ("outputs" in value) {
    const outputs: { [output: string]: unknown } = {};
    for (const [output, inner] of Object.entries(value.outputs)) outputs[output] = jsonOf(inner);
    return outputs;
  }
  return value.unit === null
    ? { number_type: value.numberType, value: bareValue(value.value) }
    : coordinateDict(value.value, value.unit, value.numberType);
}

/**
 * The timestamp as the standard writer writes it: a list of its parts, each
 * `{timeline, segment, coordinate, maps}`, every number with a unit a
 * coordinate dict, one without `{number_type, value}`, a map without a value
 * `null`, the maps keyed by ID.
 */
export function timestampJson(timestamp: Timestamp): string {
  return dumps(
    timestamp.parts.map((part) => {
      const maps: { [id: string]: unknown } = {};
      for (const map of part.maps) maps[map.id] = jsonOf(map.value);
      return {
        timeline: part.timeline,
        segment: part.segment,
        coordinate: coordinateDict(part.position, part.unit, part.numberType),
        maps,
      };
    }),
  );
}

/**
 * Where a timestamp lies and the grid it was picked on under `granularity`,
 * the granularity it was read with: `Form at 13 1/2 ♩ · grid 1/2 ♩
 * (fraction base 1, refining)`.
 */
export function timestampHeading(timestamp: Timestamp, granularity: Granularity): string {
  return `${timestampPlace(timestamp)} · ${gridText(timestampGrid(timestamp, granularity))}`;
}
