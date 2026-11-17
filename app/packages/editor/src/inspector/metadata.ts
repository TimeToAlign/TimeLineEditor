/**
 * The Metadata tab's model: which element's links it shows (`inspectedOf`),
 * each link as its card reads it (`linkCard`), the one command of every
 * change (`linksCommand`), what a pasted URL gives (`pasted`) and what
 * choosing a status states (`statusChange`). A link is TimeToShare's: built
 * from URLs through the schema package's registry of known schemes
 * (`linkFromUrls`, `recognize`) and changed through its functions
 * (`withLabel`, `withUri`, `withParts`, `withAssertion`); this module
 * defines no part of it. Recognition is local: no URL is ever fetched.
 */

import type { Editing, Subject } from "@timetoalign/tilie-arranger";
import { editedSelection } from "@timetoalign/tilie-arranger";
import type {
  Address,
  Block,
  LinkHolder,
  Manifest,
  ResolvedAddress,
  SetCommand,
  View,
} from "@timetoalign/tilie-core";
import { addressWords, isCommandError, linkHolders, resolveAddress } from "@timetoalign/tilie-core";
import type {
  Assertion,
  CompleteAssertion,
  CompleteDescriptor,
  CompleteLink,
  CompleteManifest,
  CompletePartOf,
  CompletePartSlot,
  Identifier,
  Level,
  LosslessManifest,
  UnregisteredTerm,
} from "@timetoalign/timetoshare";
import {
  ABSENCE_REASONS,
  assertionFor,
  completeManifest,
  defaultRegistry,
  dumps,
  LEVELS,
  linkFromUrls,
  recognize,
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

/**
 * A manifest as the schema package reads it: its complete form, its
 * unregistered terms, and the name of each of its timelines and regions by
 * ID (its `name`, else its ID).
 */
export interface Described {
  readonly complete: CompleteManifest;
  readonly terms: readonly UnregisteredTerm[];
  readonly names: ReadonlyMap<string, string>;
}

/** The links of one element as the tab reads them, with the path of its `links` list. */
export type Held = LinkHolder<CompleteLink>;

const described = new WeakMap<Manifest, Described>();

/**
 * Check `value` as the schema does, putting its unregistered terms into
 * `terms`: TimeToShare's `unregisteredTerms` validates as `validate` does,
 * so the manifest is checked once.
 */
function checkTerms(value: unknown, terms: UnregisteredTerm[]): asserts value is LosslessManifest {
  terms.push(...unregisteredTerms(value));
}

/** A block's manifest in TimeToShare's complete form, with its terms and names; memoised by identity. */
export function describedOf(manifest: Manifest): Described {
  const known = described.get(manifest);
  if (known !== undefined) return known;
  const value: unknown = manifest;
  const terms: UnregisteredTerm[] = [];
  checkTerms(value, terms);
  const complete = completeManifest(value);
  const names = new Map<string, string>();
  for (const { id, name } of linkHolders(complete)) if (id !== null) names.set(id, name ?? id);
  const found = { complete, terms, names };
  described.set(manifest, found);
  return found;
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
  /** Its URIs, the first preferred. */
  readonly uris: readonly string[];
  readonly identifiers: readonly IdentifierRow[];
  /** The names of the elements representing it; empty for an absent part. */
  readonly representedBy: readonly string[];
  /** Why no element represents it; `null` for a represented part. */
  readonly absent: string | null;
  /** The assertion line of its own assertion where it differs from the link's; else `null`. */
  readonly assertion: string | null;
}

/** The reading of a link's parts. */
export interface PartsRow {
  readonly relation: string;
  readonly ordered: boolean;
  readonly slots: readonly SlotRow[];
}

/** One whole the linked entity belongs to, as a card shows it. */
export interface PartOfRow {
  /** `part of <whole> (<parts_relation>)`, then `, position <n>` where stated. */
  readonly text: string;
  /** The assertion line of its own assertion where it differs from the link's; else `null`. */
  readonly assertion: string | null;
}

/** One link as its card shows it. */
export interface LinkCard {
  readonly level: string;
  readonly relation: string;
  readonly label: string | null;
  /** The URIs, the first preferred. */
  readonly uris: readonly string[];
  readonly identifiers: readonly IdentifierRow[];
  /** The records, each its URL and what is stated of it (media type, size, integrity). */
  readonly records: readonly string[];
  /** The reading of the parts; `null` for a link stating none. */
  readonly parts: PartsRow | null;
  /** The wholes the entity belongs to. */
  readonly partOf: readonly PartOfRow[];
  /** The assertion line; `null` for a link without one. */
  readonly assertion: string | null;
  /** The assertion's `status`; `null` where none is stated. */
  readonly status: string | null;
  /** The link's unregistered terms, each with its place in the link. */
  readonly warnings: readonly string[];
}

const identifierRows = (manifest: CompleteManifest, identifiers: readonly Identifier[]) =>
  identifiers.map(({ scheme, value }) => ({ scheme: schemeName(manifest, scheme), value }));

/**
 * The assertion line: who asserted it, when, how, through which service, on
 * which sources, how closely and whether it stands; each where stated.
 */
export function assertionLine(assertion: Assertion | null): string | null {
  if (assertion === null) return null;
  const {
    asserted_by = [],
    asserted_on,
    method,
    service,
    based_on = [],
    match,
    status,
  } = assertion;
  const parts = [
    asserted_by.length > 0 ? `asserted by ${asserted_by.join(", ")}` : null,
    (asserted_on ?? null) === null ? null : `on ${asserted_on}`,
    (method ?? null) === null ? null : `method ${method}`,
    (service ?? null) === null ? null : `service ${service}`,
    based_on.length > 0 ? `based on ${based_on.join(", ")}` : null,
    (match ?? null) === null ? null : `match ${match}`,
    (status ?? null) === null ? null : `status ${status}`,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * The line of the assertion holding for a slot or `part_of` entry of `link`
 * (TimeToShare's `assertionFor`: its own, else the link's) where it differs
 * from the link's own line; `null` where the link's holds.
 */
function entryAssertion(
  link: CompleteLink,
  entry: CompletePartSlot | CompletePartOf,
): string | null {
  const own = assertionLine(assertionFor(link, entry));
  return own === assertionLine(link.assertion) ? null : own;
}

/** A record as a card shows it: its URL, then its media type, size and integrity where stated. */
function recordText({ url, media_type, size, integrity }: CompleteDescriptor): string {
  const stated = [media_type, size === null ? null : `${String(size)} bytes`, integrity].filter(
    (item) => item !== null,
  );
  return stated.length === 0 ? url : `${url} (${stated.join(", ")})`;
}

/** A JSON pointer of a path below a link. */
const pointer = (path: readonly (string | number)[]) =>
  path.map((segment) => `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");

/**
 * The card of the link `index` of `held`, an element's links in a described
 * manifest: its level and relation, label, URIs, identifiers by their
 * schemes' names, records, the reading of its parts (each slot's label,
 * URIs, identifiers, representing elements by name or its absence, and its
 * own assertion), its `part_of` entries with theirs, its assertion line, and
 * a warning for each of its unregistered terms (`'<term>' is no registered
 * word, at <pointer in the link>`).
 */
export function linkCard(
  { complete, terms, names }: Described,
  held: Held,
  index: number,
): LinkCard {
  const link = held.links[index];
  if (link === undefined) throw new RangeError(`no link ${index} at ${pointer(held.path)}`);
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
    assertion: entryAssertion(link, slot),
  }));
  return {
    level: link.level,
    relation: link.relation,
    label: link.label,
    uris: link.uri,
    identifiers: identifierRows(complete, link.identifiers),
    records: link.records.map(recordText),
    parts:
      link.parts_relation === null && slots.length === 0
        ? null
        : { relation: link.parts_relation ?? "", ordered: link.parts_ordered, slots },
    partOf: link.part_of.map((entry) => {
      const whole = entry.label ?? entry.uri[0] ?? entry.identifiers[0]?.value ?? "";
      const position = entry.position === null ? "" : `, position ${String(entry.position)}`;
      return {
        text: `part of ${whole} (${entry.parts_relation})${position}`,
        assertion: entryAssertion(link, entry),
      };
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

/** A list of links as the schema package's writer writes it: what tells two lists apart. */
export function linksText(links: readonly CompleteLink[]): string {
  return dumps(links);
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
export function messageOf(error: unknown): string {
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

/** A status an assertion may state, or `null` for none. */
export type Status = (typeof STATUSES)[number] | null;

/** What choosing a status on a link states: the link changed in place, or a link of the viewer's own appended. */
export type StatusChange =
  | { readonly kind: "replaced"; readonly link: CompleteLink }
  | { readonly kind: "appended"; readonly link: CompleteLink };

/** Whether an assertion states nothing but its status. */
function onlyStatus(assertion: CompleteAssertion): boolean {
  const { status: _, ...rest } = assertion;
  return Object.values(rest).every(
    (value) => value === null || (Array.isArray(value) && value.length === 0),
  );
}

/**
 * What choosing `status` on `link` states, the viewer being `identity` (a
 * URI, or `null` for none) on `day`. A status is the statement of whoever
 * chooses it, so where the link's assertion is the viewer's own (it is
 * null, names no agent, or names exactly the viewer) the status changes in
 * place and the assertion is stamped as the viewer's: `asserted_by`
 * `[identity]` where an identity is given, `asserted_on` the day, `method`
 * `manual`; choosing no status on an assertion stating nothing but its
 * status leaves the link without an assertion. Where another agent asserted
 * the link, the link stays as it is and a link of its own is appended: the
 * same link with the viewer's assertion stating `status`, as TimeToShare's
 * description says of differing assertions.
 */
export function statusChange(
  link: CompleteLink,
  status: Status,
  identity: string | null,
  day: string,
): StatusChange {
  const { assertion } = link;
  const by = assertion?.asserted_by ?? [];
  const own = by.length === 0 || (identity !== null && by.length === 1 && by[0] === identity);
  if (!own) {
    return {
      kind: "appended",
      link: withAssertion(link, { ...viewerAssertion(identity, day), status }),
    };
  }
  if (status === null && (assertion === null || onlyStatus(assertion))) {
    return { kind: "replaced", link: withAssertion(link, null) };
  }
  return {
    kind: "replaced",
    link: withAssertion(link, {
      ...assertion,
      ...viewerAssertion(identity, day),
      ...(identity === null ? { asserted_by: by } : {}),
      status,
    }),
  };
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

/** The level whose links name the agent's role as their relation. */
export const AGENT: Level = "agent";

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

/**
 * Whether a URI may be offered as a link to follow: an `http:` or `https:`
 * address. Any other URI, a `urn:` or a `javascript:` one alike, is shown
 * as text.
 */
export function isWebAddress(uri: string): boolean {
  try {
    const { protocol } = new URL(uri);
    return protocol === "http:" || protocol === "https:";
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
 * registry, the link asserted by `assertion`: without `level`, an absolute
 * URI whose level the registry does not tell (`recognize`: a scheme without
 * a level, or a URI it does not know) waits for one, and any other text
 * gives the link at the level the registry recognises; with `level`, the
 * link at that level, an agent's taking `role` as its relation. What gives
 * no link is refused with the schema package's reason.
 */
export function pasted(text: string, assertion: Assertion, level?: Level, role = ""): Pasted {
  const url = text.trim();
  if (level === undefined && (recognize(url)?.level ?? null) === null && isUri(url)) {
    return { kind: "level", url };
  }
  const stated = level === undefined ? {} : { level };
  const relation = level === AGENT && role.trim() !== "" ? { relation: role.trim() } : {};
  try {
    return { kind: "link", link: linkFromUrls([url], { assertion, ...stated, ...relation }) };
  } catch (error) {
    return { kind: "refused", message: `The pasted text gives no link: ${messageOf(error)}.` };
  }
}
