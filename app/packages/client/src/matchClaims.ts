/**
 * The MatchClaim table as `tilie-server` answers it: the request's bytes
 * and the answer's decoder. The repository's
 * `decisions/0030-match-claims-answer.md` fixes both layouts;
 * `decisions/0029-match-claim-columns.md` the columns and the encoding of
 * a value, which core's anchor index checks when it is built. Core's
 * `beliefMask` makes the belief filter's row mask of the decoded beliefs.
 */

import {
  BELIEFS,
  type ClaimBeliefs,
  type ClaimSide,
  type ClaimTimeline,
  type MatchClaimColumns,
  type ValueColumn,
} from "@timetoalign/tilie-core";

/** A MatchClaim table as the server answers it: the anchor index's columns and the beliefs. */
export interface MatchClaimTable {
  readonly columns: MatchClaimColumns;
  readonly beliefs: ClaimBeliefs;
}

/** The answer's `format` and `version`. */
const FORMAT = "tilie-match-claims";
const VERSION = 1;
const ALIGNMENT = 8;
const PREFIX = 4;

/** The message of an answer that is not of the layout. */
export const MALFORMED_MATCH_CLAIMS =
  "the match-claims answer is not of the tilie-match-claims layout";

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const NUMBER_TYPES: readonly ClaimTimeline["numberType"][] = ["int", "fraction", "float"];

/** The request's body: the manifest's UTF-8 length (little-endian), the manifest, the file. */
export function matchClaimsRequest(manifest: string, table: Blob): Blob {
  const text = new TextEncoder().encode(manifest);
  const prefix = new Uint8Array(PREFIX);
  new DataView(prefix.buffer).setUint32(0, text.length, true);
  return new Blob([prefix, text, table]);
}

type Kind = "u8" | "u32" | "f64" | "i64";

const SIZES: Readonly<Record<Kind, number>> = { u8: 1, u32: 4, f64: 8, i64: 8 };

/** A header's array entry: its offset from the first array and its number of entries. */
type Placed = readonly [number, number];

/** Why decoding stopped; caught by `decodeMatchClaims` only. */
class Malformed extends Error {}

function malformed(): never {
  throw new Malformed(MALFORMED_MATCH_CLAIMS);
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function member(value: object, key: string): unknown {
  return key in value ? Reflect.get(value, key) : undefined;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : malformed();
}

function isNumberType(value: unknown): value is ClaimTimeline["numberType"] {
  return NUMBER_TYPES.some((numberType) => numberType === value);
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : malformed();
}

function timelinesOf(value: unknown): readonly ClaimTimeline[] {
  if (!Array.isArray(value)) malformed();
  return value.map((entry: unknown): ClaimTimeline => {
    if (!isRecord(entry)) malformed();
    const id = member(entry, "id");
    const numberType = member(entry, "number_type");
    if (typeof id !== "string" || !isNumberType(numberType)) malformed();
    return { id, numberType };
  });
}

/**
 * The table an answer's bytes hold, every array a view into `buffer`.
 *
 * @returns `undefined` when the bytes are not of the layout.
 * @throws {RangeError} on a platform whose typed arrays are big-endian.
 */
export function decodeMatchClaims(buffer: ArrayBuffer): MatchClaimTable | undefined {
  try {
    return decoded(buffer);
  } catch (error) {
    if (error instanceof Malformed) return undefined;
    throw error;
  }
}

function decoded(buffer: ArrayBuffer): MatchClaimTable {
  if (!LITTLE_ENDIAN) {
    throw new RangeError("the answer's arrays are little-endian and this platform's are not");
  }
  if (buffer.byteLength < PREFIX) malformed();
  const length = new DataView(buffer).getUint32(0, true);
  if (PREFIX + length > buffer.byteLength) malformed();
  let header: unknown;
  try {
    header = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(buffer, PREFIX, length)),
    );
  } catch {
    malformed();
  }
  if (!isRecord(header)) malformed();
  if (member(header, "format") !== FORMAT || member(header, "version") !== VERSION) malformed();
  const rows = count(member(header, "rows"));
  const timelines = timelinesOf(member(header, "timelines"));
  const actors = strings(member(header, "actors"));
  const words = strings(member(header, "beliefs"));
  if (words.length !== BELIEFS.length || words.some((w, i) => w !== BELIEFS[i])) {
    malformed();
  }
  const arrays = member(header, "arrays");
  if (!isRecord(arrays)) malformed();
  const base = Math.ceil((PREFIX + length) / ALIGNMENT) * ALIGNMENT;

  /** The entry of array `name`, in bounds and aligned, of `expected` entries when given. */
  function placed(name: string, kind: Kind, expected?: number): Placed {
    const entry = member(arrays as object, name);
    if (!Array.isArray(entry) || entry.length !== 2) malformed();
    const offset = count(entry[0]);
    const entries = count(entry[1]);
    if (offset % ALIGNMENT !== 0) malformed();
    if (expected !== undefined && entries !== expected) malformed();
    if (base + offset + entries * SIZES[kind] > buffer.byteLength) malformed();
    return [base + offset, entries];
  }
  const u8 = (name: string, expected?: number): Uint8Array =>
    new Uint8Array(buffer, ...placed(name, "u8", expected));
  const u32 = (name: string, expected?: number): Uint32Array =>
    new Uint32Array(buffer, ...placed(name, "u32", expected));
  const valueColumn = (name: string): ValueColumn => ({
    position: new Float64Array(buffer, ...placed(`${name}.position`, "f64", rows)),
    numerator: new BigInt64Array(buffer, ...placed(`${name}.numerator`, "i64", rows)),
    denominator: new BigInt64Array(buffer, ...placed(`${name}.denominator`, "i64", rows)),
  });
  const side = (name: "a" | "b"): ClaimSide => ({
    timeline: u32(`${name}.timeline`, rows),
    start: valueColumn(`${name}.start`),
    end: valueColumn(`${name}.end`),
  });

  const text = new TextDecoder("utf-8", { fatal: true }).decode(u8("claim_ids"));
  const claimIds = rows === 0 && text === "" ? [] : text.split("\n");
  if (claimIds.length !== rows) malformed();
  const columns: MatchClaimColumns = {
    rows,
    claimIds,
    timelines,
    a: side("a"),
    b: side("b"),
    startPresent: u8("start_present", rows),
    endPresent: u8("end_present", rows),
  };

  const offsets = u32("belief_offsets", rows + 1);
  const actor = u32("belief_actors");
  const word = u8("belief_words", actor.length);
  if (offsets[0] !== 0 || offsets[rows] !== actor.length) malformed();
  for (let row = 0; row < rows; row += 1) {
    if ((offsets[row] as number) > (offsets[row + 1] as number)) malformed();
  }
  for (let index = 0; index < actor.length; index += 1) {
    if ((actor[index] as number) >= actors.length) malformed();
    if ((word[index] as number) >= BELIEFS.length) malformed();
  }
  return { columns, beliefs: { actors, offsets, actor, word } };
}
