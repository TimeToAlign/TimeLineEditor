/**
 * Wikidata, asked from the browser through its Action API (`origin=*`
 * makes an anonymous request any page may read).
 *
 * A search is one `generator=search` request whose search text carries the
 * kind's statement filter, with each found item's label, description and
 * thumbnail; resolving an item reads its labels, descriptions and
 * statements, and turns the external identifiers among the statements
 * into cross-references through the catalogue.
 */

import { recognize } from "@timetoalign/timetoshare";
import {
  answerOf,
  type Candidate,
  type CrossReference,
  isObject,
  type LookupContext,
  malformed,
  memberOf,
  textOf,
  urlWith,
  type ValueKind,
  WIKIDATA_FILTERS,
} from "./kinds.ts";

/** The Action API, also the `service` of every Wikidata candidate. */
export const WIKIDATA_SERVICE = "https://www.wikidata.org/w/api.php";

/** The namespace of Wikidata's entity IRIs. */
const ENTITY = "http://www.wikidata.org/entity/";

/**
 * The properties read as cross-references, in this order: VIAF, GND,
 * MusicBrainz work, recording, release, release group and artist, YouTube
 * video, IMSLP. A property's thing is the catalogue thing whose
 * `scheme_uri` is the property's entity IRI.
 */
export const CROSS_REFERENCE_PROPERTIES: readonly string[] = [
  "P214",
  "P227",
  "P435",
  "P4404",
  "P5813",
  "P436",
  "P434",
  "P1651",
  "P839",
];

/** The image property; its value is a file name on Wikimedia Commons. */
const IMAGE = "P18";

/** The width, in pixels, a thumbnail is asked at. */
const THUMBNAIL_WIDTH = "80";

/** The URL that searches Wikidata for `text` among the things of `kind`. */
export function searchUrl(text: string, kind: ValueKind, language: string): string {
  const filter = WIKIDATA_FILTERS[kind];
  return urlWith(WIKIDATA_SERVICE, [
    ["action", "query"],
    ["format", "json"],
    ["formatversion", "2"],
    ["origin", "*"],
    ["generator", "search"],
    ["gsrnamespace", "0"],
    ["gsrlimit", "10"],
    ["gsrsearch", filter === null ? text : `${text} ${filter}`],
    ["prop", "entityterms|pageimages"],
    ["wbetterms", "label|description"],
    ["wbetlanguage", language],
    ["piprop", "thumbnail"],
    ["pithumbsize", THUMBNAIL_WIDTH],
  ]);
}

/** The URL that reads item `id`'s labels, descriptions and statements. */
export function entityUrl(id: string, language: string): string {
  return urlWith(WIKIDATA_SERVICE, [
    ["action", "wbgetentities"],
    ["format", "json"],
    ["origin", "*"],
    ["ids", id],
    ["props", "labels|descriptions|claims"],
    ["languages", language],
    ["languagefallback", "1"],
  ]);
}

/** The thumbnail URL of a Commons file, as wide as a search asks thumbnails. */
export function commonsThumbnail(name: string): string {
  const file = encodeURIComponent(name.replaceAll(" ", "_"));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=${THUMBNAIL_WIDTH}`;
}

/** The answer's error message, if the API answered one instead of a result. */
function apiError(body: unknown): string | undefined {
  const error = memberOf(body, "error");
  return error === undefined ? undefined : (textOf(error, "info") ?? "an error");
}

/** The first string of a list member, `null` without one. */
function firstText(value: unknown, key: string): string | null {
  const list = memberOf(value, key);
  const first: unknown = Array.isArray(list) ? list[0] : undefined;
  return typeof first === "string" ? first : null;
}

/** The candidate of one search result page, `undefined` when it is not of the form. */
function pageCandidate(page: unknown): readonly [number, Candidate] | undefined {
  const index = memberOf(page, "index");
  const title = textOf(page, "title");
  if (typeof index !== "number" || title === undefined) return undefined;
  const terms = memberOf(page, "entityterms");
  return [
    index,
    {
      system: "wikidata",
      iri: ENTITY + title,
      label: firstText(terms, "label") ?? title,
      description: firstText(terms, "description"),
      image: textOf(memberOf(page, "thumbnail"), "source") ?? null,
      crossReferences: [],
      service: WIKIDATA_SERVICE,
      match: false,
    },
  ];
}

/**
 * The items of `kind` Wikidata finds for `text`, in the search's order.
 * Blank text answers no candidate without a request.
 */
export async function searchWikidata(
  context: LookupContext,
  kind: ValueKind,
  text: string,
  signal?: AbortSignal,
): Promise<readonly Candidate[]> {
  if (text.trim() === "") return [];
  const body = await answerOf(
    "wikidata",
    context.fetch,
    searchUrl(text, kind, context.language),
    signal === undefined ? {} : { signal },
  );
  const error = apiError(body);
  if (error !== undefined) throw malformed("wikidata", `an error: ${error}`);
  if (!isObject(body)) throw malformed("wikidata", "no search result");
  const query = memberOf(body, "query");
  if (query === undefined) return [];
  const pages = memberOf(query, "pages");
  if (!Array.isArray(pages)) throw malformed("wikidata", "no list of found items");
  const found: (readonly [number, Candidate])[] = [];
  for (const page of pages) {
    const read = pageCandidate(page);
    if (read === undefined) throw malformed("wikidata", "no list of found items");
    found.push(read);
  }
  return found.sort(([a], [b]) => a - b).map(([, candidate]) => candidate);
}

/** The string values of a property's statements, deprecated ones left out, in order. */
function statementValues(claims: unknown, property: string): string[] {
  const statements = memberOf(claims, property);
  if (!Array.isArray(statements)) return [];
  const values: string[] = [];
  for (const statement of statements) {
    if (textOf(statement, "rank") === "deprecated") continue;
    const snak = memberOf(statement, "mainsnak");
    if (textOf(snak, "snaktype") !== "value") continue;
    const value = memberOf(memberOf(snak, "datavalue"), "value");
    if (typeof value === "string") values.push(value);
  }
  return values;
}

/** The cross-references the item's statements give, in property order, without repeats. */
function crossReferencesOf(context: LookupContext, claims: unknown): CrossReference[] {
  const found: CrossReference[] = [];
  for (const property of CROSS_REFERENCE_PROPERTIES) {
    for (const system of context.catalogue.systems) {
      for (const thing of system.things) {
        if (thing.scheme_uri !== ENTITY + property || thing.iri === null) continue;
        for (const value of statementValues(claims, property)) {
          const written = thing.lowercase
            ? value.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
            : value;
          const iri = thing.iri.split("{value}").join(written);
          if (!found.some((known) => known.iri === iri)) found.push({ system: system.id, iri });
        }
      }
    }
  }
  return found;
}

/** The text in `language` of a labels or descriptions member, `null` without one. */
function termOf(entity: unknown, key: string, language: string): string | null {
  return textOf(memberOf(memberOf(entity, key), language), "value") ?? null;
}

/**
 * The item an IRI names, with its cross-references and its image; `null`
 * for an IRI that names no Wikidata item or for an item Wikidata lacks.
 */
export async function resolveWikidata(
  context: LookupContext,
  iri: string,
  signal?: AbortSignal,
): Promise<Candidate | null> {
  const recognition = recognize(context.catalogue, iri);
  if (recognition?.system !== "wikidata") return null;
  const id = recognition.value;
  const body = await answerOf(
    "wikidata",
    context.fetch,
    entityUrl(id, context.language),
    signal === undefined ? {} : { signal },
  );
  const error = apiError(body);
  if (error !== undefined) throw malformed("wikidata", `an error: ${error}`);
  const entities = memberOf(body, "entities");
  if (!isObject(entities)) throw malformed("wikidata", "no list of entities");
  const entity = memberOf(entities, id) ?? Object.values(entities)[0];
  if (!isObject(entity) || memberOf(entity, "missing") !== undefined) return null;
  const found = textOf(entity, "id") ?? id;
  const claims = memberOf(entity, "claims");
  const image = statementValues(claims, IMAGE)[0];
  return {
    system: "wikidata",
    iri: ENTITY + found,
    label: termOf(entity, "labels", context.language) ?? found,
    description: termOf(entity, "descriptions", context.language),
    image: image === undefined ? null : commonsThumbnail(image),
    crossReferences: crossReferencesOf(context, claims),
    service: WIKIDATA_SERVICE,
    match: false,
  };
}
