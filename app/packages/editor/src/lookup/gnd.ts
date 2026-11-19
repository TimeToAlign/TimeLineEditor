/**
 * The GND (Gemeinsame Normdatei), asked from the browser through lobid-gnd,
 * which answers any origin.
 *
 * A search is lobid's suggest format with the kind's type filter: each hit
 * a label whose parts are joined by " | " (the preferred name first, then
 * dates and occupations or the work's creator); resolving reads the
 * record's preferred name, depiction and `sameAs` links, which become
 * cross-references wherever the catalogue recognises them.
 */

import { recognize } from "@timetoalign/timetoshare";
import {
  answerOf,
  type Candidate,
  type CrossReference,
  GND_FILTERS,
  type LookupContext,
  malformed,
  memberOf,
  textOf,
  urlWith,
  type ValueKind,
} from "./kinds.ts";

/** lobid-gnd's search, also the `service` of every GND candidate. */
export const GND_SERVICE = "https://lobid.org/gnd/search";

/** What separates the parts of a suggestion's label. */
const SEPARATOR = " | ";

/** The URL that searches the GND for `text` among the things of `filter`. */
export function searchUrl(text: string, filter: string): string {
  return urlWith(GND_SERVICE, [
    ["q", text],
    ["filter", filter],
    ["format", "json:suggest"],
    ["size", "10"],
  ]);
}

/** The URL of a GND record as lobid's JSON-LD. */
export function recordUrl(id: string): string {
  return `https://lobid.org/gnd/${encodeURIComponent(id)}.json`;
}

/** The candidate of one suggestion, `undefined` when it is not of the form. */
function suggestionCandidate(hit: unknown): Candidate | undefined {
  const iri = textOf(hit, "id");
  const label = textOf(hit, "label");
  if (iri === undefined || label === undefined) return undefined;
  const cut = label.indexOf(SEPARATOR);
  return {
    system: "gnd",
    iri,
    label: cut < 0 ? label : label.slice(0, cut),
    description: cut < 0 ? null : label.slice(cut + SEPARATOR.length),
    image: textOf(hit, "image") ?? null,
    crossReferences: [],
    service: GND_SERVICE,
    match: false,
  };
}

/**
 * The records of `kind` the GND suggests for `text`, in lobid's order. A
 * kind without a filter, or blank text, answers none without a request.
 */
export async function searchGnd(
  context: LookupContext,
  kind: ValueKind,
  text: string,
  signal?: AbortSignal,
): Promise<readonly Candidate[]> {
  const filter = GND_FILTERS[kind];
  if (filter === undefined || text.trim() === "") return [];
  const body = await answerOf(
    "gnd",
    context.fetch,
    searchUrl(text, filter),
    signal === undefined ? {} : { signal },
  );
  if (!Array.isArray(body)) throw malformed("gnd", "no list of suggestions");
  const found: Candidate[] = [];
  for (const hit of body) {
    const candidate = suggestionCandidate(hit);
    if (candidate === undefined) throw malformed("gnd", "no list of suggestions");
    found.push(candidate);
  }
  return found;
}

/** The IRIs the catalogue recognises among a record's `sameAs` links, in order, once. */
function crossReferencesOf(context: LookupContext, record: unknown): CrossReference[] {
  const links = memberOf(record, "sameAs");
  const found: CrossReference[] = [];
  for (const link of Array.isArray(links) ? links : []) {
    const id = textOf(link, "id");
    const recognition = id === undefined ? null : recognize(context.catalogue, id);
    if (recognition === null || recognition.iri === null) continue;
    const iri = recognition.iri;
    if (!found.some((known) => known.iri === iri)) {
      found.push({ system: recognition.system, iri });
    }
  }
  return found;
}

/** The thumbnail of a record's first depiction, `null` without one. */
function thumbnailOf(record: unknown): string | null {
  const depictions = memberOf(record, "depiction");
  const first: unknown = Array.isArray(depictions) ? depictions[0] : undefined;
  return textOf(first, "thumbnail") ?? null;
}

/** The GND record an IRI names, with its cross-references; `null` for an IRI of no GND record. */
export async function resolveGnd(
  context: LookupContext,
  iri: string,
  signal?: AbortSignal,
): Promise<Candidate | null> {
  const recognition = recognize(context.catalogue, iri);
  if (recognition?.system !== "gnd" || recognition.iri === null) return null;
  const record = await answerOf(
    "gnd",
    context.fetch,
    recordUrl(recognition.value),
    signal === undefined ? {} : { signal },
  );
  const label = textOf(record, "preferredName");
  if (label === undefined) throw malformed("gnd", "no record with a preferred name");
  return {
    system: "gnd",
    iri: recognition.iri,
    label,
    description: null,
    image: thumbnailOf(record),
    crossReferences: crossReferencesOf(context, record),
    service: GND_SERVICE,
    match: false,
  };
}
