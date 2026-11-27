/**
 * The group memberships of the Properties tab. For selected timelines, the
 * groups of their manifest, each a checkbox whether they are its members
 * (`groupsOf`); for one selected group, the timelines of its manifest, each
 * a checkbox whether it is a member (`membersOf`); and a new group of the
 * selected timelines, or an empty one for a selected block
 * (`newGroupOf`). Each change is one command: a `set` of the `groups` of
 * every timeline it changes, or one `add` of a group. A checkbox or button
 * whose command core refuses is offered disabled, with core's message as
 * its reason. Memberships are offered on the arranger and in the bundle
 * editor, which hold every group of a block; a group or timeline editor
 * changes only what it edits, and offers none. Core's verdict on a command
 * that creates elements (a new group, a member's groupstamps) mints their
 * IDs with the `minter` given, a fresh one by default; given a copy of the
 * store's (`Store.minter`), a refusal names the IDs the dispatch would.
 */

import type { Editing, Subject } from "@timetoalign/tilie-arranger";
import type {
  AddCommand,
  Address,
  Block,
  Change,
  IdMinter,
  Manifest,
  ResolvedAddress,
  SetCommand,
  View,
} from "@timetoalign/tilie-core";
import {
  apply,
  assertNever,
  createIdMinter,
  findTimeline,
  idAddress,
  inBlock,
  indexOf,
  isCommandError,
} from "@timetoalign/tilie-core";

/** One checkbox of a membership fieldset. */
export interface MembershipRow {
  /** The group's ID (`groupsOf`) or the timeline's (`membersOf`). */
  readonly id: string;
  /** Its `name`, else its ID. */
  readonly label: string;
  /** How deep a timeline lies below its root, 0 for a root; 0 for a group. */
  readonly depth: number;
  readonly checked: boolean;
  /** Some of the selected timelines are members and some are not: the checkbox is indeterminate. */
  readonly mixed: boolean;
  /** The command a click dispatches. */
  readonly command: SetCommand;
  /** Why core refuses the command; the checkbox is then disabled. */
  readonly refusal: string | null;
}

/** A membership fieldset: its legend and its rows. */
export interface Memberships {
  readonly legend: "Groups" | "Members";
  readonly rows: readonly MembershipRow[];
}

/** The New group button: the `add` it dispatches and why core refuses it, if it does. */
export interface NewGroup {
  readonly command: AddCommand;
  readonly refusal: string | null;
}

/** Whether the level holds every group of a block: the arranger and the bundle editor. */
function offered(editing: Editing | null): boolean {
  return editing === null || editing.kind === "bundle";
}

/**
 * The timeline or virtual timeline `resolved` names: itself, its card, or a
 * part of either; `null` for anything else.
 */
function timelineIdOf(resolved: ResolvedAddress): string | null {
  switch (resolved.kind) {
    case "timeline":
    case "card":
      return resolved.at.timeline.id;
    case "virtual_timeline":
    case "virtual_card":
      return resolved.virtual.id;
    case "part":
      return timelineIdOf(resolved.owner);
    case "workspace":
    case "block":
    case "title":
    case "frame":
    case "band":
    case "entry":
    case "measure_map":
    case "timestamp":
    case "matchstamp":
    case "anchor":
    case "elision":
    case "flow_map":
    case "virtual_band":
    case "chunk":
    case "chunk_band":
      return null;
    default:
      return assertNever(resolved);
  }
}

/** The group `resolved` names: its frame, or a part of it (its title); `null` for anything else. */
function groupIdOf(resolved: ResolvedAddress): string | null {
  switch (resolved.kind) {
    case "frame":
      return resolved.group.id;
    case "part":
      return groupIdOf(resolved.owner);
    case "workspace":
    case "block":
    case "title":
    case "timeline":
    case "card":
    case "band":
    case "entry":
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

/** The block every subject lies in, `null` for none or several. */
function blockOf(view: View, subjects: readonly Subject[]): Block | null {
  const [first] = subjects;
  if (first === undefined || subjects.some((subject) => subject.block !== first.block)) return null;
  return view.blocks[first.block] ?? null;
}

/** The distinct timelines the subjects name, in selection order; `null` unless every subject names one. */
function timelinesOf(subjects: readonly Subject[]): readonly string[] | null {
  const ids: string[] = [];
  for (const subject of subjects) {
    const id = timelineIdOf(subject.resolved);
    if (id === null) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The IDs of the groups whose `members` list `timeline` itself, in the
 * manifest's order: the value of its `groups` property, which lists no group
 * holding it through an ancestor (core's `groupsHolding`).
 */
function groupsListing(manifest: Manifest, timeline: string): readonly string[] {
  return manifest.groups
    .filter((group) => group.members.includes(timeline))
    .map((group) => group.id);
}

/** The change setting `timeline`'s groups to `groups`. */
function groupsChange(block: Block, timeline: string, groups: readonly string[]): Change {
  return { target: inBlock(block.id, idAddress(timeline)), values: { groups: [...groups] } };
}

/** Core's verdicts on commands aimed into one block, read with one minter state. */
interface Verdicts {
  /** The minter state they were read with (`minterKey`). */
  readonly minter: string;
  /** Each command's verdict, by its JSON. */
  readonly refusals: Map<string, string | null>;
}

/**
 * Core's verdicts already read, by the block a command is aimed into. A
 * membership `set` or a group `add` reads and changes its block alone, so
 * its verdict holds for as long as that block is the same object and the
 * minter mints the same IDs: a pan, a zoom, a hover, another selection or a
 * command on another block that mints nothing reads it again for free, and
 * an undo back to a block once read finds it here. A block no view holds any
 * more is let go with its verdicts.
 */
const verdicts = new WeakMap<Block, Verdicts>();

/**
 * The state of `minter`: its seed, its length and the next ID it mints,
 * which fix every ID it mints and so every ID a refusal names.
 */
function minterKey(minter: IdMinter): string {
  return JSON.stringify([String(minter.seed), minter.length, minter.copy().mint("_")]);
}

/**
 * What core says of `command` on `view`, aimed into `block`: its message
 * when it refuses it, else `null`. The IDs of what it creates are minted by
 * `minter`. Applied once for each block, minter state and command
 * (`verdicts`); verdicts read with another minter state are dropped.
 */
function refusalOf(
  view: View,
  block: Block,
  command: SetCommand | AddCommand,
  minter: IdMinter,
): string | null {
  const state = minterKey(minter);
  let known = verdicts.get(block);
  if (known === undefined || known.minter !== state) {
    known = { minter: state, refusals: new Map() };
    verdicts.set(block, known);
  }
  const key = JSON.stringify(command);
  const found = known.refusals.get(key);
  if (found !== undefined) return found;
  const result = apply(view, command, minter);
  const refusal = isCommandError(result) ? result.message : null;
  known.refusals.set(key, refusal);
  return refusal;
}

/**
 * The Groups fieldset of selected timelines (a timeline, its card or a part
 * of either, all in one block): one row per group of the manifest, in its
 * order, checked when every selected timeline is a member, indeterminate
 * when some are. A click on a checked row takes every selected timeline out
 * of the group; on another row it puts every one that is no member in.
 * `null` for a manifest without groups, for any other selection, and in a
 * group or timeline editor.
 */
export function groupsOf(
  view: View,
  subjects: readonly Subject[],
  editing: Editing | null,
  minter: IdMinter = createIdMinter(),
): Memberships | null {
  if (!offered(editing)) return null;
  const block = blockOf(view, subjects);
  const timelines = timelinesOf(subjects);
  if (block === null || timelines === null || block.manifest.groups.length === 0) return null;
  const { manifest } = block;
  const rows = manifest.groups.map((group): MembershipRow => {
    const members = timelines.filter((id) => group.members.includes(id));
    const checked = members.length === timelines.length;
    const changes = timelines
      .filter((id) => group.members.includes(id) === checked)
      .map((id) => {
        const held = groupsListing(manifest, id);
        const groups = checked ? held.filter((item) => item !== group.id) : [...held, group.id];
        return groupsChange(block, id, groups);
      });
    const command: SetCommand = { type: "set", changes };
    return {
      id: group.id,
      label: group.name ?? group.id,
      depth: 0,
      checked,
      mixed: members.length > 0 && !checked,
      command,
      refusal: refusalOf(view, block, command, minter.copy()),
    };
  });
  return { legend: "Groups", rows };
}

/**
 * The Members fieldset of one selected group (its frame or its title): one
 * row per timeline of the manifest, roots and children at any depth in the
 * manifest's order, each checked when it is a member; a click puts it into
 * the group or takes it out. A timeline that cannot join, because it holds
 * or lies inside a member, is disabled with core's reason. `null` for any
 * other selection, and in a group or timeline editor.
 */
export function membersOf(
  view: View,
  subjects: readonly Subject[],
  editing: Editing | null,
  minter: IdMinter = createIdMinter(),
): Memberships | null {
  const [subject, ...others] = subjects;
  if (!offered(editing) || subject === undefined || others.length > 0) return null;
  const id = groupIdOf(subject.resolved);
  const block = view.blocks[subject.block];
  const group = block?.manifest.groups.find((item) => item.id === id);
  if (block === undefined || group === undefined) return null;
  const { manifest } = block;
  const rows = [...indexOf(manifest).ancestry].map(([timeline, path]): MembershipRow => {
    const checked = group.members.includes(timeline);
    const held = groupsListing(manifest, timeline);
    const groups = checked ? held.filter((item) => item !== group.id) : [...held, group.id];
    const command: SetCommand = { type: "set", changes: [groupsChange(block, timeline, groups)] };
    const name = findTimeline(manifest, timeline)?.name ?? null;
    return {
      id: timeline,
      label: name ?? timeline,
      depth: path.length - 1,
      checked,
      mixed: false,
      command,
      refusal: refusalOf(view, block, command, minter.copy()),
    };
  });
  return { legend: "Members", rows };
}

/**
 * The New group button: for selected timelines in one block, an `add` of a
 * group of them, members in selection order; for the selected block alone,
 * an `add` of a group without members. The group carries no ID: the store
 * gives it one when it dispatches the command. `null` for any other
 * selection, and in a group or timeline editor.
 */
export function newGroupOf(
  view: View,
  subjects: readonly Subject[],
  editing: Editing | null,
  minter: IdMinter = createIdMinter(),
): NewGroup | null {
  if (!offered(editing)) return null;
  const block = blockOf(view, subjects);
  if (block === null) return null;
  const only = subjects.length === 1 && subjects[0]?.resolved.kind === "block";
  const members = only ? [] : timelinesOf(subjects);
  if (members === null) return null;
  const into: Address = { block: block.id };
  const command: AddCommand = { type: "add", into, group: { members: [...members] } };
  return { command, refusal: refusalOf(view, block, command, minter.copy()) };
}
