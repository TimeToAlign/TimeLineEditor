/**
 * The flow subeditor's pane as drawn: each FlowMap of the edited root drawn
 * as its virtual timeline on the card's scale, by layout's own drawing of a
 * virtual card (`docs/drawing.md` in TimeToShare, section 8.10): its line
 * with its gap lines, its chunks as braces named by their source, their
 * boundaries, a run drawn once as "× n"; never the card's rectangle, name,
 * markers or any band of its own. The pane is an editor overlay: none of
 * it is part of the block's drawing or written with an address.
 */

import type { Block, Manifest, PlaceKey, VirtualTimeline } from "@timetoalign/tilie-core";
import { FlowMapError, resolveFlowMap, samePlaceKey } from "@timetoalign/tilie-core";
import { realOf, toAxisValue, toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type { Drawing, DrawnBox, DrawnElement, LineElement } from "@timetoalign/tilie-layout";
import { draw } from "@timetoalign/tilie-layout";
import type { AttributeValue, Descriptor } from "@timetoalign/tilie-writers";
import { ADDRESS_ATTRIBUTES, attributeText, toDescriptors } from "@timetoalign/tilie-writers";
import type { FontMetrics, Graphical } from "@timetoalign/timetoshare";
import { styleLayers } from "./drawing.ts";
import type { FlowEntry, FlowRow } from "./flowEditor.ts";

/** The gap between the card's bottom edge and the pane, in the block's drawing units. */
export const PANE_GAP = 6;

/** The height of a row's head (its chips and controls), in the block's drawing units. */
export const ROW_HEAD = 16;

/** The width the pane keeps right of its longest row, in the block's drawing units. */
export const PANE_PADDING = 8;

/** The height of the pane's head (Add +, Recompute), in the block's drawing units. */
export const PANE_HEAD = 18;

/** The height of the new FlowMap's row before its first entry, below its head. */
export const EMPTY_DRAFT = 34;

/**
 * The pane's height in the block's drawing units: its head, each row's head
 * and drawing, and the new FlowMap's empty row where one is open
 * (`emptyDraft`).
 */
export function paneHeight(pane: FlowPane, emptyDraft: boolean): number {
  const rows = pane.rows.reduce((sum, row) => sum + ROW_HEAD + row.viewBox.height, 0);
  return PANE_HEAD + rows + (emptyDraft ? ROW_HEAD + EMPTY_DRAFT : 0);
}

/** One element drawn in a row: a descriptor of the virtual card without its address. */
export interface RowItem {
  /** The descriptor's index among the row drawing's descriptors: tells items apart. */
  readonly key: number;
  readonly tag: Descriptor["tag"];
  readonly attributes: Readonly<Record<string, string>>;
  readonly text: string | null;
}

/**
 * Where an entry of a row is drawn, in pane coordinates: a drawn brace's
 * span, or a gap's; `index` its entry, `last` the last entry of the run it
 * is drawn once for (`index` itself outside a run).
 */
export interface ChunkSpan {
  readonly index: number;
  readonly last: number;
  readonly x1: number;
  readonly x2: number;
  readonly gap: boolean;
}

/** One row of the pane as drawn. */
export interface PaneRow {
  readonly row: FlowRow;
  /** Why the FlowMap draws no chunks (it does not resolve); `null` where it resolves. */
  readonly problem: string | null;
  readonly items: readonly RowItem[];
  /** The viewBox of the row's drawing, in the coordinates of its own drawing: pane x 0 at `x`. */
  readonly viewBox: { readonly x: number; readonly y: number; readonly height: number };
  /** The ordinate of the line, from the row drawing's top. */
  readonly lineY: number;
  /** The line's ends, in pane coordinates. */
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly chunks: readonly ChunkSpan[];
  /** The width the row needs, from the pane's left edge. */
  readonly width: number;
}

/**
 * The pane of the flow editor of a root, in the block's drawing units:
 * where it lies (`x`, `y`, from the block drawing's top left corner: the
 * card's left edge, below the card), the card's width, where the card
 * names its rows and starts its line, the width its longest row needs, and
 * its rows.
 */
export interface FlowPane {
  /** The place key of the root's card the pane folds out under. */
  readonly key: PlaceKey;
  readonly x: number;
  readonly y: number;
  readonly card: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly nameX: number;
  readonly lineStart: number;
  readonly width: number;
  readonly rows: readonly PaneRow[];
}

/** A descriptor attribute as the DOM receives it (the SVG writer's text for numbers, points and paths). */
const domValue = (value: AttributeValue): string =>
  typeof value === "string" ? value : attributeText(value);

/** A descriptor drawn in a row: its attributes without the ones writing its address. */
function itemOf(descriptor: Descriptor, key: number): RowItem {
  const attributes: Record<string, string> = {};
  for (const [name, value] of descriptor.attrs) {
    if (ADDRESS_ATTRIBUTES.some((attribute) => attribute === name)) continue;
    attributes[name] = domValue(value);
  }
  return { key, tag: descriptor.tag, attributes, text: descriptor.text };
}

/** The types a row draws of its virtual card: its line, its chunks' braces, labels, leaders, boundaries. */
const DRAWN: ReadonlySet<DrawnElement["type"]> = new Set([
  "timeline",
  "region",
  "label",
  "leader",
  "boundary",
]);

/** Whether `element`, drawn in the card of the row `id`, is one a row draws. */
function drawnInRow(element: DrawnElement, id: string): boolean {
  if (element.address.id !== id || !DRAWN.has(element.type)) return false;
  return element.type === "timeline" || element.address.facet === "regions";
}

/** The card box of `key` in `drawing`. */
function cardBox(drawing: Drawing, key: PlaceKey): DrawnBox | undefined {
  return drawing.boxes.find(
    (box) => box.kind === "card" && box.key !== null && samePlaceKey(box.key, key),
  );
}

/** The first run of each entry: the index of its last entry, for every entry starting a run. */
function runEnds(entries: readonly FlowEntry[]): Map<number, number> {
  const ends = new Map<number, number>();
  for (let index = 0; index < entries.length; ) {
    const entry = entries[index];
    let end = index + 1;
    while (typeof entry === "string" && end < entries.length && entries[end] === entry) end += 1;
    ends.set(index, end - 1);
    index = end;
  }
  return ends;
}

/** IDs not used by `manifest`'s elements: one per row, the rows' virtual timelines in the pane's drawing. */
function rowIds(manifest: Manifest, count: number): string[] {
  const taken = new Set<string>(JSON.stringify(manifest).match(/[A-Za-z_][\w.-]*/g) ?? []);
  let prefix = "tilie_flow_row";
  while ([...taken].some((id) => id.startsWith(prefix))) prefix = `${prefix}_`;
  return Array.from({ length: count }, (_, index) => `${prefix}_${index}`);
}

/**
 * The pane of the flow editor of `root` in `block`, drawn as `drawing` with
 * `graphical` and `metrics`, its rows `rows`: `null` where the root's card is
 * not drawn. Each row is drawn by layout as the card of a virtual timeline
 * applying its FlowMap to the root, a block-held card of its own whose
 * graphical length is the root card's item length times the FlowMap's
 * played length over the root's drawn length (so a played and a written
 * stretch of one length are equally long, unless runs or elisions shorten
 * them), at the item's scale, its line moved to start where the root's
 * card's line does.
 */
export function flowPaneOf(
  block: Block,
  drawing: Drawing,
  graphical: Graphical,
  metrics: FontMetrics,
  root: string,
  rows: readonly FlowRow[],
): FlowPane | null {
  const axis =
    drawing.axes.find(
      (item) => item.address.id === root && item.ancestor === undefined && item.card.item === root,
    ) ?? drawing.axes.find((item) => item.address.id === root && item.card.member === root);
  if (axis === undefined) return null;
  const card = cardBox(drawing, axis.card);
  if (card === undefined) return null;
  const itemKey: PlaceKey = { item: axis.card.item };
  const item = drawing.boxes.find(
    (box) => box.key !== null && samePlaceKey(box.key, itemKey) && box.item !== undefined,
  );
  const length = item?.item?.place.length ?? block.length;
  const scale = item?.item?.place.scale ?? 1;
  const written = toFloat(toRational(axis.drawnEnd));
  const name = drawing.elements.find(
    (element, index) =>
      element.type === "name" &&
      element.address.id === root &&
      index >= card.range.start &&
      index < card.range.end,
  );
  const lineStart = axis.xStart - card.x;
  const nameX = name?.type === "name" ? name.x - card.x : PANE_PADDING;

  const timeline = block.manifest.timelines.find((item) => item.id === root);
  const ids = rowIds(block.manifest, rows.length);
  const virtual: VirtualTimeline[] = [];
  const problems = new Map<number, string>();
  /** Each drawn row's played length, as a float, by its virtual timeline's ID. */
  const played = new Map<string, number>();
  rows.forEach((row, index) => {
    const id = ids[index] ?? "";
    try {
      const resolved = resolveFlowMap(block.manifest, row.id);
      virtual.push({
        id,
        map: row.id,
        timeline: root,
        name: row.name,
        unit: resolved.unit,
        number_type: resolved.numberType,
        length: toAxisValue(resolved.length),
      });
      played.set(id, toFloat(toRational(realOf(resolved.length))));
    } catch (error) {
      if (!(error instanceof FlowMapError)) throw error;
      problems.set(index, error.message);
    }
  });
  const manifest: Manifest = {
    ...block.manifest,
    virtual_timelines: [...(block.manifest.virtual_timelines ?? []), ...virtual],
  };
  const places = { ...block.places };
  const step = 10 * Math.max(drawing.height, 1);
  for (const [index, entry] of virtual.entries()) {
    const lambda = played.get(entry.id) ?? 0;
    places[entry.id] = {
      x: 0,
      y: step * (index + 1),
      length: written > 0 && timeline?.length !== null ? (length * lambda) / written : length,
      scale,
    };
  }
  const rowsDrawing =
    virtual.length === 0
      ? null
      : draw(
          manifest,
          { ...block, places, arrangement: null },
          styleLayers(graphical, manifest),
          metrics,
        );
  const descriptors = rowsDrawing === null ? [] : toDescriptors(rowsDrawing);

  const drawn = rows.map((row, index): PaneRow => {
    const id = ids[index] ?? "";
    const problem = problems.get(index) ?? null;
    const box = rowsDrawing === null ? undefined : cardBox(rowsDrawing, { item: id });
    const rowAxis = rowsDrawing?.axes.find((item) => item.address.id === id);
    if (rowsDrawing === null || box === undefined || rowAxis === undefined) {
      return {
        row,
        problem: problem ?? "the FlowMap is not drawn",
        items: [],
        viewBox: { x: 0, y: 0, height: 0 },
        lineY: 0,
        lineStart,
        lineEnd: lineStart,
        chunks: [],
        width: 0,
      };
    }
    const viewX = rowAxis.xStart - lineStart;
    const items = descriptors.flatMap((descriptor, key) => {
      const element = rowsDrawing.elements[descriptor.source.element];
      const inside =
        descriptor.source.element >= box.range.start && descriptor.source.element < box.range.end;
      return element !== undefined && inside && drawnInRow(element, id)
        ? [itemOf(descriptor, key)]
        : [];
    });
    const ends = runEnds(row.entries);
    const chunks: ChunkSpan[] = [];
    const line = rowsDrawing.elements.find(
      (element): element is LineElement => element.type === "timeline" && element.address.id === id,
    );
    const gapIndices = row.entries.flatMap((entry, at) => (typeof entry === "string" ? [] : [at]));
    for (const [at, cut] of (line?.gapLines ?? []).entries()) {
      const index = gapIndices[at];
      if (index !== undefined) {
        chunks.push({ index, last: index, x1: cut[0] - viewX, x2: cut[1] - viewX, gap: true });
      }
    }
    for (const element of rowsDrawing.elements) {
      if (element.type !== "region" || element.address.id !== id) continue;
      const [index] = element.address.part ?? [];
      if (typeof index !== "number") continue;
      chunks.push({
        index,
        last: ends.get(index) ?? index,
        x1: element.x1 - viewX,
        x2: element.x2 - viewX,
        gap: false,
      });
    }
    chunks.sort((left, right) => left.index - right.index);
    return {
      row,
      problem,
      items,
      viewBox: { x: viewX, y: box.y, height: box.height },
      lineY: rowAxis.line - box.y,
      lineStart: rowAxis.xStart - viewX,
      lineEnd: rowAxis.xEnd - viewX,
      chunks,
      width: box.x + box.width - viewX,
    };
  });
  return {
    key: axis.card,
    x: card.x,
    y: card.y + card.height + PANE_GAP,
    card: { x: card.x, y: card.y, width: card.width, height: card.height },
    nameX,
    lineStart,
    width: Math.max(card.width, ...drawn.map((row) => row.width + PANE_PADDING)),
    rows: drawn,
  };
}
