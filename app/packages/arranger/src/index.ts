/**
 * @timetoalign/tilie-arranger: the canvas. A workspace view becomes one
 * Svelte Flow node per block; every completed gesture on those nodes
 * becomes one workspace command.
 */

export const name = "@timetoalign/tilie-arranger" as const;

export type { CardBox, ItemBox } from "./boxes.ts";
export { boxOf, isHeld, isItem } from "./boxes.ts";
export { default as Canvas } from "./Canvas.svelte";
export { addCommand } from "./commands.ts";
export type { Level, PlaceField, PlaceProperty, Subject } from "./containers.ts";
export { fieldsOf, resolveSelection } from "./containers.ts";
export { drawingOf } from "./drawing.ts";
export type { Editing } from "./editing.ts";
export type { Viewport } from "./focus.ts";
export type { ShownValues } from "./items.ts";
export { placeEdit, shownValues } from "./items.ts";
export { isTextInput, within } from "./keys.ts";
export type { LiveStore } from "./liveStore.svelte.ts";
export { liveStore } from "./liveStore.svelte.ts";
export type { LivePlacement } from "./project.ts";
export type { ResizeMode } from "./resize.ts";
export type { Selection } from "./selection.ts";
export { blockOf, existing } from "./selection.ts";
