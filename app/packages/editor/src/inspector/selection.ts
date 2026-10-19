/** What the inspector reads of the resolved selection: the one block it lies in. */

import type { Subject } from "@timetoalign/tilie-arranger";
import type { Block, View } from "@timetoalign/tilie-core";

/** The block every selected subject lies in, when it is exactly one; else `null`. */
export function selectedBlock(view: View, subjects: readonly Subject[]): Block | null {
  const [first] = subjects;
  if (first === undefined || subjects.some((subject) => subject.block !== first.block)) return null;
  return view.blocks[first.block] ?? null;
}
