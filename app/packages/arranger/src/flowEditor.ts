/**
 * The flow subeditor's model: the FlowMaps of the edited root as rows, what
 * a drop on the new FlowMap's row lands as, and the commands each of its
 * actions stores. Pure: it reads views and manifests and builds commands;
 * the canvas dispatches them (`flowEditor.svelte.ts`).
 */

import type {
  AxisValue,
  Block,
  BlockId,
  Command,
  FlowMap,
  Granularity,
  Manifest,
  PlaceKey,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  findTimeline,
  idAddress,
  inBlock,
  isComputedFlowMap,
  parseAxisValue,
  snapOnRow,
  timelineAxisOf,
} from "@timetoalign/tilie-core";
import { exactCoordinate, Rational, toAxisValue, toFloat } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { DescriptorSource } from "@timetoalign/tilie-writers";
import { cardAxisAt } from "./cardAxis.ts";
import { placeChanges, placeCommand } from "./items.ts";

/** One entry of a FlowMap's `chunks`: the ID of a Region, a child or a virtual timeline, or a gap. */
export type FlowEntry = FlowMap["chunks"][number];

/** What a chip on a row's head says: its convention, that it is canonical, how it was made, its findings. */
export type ChipKind = "convention" | "canonical" | "provenance" | "findings";

/** A chip on a row's head: its kind, its text and the sentence it stands for. */
export interface FlowChip {
  readonly kind: ChipKind;
  readonly text: string;
  readonly title: string;
}

/**
 * What playing flow control found for each convention, by convention: the
 * server's sentences (`POST /api/flows`). Without a server none is known.
 */
export type FlowFindings = ReadonlyMap<string, readonly string[]>;

/** No findings known. */
export const NO_FINDINGS: FlowFindings = new Map();

/** One row of the pane: a FlowMap of the edited root. */
export interface FlowRow {
  /** The FlowMap's ID. */
  readonly id: string;
  /** Its name; else its convention; else its ID. */
  readonly name: string;
  /** Computed from flow control (a convention and an inferred provenance): read only, recomputed on request. */
  readonly computed: boolean;
  readonly chips: readonly FlowChip[];
  /**
   * The virtual timeline giving its axis to the root, the first in the
   * manifest's order that applies it to the root without `through`; `null`
   * where none does.
   */
  readonly virtual: string | null;
  readonly entries: readonly FlowEntry[];
}

/** The FlowMaps of `manifest` whose timeline is `root`, in the manifest's order. */
export function flowMapsOf(manifest: Manifest, root: string): readonly FlowMap[] {
  return (manifest.flow_maps ?? []).filter((flowMap) => flowMap.timeline === root);
}

/**
 * The virtual timeline of `manifest` that gives the FlowMap `flowMap` its
 * axis on its root `root`: the first applying it to `root` without
 * `through`; `null` where none does.
 */
export function virtualOf(manifest: Manifest, root: string, flowMap: string): string | null {
  const found = (manifest.virtual_timelines ?? []).find(
    (item) => item.map === flowMap && item.timeline === root && item.through === undefined,
  );
  return found?.id ?? null;
}

/** The chips of a FlowMap: its convention, canonical, its provenance's methods, its findings. */
function chipsOf(flowMap: FlowMap, findings: FlowFindings): FlowChip[] {
  const chips: FlowChip[] = [];
  const { convention } = flowMap;
  if (convention !== undefined && convention !== null) {
    chips.push({ kind: "convention", text: convention, title: `Convention: ${convention}` });
  }
  if (flowMap.canonical === true) {
    chips.push({
      kind: "canonical",
      text: "canonical",
      title: "The canonical reading of its root",
    });
  }
  const methods = [...new Set((flowMap.provenance ?? []).map((entry) => entry.method))];
  if (methods.length > 0) {
    chips.push({
      kind: "provenance",
      text: methods.join(", "),
      title: `Provenance: ${methods.join(", ")}`,
    });
  }
  const found = convention === undefined || convention === null ? [] : findings.get(convention);
  if (found !== undefined && found.length > 0) {
    chips.push({
      kind: "findings",
      text: `${found.length} ${found.length === 1 ? "finding" : "findings"}`,
      title: found.join("\n"),
    });
  }
  return chips;
}

/**
 * The rows of the pane of the flow editor of `root`: one per FlowMap of
 * `root`, the computed ones first, each part in the manifest's order.
 */
export function flowRows(
  manifest: Manifest,
  root: string,
  findings: FlowFindings = NO_FINDINGS,
): readonly FlowRow[] {
  const rows = flowMapsOf(manifest, root).map(
    (flowMap): FlowRow => ({
      id: flowMap.id,
      name: flowMap.name ?? flowMap.convention ?? flowMap.id,
      computed: isComputedFlowMap(flowMap),
      chips: chipsOf(flowMap, findings),
      virtual: virtualOf(manifest, root, flowMap.id),
      entries: flowMap.chunks,
    }),
  );
  return [...rows.filter((row) => row.computed), ...rows.filter((row) => !row.computed)];
}

/** A value of a manifest's own axis as text: an integer or float as written, a fraction `n/d`. */
function valueText(value: AxisValue): string {
  if (Array.isArray(value)) {
    const [numerator, denominator] = value as readonly unknown[];
    return String(denominator) === "1" ? String(numerator) : `${numerator}/${denominator}`;
  }
  return String(value);
}

/** Every timeline of `root`'s tree, `root` first, then its descendants in pre-order. */
function treeOf(root: TimelineManifest): TimelineManifest[] {
  return [root, ...root.children.flatMap(treeOf)];
}

/**
 * The text naming an entry: a Region's name, else its ID; a timeline's or
 * a virtual timeline's name, else its ID; a gap `gap <length>`.
 */
export function entryText(manifest: Manifest, entry: FlowEntry): string {
  if (typeof entry !== "string") return `gap ${valueText(entry.gap)}`;
  for (const timeline of manifest.timelines.flatMap(treeOf)) {
    if (timeline.id === entry) return timeline.name ?? entry;
    const region = timeline.regions.find((item) => item.id === entry);
    if (region !== undefined) return region.name ?? entry;
  }
  const virtual = (manifest.virtual_timelines ?? []).find((item) => item.id === entry);
  return virtual?.name ?? entry;
}

/** Whether the region states the type `tts:AtomicSection`. */
function isAtomic(region: TimelineManifest["regions"][number]): boolean {
  const types = (region.statements as { readonly type?: unknown } | undefined)?.type;
  return Array.isArray(types) && types.includes("tts:AtomicSection");
}

/** What the card offers to the new FlowMap without a pointer: one choice of the keyboard's list. */
export interface CardChoice {
  readonly dragged: Dragged;
  readonly text: string;
}

/**
 * What the edited card offers to the new FlowMap, in the order a keyboard
 * walks it: the whole root (as a Region over it), then each timeline of the
 * root's tree in pre-order with its Regions in the manifest's order (an
 * atomic section so named), each child after its parent's Regions.
 */
export function cardChoices(manifest: Manifest, root: string): readonly CardChoice[] {
  const timeline = manifest.timelines.find((item) => item.id === root);
  if (timeline === undefined) return [];
  const choices: CardChoice[] = [
    { dragged: { kind: "root" }, text: `${timeline.name ?? root} (the whole timeline)` },
  ];
  for (const member of treeOf(timeline)) {
    if (member !== timeline) {
      choices.push({ dragged: { kind: "element", id: member.id }, text: member.name ?? member.id });
    }
    for (const region of member.regions) {
      const name = region.name ?? region.id;
      choices.push({
        dragged: { kind: "element", id: region.id },
        text: isAtomic(region) ? `${name} (atomic section)` : name,
      });
    }
  }
  return choices;
}

/**
 * What is dragged into the new FlowMap: an entry of a row (it lands as
 * itself, its source), a Region or child timeline of the root's tree from
 * the card, the card's own line (the whole root), a whole row (the virtual
 * timeline its FlowMap gives), or a stretch swept on a line of the card (a
 * new Region of that line's timeline).
 */
export type Dragged =
  | {
      readonly kind: "entry";
      readonly entry: FlowEntry;
      readonly from: { readonly flowMap: string; readonly index: number } | null;
    }
  | { readonly kind: "element"; readonly id: string }
  | { readonly kind: "root" }
  | { readonly kind: "row"; readonly flowMap: string }
  | {
      readonly kind: "sweep";
      readonly timeline: string;
      readonly start: AxisValue;
      readonly end: AxisValue;
    };

/** Whether two axis values are the same value as written. */
function sameValue(left: AxisValue, right: AxisValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Whether `value` is 0 as written. */
const isZero = (value: AxisValue): boolean =>
  Array.isArray(value) ? String(value[0]) === "0" : Number(value) === 0;

/**
 * The Region of the root `timeline` spanning it whole, the first in its
 * order; `null` where none does.
 */
function wholeRegionOf(timeline: TimelineManifest): string | null {
  const { length } = timeline;
  if (length === null) return null;
  const found = timeline.regions.find(
    (region) => isZero(region.start) && sameValue(region.end, length),
  );
  return found?.id ?? null;
}

/**
 * What a drop of `dragged` writes before it lands, in block `block`'s
 * manifest, `root` the edited root: a Region over the whole root for the
 * root's line (none where one spans it already: it lands as that one), the
 * swept Region, the virtual timeline of a row (none where one gives its
 * axis); `null` where it lands as it is. A root of unknown length has no
 * Region over it, and nothing lands.
 */
export function writeFor(block: Block, root: string, dragged: Dragged): Command | null {
  const into = inBlock(block.id, idAddress(root));
  const { manifest } = block;
  switch (dragged.kind) {
    case "entry":
    case "element":
      return null;
    case "root": {
      const timeline = manifest.timelines.find((item) => item.id === root);
      if (timeline === undefined || timeline.length === null) return null;
      if (wholeRegionOf(timeline) !== null) return null;
      const zero = exactCoordinate(Rational.fromParts(0n, 1n), timeline.unit, timeline.number_type);
      if (zero === undefined) return null;
      return { type: "add", into, region: { start: toAxisValue(zero), end: timeline.length } };
    }
    case "sweep":
      return {
        type: "add",
        into: inBlock(block.id, idAddress(dragged.timeline)),
        region: { start: dragged.start, end: dragged.end },
      };
    case "row":
      if (virtualOf(manifest, root, dragged.flowMap) !== null) return null;
      return {
        type: "add",
        into: { block: block.id },
        virtual_timeline: { map: dragged.flowMap, timeline: root },
      };
    default:
      return assertNoDragged(dragged);
  }
}

function assertNoDragged(dragged: never): never {
  throw new Error(`no such drag: ${JSON.stringify(dragged)}`);
}

/**
 * The one ID `after` lists that `before` does not: the element a command
 * added, read through its result; `null` where there is not exactly one.
 */
export function addedId(
  before: readonly { readonly id: string }[],
  after: readonly { readonly id: string }[],
): string | null {
  const known = new Set(before.map((item) => item.id));
  const added = after.filter((item) => !known.has(item.id));
  return added.length === 1 ? (added[0]?.id ?? null) : null;
}

/** Every Region of `manifest`'s trees. */
function regionsOf(manifest: Manifest): readonly { readonly id: string }[] {
  return manifest.timelines.flatMap(treeOf).flatMap((timeline) => timeline.regions);
}

/**
 * The entry `dragged` lands as, read in `after`, the manifest once
 * `writeFor`'s command (if any) has been stored on `before`: an entry as
 * itself, a Region or child by its ID, the root as the Region spanning it,
 * a swept stretch as the Region written for it, a row as the virtual
 * timeline giving its axis. `null` where nothing was written for it.
 */
export function landedEntry(
  before: Manifest,
  after: Manifest,
  root: string,
  dragged: Dragged,
): FlowEntry | null {
  switch (dragged.kind) {
    case "entry":
      return dragged.entry;
    case "element":
      return dragged.id;
    case "root": {
      const timeline = after.timelines.find((item) => item.id === root);
      return timeline === undefined ? null : wholeRegionOf(timeline);
    }
    case "sweep":
      return addedId(regionsOf(before), regionsOf(after));
    case "row":
      return virtualOf(after, root, dragged.flowMap);
    default:
      return assertNoDragged(dragged);
  }
}

/** `entries` with `entry` inserted before index `index` (at the end beyond it). */
export function inserted(
  entries: readonly FlowEntry[],
  index: number,
  entry: FlowEntry,
): readonly FlowEntry[] {
  const at = Math.max(0, Math.min(index, entries.length));
  return [...entries.slice(0, at), entry, ...entries.slice(at)];
}

/**
 * `entries` with the entry at `from` moved to land before index `to`
 * (counted in `entries` as they are, so `to` = `from` or `from + 1` leaves
 * them as they are), or copied there where `duplicate` (Alt).
 */
export function moved(
  entries: readonly FlowEntry[],
  from: number,
  to: number,
  duplicate: boolean,
): readonly FlowEntry[] {
  const entry = entries[from];
  if (entry === undefined) return entries;
  if (duplicate) return inserted(entries, to, entry);
  const without = [...entries.slice(0, from), ...entries.slice(from + 1)];
  return inserted(without, to > from ? to - 1 : to, entry);
}

/** `entries` without the entry at `index`. */
export function removedAt(entries: readonly FlowEntry[], index: number): readonly FlowEntry[] {
  return entries.filter((_, at) => at !== index);
}

/**
 * The command that stores the new FlowMap's `entries`: its `add` into the
 * root, for a FlowMap not yet written (`flowMap` null), its ID given by the
 * store; a `set` of its `chunks` once it is.
 */
export function draftCommand(
  block: BlockId,
  root: string,
  flowMap: string | null,
  entries: readonly FlowEntry[],
): Command {
  if (flowMap === null) {
    return { type: "add", into: inBlock(block, idAddress(root)), flow_map: { chunks: entries } };
  }
  return {
    type: "set",
    changes: [{ target: inBlock(block, idAddress(flowMap)), values: { chunks: entries } }],
  };
}

/**
 * The `set` placing the card of the virtual timeline `virtual` of `block`
 * at `(x, y)`, place coordinates of the block, drawn as `drawing`: its
 * place alone (`placeCommand`). The flow editor changes no other item's
 * place; the card is drawn after the ungrouped roots, so none of them
 * moves.
 */
export function placeVirtualCommand(
  block: Block,
  drawing: Drawing,
  virtual: string,
  x: number,
  y: number,
): Command {
  return placeCommand(block, drawing, placeChanges([[{ item: virtual }, { x, y }]]), false);
}

/**
 * The gap length typed as `text` on the axis of `root`, exact, as the
 * manifest writes it there (`parseAxisValue`): a decimal on a fraction axis
 * the value it denotes, on a float axis the nearest double; a message where
 * none fits or the length is not positive.
 */
export function gapValue(text: string, root: TimelineManifest): AxisValue | string {
  const parsed = parseAxisValue(text, root.number_type);
  if (!(parsed instanceof Rational)) return parsed.message;
  if (parsed.numerator <= 0n) return `a gap is longer than 0: ${text.trim()}`;
  const value = root.number_type === "float" ? toFloat(parsed) : parsed;
  const exact = exactCoordinate(value, root.unit, root.number_type);
  return exact === undefined
    ? `${text.trim()} is no ${root.number_type} value of '${root.id}'`
    : toAxisValue(exact);
}

/** The timeline `id` of `manifest` at any depth; `undefined` where none is. */
export function timelineIn(manifest: Manifest, id: string): TimelineManifest | undefined {
  return findTimeline(manifest, id);
}

/**
 * The commands writing the flows the server computed for `root` (the
 * manifest `answer` of `POST /api/flows/flow-maps`) into `manifest`, block
 * `block`'s: each atomic section of `answer`'s root that `manifest` lacks
 * (by ID) added as a Region; for each computed FlowMap of `answer`'s root,
 * nothing where `manifest` holds a computed FlowMap of that convention with
 * the same chunks, else that one given `answer`'s chunks and provenance
 * (`set {computed}`, which writes the length of every virtual timeline
 * playing it), and where it holds none, `answer`'s added with its own ID,
 * name, convention, canonical and provenance.
 */
export function recomputeCommands(
  manifest: Manifest,
  block: BlockId,
  root: string,
  answer: Manifest,
): readonly Command[] {
  const into = inBlock(block, idAddress(root));
  const answered = answer.timelines.find((item) => item.id === root);
  const current = manifest.timelines.find((item) => item.id === root);
  if (answered === undefined || current === undefined) return [];
  const known = new Set(current.regions.map((region) => region.id));
  const commands: Command[] = answered.regions
    .filter((region) => isAtomic(region) && !known.has(region.id))
    .map((region) => ({ type: "add", into, region }));
  const held = flowMapsOf(manifest, root).filter(isComputedFlowMap);
  for (const flowMap of flowMapsOf(answer, root).filter(isComputedFlowMap)) {
    const same = held.find((item) => item.convention === flowMap.convention);
    if (same !== undefined && JSON.stringify(same.chunks) === JSON.stringify(flowMap.chunks)) {
      continue;
    }
    const { id, chunks, name, convention, canonical, provenance } = flowMap;
    if (same !== undefined) {
      commands.push({
        type: "set",
        changes: [
          {
            target: inBlock(block, idAddress(same.id)),
            values: { computed: { chunks, provenance } },
          },
        ],
      });
      continue;
    }
    commands.push({
      type: "add",
      into,
      flow_map: {
        id: (manifest.flow_maps ?? []).some((item) => item.id === id) ? undefined : id,
        chunks,
        ...(name === undefined ? {} : { name }),
        ...(convention === undefined ? {} : { convention }),
        ...(canonical === undefined ? {} : { canonical }),
        ...(provenance === undefined ? {} : { provenance }),
      },
    });
  }
  return commands;
}

/** The view's block `block`; throws where the view holds none. */
export function blockOfView(view: View, block: BlockId): Block {
  const found = view.blocks[block];
  if (found === undefined) throw new RangeError(`the view holds no block ${block}`);
  return found;
}

/** Whether `id` names a timeline of `root`'s tree in `manifest`, `root` itself included. */
function inTree(manifest: Manifest, root: string, id: string): boolean {
  const timeline = manifest.timelines.find((item) => item.id === root);
  return timeline !== undefined && treeOf(timeline).some((item) => item.id === id);
}

/** Whether `id` names a Region of a timeline of `root`'s tree. */
function regionInTree(manifest: Manifest, root: string, id: string): boolean {
  const timeline = manifest.timelines.find((item) => item.id === root);
  return (
    timeline !== undefined &&
    treeOf(timeline).some((member) => member.regions.some((region) => region.id === id))
  );
}

/**
 * What a press on the drawn element `source` of the edited card carries
 * into the new FlowMap, `root` the edited root: a Region of its tree (its
 * brace or its label) that Region; a child's line that child; the root's
 * own line the whole root; with `sweep` (Shift) the root's or a child's
 * line a stretch swept on it, read by `sweptValue` as the pointer moves
 * (`{kind: "line"}`); `null` for anything else, which the canvas keeps.
 */
export function cardPress(
  manifest: Manifest,
  root: string,
  source: DescriptorSource | null,
  sweep: boolean,
): Dragged | { readonly kind: "line"; readonly timeline: string } | null {
  if (source === null || source.role !== "primary") return null;
  const { address, type } = source;
  const id = address.id;
  if (id === undefined || address.facet !== undefined) return null;
  const line = (type === "timeline" || type === "child") && address.part === undefined;
  if (line && inTree(manifest, root, id)) {
    if (sweep) return { kind: "line", timeline: id };
    return id === root ? { kind: "root" } : { kind: "element", id };
  }
  if (sweep) return null;
  const brace = type === "region" && address.part === undefined;
  const label = type === "label" && address.part?.length === 1 && address.part[0] === "label";
  if ((brace || label) && regionInTree(manifest, root, id)) return { kind: "element", id };
  return null;
}

/**
 * The value of `timeline`'s own axis at the abscissa `x` of the card `card`
 * of `block`, drawn as `drawing`, exact in the timeline's number type: the
 * simplest value within half a screen pixel (`pixel`, block units per
 * screen pixel) at `granularity` (core's `snapOnRow`), as the manifest
 * writes it; `null` off the axis or inside a gap.
 */
export function sweptValue(
  block: Block,
  drawing: Drawing,
  card: PlaceKey,
  timeline: string,
  x: number,
  pixel: number,
  granularity: Granularity,
): AxisValue | null {
  const axis = cardAxisAt(block.manifest, drawing, card);
  const found = findTimeline(block.manifest, timeline);
  const p = axis?.valueAt(timeline, x) ?? null;
  const q = axis?.valueAt(timeline, x + pixel) ?? null;
  if (axis === null || found === undefined || p === null || q === null) return null;
  const h = Math.abs(q - p) / 2;
  if (!(h > 0)) return null;
  const spec = {
    block: block.id,
    granularity,
    anchor: timelineAxisOf(found, []),
    members: [],
  };
  const snapped = snapOnRow(spec, { timeline, map: null }, p, h, "no_server");
  const value = found.number_type === "float" ? toFloat(snapped) : snapped;
  const exact = exactCoordinate(value, found.unit, found.number_type);
  return exact === undefined ? null : toAxisValue(exact);
}

/** Whether `left` lies before `right` on one axis, both as the manifest writes them. */
export function before(left: AxisValue, right: AxisValue): boolean {
  const value = (written: AxisValue): number =>
    Array.isArray(written) ? Number(written[0]) / Number(written[1]) : Number(written);
  return value(left) < value(right);
}
