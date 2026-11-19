/**
 * The vocabulary of the lookup: the kinds of value a field asks for, the
 * candidates a service answers, the services' filters per kind, the one
 * error every service throws, and the one request every service sends.
 */

import type { Catalogue } from "@timetoalign/timetoshare";

/** What a value field asks for: the lookup narrows its search by it. */
export type ValueKind = "work" | "agent" | "recording" | "release" | "class" | "any";

/** Every value kind, in the order above. */
export const VALUE_KINDS: readonly ValueKind[] = [
  "work",
  "agent",
  "recording",
  "release",
  "class",
  "any",
];

/** A thing another system names that a looked-up thing is the same as. */
export interface CrossReference {
  /** The catalogue system holding the thing. */
  readonly system: string;
  /** Its IRI, as that thing's template writes it. */
  readonly iri: string;
}

/** A thing a service found. */
export interface Candidate {
  /** The catalogue system of the thing. */
  readonly system: string;
  /** Its absolute IRI, as the system's thing template writes it. */
  readonly iri: string;
  readonly label: string;
  readonly description: string | null;
  /** A thumbnail's URL, for display only; never written to a manifest. */
  readonly image: string | null;
  /** The things it is the same as: filled by `resolve`, empty from `search`. */
  readonly crossReferences: readonly CrossReference[];
  /** The service that answered, as a provenance entry's `service` names it. */
  readonly service: string;
  /** Whether a reconciliation service called it a match; false elsewhere. */
  readonly match: boolean;
}

/**
 * The statement filter of a Wikidata search per kind, `null` for none:
 * works with a composer, humans, musical groups and orchestras, recordings
 * with a performer, albums, and classes (items that are a subclass).
 */
export const WIKIDATA_FILTERS: Readonly<Record<ValueKind, string | null>> = {
  work: "haswbstatement:P86",
  agent: "haswbstatement:P31=Q5|P31=Q215380|P31=Q42998",
  recording: "haswbstatement:P175",
  release: "haswbstatement:P31=Q482994",
  class: "haswbstatement:P279",
  any: null,
};

/** The type filter of a GND search per kind; a kind without one is not searched. */
export const GND_FILTERS: Readonly<Partial<Record<ValueKind, string>>> = {
  work: "type:MusicalWork",
  agent: "type:Person OR type:CorporateBody",
};

/** The MusicBrainz entity type searched per kind; a kind without one is not searched. */
export const MUSICBRAINZ_TYPES: Readonly<Partial<Record<ValueKind, string>>> = {
  work: "work",
  agent: "artist",
  recording: "recording",
  release: "release-group",
};

export type LookupErrorCode = "unreachable" | "status" | "malformed";

/**
 * A request a service did not answer as asked: `unreachable` when no
 * answer came, `status` when the answer's HTTP status is not 2xx,
 * `malformed` when its body is not of the service's form. The message
 * completes a sentence naming the system ("Wikidata could not be searched:
 * <message>").
 */
export class LookupError extends Error {
  readonly system: string;
  readonly code: LookupErrorCode;
  readonly status: number | null;

  constructor(
    system: string,
    code: LookupErrorCode,
    status: number | null,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "LookupError";
    this.system = system;
    this.code = code;
    this.status = status;
  }
}

/** What every service module reads: how to fetch, in which language, from which catalogue. */
export interface LookupContext {
  readonly fetch: typeof fetch;
  readonly language: string;
  readonly catalogue: Catalogue;
}

/** Whether `value` is a JSON object (not a list). */
export function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The member `key` of a JSON object, `undefined` for anything else. */
export function memberOf(value: unknown, key: string): unknown {
  return isObject(value) && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

/** The member `key` of a JSON object if it is a string, else `undefined`. */
export function textOf(value: unknown, key: string): string | undefined {
  const found = memberOf(value, key);
  return typeof found === "string" ? found : undefined;
}

/** The message of a thrown value. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The `detail` a JSON error body names, read without failing. */
async function detailOf(response: Response): Promise<string | undefined> {
  try {
    return textOf(await response.json(), "detail");
  } catch {
    return undefined;
  }
}

/**
 * Fetch `url` for `system` and answer its JSON body.
 *
 * A request aborted through `init.signal` rejects with the signal's
 * reason, never with a `LookupError`, so a caller tells a superseded
 * request from a failed one.
 *
 * @throws LookupError `unreachable` without an answer; `status` for an
 *   answer outside 2xx, with the `detail` of a JSON body where it names
 *   one; `malformed` for a body that is no JSON.
 */
export async function answerOf(
  system: string,
  fetcher: typeof fetch,
  url: string,
  init: RequestInit = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    throw new LookupError(
      system,
      "unreachable",
      null,
      `it could not be reached (${messageOf(cause)})`,
      cause,
    );
  }
  if (!response.ok) {
    const status = `${response.status} ${response.statusText}`.trim();
    const detail = await detailOf(response);
    const message = detail === undefined ? status : `${status}: ${detail}`;
    throw new LookupError(system, "status", response.status, `it answered ${message}`);
  }
  try {
    return await response.json();
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    throw new LookupError(system, "malformed", response.status, "its answer is no JSON", cause);
  }
}

/** The error of an answer that is not of the service's form: "its answer is <what>". */
export function malformed(system: string, what: string): LookupError {
  return new LookupError(system, "malformed", 200, `its answer is ${what}`);
}

/** A URL with its query parameters in the order given. */
export function urlWith(base: string, parameters: readonly (readonly [string, string])[]): string {
  const url = new URL(base);
  url.search = new URLSearchParams(parameters.map(([key, value]) => [key, value])).toString();
  return url.href;
}
