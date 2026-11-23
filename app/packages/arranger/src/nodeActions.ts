/** What a block node and the canvas's controls ask of the canvas while the user edits. */

import type { Address, BlockId, Command, View } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { createContext } from "svelte";
import type { LevelRules } from "./containers.ts";
import type { GestureSlot } from "./gesture.ts";
import type { MatchPaint } from "./matches.ts";
import type { PaneSource } from "./pane.ts";

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
  /**
   * Shows in the canvas's status region why a gesture stored nothing, where
   * no command was refused: a drop the arrangement's rules refuse. Left out,
   * the reason is not shown.
   */
  refuse?(message: string): void;
  /** Selects one address, replacing the selection: the press that starts a gesture. */
  select(address: Address): void;
  /** Draws the block with the preview, or as it is stored when the preview is null. */
  preview(block: BlockId, preview: NodePreview | null): void;
  /** The font metrics the canvas lays blocks out with. */
  readonly metrics: FontMetrics;
  /** The pane the canvas's drawings are fitted to (`Pane.view`); `undefined` before it is measured. */
  pane(): PaneSource | undefined;
  /** The workspace view the canvas currently shows as stored. */
  view(): View;
  /** The canvas zoom: screen pixels per canvas unit. */
  zoom(): number;
  /** What the canvas allows now, the lock and the read-only mode applied (`rulesOf`). */
  rules(): LevelRules;
  /** Whether the reader prefers reduced motion, under which nothing in a drawing slides. */
  reducedMotion(): boolean;
  /**
   * Whether block `block` is drawn at a preview: a gesture's or a transient
   * command's. Its drawing then follows the pointer or the control, so no
   * change of it moves by itself (decision record 0034).
   */
  previewing(block: BlockId): boolean;
  /**
   * Whether "Show coordinates" is on: every part of a named timestamp (its
   * wedge, its labels, its line, the canvas's wedge for one that draws
   * nothing) then lets the pointer through, so the coordinate gesture gets
   * it.
   */
  coordinates(): boolean;
  /**
   * Whether "Show matches" is on: every part of a named MatchStamp (an
   * alignment anchor's line and label) and of a match timestamp then lets
   * the pointer through, so the canvas reads the potential MatchStamps there.
   */
  matches(): boolean;
  /**
   * How block `block`'s named MatchStamps are painted over their style while
   * a MatchClaim table is loaded for it (`namedPaint`): each anchor's line by
   * the belief in the MatchClaims stating it, one out of date all red;
   * nothing without a table.
   */
  matchPaint(block: BlockId): MatchPaint;
  /** The gesture in progress on this canvas, which Escape ends. */
  readonly gestures: GestureSlot;
}

export const [getNodeActions, setNodeActions] = createContext<NodeActions>();
