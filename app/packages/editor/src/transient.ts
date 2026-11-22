/**
 * The way a control below the editor shows a value on the canvas before
 * committing it: the editor provides `showTransient` through component
 * context and hands what it is given to the canvas (`Canvas`'s
 * `transient`), which draws that block as the command leaves it and stores
 * nothing. A component mounted without the editor shows nothing.
 */

import type { TransientCommand } from "@timetoalign/tilie-arranger";
import { getContext, setContext } from "svelte";

/** Show `shown` on the canvas until the next call; `null` withdraws it. */
export type ShowTransient = (shown: TransientCommand | null) => void;

const TRANSIENT = Symbol("transient");

/** Shows nothing: no canvas is above the component. */
const SHOWN_NOWHERE: ShowTransient = () => {};

/** Give the components below the calling one `show`; called while the component is made. */
export function provideTransient(show: ShowTransient): void {
  setContext(TRANSIENT, show);
}

/**
 * The `showTransient` a component above the calling one provides, else one
 * showing nothing; called while the component is made.
 */
export function transientOf(): ShowTransient {
  return getContext<ShowTransient | undefined>(TRANSIENT) ?? SHOWN_NOWHERE;
}

/** The component context that provides `show`, for a component mounted on its own (`mount`'s `context`). */
export function transientContext(show: ShowTransient): Map<symbol, ShowTransient> {
  return new Map([[TRANSIENT, show]]);
}
