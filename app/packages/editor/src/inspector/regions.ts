/**
 * The Regions tab: the regions of the selected timeline, and those of its
 * descendants under a heading for each, in the manifest's canonical order,
 * each row its name, its type (the class its `type` statement names), its
 * start and end on its timeline's axis and its ID. Every edit is one
 * command on the region's address: a `set` of its name, start or end, a
 * `remove`; "Add region" is one `add` of a region into the selected
 * timeline, whose ID is core's to give. An atomic section (TimeToShare's
 * class `tts:AtomicSection`, computed from the flow control) is read only.
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import { axisValueAt, typedValue } from "@timetoalign/tilie-arranger";
import type {
  AddCommand,
  Address,
  Block,
  Command,
  Manifest,
  Region,
  RemoveCommand,
  ResolvedAddress,
  TimelineManifest,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  assertNever,
  copyValue,
  idAddress,
  inBlock,
  isAtomicSection,
  prettyUnit,
} from "@timetoalign/tilie-core";
import { reachOf } from "@timetoalign/tilie-core/drawing";
import { axisCoordinate, Rational, realOf } from "@timetoalign/tilie-core/numbers";
import { ATOMIC_SECTION, expandIri } from "@timetoalign/timetoshare";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";

/** The word of the type of an atomic section. */
const ATOMIC_WORD = "Atomic section";

/** A field of a region's row. */
export type RegionField = "name" | "start" | "end";

/** One region of the tab: what its row shows and the commands it sends. */
export interface RegionRow {
  readonly id: string;
  /** Its address in its block. */
  readonly address: Address;
  /** The manifest it was read from, which its drafts belong to. */
  readonly manifest: Manifest;
  /** The timeline holding it, on whose axis its start and end lie. */
  readonly timeline: TimelineManifest;
  /** Its name; empty for none. */
  readonly name: string;
  /** The classes its `type` statement names, an atomic section's as "Atomic section"; empty for none. */
  readonly type: string;
  /** Its start and end as Copy writes them in its axis's number type. */
  readonly start: string;
  readonly end: string;
  /** Its axis's pretty unit. */
  readonly unit: string;
  /** An atomic section: shown, never edited. */
  readonly readOnly: boolean;
  /** Its removal; `null` for an atomic section. */
  readonly remove: RemoveCommand | null;
}

/** The regions of one timeline: the selected one's without a heading, a descendant's under its name. */
export interface RegionSection {
  /** The timeline's ID. */
  readonly timeline: string;
  /** Its name, else its ID; `null` for the selected timeline itself. */
  readonly heading: string | null;
  readonly rows: readonly RegionRow[];
}

/** What the Regions tab shows of a selection naming one timeline. */
export interface RegionsShown {
  readonly block: Block;
  /** The selected timeline. */
  readonly timeline: TimelineManifest;
  /** The selected timeline's section first, then each descendant's holding a region, in pre-order. */
  readonly sections: readonly RegionSection[];
  /** The IDs of the selected regions, whose rows are marked. */
  readonly selected: ReadonlySet<string>;
  /** The `add` of a region over the selected timeline; `null` where its extent fits no value of its axis. */
  readonly add: AddCommand | null;
}

/** What one subject names of a timeline: the timeline, and the region it is (or a part of), if any. */
interface Named {
  readonly timeline: TimelineManifest;
  readonly region: string | null;
}

/** The timeline `resolved` names as a timeline, its card or one of its bands, or the region it is; a part stands for its owner. */
function namedBy(resolved: ResolvedAddress): Named | null {
  switch (resolved.kind) {
    case "timeline":
    case "card":
    case "band":
      return { timeline: resolved.at.timeline, region: null };
    case "entry":
      return resolved.entry === "region"
        ? { timeline: resolved.at.timeline, region: resolved.element.id }
        : null;
    case "part":
      return namedBy(resolved.owner);
    case "workspace":
    case "block":
    case "title":
    case "frame":
    case "measure_map":
    case "timestamp":
    case "elision":
    case "matchstamp":
    case "anchor":
    case "flow_map":
    case "virtual_timeline":
    case "virtual_card":
    case "virtual_band":
    case "chunk":
      return null;
    default:
      return assertNever(resolved);
  }
}

/** The words of the classes `region`'s `type` statement names, joined by ", ". */
function typeWords(manifest: Manifest, region: Region): string {
  const context: unknown = manifest["@context"];
  return (region.statements?.type ?? [])
    .map((type) => ((expandIri(context, type) ?? type) === ATOMIC_SECTION ? ATOMIC_WORD : type))
    .join(", ");
}

/** A value of `timeline`'s axis as Copy writes it. */
function axisText(value: unknown, timeline: TimelineManifest): string {
  return copyValue(axisCoordinate(value, timeline).value, timeline.number_type);
}

/** The row of `region` of `timeline` in `block`. */
function rowOf(block: Block, timeline: TimelineManifest, region: Region): RegionRow {
  const { manifest } = block;
  const address = inBlock(block.id, idAddress(region.id));
  const readOnly = isAtomicSection(manifest, region);
  return {
    id: region.id,
    address,
    manifest,
    timeline,
    name: region.name ?? "",
    type: typeWords(manifest, region),
    start: axisText(region.start, timeline),
    end: axisText(region.end, timeline),
    unit: prettyUnit(timeline.unit),
    readOnly,
    remove: readOnly ? null : { type: "remove", targets: [address] },
  };
}

/** The sections of `timeline`'s descendants holding a region, in pre-order. */
function descendantSections(block: Block, timeline: TimelineManifest): RegionSection[] {
  return timeline.children.flatMap((child) => [
    ...(child.regions.length === 0
      ? []
      : [
          {
            timeline: child.id,
            heading: child.name ?? child.id,
            rows: child.regions.map((region) => rowOf(block, child, region)),
          },
        ]),
    ...descendantSections(block, child),
  ]);
}

/**
 * The `add` of a region over the whole of `timeline` in `block`: from 0 to
 * its length, or to its reach where its length is not known, as its axis
 * writes them. The region carries no ID: core gives it one. `null` where
 * the reach fits no value of the axis.
 */
export function addRegionCommand(block: Block, timeline: TimelineManifest): AddCommand | null {
  const start = axisValueAt(Rational.of(0n), timeline);
  const end =
    timeline.length === null
      ? axisValueAt(reachOf(timeline, block.manifest), timeline)
      : axisValueAt(realOf(axisCoordinate(timeline.length, timeline)), timeline);
  if (start === undefined || end === undefined) return null;
  return { type: "add", into: inBlock(block.id, idAddress(timeline.id)), region: { start, end } };
}

/**
 * What the Regions tab shows of `subjects`: when they lie in one block and
 * each names one and the same timeline, as the timeline, its card, one of
 * its bands or one of its regions (or a part of any of these), that
 * timeline's regions and its descendants'; `null` for no subject and for
 * any other selection.
 */
export function regionsOf(block: Block | null, subjects: readonly Subject[]): RegionsShown | null {
  if (block === null || subjects.length === 0) return null;
  const named = subjects.map((subject) => namedBy(subject.resolved));
  const [first] = named;
  if (first === undefined || first === null) return null;
  if (named.some((item) => item?.timeline.id !== first.timeline.id)) return null;
  const { timeline } = first;
  const selected = new Set(
    named.flatMap((item) => (item === null || item.region === null ? [] : [item.region])),
  );
  return {
    block,
    timeline,
    sections: [
      {
        timeline: timeline.id,
        heading: null,
        rows: timeline.regions.map((region) => rowOf(block, timeline, region)),
      },
      ...descendantSections(block, timeline),
    ],
    selected,
    add: addRegionCommand(block, timeline),
  };
}

/** The `set` of `values` on `row`'s region. */
function setOf(row: RegionRow, values: { readonly [property: string]: unknown }): Command {
  return { type: "set", changes: [{ target: row.address, values }] };
}

/**
 * The command `text` typed into `field` of `row` gives: one `set` of the
 * region's name (an empty text unstates it) or of its start or end, read
 * exactly in its axis's number type; `null` where the text is what the row
 * shows; refused before dispatch where the text spells no value of the
 * axis, at `[<address key>, field]`. The store's checks decide the rest
 * (an end before the start, a value outside the timeline).
 */
export function regionFieldCommand(
  row: RegionRow,
  field: RegionField,
  text: string,
): Result<Command | null> {
  if (field === "name") {
    if (text === row.name) return { ok: true, value: null };
    return { ok: true, value: setOf(row, { name: text === "" ? null : text }) };
  }
  const trimmed = text.trim();
  if (trimmed === row[field]) return { ok: true, value: null };
  const value = typedValue(trimmed, row.timeline);
  if (typeof value === "string") {
    return refused(InspectorCode.invalidValue, value, [addressKey(row.address), field]);
  }
  return { ok: true, value: setOf(row, { [field]: value }) };
}
