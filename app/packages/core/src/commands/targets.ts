/**
 * What a command is aimed at. An address resolves (`resolveAddress`) to one
 * target, and the target's kind decides what a command may do with it: which
 * properties a `set` gives it, what an `add` puts into it, whether a
 * `remove` takes it.
 */

import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { EntryKind } from "../manifest/files.ts";
import type { Located } from "../manifest/tree.ts";
import type { Group, TimelineManifest } from "../manifest/types.ts";
import type { Address } from "../workspace/address.ts";
import { resolveAddress } from "../workspace/address.ts";
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

/** A map, region, break, jump or marker of a block's manifest. */
export interface EntryTarget {
  readonly kind: EntryKind;
  readonly address: Address;
  readonly block: Block;
  /** The timeline listing the entry. */
  readonly at: Located;
  /** Its index in that timeline's list of its kind. */
  readonly index: number;
}

export type Target = WorkspaceTarget | BlockTarget | GroupTarget | TimelineTarget | EntryTarget;
export type TargetKind = Target["kind"];

/** The target of each kind, the type each kind's table of setters reads. */
export interface TargetOfKind {
  readonly workspace: WorkspaceTarget;
  readonly block: BlockTarget;
  readonly group: GroupTarget;
  readonly root: TimelineTarget;
  readonly child: TimelineTarget;
  readonly map: EntryTarget;
  readonly region: EntryTarget;
  readonly break: EntryTarget;
  readonly jump: EntryTarget;
  readonly marker: EntryTarget;
}

/**
 * The target an address names in `view`: `unknown_target` for a title, a
 * card, a band, a part, and a block named through its manifest's id.
 */
export function targetOf(view: View, address: Address): Target | CommandError {
  const resolved = resolveAddress(view, address);
  if (isCommandError(resolved)) return resolved;
  switch (resolved.kind) {
    case "workspace":
      return { kind: "workspace", address };
    case "block":
      // `<block>/<manifest id>` names the block for a reader; a command aims at the block's own address.
      return address === resolved.block.id
        ? { kind: "block", address, block: resolved.block }
        : problem(ErrorCode.unknownTarget, `${address} names nothing`, [address]);
    case "frame":
      return { kind: "group", address, block: resolved.block, group: resolved.group };
    case "timeline": {
      const { at, block } = resolved;
      return { kind: at.parent === undefined ? "root" : "child", address, block, at };
    }
    case "entry": {
      const { entry, block, at, index } = resolved;
      return { kind: entry, address, block, at, index };
    }
    default:
      return problem(ErrorCode.unknownTarget, `${address} names nothing`, [address]);
  }
}

/** The root timeline of the tree a located timeline lies in. */
export function rootOf(at: Located): TimelineManifest {
  return at.parent === undefined ? at.timeline : rootOf(at.parent);
}
