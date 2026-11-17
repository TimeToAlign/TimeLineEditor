/**
 * The Metadata tab's model: which element's links it shows (`inspectedOf`),
 * each link as its card reads it (`linkCard`), the one command of every
 * change (`linksCommand`) and what a pasted URL gives (`pasted`). A link is
 * TimeToShare's: built from URLs through the schema package's registry of
 * known schemes (`linkFromUrls`) and changed through its functions
 * (`withLabel`, `withUri`, `withParts`, `withAssertion`); this module
 * defines no part of it. Recognition is local: no URL is ever fetched.
 */

import type { Editing, Subject } from "@timetoalign/tilie-arranger";
import { editedSelection } from "@timetoalign/tilie-arranger";
import type {
  Address,
  Block,
  Manifest,
  PathSegment,
  ResolvedAddress,
  SetCommand,
  View,
} from "@timetoalign/tilie-core";
import { addressWords, isCommandError, resolveAddress } from "@timetoalign/tilie-core";
import type {
  Assertion,
  CompleteLink,
  CompleteManifest,
  CompletePartSlot,
  CompleteTimeline,
  Identifier,
  Level,
  UnregisteredTerm,
} from "@timetoalign/timetoshare";
import {
  ABSENCE_REASONS,
  completeManifest,
  defaultRegistry,
  dumps,
  LEVELS,
  linkFromUrls,
  SCHEMA_VERSION,
  STATUSES,
  unregisteredTerms,
  validate,
  withAssertion,
  withLabel,
  withParts,
  withUri,
} from "@timetoalign/timetoshare";

/** The elements that hold links: the bundle (its manifest), a timeline at any depth, a region. */
export type Owner = "bundle" | "timeline" | "region";

/** An element whose links the tab shows. */
export interface Inspected {
  readonly kind: Owner;
  readonly block: Block;
  /** The address a `set` of `links` is aimed at: the block for the bundle, else the element's. */
  readonly target: Address;
  /** The ID of the timeline or region; `null` for the bundle. */
  readonly id: string | null;
  /** The element as the tab names it (`bundle 'Mixed'`, `timeline 'Score'`), core's words. */
  readonly words: string;
}

/** What the tab shows: an element's links, or a hint saying how to reach one. */
export type Shown = Inspected | { readonly kind: "none"; readonly hint: string };

/** The hint without an element: nothing selected among several blocks, or several things selected. */
export const SELECT_HINT = "Select a block, a timeline or a region to see its links.";

/** The hint for an element that holds no links: a group, a conversion map, a timestamp, … */
export function holdsNoLinks(words: string): string {
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} holds no links: a bundle, a timeline or a region does. Select its block, a timeline or a region.`;
}

/** The owner of links a resolved address names: the element itself, or the one its card, band or part belongs to. */
function ownerOf(
  resolved: ResolvedAddress,
): { readonly kind: Owner; readonly id: string | null } | null {
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
      return ownerOf(resolved.owner);
    default:
      return null;
  }
}

/** What the tab shows for `address`, resolved in `view`. */
function shownAt(view: View, address: Address): Shown {
  const resolved = resolveAddress(view, address);
  if (isCommandError(resolved) || resolved.kind === "workspace") {
    return { kind: "none", hint: SELECT_HINT };
  }
  const owner = ownerOf(resolved);
  if (owner === null) return { kind: "none", hint: holdsNoLinks(addressWords(view, address)) };
  const target: Address =
    owner.id === null ? { block: resolved.block.id } : { block: resolved.block.id, id: owner.id };
  return { ...owner, block: resolved.block, target, words: addressWords(view, target) };
}

/**
 * The element whose links the tab shows: the one selected subject's (a
 * block's bundle; a timeline, its card, a band or a part of it; a region or
 * its label); with nothing selected, in an editor, the edited element's
 * (its opening's selection); at the top level, the bundle of the one block
 * when the workspace holds exactly one. Several subjects, or nothing among
 * several blocks, show `SELECT_HINT`; an element holding no links says so.
 */
export function inspectedOf(
  view: View,
  subjects: readonly Subject[],
  editing: Editing | null,
): Shown {
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

/** A manifest as the schema package reads it: its complete form, and its unregistered terms. */
export interface Described {
  readonly complete: CompleteManifest;
  readonly terms: readonly UnregisteredTerm[];
}

const described = new WeakMap<Manifest, Described>();

/** A block's manifest in TimeToShare's complete form, with its unregistered terms; memoised by identity. */
export function describedOf(manifest: Manifest): Described {
  const known = described.get(manifest);
  if (known !== undefined) return known;
  const value: unknown = manifest;
  validate(value);
  const found = { complete: completeManifest(value), terms: unregisteredTerms(value) };
  described.set(manifest, found);
  return found;
}

/** The links an element holds and their path in its manifest. */
export interface Held {
  readonly links: readonly CompleteLink[];
  /** The path of the element's `links` list from the manifest. */
  readonly path: readonly PathSegment[];
}

/** The links of the element `id` (`null` the manifest itself) in `manifest`; `undefined` for no such element. */
export function heldBy(manifest: CompleteManifest, id: string | null): Held | undefined {
  if (id === null) return { links: manifest.links, path: ["links"] };
  const visit = (timeline: CompleteTimeline, path: readonly PathSegment[]): Held | undefined => {
    if (timeline.id === id) return { links: timeline.links, path: [...path, "links"] };
    const index = timeline.regions.findIndex((region) => region.id === id);
    const region = timeline.regions[index];
    if (region !== undefined)
      return { links: region.links, path: [...path, "regions", index, "links"] };
    for (const [at, child] of timeline.children.entries()) {
      const found = visit(child, [...path, "children", at]);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  for (const [at, root] of manifest.timelines.entries()) {
    const found = visit(root, ["timelines", at]);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The names of the timelines and regions of a manifest by ID: each one's `name`, else its ID. */
function namesOf(manifest: CompleteManifest): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  const visit = (timeline: CompleteTimeline) => {
    names.set(timeline.id, timeline.name ?? timeline.id);
    for (const region of timeline.regions) names.set(region.id, region.name ?? region.id);
    for (const child of timeline.children) visit(child);
  };
  for (const root of manifest.timelines) visit(root);
  return names;
}

/**
 * The name of an identifier's scheme: a scheme of the manifest by its
 * `name` (else its ID), a scheme of TimeToShare's registry by its name,
 * else the scheme as written (an absolute URI).
 */
export function schemeName(manifest: CompleteManifest, scheme: string): string {
  const declared = manifest.schemes.find((item) => item.id === scheme);
  if (declared !== undefined) return declared.name ?? declared.id;
  return defaultRegistry().schemes.find((item) => item.uri === scheme)?.name ?? scheme;
}

/** An identifier as a card shows it: its scheme's name and its value. */
export interface IdentifierRow {
  readonly scheme: string;
  readonly value: string;
}

/** One part slot of a reading, as a card shows it. */
export interface SlotRow {
  /** Its position in the reading, from 1. */
  readonly position: number;
  readonly label: string | null;
  readonly uris: readonly string[];
  readonly identifiers: readonly IdentifierRow[];
  /** The names of the elements representing it; empty for an absent part. */
  readonly representedBy: readonly string[];
  /** Why no element represents it; `null` for a represented part. */
  readonly absent: string | null;
}

/** The reading of a link's parts. */
export interface PartsRow {
  readonly relation: string;
  readonly ordered: boolean;
  readonly slots: readonly SlotRow[];
}

/** One link as its card shows it. */
export interface LinkCard {
  readonly level: string;
  readonly relation: string;
  readonly label: string | null;
  /** The URIs, the first preferred. */
  readonly uris: readonly string[];
  readonly identifiers: readonly IdentifierRow[];
  /** The records, each its URL and, where stated, its media type. */
  readonly records: readonly string[];
  /** The reading of the parts; `null` for a link stating none. */
  readonly parts: PartsRow | null;
  /** The wholes the entity belongs to, one line each. */
  readonly partOf: readonly string[];
  /** The assertion line; `null` for a link without one. */
  readonly assertion: string | null;
  /** The assertion's `status`; `null` where none is stated. */
  readonly status: string | null;
  /** The link's unregistered terms, each with its place in the link. */
  readonly warnings: readonly string[];
}

const identifierRows = (manifest: CompleteManifest, identifiers: readonly Identifier[]) =>
  identifiers.map(({ scheme, value }) => ({ scheme: schemeName(manifest, scheme), value }));

/** The assertion line: who asserted it, when, how, how closely and whether it stands; each where stated. */
export function assertionLine(assertion: Assertion | null): string | null {
  if (assertion === null) return null;
  const { asserted_by = [], asserted_on, method, match, status } = assertion;
  const parts = [
    asserted_by.length > 0 ? `asserted by ${asserted_by.join(", ")}` : null,
    (asserted_on ?? null) === null ? null : `on ${asserted_on}`,
    (method ?? null) === null ? null : `method ${method}`,
    (match ?? null) === null ? null : `match ${match}`,
    (status ?? null) === null ? null : `status ${status}`,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

/** A JSON pointer of a path below a link. */
const pointer = (path: readonly PathSegment[]) =>
  path.map((segment) => `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");

/**
 * The card of the link `index` of `held`, an element's links in a described
 * manifest: its level and relation, label, URIs, identifiers by their
 * schemes' names, records, the reading of its parts (each slot's label,
 * URIs, identifiers and representing elements by name, or its absence), its
 * `part_of` entries, its assertion line, and a warning for each of its
 * unregistered terms (`'<term>' is no registered word, at <pointer in the
 * link>`).
 */
export function linkCard({ complete, terms }: Described, held: Held, index: number): LinkCard {
  const link = held.links[index];
  if (link === undefined) throw new RangeError(`no link ${index} at ${pointer(held.path)}`);
  const names = namesOf(complete);
  const prefix = [...held.path, index];
  const warnings = terms
    .filter((term) => prefix.every((segment, at) => term.path[at] === segment))
    .map(
      (term) =>
        `'${term.term}' is no registered word, at ${pointer(term.path.slice(prefix.length))}`,
    );
  const slots = link.parts.map((slot, at) => ({
    position: at + 1,
    label: slot.label,
    uris: slot.uri,
    identifiers: identifierRows(complete, slot.identifiers),
    representedBy: slot.represented_by.map((id) => names.get(id) ?? id),
    absent: slot.absent,
  }));
  return {
    level: link.level,
    relation: link.relation,
    label: link.label,
    uris: link.uri,
    identifiers: identifierRows(complete, link.identifiers),
    records: link.records.map((record) =>
      record.media_type === null ? record.url : `${record.url} (${record.media_type})`,
    ),
    parts:
      link.parts_relation === null && slots.length === 0
        ? null
        : { relation: link.parts_relation ?? "", ordered: link.parts_ordered, slots },
    partOf: link.part_of.map((entry) => {
      const whole = entry.label ?? entry.uri[0] ?? entry.identifiers[0]?.value ?? "";
      const position = entry.position === null ? "" : `, position ${entry.position}`;
      return `${entry.parts_relation} of ${whole}${position}`;
    }),
    assertion: assertionLine(link.assertion),
    status: link.assertion?.status ?? null,
    warnings,
  };
}

/** The one command of a change of an element's links: a `set` of the whole list. */
export function linksCommand(inspected: Inspected, links: readonly CompleteLink[]): SetCommand {
  return { type: "set", changes: [{ target: inspected.target, values: { links } }] };
}

/** Whether two links are the same JSON, as the schema package's writer writes them. */
export function sameLink(left: CompleteLink, right: CompleteLink): boolean {
  return dumps(left) === dumps(right);
}

/** `links` with the link `index` replaced by `link`. */
export function replaced(
  links: readonly CompleteLink[],
  index: number,
  link: CompleteLink,
): CompleteLink[] {
  return links.map((item, at) => (at === index ? link : item));
}

/** `links` without the link `index`. */
export function removed(links: readonly CompleteLink[], index: number): CompleteLink[] {
  return links.filter((_, at) => at !== index);
}

/** The link with its label set to `text`; an empty text unstates it. */
export function relabelled(link: CompleteLink, text: string): CompleteLink {
  const label = text.trim();
  return withLabel(link, label === "" ? null : label);
}

/** What changing a link by a URL or a word gave: the new link, or why there is none. */
export type Changed =
  | { readonly ok: true; readonly link: CompleteLink }
  | { readonly ok: false; readonly message: string };

/** The message of a refusal of the schema package's functions. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The link with the URL `text` appended (`withUri`); a URL it holds already gives "holds it". */
export function extended(link: CompleteLink, text: string): Changed {
  const url = text.trim();
  if (url === "") return { ok: false, message: "Type or paste a URL to add." };
  try {
    const next = withUri(link, [url]);
    return sameLink(next, link)
      ? { ok: false, message: "The link holds that URL already." }
      : { ok: true, link: next };
  } catch (error) {
    return { ok: false, message: `The URL cannot be added: ${messageOf(error)}.` };
  }
}

/** The link with the absence of its part slot `slot` given the reason `reason` (`withParts`). */
export function withAbsence(link: CompleteLink, slot: number, reason: string): CompleteLink {
  const { parts_relation: relation, parts, parts_ordered: ordered } = link;
  if (relation === null) throw new RangeError("a link with parts states its parts_relation");
  const slots: CompletePartSlot[] = parts.map((item, at) =>
    at === slot ? { ...item, absent: reason } : item,
  );
  return withParts(link, relation, slots, { ordered });
}

/** The statuses an assertion may state, in the schema's order; `null` states none. */
export const ASSERTION_STATUSES: readonly (typeof STATUSES)[number][] = STATUSES;

/** The link with its assertion's `status` set (`null` unstates it); a link without one gains one. */
export function withStatus(
  link: CompleteLink,
  status: (typeof STATUSES)[number] | null,
): CompleteLink {
  return withAssertion(link, { ...(link.assertion ?? {}), status });
}

/** The registered absence reasons, and `reason` after them when it is none of them. */
export function absenceChoices(reason: string): readonly string[] {
  const registered: readonly string[] = ABSENCE_REASONS;
  return registered.includes(reason) ? registered : [...registered, reason];
}

/** Whether `reason` is one of the registered absence reasons. */
export function isRegisteredAbsence(reason: string): boolean {
  const registered: readonly string[] = ABSENCE_REASONS;
  return registered.includes(reason);
}

/** The levels a link may have, in the schema's order. */
export const LINK_LEVELS: readonly Level[] = LEVELS;

/** The calendar date of `now` in the viewer's time zone, `YYYY-MM-DD`: the day an assertion is made. */
export function dayOf(now: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear()).padStart(4, "0")}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** The assertion of a link the viewer creates: by `identity` (by nobody named without one), on `day`, made by hand. */
export function viewerAssertion(identity: string | null, day: string): Assertion {
  return {
    asserted_by: identity === null ? [] : [identity],
    asserted_on: day,
    method: "manual",
  };
}

/**
 * Whether `text` is an absolute URI as the schema reads one, the form an
 * identity takes in an assertion's `asserted_by`: the schema itself is asked,
 * through a manifest holding one link asserted by `text`.
 */
export function isUri(text: string): boolean {
  try {
    validate({
      timetoshare: SCHEMA_VERSION,
      timelines: [],
      links: [{ relation: "pertains_to", level: "work", assertion: { asserted_by: [text] } }],
    });
    return true;
  } catch {
    return false;
  }
}

/** What a pasted text gives: a link, a URL whose level must be chosen, or why it gives nothing. */
export type Pasted =
  | { readonly kind: "link"; readonly link: CompleteLink }
  | { readonly kind: "level"; readonly url: string }
  | { readonly kind: "refused"; readonly message: string };

/**
 * What the text pasted as a URL gives, read through TimeToShare's default
 * registry (`linkFromUrls`), the link asserted by `assertion`: with `level`,
 * the link at that level; without, the link at the level the registry
 * recognises, or the URL waiting for a level where the registry tells none
 * (a scheme without a level, an absolute URI it does not know); a text
 * that is no absolute URI is refused with the schema package's reason.
 */
export function pasted(text: string, assertion: Assertion, level?: Level): Pasted {
  const url = text.trim();
  try {
    const options = level === undefined ? { assertion } : { assertion, level };
    return { kind: "link", link: linkFromUrls([url], options) };
  } catch (error) {
    return level === undefined && takesLevel(url)
      ? { kind: "level", url }
      : { kind: "refused", message: `The pasted text gives no link: ${messageOf(error)}.` };
  }
}

/** Whether `url` gives a link once its level is stated: the registry tells none for it. */
function takesLevel(url: string): boolean {
  try {
    linkFromUrls([url], { level: "work" });
    return true;
  } catch {
    return false;
  }
}
