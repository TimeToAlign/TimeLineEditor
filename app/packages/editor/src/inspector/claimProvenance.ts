/**
 * What the Matchstamp tab shows of a MatchClaim's provenance, which the
 * server reads on demand for the MatchClaims of the MatchStamp shown, and
 * the MatchStamp the tab follows once a belief replaced the block's table.
 */

import type { ClaimProvenance, ClaimProvenanceEntry } from "@timetoalign/tilie-client";
import type { AnchorIndex } from "@timetoalign/tilie-core";
import { coordinateOf } from "@timetoalign/tilie-core";
import type { BeliefLine, ShownStamp } from "./matchstamps.ts";
import type { HeldMatch } from "./tabs.ts";

/** One line of a MatchClaim's paradata: what it says, and its text. */
export interface ParadataRow {
  readonly label: string;
  readonly text: string;
}

/** The paradata members of a provenance entry, in the order shown, with their labels. */
const PARADATA: readonly (readonly [keyof ClaimProvenanceEntry, string])[] = [
  ["stated_by", "Stated by"],
  ["date", "Date"],
  ["method", "Method"],
  ["service", "Service"],
  ["basis", "Basis"],
  ["match", "Match"],
  ["note", "Note"],
];

/** How a MatchClaim was made: one row per paradata member the entry states, lists joined by ", ". */
export function paradataRows(entry: ClaimProvenanceEntry): ParadataRow[] {
  const rows: ParadataRow[] = [];
  for (const [key, label] of PARADATA) {
    const value = entry[key];
    if (typeof value === "string") rows.push({ label, text: value });
    else if (Array.isArray(value)) rows.push({ label, text: value.join(", ") });
  }
  return rows;
}

/** An actor's belief as the tab lists it: with its date and note once the provenance is read. */
export interface BeliefRow extends BeliefLine {
  readonly date: string | null;
  readonly note: string | null;
}

/**
 * The beliefs `lines` (the table's, in its order) with the date and note
 * the provenance `entry` records for each actor; both `null` while the
 * entry is not read, or where it holds no belief of that actor.
 */
export function beliefRows(
  lines: readonly BeliefLine[],
  entry: ClaimProvenanceEntry | null | undefined,
): BeliefRow[] {
  return lines.map((line) => {
    const held = entry?.beliefs?.find((belief) => belief.actor === line.actor);
    return { ...line, date: held?.date ?? null, note: held?.note ?? null };
  });
}

/** A belief as one line: `actor: belief`, then its date and its quoted note where known. */
export function beliefText(row: BeliefRow): string {
  const date = row.date === null ? "" : `, ${row.date}`;
  const note = row.note === null ? "" : ` “${row.note}”`;
  return `${row.actor}: ${row.belief}${date}${note}`;
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
