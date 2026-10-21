/**
 * What a command is aimed at. An address resolves (`resolveAddress`) to one
 * target, and the target's kind decides what a command may do with it: which
 * properties a `set` gives it, what an `add` puts into it, whether a
 * `remove` takes it.
 */

import type { CommandError } from "../errors.ts";
import { isCommandError } from "../errors.ts";
import type { EntryKind } from "../manifest/files.ts";
import type { Located } from "../manifest/tree.ts";
import type { Group, MeasureMap, TimelineManifest } from "../manifest/types.ts";
import type { Address } from "../workspace/address.ts";
import { namesNothing, resolveAddress } from "../workspace/address.ts";
import type { Block } from "../workspace/blocks.ts";
import type { View } from "../workspace/view.ts";

/** The workspace, holding the settings and the blocks. */
export interface WorkspaceTarget {
  readonly kind: "workspace";
  readonly address: Address;
}

/** A block, placing one manifest on the canvas. */
export interface BlockTarget {
  readonly kind: "block";
  readonly address: Address;
  readonly block: Block;
}

/** A group of a block's manifest. */
export interface GroupTarget {
  readonly kind: "group";
  readonly address: Address;
  readonly block: Block;
  readonly group: Group;
}

/** A timeline of a block's manifest: a root, or a child with its parent. */
export interface TimelineTarget {
  readonly kind: "root" | "child";
  readonly address: Address;
  readonly block: Block;
  readonly at: Located;
}

/** A measure map of a block's manifest. */
export interface MeasureMapTarget {
  readonly kind: "measure_map";
  readonly address: Address;
  readonly block: Block;
  readonly map: MeasureMap;
  /** Its index in the manifest's `measure_maps`. */
  readonly index: number;
}

/** A map, region or flow-control element of a block's manifest. */
export interface EntryTarget {
  readonly kind: EntryKind;
  readonly address: Address;
  readonly block: Block;
  /** The timeline listing the entry. */
  readonly at: Located;
  /** Its index in that timeline's list of its kind. */
  readonly index: number;
}

export type Target =
  | WorkspaceTarget
  | BlockTarget
  | GroupTarget
  | MeasureMapTarget
  | TimelineTarget
  | EntryTarget;
export type TargetKind = Target["kind"];

/** The target of each kind, the type each kind's table of setters reads. */
export interface TargetOfKind {
  readonly workspace: WorkspaceTarget;
  readonly block: BlockTarget;
  readonly group: GroupTarget;
  readonly measure_map: MeasureMapTarget;
  readonly root: TimelineTarget;
  readonly child: TimelineTarget;
  readonly map: EntryTarget;
  readonly region: EntryTarget;
  readonly flow_control: EntryTarget;
}

/**
 * The target an address names in `view`: `unknown_target` for a title,
 * cards, a band and a part.
 */
export function targetOf(view: View, address: Address): Target | CommandError {
  const resolved = resolveAddress(view, address);
  if (isCommandError(resolved)) return resolved;
  switch (resolved.kind) {
    case "workspace":
      return { kind: "workspace", address };
    case "block":
      return { kind: "block", address, block: resolved.block };
    case "frame":
      return { kind: "group", address, block: resolved.block, group: resolved.group };
    case "measure_map": {
      const { block, map, index } = resolved;
      return { kind: "measure_map", address, block, map, index };
    }
    case "timeline": {
      const { at, block } = resolved;
      return { kind: at.parent === undefined ? "root" : "child", address, block, at };
    }
    case "entry": {
      const { entry, block, at, index } = resolved;
      return { kind: entry, address, block, at, index };
    }
    default:
      return namesNothing(address);
  }
}

/** The root timeline of the tree a located timeline lies in. */
export function rootOf(at: Located): TimelineManifest {
  return at.parent === undefined ? at.timeline : rootOf(at.parent);
}
