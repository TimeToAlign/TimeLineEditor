/** Block ids, element ids and addresses. */

import type { TimelineClass } from "@timetoalign/timeskeleton";
import type { Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import type { Manifest, TimelineManifest } from "../manifest/types.ts";
import type { BlockId } from "./blocks.ts";
import { BLOCK_ID } from "./blocks.ts";
import type { View } from "./view.ts";

declare const crypto: { getRandomValues(bytes: Uint8Array): Uint8Array };

const ID_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A fresh block id: ten random base-36 characters, so concurrent peers never collide. */
export function mintBlockId(
  fill: (bytes: Uint8Array) => void = (bytes) => crypto.getRandomValues(bytes),
): BlockId {
  let id = "";
  const byte = new Uint8Array(1);
  while (id.length < 10) {
    fill(byte);
    const value = byte[0] as number;
    if (value < 252) id += ID_DIGITS[value % 36];
  }
  return id;
}

export const TIMELINE_PREFIX = {
  ContinuousLogicalTimeline: "clt",
  DiscreteLogicalTimeline: "dlt",
  ContinuousPhysicalTimeline: "cpt",
  DiscretePhysicalTimeline: "dpt",
  ContinuousGraphicalTimeline: "cgt",
  DiscreteGraphicalTimeline: "dgt",
} as const satisfies Readonly<Record<TimelineClass, string>>;

export type TimelinePrefix = (typeof TIMELINE_PREFIX)[TimelineClass];

/** Every id a manifest's elements carry, whatever their kind. */
export function manifestIds(manifest: Manifest): Set<string> {
  const ids = new Set<string>();
  const visit = (timeline: TimelineManifest): void => {
    ids.add(timeline.id);
    const { breaks, jumps, markers } = timeline.flow_control;
    for (const items of [timeline.conversion_maps, timeline.regions, breaks, jumps, markers]) {
      for (const item of items) ids.add(item.id);
    }
    for (const child of Object.values(timeline.children)) visit(child.timeline);
  };
  visit(manifest.timeline);
  return ids;
}

/** The smallest `{prefix}_{N}`, `N` from 1, that no element of the block's manifest carries. */
export function nextId(view: View, block: BlockId, prefix: string): string {
  const manifest = view.blocks[block]?.manifest;
  const ids = manifest === undefined ? new Set<string>() : manifestIds(manifest);
  let suffix = 1;
  while (ids.has(`${prefix}_${suffix}`)) suffix += 1;
  return `${prefix}_${suffix}`;
}

/**
 * The workspace-wide name of what a command targets: `workspace`, a block
 * id, or `<block id>/<element id>`, split at the first slash.
 */
export type Address = string;

export const WORKSPACE = "workspace";

export interface ParsedAddress {
  /** `null` for the workspace. */
  readonly block: BlockId | null;
  /** `null` for the workspace or a block. */
  readonly element: string | null;
}

export function parseAddress(text: Address): ParsedAddress | Problem {
  if (text === WORKSPACE) return { block: null, element: null };
  const slash = text.indexOf("/");
  const block = slash < 0 ? text : text.slice(0, slash);
  const element = slash < 0 ? null : text.slice(slash + 1);
  if (!BLOCK_ID.test(block)) {
    return problem(ErrorCode.invalidAddress, "an address is workspace or starts with a block id", [
      text,
    ]);
  }
  if (element === "") {
    return problem(ErrorCode.invalidAddress, "an address element cannot be empty", [text]);
  }
  return { block, element };
}

export function formatAddress(value: ParsedAddress): Address {
  if (value.block === null) return WORKSPACE;
  return value.element === null ? value.block : `${value.block}/${value.element}`;
}
