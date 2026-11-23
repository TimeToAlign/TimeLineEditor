/**
 * `draw(manifest, placement, layers, metrics)`: the drawing of one
 * TimeToShare manifest (`docs/drawing.md` in TimeToShare). Every manifest
 * is drawn as one block (section 8): each timeline drawn as a root lies in its
 * own card and is laid out by sections 3 to 6, and each item of the block, a
 * frame or an ungrouped root's card, applies the block's one horizontal layout
 * and is drawn at its own place and scale.
 */

import { indexOf, isNamed, type Manifest, TITLE_ADDRESS } from "@timetoalign/tilie-core";
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
import { alignedRows, ancestorCards, type LaidAncestorCard } from "./block/ancestors.ts";
import { rowLayout } from "./block/arrangement.ts";
import { emitDrawing } from "./block/emit.ts";
import { columnsOf, horizontalOf } from "./block/horizontal.ts";
import { drawItem, type LaidItem, layoutItem } from "./block/items.ts";
import { placeItems, titleOf } from "./block/places.ts";
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
 * out by it; the displayed ancestor cards are laid out behind their frames
 * (section 8.8); the block is grown around them all; the lines its groupstamps
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
 */
export function draw(
  manifest: Manifest,
  placement: Placement,
  layers: readonly (Graphical | undefined)[],
  metrics: FontMetrics,
): Drawing {
  const measure = new TextMeasure(metrics);
  const cascade = new Cascade(layers, indexOf(manifest).ancestry);
  const context: Context = { manifest, placement, cascade, measure };
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
    // again once the block's columns place the ancestor cards behind them; nothing else moves.
    const order = arrangement === undefined ? {} : { order: arrangement.row };
    const placed = placeItems(context, block, Pt, new Map(), [], order);
    const { aligned, alone } = alignedRows(context, block, placed, columnsOf(placed));
    const items =
      aligned.size === 0 ? placed : placeItems(context, block, Pt, aligned, placed, order);
    const columns = columnsOf(items);
    const drawings = items.map((item) => drawItem(manifest, item, columns));
    // A frame with group elisions is drawn shorter by its gaps' shrinks (section 8.2).
    const horizontal = horizontalOf(
      columns,
      items,
      drawings.flatMap(({ item, drawn }) =>
        drawn.map(({ elements }) => ({ elements, L: item.length - item.DG })),
      ),
      measure,
    );
    laid = drawings.map((drawing) => layoutItem(drawing, horizontal, measure));
    ancestors = ancestorCards(context, block, items, drawings, laid, horizontal, measure, alone);
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
