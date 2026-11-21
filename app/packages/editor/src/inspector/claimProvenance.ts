/**
 * What the Matchstamp tab shows of a MatchClaim's provenance, which the
 * server reads on demand for the MatchClaims of the MatchStamp shown, as
 * the inspector's one provenance shape (`EntryLine`, one reader of both tabs), and
 * the MatchStamp the tab follows once a belief replaced the block's table.
 */

import type { ClaimProvenance, ClaimProvenanceEntry } from "@timetoalign/tilie-client";
import type { AnchorIndex, User } from "@timetoalign/tilie-core";
import { coordinateOf } from "@timetoalign/tilie-core";
import { defaultCatalogue } from "@timetoalign/timetoshare";
import { iriNames } from "../iris.ts";
import type { ClaimLine, ShownStamp } from "./matchstamps.ts";
import type { EntryLine } from "./provenance.ts";
import { lineOf } from "./provenance.ts";
import type { HeldMatch } from "./tabs.ts";

/**
 * The entry line of the MatchClaim `claim`, given what the server read of
 * its provenance (`entryOf`): the entry's line (`lineOf`, its actors under
 * `context`, its IRIs shown with the shipped catalogue) once read; `null` where the table states no entry for it;
 * while the entry is not read (not yet asked, pending, failed, or without
 * a server), the beliefs the table states (`claim.beliefs`, without date
 * or note) and no paradata.
 */
export function claimEntryLine(
  claim: ClaimLine,
  entry: ClaimProvenanceEntry | null | undefined,
  user: User,
  context: unknown,
): EntryLine | null {
  if (entry === null) return null;
  if (entry !== undefined) return lineOf(entry, user, iriNames(defaultCatalogue(), context));
  return {
    method: null,
    statedBy: [],
    date: null,
    service: null,
    basis: [],
    match: null,
    note: null,
    beliefs: claim.beliefs,
  };
}

/** The entry `read` holds for the MatchClaim `id`: `null` for one without, `undefined` for one not asked. */
export function entryOf(
  read: readonly ClaimProvenance[],
  id: string,
): ClaimProvenanceEntry | null | undefined {
  const found = read.find((item) => item.id === id);
  return found === undefined ? undefined : found.provenance;
}

/**
 * The MatchStamp the tab shows once the block's table was replaced and
 * `index` is its shown index: a named MatchStamp stays; a potential one is
 * the MatchStamp of `index` holding the first of `stamp`'s coordinates
 * (screen order) that `index` still holds, `null` when it holds none.
 */
export function followedMatch(
  held: HeldMatch,
  stamp: ShownStamp,
  index: AnchorIndex | null,
): HeldMatch | null {
  if (held.kind === "named") return held;
  if (index === null) return null;
  for (const { timeline, value } of stamp.coordinates) {
    const coordinate = coordinateOf(index, timeline, value);
    if (coordinate < 0) continue;
    const matchStamp = index.matchStamps.of[coordinate];
    if (matchStamp !== undefined) {
      return { kind: "potential", block: held.block, index, matchStamp };
    }
  }
  return null;
}
