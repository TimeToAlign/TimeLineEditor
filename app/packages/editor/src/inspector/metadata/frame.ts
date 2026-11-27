/**
 * The Metadata tab's view model: which element's statements it shows
 * (`shownOf`), the sentence saying what it is (`typeSentence`), its
 * rectangles as the panel reads them (`rectanglesOf`: one verb about one
 * thing, in as many vocabularies as state it, each pair with its paradata
 * and beliefs) and its candidates (`candidatesOf`: the pairs held only in
 * provenance, those the user believes `false` apart). Everything is read
 * from the manifest's statement skeleton through TimeToShare's statement
 * functions and its catalogue; nothing here changes a manifest.
 */

import type { Editing, Subject } from "@timetoalign/tilie-arranger";
import { editedSelection } from "@timetoalign/tilie-arranger";
import type {
  Address,
  Block,
  PathSegment,
  ResolvedAddress,
  Skeleton,
  User,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  addressWords,
  assertNever,
  canonicalText,
  isCommandError,
  resolveAddress,
  skeletonOf,
  statedBy,
  statementHolders,
} from "@timetoalign/tilie-core";
import type { Catalogue, Pair } from "@timetoalign/timetoshare";
import {
  candidates,
  entries,
  expandIri,
  isJsonObject,
  pairs,
  recognize,
  rectangles,
  samePair,
  subjectPath,
  verbOf,
} from "@timetoalign/timetoshare";
import type { IriNames, ShownIri } from "../../iris.ts";
import { iriNames, shownIri } from "../../iris.ts";
import type { EntryLine } from "../provenance.ts";
import { lineOf } from "../provenance.ts";
import type { JsonObject } from "./catalogue.ts";
import { FALLBACK, systemChoices, typesOf, verbLabel } from "./catalogue.ts";

/** A property and one of its values, as the statements container holds them. */
export type { Pair };

/** The element whose statements the tab shows. */
export interface Frame {
  readonly kind: "bundle" | "timeline" | "region";
  readonly block: Block;
  /** The address a `set` of the element's statements is aimed at: `{block}` for the bundle, else `{block, id}`. */
  readonly target: Address;
  /** The bare ID of the timeline or region; `null` for the bundle. */
  readonly id: string | null;
  /** The element as the tab names it, core's words. */
  readonly words: string;
  /** The element's name, else its ID; the manifest's name, else its ID, for the bundle. */
  readonly name: string;
  /** The statements of the block's manifest alone, at the paths they have in it. */
  readonly skeleton: Skeleton;
  /** The element's path in the skeleton (and in the manifest). */
  readonly path: readonly PathSegment[];
  /** The target's key: what state kept for the element shown belongs to. */
  readonly key: string;
}

/** What the tab shows: an element's statements, or a hint saying how to reach one. */
export type Shown = Frame | { readonly kind: "none"; readonly hint: string };

/** The hint without an element: nothing selected among several blocks, or several things selected. */
export const SELECT_HINT = "Select a block, a timeline or a region to see its statements.";

/** The hint for an element that has no statements: a group, a conversion map, a timestamp, … */
export function describesNothing(words: string): string {
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} has no statements: a bundle, a timeline or a region has. Select its block, a timeline or a region.`;
}

/** The element whose statements a resolved address shows: itself, or the one its card, band or part belongs to. */
function holderOf(
  resolved: ResolvedAddress,
): { readonly kind: Frame["kind"]; readonly id: string | null } | null {
  switch (resolved.kind) {
    case "block":
    case "title":
      return { kind: "bundle", id: null };
    case "timeline":
    case "card":
    case "band":
      return { kind: "timeline", id: resolved.at.timeline.id };
    case "entry":
      return resolved.entry === "region" ? { kind: "region", id: resolved.element.id } : null;
    case "part":
      return holderOf(resolved.owner);
    case "workspace":
    case "frame":
    case "measure_map":
    case "timestamp":
    case "matchstamp":
    case "anchor":
    case "elision":
    case "flow_map":
    case "virtual_timeline":
    case "virtual_card":
    case "virtual_band":
    case "chunk":
    case "chunk_band":
      return null;
    default:
      return assertNever(resolved);
  }
}

/** The name of the element `id` of the block's manifest (`null`: the manifest's), else its ID. */
function nameOf(block: Block, id: string | null): string {
  for (const holder of statementHolders(block.manifest)) {
    if (holder.id === id) return holder.name ?? holder.id ?? block.manifest.id ?? "The bundle";
  }
  return id ?? "The bundle";
}

/** The frame of the element `address` shows, resolved in `view`. */
function shownAt(view: View, address: Address): Shown {
  const resolved = resolveAddress(view, address);
  if (isCommandError(resolved) || resolved.kind === "workspace") {
    return { kind: "none", hint: SELECT_HINT };
  }
  const holder = holderOf(resolved);
  if (holder === null) return { kind: "none", hint: describesNothing(addressWords(view, address)) };
  const block = resolved.block;
  const target: Address =
    holder.id === null ? { block: block.id } : { block: block.id, id: holder.id };
  const skeleton = skeletonOf(block.manifest);
  return {
    ...holder,
    block,
    target,
    words: addressWords(view, target),
    name: nameOf(block, holder.id),
    skeleton,
    path: subjectPath(skeleton, holder.id),
    key: addressKey(target),
  };
}

/**
 * The element whose statements the tab shows: the one selected subject's (a
 * block's bundle; a timeline, its card, a band or a part of it; a region or
 * its label); with nothing selected, in an editor, the edited element's;
 * at the top level, the bundle of the one block when the workspace holds
 * exactly one. Several subjects, or nothing among several blocks, show
 * `SELECT_HINT`; an element without statements says so.
 */
export function shownOf(view: View, subjects: readonly Subject[], editing: Editing | null): Shown {
  const [subject, ...others] = subjects;
  if (subject !== undefined) {
    return others.length > 0 ? { kind: "none", hint: SELECT_HINT } : shownAt(view, subject.address);
  }
  if (editing !== null) {
    const [edited] = editedSelection(view, editing).values();
    return edited === undefined ? { kind: "none", hint: SELECT_HINT } : shownAt(view, edited);
  }
  const [only, ...more] = Object.values(view.blocks);
  return only === undefined || more.length > 0
    ? { kind: "none", hint: SELECT_HINT }
    : shownAt(view, { block: only.id });
}

/** A thing a rectangle names: its expanded IRI and the system that recognises it. */
export interface Thing {
  readonly system: string | null;
  readonly iri: string;
}

/**
 * One pair of a rectangle as the file writes it, its IRIs shown as slugs
 * (`shownIri`): property, value, and where the value leads.
 */
export interface VocabularyRow {
  readonly property: ShownIri;
  readonly value: ShownIri;
  /** The value's expanded IRI where it is an `http:` or `https:` one; else `null`. */
  readonly href: string | null;
}

/** One verb about one thing, as a rectangle shows it. */
export interface RectangleView {
  /** `is_a` for the empty "is a" rectangle, else the canonical text of its first pair. */
  readonly key: string;
  readonly verb: string | null;
  readonly inverse: boolean;
  /** The verb's words (its inverse label for an inverse reading); the property as written for none. */
  readonly heading: string;
  /** The label of the thing, else a literal's text; `null` for none. */
  readonly label: string | null;
  readonly things: readonly Thing[];
  /** One row per pair, in pair order. */
  readonly rows: readonly VocabularyRow[];
  /** Per pair, its provenance entry; `null` where it has none (the manifest states it). */
  readonly entries: readonly (EntryLine | null)[];
  /** The systems "＋ Add vocabulary" offers: those of the verb not yet used here. */
  readonly addable: readonly string[];
  readonly pairs: readonly Pair[];
}

/**
 * A rectangle in words: its verb, then its label, else its first value as
 * shown ("performed by Maria João Pires", "same as youtube:…"); the verb
 * alone for the empty "is a".
 */
export function rectangleWords(rectangle: RectangleView): string {
  const thing = rectangle.label ?? rectangle.rows[0]?.value.text;
  return thing === undefined ? rectangle.heading : `${rectangle.heading} ${thing}`;
}

/** A candidate of the shown element or of a value node it states: a pair held only in provenance. */
export interface CandidateRow {
  /** The canonical text of subject, property and value. */
  readonly key: string;
  /** The path of the element or value node the pair is about. */
  readonly subject: readonly PathSegment[];
  readonly heading: string;
  /** The value in words: its label, an element's name, a literal's text, else its IRI as shown. */
  readonly label: ShownIri;
  /** The pair as the statement functions take it (`rdf:type` read back as `type`). */
  readonly pair: Pair;
  readonly line: EntryLine;
}

/** The candidates of the shown element: those offered to the user, and those the user believes `false`. */
export interface Candidates {
  readonly offered: readonly CandidateRow[];
  readonly dismissed: readonly CandidateRow[];
}

/** Whether `value` is a value object, a literal with `@value`. */
function isValueObject(value: unknown): value is JsonObject {
  return isJsonObject(value) && Object.hasOwn(value, "@value");
}

/** Whether `value` is a node: an object that is no value object and no ordered list. */
export function isNode(value: unknown): value is JsonObject {
  return isJsonObject(value) && !isValueObject(value) && !Object.hasOwn(value, "list");
}

/** A literal's text: a string, number or boolean as written, a value object's `@value`. */
function literalText(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (isValueObject(value)) return literalText(value["@value"]);
  return null;
}

/** The expanded IRI of a reference: an absolute or compact IRI expanded under `context`, else `null`. */
function expanded(context: unknown, reference: string): string | null {
  return expandIri(context, reference);
}

function isWebIri(iri: string | null): iri is string {
  return iri !== null && /^https?:\/\//u.test(iri);
}

/** Words that are no IRI, shown as they are. */
const words = (text: string): ShownIri => ({ text, iri: null });

/** A pair's row: property and value as written, IRIs as shown (`shownIri`), the value's web address. */
function rowOf(names: IriNames, [property, value]: Pair): VocabularyRow {
  const shownProperty = shownIri(names, property);
  if (property === "type" && typeof value === "string") {
    const iri = expanded(names.context, value);
    return {
      property: shownProperty,
      value: shownIri(names, value),
      href: isWebIri(iri) ? iri : null,
    };
  }
  if (isNode(value)) {
    if (typeof value.id === "string") {
      const iri = expanded(names.context, value.id);
      return {
        property: shownProperty,
        value: shownIri(names, value.id),
        href: isWebIri(iri) ? iri : null,
      };
    }
    return {
      property: shownProperty,
      value: words(typeof value.label === "string" ? value.label : canonicalText(value)),
      href: null,
    };
  }
  return {
    property: shownProperty,
    value: words(literalText(value) ?? canonicalText(value)),
    href: null,
  };
}

/** The context the skeleton declares. */
function contextOf(skeleton: Skeleton): JsonObject {
  return skeleton["@context"] as JsonObject;
}

/** The pair an annotation is about: `rdf:type` read back as `type`. */
export function entryPair(context: unknown, entry: JsonObject): Pair {
  const property = String(entry.property);
  const value = entry.value;
  const isType =
    property === "rdf:type" || expanded(context, property) === expanded(context, "type");
  if (isType && isNode(value) && typeof value.id === "string") return ["type", value.id];
  return [property, value];
}

/** Whether a system's things include the thing `iri` names. */
function recognisedAs(catalogue: Catalogue, iri: string): string | null {
  return recognize(catalogue, iri)?.system ?? null;
}

/** The IRI a pattern key stands for under the catalogue's prefixes, aliases applied. */
function aliased(catalogue: Catalogue, iri: string): string {
  for (const [from, to] of Object.entries(catalogue.aliases)) {
    if (iri.startsWith(from)) return to + iri.slice(from.length);
  }
  return iri;
}

/** The property keys the patterns of `system` state `verb` with, expanded. */
function patternProperties(
  catalogue: Catalogue,
  verb: string,
  inverse: boolean,
  system: string,
): Set<string> {
  const found = new Set<string>();
  const alternatives = catalogue.verbs.find((candidate) => candidate.id === verb)?.patterns[system];
  for (const alternative of alternatives ?? []) {
    if ((alternative.inverse === true) !== inverse) continue;
    for (const key of Object.keys(alternative.pattern)) {
      found.add(
        key === "type" ? "type" : aliased(catalogue, expandIri(catalogue.prefixes, key) ?? key),
      );
    }
  }
  return found;
}

/**
 * The systems "＋ Add vocabulary" offers a rectangle: the verb's vocabularies
 * (`systemChoices`, an element of the manifest left out) not yet used. A
 * system is used when a pair's property is one its patterns state the verb
 * with (the fallback's where it has none of its own), and either it holds
 * no things or the pair's thing is one of its.
 */
function addableOf(
  catalogue: Catalogue,
  context: unknown,
  verb: string | null,
  inverse: boolean,
  pairs: readonly Pair[],
): readonly string[] {
  if (verb === null) return [];
  const choices = systemChoices(catalogue, { id: verb, inverse, label: "" }).filter(
    (choice) => choice.id !== "element",
  );
  const used = (system: string): boolean => {
    const holder = catalogue.systems.find((candidate) => candidate.id === system);
    let properties = patternProperties(catalogue, verb, inverse, system);
    if (properties.size === 0) properties = patternProperties(catalogue, verb, inverse, FALLBACK);
    return pairs.some(([property, value]) => {
      const key =
        property === "type" ? "type" : aliased(catalogue, expanded(context, property) ?? property);
      if (!properties.has(key)) return false;
      if (holder === undefined || holder.things.length === 0) return true;
      const id = property === "type" ? value : isNode(value) ? value.id : undefined;
      if (typeof id !== "string") return false;
      const iri = expanded(context, id);
      return iri !== null && recognisedAs(catalogue, iri) === system;
    });
  };
  return choices.map((choice) => choice.id).filter((system) => !used(system));
}

/**
 * The rectangles of the frame's element: TimeToShare's `rectangles`, "is a"
 * always first (empty, keyed `is_a`, where nothing states it).
 */
export function rectanglesOf(
  frame: Frame,
  catalogue: Catalogue,
  user: User,
): readonly RectangleView[] {
  const { skeleton, path } = frame;
  const context = contextOf(skeleton);
  const names = iriNames(catalogue, context);
  const annotated = entries(skeleton, path);
  return rectangles(catalogue, skeleton, path).map((rectangle) => {
    const pairs = rectangle.pairs;
    const [first] = pairs;
    const verb = rectangle.verb;
    const label =
      rectangle.label ??
      (first === undefined || first[0] === "type" ? null : literalText(first[1]));
    return {
      key: first === undefined ? "is_a" : canonicalText(first),
      verb,
      inverse: rectangle.inverse,
      heading: verb === null ? (first?.[0] ?? "") : verbLabel(catalogue, verb, rectangle.inverse),
      label,
      things: rectangle.things.map((iri) => ({ system: recognisedAs(catalogue, iri), iri })),
      rows: pairs.map((pair) => rowOf(names, pair)),
      entries: pairs.map((pair) => {
        const entry = annotated.find((candidate) =>
          samePair(context, entryPair(context, candidate), pair),
        );
        return entry === undefined ? null : lineOf(entry, user, names);
      }),
      addable: addableOf(catalogue, context, verb, rectangle.inverse, pairs),
      pairs,
    };
  });
}

/** The value at `path` in `value`. */
function at(value: unknown, path: readonly PathSegment[]): unknown {
  let found: unknown = value;
  for (const step of path) {
    if (Array.isArray(found) && typeof step === "number") found = found[step];
    else if (isJsonObject(found) && typeof step === "string") found = found[step];
    else return undefined;
  }
  return found;
}

/** The paths of the element at `path` and of every value node in its statements, nested ones included. */
function subjectsUnder(skeleton: Skeleton, path: readonly PathSegment[]): PathSegment[][] {
  const found: PathSegment[][] = [[...path]];
  const visit = (value: unknown, where: PathSegment[]): void => {
    if (isNode(value)) {
      found.push(where);
      for (const [key, items] of Object.entries(value)) {
        if (key === "id" || key === "type" || key === "label" || key === "provenance") continue;
        if (!Array.isArray(items)) continue;
        for (const [index, item] of items.entries()) visit(item, [...where, key, index]);
      }
    } else if (isJsonObject(value) && Array.isArray(value.list)) {
      for (const [index, item] of value.list.entries()) visit(item, [...where, "list", index]);
    }
  };
  const container = at(skeleton, [...path, "statements"]);
  if (isJsonObject(container)) {
    for (const [key, items] of Object.entries(container)) {
      if (key === "type" || !Array.isArray(items)) continue;
      for (const [index, item] of items.entries()) visit(item, [...path, "statements", key, index]);
    }
  }
  return found;
}

/** Every label the skeleton gives a thing, by expanded IRI; the first one found wins. */
function labelsOf(skeleton: Skeleton): Map<string, string> {
  const context = contextOf(skeleton);
  const labels = new Map<string, string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isJsonObject(value)) return;
    if (isNode(value) && typeof value.id === "string" && typeof value.label === "string") {
      const iri = expanded(context, value.id) ?? value.id;
      if (!labels.has(iri)) labels.set(iri, value.label);
    }
    for (const [key, member] of Object.entries(value)) {
      if (key !== "@context") visit(member);
    }
  };
  visit(skeleton);
  return labels;
}

/**
 * The words of an annotated pair's value: its label, an element's name, a
 * literal's text, or its ID as shown (`shownIri`).
 */
function valueWords(
  iris: IriNames,
  value: unknown,
  labels: ReadonlyMap<string, string>,
  names: ReadonlyMap<string, string>,
): ShownIri {
  const named = (id: string): ShownIri => {
    const label = labels.get(expanded(iris.context, id) ?? id);
    return label === undefined ? shownIri(iris, id) : words(label);
  };
  if (isNode(value)) {
    if (typeof value.label === "string") return words(value.label);
    if (typeof value.id === "string") {
      if (value.id.startsWith("#")) return words(names.get(value.id.slice(1)) ?? value.id);
      return named(value.id);
    }
    return words(canonicalText(value));
  }
  if (typeof value === "string") return named(value);
  return words(literalText(value) ?? canonicalText(value));
}

/** The rows of `found`, entries of the subject at `subject`. */
function rowsOf(
  frame: Frame,
  catalogue: Catalogue,
  user: User,
  subject: readonly PathSegment[],
  found: readonly JsonObject[],
  labels: ReadonlyMap<string, string>,
  names: ReadonlyMap<string, string>,
): CandidateRow[] {
  const context = contextOf(frame.skeleton);
  const iris = iriNames(catalogue, context);
  return found.map((entry) => {
    const pair = entryPair(context, entry);
    const [property, value] = pair;
    const verb = verbOf(catalogue, context, property, value);
    return {
      key: canonicalText([subject, entry.property, entry.value]),
      subject,
      heading: verb === null ? property : verbLabel(catalogue, verb[0], verb[1]),
      label: valueWords(iris, value, labels, names),
      pair,
      line: lineOf(entry, user, iris),
    };
  });
}

/**
 * The candidates of the frame's element and of the value nodes it states
 * (TimeToShare's `candidates`): those offered to the user, and apart those
 * the user believes `false`, which are not offered again.
 */
export function candidatesOf(frame: Frame, catalogue: Catalogue, user: User): Candidates {
  const labels = labelsOf(frame.skeleton);
  const names = new Map<string, string>();
  for (const holder of statementHolders(frame.block.manifest)) {
    if (holder.id !== null) names.set(holder.id, holder.name ?? holder.id);
  }
  const actor = statedBy(user);
  const offered: CandidateRow[] = [];
  const dismissed: CandidateRow[] = [];
  for (const subject of subjectsUnder(frame.skeleton, frame.path)) {
    const all = rowsOf(
      frame,
      catalogue,
      user,
      subject,
      candidates(frame.skeleton, subject),
      labels,
      names,
    );
    const kept = new Set(
      rowsOf(
        frame,
        catalogue,
        user,
        subject,
        candidates(frame.skeleton, subject, actor),
        labels,
        names,
      ).map((row) => row.key),
    );
    for (const row of all) (kept.has(row.key) ? offered : dismissed).push(row);
  }
  return { offered, dismissed };
}

/**
 * The catalogue types an "is a" states, as few as name every pair they
 * can: the types `typesOf` finds, most vocabularies agreeing first, each
 * kept only where one of its alternatives names a pair no type kept before
 * it does.
 */
export function typeLabels(
  catalogue: Catalogue,
  context: JsonObject,
  isA: readonly Pair[],
): readonly string[] {
  const named = new Set<number>();
  const labels: string[] = [];
  for (const id of typesOf(catalogue, context, isA)) {
    const type = catalogue.types.find((candidate) => candidate.id === id);
    if (type === undefined) continue;
    const covered = new Set<number>();
    for (const alternative of Object.values(type.is_a).flat()) {
      const wanted = Object.entries(alternative.pattern).flatMap(([key, values]) =>
        (Array.isArray(values) ? values : []).map((item): Pair => [key, item]),
      );
      const at = wanted.map((pair) => isA.findIndex((held) => samePair(context, held, pair)));
      if (at.every((index) => index >= 0)) for (const index of at) covered.add(index);
    }
    if ([...covered].some((index) => !named.has(index))) {
      labels.push(type.label);
      for (const index of covered) named.add(index);
    }
  }
  const iris = iriNames(catalogue, context);
  const rest = isA
    .filter((_, index) => !named.has(index))
    .map((pair) => rowOf(iris, pair).value.text);
  return [...labels, ...rest];
}

/** A type label with its indefinite article: "an" before a vowel, else "a". */
function withArticle(label: string): string {
  return `${/^[aeiou]/iu.test(label) ? "an" : "a"} ${label}`;
}

/**
 * The first rectangle's sentence: "<name> is a <type>", the types the "is
 * a" rectangle states in words (`typeLabels`), joined "a, b and c"; where
 * nothing states what the element is, "Nothing states yet what <name> is."
 */
export function typeSentence(frame: Frame, catalogue: Catalogue, isA: RectangleView): string {
  const labels = typeLabels(catalogue, contextOf(frame.skeleton), isA.pairs).map(withArticle);
  if (labels.length === 0) return `Nothing states yet what ${frame.name} is.`;
  const last = labels.at(-1) as string;
  const words = labels.length === 1 ? last : `${labels.slice(0, -1).join(", ")} and ${last}`;
  return `${frame.name} is ${words}.`;
}

/** Whether the frame's element states `pair`. */
export function states(frame: Frame, pair: Pair): boolean {
  const context = contextOf(frame.skeleton);
  return pairs(frame.skeleton, frame.path).some((stated) => samePair(context, stated, pair));
}

/** The prefixes a frame's IRIs are written with: the catalogue's and those its manifest declares. */
export function framePrefixes(
  frame: Frame,
  catalogue: Catalogue,
): Readonly<Record<string, string>> {
  return frameNames(frame, catalogue).prefixes;
}

/** The names a frame's IRIs are shown with (`shownIri`): the catalogue and its manifest's context. */
export function frameNames(frame: Frame, catalogue: Catalogue): IriNames {
  return iriNames(catalogue, contextOf(frame.skeleton));
}
