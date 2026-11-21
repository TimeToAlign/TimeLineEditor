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
import { canonicalText } from "../json.ts";

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

/**
 * The beliefs an alignment anchor of a shown MatchStamp is drawn by, the
 * most critical first: an anchor stated by several MatchClaims takes the
 * first of their beliefs in this order, `undecided` where the believer
 * states none.
 */
export const ANCHOR_BELIEFS = ["false", "unlikely", "undecided", "true"] as const;
export type AnchorBelief = (typeof ANCHOR_BELIEFS)[number];

const UNDECIDED = ANCHOR_BELIEFS.indexOf("undecided");
/** Each word of `BELIEFS`, by its number there, as its number in `ANCHOR_BELIEFS`. */
const RANKS = Uint8Array.from(BELIEFS, (word) => ANCHOR_BELIEFS.indexOf(word));

const believedCache = new WeakMap<
  ClaimBeliefs,
  { readonly believer: string; readonly context: string; readonly rows: Uint8Array }
>();

/**
 * The believer's belief in every MatchClaim, per row its number in
 * `ANCHOR_BELIEFS`: `undecided` where the believer states none, the most
 * critical where the believer states several (two actors standing for the
 * believer's IRI); actors compare as `beliefMask` compares them
 * (`actorIri` under `context`). The same array for the same beliefs,
 * believer and context, made again only when one of them changes.
 */
export function believedBy(
  beliefs: ClaimBeliefs,
  believer: string,
  context: unknown = null,
): Uint8Array {
  const prefixes = context === null || context === undefined ? "" : canonicalText(context);
  const known = believedCache.get(beliefs);
  if (known?.believer === believer && known.context === prefixes) return known.rows;
  const { offsets, actor, word } = beliefs;
  const rows = new Uint8Array(offsets.length - 1).fill(UNDECIDED);
  const wanted = actorIri(context, believer);
  const named = beliefs.actors.map((name) => actorIri(context, name) === wanted);
  if (named.includes(true)) {
    for (let row = 0; row < rows.length; row += 1) {
      const end = offsets[row + 1] as number;
      for (let index = offsets[row] as number; index < end; index += 1) {
        if (named[actor[index] as number] !== true) continue;
        const rank = RANKS[word[index] as number] as number;
        if (rank < (rows[row] as number) || rows[row] === UNDECIDED) rows[row] = rank;
      }
    }
  }
  believedCache.set(beliefs, { believer, context: prefixes, rows });
  return rows;
}

/**
 * The belief an alignment anchor stated by the MatchClaims of `rows` is
 * drawn by, `believed` the believer's per row (`believedBy`): the most
 * critical among them, `undecided` for none.
 */
export function anchorBelief(believed: Uint8Array, rows: ArrayLike<number>): AnchorBelief {
  let rank = rows.length === 0 ? UNDECIDED : ANCHOR_BELIEFS.length - 1;
  for (let at = 0; at < rows.length; at += 1) {
    rank = Math.min(rank, believed[rows[at] as number] as number);
  }
  return ANCHOR_BELIEFS[rank] as AnchorBelief;
}
