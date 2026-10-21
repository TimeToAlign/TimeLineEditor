/** A block's drawing, memoized by the identity of its inputs, and where its node lies. */

import type { Block, WorkspaceSettings } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { DEFAULT_LAYER, draw } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { toDescriptors } from "@timetoalign/tilie-writers";
import type { FontMetrics } from "@timetoalign/timetoshare";

interface Memo {
  readonly settings: WorkspaceSettings;
  readonly metrics: FontMetrics;
  readonly drawing: Drawing;
}

const drawings = new WeakMap<Block, Memo>();
const descriptors = new WeakMap<Drawing, readonly Descriptor[]>();

/**
 * The drawing of a block: its manifest drawn at its placement with the
 * default layer, the workspace's statements and the manifest's own, from
 * lowest to highest. Blocks are immutable, so the drawing is memoized per
 * block and redrawn only when the settings or the metrics change identity.
 * `overrides` replace members of the block's placement (a resize measuring
 * the content at another length or with no size request) and are never
 * memoized.
 */
export function drawingOf(
  block: Block,
  settings: WorkspaceSettings,
  metrics: FontMetrics,
  overrides?: Partial<Block>,
): Drawing {
  if (overrides === undefined) {
    const memo = drawings.get(block);
    if (memo !== undefined && memo.settings === settings && memo.metrics === metrics) {
      return memo.drawing;
    }
  }
  const placement = { ...block, ...overrides };
  const drawing = draw(
    placement.manifest,
    {
      length: placement.length,
      spacing: placement.spacing,
      width: placement.width,
      height: placement.height,
      places: placement.places,
    },
    [DEFAULT_LAYER, settings.graphical, placement.manifest.graphical],
    metrics,
  );
  if (overrides === undefined) drawings.set(block, { settings, metrics, drawing });
  return drawing;
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
