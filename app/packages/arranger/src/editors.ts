/** The editors of the canvas: the bundle, group, timeline and flow-control editors on one element. */

import type {
  Address,
  EditorKind,
  Manifest,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  addressWords,
  contains,
  findTimeline,
  idAddress,
  inBlock,
  placedElement,
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

/** An editor to open: its target and, for the flow-control editor, its kind (else the one the target opens). */
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
 * the editor of its timeline, a root's flow control band the flow-control
 * editor of the root (`editorOf`), named by the band's own address
 * `{block, id: R, facet: "flow_control"}`. A free spot of a card opens the
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
 * The editor an address `editorTargetOf` named opens: a root's flow control
 * band (`{block, id: R, facet: "flow_control"}`) opens the flow-control
 * editor of the root `{block, id: R}`, every other address the editor its
 * target opens.
 */
export function editorOf(target: Address): EditorToOpen {
  const { block, element } = addressParts(target);
  if (element?.id === undefined || element.facet !== FLOW_BAND || element.part !== undefined) {
    return { target };
  }
  return { target: inBlock(block, idAddress(element.id)), kind: "flow" };
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

/**
 * The words of the editor `target` opens (`editorOf`): a root's flow
 * control band `Flow control of` its root's words, any other target its own
 * words capitalised (core's `addressWords`).
 */
export function editorWords(view: View, target: Address): string {
  const opened = editorOf(target);
  const words = addressWords(view, opened.target);
  return opened.kind === "flow"
    ? `Flow control of ${words}`
    : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/**
 * `target` where it opens under `editing`, the innermost open editor: on
 * the arranger always; with an editor open only a target of its block
 * inside the edited element, never the edited element itself nor the
 * block: any target of the block in the bundle editor, else one the edited
 * group or timeline contains (core's `contains`), and the flow-control
 * editor of a root inside that root's timeline editor; `null` otherwise.
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
  if (element.facet === FLOW_BAND && element.id === within && editing.kind === "timeline") {
    return target;
  }
  return contains(manifest, within, idAddress(element.id)) ? target : null;
}

/**
 * What an element hit opens: a flow-control element the flow control band
 * of its root (`flowElementOf`), a timeline's line that timeline, anything
 * else what the card or frame holding it stands for (`standsFor` of
 * `hit.within`); `null` for nothing.
 */
function elementTarget(hit: Hit, manifest: Manifest): Address | null {
  const flow = flowElementOf(hit, manifest);
  if (flow !== null) return flow;
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
 * What a band opens: a root's flow control band its own address, which
 * opens the root's flow-control editor (`editorOf`), any other band its
 * timeline's address, which opens the timeline editor.
 */
function bandTarget(block: string, band: BandBox, manifest: Manifest): Address {
  const { timeline, facet } = band.band;
  const root = manifest.timelines.some((item) => item.id === timeline);
  return root && facet === FLOW_BAND
    ? inBlock(block, { id: timeline, facet: FLOW_BAND })
    : inBlock(block, idAddress(timeline));
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
