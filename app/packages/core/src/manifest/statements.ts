/**
 * The elements of a manifest that carry statements: the manifest itself,
 * every timeline at any depth and every region, each holding its
 * property–value pairs (`statements`) and their annotations (`provenance`).
 * This module is the one walk of them (`statementHolders`), the one view of
 * them alone (`skeletonOf`), on which the schema package's statement
 * functions run, the two forms of the manifest's JSON-LD `@context` (the
 * held one, `withStatementContext`, and the file's, `withFullContext`), and
 * the one pruning of the references a removal leaves dangling
 * (`withoutReferencesTo`).
 *
 * A manifest core holds carries no term of the format in its `@context`:
 * only the prefixes it declares itself, those that are no format term and no
 * catalogue prefix with the same namespace, and only while its statements
 * use them; without such a prefix it has no `@context`. The full context,
 * the format's terms and every prefix the statements use, is added where a
 * manifest leaves core: for a file, for the schema check and for the
 * statement functions of the schema package.
 *
 * Every ID is bare, as core holds it; a reference to an element inside
 * `statements` and `provenance` is an IRI reference (`#cpt_1`), the same in
 * the file and in memory.
 */

import { defaultCatalogue, FORMAT_CONTEXT, toFileId, usedPrefixes } from "@timetoalign/timetoshare";
import type { Json, JsonObject, PathSegment } from "../json.ts";
import { isJsonObject, jsonEqual } from "../json.ts";
import type { Manifest, ProvenanceEntry, Region, Statements, TimelineManifest } from "./types.ts";

/** The kinds of element that carry statements. */
export type HolderKind = "manifest" | "timeline" | "region";

/** One element that may carry statements, with what it carries. */
export interface StatementHolder {
  readonly kind: HolderKind;
  /** The element's bare ID; `null` for the manifest. */
  readonly id: string | null;
  /** The element's `name`; `null` where it states none. */
  readonly name: string | null;
  /** The element's path from the manifest: `[]` for the manifest, `["timelines", 1, "children", 0]`, … */
  readonly path: readonly PathSegment[];
  readonly statements: Statements | undefined;
  readonly provenance: readonly ProvenanceEntry[] | undefined;
}

/**
 * Every element of `manifest` that may carry statements, in subject order:
 * the manifest, then root by root the timeline, its regions in their order,
 * its children depth first.
 */
export function* statementHolders(manifest: Manifest): Generator<StatementHolder> {
  yield {
    kind: "manifest",
    id: null,
    name: manifest.name,
    path: [],
    statements: manifest.statements,
    provenance: manifest.provenance,
  };
  function* visit(
    timeline: TimelineManifest,
    path: readonly PathSegment[],
  ): Generator<StatementHolder> {
    const { id, name, statements, provenance } = timeline;
    yield { kind: "timeline", id, name, path, statements, provenance };
    for (const [index, region] of timeline.regions.entries()) {
      yield regionHolder(region, [...path, "regions", index]);
    }
    for (const [index, child] of timeline.children.entries()) {
      yield* visit(child, [...path, "children", index]);
    }
  }
  for (const [index, root] of manifest.timelines.entries()) {
    yield* visit(root, ["timelines", index]);
  }
}

function regionHolder(region: Region, path: readonly PathSegment[]): StatementHolder {
  const { id, name, statements, provenance } = region;
  return { kind: "region", id, name, path, statements, provenance };
}

/**
 * The element of `manifest` with the bare ID `id` that may carry
 * statements (`null`: the manifest itself); `undefined` where no timeline or
 * region has it.
 */
export function statementHolder(
  manifest: Manifest,
  id: string | null,
): StatementHolder | undefined {
  for (const holder of statementHolders(manifest)) if (holder.id === id) return holder;
  return undefined;
}

/** A region of a skeleton: its ID and what it states. */
export interface SkeletonRegion {
  readonly id: string;
  readonly statements?: Statements;
  readonly provenance?: readonly ProvenanceEntry[];
}

/** A timeline of a skeleton: its ID, what it states, its regions and its children. */
export interface SkeletonTimeline extends SkeletonRegion {
  readonly regions: readonly SkeletonRegion[];
  readonly children: readonly SkeletonTimeline[];
}

/**
 * The statements of a manifest alone, every element at the index it has in
 * the manifest, so that a path of the skeleton is a path of the manifest.
 */
export interface Skeleton {
  readonly "@context": JsonObject;
  readonly id?: string;
  readonly statements?: Statements;
  readonly provenance?: readonly ProvenanceEntry[];
  readonly timelines: readonly SkeletonTimeline[];
}

/** What an element states, its members present only where it carries them. */
function described<T extends { readonly id: string }>(
  element: T & {
    readonly statements?: Statements;
    readonly provenance?: readonly ProvenanceEntry[];
  },
): SkeletonRegion {
  const { id, statements, provenance } = element;
  return {
    id,
    ...(statements === undefined ? {} : { statements }),
    ...(provenance === undefined ? {} : { provenance }),
  };
}

function skeletonTimeline(timeline: TimelineManifest): SkeletonTimeline {
  return {
    ...described(timeline),
    regions: timeline.regions.map((region) => described(region)),
    children: timeline.children.map(skeletonTimeline),
  };
}

const skeletons = new WeakMap<Manifest, Skeleton>();

/**
 * The statements of `manifest` alone, at the paths they have in it, with
 * the full context a file writes (`fullContext`: the format's terms and
 * every prefix the statements use). The schema package's statement functions run on it,
 * never on a manifest core holds: they return deep copies, and a copy made
 * structurally would lose what core reads losslessly. Memoised by identity.
 */
export function skeletonOf(manifest: Manifest): Skeleton {
  const known = skeletons.get(manifest);
  if (known !== undefined) return known;
  const { id, statements, provenance } = manifest;
  const skeleton: Skeleton = {
    "@context": isJsonObject(manifest) ? fullContext(manifest) : {},
    ...(id === undefined ? {} : { id }),
    ...(statements === undefined ? {} : { statements }),
    ...(provenance === undefined ? {} : { provenance }),
    timelines: manifest.timelines.map(skeletonTimeline),
  };
  skeletons.set(manifest, skeleton);
  return skeleton;
}

/** The members of an element that carry statements, or that lead to elements that do. */
const DESCRIBED_MEMBERS = ["@context", "id", "statements", "provenance"];
const ELEMENT_LISTS = ["timelines", "children", "regions"];

/** Any manifest value cut to what a context is made from: the context, the statements and the elements holding them. */
function describedOnly(value: JsonObject): JsonObject {
  const result: { [key: string]: Json } = {};
  for (const key of DESCRIBED_MEMBERS) {
    const member = value[key];
    if (member !== undefined) result[key] = member;
  }
  for (const key of ELEMENT_LISTS) {
    const list = value[key];
    if (Array.isArray(list)) {
      result[key] = list.map((item: Json) => (isJsonObject(item) ? describedOnly(item) : item));
    }
  }
  return result;
}

/**
 * The full context of `manifest` as a file writes it: the format's terms
 * and every prefix its statements and provenance use, a prefix the manifest
 * declares itself with its own namespace, else the shipped catalogue's, as
 * the schema package's `withContext` makes it. A prefix declared in neither
 * is left out rather than refused, so that the schema check refuses the IRI
 * using it with its own message.
 */
function fullContext(manifest: JsonObject): JsonObject {
  const own = manifest["@context"];
  const catalogued = defaultCatalogue().prefixes;
  const context: { [key: string]: Json } = { ...FORMAT_CONTEXT };
  for (const prefix of usedPrefixes(describedOnly(manifest))) {
    const declared =
      isJsonObject(own) && !Object.hasOwn(FORMAT_CONTEXT, prefix) ? own[prefix] : undefined;
    const namespace = typeof declared === "string" ? declared : catalogued[prefix];
    if (namespace !== undefined) context[prefix] = namespace;
  }
  return context;
}

/**
 * `manifest` with the full context a file writes (`fullContext`) as its
 * `@context`, in the place the member has, else last: the form in which a
 * manifest leaves core for a file or the schema check. `manifest` itself
 * where that context is its own already, and where its `@context` is no
 * object, which the schema check then refuses.
 */
export function withFullContext<T extends object>(manifest: T): T {
  if (!isJsonObject(manifest)) return manifest;
  const own = manifest["@context"];
  if (own !== undefined && !isJsonObject(own)) return manifest;
  const context = fullContext(manifest);
  return jsonEqual(own, context) ? manifest : { ...manifest, "@context": context };
}

/** Whether a member of a `@context` is a prefix of the manifest's own: no format term, no catalogued prefix with its namespace. */
function isOwnPrefix(prefix: string, namespace: Json): boolean {
  if (Object.hasOwn(FORMAT_CONTEXT, prefix) || prefix.startsWith("@")) return false;
  const catalogued = defaultCatalogue().prefixes;
  return !(Object.hasOwn(catalogued, prefix) && catalogued[prefix] === namespace);
}

/**
 * `manifest` with the `@context` core holds: of its own `@context`, only the
 * prefixes it declares itself (no format term, no catalogue prefix with the
 * same namespace) that its statements and provenance use, in their order;
 * no `@context` where none is left. `manifest` itself where that is its
 * `@context` already, and where its `@context` is no object, which the
 * schema check then refuses.
 */
export function withStatementContext<T extends object>(manifest: T): T {
  if (!isJsonObject(manifest) || !Object.hasOwn(manifest, "@context")) return manifest;
  const context = manifest["@context"];
  if (!isJsonObject(context)) return manifest;
  const used = new Set(usedPrefixes(describedOnly(manifest)));
  const own: { [key: string]: Json } = {};
  for (const [prefix, namespace] of Object.entries(context)) {
    if (used.has(prefix) && isOwnPrefix(prefix, namespace)) own[prefix] = namespace;
  }
  if (Object.keys(own).length > 0) {
    return jsonEqual(context, own) ? manifest : { ...manifest, "@context": own };
  }
  const { "@context": _, ...rest } = manifest;
  return rest as T;
}

// ---------------------------------------------------------------- references to removed elements

/** Whether a reference names an element whose ID is removed: `#X`, X removed. */
type Removed = (reference: unknown) => boolean;

/** Whether `value` is a node naming a removed element by its `id`. */
function namesRemoved(value: unknown, removed: Removed): boolean {
  return isJsonObject(value) && removed(value.id);
}

/**
 * A list of values without those naming a removed element, each kept value
 * pruned (`prunedValue`); `undefined` where none is left, the list itself
 * where nothing changed.
 */
function prunedValues(values: readonly Json[], removed: Removed): readonly Json[] | undefined {
  let changed = false;
  const kept: Json[] = [];
  for (const value of values) {
    const pruned = namesRemoved(value, removed) ? undefined : prunedValue(value, removed);
    if (pruned !== value) changed = true;
    if (pruned !== undefined) kept.push(pruned);
  }
  if (!changed) return values;
  return kept.length === 0 ? undefined : kept;
}

/**
 * A value with the references to removed elements taken out of it: an
 * ordered list (`{list}`) loses the items naming one, and goes when none is
 * left; a node is pruned as a subject (`prunedSubject`), and goes when
 * nothing is left of it; any other value is kept.
 */
function prunedValue(value: Json, removed: Removed): Json | undefined {
  if (!isJsonObject(value) || Object.hasOwn(value, "@value")) return value;
  const { list } = value;
  if (Array.isArray(list)) {
    const kept = prunedValues(list, removed);
    if (kept === list) return value;
    return kept === undefined ? undefined : { ...value, list: kept };
  }
  const pruned = prunedSubject(value, removed, true);
  return Object.keys(pruned).length === 0 ? undefined : pruned;
}

/**
 * A provenance entry with the references to removed elements taken out:
 * `undefined` where its value names one, else its `basis` and `stated_by`
 * without them and its `service` dropped where it names one, an emptied
 * list losing its key, its value pruned where it is a node without `id`.
 */
function prunedEntry(entry: JsonObject, removed: Removed): JsonObject | undefined {
  const { value } = entry;
  if (value === undefined || namesRemoved(value, removed)) return undefined;
  const pruned = prunedValue(value, removed);
  if (pruned === undefined) return undefined;
  let result: { [key: string]: Json } | undefined = pruned === value ? undefined : { ...entry };
  if (result !== undefined) result.value = pruned;
  for (const key of ["basis", "stated_by"]) {
    const list = entry[key];
    if (!Array.isArray(list) || !list.some((item: Json) => removed(item))) continue;
    result ??= { ...entry };
    const kept = list.filter((item: Json) => !removed(item));
    if (kept.length === 0) delete result[key];
    else result[key] = kept;
  }
  if (removed(entry.service)) {
    result ??= { ...entry };
    delete result.service;
  }
  return result ?? entry;
}

/** A provenance list pruned entry by entry; `undefined` where none is left, the list itself where nothing changed. */
function prunedProvenance(entries: readonly Json[], removed: Removed): readonly Json[] | undefined {
  let changed = false;
  const kept: Json[] = [];
  for (const entry of entries) {
    const pruned = isJsonObject(entry) ? prunedEntry(entry, removed) : entry;
    if (pruned !== entry) changed = true;
    if (pruned !== undefined) kept.push(pruned);
  }
  if (!changed) return entries;
  return kept.length === 0 ? undefined : kept;
}

/** The keys of a node that are no pair. */
const NODE_MEMBERS = new Set(["id", "type", "label", "provenance"]);

/**
 * The pairs of a container (an element's `statements`, `node` false) or of
 * a value node (`node` true: its pairs are its IRI keys) pruned, each
 * emptied list losing its key, and a node's own `provenance` pruned; the
 * object itself where nothing changed.
 */
function prunedSubject(owner: JsonObject, removed: Removed, node: boolean): JsonObject {
  let result: { [key: string]: Json } | undefined;
  for (const [key, values] of Object.entries(owner)) {
    if (key === "type" || (node && NODE_MEMBERS.has(key)) || !Array.isArray(values)) continue;
    const kept = prunedValues(values, removed);
    if (kept === values) continue;
    result ??= { ...owner };
    if (kept === undefined) delete result[key];
    else result[key] = kept;
  }
  const { provenance } = owner;
  if (node && Array.isArray(provenance)) {
    const kept = prunedProvenance(provenance, removed);
    if (kept !== provenance) {
      result ??= { ...owner };
      if (kept === undefined) delete result.provenance;
      else result.provenance = kept;
    }
  }
  return result ?? owner;
}

/** The members of an element that state something. */
interface Described {
  readonly statements?: Statements;
  readonly provenance?: readonly ProvenanceEntry[];
}

/**
 * The `statements` and `provenance` of an element pruned, a container or
 * list left empty absent; `null` where nothing changed. The pruned values
 * are those of the element, with members taken out: the schema check of the
 * settled manifest reads them again.
 */
function prunedMembers(element: Described, removed: Removed): Described | null {
  const { statements, provenance } = element;
  const container = isJsonObject(statements)
    ? prunedSubject(statements, removed, false)
    : undefined;
  const entries = Array.isArray(provenance) ? prunedProvenance(provenance, removed) : undefined;
  if (container === statements && entries === provenance) return null;
  const kept = container !== undefined && Object.keys(container).length > 0;
  return {
    ...(kept ? { statements: container as Statements } : {}),
    ...(entries === undefined ? {} : { provenance: entries as readonly ProvenanceEntry[] }),
  };
}

/**
 * `manifest` without the references to the elements whose bare IDs
 * `removed` holds, in the statements and provenance of every element: a
 * value that is a node naming one (`{id: "#X"}`) is dropped, as is a
 * provenance entry whose value names one; `#X` is dropped from every
 * `basis` and `stated_by`, a `service` `#X` is dropped; a list, an ordered
 * list, a node, a container or a `provenance` left empty loses its key. A
 * reference into another manifest (`other.yaml#X`) is kept. `manifest`
 * itself where nothing names a removed element.
 */
export function withoutReferencesTo(manifest: Manifest, removed: ReadonlySet<string>): Manifest {
  if (removed.size === 0) return manifest;
  const references = new Set([...removed].map(toFileId));
  const isRemoved: Removed = (reference) =>
    typeof reference === "string" && references.has(reference);
  const pruneRegion = (region: Region): Region => {
    const pruned = prunedMembers(region, isRemoved);
    if (pruned === null) return region;
    const { statements: _, provenance: __, ...rest } = region;
    return { ...rest, ...pruned };
  };
  const pruneTimeline = (timeline: TimelineManifest): TimelineManifest => {
    const regions = timeline.regions.map(pruneRegion);
    const children = timeline.children.map((child) => {
      const pruned = pruneTimeline(child);
      return pruned === child ? child : { ...pruned, offset: child.offset };
    });
    const pruned = prunedMembers(timeline, isRemoved);
    const same =
      pruned === null &&
      regions.every((region, index) => region === timeline.regions[index]) &&
      children.every((child, index) => child === timeline.children[index]);
    if (same) return timeline;
    if (pruned === null) return { ...timeline, regions, children };
    const { statements: _, provenance: __, ...rest } = timeline;
    return { ...rest, ...pruned, regions, children };
  };
  const timelines = manifest.timelines.map(pruneTimeline);
  const pruned = prunedMembers(manifest, isRemoved);
  if (pruned === null) {
    const same = timelines.every((root, index) => root === manifest.timelines[index]);
    return same ? manifest : { ...manifest, timelines };
  }
  const { statements: _, provenance: __, ...rest } = manifest;
  return { ...rest, ...pruned, timelines };
}
