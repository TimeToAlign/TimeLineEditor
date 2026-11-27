/**
 * The Children tab of a timeline's children editor: the timeline's
 * children in the manifest's order, each a row that selects it on the
 * canvas, with its offset on the parent's axis and its length on its own.
 * What a child is edited with is what TiLiE already has for a selected
 * child: the Properties tab (name, offset, length), Delete, and a
 * double-click on it, which opens its own editors.
 */

import type { Address, Block, OpenEditor, TimelineManifest, View } from "@timetoalign/tilie-core";
import { copyValue, findTimeline, idAddress, inBlock, prettyUnit } from "@timetoalign/tilie-core";
import { axisCoordinate } from "@timetoalign/tilie-core/numbers";

/** One child of the edited timeline, as its row shows it. */
export interface ChildRow {
  readonly id: string;
  /** Its address in its block, which its row selects. */
  readonly address: Address;
  /** Its name, else its ID. */
  readonly name: string;
  /** Its offset on the parent's axis as Copy writes it, and the parent's unit. */
  readonly offset: string;
  readonly offsetUnit: string;
  /** Its length on its own axis as Copy writes it, empty where unknown, and its own unit. */
  readonly length: string;
  readonly unit: string;
}

/** What the Children tab shows of the children editor of a timeline. */
export interface ChildrenShown {
  readonly block: Block;
  readonly timeline: TimelineManifest;
  readonly rows: readonly ChildRow[];
}

/** A value of `timeline`'s axis as Copy writes it. */
function axisText(value: unknown, timeline: TimelineManifest): string {
  return copyValue(axisCoordinate(value, timeline).value, timeline.number_type);
}

/**
 * What the Children tab shows under `innermost`, the innermost open editor:
 * for a children editor of a timeline held by `view`, its children; `null`
 * at every other level.
 */
export function childrenOf(view: View, innermost: OpenEditor | undefined): ChildrenShown | null {
  if (innermost?.kind !== "children") return null;
  const { block: id, id: timelineId } = innermost.target;
  const block = id === undefined ? undefined : view.blocks[id];
  const timeline =
    block === undefined || timelineId === undefined
      ? undefined
      : findTimeline(block.manifest, timelineId);
  if (block === undefined || timeline === undefined) return null;
  return {
    block,
    timeline,
    rows: timeline.children.map((child) => ({
      id: child.id,
      address: inBlock(block.id, idAddress(child.id)),
      name: child.name ?? child.id,
      offset: axisText(child.offset, timeline),
      offsetUnit: prettyUnit(timeline.unit),
      length: child.length === null ? "" : axisText(child.length, child),
      unit: prettyUnit(child.unit),
    })),
  };
}
