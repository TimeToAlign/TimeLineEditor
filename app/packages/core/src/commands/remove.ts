/**
 * `remove`: blocks and elements, mixed. Every target is resolved before
 * anything is removed, so a target that goes with another is not refused. A
 * block goes with every block whose `parent` chain reaches it; an element
 * takes along what `withoutElements` says goes with it. A segment (a child of
 * a segment line) cannot be removed unless it goes with another target
 * (`segment_not_removable`): it would leave a gap in its segment line.
 */

import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import { elementAddress } from "../manifest/files.ts";
import { removedBy, withoutElements } from "../manifest/remove.ts";
import { isSegmentAt } from "../manifest/tree.ts";
import { qualify } from "../workspace/address.ts";
import type { BlockId } from "../workspace/blocks.ts";
import type { View } from "../workspace/view.ts";
import type { ChangeSet } from "./mutations.ts";
import { entryAt, record, withBlock } from "./mutations.ts";
import type { Target } from "./targets.ts";
import { rootOf, targetOf } from "./targets.ts";

/** The view without the blocks `removed` and every block whose `parent` chain reaches one. */
function withoutBlocks(view: View, removed: Set<BlockId>): View {
  let grown = true;
  while (grown) {
    grown = false;
    for (const block of Object.values(view.blocks)) {
      if (!removed.has(block.id) && block.parent !== null && removed.has(block.parent)) {
        removed.add(block.id);
        grown = true;
      }
    }
  }
  return {
    ...view,
    blocks: Object.fromEntries(Object.entries(view.blocks).filter(([id]) => !removed.has(id))),
  };
}

/** One element a `remove` names in a block's manifest. */
interface Removal {
  /** Its element address. */
  readonly element: string;
  /** For a segment, the segment line it lies in. */
  readonly line: string | null;
}

/**
 * The element address of a group, measure map, timeline or entry target;
 * `null` for the workspace or a block.
 */
function removalOf(target: Target): Removal | null {
  switch (target.kind) {
    case "workspace":
    case "block":
      return null;
    case "group":
      return { element: target.group.id, line: null };
    case "measure_map":
      return { element: target.map.id, line: null };
    case "root":
    case "child": {
      const { at } = target;
      const line = isSegmentAt(at) ? (at.parent?.timeline.id ?? null) : null;
      return { element: at.timeline.id, line };
    }
    default: {
      const entry = entryAt(target.at.timeline, target.kind, target.index);
      if (entry === undefined) throw new Error(`${target.address} names an entry`);
      return { element: elementAddress(rootOf(target.at).id, entry.id), line: null };
    }
  }
}

export function applyRemove(
  view: View,
  targets: readonly string[],
  changes: ChangeSet,
): View | CommandError {
  const blocks = new Set<BlockId>();
  const elements = new Map<BlockId, Removal[]>();
  for (const address of targets) {
    const target = targetOf(view, address);
    if (isCommandError(target)) return target;
    if (target.kind === "workspace") {
      return problem(ErrorCode.notRemovable, `${target.kind} cannot be removed`, [address]);
    }
    if (target.kind === "block") {
      blocks.add(target.block.id);
      continue;
    }
    const removal = removalOf(target);
    if (removal === null) continue;
    elements.set(target.block.id, [...(elements.get(target.block.id) ?? []), removal]);
  }
  for (const [id, list] of elements) {
    if (blocks.has(id)) continue;
    const manifest = view.blocks[id]?.manifest;
    if (manifest === undefined) continue;
    for (const [index, { element, line }] of list.entries()) {
      if (line === null) continue;
      const others = list.filter((_, other) => other !== index).map((item) => item.element);
      if (removedBy(manifest, others).has(element)) continue;
      return problem(
        ErrorCode.segmentNotRemovable,
        `Removing segment ${element} of line ${line} is not supported yet`,
        [qualify(id, element)],
      );
    }
  }
  let current = view;
  for (const [id, list] of elements) {
    const block = current.blocks[id];
    if (block === undefined || blocks.has(id)) continue;
    const manifest = withoutElements(
      block.manifest,
      list.map((item) => item.element),
    );
    record(changes, [id], id, true);
    current = withBlock(current, { ...block, manifest });
  }
  current = withoutBlocks(current, blocks);
  for (const id of Object.keys(view.blocks)) {
    if (current.blocks[id] === undefined) record(changes, [id], id);
  }
  return current;
}
