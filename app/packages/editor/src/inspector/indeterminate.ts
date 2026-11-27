/**
 * The mixed look of a checkbox: indeterminate while what it shows holds for
 * some of its elements and not for others, a property no attribute sets.
 */

import type { Attachment } from "svelte/attachments";

/** An attachment making its checkbox indeterminate while `mixed`, and not otherwise. */
export function indeterminate(mixed: boolean): Attachment<HTMLInputElement> {
  return (input) => {
    input.indeterminate = mixed;
  };
}
