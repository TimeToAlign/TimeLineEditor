/**
 * The flag of a cut name: a row's name the drawing cuts to its `max-width`
 * (`docs/drawing.md` in TimeToShare, section 6.6) shown whole while the
 * pointer is on it, on an opaque box over what lies behind. The name finds
 * its whole text by its address, through the drawn element its descriptor
 * names. An overlay over a block's drawing, like the marks: no element of
 * the drawing.
 */

import type { DrawnElement, TextMeasure } from "@timetoalign/tilie-layout";

/** The flag's box reaches this share of the font size beyond the whole text on every side. */
export const NAME_FLAG_PADDING = 0.25;

/** The whole text of a cut name, where it is drawn, in the drawing's units. */
export interface NameFlag {
  readonly text: string;
  /** The opaque box behind the text: from the name's start, the whole text's width, its line's height. */
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** The name's own text attributes, its address's left out, so the flag is never read as the name. */
  readonly attributes: Readonly<Record<string, string>>;
}

/**
 * The flag of `element` drawn with `attributes`: its whole text on its
 * box, padded by `NAME_FLAG_PADDING` of its font size, the text where the
 * name's is (same start, baseline, size and fill); `null` for anything but
 * a cut name, whose whole text the drawing already shows.
 */
export function nameFlagOf(
  element: DrawnElement | undefined,
  attributes: Readonly<Record<string, string>>,
  measure: TextMeasure,
): NameFlag | null {
  if (element?.type !== "name" || element.whole === undefined) return null;
  const size = element.style["font-size"];
  const padding = NAME_FLAG_PADDING * size;
  return {
    text: element.whole,
    box: {
      x: element.x - padding,
      y: element.baseline - measure.ascent(size) - padding,
      width: measure.width(element.whole, size) + 2 * padding,
      height: measure.lineHeight(size) + 2 * padding,
    },
    attributes,
  };
}
