/**
 * @timetoalign/tilie-arranger: the canvas. A workspace view becomes one
 * Svelte Flow node per block; every completed gesture on those nodes
 * becomes one workspace command.
 */

export const name = "@timetoalign/tilie-arranger" as const;

export { affectedBy, movedByGap } from "./affected.ts";
// Components
export { default as BlockNodeComponent } from "./BlockNode.svelte";
export type { BandDirection } from "./bands.ts";
export { bandAt, bandDrop, bandMoveCommand, bandStep, offeredBands } from "./bands.ts";
export type { BoxKind, DrawingPoint, Hit, Hover } from "./boxes.ts";
export { bandTimelineOf, drawingPointAt, hitOf, hoverOf, selectionOf } from "./boxes.ts";
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
export type { Editing, Gestures, Level, Reach, ResizedKind, Resizing, Written } from "./editors.ts";
export {
  editedElement,
  editorTargetOf,
  GESTURES,
  gesturesOf,
  RESIZING,
  resizes,
  sameEditing,
} from "./editors.ts";
export type { Viewport } from "./focus.ts";
export {
  FOCUS_DURATION,
  FOCUS_MARGIN,
  FOCUS_MAX_ZOOM,
  FOCUS_MIN_ZOOM,
  focusViewport,
  targetBounds,
} from "./focus.ts";
export { default as GapMenu } from "./GapMenu.svelte";
export type {
  ItemDragOptions,
  MemberDragOptions,
  Point,
  ResizedItem,
} from "./gestures.svelte.ts";
export { CLICK_DISTANCE, itemDrag, listen, memberDrag, resizeModes } from "./gestures.svelte.ts";
export type { PlaceChanges, PlaceValues } from "./items.ts";
export {
  itemHandlesFor,
  itemMoveCommand,
  itemOf,
  itemResizeCommand,
  itemResizeValues,
  itemsMovedWith,
  keepsItems,
  placeCommand,
  placesAfter,
  placesWith,
  resizedItemOf,
  stretchChanges,
} from "./items.ts";
export type { LiveStore } from "./liveStore.svelte.ts";
export { liveStore } from "./liveStore.svelte.ts";
export type { ElementOnly, Rect } from "./marquee.ts";
export { elementBounds, elementsInRect, isElementOnly, onCanvas } from "./marquee.ts";
export type { Matrix } from "./motion.ts";
export { drawingMatrix, offsetIn, pointIn, screenMatrix, slide } from "./motion.ts";
export type { NodeActions, NodePreview } from "./nodeActions.ts";
export { getNodeActions, setNodeActions } from "./nodeActions.ts";
export { GRID_FREE, MIN_LENGTH, MIN_SCALE, MIN_SPACING, quantize } from "./numbers.ts";
export type { BlockNode, BlockNodeData, GapPreview, LivePlacement } from "./project.ts";
export { insideOf, livePlacement, nodePosition, project } from "./project.ts";
export { default as ResizeToolbar } from "./ResizeToolbar.svelte";
export { memberOrderAt, reorderCommand, withMemberOrder } from "./reorder.ts";
export type { Delta, Handle, ResizeMode } from "./resize.ts";
export { blockStretchPlaces, handlesFor, kept, resize, resizeCommand } from "./resize.ts";
export { default as SnapGuides } from "./SnapGuides.svelte";
export type { SelectedBand, Selection } from "./selection.ts";
export { blockOf, click, existing, offersBand, selectedBand } from "./selection.ts";
export type { Box, Guide } from "./snap.ts";
export { snap } from "./snap.ts";
