/**
 * @timetoalign/tilie-client: the editor's port to `tilie-server`. It holds
 * no editor state and draws nothing; it turns the server's routes into
 * typed calls.
 */

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

/**
 * A call the server did not answer: `unreachable` when the request failed
 * (no status), `status` when the answer's HTTP status is not 2xx or its body
 * is not what the route answers.
 */
export class ServerError extends Error {
  readonly code: ServerErrorCode;
  readonly status: number | null;

  constructor(code: ServerErrorCode, status: number | null, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ServerError";
    this.code = code;
    this.status = status;
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

  async function request(route: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${url}${route}`, init);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new ServerError("unreachable", null, message, cause);
    }
    if (!response.ok) {
      const message = `${response.status} ${response.statusText}`.trim();
      throw new ServerError("status", response.status, message);
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
  };
}
