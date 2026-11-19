/**
 * MusicBrainz, asked only through `tilie-server`, whose endpoint
 * `reconcile/musicbrainz` speaks the Reconciliation Service API and keeps
 * MusicBrainz's rules of use (one request a second, a User-Agent, a
 * cache). An entity's ID there is `<type>/<mbid>`, so the identifier space
 * `http://musicbrainz.org/` followed by it is the entity's IRI.
 */

import type { ConnectOptions } from "@timetoalign/tilie-client";
import { recognize } from "@timetoalign/timetoshare";
import {
  type Candidate,
  type CrossReference,
  type LookupContext,
  MUSICBRAINZ_TYPES,
  type ValueKind,
} from "./kinds.ts";
import type { ExtendValue } from "./reconciliation.ts";
import { ReconciliationClient } from "./reconciliation.ts";

/** MusicBrainz's web service, the `service` of every MusicBrainz candidate. */
export const MUSICBRAINZ_SERVICE = "https://musicbrainz.org/ws/2/";

/** The server's endpoint, relative to its API URL. */
export const MUSICBRAINZ_ENDPOINT = "reconcile/musicbrainz";

/** The candidates a reconciliation query asks for. */
export const RECONCILE_LIMIT = 3;

/** The client of the server's MusicBrainz endpoint, with the run's token. */
export function musicbrainzClient(
  server: ConnectOptions,
  fetcher: typeof fetch,
): ReconciliationClient {
  return new ReconciliationClient(server.url + MUSICBRAINZ_ENDPOINT, {
    fetch: fetcher,
    headers: server.token === null ? {} : { Authorization: `Bearer ${server.token}` },
    system: "musicbrainz",
  });
}

/** A candidate of an entity the service named. */
function candidateOf(
  identifierSpace: string,
  entity: { readonly id: string; readonly name: string; readonly description?: string },
  match: boolean,
): Candidate {
  return {
    system: "musicbrainz",
    iri: identifierSpace + entity.id,
    label: entity.name,
    description: entity.description ?? null,
    image: null,
    crossReferences: [],
    service: MUSICBRAINZ_SERVICE,
    match,
  };
}

/**
 * The entities of `kind` the service suggests for `text`. A kind
 * MusicBrainz has no type for, or blank text, answers none without a
 * request.
 */
export async function searchMusicBrainz(
  client: ReconciliationClient,
  kind: ValueKind,
  text: string,
  signal?: AbortSignal,
): Promise<readonly Candidate[]> {
  const type = MUSICBRAINZ_TYPES[kind];
  if (type === undefined || text.trim() === "") return [];
  const { identifierSpace } = await client.manifest(signal);
  const found = await client.suggest(text, type, signal);
  return found.map((entity) => candidateOf(identifierSpace, entity, false));
}

/**
 * The best candidate for each text, with the service's `match`: one
 * request for all texts. A kind without a type, or blank text, gives
 * `null` without asking.
 */
export async function reconcileMusicBrainz(
  client: ReconciliationClient,
  kind: ValueKind,
  texts: readonly string[],
  signal?: AbortSignal,
): Promise<readonly (Candidate | null)[]> {
  const type = MUSICBRAINZ_TYPES[kind];
  const asked = texts.flatMap((text, index) =>
    type === undefined || text.trim() === ""
      ? []
      : [[`q${index}`, { query: text, type, limit: RECONCILE_LIMIT }] as const],
  );
  if (asked.length === 0) return texts.map(() => null);
  const { identifierSpace } = await client.manifest(signal);
  const answer = await client.reconcile(Object.fromEntries(asked), signal);
  return texts.map((_, index) => {
    const best = answer[`q${index}`]?.[0];
    return best === undefined ? null : candidateOf(identifierSpace, best, best.match);
  });
}

/** The strings among extension values. */
function strings(values: readonly ExtendValue[] | undefined): string[] {
  return (values ?? []).flatMap((value) => ("str" in value ? [value.str] : []));
}

/**
 * The entity an IRI names, with its name and the cross-references its URL
 * relationships give (the IRIs the catalogue recognises); `null` for an
 * IRI outside the service's identifier space or an entity it has no row
 * or name for.
 */
export async function resolveMusicBrainz(
  context: LookupContext,
  client: ReconciliationClient,
  iri: string,
  signal?: AbortSignal,
): Promise<Candidate | null> {
  const { identifierSpace } = await client.manifest(signal);
  if (!iri.startsWith(identifierSpace)) return null;
  const id = iri.slice(identifierSpace.length);
  const row = (await client.extend([id], ["name", "sameAs"], signal))[id];
  const label = strings(row?.name)[0];
  if (label === undefined) return null;
  const crossReferences: CrossReference[] = [];
  for (const url of strings(row?.sameAs)) {
    const recognition = recognize(context.catalogue, url);
    if (recognition === null || recognition.iri === null) continue;
    const known = recognition.iri;
    if (!crossReferences.some((reference) => reference.iri === known)) {
      crossReferences.push({ system: recognition.system, iri: known });
    }
  }
  return { ...candidateOf(identifierSpace, { id, name: label }, false), crossReferences };
}
