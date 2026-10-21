/** What a block node and the canvas's controls ask of the canvas while the user edits. */

import type { BlockId, Command, View } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { createContext } from "svelte";
import type { LevelRules } from "./containers.ts";
import type { GestureSlot } from "./gesture.ts";

/**
 * What a block is drawn with while a gesture is under way, before anything
 * is stored: the view the gesture's command gives (core's `preview`), whose
 * block of the same id is drawn in place of the stored one.
 */
export interface NodePreview {
  readonly view: View;
}

/** The canvas's side of an edit made inside a block node or with a resize handle. */
export interface NodeActions {
  /** Runs a command; the canvas shows a refusal in the status line. */
  dispatch(command: Command): void;
  /** Selects one address, replacing the selection: the press that starts a gesture. */
  select(address: string): void;
  /** Draws the block with the preview, or as it is stored when the preview is null. */
  preview(block: BlockId, preview: NodePreview | null): void;
  /** The font metrics the canvas lays blocks out with. */
  readonly metrics: FontMetrics;
  /** The workspace view the canvas currently shows as stored. */
  view(): View;
  /** The canvas zoom: screen pixels per canvas unit. */
  zoom(): number;
  /** What the canvas allows now, the lock and the read-only mode applied (`rulesOf`). */
  rules(): LevelRules;
  /** Whether the reader prefers reduced motion, under which nothing in a drawing slides. */
  reducedMotion(): boolean;
  /** The gesture in progress on this canvas, which Escape ends. */
  readonly gestures: GestureSlot;
}

export const [getNodeActions, setNodeActions] = createContext<NodeActions>();
