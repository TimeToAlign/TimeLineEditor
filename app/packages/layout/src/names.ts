/**
 * Names and labels: the name column's row texts, one per row, and the
 * centred labels (`docs/drawing.md` in timeskeleton, sections 5.3 and 6.6).
 */

import type { TimelineManifest } from "@timetoalign/tilie-core";
import type { ShownCoordinate, TextElement } from "./elements.ts";
import { cleanText, type TextMeasure } from "./metrics.ts";
import { unscoped } from "./numbers.ts";
import { type Entry, type Measured, type Scope, type Styled, shown } from "./traversal.ts";

/** A name and its text: what one line or ancestor line gives its row of the name column. */
export interface NameItem {
  readonly name: Styled;
  readonly text: string;
}

/** The one text of a row of the name column (section 6.6), before its row's ordinate is known. */
export interface RowName {
  /** The first displayed name of the row, whose address, style and font size the text takes. */
  readonly first: Styled;
  readonly text: string;
  readonly width: number;
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

/** The names a row's lines give it, in their order: a segment's line gives none (section 6.6). */
export const lineNames = (lines: readonly Entry[]): NameItem[] =>
  lines
    .filter((line) => !line.segment)
    .map((line) => ({ name: line.name, text: nameOf(line.manifest) }));

/**
 * The text of a row of the name column (section 6.6): the displayed names
 * of `items`, in order, joined by `, `, or the `content` of the first of
 * them when it is not `none`, cut to that name's `max-width`; `undefined`
 * when no name is displayed, so the row has no text.
 */
export function rowName(scope: Scope, items: readonly NameItem[]): RowName | undefined {
  const { measure } = scope;
  const visible = items.filter((item) => shown(item.name.style));
  const firstItem = visible[0];
  if (firstItem === undefined) return undefined;
  const first = firstItem.name;
  const source =
    first.style.content === "none"
      ? visible.map((item) => item.text).join(", ")
      : first.style.content;
  const size = first.style["font-size"];
  const text = cutText(measure, cleanText(source), size, first.style["max-width"]);
  return { first, text, width: measure.width(text, size) };
}

/**
 * A row's text drawn at the name column `n`, vertically centred on the
 * row's ordinate `y`: its baseline at `y + (a(s) − d(s)) / 2`, `s` its font
 * size (section 6.6).
 */
export function nameElement(scope: Scope, name: RowName, n: number, y: number): TextElement {
  const { a, d } = scope;
  const size = name.first.style["font-size"];
  return {
    type: "name",
    address: name.first.address,
    style: name.first.style,
    x: n,
    baseline: y + (a(size) - d(size)) / 2,
    anchor: "start",
    text: name.text,
  };
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
