/**
 * A provenance entry as the inspector shows it, the one data shape of a
 * Metadata pair's entry and a MatchClaim's (`Provenance.svelte` shows it):
 * how it was made (its paradata: who stated it, the method, the service,
 * the basis, how closely it matches, a note, the date) and who believes it
 * and how. IRIs are shown as slugs (`shownIri`) with the full IRI along.
 */

import type { User } from "@timetoalign/tilie-core";
import { actorIri, statedBy, TILIE_AGENT, USER_TAG } from "@timetoalign/tilie-core";
import type { Belief } from "@timetoalign/timetoshare";
import { BELIEFS, isJsonObject } from "@timetoalign/timetoshare";
import type { IriNames, ShownIri } from "../iris.ts";
import { shownIri } from "../iris.ts";

/** One actor's belief in a pair or a MatchClaim, as a provenance entry's details print it. */
export interface BeliefLine {
  /** The actor's IRI, as written. */
  readonly actor: string;
  /** The IRI the actor stands for under the manifest's context (`actorIri`), which actors are compared by. */
  readonly iri: string;
  /** The actor in words (`whoOf` of `iri`). */
  readonly who: string;
  readonly belief: Belief;
  readonly date: string | null;
  readonly note: string | null;
}

/**
 * A provenance entry as `lineOf` reads it: a statement's, as the manifest
 * holds it, or a MatchClaim's, as the server answers it; the members of
 * TimeToShare's provenance record, any of them missing or malformed.
 */
export interface ProvenanceEntry {
  readonly stated_by?: unknown;
  readonly date?: unknown;
  readonly method?: unknown;
  readonly service?: unknown;
  readonly basis?: unknown;
  readonly match?: unknown;
  readonly note?: unknown;
  readonly beliefs?: unknown;
}

/**
 * A provenance entry as its details print it, in the Metadata tab and in
 * the Matchstamp tab alike: how it was made (paradata), and who believes it.
 * Who stated it, the service and the basis are IRIs as shown (`ShownIri`):
 * the actors in words (`whoOf`), the others as slugs.
 */
export interface EntryLine {
  readonly method: string | null;
  readonly statedBy: readonly ShownIri[];
  readonly date: string | null;
  readonly service: ShownIri | null;
  readonly basis: readonly ShownIri[];
  readonly match: string | null;
  readonly note: string | null;
  readonly beliefs: readonly BeliefLine[];
}

/**
 * Who stated something, in words: the viewer's own statements by their
 * name; an ORCID iD by itself; a name TiLiE wrote as a tag decoded; TiLiE's
 * own proposals "TiLiE"; any other IRI as shown under `names` (`shownIri`),
 * as written without them.
 */
export function whoOf(iri: string, user: User, names?: IriNames): string {
  if (iri === statedBy(user)) return user.name;
  if (iri === TILIE_AGENT) return "TiLiE";
  const orcid = /^https:\/\/orcid\.org\/(.+)$/u.exec(iri);
  if (orcid?.[1] !== undefined) return orcid[1];
  if (iri.startsWith(USER_TAG)) {
    try {
      return decodeURIComponent(iri.slice(USER_TAG.length));
    } catch {
      return iri;
    }
  }
  return names === undefined ? iri : shownIri(names, iri).text;
}

/** An actor, expanded under the names' context, in words, with its IRI where the words are not it. */
function actorShown(names: IriNames, actor: string, user: User): ShownIri {
  const iri = actorIri(names.context, actor);
  const text = whoOf(iri, user, names);
  return { text, iri: text === iri ? null : iri };
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const isBelief = (value: unknown): value is Belief =>
  (BELIEFS as readonly unknown[]).includes(value);

/**
 * The line a provenance entry prints: its paradata, and its beliefs in
 * their order, every actor and every IRI of `stated_by` read as the IRI it
 * stands for under the names' context (the manifest's `@context`,
 * `actorIri`) and worded by `whoOf`; the service and the basis as shown
 * (`shownIri`).
 */
export function lineOf(entry: ProvenanceEntry, user: User, names: IriNames): EntryLine {
  const beliefs = (Array.isArray(entry.beliefs) ? entry.beliefs : []).flatMap(
    (held): BeliefLine[] => {
      if (!isJsonObject(held) || typeof held.actor !== "string" || !isBelief(held.belief)) {
        return [];
      }
      const iri = actorIri(names.context, held.actor);
      return [
        {
          actor: held.actor,
          iri,
          who: whoOf(iri, user, names),
          belief: held.belief,
          date: text(held.date),
          note: text(held.note),
        },
      ];
    },
  );
  const service = text(entry.service);
  return {
    method: text(entry.method),
    statedBy: strings(entry.stated_by).map((actor) => actorShown(names, actor, user)),
    date: text(entry.date),
    service: service === null ? null : shownIri(names, service),
    basis: strings(entry.basis).map((item) => shownIri(names, item)),
    match: text(entry.match),
    note: text(entry.note),
    beliefs,
  };
}

/**
 * The user's own belief among a line's beliefs, each actor compared by the
 * IRI it stands for (`BeliefLine.iri`) with the user's IRI (`statedBy`, an
 * absolute IRI, which every context expands to itself); `null` for none.
 */
export function beliefOf(line: EntryLine | null, user: User): Belief | null {
  const actor = statedBy(user);
  return line?.beliefs.find((held) => held.iri === actor)?.belief ?? null;
}

/** One line of a provenance entry's paradata: which member, its label, and its items as shown. */
export interface ParadataRow {
  readonly key: "statedBy" | "method" | "service" | "basis" | "match" | "note" | "date";
  readonly label: string;
  /** One item per value, a list's in its order; words carry no IRI. */
  readonly items: readonly ShownIri[];
}

/** The paradata of an entry line, in the order shown, with their labels. */
const PARADATA: readonly (readonly [ParadataRow["key"], string])[] = [
  ["statedBy", "stated by"],
  ["method", "method"],
  ["service", "service"],
  ["basis", "basis"],
  ["match", "match"],
  ["note", "note"],
  ["date", "date"],
];

/**
 * How a pair or a MatchClaim was made, as its details list it: one row per
 * paradata member the entry states, in the order who stated it, method,
 * service, basis, match, note, date. The one paradata reader of both tabs.
 */
export function paradataRows(line: EntryLine): ParadataRow[] {
  return PARADATA.flatMap(([key, label]): ParadataRow[] => {
    const items = itemsOf(line, key);
    return items.length === 0 ? [] : [{ key, label, items }];
  });
}

/** The items of one paradata member of a line: none where the entry does not state it. */
function itemsOf(line: EntryLine, key: ParadataRow["key"]): readonly ShownIri[] {
  switch (key) {
    case "statedBy":
      return line.statedBy;
    case "basis":
      return line.basis;
    case "service":
      return line.service === null ? [] : [line.service];
    default: {
      const value = line[key];
      return value === null ? [] : [{ text: value, iri: null }];
    }
  }
}
