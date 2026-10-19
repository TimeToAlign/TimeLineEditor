/**
 * `draw(manifest, placement, layers, metrics)`: the drawing of one
 * TimeSkeleton manifest (`docs/drawing.md` in timeskeleton). Every manifest
 * is drawn as one box (section 8): each timeline drawn as a root lies in its
 * own card and is laid out by sections 3 to 6, and each item of the box, a
 * frame or an ungrouped root's card, applies the box's one horizontal layout
 * and is drawn at its own place and scale.
 */

import { indexOf, isNamed, type Manifest, TITLE_ADDRESS } from "@timetoalign/tilie-core";
import { BOX_KEY } from "@timetoalign/tilie-core/drawing";
import type { FontMetrics, Graphical } from "@timetoalign/timeskeleton";
import { emitDrawing } from "./box/emit.ts";
import { columnsOf, horizontalOf } from "./box/horizontal.ts";
import { drawItem, layoutItem } from "./box/items.ts";
import { placeItems, titleOf } from "./box/places.ts";
import { Cascade } from "./cascade.ts";
import { F, P } from "./constants.ts";
import type { Drawing, Placement } from "./elements.ts";
import { TextMeasure } from "./metrics.ts";
import type { Context, Holder } from "./traversal.ts";

/**
 * Draw one manifest as one box (section 8): its title, its groups as frames
 * and its ungrouped roots as cards, each item at its place (section 8.6).
 * The items are placed and their member drawings laid out; the box's one
 * horizontal layout is found over every member drawing; each item is laid
 * out by it; the box is grown around them.
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
  const box: Holder = { key: BOX_KEY, style: cascade.resolve(BOX_KEY, undefined) };

  // The manifest's title: its name, else its id; a manifest with neither has none. `Pt` (section
  // 8.4): no item rises above F below the title's slot, and the first default top lies there.
  const title = isNamed(manifest)
    ? titleOf(context, TITLE_ADDRESS, manifest.id ?? "", manifest.name, box)
    : undefined;
  const Pt = title === undefined ? P : P + measure.lineHeight(title.size) + F;

  const items = placeItems(context, box, Pt);
  const columns = columnsOf(items);
  const drawings = items.map((item) => drawItem(item, columns));
  const horizontal = horizontalOf(
    columns,
    items,
    drawings.flatMap(({ item, drawn }) =>
      drawn.map(({ elements }) => ({ elements, L: item.length })),
    ),
    measure,
  );
  const laid = drawings.map((drawing) => layoutItem(drawing, horizontal, measure));
  return emitDrawing(laid, { style: box.style, title, Pt }, placement, measure);
}
