/**
 * The five bands of every timeline (`docs/drawing.md` in timeskeleton,
 * sections 2.1, 2.2 and 6.4): their kinds, their addresses and the ids they
 * reserve. The orders that stack them are `order.ts`'s; reading a band
 * address is the resolver's (`workspace/address.ts`).
 */

/** The kinds of a timeline's bands, in the order of the default band order. */
export const BAND_KINDS = [
  "children",
  "conversion_maps",
  "markers",
  "regions",
  "flow_control",
] as const;

/** What a band holds of its timeline: its children, maps, markers, regions or flow control. */
export type BandKind = (typeof BAND_KINDS)[number];

/**
 * The ids reserved for bands: a kind, `_` and a number from 1 without a
 * leading zero. No id of a manifest matches it, whatever its number; every
 * band is numbered 1.
 */
export const BAND_ID_PATTERN = new RegExp(`^(${BAND_KINDS.join("|")})_[1-9][0-9]*$`);

/** The id of the band of `kind` within its timeline: `<kind>_1`. */
export function bandId(kind: BandKind): string {
  return `${kind}_1`;
}

/** The address of the band of `kind` of the timeline `timeline`: `<timeline>/<kind>_1`. */
export function bandAddress(timeline: string, kind: BandKind): string {
  return `${timeline}/${bandId(kind)}`;
}
