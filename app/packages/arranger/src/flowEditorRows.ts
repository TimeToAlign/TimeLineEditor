/**
 * The flow subeditor's pane as drawn: each FlowMap of the edited root drawn
 * as its virtual timeline on the card's scale, by layout's own drawing of a
 * virtual card (`docs/drawing.md` in TimeToShare, section 8.10): its line
 * with its gap lines, its chunks as segments of the line, each labelled
 * above the line by its source, their boundaries, a run drawn once as
 * "× n"; never the card's rectangle, name,
 * markers or any band of its own. Each row is named in a name column of
 * the pane's own, its name cut as a drawing cuts a row's name (section
 * 6.6), and its line starts at least `G'` right of that column (section
 * 8.2), so no name covers a line. The pane is an editor overlay: none of
 * it is part of the block's drawing or written with an address.
 */

import type { Block, Manifest, PlaceKey, VirtualTimeline } from "@timetoalign/tilie-core";
import { FlowMapError, resolveFlowMap, samePlaceKey } from "@timetoalign/tilie-core";
import { realOf, toAxisValue, toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type {
  Drawing,
  DrawnBox,
  DrawnElement,
  LineElement,
  Style,
  TextElement,
} from "@timetoalign/tilie-layout";
import { cleanText, cutText, draw, G, TextMeasure } from "@timetoalign/tilie-layout";
import { toDescriptors } from "@timetoalign/tilie-writers";
import type { FontMetrics, Graphical } from "@timetoalign/timetoshare";
import { styleLayers } from "./drawing.ts";
import type { FlowEntry, FlowRow } from "./flowEditor.ts";
import type { OverlayItem } from "./flowOverlay.ts";
import { overlayItem } from "./flowOverlay.ts";
import { drawnChunks } from "./ribbons.ts";

/** The gap between the card's bottom edge and the pane, in the block's drawing units. */
export const PANE_GAP = 6;

/** The height of a row's head (its chips and controls), in the block's drawing units. */
export const ROW_HEAD = 16;

/** The width the pane keeps right of its longest row, in the block's drawing units. */
export const PANE_PADDING = 8;

/** The font size of the pane's texts, its rows' names among them, in the block's drawing units. */
export const PANE_FONT_SIZE = 9;

/** The height of the pane's head (Add +, Recompute), in the block's drawing units. */
export const PANE_HEAD = 18;

/** The height of the new FlowMap's row before its first entry, below its head. */
export const EMPTY_DRAFT = 34;

/** The room the pane leaves between its right edge and the canvas's, in screen pixels. */
export const PANE_MARGIN = 16;

/** How far right of the pane's right edge "Place as card" puts a row's card, in screen pixels. */
export const PLACE_GAP = 4;

/**
 * The pane's width as shown, in the block's drawing units: the width its
 * longest row needs, or `room`, what the canvas leaves right of the pane's
 * left edge, where that is less, never narrower than the card; wider rows
 * scroll inside it.
 */
export function shownWidth(pane: FlowPane, room: number): number {
  return Math.min(pane.width, Math.max(pane.card.width, room));
}

/**
 * The pane's height in the block's drawing units: its head, each row's head
 * and drawing, and the new FlowMap's empty row where one is open
 * (`emptyDraft`).
 */
export function paneHeight(pane: FlowPane, emptyDraft: boolean): number {
  const rows = pane.rows.reduce((sum, row) => sum + ROW_HEAD + row.viewBox.height, 0);
  return PANE_HEAD + rows + (emptyDraft ? ROW_HEAD + EMPTY_DRAFT : 0);
}

/**
 * Where "Place as card" puts the card of the row `id` of `pane`, its rows
 * shown in the order `rows`, in the block's drawing units from the
 * drawing's top left corner: its top at the top of the row's drawing, so
 * each card stands at the height of its row, one under another in the
 * rows' order and never on another, and its left edge `gap` right of the
 * pane's right edge as shown (`width`, `shownWidth`), so no card lies
 * under the pane while the editor is open, whatever the pane's width at
 * the canvas's zoom and room, and, once it is closed, the cards stand
 * indented under the root's card, each at the same indent. `null` for a
 * row not shown.
 */
export function rowPlace(
  pane: FlowPane,
  rows: readonly PaneRow[],
  id: string,
  shown: { readonly width: number; readonly gap: number },
): { readonly x: number; readonly y: number } | null {
  let y = pane.y + PANE_HEAD;
  for (const row of rows) {
    if (row.row.id === id) return { x: pane.x + shown.width + shown.gap, y: y + ROW_HEAD };
    y += ROW_HEAD + row.viewBox.height;
  }
  return null;
}

/**
 * Where an entry of a row is drawn, in pane coordinates: a drawn chunk's
 * segment, or a gap's; `index` its entry, `last` the last entry of the run it
 * is drawn once for (`index` itself outside a run).
 */
export interface ChunkSpan {
  readonly index: number;
  readonly last: number;
  readonly x1: number;
  readonly x2: number;
  readonly gap: boolean;
}

/**
 * A row's name in the pane's name column, cut as a drawing cuts a row's
 * name (`docs/drawing.md` in TimeToShare, section 6.6): to the `max-width`
 * of a name, at the pane's font size `PANE_FONT_SIZE`.
 */
export interface PaneName {
  /** The text shown: the row's name, cut with `…` where it is wider than its `max-width`. */
  readonly text: string;
  /** The row's whole name where `text` is cut, shown on hover; `null` where it is shown whole. */
  readonly whole: string | null;
}

/** One row of the pane as drawn. */
export interface PaneRow {
  readonly row: FlowRow;
  readonly name: PaneName;
  /** Why the FlowMap draws no chunks (it does not resolve); `null` where it resolves. */
  readonly problem: string | null;
  readonly items: readonly OverlayItem[];
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
  /**
   * Where every row's line starts: where the card's does, or further right
   * where the rows' own name column needs it, at least `G'` right of its
   * widest name.
   */
  readonly lineStart: number;
  readonly width: number;
  /**
   * The drawing units a unit of the root's axis takes on every row, where
   * nothing is elided (`scale × L / λ`, the card's scale and item length
   * over the root's drawn length); 0 for a root of unknown length.
   */
  readonly unit: number;
  readonly rows: readonly PaneRow[];
}

/** The types a row draws of its virtual card: its line, its chunks' labels, leaders, boundaries. */
const DRAWN: ReadonlySet<DrawnElement["type"]> = new Set([
  "timeline",
  "label",
  "leader",
  "boundary",
]);

/** Whether `element`, drawn in the card of the row `id`, is one a row draws. */
function drawnInRow(element: DrawnElement, id: string): boolean {
  if (element.address.id !== id || !DRAWN.has(element.type)) return false;
  const { facet, part } = element.address;
  return element.type === "timeline" || (facet === undefined && typeof part?.[0] === "number");
}

/** The name of the timeline `id` that `drawing` draws within `range` (its card's); `undefined` where none is drawn. */
function nameIn(
  drawing: Drawing,
  id: string,
  range: { readonly start: number; readonly end: number },
): TextElement | undefined {
  for (let index = range.start; index < range.end; index += 1) {
    const element = drawing.elements[index];
    if (element?.type === "name" && element.address.id === id) return element;
  }
  return undefined;
}

/**
 * The name `text` of a row as the pane's name column shows it: cut to
 * `maximum`, the `max-width` of a name, at the pane's font size, with its
 * width.
 */
function paneName(
  measure: TextMeasure,
  text: string,
  maximum: Style["max-width"],
): { readonly name: PaneName; readonly width: number } {
  const whole = cleanText(text);
  const cut = cutText(measure, whole, PANE_FONT_SIZE, maximum);
  return { name: { text: cut.text, whole: cut.text === whole ? null : whole }, width: cut.width };
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
  const name = nameIn(drawing, root, card.range);
  const cardLineStart = axis.xStart - card.x;
  const nameX = name === undefined ? PANE_PADDING : name.x - card.x;

  const timeline = block.manifest.timelines.find((item) => item.id === root);
  const known = written > 0 && timeline?.length !== null;
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
      length: known ? (length * lambda) / written : length,
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

  // The rows' own name column (section 6.6): each row's name cut to the max-width of its card's
  // name, else of the root's, else drawn whole; the lines start G' right of the widest, never left
  // of the card's line.
  const measure = new TextMeasure(metrics);
  const names = rows.map((row, index) => {
    const id = ids[index] ?? "";
    const box = rowsDrawing === null ? undefined : cardBox(rowsDrawing, { item: id });
    const own =
      rowsDrawing === null || box === undefined ? undefined : nameIn(rowsDrawing, id, box.range);
    return paneName(measure, row.name, (own ?? name)?.style["max-width"] ?? "none");
  });
  const widest = Math.max(0, ...names.map((item) => item.width));
  const lineStart =
    names.length === 0 ? cardLineStart : Math.max(cardLineStart, nameX + widest + G * scale);

  const drawn = rows.map((row, index): PaneRow => {
    const id = ids[index] ?? "";
    const problem = problems.get(index) ?? null;
    const box = rowsDrawing === null ? undefined : cardBox(rowsDrawing, { item: id });
    const rowAxis = rowsDrawing?.axes.find((item) => item.address.id === id);
    const shown = names[index]?.name ?? { text: row.name, whole: null };
    if (rowsDrawing === null || box === undefined || rowAxis === undefined) {
      return {
        row,
        name: shown,
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
        ? [overlayItem(descriptor, key)]
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
    for (const drawnChunk of drawnChunks(rowsDrawing)) {
      const { index } = drawnChunk;
      if (drawnChunk.timeline !== id || gapIndices.includes(index)) continue;
      if (!samePlaceKey(drawnChunk.card, { item: id })) continue;
      chunks.push({
        index,
        last: ends.get(index) ?? index,
        x1: drawnChunk.x1 - viewX,
        x2: drawnChunk.x2 - viewX,
        gap: false,
      });
    }
    chunks.sort((left, right) => left.index - right.index);
    return {
      row,
      name: shown,
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
    unit: known ? (scale * length) / written : 0,
    rows: drawn,
  };
}
