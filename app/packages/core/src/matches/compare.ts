/**
 * A named MatchStamp against the current MatchClaim table.
 *
 * An alignment anchor is stated when a MatchClaim passing the mask gives an
 * anchor of its two coordinates. The current potential MatchStamps are those
 * holding any coordinate of the named one. The named MatchStamp is out of
 * date when an anchor is not stated, or when the current potential
 * MatchStamps have other anchors or other claims than it records.
 *
 * The index's mask is the belief filter's and nothing else: a row it leaves
 * out is one the belief filter does not pass. A caller narrowing what is
 * shown by anything else (the timelines a view holds, say) narrows after
 * the comparison, never through the mask, or a claim would be reported as
 * left out by the belief filter for another reason.
 */

import type { CoordinateValue } from "../number/coordinate.ts";
import type { AnchorIndex } from "./anchors.ts";
import {
  anchorOf,
  claimRowsOf,
  coordinateOf,
  matchStampAnchors,
  matchStampMembers,
} from "./anchors.ts";
import { claimRowOf } from "./columns.ts";

/** A coordinate as a named MatchStamp gives it: a timeline ID and a value in its number type. */
export interface NamedCoordinate {
  readonly timeline: string;
  readonly value: CoordinateValue;
}

/** An alignment anchor of a named MatchStamp. */
export interface NamedAnchor {
  readonly coordinates: readonly [NamedCoordinate, NamedCoordinate];
  /** Whether the anchor's line shows the MatchStamp's name. */
  readonly carriesName: boolean;
}

/** What the comparison reads of a named MatchStamp: its alignment anchors and the claims it records. */
export interface NamedMatchStampSpec {
  readonly anchors: readonly NamedAnchor[];
  readonly claims: readonly string[];
}

/** The current potential MatchStamp an Update rewrites a named one from. */
export interface MatchStampUpdate {
  readonly matchStamp: number;
  readonly coordinates: Uint32Array;
  readonly anchors: Uint32Array;
  /** The IDs of the claims behind it, in row order. */
  readonly claims: readonly string[];
  /** The anchor carrying the name, when the named one carrying it is stated here; else `null`. */
  readonly nameAnchor: number | null;
}

export interface MatchStampCheck {
  /** Per named anchor the index's anchor stating it, `null` when it is not stated. */
  readonly stated: readonly (number | null)[];
  /**
   * Per named anchor the rows of the MatchClaims stating it, those the mask
   * passes, ascending; empty where it is not stated.
   */
  readonly statedBy: readonly Uint32Array[];
  readonly outOfDate: boolean;
  /** The current potential MatchStamps, ascending. */
  readonly current: readonly number[];
  /** Named anchors not stated (their positions in the named list). */
  readonly anchorsGone: readonly number[];
  /** Anchors of the current potential MatchStamps the named one lacks, ascending. */
  readonly anchorsNew: readonly number[];
  /** Recorded claims the table does not hold, in the recorded order. */
  readonly claimsMissing: readonly string[];
  /**
   * Recorded claims the table holds and the mask leaves out: those whose
   * state for the believer the belief filter does not keep (believed false
   * under the default filter; undecided too where it keeps only `true`).
   */
  readonly claimsFilteredOut: readonly string[];
  /** Recorded claims passing the mask that state no anchor of the current potential MatchStamps. */
  readonly claimsElsewhere: readonly string[];
  /** Claims behind the current potential MatchStamps not recorded, in row order. */
  readonly claimsNew: readonly string[];
  /** What Update rewrites it from; `null` when no anchor is stated. */
  readonly update: MatchStampUpdate | null;
}

/** Compare a named MatchStamp with the index. */
export function checkMatchStamp(index: AnchorIndex, spec: NamedMatchStampSpec): MatchStampCheck {
  const stampOf = index.matchStamps.of;
  const currentSet = new Set<number>();
  const stated = spec.anchors.map((anchor) => {
    const [left, right] = anchor.coordinates.map((coordinate) =>
      coordinateOf(index, coordinate.timeline, coordinate.value),
    ) as [number, number];
    for (const c of [left, right]) if (c >= 0) currentSet.add(stampOf[c] as number);
    if (left < 0 || right < 0) return null;
    const found = anchorOf(index, left, right);
    return found < 0 ? null : found;
  });
  const { claimOffsets, claimRows } = index.anchors;
  const statedBy = stated.map((anchor) =>
    anchor === null
      ? new Uint32Array(0)
      : claimRows.subarray(claimOffsets[anchor] as number, claimOffsets[anchor + 1] as number),
  );
  const current = [...currentSet].sort((x, y) => x - y);
  const currentAnchors = current.flatMap((m) => Array.from(matchStampAnchors(index, m)));
  currentAnchors.sort((x, y) => x - y);
  const named = new Set(stated.filter((anchor): anchor is number => anchor !== null));
  const anchorsGone = stated.flatMap((anchor, at) => (anchor === null ? [at] : []));
  const anchorsNew = currentAnchors.filter((anchor) => !named.has(anchor));

  const ids = index.columns.claimIds;
  const currentRows = claimRowsOf(index, currentAnchors);
  const behind = new Set(currentRows);
  const rowOf = claimRowOf(index.columns);
  const claimsMissing: string[] = [];
  const claimsFilteredOut: string[] = [];
  const claimsElsewhere: string[] = [];
  for (const id of spec.claims) {
    const row = rowOf.get(id);
    if (row === undefined) claimsMissing.push(id);
    else if (index.mask !== null && index.mask[row] !== 1) claimsFilteredOut.push(id);
    else if (!behind.has(row)) claimsElsewhere.push(id);
  }
  const recorded = new Set(spec.claims);
  const claimsNew = Array.from(currentRows, (row) => ids[row] as string).filter(
    (id) => !recorded.has(id),
  );

  const outOfDate =
    anchorsGone.length +
      anchorsNew.length +
      claimsMissing.length +
      claimsFilteredOut.length +
      claimsElsewhere.length +
      claimsNew.length >
    0;
  return {
    stated,
    statedBy,
    outOfDate,
    current,
    anchorsGone,
    anchorsNew,
    claimsMissing,
    claimsFilteredOut,
    claimsElsewhere,
    claimsNew,
    update: updateOf(index, spec, stated, current),
  };
}

/**
 * The current potential MatchStamp an Update rewrites a named one from,
 * `null` when none of its anchors is stated: the one holding the stated
 * anchor that carries the name, else the largest of the current ones (those
 * holding any of its coordinates), whether or not it holds a stated anchor:
 * most coordinates, then most stated anchors, then the one whose first
 * stated anchor comes first, then the lowest number.
 */
function updateOf(
  index: AnchorIndex,
  spec: NamedMatchStampSpec,
  stated: readonly (number | null)[],
  current: readonly number[],
): MatchStampUpdate | null {
  const stampOfAnchor = (anchor: number) =>
    index.matchStamps.of[index.anchors.low[anchor] as number] as number;
  let nameAnchor: number | null = null;
  for (let at = 0; at < spec.anchors.length && nameAnchor === null; at += 1) {
    const found = stated[at];
    if (spec.anchors[at]?.carriesName === true && found !== null && found !== undefined) {
      nameAnchor = found;
    }
  }
  let chosen: number;
  if (nameAnchor !== null) {
    chosen = stampOfAnchor(nameAnchor);
  } else {
    // The candidates in order of their first stated anchor, then the others ascending: a later
    // one replaces the chosen one only when it is larger.
    const held = new Map<number, number>();
    for (const anchor of stated) {
      if (anchor === null) continue;
      const m = stampOfAnchor(anchor);
      held.set(m, (held.get(m) ?? 0) + 1);
    }
    if (held.size === 0) return null;
    const candidates = [...held.keys(), ...current.filter((m) => !held.has(m))];
    let best = -1;
    for (const m of candidates) {
      if (best < 0) {
        best = m;
        continue;
      }
      const size = matchStampMembers(index, m).length;
      const bestSize = matchStampMembers(index, best).length;
      const count = held.get(m) ?? 0;
      const bestCount = held.get(best) ?? 0;
      if (size > bestSize || (size === bestSize && count > bestCount)) best = m;
    }
    chosen = best;
  }
  const anchors = matchStampAnchors(index, chosen);
  return {
    matchStamp: chosen,
    coordinates: matchStampMembers(index, chosen).slice(),
    anchors,
    claims: Array.from(claimRowsOf(index, anchors), (row) => index.columns.claimIds[row] as string),
    nameAnchor,
  };
}
