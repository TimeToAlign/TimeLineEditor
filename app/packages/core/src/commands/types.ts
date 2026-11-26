/**
 * The four commands over a workspace. Each is aimed at addresses; the kind of
 * the target, resolved from the address, decides what it does.
 */

import type { Declaration, Selector } from "@timetoalign/timetoshare";
import type { Address } from "../workspace/address.ts";
import type { BlockId } from "../workspace/blocks.ts";

/**
 * The IDs of the elements a command creates, in the order it creates them:
 * every command may carry them. The reducer mints nothing; it takes each ID
 * from this list, and refuses a command whose list is too short or holds an
 * ID it does not take. The store fills the list of a command it dispatches,
 * after the IDs the command carries, and journals the command with it, so
 * replaying the journal creates the same IDs.
 *
 * Which elements take an ID from the list: those whose ID the editor
 * mints, never one the command's value states. A timeline, a child, a map,
 * a region, a measure map or a flow-control element is added with its own
 * `id` and takes none; a `group` takes one only where its value leaves `id`
 * out; a named timestamp, an elision, a named MatchStamp, an alignment
 * anchor, a match timestamp, a default timestamp and a segment a segment
 * line is given always take one. In the order they are created:
 *
 * - `add` of a `block`, or `set manifest` of one: the first segment of each
 *   segment line of known length that holds none, in the order of the
 *   lines, depth first.
 * - `add` of a root `timeline`: those segments of its own lines, then its
 *   default timestamps, `origin` before `length` (none for an unknown
 *   length). `add` of a `child`: the segments of its lines.
 * - `add` of a `timestamp` or of an `elision` into a timeline: its ID; of
 *   an `elision` into a block: one for each, in list order.
 * - `add` of a `matchstamp`: the MatchStamp's ID; then, anchor by anchor in
 *   screen order and the left end before the right, the ID of each match
 *   timestamp it needs that is not there yet (one already at the
 *   coordinate is reused and takes none); then each anchor's ID in screen
 *   order. `set anchors` of a named MatchStamp: the new match timestamps
 *   as for `add`, then each new anchor's ID (an anchor it keeps takes
 *   none).
 * - `set groups` that makes a child timeline join a group: its `origin`
 *   and `length` groupstamps, in that order.
 *
 * After the command's own elements, every command, a `remove` or a `set`
 * included, takes one ID for each segment line of known length its change
 * leaves without a segment (removing a line's only segment, `set
 * is_segment_line`): the line is given a first segment covering it, in
 * the order of the lines, depth first, block by block in the order the
 * command changed them. So a command that names no new element may still
 * need IDs.
 */
export interface CarriedIds {
  readonly ids?: readonly string[];
}

/** What `add` can put into a target, by the member naming it. */
export const ADD_KINDS = [
  "block",
  "timeline",
  "group",
  "measure_map",
  "child",
  "map",
  "region",
  "flow_control",
  "timestamp",
  "elision",
  "matchstamp",
  "flow_map",
  "virtual_timeline",
] as const;
/** A kind of thing `add` can put into a target. */
export type AddKind = (typeof ADD_KINDS)[number];

/**
 * Add one thing `into` a target: a `block` into `workspace`; a root
 * `timeline`, a `group` or a `measure_map` into a block; a `child`, a
 * `map`, a `region` or a `flow_control` element into a timeline. The value
 * is the thing as its container stores it, carrying its own id; a root
 * timeline comes with its default timestamps, `origin` and `length`. A
 * `timestamp` into a timeline is `{name, coordinate, display?}`: it is given
 * its ID and its timeline is the one it is added into. An `elision` into a
 * timeline is `{start, end, width?, display?}`: it is given its ID and it
 * lies on the timeline it is added into; an
 * `elision` into a block is a non-empty list of `{timeline, start, end,
 * width?, display?}`, every one added by the one command, each given the
 * next ID in list order. A `group` without an `id` is given one. A
 * `matchstamp` into a block names a potential MatchStamp: `{name, anchors,
 * match_claims}`, its anchors pairs of `{timeline, coordinate}` in screen
 * order; it is given its ID, then the IDs of the match timestamps it
 * needs, then its anchors' IDs. A `flow_map` into a root timeline is `{id?,
 * timeline?, chunks, name?, canonical?, convention?, provenance?}`,
 * ordering that root; a `virtual_timeline` into a block is `{id?, map,
 * timeline, name?, through?, length?}`, its unit, number type and length
 * computed; a `region`, `map` or `flow_control` element into a timeline may
 * leave its ID out. Every ID given is the next of the command's `ids`, in
 * the order `CarriedIds` states for each kind.
 */
export type AddCommand = {
  readonly type: "add";
  readonly into: Address;
} & { readonly [kind in AddKind]?: unknown } & CarriedIds;

/**
 * One target and the properties a `set` gives it. The properties are their
 * own member, so no property of any element can collide with `target`.
 */
export type Change = {
  readonly target: Address;
  readonly values: { readonly [property: string]: unknown };
};

/** Set properties of one or more targets: one gesture, one command. */
export type SetCommand = {
  readonly type: "set";
  readonly changes: readonly Change[];
} & CarriedIds;

/** Remove blocks and elements, mixed. */
export type RemoveCommand = {
  readonly type: "remove";
  readonly targets: readonly Address[];
} & CarriedIds;

/**
 * Embed one rule in block manifests: those of `blocks`, or of every
 * block holding an element `select` matches. A `null` property removes it;
 * with `name`, the declaration becomes a named style of each manifest.
 */
export type StyleCommand = {
  readonly type: "style";
  readonly select: Selector;
  readonly set: { readonly [property in keyof Declaration]?: Declaration[property] | null };
  readonly name?: string;
  readonly blocks?: readonly BlockId[];
} & CarriedIds;

/** A command over a workspace: `add`, `set`, `remove` or `style`. */
export type Command = AddCommand | SetCommand | RemoveCommand | StyleCommand;
/** The `type` naming a command. */
export type CommandType = Command["type"];

/** The type of each command. */
export const COMMAND_TYPES = [
  "add",
  "set",
  "remove",
  "style",
] as const satisfies readonly CommandType[];
