/**
 * @timetoalign/tilie-arranger: the canvas. A workspace view becomes one
 * Svelte Flow node per block; every completed gesture on those nodes
 * becomes one workspace command.
 */

export const name = "@timetoalign/tilie-arranger" as const;

export { affectedBy, movedByGap } from "./affected.ts";
// Components
export { default as BlockNodeComponent } from "./BlockNode.svelte";
export type { BoxKind, DrawingPoint, Hit, Hover } from "./boxes.ts";
export { hitOf, hoverOf, selectionOf } from "./boxes.ts";
export { default as Canvas } from "./Canvas.svelte";
export { default as CanvasToolbar } from "./CanvasToolbar.svelte";
export type { Move, SegmentDelete, Visible, ZOrderAction } from "./commands.ts";
export {
  addCommand,
  moveCommand,
  nudgeCommand,
  preferredGap,
  removeCommand,
  zOrderCommand,
} from "./commands.ts";
export { descriptorsOf, drawingOf, segmentAnchor } from "./drawing.ts";
export { default as GapMenu } from "./GapMenu.svelte";
export { GRID_FREE, MIN_LENGTH, MIN_SCALE, MIN_SPACING, quantize } from "./numbers.ts";
export type { BlockNode, BlockNodeData, GapPreview, LivePlacement } from "./project.ts";
export { livePlacement, project } from "./project.ts";
export { default as ResizeToolbar } from "./ResizeToolbar.svelte";
export type { Delta, Handle, ResizeMode } from "./resize.ts";
export { handlesFor, resize, resizeCommand } from "./resize.ts";
export { default as SnapGuides } from "./SnapGuides.svelte";
export type { Selection } from "./selection.ts";
export { blockOf, click, existing } from "./selection.ts";
export type { Box, Guide } from "./snap.ts";
export { snap } from "./snap.ts";
