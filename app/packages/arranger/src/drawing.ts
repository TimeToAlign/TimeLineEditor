/** A block's drawing, memoized by the identity of its inputs. */

import type { Block, WorkspaceSettings } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { DEFAULT_LAYER, draw } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { toDescriptors } from "@timetoalign/tilie-writers";
import type { FontMetrics } from "@timetoalign/timeskeleton";

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
 * A `preview` overrides members of the block, its places or its manifest (a
 * reorder drawn before it is dropped) among them, and is never memoized.
 */
export function drawingOf(
  block: Block,
  settings: WorkspaceSettings,
  metrics: FontMetrics,
  preview?: Partial<Block>,
): Drawing {
  if (preview === undefined) {
    const memo = drawings.get(block);
    if (memo !== undefined && memo.settings === settings && memo.metrics === metrics) {
      return memo.drawing;
    }
  }
  const placement = { ...block, ...preview };
  const drawing = draw(
    placement.manifest,
    {
      length: placement.length,
      spacing: placement.spacing,
      width: placement.width,
      height: placement.height,
      order: placement.order,
      bands: placement.bands,
      places: placement.places,
    },
    [DEFAULT_LAYER, settings.graphical, placement.manifest.graphical],
    metrics,
  );
  if (preview === undefined) drawings.set(block, { settings, metrics, drawing });
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
 * Where a segment is drawn, in drawing units, for a menu placed below it:
 * its label (centred, at the baseline), else the foot of its boundary, else
 * the middle of its line; `null` when the drawing shows none of them.
 */
export function segmentAnchor(drawing: Drawing, id: string): { x: number; y: number } | null {
  let boundary: { x: number; y: number } | null = null;
  let line: { x: number; y: number } | null = null;
  for (const element of drawing.elements) {
    if (element.type === "label" && element.address === `${id}/label`) {
      return { x: element.x, y: element.baseline };
    }
    if (element.type === "boundary" && element.address === `${id}/start`) {
      boundary = { x: element.x, y: element.y2 };
    }
    if (element.type === "child" && element.address === id) {
      line = { x: (element.xs + element.xe) / 2, y: element.y };
    }
  }
  return boundary ?? line;
}
