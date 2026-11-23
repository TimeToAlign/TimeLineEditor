/** A block's drawing, memoized by the identity of its inputs and by its placement, and where its node lies. */

import type { Block } from "@timetoalign/tilie-core";
import { containersOf } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox, View } from "@timetoalign/tilie-layout";
import { DEFAULT_LAYER, draw, manifestLayer } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { toDescriptors } from "@timetoalign/tilie-writers";
import type { FontMetrics, Graphical } from "@timetoalign/timetoshare";
import { isAncestorCard } from "./boxes.ts";
import type { PaneSource } from "./pane.ts";

interface Memo {
  readonly graphical: Graphical;
  readonly metrics: FontMetrics;
  /** The pane it was drawn for; `undefined` for layout's default view. */
  readonly view: View | undefined;
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

/** The one string form of a placement's values and the pane, `-0` told apart from `0`. */
function placementKey(
  { length, spacing, margin, width, height, places }: Placement,
  view: View | undefined,
): string {
  return JSON.stringify(
    [length, spacing, margin, width, height, places, view?.width, view?.height],
    (_key, value) => (Object.is(value, -0) ? "-0" : value),
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
 * (`manifestLayer`: its styles and rules), from lowest to highest, for the
 * pane `pane` of the canvas showing it (its `view`, the placement's `view`;
 * layout's default view without one) where the manifest draws an ancestor
 * card, whose automatic proportion alone reads it (and only then is the
 * pane read, so a reaction drawing any other manifest never follows it). Blocks are
 * immutable, so the drawing is memoized per block and redrawn only when the
 * workspace's `graphical`, the metrics or the pane change.
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
  pane?: PaneSource,
): Drawing {
  const manifest = overrides?.manifest ?? block.manifest;
  // Only an ancestor card's default proportion reads the pane (section 8.9): a manifest drawing
  // none is drawn once, whatever the pane.
  const view = containersOf(manifest).ancestorCards.length === 0 ? undefined : pane?.view;
  if (overrides === undefined) {
    const memo = drawings.get(block);
    if (
      memo !== undefined &&
      memo.graphical === graphical &&
      memo.metrics === metrics &&
      memo.view === view
    ) {
      return memo.drawing;
    }
  }
  const placement = { ...block, ...overrides };
  let recent = placed.get(placement.manifest);
  if (recent === undefined) {
    recent = new Map();
    placed.set(placement.manifest, recent);
  }
  const key = placementKey(placement, view);
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
        ...(view === undefined ? {} : { view }),
      },
      styleLayers(graphical, placement.manifest),
      metrics,
    );
    memo = { graphical, metrics, view, drawing };
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
