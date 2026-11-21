/**
 * The alignment anchors of the named MatchStamps (`docs/drawing.md` in
 * TimeToShare, sections 2, 2.1, 2.2 and 8.7): each the shortest line
 * between the cross-section segments of its two timestamps, drawn after
 * every item, and the MatchStamp's name at its midpoint.
 */

import { idAddress, type Manifest, partAddress } from "@timetoalign/tilie-core";
import { BLOCK_KEY, type ElementKey, textKey, unownedKey } from "@timetoalign/tilie-core/drawing";
import { type CrossSectionSegment, timestampSegments } from "./axes.ts";
import type { DrawnAxis } from "./boxes.ts";
import type { Cascade, Style } from "./cascade.ts";
import type { AnchorElement, TextElement } from "./elements.ts";
import { cleanText, type TextMeasure } from "./metrics.ts";
import { shown } from "./traversal.ts";

/** A line from `(x1, y1)` to `(x2, y2)`, in block-local canvas units. */
export interface AnchorLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * The shortest line from the cross-section segment `a` to `b` (section
 * 8.7): horizontal at the middle of their vertical overlap where they
 * overlap, else from the nearer end of `a` to the nearer end of `b`.
 */
function shortestBetween(a: CrossSectionSegment, b: CrossSectionSegment): AnchorLine {
  const lo = Math.max(a.y1, b.y1);
  const hi = Math.min(a.y2, b.y2);
  if (lo <= hi) {
    const ym = (lo + hi) / 2;
    return { x1: a.x, y1: ym, x2: b.x, y2: ym };
  }
  return a.y2 < b.y1
    ? { x1: a.x, y1: a.y2, x2: b.x, y2: b.y1 }
    : { x1: a.x, y1: a.y1, x2: b.x, y2: b.y2 };
}

/**
 * The line of an alignment anchor whose first timestamp has the
 * cross-section segments `first` and its second `second` (section 8.7), from
 * a segment of the first to one of the second: of the shortest line between
 * each pair of one segment of each, the one whose `dx × dx + dy × dy` is
 * smallest, of equal ones the first in the order of `first`, then of
 * `second`; null where either has none. A line of no length is returned
 * too: its midpoint still places the anchor's label. The one geometry of an
 * alignment anchor, for a named MatchStamp's and for any other drawn between
 * two positions of two drawn lines (`crossSectionSegment`).
 */
export function anchorLine(
  first: readonly CrossSectionSegment[],
  second: readonly CrossSectionSegment[],
): AnchorLine | null {
  let best: AnchorLine | null = null;
  let bestSquare = Number.POSITIVE_INFINITY;
  for (const a of first) {
    for (const b of second) {
      const line = shortestBetween(a, b);
      const dx = line.x2 - line.x1;
      const dy = line.y2 - line.y1;
      const square = dx * dx + dy * dy;
      if (square < bestSquare) {
        best = line;
        bestSquare = square;
      }
    }
  }
  return best;
}

/**
 * The key of the line of the alignment anchor `id`: held by the block,
 * belonging to no timeline (section 2.1).
 */
function anchorKey(id: string): ElementKey {
  // Core's key of an element the block holds, its holder chain `[block]`, under this type.
  return { ...unownedKey("frame", idAddress(id), BLOCK_KEY), type: "alignment_anchor" };
}

/**
 * The elements of the alignment anchors of `manifest`'s named MatchStamps
 * (section 8.7), the drawn lines `axes` in block coordinates and `block` the
 * block's style: first every anchor's line, MatchStamp by MatchStamp in the
 * order of `matchstamps` and each one's anchors in the order of its
 * `alignment_anchors`, then their labels in the same order. A line is drawn
 * when its anchor's `display` lists `line`, it is displayed and it has a
 * length; the MatchStamp's name, a label addressed `{id: A, part:
 * ["name"]}` and held by the line, when `display` lists `name` and it is
 * displayed, centred on the line's midpoint with its baseline at `ym + (a(s)
 * − d(s)) / 2`. An anchor one of whose timestamps has no cross-section
 * segment draws nothing. Neither takes room.
 */
export function anchorElements(
  manifest: Manifest,
  axes: readonly DrawnAxis[],
  cascade: Cascade,
  block: Style,
  measure: TextMeasure,
): (AnchorElement | TextElement)[] {
  const lines: AnchorElement[] = [];
  const labels: TextElement[] = [];
  for (const matchstamp of manifest.graphical?.matchstamps ?? []) {
    for (const anchor of matchstamp.alignment_anchors) {
      const [first, second] = anchor.timestamps;
      const line = anchorLine(timestampSegments(axes, first), timestampSegments(axes, second));
      if (line === null) continue;
      const display = anchor.display ?? ["line"];
      const key = anchorKey(anchor.id);
      const style = cascade.resolve(key, block);
      const { x1, y1, x2, y2 } = line;
      if (display.includes("line") && shown(style) && (x1 !== x2 || y1 !== y2)) {
        lines.push({ type: "alignment_anchor", address: key.address, ...line, style });
      }
      if (!display.includes("name")) continue;
      const address = partAddress(idAddress(anchor.id), "name");
      const labelStyle = cascade.resolve({ ...textKey(key, "label"), address }, style);
      if (!shown(labelStyle)) continue;
      const size = labelStyle["font-size"];
      const text = cleanText(matchstamp.name);
      measure.width(text, size);
      const ym = (y1 + y2) / 2;
      labels.push({
        type: "label",
        address,
        style: labelStyle,
        x: (x1 + x2) / 2,
        baseline: ym + (measure.ascent(size) - measure.descent(size)) / 2,
        anchor: "middle",
        text,
      });
    }
  }
  return [...lines, ...labels];
}
