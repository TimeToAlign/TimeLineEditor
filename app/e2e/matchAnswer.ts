/**
 * A match-claims answer written from MatchClaim columns, in the layout the
 * server answers `POST /api/match-claims` with and the client decodes
 * (`decisions/0030-match-claims-answer.md`): a little-endian u32 header
 * length, the compact JSON header, then each array from the first multiple
 * of 8 after the header, each 8-aligned. The answer states no beliefs, so
 * every MatchClaim is undecided. A spec answers the editor's request with
 * it where no recorded answer of the server exists for its manifest.
 */

import type { MatchClaimColumns, ValueColumn } from "../packages/core/src/index.ts";
import { BELIEFS } from "../packages/core/src/index.ts";

const ALIGNMENT = 8;
const PREFIX = 4;

/** The bytes of `columns` as the server's answer, without beliefs. */
export function matchClaimsAnswer(columns: MatchClaimColumns): Buffer {
  const arrays: [string, Uint8Array, number][] = [];
  const add = (name: string, view: ArrayBufferView, entries: number) =>
    arrays.push([name, new Uint8Array(view.buffer, view.byteOffset, view.byteLength), entries]);
  const ids = new TextEncoder().encode(columns.claimIds.join("\n"));
  add("claim_ids", ids, ids.length);
  const value = (name: string, column: ValueColumn) => {
    add(`${name}.position`, column.position, columns.rows);
    add(`${name}.numerator`, column.numerator, columns.rows);
    add(`${name}.denominator`, column.denominator, columns.rows);
  };
  for (const side of ["a", "b"] as const) {
    add(`${side}.timeline`, columns[side].timeline, columns.rows);
    value(`${side}.start`, columns[side].start);
    value(`${side}.end`, columns[side].end);
  }
  add("start_present", columns.startPresent, columns.rows);
  add("end_present", columns.endPresent, columns.rows);
  add("belief_offsets", new Uint32Array(columns.rows + 1), columns.rows + 1);
  add("belief_actors", new Uint32Array(0), 0);
  add("belief_words", new Uint8Array(0), 0);

  const placed: Record<string, [number, number]> = {};
  let offset = 0;
  for (const [name, bytes, entries] of arrays) {
    placed[name] = [offset, entries];
    offset += Math.ceil(bytes.length / ALIGNMENT) * ALIGNMENT;
  }
  const header = new TextEncoder().encode(
    JSON.stringify({
      format: "tilie-match-claims",
      version: 1,
      rows: columns.rows,
      timelines: columns.timelines.map(({ id, numberType }) => ({ id, number_type: numberType })),
      actors: [],
      beliefs: BELIEFS,
      arrays: placed,
    }),
  );
  const base = Math.ceil((PREFIX + header.length) / ALIGNMENT) * ALIGNMENT;
  const answer = Buffer.alloc(base + offset);
  answer.writeUInt32LE(header.length, 0);
  answer.set(header, PREFIX);
  for (const [name, bytes] of arrays)
    answer.set(bytes, base + (placed[name] as [number, number])[0]);
  return answer;
}
