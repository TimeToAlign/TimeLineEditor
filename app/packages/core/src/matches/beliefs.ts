/**
 * The belief filter of a MatchClaim table (TimeToShare's README, "From
 * MatchClaims to anchors"): which rows a believer's beliefs let through,
 * as the row mask the anchor index takes (`anchorIndexOf`, the repository's
 * `decisions/0029-match-claim-columns.md`). The same filter as
 * timetoalign's `belief_mask`: actors compare as the IRIs they stand for
 * under the manifest's `@context` (`actorIri`), wherever the editor
 * compares an actor with another.
 */

import { BELIEFS, expandIri } from "@timetoalign/timetoshare";

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

/**
 * The IRI an actor stands for under `context` (a manifest's `@context`, or
 * any object of prefixes; `null` declares none): a compact IRI expanded by
 * its prefix (TimeToShare's `expandIri`), else the actor as written. Two
 * actors are one when their IRIs are equal, so a compact and an absolute
 * IRI of one person name the same actor.
 */
export function actorIri(context: unknown, actor: string): string {
  return expandIri(context, actor) ?? actor;
}

const TRUE = BELIEFS.indexOf("true");
const FALSE = BELIEFS.indexOf("false");

/**
 * The belief filter's row mask, which the anchor index takes: `null`
 * (nothing filtered) without a believer; else 0 for every row where the
 * believer believes `"false"` (`"not_false"`), or 1 only for the rows where
 * the believer believes `"true"` (`"true"`). The believer and every actor
 * compare as their IRIs under `context` (`actorIri`); each actor is
 * expanded once, so the cost follows the actors, not the beliefs.
 *
 * @throws {RangeError} for a filter that is neither.
 */
export function beliefMask(
  beliefs: ClaimBeliefs,
  believer: string | null,
  belief: BeliefFilter = "not_false",
  context: unknown = null,
): Uint8Array | null {
  if (!BELIEF_FILTERS.includes(belief)) {
    throw new RangeError(`'${belief}' is no belief filter: write 'not_false' or 'true'`);
  }
  if (believer === null) return null;
  const { offsets, actor, word } = beliefs;
  const rows = offsets.length - 1;
  const believes = belief === "true";
  const mask = new Uint8Array(rows).fill(believes ? 0 : 1);
  const wanted = actorIri(context, believer);
  const named = beliefs.actors.map((name) => actorIri(context, name) === wanted);
  if (!named.includes(true)) return mask;
  const decisive = believes ? TRUE : FALSE;
  for (let row = 0; row < rows; row += 1) {
    const end = offsets[row + 1] as number;
    for (let index = offsets[row] as number; index < end; index += 1) {
      if (named[actor[index] as number] !== true || word[index] !== decisive) continue;
      mask[row] = believes ? 1 : 0;
      break;
    }
  }
  return mask;
}
