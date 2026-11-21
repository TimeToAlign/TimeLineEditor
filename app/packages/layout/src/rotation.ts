/**
 * The rotation of a wedge about its tip (`docs/drawing.md` in TimeToShare,
 * section 6.6, Wedges): the sine and cosine of a whole number of degrees,
 * each rounded to four decimal places, and the corners of a wedge's base so
 * turned.
 */

import { MARKER_BASE, MARKER_HEIGHT } from "./constants.ts";

/**
 * The sines of 0 to 90 degrees, each rounded to four decimal places and
 * read as a double. No sine of a whole number of degrees lies within 1e-9
 * of a halfway point between two such decimals, so the rounding has no tie
 * to break, and an engine whose `Math.sin` errs by a few units in the last
 * place rounds every one alike.
 */
const SINES: readonly number[] = Array.from(
  { length: 91 },
  (_, degrees) => Math.round(Math.sin((degrees * Math.PI) / 180) * 10_000) / 10_000,
);

/**
 * The sine `s` and cosine `k` of `rotation` degrees, each rounded to four
 * decimal places (section 6.6): read from the sines of 0 to 90 degrees by
 * quadrant, the cosine of `r` being the sine of `90 − |r|`. Neither is −0.
 *
 * @throws {RangeError} if `rotation` is not a whole number from −180 to 180.
 */
export function sineCosine(rotation: number): readonly [number, number] {
  if (!Number.isInteger(rotation) || rotation < -180 || rotation > 180) {
    throw new RangeError(`${rotation} is no rotation: a whole number from -180 to 180`);
  }
  const degrees = Math.abs(rotation);
  const [sine, cosine] =
    degrees <= 90
      ? [SINES[degrees] ?? 0, SINES[90 - degrees] ?? 0]
      : [SINES[180 - degrees] ?? 0, -(SINES[degrees - 90] ?? 0)];
  return [rotation < 0 && sine !== 0 ? -sine : sine, cosine];
}

/**
 * One corner of a wedge's base relative to its tip: `dx` across, a length
 * (scaled as one), and `out` the distance outwards from the line beyond the
 * tip's, added to the tip's distance before it becomes an ordinate.
 */
export interface WedgeOffset {
  readonly dx: number;
  readonly out: number;
}

/**
 * The corners of the base of a wedge turned `rotation` degrees about its tip
 * (section 6.6): with `s` and `k` its sine and cosine (`sineCosine`), the
 * first at `13 × s − 3 × k` across and `13 × k + 3 × s` out, the second at
 * `13 × s + 3 × k` across and `13 × k − 3 × s` out; at 0 degrees exactly
 * `(−3, 13)` and `(3, 13)`, the unturned wedge.
 */
export function wedgeCorners(rotation: number): readonly [WedgeOffset, WedgeOffset] {
  const [s, k] = sineCosine(rotation);
  const half = MARKER_BASE / 2;
  return [
    { dx: MARKER_HEIGHT * s - half * k, out: MARKER_HEIGHT * k + half * s },
    { dx: MARKER_HEIGHT * s + half * k, out: MARKER_HEIGHT * k - half * s },
  ];
}

/**
 * A wedge's extent across, relative to its tip (sections 6.4 and 6.7): from
 * the smallest to the largest of 0 and its corners' `dx`; `[−3, 3]` unturned.
 */
export function wedgeSpan(rotation: number): readonly [number, number] {
  const [first, second] = wedgeCorners(rotation);
  return [Math.min(0, first.dx, second.dx), Math.max(0, first.dx, second.dx)];
}
