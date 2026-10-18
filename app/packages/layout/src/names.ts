/**
 * Names and labels: the name column's row names and the centred labels
 * (`docs/drawing.md` in timeskeleton, sections 5.3 and 6.6).
 */

import type { TimelineManifest } from "@timetoalign/tilie-core";
import { at, type Position } from "./canvas.ts";
import type { Side } from "./cascade.ts";
import type { ShownCoordinate, TextElement } from "./elements.ts";
import { cleanText, type TextMeasure } from "./metrics.ts";
import { unscoped } from "./numbers.ts";
import { type Entry, type Measured, type Scope, type Styled, shown } from "./traversal.ts";

interface DrawnName {
  /** The row's line distance: the ordinate of its row, given the root's line. */
  readonly y: (yRoot: number) => number;
  readonly first: Styled;
  readonly text: string;
  readonly width: number;
}

/** An ancestor's row of the name column, at its line's distance above the root's line. */
export interface AncestorName {
  readonly name: Styled;
  readonly text: string;
  readonly distance: number;
}

/** The name of a timeline (section 5.3): its `name`, or its id without its scope. */
export const nameOf = (timeline: TimelineManifest): string =>
  timeline.name ?? unscoped(timeline.id);

/** A name text cut to its `max-width` with `…` (section 6.6). */
export function cutText(
  measure: TextMeasure,
  text: string,
  size: number,
  maximum: number | "none",
) {
  if (maximum === "none" || measure.width(text, size) <= maximum) return text;
  const ellipsis = "…";
  const points = Array.from(text);
  while (points.length > 0 && measure.width(`${points.join("")}${ellipsis}`, size) > maximum) {
    points.pop();
  }
  return `${points.join("")}${ellipsis}`;
}

/**
 * The names of the rows holding lines: the ancestors' from A1 to Ak first,
 * then the root's row and the child rows from the top down, each child row
 * `k` of a side at `distances[side][k − 1]` from the root's line.
 */
export function rowNames(
  scope: Scope,
  ancestors: readonly AncestorName[],
  rowLines: Record<Side, readonly (readonly Entry[])[]>,
  distances: Record<Side, readonly number[]>,
): DrawnName[] {
  const { measure, rootEntry } = scope;
  const drawnNames: DrawnName[] = [];
  const nameRow = (
    items: readonly { readonly name: Styled; readonly text: string }[],
    y: DrawnName["y"],
  ) => {
    const visible = items.filter((item) => shown(item.name.style));
    const firstItem = visible[0];
    if (firstItem === undefined) return;
    const first = firstItem.name;
    const source =
      first.style.content === "none"
        ? visible.map((item) => item.text).join(", ")
        : first.style.content;
    const text = cutText(
      measure,
      cleanText(source),
      first.style["font-size"],
      first.style["max-width"],
    );
    drawnNames.push({ y, first, text, width: measure.width(text, first.style["font-size"]) });
  };
  const named = (lines: readonly Entry[]) =>
    lines
      .filter((line) => !line.segment)
      .map((line) => ({ name: line.name, text: nameOf(line.manifest) }));

  for (const ancestor of ancestors) {
    nameRow([{ name: ancestor.name, text: ancestor.text }], at("above", ancestor.distance));
  }
  const rows: { y: DrawnName["y"]; local: number; lines: readonly Entry[] }[] = [];
  if (shown(rootEntry.style)) rows.push({ y: (yRoot) => yRoot, local: 0, lines: [rootEntry] });
  for (const side of ["above", "below"] as const) {
    rowLines[side].forEach((lines, index) => {
      const distance = distances[side][index] as number;
      rows.push({ y: at(side, distance), local: side === "above" ? -distance : distance, lines });
    });
  }
  rows.sort((left, right) => left.local - right.local);
  for (const row of rows) nameRow(named(row.lines), row.y);
  return drawnNames;
}

/** The names' text elements at the name column, each vertically centred on its row. */
export function nameElements(
  scope: Scope,
  names: readonly DrawnName[],
  placed: Position,
): TextElement[] {
  const { a, d } = scope;
  return names.map((item) => {
    const size = item.first.style["font-size"];
    return {
      type: "name",
      address: item.first.address,
      style: item.first.style,
      x: placed.n,
      baseline: item.y(placed.yRoot) + (a(size) - d(size)) / 2,
      anchor: "start",
      text: item.text,
    };
  });
}

/** A label centred on `centre`. */
export function centredLabel(
  owner: Styled,
  centre: number,
  baseline: number,
  item: Measured,
  coordinate?: ShownCoordinate,
): TextElement {
  return {
    type: "label",
    address: owner.address,
    style: owner.style,
    x: centre,
    baseline,
    anchor: "middle",
    text: item.clean,
    ...(coordinate === undefined ? {} : { coordinate }),
  };
}
