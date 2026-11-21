/**
 * A MatchClaim's provenance, as `tilie-server` reads it and records a
 * belief in it: the requests of `POST /api/match-claims/provenance` and
 * `POST /api/match-claims/belief`, the reader of the first one's answer and
 * the check of the second one's. The repository's
 * `decisions/0031-match-claim-provenance.md` fixes both routes: each body
 * is a JSON object of parameters behind its length, followed by the body of
 * `POST /api/match-claims` (`matchClaimsRequest`) unchanged.
 */

import { BELIEFS } from "@timetoalign/tilie-core";
import { matchClaimsRequest } from "./matchClaims.ts";

/** A belief word: `"true"`, `"false"` or `"unlikely"`. */
export type BeliefWord = (typeof BELIEFS)[number];

/** One actor's belief in a MatchClaim, since `date` (`YYYY-MM-DD`). */
export interface ClaimBelief {
  readonly actor: string;
  readonly belief: BeliefWord;
  readonly date: string;
  readonly note?: string;
}

/**
 * A MatchClaim's provenance entry, TimeToShare's: how it was made (who
 * stated it, when, how, by which service, on what basis, how closely it
 * matches, a note) and who believes it. Absent members are left out.
 */
export interface ClaimProvenanceEntry {
  readonly stated_by?: readonly string[];
  readonly date?: string;
  readonly method?: string;
  readonly service?: string;
  readonly basis?: readonly string[];
  readonly match?: string;
  readonly note?: string;
  readonly beliefs?: readonly ClaimBelief[];
}

/** A MatchClaim's ID and its provenance; `null` for one stated without. */
export interface ClaimProvenance {
  readonly id: string;
  readonly provenance: ClaimProvenanceEntry | null;
}

/** An actor's belief in the MatchClaim `claim`, stated on `date` (`YYYY-MM-DD`). */
export interface StatedBelief {
  readonly claim: string;
  readonly actor: string;
  readonly belief: BeliefWord;
  readonly date: string;
}

/** The message of a provenance answer that is not of the route's form. */
export const MALFORMED_PROVENANCE =
  "the provenance answer is not the provenance of the MatchClaims asked for";

/** The message of a belief answer that is no Parquet file. */
export const MALFORMED_BELIEF_ANSWER = "the belief answer is not a Parquet file";

/** The media type of a Parquet file, the belief route's answer. */
export const PARQUET_MEDIA_TYPE = "application/vnd.apache.parquet";

const PREFIX = 4;

/**
 * A request of the routes taking parameters: the parameters' UTF-8 length
 * (little-endian), the parameters as JSON, the parts `between` (none for
 * the provenance and belief routes), then the request of `POST
 * /api/match-claims`.
 */
export function parametersRequest(
  parameters: object,
  manifest: string,
  table: Blob,
  between: readonly BlobPart[] = [],
): Blob {
  const text = new TextEncoder().encode(JSON.stringify(parameters));
  const prefix = new Uint8Array(PREFIX);
  new DataView(prefix.buffer).setUint32(0, text.length, true);
  return new Blob([prefix, text, ...between, matchClaimsRequest(manifest, table)]);
}

/** Whether `value` is a JSON object: neither `null` nor a list. */
export function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The member `key` of `value`; `undefined` where it has none. */
export function member(value: object, key: string): unknown {
  return key in value ? Reflect.get(value, key) : undefined;
}

/** The keys a provenance entry may hold, as TimeToShare's provenance schema declares them. */
const STRING_KEYS = ["date", "method", "service", "match", "note"] as const;
const LIST_KEYS = ["stated_by", "basis"] as const;
const ENTRY_KEYS: readonly string[] = [...STRING_KEYS, ...LIST_KEYS, "beliefs"];
const BELIEF_KEYS: readonly string[] = ["actor", "belief", "date", "note"];

function isBeliefWord(value: unknown): value is BeliefWord {
  return BELIEFS.some((word) => word === value);
}

/** The belief `value` is, or `undefined`: every member of its form, no other. */
function beliefOf(value: unknown): ClaimBelief | undefined {
  if (!isRecord(value) || !Object.keys(value).every((key) => BELIEF_KEYS.includes(key))) {
    return undefined;
  }
  const actor = member(value, "actor");
  const belief = member(value, "belief");
  const date = member(value, "date");
  const note = member(value, "note");
  if (typeof actor !== "string" || !isBeliefWord(belief) || typeof date !== "string") {
    return undefined;
  }
  if (note === undefined) return { actor, belief, date };
  return typeof note === "string" ? { actor, belief, date, note } : undefined;
}

function strings(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

/** The entry `value` is, or `undefined`: its members checked one by one, none unknown. */
function entryOf(value: unknown): ClaimProvenanceEntry | undefined {
  if (!isRecord(value) || !Object.keys(value).every((key) => ENTRY_KEYS.includes(key))) {
    return undefined;
  }
  const entry: { -readonly [K in keyof ClaimProvenanceEntry]: ClaimProvenanceEntry[K] } = {};
  for (const key of STRING_KEYS) {
    const given = member(value, key);
    if (given === undefined) continue;
    if (typeof given !== "string") return undefined;
    entry[key] = given;
  }
  for (const key of LIST_KEYS) {
    const given = member(value, key);
    if (given === undefined) continue;
    const list = strings(given);
    if (list === undefined) return undefined;
    entry[key] = list;
  }
  const beliefs = member(value, "beliefs");
  if (beliefs !== undefined) {
    if (!Array.isArray(beliefs)) return undefined;
    const read = beliefs.map(beliefOf);
    if (read.some((belief) => belief === undefined)) return undefined;
    entry.beliefs = read.filter((belief) => belief !== undefined);
  }
  return entry;
}

/**
 * The provenance of the MatchClaims `asked` that a 2xx body of the
 * provenance route holds, or `undefined` when the body is not of its form:
 * `{"claims": [{"id", "provenance"}]}` with one entry per ID asked, in that
 * order, each `provenance` an entry or `null`.
 */
export function provenanceOf(
  body: unknown,
  asked: readonly string[],
): readonly ClaimProvenance[] | undefined {
  if (!isRecord(body)) return undefined;
  const claims = member(body, "claims");
  if (!Array.isArray(claims) || claims.length !== asked.length) return undefined;
  const read: ClaimProvenance[] = [];
  for (const [at, item] of claims.entries()) {
    if (!isRecord(item) || member(item, "id") !== asked[at]) return undefined;
    const given = member(item, "provenance");
    const provenance = given === null ? null : entryOf(given);
    if (provenance === undefined) return undefined;
    read.push({ id: asked[at] as string, provenance });
  }
  return read;
}

/** The magic bytes a Parquet file starts and ends with. */
const PAR1 = [0x50, 0x41, 0x52, 0x31] as const;

/** Whether `bytes` can be a Parquet file: `PAR1` at its start and at its end. */
export function isParquet(bytes: Uint8Array): boolean {
  if (bytes.length < 2 * PAR1.length) return false;
  const end = bytes.length - PAR1.length;
  return PAR1.every((byte, at) => bytes[at] === byte && bytes[end + at] === byte);
}
