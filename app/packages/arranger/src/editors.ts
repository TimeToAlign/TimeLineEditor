/**
 * The editors of the canvas: the bundle, group, timeline, children and
 * flow-control editors on one element, and the one rule naming the editor a
 * double-click, Enter or the inspector's Edit button opens (`editorTargetOf`).
 */

import type {
  Address,
  EditorKind,
  ElementAddress,
  Manifest,
  ResolvedElement,
  StatedEditorKind,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  addressWords,
  assertNever,
  contains,
  findTimeline,
  idAddress,
  inBlock,
  placedElement,
  resolveElement,
  sameAddress,
} from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import {
  type BandBox,
  bandUnder,
  boxAt,
  type DrawingPoint,
  type Hit,
  isAncestorCard,
  isBand,
} from "./boxes.ts";
import type { Editing } from "./editing.ts";
import { addressParts } from "./editing.ts";

/** The facet of the band whose double-click opens the flow-control editor of its root. */
const FLOW_BAND = "flow_control";

/**
 * The bands that open an editor of their own kind on their timeline, by
 * facet: a timeline's children band its children editor, a root's flow
 * control band its flow-control editor. Every other band opens its
 * timeline's editor.
 */
const STATED_BANDS: { readonly [facet: string]: StatedEditorKind } = {
  children: "children",
  [FLOW_BAND]: "flow",
};

/**
 * The kind of editor a band of facet `facet` opens on its timeline (`STATED_BANDS`;
 * a flow control band only on a root, `root`); `null` where it opens the timeline editor.
 */
function statedBandKind(facet: string | undefined, root: boolean): StatedEditorKind | null {
  if (facet === undefined || !Object.hasOwn(STATED_BANDS, facet)) return null;
  const kind = STATED_BANDS[facet] ?? null;
  return kind === "flow" && !root ? null : kind;
}

/**
 * An editor to open: its target and, for the children and flow-control
 * editors, its kind (else the one the target opens).
 */
export interface EditorToOpen {
  readonly target: Address;
  readonly kind?: EditorKind;
}

/** Where a pointer pressed: the drawing of the hit's block and the drawing point. */
export interface PressedPoint {
  readonly drawing: Drawing;
  readonly point: DrawingPoint;
}

/**
 * The editor target a double-click, a double tap, Enter or the inspector's
 * Edit button on `hit` opens, in every view by the same rule: what is hit
 * opens its own editor, and what has none the editor of the card holding
 * it. The block itself opens the block (the bundle editor), a frame its
 * group (the group editor), a timeline's line, wherever it is drawn, that
 * timeline (so a child's line the child), and a flow-control element (its
 * line, symbol, fork, arc or label, hit before any band) the flow control
 * band of the root whose tree holds it. A band (`bandUnder`: with the
 * drawing point `at`, the band under the pointer, else a band hit) opens
 * the editor of its timeline, but a timeline's children band its children
 * editor and a root's flow control band the flow-control editor of the
 * root (`editorOf`), each named by the band's own address (`{block, id: T,
 * facet: "children"}`, `{block, id: R, facet: "flow_control"}`). A chunk
 * (its label, leader or boundary) opens the flow-control editor of its
 * FlowMap's root, where FlowMaps are edited (`chunkTarget`). An element a
 * chunk's window shows on a virtual card (a region, a map, a named
 * timestamp, a child's line, any part of them) is edited at its source: it
 * opens the editor of the timeline that holds it, where it is written
 * (`sourceTarget`). A free spot of a card opens the
 * card's timeline; anything else drawn (a name, a label, a region, a
 * stamp, a boundary) what the last drawn card or frame holding it stands
 * for, the innermost where none overlap (`hit.within`), and nothing
 * (`null`) when none holds it. Inside the flow-control editor nothing
 * opens. With an editor open, only a target inside the edited element
 * opens (`openableIn`).
 */
export function editorTargetOf(
  view: View,
  hit: Hit,
  editing: Editing | null,
  at?: PressedPoint,
): Address | null {
  const block = view.blocks[hit.block];
  if (block === undefined || editing?.kind === "flow") return null;
  const { manifest } = block;
  const target =
    hit.kind === "element" ? elementTarget(hit, manifest) : boxTarget(hit, manifest, editing, at);
  return target === null ? null : openableIn(manifest, target, editing);
}

/**
 * The editor an address `editorTargetOf` named opens: a timeline's children
 * band (`{block, id: T, facet: "children"}`) opens the children editor of
 * the timeline `{block, id: T}`, a root's flow control band (`{block, id:
 * R, facet: "flow_control"}`) the flow-control editor of the root `{block,
 * id: R}`, every other address the editor its target opens.
 */
export function editorOf(target: Address): EditorToOpen {
  const { block, element } = addressParts(target);
  const kind = element?.part === undefined ? statedBandKind(element?.facet, true) : null;
  if (element?.id === undefined || kind === null) return { target };
  return { target: inBlock(block, idAddress(element.id)), kind };
}

/** One editor a long press offers: the target `editorTargetOf` would name for it, and its words. */
export interface EditorChoice {
  readonly target: Address;
  /** `Flow control of timeline 'Score'`, `Timeline 'Score'`, `Group 'Themes'` (core's `addressWords`). */
  readonly label: string;
}

/**
 * The editors under a long press on `hit` at the drawing point `at`,
 * innermost first, each once and each one that opens under `editing`
 * (`openableIn`): what a double-click there opens (`editorTargetOf`: the
 * element's, the band's or the card's own editor), then the card under the
 * point (`hit.within`, else the card hit), then the group of the frame on
 * top under the point (`boxAt`). Empty inside the flow-control editor.
 */
export function editorsUnder(
  view: View,
  hit: Hit,
  editing: Editing | null,
  at: PressedPoint,
): readonly EditorChoice[] {
  const block = view.blocks[hit.block];
  if (block === undefined || editing?.kind === "flow") return [];
  const { manifest } = block;
  const card = hit.within ?? hit.box;
  const frame = boxAt(at.drawing, at.point, ["frame"]);
  const candidates = [
    editorTargetOf(view, hit, editing, at),
    card !== null && card.kind === "card"
      ? containerTarget(hit.block, standsFor(card, manifest))
      : null,
    containerTarget(hit.block, standsFor(frame, manifest)),
  ];
  const choices: EditorChoice[] = [];
  for (const candidate of candidates) {
    const target = candidate === null ? null : openableIn(manifest, candidate, editing);
    if (target === null || choices.some((choice) => sameAddress(choice.target, target))) continue;
    choices.push({ target, label: editorWords(view, target) });
  }
  return choices;
}

/** The words before a timeline's words naming each editor whose kind a session states. */
const STATED_WORDS: { readonly [kind in StatedEditorKind]: string } = {
  children: "Children of",
  flow: "Flow control of",
};

/**
 * The words of the editor `target` opens (`editorOf`): a children band
 * `Children of` its timeline's words, a root's flow control band `Flow
 * control of` its root's words, any other target its own words capitalised
 * (core's `addressWords`).
 */
export function editorWords(view: View, target: Address): string {
  const opened = editorOf(target);
  const words = addressWords(view, opened.target);
  return opened.kind === "children" || opened.kind === "flow"
    ? `${STATED_WORDS[opened.kind]} ${words}`
    : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/**
 * `target` where it opens under `editing`, the innermost open editor: on
 * the arranger always; with an editor open only a target of its block
 * inside the edited element, never the edited element itself nor the
 * block: any target of the block in the bundle editor, else one the edited
 * group or timeline contains (core's `contains`); the edited timeline's
 * children band and a root's flow control band (the children and
 * flow-control editors of the edited timeline itself) only inside that
 * timeline's timeline editor; `null` otherwise.
 */
function openableIn(manifest: Manifest, target: Address, editing: Editing | null): Address | null {
  if (editing === null) return target;
  const edited = addressParts(editing.target);
  const { block, element } = addressParts(target);
  if (edited.block !== block || element?.id === undefined || sameAddress(target, editing.target)) {
    return null;
  }
  const within = edited.element?.id;
  if (within === undefined) return target;
  if (element.id === within && statedBandKind(element.facet, true) !== null) {
    return editing.kind === "timeline" ? target : null;
  }
  return contains(manifest, within, idAddress(element.id)) ? target : null;
}

/**
 * What an element hit opens: a flow-control element the flow control band
 * of its root (`flowElementOf`), a chunk's part the flow control band of
 * its FlowMap's root (`chunkTarget`), an element a window shows the
 * timeline holding it (`sourceTarget`), a timeline's line that timeline,
 * anything else what the card or frame holding it stands for (`standsFor`
 * of `hit.within`); `null` for nothing.
 */
function elementTarget(hit: Hit, manifest: Manifest): Address | null {
  const flow = flowElementOf(hit, manifest) ?? chunkTarget(hit, manifest);
  if (flow !== null) return flow;
  const source = sourceTarget(hit, manifest);
  if (source !== null) return source;
  const { element } = addressParts(hit.address);
  const line =
    element?.id !== undefined && element.facet === undefined && element.part === undefined;
  if (line && findTimeline(manifest, element.id) !== undefined) {
    return inBlock(hit.block, idAddress(element.id));
  }
  return containerTarget(hit.block, standsFor(hit.within, manifest));
}

/**
 * What a hit on a container opens: the band under the pointer where there
 * is one (`bandUnder` with the drawing point `at`, else a band hit), its
 * timeline's editor or a root's flow-control editor (`bandTarget`); else
 * the block itself, or what the frame or card hit stands for.
 */
function boxTarget(
  hit: Hit,
  manifest: Manifest,
  editing: Editing | null,
  at: PressedPoint | undefined,
): Address | null {
  const band =
    at === undefined
      ? hit.kind === "band" && hit.box !== null && isBand(hit.box)
        ? hit.box
        : null
      : bandUnder(at.drawing, hit, at.point, editing);
  if (band !== null) return bandTarget(hit.block, band, manifest);
  if (hit.kind === "block") return { block: hit.block };
  return containerTarget(hit.block, standsFor(hit.box, manifest));
}

/**
 * What a band opens: a timeline's children band and a root's flow control
 * band their own address, which opens the timeline's children editor or the
 * root's flow-control editor (`editorOf`), any other band its timeline's
 * address, which opens the timeline editor.
 */
function bandTarget(block: string, band: BandBox, manifest: Manifest): Address {
  const { timeline, facet } = band.band;
  const root = manifest.timelines.some((item) => item.id === timeline);
  return statedBandKind(facet, root) === null
    ? inBlock(block, idAddress(timeline))
    : inBlock(block, { id: timeline, facet });
}

/** The address of the block, the group or the timeline `opened` names (`standsFor`); `null` for none. */
function containerTarget(block: string, opened: string | null | undefined): Address | null {
  if (opened === undefined) return null;
  return opened === null ? { block } : inBlock(block, idAddress(opened));
}

/**
 * The flow control band an element hit stands for: where `hit` is an
 * element a root's flow control band draws (a flow-control element of the
 * root's tree: its line, symbol, fork, arc or label), that band's address,
 * which opens the root's flow-control editor (`editorOf`); `null` otherwise.
 */
function flowElementOf(hit: Hit, manifest: Manifest): Address | null {
  const { element } = addressParts(hit.address);
  if (element?.id === undefined) return null;
  const holds = (timeline: TimelineManifest): boolean =>
    timeline.flow_control.some((item) => item.id === element.id) || timeline.children.some(holds);
  const root = manifest.timelines.find(holds);
  return root === undefined ? null : inBlock(hit.block, { id: root.id, facet: FLOW_BAND });
}

/** What `element` resolves to in `manifest`, a part read up to its owner; `undefined` for nothing. */
function ownerElement(manifest: Manifest, element: ElementAddress): ResolvedElement | undefined {
  let resolved = resolveElement(manifest, element);
  while (resolved?.kind === "part") resolved = resolved.owner;
  return resolved;
}

/**
 * The flow control band a chunk's part stands for: where `hit` is the
 * label, leader or boundary of a chunk drawn on a virtual timeline's line
 * or a switched card's (`{id: V, part: [k, word]}`), the flow control band
 * of the root its FlowMap unfolds, which opens that root's flow-control
 * editor (`editorOf`), where FlowMaps are edited; `null` otherwise.
 */
function chunkTarget(hit: Hit, manifest: Manifest): Address | null {
  const { element } = addressParts(hit.address);
  if (element === null || typeof element.part?.[0] !== "number") return null;
  const resolved = ownerElement(manifest, element);
  if (resolved?.kind !== "chunk") return null;
  return inBlock(hit.block, { id: resolved.flowMap.flowMap.timeline, facet: FLOW_BAND });
}

/** The timeline holding what `resolved` names: a timeline's own, an entry's, a stamp's, a band's; `null` for anything else. */
function holdingTimeline(resolved: ResolvedElement): string | null {
  switch (resolved.kind) {
    case "timeline":
    case "band":
    case "entry":
    case "timestamp":
      return resolved.at.timeline.id;
    case "title":
    case "frame":
    case "card":
    case "measure_map":
    case "elision":
    case "matchstamp":
    case "anchor":
    case "flow_map":
    case "virtual_timeline":
    case "virtual_card":
    case "virtual_band":
    case "chunk":
    case "chunk_band":
    case "part":
      return null;
    default:
      return assertNever(resolved);
  }
}

/**
 * Where an element a chunk's window shows is edited (TimeToShare's
 * `docs/drawing.md`, section 8.10, Windows: every drawing keeps its
 * element's address, and an edit of it is an edit of the source): where
 * `hit` lies on the card of a virtual timeline `V` (`hit.within`) and names
 * an element held by a timeline other than `V` (a region, a map, a named
 * timestamp, a child's line, or a part of one), the address of that
 * timeline, which opens its editor, the canvas moving to where the element
 * is written; `null` otherwise, `V`'s own elements included.
 */
function sourceTarget(hit: Hit, manifest: Manifest): Address | null {
  const virtual = standsFor(hit.within, manifest);
  if (
    typeof virtual !== "string" ||
    !(manifest.virtual_timelines ?? []).some((item) => item.id === virtual)
  ) {
    return null;
  }
  const { element } = addressParts(hit.address);
  const resolved = element === null ? undefined : ownerElement(manifest, element);
  const holder = resolved === undefined ? null : holdingTimeline(resolved);
  return holder === null || holder === virtual ? null : inBlock(hit.block, idAddress(holder));
}

/**
 * What a frame or a card `box` stands for in `manifest`: a frame its
 * group's ID and a card its timeline's (core's `placedElement` of its place
 * key; an ancestor card, which has no place, the root its address names),
 * `null` for the block's own box, `undefined` for nothing.
 */
function standsFor(box: DrawnBox | null, manifest: Manifest): string | null | undefined {
  if (box === null) return undefined;
  if (box.kind === "block") return null;
  if (isAncestorCard(box)) return box.address.id;
  return box.key === null ? undefined : placedElement(manifest, box.key);
}
