/** What a block node asks of the canvas while the user edits inside it. */

import type { Block, BlockId, Command, Manifest, View } from "@timetoalign/tilie-core";
import type { TextMeasure } from "@timetoalign/tilie-layout";
import { createContext } from "svelte";

/** What a block is drawn with while a drag is under way, before any command runs. */
export interface NodePreview {
  /** The places of the block's items, as the dragged item would leave them. */
  readonly places?: Block["places"];
  /** The block's manifest, as the dragged member would leave it. */
  readonly manifest?: Manifest;
}

/** The canvas's side of an edit made inside a block node. */
export interface NodeActions {
  /** Runs a command; the canvas shows a refusal in the status line. */
  dispatch(command: Command): void;
  /** Selects one element, replacing the selection: the press that starts a drag. */
  select(address: string): void;
  /** Draws the block with the preview, or as it is when the preview is null. */
  preview(block: BlockId, preview: NodePreview | null): void;
  /** The text measure the canvas lays blocks out with. */
  readonly metrics: TextMeasure;
  /** The workspace view the canvas currently shows. */
  view(): View;
  /** The canvas zoom: screen pixels per canvas unit. */
  zoom(): number;
  /** Whether the canvas is locked: a press still selects, and nothing is moved. */
  locked(): boolean;
  /** Whether the reader prefers reduced motion, under which nothing in a drawing slides. */
  reducedMotion(): boolean;
}

export const [getNodeActions, setNodeActions] = createContext<NodeActions>();
