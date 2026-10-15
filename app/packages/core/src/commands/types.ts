/**
 * The four commands over a workspace. Each is aimed at addresses; the kind of
 * the target, resolved from the address, decides what it does.
 */

import type { Declaration, Selector } from "@timetoalign/timeskeleton";
import type { Gap } from "../manifest/remove.ts";
import type { BlockId } from "../workspace/blocks.ts";
import type { Address } from "../workspace/ids.ts";

/** What `add` can put into a target, by the member naming it. */
export const ADD_KINDS = ["block", "child", "map", "region", "break", "jump", "marker"] as const;
export type AddKind = (typeof ADD_KINDS)[number];

/**
 * Add one thing `into` a target: a `block` into `workspace`; a `child`,
 * `map`, `region`, `break`, `jump` or `marker` into a timeline. The value is the thing as its container stores it,
 * carrying its own id.
 */
export type AddCommand = {
  readonly type: "add";
  readonly into: Address;
} & { readonly [kind in AddKind]?: unknown };

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
};

/**
 * Remove blocks and elements, mixed. Removing a segment leaves a gap in its
 * segment line: `gap` says how it is closed, and the command then names that
 * one segment alone.
 */
export type RemoveCommand = {
  readonly type: "remove";
  readonly targets: readonly Address[];
  readonly gap?: Gap;
};

/**
 * Embed one statement in block manifests: those of `blocks`, or of every
 * block holding an element `select` matches. A `null` property removes it;
 * with `name`, the declaration becomes a named style of each manifest.
 */
export type StyleCommand = {
  readonly type: "style";
  readonly select: Selector;
  readonly set: { readonly [property in keyof Declaration]?: Declaration[property] | null };
  readonly name?: string;
  readonly blocks?: readonly BlockId[];
};

export type Command = AddCommand | SetCommand | RemoveCommand | StyleCommand;
export type CommandType = Command["type"];

export const COMMAND_TYPES = [
  "add",
  "set",
  "remove",
  "style",
] as const satisfies readonly CommandType[];
