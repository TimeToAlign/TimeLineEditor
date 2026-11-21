/**
 * The events of MatchClaims, as `tilie-server` reads them: the request of
 * `POST /api/match-claims/events` and the reader of its answer. The
 * repository's `decisions/0032-match-claim-events.md` fixes the route: the
 * parameters behind their length (as the provenance routes take them), then
 * the body of `POST /api/match-claims` (`matchClaimsRequest`) unchanged.
 */

import { isRecord, member, parametersRequest } from "./claimProvenance.ts";

/**
 * The events on the two sides of a MatchClaim, as the MatchClaim table
 * states them: each side's timeline, its event's ID and name (`null` where
 * the side has no event, or the event no name); the MatchClaim's certainty
 * and whether it states synchrony.
 */
export interface ClaimEvents {
  readonly id: string;
  readonly timeline_a_id: string;
  readonly event_a_id: string | null;
  readonly event_a_name: string | null;
  readonly timeline_b_id: string;
  readonly event_b_id: string | null;
  readonly event_b_name: string | null;
  readonly certainty: number | null;
  readonly is_synchronous: boolean | null;
}

/** The message of an events answer that is not of the route's form. */
export const MALFORMED_EVENTS = "the events answer is not the events of the MatchClaims asked for";

/**
 * A request of the events route: the parameters `{claims}` behind their
 * length, then the table route's body for `manifest` and `table`.
 */
export function eventsRequest(claims: readonly string[], manifest: string, table: Blob): Blob {
  return parametersRequest({ claims: [...claims] }, manifest, table);
}

/** The members of an answered MatchClaim, every one required. */
const CLAIM_KEYS: readonly string[] = [
  "id",
  "timeline_a_id",
  "event_a_id",
  "event_a_name",
  "timeline_b_id",
  "event_b_id",
  "event_b_name",
  "certainty",
  "is_synchronous",
];

function hasExactly(value: object, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** The MatchClaim `value` is, asked as `id`, or `undefined`: every member of its form, no other. */
function claimOf(value: unknown, id: string): ClaimEvents | undefined {
  if (!isRecord(value) || !hasExactly(value, CLAIM_KEYS) || member(value, "id") !== id) {
    return undefined;
  }
  const timelineA = member(value, "timeline_a_id");
  const timelineB = member(value, "timeline_b_id");
  const eventA = member(value, "event_a_id");
  const eventB = member(value, "event_b_id");
  const nameA = member(value, "event_a_name");
  const nameB = member(value, "event_b_name");
  const certainty = member(value, "certainty");
  const synchronous = member(value, "is_synchronous");
  if (
    typeof timelineA !== "string" ||
    typeof timelineB !== "string" ||
    !isStringOrNull(eventA) ||
    !isStringOrNull(eventB) ||
    !isStringOrNull(nameA) ||
    !isStringOrNull(nameB) ||
    !(certainty === null || typeof certainty === "number") ||
    !(synchronous === null || typeof synchronous === "boolean")
  ) {
    return undefined;
  }
  return {
    id,
    timeline_a_id: timelineA,
    event_a_id: eventA,
    event_a_name: nameA,
    timeline_b_id: timelineB,
    event_b_id: eventB,
    event_b_name: nameB,
    certainty,
    is_synchronous: synchronous,
  };
}

/**
 * The events of the MatchClaims `asked` that a 2xx body of the events route
 * holds, or `undefined` when the body is not of its form: `{"claims":
 * [...]}` with one entry per ID asked, in that order, each of exactly the
 * members of `ClaimEvents`.
 */
export function eventsOf(
  body: unknown,
  asked: readonly string[],
): readonly ClaimEvents[] | undefined {
  if (!isRecord(body) || !hasExactly(body, ["claims"])) return undefined;
  const claims = member(body, "claims");
  if (!Array.isArray(claims) || claims.length !== asked.length) return undefined;
  const read: ClaimEvents[] = [];
  for (const [at, item] of claims.entries()) {
    const claim = claimOf(item, asked[at] as string);
    if (claim === undefined) return undefined;
    read.push(claim);
  }
  return read;
}
