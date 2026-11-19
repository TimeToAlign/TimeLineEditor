/**
 * The viewer's own lookup services: Reconciliation Service API 0.2
 * endpoints named in the type profiles. Each is the system
 * `service:<id>`, which searches any kind of value (a service names its
 * own types, which the editor does not know) and resolves nothing. An
 * entity's IRI is the service manifest's identifier space followed by the
 * entity's ID; the candidates' `service` is the endpoint.
 *
 * A search asks the service's entity suggestions where its manifest
 * offers them, else one reconciliation query; reconciling sends one
 * request for all texts and keeps the service's `match`.
 */

import type { Candidate } from "./kinds.ts";
import { ReconciliationClient } from "./reconciliation.ts";

/** A Reconciliation Service API endpoint a profile file names. */
export interface Service {
  readonly id: string;
  /** What the editor calls it: the label of its system. */
  readonly name: string;
  /** The endpoint's absolute URL. */
  readonly endpoint: string;
}

/** What a service's system ID begins with. */
export const SERVICE_PREFIX = "service:";

/** The candidates a search asks a service for, and the most a reconciliation query asks for. */
export const SERVICE_SEARCH_LIMIT = 10;
export const SERVICE_RECONCILE_LIMIT = 3;

/** The system of the service `id`. */
export function serviceSystem(id: string): string {
  return `${SERVICE_PREFIX}${id}`;
}

/** Whether `system` names a service rather than a catalogue system. */
export function isServiceSystem(system: string): boolean {
  return system.startsWith(SERVICE_PREFIX);
}

/** The service whose system is `system`, among `services`. */
export function serviceOf(services: readonly Service[], system: string): Service | undefined {
  if (!isServiceSystem(system)) return undefined;
  const id = system.slice(SERVICE_PREFIX.length);
  return services.find((service) => service.id === id);
}

/** The clients of the services, one per endpoint, kept so each manifest is read once. */
export class ServiceClients {
  readonly #fetch: typeof fetch;
  readonly #clients = new Map<string, ReconciliationClient>();

  constructor(fetcher: typeof fetch) {
    this.#fetch = fetcher;
  }

  /** The client of `service`, its errors naming the service's system. */
  clientOf(service: Service): ReconciliationClient {
    let client = this.#clients.get(service.endpoint);
    if (client === undefined) {
      client = new ReconciliationClient(service.endpoint, {
        fetch: this.#fetch,
        system: serviceSystem(service.id),
      });
      this.#clients.set(service.endpoint, client);
    }
    return client;
  }
}

/** A candidate of an entity `service` named, under its identifier space. */
function candidateOf(
  service: Service,
  identifierSpace: string,
  entity: { readonly id: string; readonly name: string; readonly description?: string },
  match: boolean,
): Candidate {
  return {
    system: serviceSystem(service.id),
    iri: identifierSpace + entity.id,
    label: entity.name,
    description: entity.description ?? null,
    image: null,
    crossReferences: [],
    service: service.endpoint,
    match,
  };
}

/**
 * The entities `service` finds for `text`: its suggestions where its
 * manifest offers them, else the candidates of one reconciliation query
 * (at most `SERVICE_SEARCH_LIMIT`); blank text asks nothing.
 */
export async function searchService(
  clients: ServiceClients,
  service: Service,
  text: string,
  signal?: AbortSignal,
): Promise<readonly Candidate[]> {
  if (text.trim() === "") return [];
  const client = clients.clientOf(service);
  const manifest = await client.manifest(signal);
  if (manifest.suggest?.entity !== undefined) {
    const found = await client.suggest(text, undefined, signal);
    return found.map((entity) => candidateOf(service, manifest.identifierSpace, entity, false));
  }
  const answer = await client.reconcile(
    { q0: { query: text, limit: SERVICE_SEARCH_LIMIT } },
    signal,
  );
  return (answer.q0 ?? []).map((entity) =>
    candidateOf(service, manifest.identifierSpace, entity, false),
  );
}

/**
 * The best candidate for each text, with the service's `match`, `null`
 * where it finds none: one request for all texts; blank texts are not
 * asked, and only blank texts ask nothing.
 */
export async function reconcileService(
  clients: ServiceClients,
  service: Service,
  texts: readonly string[],
  signal?: AbortSignal,
): Promise<readonly (Candidate | null)[]> {
  const asked = texts.flatMap((text, index) =>
    text.trim() === ""
      ? []
      : [[`q${index}`, { query: text, limit: SERVICE_RECONCILE_LIMIT }] as const],
  );
  if (asked.length === 0) return texts.map(() => null);
  const client = clients.clientOf(service);
  const { identifierSpace } = await client.manifest(signal);
  const answer = await client.reconcile(Object.fromEntries(asked), signal);
  return texts.map((_, index) => {
    const best = answer[`q${index}`]?.[0];
    return best === undefined ? null : candidateOf(service, identifierSpace, best, best.match);
  });
}
