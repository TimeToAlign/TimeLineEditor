/**
 * The events of MatchClaims, as `tilie-server` reads them: the request of
 * `POST /api/match-claims/events` and the reader of its answer. The
 * repository's `decisions/0032-match-claim-events.md` fixes the route: the
 * parameters behind their length (as the provenance routes take them), the
 * Projections table behind its length (none: length 0), then the body of
 * `POST /api/match-claims` (`matchClaimsRequest`) unchanged.
 */

import { isRecord, member, parametersRequest } from "./claimProvenance.ts";

/** An event, by the timeline holding it and its ID there. */
export interface EventReference {
  readonly timeline_id: string;
  readonly event_id: string;
}

/**
 * A side's event that is a Projection of the Projections table: the event
 * it stands for, or `null` for a Projection standing for no event.
 */
export interface SideProjection {
  readonly projection_of: EventReference | null;
}

/**
 * The events on the two sides of a MatchClaim, as the MatchClaim table
 * states them: each side's timeline, its event's ID and name (`null` where
 * the side has no event, or the event no name), and, where the event is a
 * Projection of the Projections table sent with the request, what it stands
 * for (`null` otherwise); the MatchClaim's certainty and whether it states
 * synchrony.
 */
export interface ClaimEvents {
  readonly id: string;
  readonly timeline_a_id: string;
  readonly event_a_id: string | null;
  readonly event_a_name: string | null;
  readonly event_a_projection: SideProjection | null;
  readonly timeline_b_id: string;
  readonly event_b_id: string | null;
  readonly event_b_name: string | null;
  readonly event_b_projection: SideProjection | null;
  readonly certainty: number | null;
  readonly is_synchronous: boolean | null;
}

/** The message of an events answer that is not of the route's form. */
export const MALFORMED_EVENTS = "the events answer is not the events of the MatchClaims asked for";

const PREFIX = 4;

/**
 * A request of the events route: the parameters `{claims}` behind their
 * length, the Projections table `projections` behind its length (`null`
 * sends the length 0 and no table), then the table route's body for
 * `manifest` and `table`.
 */
export function eventsRequest(
  claims: readonly string[],
  projections: Blob | null,
  manifest: string,
  table: Blob,
): Blob {
  const length = new Uint8Array(PREFIX);
  new DataView(length.buffer).setUint32(0, projections?.size ?? 0, true);
  const between = projections === null ? [length] : [length, projections];
  return parametersRequest({ claims: [...claims] }, manifest, table, between);
}

/** The members of an answered MatchClaim, every one required. */
const CLAIM_KEYS: readonly string[] = [
  "id",
  "timeline_a_id",
  "event_a_id",
  "event_a_name",
  "event_a_projection",
  "timeline_b_id",
  "event_b_id",
  "event_b_name",
  "event_b_projection",
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

/** The reference `value` is, or `undefined`: exactly its two strings. */
function referenceOf(value: unknown): EventReference | undefined {
  if (!isRecord(value) || !hasExactly(value, ["timeline_id", "event_id"])) return undefined;
  const timeline = member(value, "timeline_id");
  const event = member(value, "event_id");
  if (typeof timeline !== "string" || typeof event !== "string") return undefined;
  return { timeline_id: timeline, event_id: event };
}

/** A side's Projection `value` is (`null` for none), or `undefined` when it is not of its form. */
function projectionOf(value: unknown): SideProjection | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactly(value, ["projection_of"])) return undefined;
  const of = member(value, "projection_of");
  if (of === null) return { projection_of: null };
  const reference = referenceOf(of);
  return reference === undefined ? undefined : { projection_of: reference };
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
  const projectionA = projectionOf(member(value, "event_a_projection"));
  const projectionB = projectionOf(member(value, "event_b_projection"));
  if (
    typeof timelineA !== "string" ||
    typeof timelineB !== "string" ||
    !isStringOrNull(eventA) ||
    !isStringOrNull(eventB) ||
    !isStringOrNull(nameA) ||
    !isStringOrNull(nameB) ||
    !(certainty === null || typeof certainty === "number") ||
    !(synchronous === null || typeof synchronous === "boolean") ||
    projectionA === undefined ||
    projectionB === undefined
  ) {
    return undefined;
  }
  return {
    id,
    timeline_a_id: timelineA,
    event_a_id: eventA,
    event_a_name: nameA,
    event_a_projection: projectionA,
    timeline_b_id: timelineB,
    event_b_id: eventB,
    event_b_name: nameB,
    event_b_projection: projectionB,
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
