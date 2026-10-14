/** The heights of a member drawing (`docs/drawing.md` in timeskeleton, section 6.5). */

import { P } from "./constants.ts";
import type { Scope } from "./traversal.ts";

interface Heights {
  /** The vertical padding `P × v`. */
  readonly Pv: number;
  /** The root line's distance `y_root` from the drawing's top. */
  readonly yLocal: number;
  /** The content height `Hc`. */
  readonly Hc: number;
}

/** The heights given the outer edges `Ea` and `Eb` of the above and below sides. */
export function heights(scope: Scope, above: number, below: number): Heights {
  const { v, h, rootEntry } = scope;
  const rootNameSize = rootEntry.name.style["font-size"];
  // The vertical padding stretches with the rows, so a lone root grows too.
  const Pv = P * v;
  const yLocal = Math.max(Pv + above, Pv + h(rootNameSize) / 2);
  const Hc = yLocal + Math.max(below, h(rootNameSize) / 2) + Pv;
  return { Pv, yLocal, Hc };
}
