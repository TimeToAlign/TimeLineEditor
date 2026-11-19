/**
 * The choices the Metadata tab offers, read from TimeToShare's catalogue:
 * the verbs (in the order the subject's types make usual), the vocabularies
 * a verb can be stated in, the forms (alternatives) of a pattern there, the
 * types an "is a" offers, and compact IRIs. The value kinds per verb and the
 * kinds each lookup can search are the editor's own tables, not catalogue
 * data.
 *
 * The catalogue offered is the shipped one with the viewer's type profiles
 * and lookup services (`withProfiles`): a profile's verbs lead where its
 * "is a" is stated, and a service is a system wherever a verb's fallback
 * pattern takes a thing.
 */

import type { Alternative, Catalogue, CatalogueVerb, Pair } from "@timetoalign/timetoshare";
import { defaultCatalogue, expandIri, isJsonObject, samePair } from "@timetoalign/timetoshare";
import type { ValueKind } from "../../lookup/index.ts";
import { isServiceSystem } from "../../lookup/services.ts";
import { profilesState } from "../../profiles/profiles.svelte.ts";
import type { Profiles } from "../../profiles/profiles.ts";
import { withProfiles } from "../../profiles/profiles.ts";

/** A JSON object as TimeToShare's statement functions read one. */
export type JsonObject = { [key: string]: unknown };

/** The catalogue of the page's profiles, kept until the profiles change. */
let offered: { readonly profiles: Profiles; readonly catalogue: Catalogue } | null = null;

function current(): Catalogue {
  const profiles = profilesState().profiles;
  if (offered?.profiles !== profiles) {
    offered = { profiles, catalogue: withProfiles(defaultCatalogue(), profiles) };
  }
  return offered.catalogue;
}

/**
 * The catalogue the tab offers: the shipped one with the page's profiles,
 * read afresh at every access, so a reader that is reactive (a `$derived`)
 * follows a change of the profiles.
 */
export const CATALOGUE: Catalogue = {
  get prefixes() {
    return current().prefixes;
  },
  get aliases() {
    return current().aliases;
  },
  get systems() {
    return current().systems;
  },
  get verbs() {
    return current().verbs;
  },
  get types() {
    return current().types;
  },
};

/** The kind of value a verb takes, for lookups; a verb not listed takes `any`. */
export const VERB_VALUE_KINDS: Readonly<Record<string, ValueKind>> = {
  is_a: "class",
  recording_of: "work",
  version_or_edition_of: "work",
  performed_by: "agent",
  conducted_by: "agent",
  composed_by: "agent",
  released_on: "release",
};

/** The kind of value `verb` takes. */
export function valueKindOf(verb: string): ValueKind {
  return Object.hasOwn(VERB_VALUE_KINDS, verb) ? (VERB_VALUE_KINDS[verb] ?? "any") : "any";
}

/**
 * The kinds of value each system's lookup searches, the systems a verb's
 * fallback slot offers besides those with a pattern of their own.
 */
export const SEARCHED_KINDS: Readonly<Record<string, readonly ValueKind[]>> = {
  wikidata: ["work", "agent", "recording", "release", "class", "any"],
  gnd: ["work", "agent"],
  musicbrainz: ["work", "agent", "recording", "release"],
};

/** Whether `system`'s lookup searches values of `kind`: a viewer's service searches every kind. */
function searches(system: string, kind: ValueKind): boolean {
  return isServiceSystem(system) || (SEARCHED_KINDS[system] ?? []).includes(kind);
}

/** The verb that takes any property: "Other property…". */
export const OTHER = "other";
/** The vocabulary of a value that is an element of the same manifest. */
export const ELEMENT = "element";
/** The system whose patterns take values of any system. */
export const FALLBACK = "fallback";

/** A verb as the Verb field offers it: a reading of a catalogue verb, or "Other property…". */
export interface VerbChoice {
  readonly id: string;
  readonly inverse: boolean;
  readonly label: string;
}

/** A vocabulary as the Vocabulary field offers it: a catalogue system, or an element of the manifest. */
export interface SystemChoice {
  readonly id: string;
  readonly label: string;
}

/** The "Other property…" choice. */
export const OTHER_PROPERTY: VerbChoice = { id: OTHER, inverse: false, label: "Other property…" };

function verbOfId(catalogue: Catalogue, id: string): CatalogueVerb | undefined {
  return catalogue.verbs.find((verb) => verb.id === id);
}

/** The words of one reading of a verb: its label, or its inverse label. */
export function verbLabel(catalogue: Catalogue, id: string, inverse: boolean): string {
  const verb = verbOfId(catalogue, id);
  if (verb === undefined) return id;
  return inverse ? (verb.inverse_label ?? verb.label) : verb.label;
}

/** The alternatives of `system` that state the reading, with their indices among the system's. */
function readings(
  verb: CatalogueVerb,
  system: string,
  inverse: boolean,
): readonly (readonly [number, Alternative])[] {
  const all = Object.hasOwn(verb.patterns, system) ? (verb.patterns[system] ?? []) : [];
  return [...all.entries()].filter(([, alternative]) => (alternative.inverse === true) === inverse);
}

/** Whether a pattern holds a thing slot `{id: "?"}` at any depth. */
function holdsThingSlot(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(holdsThingSlot);
  if (!isJsonObject(value)) return false;
  return Object.entries(value).some(([key, member]) =>
    key === "id" ? member === "?" : holdsThingSlot(member),
  );
}

/** Whether the fallback system states the reading with a thing slot, which takes a value of any system. */
function fallbackTakesThings(verb: CatalogueVerb, inverse: boolean): boolean {
  return readings(verb, FALLBACK, inverse).some(([, alternative]) =>
    holdsThingSlot(alternative.pattern),
  );
}

/**
 * The system whose patterns state a reading with a value of `system`:
 * `system` itself where it has a pattern of the reading, else the fallback
 * (an element's value, or a thing of a system without a pattern of its own).
 */
export function patternSystem(catalogue: Catalogue, verb: VerbChoice, system: string): string {
  const found = verbOfId(catalogue, verb.id);
  if (found !== undefined && readings(found, system, verb.inverse).length > 0) return system;
  return FALLBACK;
}

/**
 * Whether `system` can state the reading: a pattern of its own, or a thing
 * for the fallback's slot (a thing it names, or an entity a service finds).
 */
function statable(catalogue: Catalogue, verb: CatalogueVerb, inverse: boolean, system: string) {
  if (readings(verb, system, inverse).length > 0) return true;
  const holder = catalogue.systems.find((candidate) => candidate.id === system);
  return (
    holder !== undefined &&
    (holder.things.length > 0 || isServiceSystem(holder.id)) &&
    fallbackTakesThings(verb, inverse)
  );
}

/** Every reading of every verb: the direct one, then the inverse where a pattern states it. */
function allReadings(catalogue: Catalogue): VerbChoice[] {
  const found: VerbChoice[] = [];
  for (const verb of catalogue.verbs) {
    const alternatives = Object.values(verb.patterns).flat();
    if (alternatives.some((alternative) => alternative.inverse !== true)) {
      found.push({ id: verb.id, inverse: false, label: verb.label });
    }
    if (alternatives.some((alternative) => alternative.inverse === true)) {
      found.push({ id: verb.id, inverse: true, label: verb.inverse_label ?? verb.label });
    }
  }
  return found;
}

/** The pairs an alternative's pattern holds, keys in code-point order, each `type` item its own pair. */
function patternPairs(pattern: JsonObject): Pair[] {
  const found: Pair[] = [];
  for (const key of Object.keys(pattern).sort()) {
    const values = pattern[key];
    for (const item of Array.isArray(values) ? values : []) found.push([key, item]);
  }
  return found;
}

/**
 * The catalogue types the "is a" pairs `isA` state: those any of whose
 * "is a" alternatives has all its pairs among them; those with more such
 * alternatives (more vocabularies agreeing) first, else in catalogue order.
 */
export function typesOf(
  catalogue: Catalogue,
  context: JsonObject,
  isA: readonly Pair[],
): readonly string[] {
  const meets = (pattern: JsonObject): boolean =>
    patternPairs(pattern).every((wanted) => isA.some((pair) => samePair(context, wanted, pair)));
  return catalogue.types
    .map((type) => ({
      id: type.id,
      count: Object.values(type.is_a)
        .flat()
        .filter((alternative) => meets(alternative.pattern)).length,
    }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count)
    .map(({ id }) => id);
}

/**
 * The verbs the Verb field offers: "is a"; then the usual verbs of `types`
 * in type order without repeats; then the rest in catalogue order, an
 * inverse reading after its direct one; "Other property…" last. With a
 * system, only the readings it can state.
 */
export function verbChoices(
  catalogue: Catalogue,
  types: readonly string[],
  system?: string,
): readonly VerbChoice[] {
  const every = allReadings(catalogue);
  const usual = new Set(
    types.flatMap((id) => catalogue.types.find((type) => type.id === id)?.verbs ?? []),
  );
  const order = ["is_a", ...usual];
  const ranked = [...every].sort((left, right) => {
    const rank = (choice: VerbChoice): number => {
      const index = order.indexOf(choice.id);
      return index < 0 ? order.length : index;
    };
    return rank(left) - rank(right);
  });
  const offered =
    system === undefined
      ? ranked
      : ranked.filter((choice) => {
          const verb = verbOfId(catalogue, choice.id);
          return verb !== undefined && statable(catalogue, verb, choice.inverse, system);
        });
  return [...offered, OTHER_PROPERTY];
}

/**
 * The vocabularies a reading can be stated in, in catalogue order: those
 * with a pattern of it, and those whose lookup searches its kind of value
 * (the viewer's services, after the catalogue's systems, search every
 * kind) where the fallback states it with a thing slot; then "An element of this
 * manifest" where the fallback has that slot. The fallback is labelled
 * "Other vocabularies".
 */
export function systemChoices(catalogue: Catalogue, verb: VerbChoice): readonly SystemChoice[] {
  const found = verbOfId(catalogue, verb.id);
  if (found === undefined) return [];
  const kind = valueKindOf(verb.id);
  const slot = fallbackTakesThings(found, verb.inverse);
  const choices: SystemChoice[] = catalogue.systems
    .filter(
      (system) =>
        readings(found, system.id, verb.inverse).length > 0 || (slot && searches(system.id, kind)),
    )
    .map((system) => ({
      id: system.id,
      label: system.id === FALLBACK ? "Other vocabularies" : system.name,
    }));
  if (slot) choices.push({ id: ELEMENT, label: "An element of this manifest" });
  return choices;
}

/** The choice of a system by its ID, as `systemChoices` labels it. */
export function systemChoice(catalogue: Catalogue, id: string): SystemChoice {
  if (id === ELEMENT) return { id, label: "An element of this manifest" };
  if (id === FALLBACK) return { id, label: "Other vocabularies" };
  return { id, label: catalogue.systems.find((system) => system.id === id)?.name ?? id };
}

/** The indices of the alternatives that state the reading in its pattern system for `system`. */
export function alternativesOf(
  catalogue: Catalogue,
  verb: VerbChoice,
  system: string,
): readonly number[] {
  const found = verbOfId(catalogue, verb.id);
  if (found === undefined) return [];
  return readings(found, patternSystem(catalogue, verb, system), verb.inverse).map(
    ([index]) => index,
  );
}

/** The alternative `index` of the reading's pattern system for `system`. */
export function alternativeAt(
  catalogue: Catalogue,
  verb: VerbChoice,
  system: string,
  index: number,
): Alternative | undefined {
  const found = verbOfId(catalogue, verb.id);
  return found?.patterns[patternSystem(catalogue, verb, system)]?.[index];
}

/**
 * The alternative a form starts on: the first whose `when` fits (a subject
 * of one of `types`, a value of the thing `thing`), else the first without
 * a `when`, else the first.
 */
export function defaultAlternative(
  catalogue: Catalogue,
  verb: VerbChoice,
  system: string,
  types: readonly string[],
  thing: string | null,
): number {
  const indices = alternativesOf(catalogue, verb, system);
  const at = (index: number) => alternativeAt(catalogue, verb, system, index);
  const fits = (alternative: Alternative | undefined): boolean => {
    const when = alternative?.when;
    if (when === undefined) return false;
    const subject = when.subject === undefined || when.subject.some((t) => types.includes(t));
    const value = when.value === undefined || (thing !== null && when.value.includes(thing));
    return subject && value;
  };
  return (
    indices.find((index) => fits(at(index))) ??
    indices.find((index) => at(index)?.when === undefined) ??
    indices[0] ??
    0
  );
}

/** The named slots of a pattern (`?role` gives `role`), in the order they appear. */
export function namedSlots(pattern: unknown): readonly string[] {
  const found: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string" && value.startsWith("?") && value.length > 1) {
      if (!found.includes(value.slice(1))) found.push(value.slice(1));
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (isJsonObject(value)) Object.values(value).forEach(walk);
  };
  walk(pattern);
  return found;
}

/** Whether a pattern's value slot `?` takes a literal: it stands in a list, not as an `id` nor a `type` item. */
export function takesLiteral(pattern: unknown): boolean {
  const walk = (value: unknown, key: string | null): boolean => {
    if (value === "?") return key !== "id" && key !== "type";
    if (Array.isArray(value)) return value.some((item) => walk(item, key));
    if (isJsonObject(value)) return Object.entries(value).some(([k, member]) => walk(member, k));
    return false;
  };
  return walk(pattern, null);
}

/** The prefixes of the catalogue and those `context` declares (namespaces ending in `/` or `#`). */
export function prefixesOf(
  catalogue: Catalogue,
  context: unknown,
): Readonly<Record<string, string>> {
  const own: Record<string, string> = {};
  if (isJsonObject(context)) {
    for (const [prefix, namespace] of Object.entries(context)) {
      if (typeof namespace === "string" && /[/#]$/u.test(namespace) && !prefix.startsWith("@")) {
        own[prefix] = namespace;
      }
    }
  }
  return { ...catalogue.prefixes, ...own };
}

const LOCAL_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/u;

/**
 * `iri` written compactly: with the longest namespace of `prefixes` that
 * begins it and leaves a rest that is a plain local name; else as given.
 */
export function compactIri(prefixes: Readonly<Record<string, string>>, iri: string): string {
  let best: [string, string] | null = null;
  for (const [prefix, namespace] of Object.entries(prefixes)) {
    if (!iri.startsWith(namespace) || !LOCAL_NAME.test(iri.slice(namespace.length))) continue;
    if (best === null || namespace.length > best[1].length) best = [prefix, namespace];
  }
  return best === null ? iri : `${best[0]}:${iri.slice(best[1].length)}`;
}

/** `text` as an absolute IRI under `prefixes`, or null: a compact IRI expanded, an absolute one kept. */
export function absoluteIri(
  prefixes: Readonly<Record<string, string>>,
  text: string,
): string | null {
  return expandIri(prefixes, text.trim());
}

/** A type the "is a" field offers in `system`: one per alternative of a catalogue type there. */
export interface TypeOption {
  readonly type: string;
  readonly label: string;
  readonly pairs: readonly Pair[];
}

/** The types the "is a" field offers in `system`, in catalogue order: each alternative its own option. */
export function typeOptions(catalogue: Catalogue, system: string): readonly TypeOption[] {
  return catalogue.types.flatMap((type) => {
    const alternatives = Object.hasOwn(type.is_a, system) ? (type.is_a[system] ?? []) : [];
    return alternatives.map((alternative) => ({
      type: type.id,
      label:
        alternatives.length > 1 && alternative.note !== undefined
          ? `${type.label} (${alternative.note})`
          : type.label,
      pairs: patternPairs(alternative.pattern),
    }));
  });
}
