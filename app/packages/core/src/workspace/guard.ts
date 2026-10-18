/** The side-effect guard: an open editor changes only the element it edits. */

import type { Statement } from "@timetoalign/timeskeleton";
import { dumps } from "@timetoalign/timeskeleton";
import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { compareCodePoints, jsonEqual } from "../json.ts";
import { containsIn } from "../manifest/contains.ts";
import type { ElementKey } from "../manifest/elements.ts";
import { manifestElements, selectorMatches, timelineAncestry } from "../manifest/elements.ts";
import type { ListedElement } from "../manifest/files.ts";
import {
  ENTRY_KINDS,
  elementAddress,
  elementOfIn,
  entriesOf,
  TITLE_ADDRESS,
} from "../manifest/files.ts";
import type { Manifest, TimelineManifest } from "../manifest/types.ts";
import type { Block, BlockId, Place } from "./blocks.ts";
import type { Address } from "./ids.ts";
import { parseAddress } from "./ids.ts";
import type { View } from "./view.ts";

/**
 * The members of a block an element's editor never changes. `x`, `y`,
 * `width` and `height` are the box adapting to what it holds, and the
 * places and manifest are compared key by key.
 */
const FIXED_MEMBERS = ["scale", "length", "spacing", "index", "parent"] as const;

/**
 * The members of a group's place that the editor of one of its members
 * changes: the length and scale the members share are each member's own,
 * a horizontal stretch keeps the frame's requested width in proportion,
 * and a member card's vertical stretch keeps the frame's requested height
 * in proportion.
 */
const SHARED_MEMBERS: readonly string[] = ["length", "scale", "width", "height"];

/**
 * The members of a sibling card's place that the editor of a member
 * changes: a horizontal stretch of the group keeps every card's requested
 * width in proportion.
 */
const SIBLING_MEMBERS: readonly string[] = ["width"];

/** The manifest members compared first, in this order; the others follow by code point. */
const TOP_MEMBERS = ["id", "name", "meta"];

/** The `graphical` members compared first, in this order; the others follow by code point. */
const GRAPHICAL_MEMBERS = ["statements", "styles", "order"];

type Refuse = (what: string, path: readonly PathSegment[]) => CommandError;

const same = (left: unknown, right: unknown): boolean =>
  left === right || (left !== undefined && right !== undefined && jsonEqual(left, right));

const byCodePoint = (keys: Iterable<string>): string[] => [...keys].sort(compareCodePoints);

/** The keys of every object given, once each, by code point. */
function keysOf(...objects: readonly (object | undefined)[]): string[] {
  return byCodePoint(new Set(objects.flatMap((value) => Object.keys(value ?? {}))));
}

/** `first`, those of `keys` that it lists, followed by the rest of `keys` by code point. */
function inOrder(first: readonly string[], keys: Iterable<string>): string[] {
  const all = new Set(keys);
  return [
    ...first.filter((key) => all.has(key)),
    ...byCodePoint(all).filter((key) => !first.includes(key)),
  ];
}

/** One manifest as the guard reads it: its elements, its ids and what the edited element contains. */
interface Scope {
  readonly manifest: Manifest;
  readonly keys: readonly ElementKey[];
  readonly ancestry: ReadonlyMap<string, readonly string[]>;
  /** Its group and timeline ids. */
  readonly ids: ReadonlySet<string>;
  readonly inside: (element: string) => boolean;
}

function scopeOf(manifest: Manifest, element: string): Scope {
  const ancestry = timelineAncestry(manifest);
  return {
    manifest,
    keys: manifestElements(manifest),
    ancestry,
    ids: new Set([...manifest.groups.map((group) => group.id), ...ancestry.keys()]),
    inside: containsIn(manifest, element),
  };
}

/** Whether a key naming a group or timeline lies inside: the edited element contains it in each manifest that has it. */
function keyInside(scopes: readonly Scope[]): (key: string) => boolean {
  return (key) => scopes.every((scope) => !scope.ids.has(key) || scope.inside(key));
}

const statementsOf = (manifest: Manifest): readonly Statement[] =>
  manifest.graphical?.statements ?? [];

function insideAll(scopes: readonly Scope[]): (statement: Statement) => boolean {
  return (statement) =>
    scopes.every(({ keys, ancestry, inside }) =>
      keys.every(
        (key) =>
          !selectorMatches(statement.select, key, ancestry) ||
          (key.address !== null && inside(key.address)),
      ),
    );
}

/**
 * Whether a statement lies inside `element`: every element it matches, in
 * each of `manifests`, is contained by `element` there.
 */
export function statementInside(
  manifests: readonly Manifest[],
  element: string,
): (statement: Statement) => boolean {
  return insideAll(manifests.map((manifest) => scopeOf(manifest, element)));
}

/**
 * A manifest as seen from outside `element`, cut into comparable parts, each
 * the standard text of its value: per timeline (its lists reduced to their
 * ids), per map, region, break, jump and marker, per group; the top-level
 * members; the `graphical` members. The edited timeline's object, or the
 * edited group's and each of its members', stands as `{id}`; the entries of
 * `graphical.order` whose keys lie inside (the group's display order, the
 * band orders of the timelines it holds) are left out; only the
 * `statements` outside are kept, and of the named styles only those they
 * use.
 */
interface Projection {
  readonly elements: ReadonlyMap<string, string>;
  readonly top: ReadonlyMap<string, string>;
  readonly graphical: ReadonlyMap<string, string>;
}

const ids = (list: readonly { readonly id: string }[]): string[] =>
  byCodePoint(list.map((entry) => entry.id));

const byId = <T extends { readonly id: string }>(list: readonly T[]): T[] =>
  [...list].sort((left, right) => compareCodePoints(left.id, right.id));

function project(
  manifest: Manifest,
  element: string,
  inside: (key: string) => boolean,
  statements: readonly Statement[],
  styles: readonly string[],
): Projection {
  const group = manifest.groups.find((item) => item.id === element);
  const hidden = new Set(group === undefined ? [element] : group.members);
  const elements = new Map<string, string>();
  const visit = (timeline: TimelineManifest, root: string) => {
    if (hidden.has(timeline.id)) {
      elements.set(timeline.id, dumps({ id: timeline.id }));
      return;
    }
    const { breaks, jumps, markers } = timeline.flow_control;
    elements.set(
      timeline.id,
      dumps({
        ...timeline,
        children: ids(timeline.children),
        conversion_maps: ids(timeline.conversion_maps),
        regions: ids(timeline.regions),
        flow_control: {
          ...timeline.flow_control,
          breaks: ids(breaks),
          jumps: ids(jumps),
          markers: ids(markers),
        },
      }),
    );
    for (const kind of ENTRY_KINDS) {
      for (const entry of byId(entriesOf(timeline, kind) as readonly ListedElement[])) {
        elements.set(elementAddress(root, entry.id), dumps(entry));
      }
    }
    for (const child of byId(timeline.children)) visit(child, root);
  };
  for (const root of byId(manifest.timelines)) visit(root, root.id);
  for (const item of byId(manifest.groups)) {
    elements.set(
      item.id,
      dumps(item === group ? { id: item.id } : { ...item, members: byCodePoint(item.members) }),
    );
  }
  const top = new Map<string, string>();
  for (const [key, value] of Object.entries(manifest)) {
    if (!["timelines", "groups", "graphical"].includes(key)) top.set(key, dumps(value));
  }
  const { statements: _, styles: named = {}, order = {}, ...rest } = manifest.graphical ?? {};
  const orders = Object.fromEntries(Object.entries(order).filter(([key]) => !inside(key)));
  const graphical = new Map<string, string>([
    ["statements", dumps(statements)],
    [
      "styles",
      dumps(
        Object.fromEntries(
          styles.filter((name) => Object.hasOwn(named, name)).map((name) => [name, named[name]]),
        ),
      ),
    ],
    ["order", dumps(orders)],
  ]);
  for (const [key, value] of Object.entries(rest)) graphical.set(key, dumps(value));
  return { elements, top, graphical };
}

/** The first difference of the manifest outside `element`, the element removed included. */
function manifestChange(
  scopes: readonly [Scope, Scope],
  element: string,
  block: BlockId,
  target: Address,
  refuse: Refuse,
): CommandError | null {
  const [was, now] = scopes;
  if (!now.ids.has(element)) return refuse(`the removal of ${target}`, [target]);
  const inside = insideAll(scopes);
  const outside = scopes.map(({ manifest }) =>
    statementsOf(manifest).filter((item) => !inside(item)),
  );
  const styles = byCodePoint(
    new Set(outside.flat().flatMap((item) => (typeof item.set === "string" ? [item.set] : []))),
  );
  const keys = keyInside(scopes);
  const [a, b] = scopes.map(({ manifest }, index) =>
    project(manifest, element, keys, outside[index] as Statement[], styles),
  ) as [Projection, Projection];
  // An element the target contains that is gone from `after` is removed inside the target.
  const differs = (address: string) =>
    a.elements.get(address) !== b.elements.get(address) &&
    !(was.inside(address) && !b.elements.has(address));
  const changed = (address: string) => refuse(`${block}/${address}`, [`${block}/${address}`]);
  function* walk(): Generator<string> {
    for (const { manifest, keys } of [was, now]) {
      const elementOf = elementOfIn(manifest);
      for (const key of keys) {
        if (key.address !== null && key.address !== TITLE_ADDRESS) yield elementOf(key.address);
      }
    }
    // Elements no box draws: the children of a root drawn only as an ancestor line, and markers.
    yield* new Set([...a.elements.keys(), ...b.elements.keys()]);
  }
  // A differing element the target contains on one side only (a member joining or leaving
  // the group) is named only when nothing outside it differs.
  let contained: string | undefined;
  for (const address of walk()) {
    if (!differs(address)) continue;
    if (!was.inside(address) && !now.inside(address)) return changed(address);
    contained ??= address;
  }
  if (contained !== undefined) return changed(contained);
  for (const key of inOrder(TOP_MEMBERS, [...a.top.keys(), ...b.top.keys()])) {
    if (a.top.get(key) !== b.top.get(key)) {
      return refuse(`the manifest's ${key} in block ${block}`, [block, "manifest", key]);
    }
  }
  for (const key of inOrder(GRAPHICAL_MEMBERS, [...a.graphical.keys(), ...b.graphical.keys()])) {
    if (a.graphical.get(key) !== b.graphical.get(key)) {
      return refuse(`the graphical ${key} of block ${block}`, [
        block,
        "manifest",
        "graphical",
        key,
      ]);
    }
  }
  return null;
}

/** The first change of a block outside its element `element`: its placement, a key, its manifest. */
function blockChange(
  was: Block | undefined,
  now: Block | undefined,
  element: string,
  target: Address,
  refuse: Refuse,
): CommandError | null {
  if (was === undefined || now === undefined) return refuse(`the removal of ${target}`, [target]);
  const block = was.id;
  const member = FIXED_MEMBERS.find((name) => !same(was[name], now[name]));
  if (member !== undefined) return refuse(`the ${member} of block ${block}`, [block, member]);
  const scopes = [scopeOf(was.manifest, element), scopeOf(now.manifest, element)] as const;
  const inside = keyInside(scopes);
  // The group the edited element is a member of in both manifests, whose shared members it changes.
  const groupOf = (manifest: Manifest) =>
    manifest.groups.find((group) => group.members.includes(element))?.id;
  const sharing =
    groupOf(was.manifest) === groupOf(now.manifest) ? groupOf(was.manifest) : undefined;
  // The members of a key's place that the edited element shares: the group's, its siblings'.
  const membersOf = (manifest: Manifest) =>
    manifest.groups.find((group) => group.id === sharing)?.members ?? [];
  const shared = (key: string): readonly string[] =>
    key === sharing
      ? SHARED_MEMBERS
      : membersOf(was.manifest).includes(key) && membersOf(now.manifest).includes(key)
        ? SIBLING_MEMBERS
        : [];
  const unshared = (place: Place | undefined, members: readonly string[]) =>
    Object.fromEntries(Object.entries(place ?? {}).filter(([member]) => !members.includes(member)));
  const placeInside = (key: string) => {
    const members = shared(key);
    return (
      inside(key) ||
      (members.length > 0 &&
        same(unshared(was.places[key], members), unshared(now.places[key], members)))
    );
  };
  const key = keysOf(was.places, now.places).find(
    (item) => !same(was.places[item], now.places[item]) && !placeInside(item),
  );
  if (key !== undefined) return refuse(`the place of ${block}/${key}`, [`${block}/${key}`]);
  return manifestChange(scopes, element, block, target, refuse);
}

/**
 * The first change from `before` to `after` that lies outside `target`, the
 * innermost open editor's target, as a `side_effect` refusal; `null` when
 * every change lies inside it. In this order: a workspace setting; another
 * block; for an element's editor, its block's scale, length, spacing,
 * index or parent, a place of a key the element does not contain (a group
 * member's editor also changes its group's length, scale and width and its
 * siblings' card widths), and the manifest outside the element (the element
 * removed included; a display or band order lies inside when the element
 * contains its group or timeline). A block's editor changes anything in its
 * own block but its removal.
 */
export function sideEffect(before: View, after: View, target: Address): CommandError | null {
  const parsed = parseAddress(target);
  if (isCommandError(parsed)) return parsed;
  // The workspace holds everything.
  if (parsed.block === null) return null;
  const refuse: Refuse = (what, path) =>
    problem(
      ErrorCode.sideEffect,
      `${what} lies outside ${target}: an editor changes only what it edits`,
      path,
    );
  const setting = keysOf(before.settings, after.settings).find(
    (key) => !same(before.settings[key as never], after.settings[key as never]),
  );
  if (setting !== undefined)
    return refuse(`the workspace setting ${setting}`, ["workspace", setting]);
  const other = keysOf(before.blocks, after.blocks).find(
    (id) => id !== parsed.block && !same(before.blocks[id], after.blocks[id]),
  );
  if (other !== undefined) return refuse(`block ${other}`, [other]);
  if (parsed.element === null) {
    return Object.hasOwn(after.blocks, parsed.block)
      ? null
      : refuse(`the removal of ${target}`, [target]);
  }
  return blockChange(
    before.blocks[parsed.block],
    after.blocks[parsed.block],
    parsed.element,
    target,
    refuse,
  );
}
