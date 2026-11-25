/**
 * A client of the Reconciliation Service API, version 0.2 (W3C Entity
 * Reconciliation Community Group): the service manifest, reconciliation
 * queries, entity suggestions and data extension, against any conforming
 * endpoint. `tilie-server` serves MusicBrainz through one.
 *
 * Bodies are sent as forms (`application/x-www-form-urlencoded`), each
 * holding one JSON text (`queries=` or `extend=`), as the API specifies.
 * Every failure is a `LookupError` naming the client's system.
 */

import { answerOf, isObject, LookupError, malformed, memberOf, textOf } from "./kinds.ts";

/** A type, as the manifest and a candidate name one. */
export interface ReconciliationType {
  readonly id: string;
  readonly name: string;
}

/** Where a service answers one of its further requests. */
export interface ServicePath {
  readonly service_url: string;
  readonly service_path: string;
}

/** The members of a service manifest the client reads. */
export interface ServiceManifest {
  readonly versions?: readonly string[];
  readonly name: string;
  readonly identifierSpace: string;
  readonly schemaSpace: string;
  readonly defaultTypes?: readonly ReconciliationType[];
  readonly view?: { readonly url: string };
  readonly suggest?: { readonly entity?: ServicePath };
  readonly extend?: { readonly propose_properties?: ServicePath };
}

/** One reconciliation query: the text, optionally a type to restrict to and a candidate limit. */
export interface ReconciliationQuery {
  readonly query: string;
  readonly type?: string;
  readonly limit?: number;
}

/** A candidate a reconciliation query answers: an entity, its score and whether it is a match. */
export interface ReconciliationCandidate {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** The service's score; higher is better. */
  readonly score: number;
  /** Whether the service judges the candidate a match. */
  readonly match: boolean;
  readonly type?: readonly ReconciliationType[];
}

/** An entity suggestion. */
export interface Suggestion {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

/** A value of data extension: a string, or an entity. */
export type ExtendValue = { readonly str: string } | { readonly id: string; readonly name: string };

/** How a `ReconciliationClient` sends its requests and names its system. */
export interface ReconciliationOptions {
  /** The fetch to send requests with; the global one by default. */
  readonly fetch?: typeof fetch;
  /** Headers sent with every request (an `Authorization`, say). */
  readonly headers?: Readonly<Record<string, string>>;
  /** What a relative endpoint resolves against; the document's base URI by default. */
  readonly base?: string;
  /** The system named by the client's errors; the absolute endpoint by default. */
  readonly system?: string;
}

/** Whether `value` is a list of `{id, name}` strings. */
function isTypeList(value: unknown): value is readonly ReconciliationType[] {
  return (
    Array.isArray(value) &&
    value.every((item) => textOf(item, "id") !== undefined && textOf(item, "name") !== undefined)
  );
}

/** The `{service_url, service_path}` at `value`, `undefined` where absent, `null` where malformed. */
function servicePathOf(value: unknown): ServicePath | undefined | null {
  if (value === undefined) return undefined;
  const service_url = textOf(value, "service_url");
  const service_path = textOf(value, "service_path");
  return service_url === undefined || service_path === undefined
    ? null
    : { service_url, service_path };
}

/** A service manifest read member by member, `undefined` when it is not of the form. */
function manifestOf(body: unknown): ServiceManifest | undefined {
  const name = textOf(body, "name");
  const identifierSpace = textOf(body, "identifierSpace");
  const schemaSpace = textOf(body, "schemaSpace");
  if (name === undefined || identifierSpace === undefined || schemaSpace === undefined) {
    return undefined;
  }
  const versions = memberOf(body, "versions");
  const defaultTypes = memberOf(body, "defaultTypes");
  const view = memberOf(body, "view");
  const suggest = memberOf(body, "suggest");
  const extend = memberOf(body, "extend");
  if (versions !== undefined && !(Array.isArray(versions) && versions.every(isString))) {
    return undefined;
  }
  if (defaultTypes !== undefined && !isTypeList(defaultTypes)) return undefined;
  const viewUrl = textOf(view, "url");
  if (view !== undefined && viewUrl === undefined) return undefined;
  if (suggest !== undefined && !isObject(suggest)) return undefined;
  if (extend !== undefined && !isObject(extend)) return undefined;
  const entity = servicePathOf(memberOf(suggest, "entity"));
  const proposals = servicePathOf(memberOf(extend, "propose_properties"));
  if (entity === null || proposals === null) return undefined;
  return {
    name,
    identifierSpace,
    schemaSpace,
    ...(versions === undefined ? {} : { versions }),
    ...(defaultTypes === undefined ? {} : { defaultTypes }),
    ...(viewUrl === undefined ? {} : { view: { url: viewUrl } }),
    ...(suggest === undefined ? {} : { suggest: entity === undefined ? {} : { entity } }),
    ...(extend === undefined
      ? {}
      : { extend: proposals === undefined ? {} : { propose_properties: proposals } }),
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A candidate read member by member, `undefined` when it is not of the form. */
function candidateOf(value: unknown): ReconciliationCandidate | undefined {
  const id = textOf(value, "id");
  const name = textOf(value, "name");
  const description = memberOf(value, "description");
  const score = memberOf(value, "score");
  const match = memberOf(value, "match");
  const type = memberOf(value, "type");
  if (
    id === undefined ||
    name === undefined ||
    (description !== undefined && typeof description !== "string") ||
    typeof score !== "number" ||
    typeof match !== "boolean" ||
    (type !== undefined && !isTypeList(type))
  ) {
    return undefined;
  }
  return {
    id,
    name,
    ...(description === undefined ? {} : { description }),
    score,
    match,
    ...(type === undefined ? {} : { type }),
  };
}

/** A suggestion read member by member, `undefined` when it is not of the form. */
function suggestionOf(value: unknown): Suggestion | undefined {
  const id = textOf(value, "id");
  const name = textOf(value, "name");
  const description = memberOf(value, "description");
  if (id === undefined || name === undefined) return undefined;
  if (description !== undefined && typeof description !== "string") return undefined;
  return description === undefined ? { id, name } : { id, name, description };
}

/** An extension value, `undefined` when it is neither a string nor an entity. */
function extendValueOf(value: unknown): ExtendValue | undefined {
  const str = textOf(value, "str");
  if (str !== undefined) return { str };
  const id = textOf(value, "id");
  const name = textOf(value, "name");
  return id === undefined || name === undefined ? undefined : { id, name };
}

/** Every item of a list read by `read`, `undefined` when it is no list or an item fails. */
function listOf<T>(value: unknown, read: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: T[] = [];
  for (const item of value) {
    const got = read(item);
    if (got === undefined) return undefined;
    items.push(got);
  }
  return items;
}

/** The base URI of the document the client runs in, if any. */
function documentBase(): string | undefined {
  return typeof document === "undefined" ? undefined : document.baseURI;
}

/** A client of one reconciliation endpoint; its service manifest is fetched on first need and kept unless that fails. */
export class ReconciliationClient {
  /** The absolute endpoint. */
  readonly endpoint: string;
  readonly #fetch: typeof fetch;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #system: string;
  #manifest: Promise<ServiceManifest> | null = null;

  /**
   * @param endpoint The service's URL, absolute or relative to `options.base`.
   */
  constructor(endpoint: string, options: ReconciliationOptions = {}) {
    this.endpoint = new URL(endpoint, options.base ?? documentBase()).href;
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#headers = options.headers ?? {};
    this.#system = options.system ?? this.endpoint;
  }

  /** The service manifest: one request, its promise kept; a failed one is dropped. */
  manifest(signal?: AbortSignal): Promise<ServiceManifest> {
    if (this.#manifest === null) {
      const asked = this.#get(this.endpoint, signal).then((body) => {
        const read = manifestOf(body);
        if (read === undefined) throw malformed(this.#system, "no service manifest");
        return read;
      });
      this.#manifest = asked;
      asked.catch(() => {
        if (this.#manifest === asked) this.#manifest = null;
      });
    }
    return this.#manifest;
  }

  /** Each query's candidates, by the query's key: one request for all. */
  async reconcile(
    queries: Readonly<Record<string, ReconciliationQuery>>,
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, readonly ReconciliationCandidate[]>>> {
    const body = await this.#post({ queries: JSON.stringify(queries) }, signal);
    const answer: Record<string, readonly ReconciliationCandidate[]> = {};
    for (const key of Object.keys(queries)) {
      const result = listOf(memberOf(memberOf(body, key), "result"), candidateOf);
      if (result === undefined) {
        throw malformed(this.#system, `no list of candidates for the query '${key}'`);
      }
      answer[key] = result;
    }
    return answer;
  }

  /** The entities the service suggests for a prefix, of a type where one is given. */
  async suggest(
    prefix: string,
    type?: string,
    signal?: AbortSignal,
  ): Promise<readonly Suggestion[]> {
    const entity = (await this.manifest(signal)).suggest?.entity;
    if (entity === undefined) {
      throw new LookupError(this.#system, "malformed", null, "it offers no entity suggestions");
    }
    const url = new URL(entity.service_url + entity.service_path, this.endpoint);
    url.searchParams.set("prefix", prefix);
    if (type !== undefined) url.searchParams.set("type", type);
    const result = listOf(memberOf(await this.#get(url.href, signal), "result"), suggestionOf);
    if (result === undefined) throw malformed(this.#system, "no list of suggestions");
    return result;
  }

  /** The values of `properties` for each entity of `ids`: the answer's rows, by ID. */
  async extend(
    ids: readonly string[],
    properties: readonly string[],
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, Readonly<Record<string, readonly ExtendValue[]>>>>> {
    const asked = { ids, properties: properties.map((id) => ({ id })) };
    const rows = memberOf(await this.#post({ extend: JSON.stringify(asked) }, signal), "rows");
    const answer: Record<string, Record<string, readonly ExtendValue[]>> = {};
    for (const id of ids) {
      const row = memberOf(rows, id);
      const values: Record<string, readonly ExtendValue[]> = {};
      for (const property of properties) {
        const read = listOf(memberOf(row, property), extendValueOf);
        if (read === undefined) {
          throw malformed(this.#system, `no list of values of '${property}' for '${id}'`);
        }
        values[property] = read;
      }
      answer[id] = values;
    }
    return answer;
  }

  /** The IRI of an entity: the manifest's identifier space followed by its ID. */
  async iriOf(id: string, signal?: AbortSignal): Promise<string> {
    return (await this.manifest(signal)).identifierSpace + id;
  }

  #get(url: string, signal: AbortSignal | undefined): Promise<unknown> {
    return answerOf(this.#system, this.#fetch, url, {
      headers: { ...this.#headers },
      ...(signal === undefined ? {} : { signal }),
    });
  }

  #post(form: Readonly<Record<string, string>>, signal: AbortSignal | undefined): Promise<unknown> {
    return answerOf(this.#system, this.#fetch, this.endpoint, {
      method: "POST",
      headers: { ...this.#headers },
      body: new URLSearchParams(form),
      ...(signal === undefined ? {} : { signal }),
    });
  }
}
