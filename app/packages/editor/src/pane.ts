/**
 * The canvas's pane, shared with what the editor draws beside it: the
 * editor makes one `Pane`, gives it to the canvas (`Canvas`'s `pane`),
 * which measures it, and provides it through component context, so that
 * the inspector reads every block in the drawing the canvas shows (the
 * automatic proportion of an ancestor card's elisions depends on the
 * pane's size). A component mounted without the editor reads no pane, and
 * its drawings take layout's default view.
 */

import type { Pane } from "@timetoalign/tilie-arranger";
import { getContext, setContext } from "svelte";

const PANE = Symbol("pane");

/** Give the components below the calling one `pane`; called while the component is made. */
export function providePane(pane: Pane): void {
  setContext(PANE, pane);
}

/**
 * The pane a component above the calling one provides, else `undefined`
 * (layout's default view); called while the component is made.
 */
export function paneOf(): Pane | undefined {
  return getContext<Pane | undefined>(PANE);
}

/** The component context that provides `pane`, for a component mounted on its own (`mount`'s `context`). */
export function paneContext(pane: Pane): Map<symbol, Pane> {
  return new Map([[PANE, pane]]);
}
