/**
 * @timetoalign/tilie-arranger: the canvas. A workspace view becomes one
 * Svelte Flow node per block; every completed gesture on those nodes
 * becomes one workspace command.
 */

export const name = "@timetoalign/tilie-arranger" as const;

export { default as ArrangeMenu } from "./ArrangeMenu.svelte";
export type { ArrangeChoice, ArrangeMenuProps } from "./arrangeMenu.ts";
export { arrangeMenuOf } from "./arrangeMenu.ts";
export type { CardBox, ItemBox } from "./boxes.ts";
export { blockBox, boxOf, isHeld, isItem, keyedBox, raisedRoot } from "./boxes.ts";
export { default as Canvas } from "./Canvas.svelte";
export type { AxisBase, CardAxis, GapEdge } from "./cardAxis.ts";
export { cardAxisAt, cardAxisOf, exposureAt, zeroOf } from "./cardAxis.ts";
export { addCommand } from "./commands.ts";
export type { Level, PlaceField, PlaceProperty, Subject } from "./containers.ts";
export { fieldsOf, levelOf, resolveSelection } from "./containers.ts";
export type { KnotsOf, MeasureMapsAnswer } from "./coordinates.ts";
export { namedPin, readsGroup, rereadPin, timelinePin } from "./coordinates.ts";
export { drawingOf, styleLayers } from "./drawing.ts";
export type { Editing } from "./editing.ts";
export { changedPlace, placeChange } from "./editing.ts";
export type { FlowServer } from "./flowEditor.svelte.ts";
export type { FlowFindings } from "./flowEditor.ts";
export type { Viewport } from "./focus.ts";
export type { GapChange, GapPiece, GapSubject, StoredEntry } from "./gaps.ts";
export {
  defaultsRemoval,
  defaultsStored,
  gapCommand,
  gapOf,
  isDefaultGap,
  isGap,
  piecesOf,
  storedAs,
  storedElision,
  stretchText,
  subjectOf,
} from "./gaps.ts";
export type { ShownValues } from "./items.ts";
export { placeEdit, shownValues } from "./items.ts";
export { isTextInput, within } from "./keys.ts";
export type { LiveStore } from "./liveStore.svelte.ts";
export { liveStore } from "./liveStore.svelte.ts";
export type {
  MatchOverlayInput,
  MatchStampPin,
  NamedComparison,
  ScreenCoordinate,
} from "./matches.ts";
export { inScreenOrder, screenOrder, screenPlace } from "./matches.ts";
export type { LivePlacement, TransientCommand } from "./node.ts";
export { PANE_SETTLE, Pane } from "./pane.ts";
export { blocksInOrder } from "./project.ts";
export type { ResizeMode } from "./resize.ts";
export type { Selection } from "./selection.ts";
export {
  blockOf,
  editedSelection,
  existing,
  isSelected,
  NOTHING_SELECTED,
  selectionOf,
} from "./selection.ts";
