/** The heights of a member drawing (`docs/drawing.md` in timeskeleton, section 6.5). */

import { P } from "./constants.ts";
import type { Scope } from "./traversal.ts";

interface Heights {
  /** The root line's distance `y_root` from the drawing's top. */
  readonly yLocal: number;
  /** The content height `Hc`. */
  readonly Hc: number;
}

/** The heights given the outer edges `Ea` and `Eb` of the above and below sides. */
export function heights(scope: Scope, above: number, below: number): Heights {
  const { h, rootEntry } = scope;
  const rootNameSize = rootEntry.name.style["font-size"];
  const yLocal = Math.max(P + above, P + h(rootNameSize) / 2);
  const Hc = yLocal + Math.max(below, h(rootNameSize) / 2) + P;
  return { yLocal, Hc };
}
