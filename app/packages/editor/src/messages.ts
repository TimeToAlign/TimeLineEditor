/** The messages the editor shows the viewer, and the text of a failure in one. */

import type { Problem } from "@timetoalign/tilie-core";

/** One message: what failed, and the reader's problems when there are any. */
export interface Message {
  readonly id: number;
  readonly text: string;
  readonly problems: readonly Problem[];
}

/** The text of a failure to show the viewer: an error's message, else the value as text. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
