/**
 * The belief filter of a MatchClaim table (TimeToShare's README, "From
 * MatchClaims to anchors"): which rows a believer's beliefs let through,
 * as the row mask the anchor index takes (`anchorIndexOf`, the repository's
 * `decisions/0029-match-claim-columns.md`). The same filter as
 * TimeToShare's `believed_rows`, the same in the library and in the editor.
 */

import { BELIEFS } from "@timetoalign/timetoshare";

export { BELIEFS };

/**
 * The belief filter's words: every MatchClaim the believer does not
 * believe `"false"` (`not_false`), or only those the believer believes
 * `"true"` (`true`).
 */
export const BELIEF_FILTERS = ["not_false", "true"] as const;
export type BeliefFilter = (typeof BELIEF_FILTERS)[number];

/**
 * Every MatchClaim's beliefs: those of `offsets[row]` up to `offsets[row +
 * 1]` in `actor` (an index into `actors`) and `word` (an index into
 * `BELIEFS`). `offsets` has one entry more than there are rows.
 */
export interface ClaimBeliefs {
  readonly actors: readonly string[];
  readonly offsets: Uint32Array;
  readonly actor: Uint32Array;
  readonly word: Uint8Array;
}

const TRUE = BELIEFS.indexOf("true");
const FALSE = BELIEFS.indexOf("false");

/**
 * The belief filter's row mask, which the anchor index takes: `null`
 * (nothing filtered) without a believer; else 1 for every row the believer
 * does not believe `"false"` (`"not_false"`) or believes `"true"`
 * (`"true"`), 0 for the others.
 *
 * @throws {RangeError} for a filter that is neither.
 */
export function beliefMask(
  beliefs: ClaimBeliefs,
  believer: string | null,
  belief: BeliefFilter = "not_false",
): Uint8Array | null {
  if (!BELIEF_FILTERS.includes(belief)) {
    throw new RangeError(`'${belief}' is no belief filter: write 'not_false' or 'true'`);
  }
  if (believer === null) return null;
  const { offsets, actor, word } = beliefs;
  const rows = offsets.length - 1;
  const believes = belief === "true";
  const mask = new Uint8Array(rows).fill(believes ? 0 : 1);
  const number = beliefs.actors.indexOf(believer);
  if (number < 0) return mask;
  for (let row = 0; row < rows; row += 1) {
    const end = offsets[row + 1] as number;
    for (let index = offsets[row] as number; index < end; index += 1) {
      if (actor[index] !== number) continue;
      const held = word[index];
      mask[row] = believes ? (held === TRUE ? 1 : 0) : held === FALSE ? 0 : 1;
      break;
    }
  }
  return mask;
}
