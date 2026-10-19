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

export function connect({ url, token }: ConnectOptions): Server {
  const headers: Record<string, string> =
    token === null ? {} : { Authorization: `Bearer ${token}` };

  async function get(route: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${url}${route}`, { headers });
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

  return {
    async health() {
      const response = await get("health");
      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        throw new ServerError("status", response.status, MALFORMED_HEALTH, cause);
      }
      if (!isHealth(body)) throw new ServerError("status", response.status, MALFORMED_HEALTH);
      const { name, version, timetoalign } = body;
      return { name, version, timetoalign };
    },
  };
}
