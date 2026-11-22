/** A block's drawing, memoized by the identity of its inputs and by its placement, and where its node lies. */

import type { Block } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import { DEFAULT_LAYER, draw, manifestLayer } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { toDescriptors } from "@timetoalign/tilie-writers";
import type { FontMetrics, Graphical } from "@timetoalign/timetoshare";
import { isAncestorCard } from "./boxes.ts";

interface Memo {
  readonly graphical: Graphical;
  readonly metrics: FontMetrics;
  readonly drawing: Drawing;
}

/** How many placements of one manifest keep their drawing. */
const RECENT = 32;

const drawings = new WeakMap<Block, Memo>();
/** Per manifest, the drawings of the placements drawn last, by `placementKey`, the latest last. */
const placed = new WeakMap<Block["manifest"], Map<string, Memo>>();
const descriptors = new WeakMap<Drawing, readonly Descriptor[]>();

/** The placement members a drawing depends on. */
type Placement = Pick<Block, "length" | "spacing" | "margin" | "width" | "height" | "places">;

/** The one string form of a placement's values, `-0` told apart from `0`. */
function placementKey({ length, spacing, margin, width, height, places }: Placement): string {
  return JSON.stringify([length, spacing, margin, width, height, places], (_key, value) =>
    Object.is(value, -0) ? "-0" : value,
  );
}

/** The style layers a block is drawn with: the defaults, the workspace's rules, then its manifest's. */
export function styleLayers(
  graphical: Graphical,
  manifest: Block["manifest"],
): (Graphical | undefined)[] {
  return [DEFAULT_LAYER, graphical, manifestLayer(manifest)];
}

/**
 * The drawing of a block: its manifest drawn at its placement with the
 * default layer, the workspace's `graphical` and the manifest's own
 * (`manifestLayer`: its styles and rules), from lowest to highest. Blocks are immutable, so the drawing is memoized per
 * block and redrawn only when the workspace's `graphical` or the metrics
 * change identity.
 * `overrides` replace members of the block's placement (a resize measuring
 * the content at another length or with no size request). Every drawing is
 * also kept by its manifest and its placement's values, the `RECENT` last
 * of a manifest: a resize measures one block at many placements on every
 * pointer move, and the block its preview stores draws one of them again.
 */
export function drawingOf(
  block: Block,
  graphical: Graphical,
  metrics: FontMetrics,
  overrides?: Partial<Block>,
): Drawing {
  if (overrides === undefined) {
    const memo = drawings.get(block);
    if (memo !== undefined && memo.graphical === graphical && memo.metrics === metrics) {
      return memo.drawing;
    }
  }
  const placement = { ...block, ...overrides };
  let recent = placed.get(placement.manifest);
  if (recent === undefined) {
    recent = new Map();
    placed.set(placement.manifest, recent);
  }
  const key = placementKey(placement);
  let memo = recent.get(key);
  recent.delete(key);
  if (memo === undefined || memo.graphical !== graphical || memo.metrics !== metrics) {
    const drawing = draw(
      placement.manifest,
      {
        length: placement.length,
        spacing: placement.spacing,
        margin: placement.margin,
        width: placement.width,
        height: placement.height,
        places: placement.places,
      },
      styleLayers(graphical, placement.manifest),
      metrics,
    );
    memo = { graphical, metrics, drawing };
  }
  recent.set(key, memo);
  for (const oldest of recent.keys()) {
    if (recent.size <= RECENT) break;
    recent.delete(oldest);
  }
  if (overrides === undefined) drawings.set(block, memo);
  return memo.drawing;
}

/** The element descriptors of a drawing, memoized by the drawing. */
export function descriptorsOf(drawing: Drawing): readonly Descriptor[] {
  let found = descriptors.get(drawing);
  if (found === undefined) {
    found = toDescriptors(drawing);
    descriptors.set(drawing, found);
  }
  return found;
}

/**
 * Where the node of `block` drawn as `drawing` lies: a block's `x`, `y` are
 * the canvas position of its place origin (`docs/drawing.md` in
 * TimeToShare, section 8.6), which lies at `drawing.origin` in the block, so
 * a block that grows left or up moves nothing it holds.
 */
export function nodePosition(
  block: Pick<Block, "x" | "y" | "scale">,
  drawing: Drawing,
): { x: number; y: number } {
  return {
    x: block.x - drawing.origin.x * block.scale,
    y: block.y - drawing.origin.y * block.scale,
  };
}

/** A raised ancestor card and the entries it draws, in drawing order. */
export interface RaisedCard<E> {
  readonly box: DrawnBox;
  readonly entries: readonly E[];
}

/**
 * The entries of a block in the layers it shows them in (`stackingOf`):
 * `below`, every entry no raised card draws, in drawing order, then each
 * displayed ancestor card of the root `root` (`raisedRoot`, or the root a
 * raise is folding back, `Unfolding.root`) in record order with the
 * entries it draws (its rectangle and its drawing, the record's range).
 * With no root, or a root without a displayed ancestor card, `below` is
 * `entries` itself (the same array) and nothing is raised. The drawing is
 * never changed: only the order and the layers the block shows it in.
 */
export function raisedLayers<E extends { readonly descriptor: Descriptor }>(
  entries: readonly E[],
  drawing: Drawing,
  root: string | null,
): { readonly below: readonly E[]; readonly raised: readonly RaisedCard<E>[] } {
  if (root === null) return { below: entries, raised: [] };
  const cards = drawing.boxes.filter((box) => isAncestorCard(box) && box.address.id === root);
  const holding = (entry: E) =>
    cards.find(({ range }) => {
      const { element } = entry.descriptor.source;
      return range.start <= element && element < range.end;
    });
  const raised = cards.flatMap((box) => {
    const drawn = entries.filter((entry) => holding(entry) === box);
    return drawn.length === 0 ? [] : [{ box, entries: drawn }];
  });
  if (raised.length === 0) return { below: entries, raised: [] };
  return { below: entries.filter((entry) => holding(entry) === undefined), raised };
}
