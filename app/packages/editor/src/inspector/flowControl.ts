/**
 * The Flow control tab of a root's flow-control editor: the flow-control
 * elements of the root's tree, each a row that selects it on the canvas,
 * and the adding of one. An element is added as one `add` of a complete
 * element of one of the five roles core admits (Jump, JumpTarget, Break,
 * SectionBreak, Barline), as a source notates it (`FLOW_KINDS`: a repeat
 * start, a repeat end, a volta bracket's start, a segno, a coda, a da
 * capo, a fine, a section break, a double or final barline, or a plain
 * element of its role), into a timeline of the tree at a position typed on
 * that timeline's axis, proposed from the selection (`proposedPosition`).
 * Its ID is core's to give; the added element is read through the result
 * (`addedFlowElement`), so the tab selects it at once, and the Properties
 * tab edits its name, label and belief. Whether the element holds with the
 * others (one Jump at one position of the tree, a destination inside the
 * timeline) is the store's check.
 */

import { typedValue } from "@timetoalign/tilie-arranger";
import type {
  AddCommand,
  Address,
  Block,
  ElementAddress,
  FlowControlElement,
  Manifest,
  OpenEditor,
  ResolvedElement,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  assertNever,
  copyValue,
  elementAddressOf,
  entryWord,
  findTimeline,
  idAddress,
  inBlock,
  isElementAddress,
  prettyUnit,
  resolveElement,
} from "@timetoalign/tilie-core";
import { axisCoordinate } from "@timetoalign/tilie-core/numbers";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";

/** A kind of flow-control element the tab adds: its word, its role and how it is notated. */
export interface FlowKind {
  /** The kind's key, the value of its option. */
  readonly key: string;
  /** Its word in the list, capitalised. */
  readonly label: string;
  readonly role: FlowControlElement["role"];
  /** The element's manifestation, or for a Jump its one destination's; absent for a plain element. */
  readonly manifestation?: string;
  /** A Jump's one destination: without a place (the nearest section break before it), or the timeline's start. */
  readonly to?: "nowhere" | "start";
}

/**
 * The kinds the tab adds, in the list's order: each is one complete element
 * that holds alone, written as a loader writes it. A Jump has one
 * destination, taken once (`repeat_count` 1), as a repeat end, a da capo
 * and a dal segno are: a repeat end and a plain Jump without a place, so
 * that it lands at the nearest section break before it or the timeline's
 * start; a da capo at the timeline's start. Every other role has no keys
 * but its manifestation.
 */
export const FLOW_KINDS: readonly FlowKind[] = [
  {
    key: "repeat_start",
    label: "Repeat start",
    role: "jump_target",
    manifestation: "repeat_start",
  },
  {
    key: "repeat_end",
    label: "Repeat end",
    role: "jump",
    manifestation: "repeat_end",
    to: "nowhere",
  },
  { key: "volta", label: "Volta bracket start", role: "jump_target", manifestation: "volta" },
  { key: "segno", label: "Segno", role: "jump_target", manifestation: "segno" },
  { key: "coda", label: "Coda", role: "jump_target", manifestation: "coda" },
  { key: "da_capo", label: "Da capo", role: "jump", manifestation: "da_capo", to: "start" },
  { key: "fine", label: "Fine", role: "break", manifestation: "fine" },
  { key: "section_break", label: "Section break", role: "section_break" },
  {
    key: "double_barline",
    label: "Double barline",
    role: "barline",
    manifestation: "double_barline",
  },
  { key: "final_barline", label: "Final barline", role: "barline", manifestation: "final_barline" },
  { key: "jump", label: "Jump", role: "jump", to: "nowhere" },
  { key: "jump_target", label: "Jump target", role: "jump_target" },
  { key: "break", label: "Break", role: "break" },
  { key: "barline", label: "Barline", role: "barline" },
];

/** One timeline of the edited root's tree, as the tab offers it: its ID and its words. */
export interface FlowTimeline {
  readonly id: string;
  /** Its name, else its ID. */
  readonly label: string;
  /** Its axis's pretty unit. */
  readonly unit: string;
}

/** One flow-control element of the tree, as its row shows it. */
export interface FlowRow {
  readonly id: string;
  /** Its address in its block, which its row selects. */
  readonly address: Address;
  /** The word of its role (`jump`, `jump target`, …), capitalised, with its manifestation. */
  readonly words: string;
  /** Its name, else its label, else its ID. */
  readonly name: string;
  /** Its coordinate as Copy writes it, and the unit of the timeline holding it. */
  readonly position: string;
  readonly unit: string;
  /** The timeline holding it: its name, else its ID. */
  readonly timeline: string;
}

/** What the Flow control tab shows of the flow-control editor of a root. */
export interface FlowControlShown {
  readonly block: Block;
  readonly root: TimelineManifest;
  /** The root and its descendants, in pre-order. */
  readonly timelines: readonly FlowTimeline[];
  /** Every flow-control element of the tree, by timeline in pre-order, then in the manifest's order. */
  readonly rows: readonly FlowRow[];
}

/** Every timeline of `root`'s tree, `root` first, in pre-order. */
function treeOf(root: TimelineManifest): TimelineManifest[] {
  return [root, ...root.children.flatMap(treeOf)];
}

/** A value of `timeline`'s axis as Copy writes it. */
function axisText(value: unknown, timeline: TimelineManifest): string {
  return copyValue(axisCoordinate(value, timeline).value, timeline.number_type);
}

/** The words of `element`: its role's, capitalised, and its manifestation (or its destinations'). */
function rowWords(element: FlowControlElement): string {
  const word = entryWord("flow_control", element);
  const shown =
    element.manifestation ??
    (element.targets ?? [])
      .flatMap((target) => (target.manifestation === undefined ? [] : [target.manifestation]))
      .join(", ");
  const capital = `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  return shown === "" ? capital : `${capital} (${shown.replaceAll("_", " ")})`;
}

/**
 * What the Flow control tab shows under `innermost`, the innermost open
 * editor: for a flow-control editor of a root held by `view`, the root's
 * tree and its flow-control elements; `null` at every other level.
 */
export function flowControlOf(
  view: View,
  innermost: OpenEditor | undefined,
): FlowControlShown | null {
  if (innermost?.kind !== "flow") return null;
  const { block: id, id: rootId } = innermost.target;
  const block = id === undefined ? undefined : view.blocks[id];
  const root =
    block === undefined || rootId === undefined
      ? undefined
      : block.manifest.timelines.find((item) => item.id === rootId);
  if (block === undefined || root === undefined) return null;
  const tree = treeOf(root);
  return {
    block,
    root,
    timelines: tree.map((timeline) => ({
      id: timeline.id,
      label: timeline.name ?? timeline.id,
      unit: prettyUnit(timeline.unit),
    })),
    rows: tree.flatMap((timeline) =>
      timeline.flow_control.map((element) => ({
        id: element.id,
        address: inBlock(block.id, idAddress(element.id)),
        words: rowWords(element),
        name: element.name ?? element.label ?? element.id,
        position: axisText(element.coordinate, timeline),
        unit: prettyUnit(timeline.unit),
        timeline: timeline.name ?? timeline.id,
      })),
    ),
  };
}

/** Where a new element goes: a timeline of the tree and a position on its axis, as Copy writes it. */
export interface Position {
  readonly timeline: string;
  readonly text: string;
}

/**
 * The position `resolved`, an element of `manifest`, stands at on the
 * timeline holding it: a flow-control element's coordinate, a region's
 * start (its end for its `end` part), a timeline's start (0) or its end
 * (its length, where known) for its `start` and `end` parts; any other
 * part its owner's; `null` for anything else.
 */
function standsAt(resolved: ResolvedElement, manifest: Manifest): Position | null {
  switch (resolved.kind) {
    case "entry": {
      const timeline = resolved.at.timeline;
      const { element } = resolved;
      if (resolved.entry === "flow_control" && "coordinate" in element) {
        return { timeline: timeline.id, text: axisText(element.coordinate, timeline) };
      }
      if (resolved.entry === "region" && "start" in element) {
        return { timeline: timeline.id, text: axisText(element.start, timeline) };
      }
      return null;
    }
    case "part": {
      const { owner, word } = resolved;
      if (owner.kind === "entry" && owner.entry === "region" && word === "end") {
        const { element } = owner;
        if ("end" in element) {
          return { timeline: owner.at.timeline.id, text: axisText(element.end, owner.at.timeline) };
        }
      }
      if (owner.kind === "timeline" && (word === "start" || word === "end")) {
        const { timeline } = owner.at;
        if (word === "start") return { timeline: timeline.id, text: axisText(0, timeline) };
        return timeline.length === null
          ? { timeline: timeline.id, text: "" }
          : { timeline: timeline.id, text: axisText(timeline.length, timeline) };
      }
      return standsAt(owner, manifest);
    }
    case "timeline":
    case "card":
    case "band":
      return { timeline: resolved.at.timeline.id, text: "" };
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
    case "chunk_band":
      return null;
    default:
      return assertNever(resolved);
  }
}

/**
 * The position the tab proposes for a new element of `shown`'s tree, from
 * the selection `addresses`: where they are exactly one element of the
 * edited block inside the tree, the timeline holding it and where it stands
 * (`standsAt`: a flow-control element's coordinate, a region's start, a
 * timeline's start or end mark; an empty position for a timeline, its card
 * or a band); else the root, the position empty.
 */
export function proposedPosition(shown: FlowControlShown, addresses: readonly Address[]): Position {
  const none = { timeline: shown.root.id, text: "" };
  const [only, ...others] = addresses;
  if (only === undefined || others.length > 0 || only.block !== shown.block.id) return none;
  if (!isElementAddress(only)) return none;
  const { manifest } = shown.block;
  const element: ElementAddress = elementAddressOf(only);
  const resolved = resolveElement(manifest, element);
  const at = resolved === undefined ? null : standsAt(resolved, manifest);
  return at !== null && shown.timelines.some((item) => item.id === at.timeline) ? at : none;
}

/**
 * The element of `kind` written into `timeline`, its coordinate `coordinate`
 * on `timeline`'s axis: its role, its manifestation, and a Jump's one
 * destination (`FlowKind.to`). No ID: core gives it one.
 */
function elementOf(
  kind: FlowKind,
  timeline: TimelineManifest,
  coordinate: unknown,
): { readonly [key: string]: unknown } {
  const { role, manifestation, to } = kind;
  switch (role) {
    case "jump": {
      const destination = {
        ...(to === "start" ? { to: timeline.id } : {}),
        ...(manifestation === undefined ? {} : { manifestation }),
        repeat_count: 1,
      };
      return { role, coordinate, targets: [destination] };
    }
    case "jump_target":
    case "break":
    case "section_break":
    case "barline":
      return { role, coordinate, ...(manifestation === undefined ? {} : { manifestation }) };
    default:
      return assertNever(role);
  }
}

/**
 * The `add` of an element of the kind keyed `key` (`FLOW_KINDS`) into the
 * timeline `at.timeline` of `shown`'s tree, at the position `at.text` read
 * exactly on that timeline's axis; refused before dispatch where the kind
 * or the timeline is unknown, or the text spells no value of the axis, at
 * `[<timeline's address key>, "coordinate"]`.
 */
export function addFlowCommand(
  shown: FlowControlShown,
  key: string,
  at: Position,
): Result<AddCommand> {
  const { block } = shown;
  const into = inBlock(block.id, idAddress(at.timeline));
  const path = [addressKey(into), "coordinate"];
  const kind = FLOW_KINDS.find((item) => item.key === key);
  const timeline = shown.timelines.some((item) => item.id === at.timeline)
    ? findTimeline(block.manifest, at.timeline)
    : undefined;
  if (kind === undefined || timeline === undefined) {
    return refused(
      InspectorCode.invalidValue,
      "choose an element and a timeline of the tree",
      path,
    );
  }
  if (at.text.trim() === "") {
    return refused(InspectorCode.invalidValue, "type the position of the new element", path);
  }
  const value = typedValue(at.text.trim(), timeline);
  if (typeof value === "string") return refused(InspectorCode.invalidValue, value, path);
  return {
    ok: true,
    value: { type: "add", into, flow_control: elementOf(kind, timeline, value) },
  };
}

/**
 * The address of the one flow-control element `after`'s timeline `timeline`
 * holds that `before`'s does not: the element an `add` gave, read through
 * the result; `null` where there is not exactly one.
 */
export function addedFlowElement(
  block: string,
  before: Manifest,
  after: Manifest,
  timeline: string,
): Address | null {
  const known = new Set(findTimeline(before, timeline)?.flow_control.map(({ id }) => id) ?? []);
  const added = (findTimeline(after, timeline)?.flow_control ?? []).filter(
    ({ id }) => !known.has(id),
  );
  const [only, ...others] = added;
  return only === undefined || others.length > 0 ? null : inBlock(block, idAddress(only.id));
}
