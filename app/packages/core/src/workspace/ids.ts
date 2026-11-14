/**
 * Minting block ids, the next free element id of a manifest, and the prefix
 * of a minted timeline id by its timeline class.
 */

import type { TimelineClass } from "../manifest/elements.ts";
import type { BlockId } from "./blocks.ts";

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

/**
 * The smallest `{prefix}_{N}`, `N` counted from 1, that `taken` does not
 * hold: the ID an element added to a manifest is given, `taken` being the
 * manifest's IDs (`manifestIds`).
 */
export function nextId(prefix: string, taken: ReadonlySet<string>): string {
  let suffix = 1;
  while (taken.has(`${prefix}_${suffix}`)) suffix += 1;
  return `${prefix}_${suffix}`;
}
