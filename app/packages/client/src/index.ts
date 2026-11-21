/**
 * @timetoalign/tilie-client: the editor's port to `tilie-server`. It holds
 * no editor state and draws nothing; it turns the server's routes into
 * typed calls.
 */

import {
  decodeMatchClaims,
  MALFORMED_MATCH_CLAIMS,
  type MatchClaimTable,
  matchClaimsRequest,
} from "./matchClaims.ts";

export type { BeliefFilter, ClaimBeliefs, MatchClaimTable } from "./matchClaims.ts";
export { BELIEF_WORDS, beliefMask } from "./matchClaims.ts";

export const name = "@timetoalign/tilie-client" as const;

/** Where a server is and how to authenticate to it. */
export interface ConnectOptions {
  /** The base URL of the server's API, ending in `/`: `api/` for the page `tilie` serves. */
  readonly url: string;
  /** The run's token, sent as `Authorization: Bearer <token>`; `null` sends no header. */
  readonly token: string | null;
}

/** The body of `GET <url>health`. */
export interface Health {
  readonly name: string;
  readonly version: string;
  readonly timetoalign: string;
}

/** An exact quarter-note value: `[numerator, denominator]`, both safe integers. */
export type FractionPair = readonly [number, number];

/**
 * One measure of an expanded measure map: every member of a decompressed
 * row of the Measure Map standard, as timetoalign expands it. The four
 * quarter-note values are Fraction pairs, `null` where the map gives none;
 * `next` lists the successors' counts.
 */
export interface MeasureRow {
  readonly ID: string;
  readonly count: number;
  readonly qstamp: FractionPair | null;
  readonly number: number;
  readonly name: string;
  readonly time_signature: string | null;
  readonly nominal_length: FractionPair | null;
  readonly actual_length: FractionPair | null;
  readonly start_repeat: boolean;
  readonly end_repeat: boolean;
  readonly next: readonly number[];
  readonly volta: number | null;
  readonly offset_within_measure: FractionPair;
}

/** One entry of a manifest's `measure_maps`, expanded. */
export interface ExpandedMeasureMap {
  readonly id: string;
  readonly rows: readonly MeasureRow[];
}

export type ServerErrorCode = "unreachable" | "status";

/** One problem a table check found: its code, its row (`null` for the table), its column's path. */
export interface TableProblem {
  readonly code: string;
  readonly row: number | null;
  readonly column: readonly string[];
  readonly message: string;
}

/**
 * Why the server refused a request, as a route that explains itself answers
 * (`{"detail": {path, message, problems?}}`): the path of what it refuses,
 * its message, and for a refused table every problem found in it.
 */
export interface Refusal {
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly problems: readonly TableProblem[];
}

/**
 * A call the server did not answer: `unreachable` when the request failed
 * (no status), `status` when the answer's HTTP status is not 2xx or its body
 * is not what the route answers. `refusal` holds the server's reasons where
 * the route gives them.
 */
export class ServerError extends Error {
  readonly code: ServerErrorCode;
  readonly status: number | null;
  readonly refusal: Refusal | null;

  constructor(
    code: ServerErrorCode,
    status: number | null,
    message: string,
    cause?: unknown,
    refusal: Refusal | null = null,
  ) {
    super(message, { cause });
    this.name = "ServerError";
    this.code = code;
    this.status = status;
    this.refusal = refusal;
  }
}

/** One server, as `connect` returns it. */
export interface Server {
  /** The server's health; rejects with a `ServerError` when it does not answer. */
  health(): Promise<Health>;
  /**
   * The expanded rows of every measure map of a manifest, in the manifest's
   * order: one request for the manifest's JSON text, sent unchanged. Rejects
   * with a `ServerError` when the server does not answer them.
   */
  measureMaps(manifest: string): Promise<readonly ExpandedMeasureMap[]>;
  /**
   * A package's MatchClaim table, checked by the server against its
   * manifest: one request for the manifest's text and the table's file,
   * sent unchanged. Resolves to the anchor index's columns and every row's
   * beliefs, each array a view into the answer; rejects with a
   * `ServerError`, whose `refusal` lists the check's problems where the
   * server refuses the table.
   */
  matchClaims(manifest: string, table: Blob): Promise<MatchClaimTable>;
}

/** The message of a health answer that is not `{name, version, timetoalign}`, each a string. */
const MALFORMED_HEALTH = "the health answer is not a name, a version and a timetoalign version";

/** Whether `value` is a health answer: an object whose three members are strings. */
function isHealth(value: unknown): value is Health {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "version" in value &&
    typeof value.version === "string" &&
    "timetoalign" in value &&
    typeof value.timetoalign === "string"
  );
}

/** The message of a measure-maps answer that is not of the route's form. */
const MALFORMED_MEASURE_MAPS = "the measure-maps answer is not a list of expanded measure maps";

/** Whether `value` is a safe integer, which JSON parsing kept exact. */
function isInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

/** Whether `value` is a Fraction pair of safe integers with a positive denominator. */
function isFractionPair(value: unknown): value is FractionPair {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isInteger(value[0]) &&
    isInteger(value[1]) &&
    value[1] > 0
  );
}

function isPairOrNull(value: unknown): value is FractionPair | null {
  return value === null || isFractionPair(value);
}

/** Whether `value` is an expanded row: every member of its form, checked one by one. */
function isMeasureRow(value: unknown): value is MeasureRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const member = (key: keyof MeasureRow): unknown =>
    key in value ? Reflect.get(value, key) : undefined;
  const timeSignature = member("time_signature");
  const next = member("next");
  const volta = member("volta");
  return (
    typeof member("ID") === "string" &&
    isInteger(member("count")) &&
    isPairOrNull(member("qstamp")) &&
    isInteger(member("number")) &&
    typeof member("name") === "string" &&
    (timeSignature === null || typeof timeSignature === "string") &&
    isPairOrNull(member("nominal_length")) &&
    isPairOrNull(member("actual_length")) &&
    typeof member("start_repeat") === "boolean" &&
    typeof member("end_repeat") === "boolean" &&
    Array.isArray(next) &&
    next.every(isInteger) &&
    (volta === null || isInteger(volta)) &&
    isFractionPair(member("offset_within_measure"))
  );
}

function isExpandedMeasureMap(value: unknown): value is ExpandedMeasureMap {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "rows" in value &&
    Array.isArray(value.rows) &&
    value.rows.every(isMeasureRow)
  );
}

/** Whether `value` is one problem of a table check. */
function isTableProblem(value: unknown): value is TableProblem {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    "row" in value &&
    (value.row === null || isInteger(value.row)) &&
    "column" in value &&
    Array.isArray(value.column) &&
    value.column.every((part) => typeof part === "string") &&
    "message" in value &&
    typeof value.message === "string"
  );
}

/** The refusal a body states, `{"detail": {path, message, problems?}}`, or `null`. */
function refusalOf(body: unknown): Refusal | null {
  if (typeof body !== "object" || body === null || !("detail" in body)) return null;
  const detail = body.detail;
  if (typeof detail !== "object" || detail === null) return null;
  if (!("path" in detail) || !Array.isArray(detail.path)) return null;
  if (!detail.path.every((part) => typeof part === "string" || isInteger(part))) return null;
  if (!("message" in detail) || typeof detail.message !== "string") return null;
  const problems = "problems" in detail ? detail.problems : [];
  if (!Array.isArray(problems) || !problems.every(isTableProblem)) return null;
  return { path: detail.path, message: detail.message, problems };
}

/** The measure maps of a 2xx body of the measure-maps route, or `undefined`. */
function measureMapsOf(body: unknown): readonly ExpandedMeasureMap[] | undefined {
  if (typeof body !== "object" || body === null || !("measure_maps" in body)) return undefined;
  const maps = body.measure_maps;
  if (!Array.isArray(maps) || !maps.every(isExpandedMeasureMap)) return undefined;
  return maps;
}

export function connect({ url, token }: ConnectOptions): Server {
  const headers: Record<string, string> =
    token === null ? {} : { Authorization: `Bearer ${token}` };

  /**
   * The 2xx answer to one request. With `explained`, an answer outside 2xx
   * whose body states a refusal rejects with the server's message and the
   * refusal; otherwise with `<status> <status text>`.
   */
  async function request(route: string, init: RequestInit, explained = false): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${url}${route}`, init);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new ServerError("unreachable", null, message, cause);
    }
    if (!response.ok) {
      let refusal: Refusal | null = null;
      if (explained) {
        try {
          refusal = refusalOf(await response.json());
        } catch {
          refusal = null;
        }
      }
      const message = refusal?.message ?? `${response.status} ${response.statusText}`.trim();
      throw new ServerError("status", response.status, message, undefined, refusal);
    }
    return response;
  }

  /** The JSON body of a 2xx answer, read by `read`; `malformed` when it is not of its form. */
  async function answer<T>(
    response: Response,
    read: (body: unknown) => T | undefined,
    malformed: string,
  ): Promise<T> {
    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new ServerError("status", response.status, malformed, cause);
    }
    const value = read(body);
    if (value === undefined) throw new ServerError("status", response.status, malformed);
    return value;
  }

  return {
    async health() {
      const response = await request("health", { headers });
      return answer(
        response,
        (body) => {
          if (!isHealth(body)) return undefined;
          const { name, version, timetoalign } = body;
          return { name, version, timetoalign };
        },
        MALFORMED_HEALTH,
      );
    },
    async measureMaps(manifest) {
      const response = await request("measure-maps", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: manifest,
      });
      return answer(response, measureMapsOf, MALFORMED_MEASURE_MAPS);
    },
    async matchClaims(manifest, table) {
      const response = await request(
        "match-claims",
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          body: matchClaimsRequest(manifest, table),
        },
        true,
      );
      let decoded: MatchClaimTable | undefined;
      try {
        decoded = decodeMatchClaims(await response.arrayBuffer());
      } catch (cause) {
        throw new ServerError("status", response.status, MALFORMED_MATCH_CLAIMS, cause);
      }
      if (decoded === undefined) {
        throw new ServerError("status", response.status, MALFORMED_MATCH_CLAIMS);
      }
      return decoded;
    },
  };
}
