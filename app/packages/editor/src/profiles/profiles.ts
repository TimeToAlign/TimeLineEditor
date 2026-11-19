/**
 * Type profiles: the viewer's own types of thing, each with its "is a"
 * patterns per system, the verbs usually stated of such a thing (in the
 * order the composer offers them first) and its preferred lookup systems;
 * and the viewer's own lookup services, Reconciliation Service API
 * endpoints. They are application settings of the viewer, never part of a
 * workspace or a manifest, exchanged as a YAML file:
 *
 * ```yaml
 * profiles:
 *   -
 *     id: lecture_recording
 *     is_a:
 *       fallback:
 *         -
 *           pattern:
 *             type: ["schema:AudioObject"]
 *     label: "lecture recording"
 *     lookup: [wikidata]
 *     verbs: [performed_by, recorded_at_on]
 * services: []
 * ```
 *
 * A profile of the same ID as a catalogue type replaces it; the others
 * come before the catalogue's types, so where a profile and a catalogue
 * type state the same "is a", the profile's verbs lead. A service
 * `{id, name, endpoint}` becomes the system `service:<id>`.
 */

import type { Catalogue, CatalogueSystem, CatalogueType } from "@timetoalign/timetoshare";
import { compactSortedJson, dumps, expandIri, isJsonObject, loads } from "@timetoalign/timetoshare";
import type { FileKind } from "../files.ts";
import type { Service } from "../lookup/services.ts";
import { serviceSystem } from "../lookup/services.ts";

/** A JSON object as read from a file. */
type JsonObject = { [key: string]: unknown };

/** One "is a" alternative of a profile: a statements fragment without slots. */
export interface ProfilePattern {
  readonly pattern: JsonObject;
}

/** A type of thing the viewer defined. */
export interface Profile {
  readonly id: string;
  readonly label: string;
  /** The "is a" alternatives per catalogue system. */
  readonly is_a: Readonly<Record<string, readonly ProfilePattern[]>>;
  /** Catalogue verb IDs, in the order the composer offers them. */
  readonly verbs: readonly string[];
  /** Catalogue systems and `service:<id>` systems, most preferred first. */
  readonly lookup: readonly string[];
}

/** The profiles and services of one file, or of the browser. */
export interface Profiles {
  readonly profiles: readonly Profile[];
  readonly services: readonly Service[];
}

/** No profile and no service: the shipped catalogue alone. */
export const NO_PROFILES: Profiles = { profiles: [], services: [] };

/** A profile file to import or export. */
export const PROFILES_FILE: FileKind = {
  description: "TimeLineEditor type profiles",
  accept: { "application/yaml": [".yaml", ".yml"] },
};

/** The name a profile file is exported under. */
export const PROFILES_FILE_NAME = "profiles.yaml";

const ID = /^[a-z0-9_]+$/u;
const SERVICE_ID = /^[A-Za-z0-9_-]+$/u;

/** A problem at a path of the file, as `readProfiles` reports it. */
class Problem extends Error {}

function fail(path: readonly (string | number)[], message: string): never {
  throw new Problem(path.length === 0 ? message : `${path.join("/")}: ${message}`);
}

function objectAt(value: unknown, path: readonly (string | number)[], what: string): JsonObject {
  if (!isJsonObject(value)) fail(path, `${what} is an object`);
  return value;
}

function arrayAt(value: unknown, path: readonly (string | number)[], what: string): unknown[] {
  if (!Array.isArray(value)) fail(path, `${what} is a list`);
  return value;
}

function textAt(value: unknown, path: readonly (string | number)[], what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(path, `${what} is a non-empty text`);
  return value;
}

/** Refuse a member of `object` other than `members`, the first in code-point order. */
function onlyMembers(
  object: JsonObject,
  members: readonly string[],
  path: readonly (string | number)[],
): void {
  const unknown = Object.keys(object)
    .filter((key) => !members.includes(key))
    .sort();
  if (unknown[0] !== undefined) fail(path, `'${unknown[0]}' is no member here`);
}

/** Refuse a member of `object` among `members` that is missing. */
function required(
  object: JsonObject,
  members: readonly string[],
  path: readonly (string | number)[],
): void {
  for (const member of members) {
    if (!Object.hasOwn(object, member)) fail(path, `'${member}' is missing`);
  }
}

/** A list of distinct texts, each one `known` accepts. */
function idList(
  value: unknown,
  path: readonly (string | number)[],
  what: string,
  known: (id: string) => boolean,
  unknownMessage: (id: string) => string,
): string[] {
  const list = arrayAt(value, path, `${what}`);
  const seen: string[] = [];
  list.forEach((item, index) => {
    const at = [...path, index];
    const id = textAt(item, at, "an item");
    if (!known(id)) fail(at, unknownMessage(id));
    if (seen.includes(id)) fail(at, `'${id}' is given twice`);
    seen.push(id);
  });
  return seen;
}

/** An IRI written in a pattern: absolute, or compact under a prefix the catalogue declares. */
function iriAt(
  catalogue: Catalogue,
  text: unknown,
  path: readonly (string | number)[],
  what: string,
): void {
  const iri = textAt(text, path, what);
  if (iri.startsWith("?") || expandIri(catalogue.prefixes, iri) === null) {
    fail(path, `'${iri}' is no IRI: write it absolute or with a prefix the catalogue declares`);
  }
}

/**
 * An "is a" pattern: an object of at least one member, `type` holding a
 * list of class IRIs, every other key a property IRI holding a list of
 * nodes `{id}` naming an IRI.
 */
function patternAt(catalogue: Catalogue, value: unknown, path: readonly (string | number)[]) {
  const pattern = objectAt(value, path, "a pattern");
  const keys = Object.keys(pattern);
  if (keys.length === 0) fail(path, "a pattern states at least one pair");
  for (const key of keys.sort()) {
    const at = [...path, key];
    const items = arrayAt(pattern[key], at, "a pattern's value");
    if (items.length === 0) fail(at, "a pattern's value holds at least one item");
    if (key === "type") {
      items.forEach((item, index) => {
        iriAt(catalogue, item, [...at, index], "a type");
      });
      continue;
    }
    iriAt(catalogue, key, at, "a property");
    items.forEach((item, index) => {
      const node = objectAt(item, [...at, index], "a value");
      onlyMembers(node, ["id"], [...at, index]);
      required(node, ["id"], [...at, index]);
      iriAt(catalogue, node.id, [...at, index, "id"], "a value's id");
    });
  }
  return pattern;
}

function profileAt(
  catalogue: Catalogue,
  services: readonly Service[],
  value: unknown,
  path: readonly (string | number)[],
): Profile {
  const object = objectAt(value, path, "a profile");
  onlyMembers(object, ["id", "is_a", "label", "lookup", "verbs"], path);
  required(object, ["id", "label", "is_a", "verbs", "lookup"], path);
  const id = textAt(object.id, [...path, "id"], "an id");
  if (!ID.test(id)) {
    fail([...path, "id"], `'${id}' is no profile id: use a–z, 0–9 and _ only`);
  }
  const label = textAt(object.label, [...path, "label"], "a label");
  const isA = objectAt(object.is_a, [...path, "is_a"], "'is_a'");
  const systems = catalogue.systems.map((system) => system.id);
  const read: Record<string, ProfilePattern[]> = {};
  for (const system of Object.keys(isA).sort()) {
    const at = [...path, "is_a", system];
    if (!systems.includes(system)) fail(at, `'${system}' is no system of the catalogue`);
    read[system] = arrayAt(isA[system], at, "a system's alternatives").map((item, index) => {
      const alternative = objectAt(item, [...at, index], "an alternative");
      onlyMembers(alternative, ["pattern"], [...at, index]);
      required(alternative, ["pattern"], [...at, index]);
      return { pattern: patternAt(catalogue, alternative.pattern, [...at, index, "pattern"]) };
    });
  }
  const verbs = idList(
    object.verbs,
    [...path, "verbs"],
    "'verbs'",
    (verb) => catalogue.verbs.some((candidate) => candidate.id === verb),
    (verb) => `'${verb}' is no verb of the catalogue`,
  );
  const lookup = idList(
    object.lookup,
    [...path, "lookup"],
    "'lookup'",
    (system) =>
      systems.includes(system) || services.some((service) => serviceSystem(service.id) === system),
    (system) => `'${system}' is no system of the catalogue and no service of the file`,
  );
  return { id, label, is_a: read, verbs, lookup };
}

function serviceAt(value: unknown, path: readonly (string | number)[]): Service {
  const object = objectAt(value, path, "a service");
  onlyMembers(object, ["endpoint", "id", "name"], path);
  required(object, ["id", "name", "endpoint"], path);
  const id = textAt(object.id, [...path, "id"], "an id");
  if (!SERVICE_ID.test(id)) {
    fail([...path, "id"], `'${id}' is no service id: use A–Z, a–z, 0–9, _ and - only`);
  }
  const name = textAt(object.name, [...path, "name"], "a name");
  const endpoint = textAt(object.endpoint, [...path, "endpoint"], "an endpoint");
  let url: URL | null = null;
  try {
    url = new URL(endpoint);
  } catch {
    url = null;
  }
  if (url === null || (url.protocol !== "https:" && url.protocol !== "http:")) {
    fail([...path, "endpoint"], `'${endpoint}' is no http or https URL`);
  }
  return { id, name, endpoint };
}

/**
 * The profiles and services `value` holds, or the first problem, its
 * path written `profiles/0/verbs/1: …`. Read in this order: the root's
 * members; the services (an ID twice is refused); each profile's members,
 * ID, label, "is a" (catalogue systems, patterns whose IRIs are absolute
 * or under the catalogue's prefixes), verbs (catalogue verbs, none twice)
 * and lookup systems (catalogue systems and the file's services, none
 * twice); and last an ID given to two profiles.
 */
export function readProfiles(value: unknown, catalogue: Catalogue): Profiles | string {
  try {
    const root = objectAt(value, [], "a profile file");
    onlyMembers(root, ["profiles", "services"], []);
    required(root, ["profiles", "services"], []);
    const services = arrayAt(root.services, ["services"], "'services'").map((item, index) =>
      serviceAt(item, ["services", index]),
    );
    services.forEach((service, index) => {
      if (services.findIndex((other) => other.id === service.id) !== index) {
        fail(["services", index, "id"], `'${service.id}' is given twice`);
      }
    });
    const profiles = arrayAt(root.profiles, ["profiles"], "'profiles'").map((item, index) =>
      profileAt(catalogue, services, item, ["profiles", index]),
    );
    profiles.forEach((profile, index) => {
      if (profiles.findIndex((other) => other.id === profile.id) !== index) {
        fail(["profiles", index, "id"], `'${profile.id}' is given twice`);
      }
    });
    return { profiles, services };
  } catch (error) {
    if (error instanceof Problem) return error.message;
    throw error;
  }
}

/** The profile file of `profiles`: canonical YAML, as Export writes it and the browser keeps it. */
export function profilesText(profiles: Profiles): string {
  return dumps(profiles);
}

/** The profiles of a file's text, or what is wrong with it. */
export function parseProfiles(text: string, catalogue: Catalogue): Profiles | string {
  let value: unknown;
  try {
    value = loads(text);
  } catch (error) {
    return `The file is no YAML or JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  return readProfiles(value, catalogue);
}

/** The catalogue type a profile stands for. */
function typeOf(profile: Profile): CatalogueType {
  return {
    id: profile.id,
    label: profile.label,
    is_a: profile.is_a,
    verbs: profile.verbs,
    lookup: profile.lookup,
  };
}

/** The catalogue system a service stands for: no things, no vocabulary, looked up from the browser. */
function systemOf(service: Service): CatalogueSystem {
  return {
    id: serviceSystem(service.id),
    name: service.name,
    prefixes: [],
    things: [],
    lookup: { route: "browser", endpoint: service.endpoint },
  };
}

/**
 * `catalogue` with `profiles`: the profiles first as types, then the
 * catalogue's types no profile replaces; the catalogue's systems, then one
 * per service. Without profiles or services, `catalogue` itself.
 */
export function withProfiles(catalogue: Catalogue, profiles: Profiles): Catalogue {
  if (profiles.profiles.length === 0 && profiles.services.length === 0) return catalogue;
  const own = new Set(profiles.profiles.map((profile) => profile.id));
  return {
    ...catalogue,
    systems: [...catalogue.systems, ...profiles.services.map(systemOf)],
    types: [
      ...profiles.profiles.map(typeOf),
      ...catalogue.types.filter((type) => !own.has(type.id)),
    ],
  };
}

/** The words of a pattern: each pair as property and value, `type` items as `type <class>`, comma-separated. */
export function patternText(pattern: JsonObject): string {
  return Object.keys(pattern)
    .sort()
    .flatMap((key) => {
      const items = pattern[key];
      return (Array.isArray(items) ? items : []).map((item) => {
        const value = isJsonObject(item) && typeof item.id === "string" ? item.id : String(item);
        return `${key} ${value}`;
      });
    })
    .join(", ");
}

/** The one text two equal patterns share, whatever the order of their keys. */
export function patternKey(pattern: JsonObject): string {
  return compactSortedJson(pattern);
}

/** A pattern the "is a" of a profile may take in a system, with the catalogue types stating it. */
export interface PatternOption {
  readonly key: string;
  readonly pattern: JsonObject;
  readonly text: string;
  /** The labels of the catalogue types with this "is a" there, in catalogue order. */
  readonly types: readonly string[];
}

/** The systems an "is a" is stated in, each with the catalogue's patterns there. */
export interface IsAChoice {
  readonly system: string;
  readonly label: string;
  readonly options: readonly PatternOption[];
}

/**
 * The "is a" choices a profile is edited with: every system the catalogue's
 * "is a" verb has a pattern in, in catalogue order (the fallback labelled
 * "Other vocabularies"), each with the distinct "is a" patterns of the
 * catalogue's types there, in the order the types first state them.
 */
export function isAChoices(catalogue: Catalogue): readonly IsAChoice[] {
  const verb = catalogue.verbs.find((candidate) => candidate.id === "is_a");
  return catalogue.systems
    .filter((system) => (verb?.patterns[system.id] ?? []).length > 0)
    .map((system) => {
      const options: PatternOption[] = [];
      for (const type of catalogue.types) {
        for (const alternative of type.is_a[system.id] ?? []) {
          const key = patternKey(alternative.pattern);
          const found = options.findIndex((option) => option.key === key);
          if (found < 0) {
            options.push({
              key,
              pattern: alternative.pattern,
              text: patternText(alternative.pattern),
              types: [type.label],
            });
          } else {
            const option = options[found] as PatternOption;
            if (!option.types.includes(type.label)) {
              options[found] = { ...option, types: [...option.types, type.label] };
            }
          }
        }
      }
      return {
        system: system.id,
        label: system.id === "fallback" ? "Other vocabularies" : system.name,
        options,
      };
    });
}

/** `profile` with `pattern` stated in `system` (appended) or not. */
export function withPattern(
  profile: Profile,
  system: string,
  pattern: JsonObject,
  stated: boolean,
): Profile {
  const key = patternKey(pattern);
  const kept = (profile.is_a[system] ?? []).filter(
    (alternative) => patternKey(alternative.pattern) !== key,
  );
  const next = stated ? [...kept, { pattern }] : kept;
  const isA: Record<string, readonly ProfilePattern[]> = { ...profile.is_a };
  if (next.length === 0) delete isA[system];
  else isA[system] = next;
  return { ...profile, is_a: isA };
}

/** `profile` with the verb at `index` moved one place up (`-1`) or down (`1`); unchanged at an end. */
export function movedVerb(profile: Profile, index: number, by: -1 | 1): Profile {
  const to = index + by;
  const verbs = [...profile.verbs];
  const verb = verbs[index];
  if (verb === undefined || to < 0 || to >= verbs.length) return profile;
  verbs.splice(index, 1);
  verbs.splice(to, 0, verb);
  return { ...profile, verbs };
}

/** `profile` with `system` among its lookup systems or not, kept in the order of `order`. */
export function withLookup(
  profile: Profile,
  system: string,
  chosen: boolean,
  order: readonly string[],
): Profile {
  const next = new Set(profile.lookup);
  if (chosen) next.add(system);
  else next.delete(system);
  const ordered = order.filter((id) => next.has(id));
  return { ...profile, lookup: [...ordered, ...[...next].filter((id) => !order.includes(id))] };
}

/**
 * `profile` following a change of the service `from`: its lookup system
 * `service:<from>` becomes `service:<to>` in its place (the service's ID
 * changed to `to`), or is taken out (`to` null: the service deleted).
 */
export function withServiceLookup(profile: Profile, from: string, to: string | null): Profile {
  const old = serviceSystem(from);
  if (!profile.lookup.includes(old)) return profile;
  const lookup =
    to === null
      ? profile.lookup.filter((system) => system !== old)
      : profile.lookup.map((system) => (system === old ? serviceSystem(to) : system));
  return { ...profile, lookup };
}

/** A system a profile may look its values up in. */
export interface LookupChoice {
  readonly id: string;
  readonly label: string;
}

/**
 * The lookup systems a profile chooses among: the catalogue's systems that
 * are looked up somehow (all but those whose lookup route is `none`), then
 * the services, in their order.
 */
export function lookupChoices(
  catalogue: Catalogue,
  services: readonly Service[],
): readonly LookupChoice[] {
  return [
    ...catalogue.systems
      .filter((system) => system.lookup.route !== "none")
      .map((system) => ({ id: system.id, label: system.name })),
    ...services.map((service) => ({ id: serviceSystem(service.id), label: service.name })),
  ];
}

/** The smallest `<stem><n>` (n from 1) none of `taken` is; `stem` alone first where `bare`. */
function freeId(stem: string, taken: readonly string[], bare: boolean): string {
  if (bare && !taken.includes(stem)) return stem;
  for (let n = bare ? 2 : 1; ; n += 1) {
    const id = `${stem}${bare ? "_" : ""}${n}`;
    if (!taken.includes(id)) return id;
  }
}

/**
 * A new profile: a copy of the catalogue type `from` (its "is a" patterns
 * without their notes and conditions, its verbs, its lookup systems) under
 * its ID, so it replaces that type, or `<id>_2`, … where a profile has the
 * ID; else an empty profile `type_1`, `type_2`, … labelled "new type".
 */
export function newProfile(taken: readonly string[], from: CatalogueType | null): Profile {
  if (from === null) {
    return {
      id: freeId("type_", taken, false),
      label: "new type",
      is_a: {},
      verbs: [],
      lookup: [],
    };
  }
  const isA: Record<string, readonly ProfilePattern[]> = {};
  for (const [system, alternatives] of Object.entries(from.is_a)) {
    isA[system] = alternatives.map((alternative) => ({ pattern: alternative.pattern }));
  }
  return {
    id: freeId(from.id, taken, true),
    label: from.label,
    is_a: isA,
    verbs: [...from.verbs],
    lookup: [...from.lookup],
  };
}
