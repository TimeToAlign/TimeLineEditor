/**
 * `draw(manifest, placement, layers, metrics, reading)`: the drawing of one
 * TimeToShare manifest (`docs/drawing.md` in TimeToShare). Every manifest
 * is drawn as one block (section 8): each timeline drawn as a root lies in its
 * own card and is laid out by sections 3 to 6, and each item of the block, a
 * frame or an ungrouped root's card, applies the block's one horizontal layout
 * and is drawn at its own place and scale.
 */

import {
  type FlowReading,
  indexOf,
  isNamed,
  type Manifest,
  placeKeyText,
  TITLE_ADDRESS,
} from "@timetoalign/tilie-core";
import {
  type ArrangementConflict,
  BLOCK_KEY,
  isArrangementConflict,
  itemOrder,
  type Row,
  rowOf,
} from "@timetoalign/tilie-core/drawing";
import type { FontMetrics, Graphical } from "@timetoalign/timetoshare";
import { anchorElements } from "./anchors.ts";
import {
  alignedRows,
  ancestorCards,
  elidedRoots,
  frameBoxes,
  type LaidAncestorCard,
} from "./block/ancestors.ts";
import { rowLayout } from "./block/arrangement.ts";
import { emitDrawing } from "./block/emit.ts";
import { type LaidItem, laidOut } from "./block/items.ts";
import { placeItems, type Reach, titleOf } from "./block/places.ts";
import type { DrawnAxis, DrawnBox } from "./boxes.ts";
import { Cascade } from "./cascade.ts";
import { F, P } from "./constants.ts";
import type { Drawing, DrawnArrangement, Placement } from "./elements.ts";
import { groupstampElements } from "./groupstamps.ts";
import { TextMeasure } from "./metrics.ts";
import type { Context, Holder } from "./traversal.ts";

/**
 * Draw one manifest as one block (section 8): its title, its groups as frames
 * and its ungrouped roots as cards, each item at its place (section 8.6).
 * The items are placed and their member drawings laid out; the block's one
 * horizontal layout is found over every member drawing; each item is laid
 * out by it; where ancestor cards are drawn behind frames, their roots are
 * laid out alone on their elided axes, reading the frames so laid out, and
 * the member cards below them laid out again with their ancestor rows at the
 * heights of those layouts (section 8.3); the displayed ancestor cards are
 * laid out behind their frames (section 8.8), and every item after a frame whose cards reach
 * beyond it placed again below them; the block is grown around them all; the lines its groupstamps
 * draw across the members of their groups' frames, then the alignment
 * anchors of its named MatchStamps are drawn last, over everything (section
 * 8.7).
 *
 * An arranged block (sections 8.6 and 8.8) takes its items in the
 * arrangement's item order, each at its default place; side by side, in the
 * row core's `rowOf` gives, every root that groups hang on drawn once behind
 * it; where `rowOf` refuses the row, one under another in the item order. The
 * drawing states the arrangement.
 *
 * `manifest` is in canonical order, as every manifest core reads or settles
 * is: the drawing follows the order of its arrays and never copies it. Its
 * timelines' ancestry and its containers are read from core's index of the
 * manifest, memoised by identity, so drawing one manifest again reuses them.
 *
 * `reading` is the reading in force of flow control (section 1); `null`, the
 * default, reads what no actor believes `false`. A flow-control element it
 * does not read is faded, starts no section and is no place a destination
 * lands on (sections 3.1, 6.4).
 */
export function draw(
  manifest: Manifest,
  placement: Placement,
  layers: readonly (Graphical | undefined)[],
  metrics: FontMetrics,
  reading: FlowReading | null = null,
): Drawing {
  const measure = new TextMeasure(metrics);
  const cascade = new Cascade(layers, indexOf(manifest).ancestry);
  const context: Context = { manifest, placement, cascade, measure, reading };
  const block: Holder = { key: BLOCK_KEY, style: cascade.resolve(BLOCK_KEY, undefined) };

  // The manifest's title: its name, else its id; a manifest with neither has none. `Pt` (section
  // 8.4): no item rises above F and the block's margin below the title's slot, and the first
  // default top lies there.
  const title = isNamed(manifest)
    ? titleOf(context, TITLE_ADDRESS, manifest.id ?? "", manifest.name, block)
    : undefined;
  const margin = placement.margin ?? 0;
  const Pt = (title === undefined ? P : P + measure.lineHeight(title.size) + F) + margin;

  const { arrangement, row } = arranged(manifest, placement);
  let laid: readonly LaidItem[];
  let ancestors: readonly LaidAncestorCard[];
  if (row !== null) {
    const side = rowLayout(context, block, Pt, row, measure);
    laid = side.laid;
    ancestors = side.once;
  } else {
    // The member cards whose ancestor rows lie at their roots' heights (section 8.3) are laid out
    // again on the rows of the ancestor cards behind them, which read their frames as first laid
    // out; nothing else moves.
    const order = arrangement === undefined ? {} : { order: arrangement.row };
    const placed = placeItems(context, block, Pt, new Map(), [], order);
    const before = laidOut(context, placed, measure);
    const rootOf = elidedRoots(context, block, frameBoxes(before.laid), before.horizontal.s0);
    const aligned = alignedRows(
      context,
      block,
      placed,
      before.horizontal,
      (at) => rootOf(at)?.layout,
    );
    const rows =
      aligned.size === 0
        ? before
        : laidOut(context, placeItems(context, block, Pt, aligned, placed, order), measure);
    const behindRows = ancestorCards(
      context,
      block,
      rows.items,
      rows.drawings,
      rows.horizontal,
      measure,
      rootOf,
    );
    // An item lies so low that the ancestor cards behind the frames before it overlap none of its
    // own, nor its frame or card (section 8.8, No room); nothing but the items' places moves.
    const reaches = reachesOf(behindRows);
    const moved =
      reaches.size === 0
        ? rows.items
        : placeItems(context, block, Pt, new Map(), rows.items, order, reaches);
    const same = moved.every((item, index) => item.y === rows.items[index]?.y);
    const final = same ? rows : laidOut(context, moved, measure);
    laid = final.laid;
    ancestors = same
      ? behindRows
      : ancestorCards(
          context,
          block,
          final.items,
          final.drawings,
          final.horizontal,
          measure,
          rootOf,
        );
  }
  const after = (axes: readonly DrawnAxis[], boxes: readonly DrawnBox[]) => [
    ...groupstampElements(manifest, axes, boxes),
    ...anchorElements(manifest, axes, cascade, block.style, measure),
  ];
  const drawing = emitDrawing(
    laid,
    { style: block.style, title, Pt, margin, ancestors, after },
    placement,
    measure,
  );
  return arrangement === undefined ? drawing : { ...drawing, arrangement };
}

/**
 * How far the displayed ancestor cards behind each frame reach, in its item coordinates (section
 * 8.8, No room), by the frame's place key text: their least top (0 where none rises above the
 * frame) and their largest bottom edge, shadows not counted; none for a frame without them.
 */
function reachesOf(cards: readonly LaidAncestorCard[]): Map<string, Reach> {
  const reaches = new Map<string, Reach>();
  for (const card of cards) {
    const key = placeKeyText({ item: card.group });
    const known = reaches.get(key) ?? { top: 0, bottom: Number.NEGATIVE_INFINITY };
    reaches.set(key, {
      top: Math.min(known.top, card.y),
      bottom: Math.max(known.bottom, card.y + card.height),
    });
  }
  return reaches;
}

/**
 * The arrangement `placement` asks of `manifest` (sections 1 and 8.6): none,
 * or what the drawing states of it, and for `horizontal` the row core's
 * `rowOf` gives, null where it refuses the row, which is then drawn
 * `vertical` in the item order and states the conflict.
 */
function arranged(
  manifest: Manifest,
  placement: Placement,
): { readonly arrangement: DrawnArrangement | undefined; readonly row: Row | null } {
  const asked = placement.arrangement ?? null;
  if (asked === null) return { arrangement: undefined, row: null };
  const { direction, order } = asked;
  const items = itemOrder(manifest, order);
  if (direction === "vertical") {
    return { arrangement: { direction, row: items, roots: [] }, row: null };
  }
  const found: Row | ArrangementConflict = rowOf(manifest, order);
  if (isArrangementConflict(found)) {
    return { arrangement: { direction, row: items, roots: [], refused: found }, row: null };
  }
  return { arrangement: { direction, row: found.row, roots: found.roots }, row: found };
}
