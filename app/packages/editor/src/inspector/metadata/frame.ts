/**
 * The Metadata tab's view model: which element's statements it shows
 * (`shownOf`), its rectangles as the panel reads them (`rectanglesOf`: one
 * verb about one thing, in as many vocabularies as state it) and its
 * drawers (`drawersOf`: what is stated of the elements around it, what is
 * proposed and what was rejected). Everything is read from the manifest's
 * statement skeleton through TimeToShare's statement functions and its
 * catalogue; nothing here changes a manifest.
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
  canonicalText,
  isCommandError,
  resolveAddress,
  skeletonOf,
  statedBy,
  statementHolders,
  TILIE_AGENT,
  USER_TAG,
} from "@timetoalign/tilie-core";
import type { Catalogue, Pair, ProvenanceEntry } from "@timetoalign/timetoshare";
import {
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
import type { JsonObject } from "./catalogue.ts";
import { FALLBACK, prefixesOf, systemChoices, verbLabel } from "./catalogue.ts";

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
    default:
      return null;
  }
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

/** One pair of a rectangle as the file writes it: property, value, and where the value leads. */
export interface VocabularyRow {
  readonly property: string;
  readonly value: string;
  /** The value's expanded IRI where it is an `http:` or `https:` one; else `null`. */
  readonly href: string | null;
}

/** An annotation of a pair as the panel prints it. */
export interface EntryLine {
  readonly method: string | null;
  readonly who: string | null;
  readonly date: string | null;
  readonly service: string | null;
  readonly basis: readonly string[];
  readonly match: string | null;
  readonly note: string | null;
  readonly status: string;
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
  /** Per pair, its confirmed annotation. */
  readonly entries: readonly (EntryLine | null)[];
  /** The systems "＋ vocabulary" offers: those of the verb not yet used here. */
  readonly addable: readonly string[];
  readonly pairs: readonly Pair[];
}

/**
 * A rectangle in words: its verb, then its label, else its first value as
 * written ("performed by Maria João Pires", "same as https://…"); the verb
 * alone for the empty "is a".
 */
export function rectangleWords(rectangle: RectangleView): string {
  const thing = rectangle.label ?? rectangle.rows[0]?.value;
  return thing === undefined ? rectangle.heading : `${rectangle.heading} ${thing}`;
}

/** One proposed or rejected pair in a drawer. */
export interface DrawerRow {
  /** The canonical text of subject, property and value. */
  readonly key: string;
  /** The path of the element or value node the pair is about. */
  readonly subject: readonly PathSegment[];
  readonly heading: string;
  readonly label: string;
  readonly entry: ProvenanceEntry;
  readonly line: EntryLine;
}

/** The rectangles stated of one element around the shown one. */
export interface HigherGroup {
  /** The element's address key: two elements may share their words. */
  readonly key: string;
  readonly words: string;
  readonly rectangles: readonly RectangleView[];
}

/** What the three drawers hold. */
export interface Drawers {
  readonly higher: readonly HigherGroup[];
  readonly proposed: readonly DrawerRow[];
  readonly rejected: readonly DrawerRow[];
}

/**
 * Who stated something, in words: the viewer's own statements by their
 * name; an ORCID iD by itself; a name TiLiE wrote as a tag decoded; TiLiE's
 * own proposals "TiLiE"; any other IRI as written.
 */
export function whoOf(iri: string, user: User): string {
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
  return iri;
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** The line an annotation prints. */
export function lineOf(entry: JsonObject, user: User): EntryLine {
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const by = list(entry.stated_by);
  return {
    method: text(entry.method),
    who: by.length === 0 ? null : by.map((iri) => whoOf(iri, user)).join(", "),
    date: text(entry.date),
    service: text(entry.service),
    basis: list(entry.basis),
    match: text(entry.match),
    note: text(entry.note),
    status: text(entry.status) ?? "confirmed",
  };
}

/** Whether `value` is a value object, a literal with `@value`. */
function isValueObject(value: unknown): value is JsonObject {
  return isJsonObject(value) && Object.hasOwn(value, "@value");
}

/** Whether `value` is a node: an object that is no value object and no ordered list. */
function isNode(value: unknown): value is JsonObject {
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

/** A pair's row: property and value as written, the value's web address. */
function rowOf(context: unknown, [property, value]: Pair): VocabularyRow {
  if (property === "type" && typeof value === "string") {
    const iri = expanded(context, value);
    return { property, value, href: isWebIri(iri) ? iri : null };
  }
  if (isNode(value)) {
    if (typeof value.id === "string") {
      const iri = expanded(context, value.id);
      return { property, value: value.id, href: isWebIri(iri) ? iri : null };
    }
    return {
      property,
      value: typeof value.label === "string" ? value.label : canonicalText(value),
      href: null,
    };
  }
  return { property, value: literalText(value) ?? canonicalText(value), href: null };
}

/** The context the skeleton declares. */
function contextOf(skeleton: Skeleton): JsonObject {
  return skeleton["@context"] as JsonObject;
}

/** The annotations of the subject at `path` with status `status`. */
function entriesAt(skeleton: Skeleton, path: readonly PathSegment[], status?: string) {
  return entries(skeleton, path, status as "confirmed" | undefined);
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
 * The systems "＋ vocabulary" offers a rectangle: the verb's vocabularies
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

/** The rectangles of the subject at `path` of `skeleton`. */
function rectanglesAt(
  skeleton: Skeleton,
  path: readonly PathSegment[],
  catalogue: Catalogue,
  user: User,
): RectangleView[] {
  const context = contextOf(skeleton);
  const confirmed = entriesAt(skeleton, path, "confirmed");
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
      rows: pairs.map((pair) => rowOf(context, pair)),
      entries: pairs.map((pair) => {
        const entry = confirmed.find((candidate) =>
          samePair(context, entryPair(context, candidate), pair),
        );
        return entry === undefined ? null : lineOf(entry, user);
      }),
      addable: addableOf(catalogue, context, verb, rectangle.inverse, pairs),
      pairs,
    };
  });
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
  return rectanglesAt(frame.skeleton, frame.path, catalogue, user);
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

/** The words of an annotated pair's value: its label, an element's name, a literal's text, or its ID. */
function valueWords(
  context: unknown,
  value: unknown,
  labels: ReadonlyMap<string, string>,
  names: ReadonlyMap<string, string>,
): string {
  if (isNode(value)) {
    if (typeof value.label === "string") return value.label;
    if (typeof value.id === "string") {
      if (value.id.startsWith("#")) return names.get(value.id.slice(1)) ?? value.id;
      return labels.get(expanded(context, value.id) ?? value.id) ?? value.id;
    }
    return canonicalText(value);
  }
  if (typeof value === "string") return labels.get(expanded(context, value) ?? value) ?? value;
  return literalText(value) ?? canonicalText(value);
}

/** An annotation as the schema types it; the validator has checked every one a manifest holds. */
function asEntry(entry: JsonObject): ProvenanceEntry {
  const { property, value, status } = entry;
  if (
    typeof property !== "string" ||
    value === undefined ||
    (status !== "confirmed" && status !== "proposed" && status !== "rejected")
  ) {
    throw new TypeError("an annotation needs a property, a value and a status");
  }
  return { ...entry, property, value, status } as ProvenanceEntry;
}

/** The proposed or rejected rows of the frame's element and of the value nodes it states. */
function rowsOf(
  frame: Frame,
  catalogue: Catalogue,
  user: User,
  status: "proposed" | "rejected",
): DrawerRow[] {
  const context = contextOf(frame.skeleton);
  const labels = labelsOf(frame.skeleton);
  const names = new Map<string, string>();
  for (const holder of statementHolders(frame.block.manifest)) {
    if (holder.id !== null) names.set(holder.id, holder.name ?? holder.id);
  }
  return subjectsUnder(frame.skeleton, frame.path).flatMap((subject) =>
    entriesAt(frame.skeleton, subject, status).map((entry) => {
      const [property, value] = entryPair(context, entry);
      const verb = verbOf(catalogue, context, property, value);
      return {
        key: canonicalText([subject, entry.property, entry.value]),
        subject,
        heading: verb === null ? property : verbLabel(catalogue, verb[0], verb[1]),
        label: valueWords(context, value, labels, names),
        entry: asEntry(entry),
        line: lineOf(entry, user),
      };
    }),
  );
}

/** The paths of the elements around the frame's: the bundle, then each timeline holding it, outermost first. */
function ancestorsOf(path: readonly PathSegment[]): PathSegment[][] {
  const found: PathSegment[][] = [];
  for (let length = 0; length < path.length; length += 2) found.push(path.slice(0, length));
  return found;
}

/**
 * The drawers of the frame's element: the rectangles stated of the
 * elements around it (the bundle, then the timelines holding it, outermost
 * first; only rectangles with pairs, only elements with any), and the
 * proposed and rejected pairs of the element and its value nodes.
 */
export function drawersOf(view: View, frame: Frame, catalogue: Catalogue, user: User): Drawers {
  const higher = ancestorsOf(frame.path).flatMap((path): HigherGroup[] => {
    const id = path.length === 0 ? null : at(frame.skeleton, [...path, "id"]);
    const target: Address =
      typeof id === "string" ? { block: frame.block.id, id } : { block: frame.block.id };
    const found = rectanglesAt(frame.skeleton, path, catalogue, user).filter(
      (rectangle) => rectangle.pairs.length > 0,
    );
    return found.length === 0
      ? []
      : [{ key: addressKey(target), words: addressWords(view, target), rectangles: found }];
  });
  return {
    higher,
    proposed: rowsOf(frame, catalogue, user, "proposed"),
    rejected: rowsOf(frame, catalogue, user, "rejected"),
  };
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
  return prefixesOf(catalogue, contextOf(frame.skeleton));
}
