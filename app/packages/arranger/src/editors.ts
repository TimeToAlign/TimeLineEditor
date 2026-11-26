/** The editors of the canvas: the bundle, group, timeline and flow editors on one element. */

import type {
  Address,
  EditorKind,
  Manifest,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  assertNever,
  contains,
  findTimeline,
  idAddress,
  inBlock,
  placedElement,
  sameAddress,
} from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { type Hit, isAncestorCard, isBand } from "./boxes.ts";
import type { Editing } from "./editing.ts";
import { addressParts } from "./editing.ts";

/** The facet of the band whose double-click opens the flow editor of its root. */
const FLOW_BAND = "flow_control";

/** An editor to open: its target and, for the flow editor, its kind (else the one the target opens). */
export interface EditorToOpen {
  readonly target: Address;
  readonly kind?: EditorKind;
}

/**
 * The editor target a double-click, a double tap or Enter on `hit` opens, by
 * the container that is hit, never by what it holds: the block itself opens
 * the block (the bundle editor), a frame its group (the group editor),
 * a card its timeline, and a timeline's line, wherever it is drawn, that
 * timeline (the timeline editor), so a root's line opens the root and a
 * child's line the child. A band opens nothing, but for a root's flow
 * control band hit in that root's timeline editor (where alone a band is
 * hit), which names its own address: the flow editor of the root
 * (`editorOf`), and so does any element that band draws there (a
 * flow-control element of the root's tree, hit before the band). Inside a
 * flow editor nothing opens. Anything else drawn (a name,
 * a label, a region, a boundary) opens what the last drawn card or frame
 * holding it stands for, the innermost where none overlap (`hit.within`),
 * and nothing (`null`) when none holds it. With an editor open, only a
 * target inside the edited element opens, never the edited element itself:
 * any target of its block in the bundle editor, else one the edited group or
 * timeline contains (core's `contains`).
 */
export function editorTargetOf(view: View, hit: Hit, editing: Editing | null): Address | null {
  const block = view.blocks[hit.block];
  if (block === undefined || editing?.kind === "flow") return null;
  if (hit.kind === "band") return flowBandOf(hit, block.manifest, editing);
  const flow = flowElementOf(hit, block.manifest, editing);
  if (flow !== null) return flow;
  const opened = openedBy(hit, block.manifest);
  if (opened === undefined) return null;
  const target: Address =
    opened === null ? { block: block.id } : inBlock(block.id, idAddress(opened));
  if (editing === null) return target;
  const edited = addressParts(editing.target);
  if (edited.block !== block.id || sameAddress(target, editing.target) || opened === null) {
    return null;
  }
  if (edited.element?.id === undefined) return target;
  return contains(block.manifest, edited.element.id, idAddress(opened)) ? target : null;
}

/**
 * The editor an address `editorTargetOf` named opens: a root's flow control
 * band (`{block, id: R, facet: "flow_control"}`) opens the flow editor of
 * the root `{block, id: R}`, every other address the editor its target
 * opens.
 */
export function editorOf(target: Address): EditorToOpen {
  const { block, element } = addressParts(target);
  if (element?.id === undefined || element.facet !== FLOW_BAND || element.part !== undefined) {
    return { target };
  }
  return { target: inBlock(block, idAddress(element.id)), kind: "flow" };
}

/**
 * The flow control band `hit` hit, where it is a root's band in the
 * timeline editor of that root in its block (`editing`): its address,
 * which opens the root's flow editor (`editorOf`); `null` for every other
 * band.
 */
function flowBandOf(hit: Hit, manifest: Manifest, editing: Editing | null): Address | null {
  const box = hit.box;
  if (box === null || !isBand(box) || box.band.facet !== FLOW_BAND) return null;
  const root = box.band.timeline;
  if (!manifest.timelines.some((timeline) => timeline.id === root)) return null;
  if (editing?.kind !== "timeline") return null;
  const edited = addressParts(editing.target);
  if (edited.block !== hit.block || edited.element?.id !== root) return null;
  return hit.address;
}

/**
 * The flow control band an element hit stands for: where `editing` is the
 * timeline editor of a root and `hit` an element its flow control band
 * draws (a flow-control element of the root's tree: its line, symbol,
 * fork, arc or label, which are hit before the band), that band's address,
 * which opens the root's flow editor (`editorOf`); `null` otherwise.
 */
function flowElementOf(hit: Hit, manifest: Manifest, editing: Editing | null): Address | null {
  if (hit.kind !== "element" || editing?.kind !== "timeline") return null;
  const edited = addressParts(editing.target);
  const root = manifest.timelines.find((timeline) => timeline.id === edited.element?.id);
  const { element } = addressParts(hit.address);
  if (edited.block !== hit.block || root === undefined || element?.id === undefined) return null;
  const holds = (timeline: TimelineManifest): boolean =>
    timeline.flow_control.some((item) => item.id === element.id) || timeline.children.some(holds);
  return holds(root) ? inBlock(hit.block, { id: root.id, facet: FLOW_BAND }) : null;
}

/**
 * The element `hit` in the drawing of `manifest` opens: its group's or
 * timeline's ID, `null` for the block itself, `undefined` for nothing. A
 * frame stands for its group and a card for its timeline (core's
 * `placedElement` of its place key; an ancestor card, which has no place,
 * for the root its address names); a line, addressed by its timeline's ID
 * alone, for its timeline.
 */
function openedBy(hit: Hit, manifest: Manifest): string | null | undefined {
  const standsFor = (box: DrawnBox | null) => {
    if (box === null) return undefined;
    if (isAncestorCard(box)) return box.address.id;
    return box.key === null ? undefined : placedElement(manifest, box.key);
  };
  switch (hit.kind) {
    case "block":
      return null;
    case "frame":
    case "card":
      return standsFor(hit.box);
    case "band":
      return undefined;
    case "element": {
      const { element } = addressParts(hit.address);
      const line =
        element?.id !== undefined && element.facet === undefined && element.part === undefined;
      if (line && findTimeline(manifest, element.id) !== undefined) return element.id;
      return standsFor(hit.within);
    }
    default:
      return assertNever(hit.kind);
  }
}
