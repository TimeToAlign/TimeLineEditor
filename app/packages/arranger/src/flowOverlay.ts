/**
 * The flow control a child's timeline editor shows beside the child: an
 * editor overlay, like the marks, never part of the drawing, its exports or
 * the manifest. Flow control holds across a root's whole tree, and only the
 * root's flow control band draws it (TimeToShare's `docs/drawing.md`,
 * section 6.4, Gathering), so a child drawn as a line in its root's card
 * shows none of it in its own row. While the child's timeline editor is
 * open, each drawing of the child's line in a card gets one read-only band
 * below the child's row: the elements the card's flow control band draws
 * on the child's stretch, drawn as that band draws them, moved down and
 * labelled "Flow control (from <root>)", each flow line running across the
 * band (at least a label line high) rather than across the card. Nothing in
 * it is selectable or written with an address.
 */

import type { Block, ElementAddress, PlaceKey, TimelineManifest } from "@timetoalign/tilie-core";
import { placeKeyText, samePlaceKey } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox, DrawnElement } from "@timetoalign/tilie-layout";
import { TextMeasure } from "@timetoalign/tilie-layout";
import type { AttributeValue, Descriptor } from "@timetoalign/tilie-writers";
import { ADDRESS_ATTRIBUTES, attributeText } from "@timetoalign/tilie-writers";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { addressParts, type Editing } from "./editing.ts";

/** The font size of the overlay's label. */
export const OVERLAY_LABEL_SIZE = 9;

/** The gap between the child's row and the overlay, and the overlay's inner padding. */
export const OVERLAY_GAP = 4;

/** The distance of a flow-control element's stack from the element (section 6.2, flow label offset). */
const STACK_OFFSET = 3;

/**
 * One element drawn in the overlay: its descriptor's index among the
 * drawing's descriptors, its tag, its attributes without its address, its
 * text.
 */
export interface OverlayItem {
  readonly index: number;
  readonly tag: Descriptor["tag"];
  readonly attributes: Readonly<Record<string, string>>;
  readonly text: string | null;
}

/** The read-only flow control band shown beside one drawing of a child's line. */
export interface FlowOverlay {
  /** The card drawing the child's line and the line's ordinate, as one text: tells overlays apart. */
  readonly key: string;
  /** The child timeline it is shown for. */
  readonly timeline: string;
  /** The card whose flow control band it shows. */
  readonly card: PlaceKey;
  /** `Flow control (from <root>)`, the root of the child's tree by its name, else its ID. */
  readonly label: string;
  /** Its rectangle, in the drawing's coordinates. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Where its label starts and its baseline. */
  readonly labelX: number;
  readonly baseline: number;
  /** How far the band's elements are moved down, from the band's place to the overlay's. */
  readonly dy: number;
  /** The indices, in `Drawing.elements`, of the band's elements it shows, in drawing order. */
  readonly elements: readonly number[];
  /** Their descriptors as drawn, at the band's place, before `dy`. */
  readonly items: readonly OverlayItem[];
}

/** The top-level root of the tree holding the timeline `id`, and whether `id` is a child in it. */
function rootOf(
  block: Block,
  id: string,
): { readonly root: TimelineManifest; readonly child: boolean } | undefined {
  const holds = (timeline: TimelineManifest): boolean =>
    timeline.id === id || timeline.children.some(holds);
  const root = block.manifest.timelines.find(holds);
  return root === undefined ? undefined : { root, child: root.id !== id };
}

/** The timeline a timeline editor in block `block` edits: its line's address alone; else `null`. */
function editedTimeline(block: Block, editing: Editing | null): string | null {
  if (editing === null || editing.kind !== "timeline") return null;
  const { block: id, element } = addressParts(editing.target);
  if (id !== block.id || element === null) return null;
  const address: ElementAddress = element;
  if (address.id === undefined || address.part !== undefined || address.facet !== undefined) {
    return null;
  }
  return address.id;
}

/** Whether `value` lies on `[from, to]`, the ends included. */
const within = (value: number, from: number, to: number): boolean =>
  value >= from - 1e-9 && value <= to + 1e-9;

/**
 * Which of the band's elements lie on the child's stretch `[from, to]` (its
 * line's abscissas): a flow line and a symbol by their abscissa, a fork
 * by its branch point, an arc by both its ends, a stack's label by its element's
 * abscissa, an arc's label with its arc, a leader by its abscissa.
 */
function onStretch(
  elements: readonly DrawnElement[],
  indices: readonly number[],
  from: number,
  to: number,
): Set<number> {
  const taken = new Set<number>();
  const arcs = new Set<string>();
  for (const index of indices) {
    const element = elements[index];
    if (element?.type === "jump" && within(element.start[0], from, to)) {
      if (within(element.tip[0], from, to)) {
        taken.add(index);
        arcs.add(element.address.id ?? "");
      }
    }
  }
  for (const index of indices) {
    const element = elements[index];
    if (element === undefined) continue;
    switch (element.type) {
      case "break":
      case "section_break":
      case "barline":
      case "symbol":
        if (within(element.x, from, to)) taken.add(index);
        break;
      case "fork":
        if (within(element.point[0], from, to)) taken.add(index);
        break;
      case "leader":
        if (within(element.x1, from, to)) taken.add(index);
        break;
      case "label": {
        const inside =
          element.anchor === "start"
            ? within(element.x - STACK_OFFSET, from, to)
            : arcs.has(element.address.id ?? "");
        if (inside) taken.add(index);
        break;
      }
      default:
        break;
    }
  }
  return taken;
}

/** A descriptor attribute as the DOM receives it (the SVG writer's text for numbers, points and paths). */
const domValue = (value: AttributeValue): string =>
  typeof value === "string" ? value : attributeText(value);

/**
 * A descriptor drawn in the overlay: its attributes without the ones writing
 * its address, so it is never read as the element; a flow line runs across
 * the band, from `top` to `bottom`, rather than across the card.
 */
function itemOf(
  descriptor: Descriptor,
  index: number,
  flowLine: boolean,
  top: number,
  bottom: number,
): OverlayItem {
  const attributes: Record<string, string> = {};
  for (const [name, value] of descriptor.attrs) {
    if (ADDRESS_ATTRIBUTES.some((attribute) => attribute === name)) continue;
    attributes[name] = domValue(value);
  }
  if (flowLine) {
    attributes.y1 = attributeText(top);
    attributes.y2 = attributeText(bottom);
  }
  return { index, tag: descriptor.tag, attributes, text: descriptor.text };
}

/** The card's flow control band: the root of its member drawing draws the only one. */
function flowBandOf(drawing: Drawing, card: PlaceKey): DrawnBox | undefined {
  return drawing.boxes.find(
    (box) =>
      box.kind === "band" &&
      box.band?.facet === "flow_control" &&
      box.holder !== null &&
      samePlaceKey(box.holder, card),
  );
}

/** The IDs of every flow-control element of the manifest's timelines, at any depth. */
function flowIds(block: Block): Set<string> {
  const ids = new Set<string>();
  const visit = (timeline: TimelineManifest) => {
    for (const element of timeline.flow_control) ids.add(element.id);
    timeline.children.forEach(visit);
  };
  block.manifest.timelines.forEach(visit);
  return ids;
}

/**
 * The indices of the elements the card `card` draws for flow control: in its
 * range, each addressed to a flow-control element (its line, symbol,
 * forks, arcs, labels and leaders), which only the card's flow control
 * band draws.
 */
function flowElementsOf(drawing: Drawing, card: PlaceKey, ids: ReadonlySet<string>): number[] {
  const box = drawing.boxes.find(
    (found) => found.kind === "card" && found.key !== null && samePlaceKey(found.key, card),
  );
  if (box === undefined) return [];
  const indices: number[] = [];
  for (let index = box.range.start; index < box.range.end; index += 1) {
    const id = drawing.elements[index]?.address.id;
    if (id !== undefined && ids.has(id)) indices.push(index);
  }
  return indices;
}

/**
 * The read-only flow control bands block `block` shows under `editing`:
 * none but in the timeline editor of a child timeline of this block, then
 * one for each card drawing the child's line, not its own member card nor
 * an ancestor card, whose flow control band draws an element on the
 * child's stretch.
 */
export function flowOverlays(
  block: Block,
  drawing: Drawing,
  descriptors: readonly Descriptor[],
  editing: Editing | null,
  metrics: FontMetrics,
): FlowOverlay[] {
  const id = editedTimeline(block, editing);
  if (id === null) return [];
  const tree = rootOf(block, id);
  if (tree === undefined || !tree.child) return [];
  const label = `Flow control (from ${tree.root.name ?? tree.root.id})`;
  const measure = new TextMeasure(metrics);
  const ids = flowIds(block);
  const ancestorCards = drawing.boxes.flatMap((box) =>
    box.ancestor !== undefined && box.key !== null ? [box.key] : [],
  );
  const lines = drawing.axes.filter(
    (axis) =>
      axis.address.id === id &&
      axis.card.member !== id &&
      axis.card.item !== id &&
      !ancestorCards.some((card) => samePlaceKey(card, axis.card)),
  );
  return lines.flatMap((axis): FlowOverlay[] => {
    const band = flowBandOf(drawing, axis.card);
    if (band === undefined) return [];
    const indices = flowElementsOf(drawing, axis.card, ids);
    const taken = onStretch(drawing.elements, indices, axis.xStart, axis.xEnd);
    if (taken.size === 0) return [];
    // Below the child's row: its line and every band of it drawn with that line.
    const own = drawing.boxes.filter(
      (box) =>
        box.kind === "band" &&
        box.band?.timeline === id &&
        box.band.line === axis.line &&
        box.holder !== null &&
        samePlaceKey(box.holder, axis.card),
    );
    const rowBottom = Math.max(axis.line, ...own.map((box) => box.y + box.height));
    const y = rowBottom + OVERLAY_GAP;
    const labelHeight = measure.lineHeight(OVERLAY_LABEL_SIZE);
    const bandTop = y + OVERLAY_GAP + labelHeight;
    // A band of flow lines alone is 0 wide; its lines then run as high as a label line.
    const area = Math.max(band.height, labelHeight);
    const x = axis.xStart - OVERLAY_GAP;
    const elements = [...taken].sort((left, right) => left - right);
    const items = descriptors.flatMap((descriptor, index) => {
      if (!taken.has(descriptor.source.element)) return [];
      const type = descriptor.source.type;
      const flowLine = type === "break" || type === "section_break" || type === "barline";
      return [itemOf(descriptor, index, flowLine, band.y, band.y + area)];
    });
    return [
      {
        key: `${placeKeyText(axis.card)} ${axis.line}`,
        timeline: id,
        card: axis.card,
        label,
        x,
        y,
        width: Math.max(
          axis.xEnd - axis.xStart + 2 * OVERLAY_GAP,
          measure.width(label, OVERLAY_LABEL_SIZE) + 2 * OVERLAY_GAP,
        ),
        height: OVERLAY_GAP + labelHeight + area + OVERLAY_GAP,
        labelX: axis.xStart,
        baseline: y + OVERLAY_GAP + measure.ascent(OVERLAY_LABEL_SIZE),
        dy: bandTop - band.y,
        elements,
        items,
      },
    ];
  });
}
