/** Record ids, timeline-id prefixes and canvas addresses. */

import type { TimelineClass } from "@timetoalign/timeskeleton";
import type { Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import type { Manifest, TimelineManifest } from "../manifest/types.ts";
import type { RecordId, Address as WorkspaceAddress } from "./records.ts";

declare const crypto: { getRandomValues(bytes: Uint8Array): Uint8Array };

export const RECORD_ID = /^[0-9a-z]{10}$/;
const ID_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

export function mintRecordId(
  fill: (bytes: Uint8Array) => void = (bytes) => crypto.getRandomValues(bytes),
): RecordId {
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

export function mintTimelineId(manifest: Manifest, prefix: TimelinePrefix): string {
  const ids = new Set<string>();
  const visit = (timeline: TimelineManifest): void => {
    ids.add(timeline.id);
    for (const child of Object.values(timeline.children)) visit(child.timeline);
  };
  visit(manifest.timeline);
  let suffix = 1;
  while (ids.has(`${prefix}${suffix}`)) suffix += 1;
  return `${prefix}${suffix}`;
}

export type Address = WorkspaceAddress;

export function parseAddress(
  text: Address,
): { readonly record: RecordId; readonly element: string | null } | Problem {
  const slash = text.indexOf("/");
  const record = slash < 0 ? text : text.slice(0, slash);
  const element = slash < 0 ? null : text.slice(slash + 1);
  if (!RECORD_ID.test(record)) {
    return problem(ErrorCode.invalidAddress, "an address must start with a valid record id", []);
  }
  if (element === "") {
    return problem(ErrorCode.invalidAddress, "an address element cannot be empty", []);
  }
  return { record, element };
}

export function formatAddress(value: {
  readonly record: RecordId;
  readonly element: string | null;
}): Address {
  return value.element === null ? value.record : `${value.record}/${value.element}`;
}
