/**
 * `draw(manifest, placement, layers, metrics)`: the drawing of one
 * TimeSkeleton manifest (`docs/drawing.md` in timeskeleton, sections 1 to 6).
 */

import {
  type BandGroup,
  BLOCK_KEY,
  type ConversionMap,
  type ElementKey,
  elementKey,
  type Manifest,
  orderedChildren,
  type Real,
  type TimelineManifest,
  textKey,
  timelineAncestry,
} from "@timetoalign/tilie-core";
import type { ElementType, FontMetrics, Graphical, TimeUnit } from "@timetoalign/timeskeleton";
import { canonicalOrder } from "@timetoalign/timeskeleton";
import { Cascade, type Side, type Style } from "./cascade.ts";
import { cleanText, TextMeasure } from "./metrics.ts";
import {
  add,
  coordinateText,
  coordinateValue,
  exactDistance,
  midpoint,
  proportion,
  zero,
} from "./numbers.ts";

/** Where and how large the drawing is placed (section 1). */
export interface Placement {
  readonly length: number;
  readonly spacing: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly order: readonly [BandGroup, BandGroup, BandGroup];
}

export const DEFAULT_PLACEMENT: Placement = {
  length: 400,
  spacing: 1,
  width: null,
  height: null,
  order: ["children", "regions", "flow"],
};

export interface ShownCoordinate {
  readonly unit: TimeUnit;
  readonly value: Real;
}

interface Addressed {
  readonly address: string;
  readonly style: Style;
}

export interface BlockElement {
  readonly type: "block";
  readonly address: null;
  readonly style: Style;
  readonly width: number;
  readonly height: number;
}

export interface LineElement extends Addressed {
  readonly type: "timeline" | "child";
  readonly xs: number;
  readonly xe: number;
  readonly y: number;
  /** A locked timeline ends with an open diamond, any other with an arrowhead. */
  readonly locked: boolean;
}

export interface MapElement extends Addressed {
  readonly type: "map";
  readonly xs: number;
  readonly xe: number;
  /** The centre of the closed double line. */
  readonly yc: number;
}

export interface RegionElement extends Addressed {
  readonly type: "region";
  readonly x1: number;
  readonly x2: number;
  readonly xm: number;
  readonly yb: number;
  readonly ya: number;
}

/** A point `(x, y)` in box-local canvas units. */
export type Point = readonly [number, number];

export interface JumpElement extends Addressed {
  readonly type: "jump";
  /** The curve's start `P0` and its controls `C1`, `C2`. */
  readonly start: Point;
  readonly c1: Point;
  readonly c2: Point;
  /** The arrowhead's tip `P3`, the curve's end. */
  readonly tip: Point;
  /** The arrowhead's base centre `Bh`, where the shaft ends. */
  readonly base: Point;
  /** The arrowhead's base corners `Bh − 2w × n` and `Bh + 2w × n`. */
  readonly corners: readonly [Point, Point];
}

export interface BreakElement extends Addressed {
  readonly type: "break";
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
}

export interface MarkerElement extends Addressed {
  readonly type: "wedge";
  readonly x: number;
  readonly yt: number;
  readonly yb: number;
}

export interface TextElement extends Addressed {
  readonly type: "name" | "label";
  readonly x: number;
  readonly baseline: number;
  readonly anchor: "start" | "middle";
  readonly text: string;
  readonly coordinate?: ShownCoordinate;
}

export type DrawnElement =
  | BlockElement
  | LineElement
  | MapElement
  | RegionElement
  | JumpElement
  | BreakElement
  | MarkerElement
  | TextElement;

export interface Drawing {
  readonly width: number;
  readonly height: number;
  readonly elements: readonly DrawnElement[];
  readonly unmapped: readonly number[];
}

const P = 8;
const G = 8;
/** The map double-line spacing `d`. */
export const MAP_SPACING = 2;
/** The map gap `g`. */
const MAP_GAP = 3;
export const MARKER_BASE = 6;
const MARKER_HEIGHT = 13;
const LABEL_GAP = 2;
const BRACE = 6;
const BREAK_LABEL_OFFSET = 3;

type Extent = readonly [number, number];

function conflicts([a1, b1]: Extent, [a2, b2]: Extent): boolean {
  return (a1 < b2 && a2 < b1) || a1 === a2;
}

class Rows {
  readonly rows: Extent[][] = [];

  place(extent: Extent, minimum = 1): number {
    let row = minimum;
    while ((this.rows[row - 1] ?? []).some((other) => conflicts(extent, other))) row += 1;
    while (this.rows.length < row) this.rows.push([]);
    (this.rows[row - 1] as Extent[]).push(extent);
    return row;
  }

  get count(): number {
    return this.rows.length;
  }
}

interface Styled {
  readonly address: string;
  readonly style: Style;
}

interface Entry {
  readonly manifest: TimelineManifest;
  readonly parent: Entry | undefined;
  readonly start: Real;
  readonly end: Real;
  readonly style: Style;
  readonly name: Styled;
}

interface Owned extends Styled {
  readonly entry: Entry;
  readonly side: Side;
  readonly label: Styled;
}

interface NameItem {
  readonly name: Styled;
  readonly text: string;
}

interface NameRow {
  readonly side: Side | null;
  readonly band: "root" | "child";
  readonly row: number;
  readonly items: NameItem[];
}

interface DrawnName {
  readonly row: NameRow;
  readonly first: Styled;
  readonly text: string;
  readonly width: number;
}

const opposite = (side: Side): Side => (side === "above" ? "below" : "above");
const shown = (style: Style): boolean => style.display === "inline";

/** Draw one manifest. */
export function draw(
  manifest: Manifest,
  placement: Placement,
  layers: readonly (Graphical | undefined)[],
  metrics: FontMetrics,
): Drawing {
  const ordered = canonicalOrder(manifest as never) as unknown as Manifest;
  const root = ordered.timeline;
  const L = placement.length;
  const v = placement.spacing;
  const measure = new TextMeasure(metrics);
  const h = (size: number) => measure.lineHeight(size);
  const a = (size: number) => measure.ascent(size);
  const d = (size: number) => measure.descent(size);

  const cascade = new Cascade(layers, timelineAncestry(ordered));
  const blockStyle = cascade.resolve(BLOCK_KEY, undefined);
  const styled = (key: ElementKey, parent: Style): Styled => ({
    address: key.address as string,
    style: cascade.resolve(key, parent),
  });
  const textOf = (owner: ElementKey, ownerStyle: Style, kind: "name" | "label"): Styled =>
    styled(textKey(owner, kind), ownerStyle);

  const entries: Entry[] = [];
  const visit = (timeline: TimelineManifest, parent: Entry | undefined, start: Real) => {
    const key = elementKey(parent === undefined ? "timeline" : "child", timeline.id, timeline);
    const style = cascade.resolve(key, parent === undefined ? blockStyle : parent.style);
    const entry: Entry = {
      manifest: timeline,
      parent,
      start,
      end: add(start, coordinateValue(timeline.length)),
      style,
      name: textOf(key, style, "name"),
    };
    entries.push(entry);
    for (const child of orderedChildren(timeline)) {
      visit(child.timeline, entry, add(start, coordinateValue(child.offset)));
    }
  };
  visit(root, undefined, zero(root.number_type));
  const rootEntry = entries[0] as Entry;
  const lambda = coordinateValue(root.length);
  const u = (value: Real) => proportion(value, lambda);
  const relativeX = (value: Real) => L * u(value);
  const rootWidth = rootEntry.style["stroke-width"];

  const owned = (
    type: ElementType,
    address: string,
    entry: Entry,
    parent: Style,
    map?: ConversionMap,
  ): Owned => {
    const key = elementKey(type, address, entry.manifest, map);
    const style = cascade.resolve(key, parent);
    return { address, style, entry, side: style.side, label: textOf(key, style, "label") };
  };
  const maps: Owned[] = [];
  const regions: (Owned & { start: Real; end: Real; text: string | null })[] = [];
  const breaks: (Owned & { at: Real; text: string | null })[] = [];
  const jumps: (Owned & { from: Real; to: Real; text: string })[] = [];
  for (const entry of entries) {
    const timeline = entry.manifest;
    for (const map of timeline.conversion_maps) {
      maps.push(owned("map", map.id, entry, entry.style, map));
    }
    for (const region of timeline.regions) {
      regions.push({
        ...owned("region", region.id, entry, entry.style),
        start: add(entry.start, coordinateValue(region.start)),
        end: add(entry.start, coordinateValue(region.end)),
        text: region.name,
      });
    }
    for (const item of timeline.flow_control.breaks) {
      breaks.push({
        ...owned("break", item.id, entry, entry.style),
        at: add(entry.start, coordinateValue(item.coordinate)),
        text: item.label,
      });
    }
    for (const item of timeline.flow_control.jumps) {
      jumps.push({
        ...owned("jump", item.id, entry, entry.style),
        from: add(entry.start, coordinateValue(item.from_coordinate)),
        to: add(entry.start, coordinateValue(item.to_coordinate)),
        text: item.label ?? item.control_type,
      });
    }
  }

  interface Marker extends Owned {
    readonly at: Real;
  }
  const markers: Marker[] = [
    { ...owned("wedge", `${root.id}/start`, rootEntry, rootEntry.style), at: rootEntry.start },
    { ...owned("wedge", `${root.id}/end`, rootEntry, rootEntry.style), at: lambda },
  ];
  const label = (owner: Owned, text: string) => {
    const clean = cleanText(text);
    return { clean, width: measure.width(clean, owner.label.style["font-size"]) };
  };
  const markerLabels = markers
    .filter((marker) => shown(marker.style) && shown(marker.label.style))
    .map((marker) => ({
      marker,
      ...label(marker, coordinateText(marker.at, root.unit)),
      u: u(marker.at),
    }));
  const drawnRegions = regions.filter((region) => shown(region.style));
  const regionLabels = new Map(
    drawnRegions
      .filter((region) => region.text !== null && shown(region.label.style))
      .map((region) => [
        region,
        { ...label(region, region.text as string), at: midpoint(region.start, region.end) },
      ]),
  );
  const drawnJumps = jumps.filter((jump) => shown(jump.style));
  const jumpLabels = new Map(
    drawnJumps
      .filter((jump) => shown(jump.label.style))
      .map((jump) => [jump, { ...label(jump, jump.text), at: midpoint(jump.from, jump.to) }]),
  );
  const drawnBreaks = breaks.filter((item) => shown(item.style));
  const breakLabels = new Map(
    drawnBreaks
      .filter((item) => item.text !== null && shown(item.label.style))
      .map((item) => [item, label(item, item.text as string)]),
  );

  const drawnChildren = entries.slice(1).filter((entry) => shown(entry.style));
  // A map is drawn only when its timeline's line is drawn.
  const drawnMaps = maps.filter((map) => shown(map.style) && shown(map.entry.style));
  const stacks = new Map<Entry, Record<Side, Owned[]>>();
  for (const map of drawnMaps) {
    if (!stacks.has(map.entry)) stacks.set(map.entry, { above: [], below: [] });
    (stacks.get(map.entry) as Record<Side, Owned[]>)[map.side].push(map);
  }
  /** The reach `e = w / 2 + J × (g + d)` of a timeline's map stack on a side, 0 when empty. */
  const stackReach = (entry: Entry, side: Side): number => {
    const count = stacks.get(entry)?.[side].length ?? 0;
    return count === 0 ? 0 : entry.style["stroke-width"] / 2 + count * (MAP_GAP + MAP_SPACING);
  };
  const childRows = { above: new Rows(), below: new Rows() };
  const childRow = new Map<Entry, number>();
  const anchors = new Map<Entry, Record<Side, number>>([[rootEntry, { above: 0, below: 0 }]]);
  for (const entry of entries.slice(1)) {
    const parent = anchors.get(entry.parent as Entry) as Record<Side, number>;
    if (!shown(entry.style)) {
      anchors.set(entry, { ...parent });
      continue;
    }
    const side = entry.style.side;
    const row = childRows[side].place(
      [relativeX(entry.start), relativeX(entry.end)],
      parent[side] + 1,
    );
    childRow.set(entry, row);
    anchors.set(entry, { ...parent, [side]: row });
  }

  const rows = new Map<string, NameRow>();
  const joinRow = (
    band: NameRow["band"],
    side: Side | null,
    row: number,
    name: Styled,
    text: string,
  ) => {
    const id = `${band}/${side}/${row}`;
    if (!rows.has(id)) rows.set(id, { side, band, row, items: [] });
    (rows.get(id) as NameRow).items.push({ name, text });
  };
  if (shown(rootEntry.style)) {
    joinRow("root", null, 0, rootEntry.name, rootEntry.manifest.name ?? rootEntry.manifest.id);
  }
  for (const entry of drawnChildren) {
    joinRow(
      "child",
      entry.style.side,
      childRow.get(entry) as number,
      entry.name,
      entry.manifest.name ?? entry.manifest.id,
    );
  }
  const nameRows = [...rows.values()];

  const cutName = (text: string, size: number, maximum: number | "none"): string => {
    if (maximum === "none" || measure.width(text, size) <= maximum) return text;
    const ellipsis = "…";
    const points = Array.from(text);
    while (points.length > 0 && measure.width(`${points.join("")}${ellipsis}`, size) > maximum) {
      points.pop();
    }
    return `${points.join("")}${ellipsis}`;
  };
  const drawnNames: DrawnName[] = [];
  for (const row of nameRows) {
    const visible = row.items.filter((item) => shown(item.name.style));
    const firstItem = visible[0];
    if (firstItem === undefined) continue;
    const first = firstItem.name;
    const source =
      first.style.content === "none"
        ? visible.map((item) => item.text).join(", ")
        : first.style.content;
    const clean = cleanText(source);
    const text = cutName(clean, first.style["font-size"], first.style["max-width"]);
    drawnNames.push({ row, first, text, width: measure.width(text, first.style["font-size"]) });
  }
  const N = drawnNames.length === 0 ? 0 : Math.max(...drawnNames.map((item) => item.width));
  const centred = [
    ...markerLabels.map((item) => ({ width: item.width, u: item.u })),
    ...[...regionLabels.values()].map((item) => ({ width: item.width, u: u(item.at) })),
    ...[...jumpLabels.values()].map((item) => ({ width: item.width, u: u(item.at) })),
  ];
  let x0 = P + N + (drawnNames.length === 0 ? 0 : G);
  for (const item of centred) x0 = Math.max(x0, P + item.width / 2 - L * item.u);
  const x = (value: Real) => x0 + relativeX(value);

  const labelExtent = (centre: number, width: number): Extent => [
    centre - width / 2 - 1,
    centre + width / 2 + 1,
  ];
  const widen = ([a1, b1]: Extent, [a2, b2]: Extent): Extent => [
    Math.min(a1, a2),
    Math.max(b1, b2),
  ];
  const markerTiers = { above: new Rows(), below: new Rows() };
  const markerTier = new Map<(typeof markerLabels)[number], number>();
  for (const item of markerLabels) {
    markerTier.set(
      item,
      markerTiers[item.marker.side].place(labelExtent(relativeX(item.marker.at), item.width)),
    );
  }
  const regionRows = { above: new Rows(), below: new Rows() };
  const regionRow = new Map<(typeof regions)[number], number>();
  for (const region of drawnRegions) {
    const xs = relativeX(region.start);
    const xe = relativeX(region.end);
    let extent: Extent = [Math.min(xs, xe), Math.max(xs, xe)];
    const text = regionLabels.get(region);
    if (text !== undefined) extent = widen(extent, labelExtent(relativeX(text.at), text.width));
    regionRow.set(region, regionRows[region.side].place(extent));
  }
  const jumpLevels = { above: new Rows(), below: new Rows() };
  const jumpLevel = new Map<(typeof jumps)[number], number>();
  const placedJumps = drawnJumps
    .map((jump, index) => ({ jump, index, span: exactDistance(jump.to, jump.from) }))
    .sort((left, right) => left.span.compare(right.span) || left.index - right.index)
    .map(({ jump }) => jump);
  for (const jump of placedJumps) {
    const xFrom = relativeX(jump.from);
    const xTo = relativeX(jump.to);
    let extent: Extent = [Math.min(xFrom, xTo), Math.max(xFrom, xTo)];
    const text = jumpLabels.get(jump);
    if (text !== undefined) extent = widen(extent, labelExtent(relativeX(text.at), text.width));
    jumpLevel.set(jump, jumpLevels[jump.side].place(extent));
  }
  const breakTiers = { above: new Rows(), below: new Rows() };
  const breakTier = new Map<(typeof breaks)[number], number>();
  // The labels of a side's breaks fill the break-label tiers of that side's flow band.
  for (const item of drawnBreaks) {
    const text = breakLabels.get(item);
    if (text === undefined) continue;
    const left = relativeX(item.at) + BREAK_LABEL_OFFSET;
    breakTier.set(item, breakTiers[item.side].place([left - 1, left + text.width + 1]));
  }

  const maxSize = (items: readonly Styled[], fallback = 9): number =>
    items.length === 0 ? fallback : Math.max(...items.map((item) => item.style["font-size"]));
  const rootNameSize = rootEntry.name.style["font-size"];
  const nameBandSize = (side: Side): number =>
    Math.max(
      ...nameRows
        .filter((row) => row.band === "child" && row.side === side)
        .flatMap((row) => row.items.map((item) => item.name.style["font-size"])),
    );
  const wedgeLabelSize = (side: Side) =>
    maxSize(
      markerLabels.filter((item) => item.marker.side === side).map((item) => item.marker.label),
    );
  const regionLabelSize = (side: Side) =>
    maxSize(
      [...regionLabels.keys()].filter((item) => item.side === side).map((item) => item.label),
    );
  /** The largest label font size of a side's flow band: its jump and break labels. */
  const flowLabelSize = (side: Side) =>
    maxSize(
      [...jumpLabels.keys(), ...breakLabels.keys()]
        .filter((item) => item.side === side)
        .map((item) => item.label),
    );

  const B = 4 * v;
  const p0 = Math.max(14 * v, h(rootNameSize));
  interface Bands {
    /** The distance of each child row's line from the root's line, row 1 first. */
    rows: number[];
    region: number;
    pr: number;
    flow: number;
    pj: number;
    edge: number;
  }
  const bands = (side: Side): Bands => {
    let edge = 0;
    let first = true;
    const next = (width: number, minimum = 0): number => {
      const start = Math.max(first ? 0 : edge + B, minimum);
      edge = start + width;
      first = false;
      return start;
    };
    const result: Omit<Bands, "edge"> = {
      rows: [],
      region: 0,
      pr: 0,
      flow: 0,
      pj: 0,
    };
    const wedgeDrawn = markers.some((marker) => marker.side === side && shown(marker.style));
    const rootReach = stackReach(rootEntry, side);
    if (wedgeDrawn || rootReach > 0) {
      const tiers = markerTiers[side].count;
      const wedgeReach = wedgeDrawn
        ? rootWidth / 2 +
          MARKER_HEIGHT +
          (tiers === 0 ? 0 : LABEL_GAP + tiers * h(wedgeLabelSize(side)))
        : 0;
      next(Math.max(wedgeReach, rootReach));
    }
    const addGroup = (group: BandGroup) => {
      if (group === "children" && childRows[side].count > 0) {
        const p = Math.max(14 * v, h(nameBandSize(side)));
        const halves = (half: Side) =>
          childRows[side].rows.map((_, index) =>
            Math.max(
              p / 2,
              ...drawnChildren
                .filter((entry) => entry.style.side === side && childRow.get(entry) === index + 1)
                .map((entry) => stackReach(entry, half)),
            ),
          );
        const inner = halves(opposite(side));
        const outer = halves(side);
        let width = 0;
        inner.forEach((half, index) => {
          width = width + half + (outer[index] as number);
        });
        const c0 = next(width, p0 / 2);
        let line = c0 + (inner[0] as number);
        result.rows.push(line);
        for (let index = 1; index < inner.length; index += 1) {
          line = line + ((outer[index - 1] as number) + (inner[index] as number));
          result.rows.push(line);
        }
      } else if (group === "regions" && regionRows[side].count > 0) {
        result.pr = BRACE + LABEL_GAP + h(regionLabelSize(side)) + 4 * v;
        result.region = next(regionRows[side].count * result.pr - 4 * v);
      } else if (group === "flow") {
        const levels = jumpLevels[side].count;
        if (levels > 0 || drawnBreaks.some((item) => item.side === side)) {
          const size = flowLabelSize(side);
          const tiers = breakTiers[side].count * h(size);
          result.pj = 10 * v + h(size);
          const start = next(
            levels === 0 ? tiers : tiers + 8 * v + (levels - 1) * result.pj + LABEL_GAP + h(size),
          );
          result.flow = start + tiers;
        }
      }
    };
    for (const group of placement.order) addGroup(group);
    return { ...result, edge };
  };
  const above = bands("above");
  const below = bands("below");
  const band = (side: Side) => (side === "above" ? above : below);

  const yRoot = Math.max(P + above.edge, P + h(rootNameSize) / 2);
  const Hc = yRoot + Math.max(below.edge, h(rootNameSize) / 2) + P;
  const yAt = (side: Side, outwards: number) =>
    side === "above" ? yRoot - outwards : yRoot + outwards;
  const beyond = (side: Side, y: number, size: number) =>
    side === "above" ? y - d(size) : y + a(size);
  const rowLine = (side: Side, row: number): number =>
    yAt(side, band(side).rows[row - 1] as number);
  const lineY = (entry: Entry): number =>
    entry === rootEntry ? yRoot : rowLine(entry.style.side, childRow.get(entry) as number);

  const elements: DrawnElement[] = [];
  for (const item of drawnBreaks) {
    elements.push({
      type: "break",
      address: item.address,
      style: item.style,
      x: x(item.at),
      y1: yAt(item.side, band(item.side).flow),
      y2: item.side === "below" ? P : Hc - P,
    });
  }
  for (const map of drawnMaps) {
    const { entry, side } = map;
    const j = (stacks.get(entry) as Record<Side, Owned[]>)[side].indexOf(map) + 1;
    const centre = entry.style["stroke-width"] / 2 + j * (MAP_GAP + MAP_SPACING) - MAP_SPACING / 2;
    const y = lineY(entry);
    elements.push({
      type: "map",
      address: map.address,
      style: map.style,
      xs: x(entry.start),
      xe: x(entry.end),
      yc: side === "above" ? y - centre : y + centre,
    });
  }
  const regionArms = (region: (typeof regions)[number]) => {
    const own = band(region.side);
    return own.region + ((regionRow.get(region) as number) - 1) * own.pr;
  };
  for (const region of drawnRegions) {
    const outwards = regionArms(region);
    elements.push({
      type: "region",
      address: region.address,
      style: region.style,
      x1: x(region.start),
      x2: x(region.end),
      xm: x(midpoint(region.start, region.end)),
      yb: yAt(region.side, outwards),
      ya: yAt(region.side, outwards + BRACE),
    });
  }
  const apex = (jump: (typeof jumps)[number]) => {
    const own = band(jump.side);
    return own.flow + 8 * v + ((jumpLevel.get(jump) as number) - 1) * own.pj;
  };
  for (const jump of placedJumps) {
    const yf = yAt(jump.side, band(jump.side).flow);
    const ya = yAt(jump.side, apex(jump));
    const w = jump.style["stroke-width"];
    const xf = x(jump.from);
    const xt = x(jump.to);
    const q = (xt - xf) / 4;
    const yc = yf + (4 / 3) * (ya - yf);
    const cx = xt - q;
    // The head points along the curve's direction at its end, from C2 to P3.
    const length = Math.sqrt((xt - cx) * (xt - cx) + (yf - yc) * (yf - yc));
    const ux = (xt - cx) / length;
    const uy = (yf - yc) / length;
    const base: Point = [xt - 4 * w * ux, yf - 4 * w * uy];
    const [nx, ny] = [-uy, ux];
    elements.push({
      type: "jump",
      address: jump.address,
      style: jump.style,
      start: [xf, yf],
      c1: [xf + q, yc],
      c2: [cx, yc],
      tip: [xt, yf],
      base,
      corners: [
        [base[0] - 2 * w * nx, base[1] - 2 * w * ny],
        [base[0] + 2 * w * nx, base[1] + 2 * w * ny],
      ],
    });
  }
  for (const entry of [rootEntry, ...drawnChildren].filter((item) => shown(item.style))) {
    elements.push({
      type: entry === rootEntry ? "timeline" : "child",
      address: entry.manifest.id,
      style: entry.style,
      xs: x(entry.start),
      xe: x(entry.end),
      y: lineY(entry),
      locked: entry.manifest.locked,
    });
  }
  for (const marker of markers.filter((item) => shown(item.style))) {
    elements.push({
      type: "wedge",
      address: marker.address,
      style: marker.style,
      x: x(marker.at),
      yt: yAt(marker.side, rootWidth / 2),
      yb: yAt(marker.side, rootWidth / 2 + MARKER_HEIGHT),
    });
  }

  const rowY = (row: NameRow): number =>
    row.band === "root" ? yRoot : rowLine(row.side as Side, row.row);
  for (const item of [...drawnNames].sort((left, right) => rowY(left.row) - rowY(right.row))) {
    const size = item.first.style["font-size"];
    elements.push({
      type: "name",
      address: item.first.address,
      style: item.first.style,
      x: P,
      baseline: rowY(item.row) + (a(size) - d(size)) / 2,
      anchor: "start",
      text: item.text,
    });
  }
  const centredText = (
    owner: Owned,
    centre: number,
    baseline: number,
    item: { clean: string; width: number },
    coordinate?: ShownCoordinate,
  ) => {
    elements.push({
      type: "label",
      address: owner.label.address,
      style: owner.label.style,
      x: centre,
      baseline,
      anchor: "middle",
      text: item.clean,
      ...(coordinate === undefined ? {} : { coordinate }),
    });
  };
  for (const item of markerLabels) {
    const side = item.marker.side;
    const size = wedgeLabelSize(side);
    const outwards =
      rootWidth / 2 + MARKER_HEIGHT + LABEL_GAP + ((markerTier.get(item) as number) - 1) * h(size);
    centredText(item.marker, x(item.marker.at), beyond(side, yAt(side, outwards), size), item, {
      unit: root.unit,
      value: item.marker.at,
    });
  }
  for (const region of drawnRegions) {
    const item = regionLabels.get(region);
    if (item === undefined) continue;
    const size = regionLabelSize(region.side);
    centredText(
      region,
      x(item.at),
      beyond(region.side, yAt(region.side, regionArms(region) + BRACE + LABEL_GAP), size),
      item,
    );
  }
  for (const jump of placedJumps) {
    const item = jumpLabels.get(jump);
    if (item === undefined) continue;
    const size = flowLabelSize(jump.side);
    centredText(
      jump,
      x(item.at),
      beyond(jump.side, yAt(jump.side, apex(jump) + LABEL_GAP), size),
      item,
    );
  }
  for (const item of drawnBreaks) {
    const text = breakLabels.get(item);
    if (text === undefined) continue;
    const side = item.side;
    const size = flowLabelSize(side);
    const tier = breakTier.get(item) as number;
    const yf = yAt(side, band(side).flow);
    elements.push({
      type: "label",
      address: item.label.address,
      style: item.label.style,
      x: x(item.at) + BREAK_LABEL_OFFSET,
      // Tier 1 touches the flow row on the root's side; tier k lies (k − 1) h further in.
      baseline:
        side === "below"
          ? yf - d(size) - (tier - 1) * h(size)
          : yf + a(size) + (tier - 1) * h(size),
      anchor: "start",
      text: text.clean,
    });
  }

  const rightEdge = (element: DrawnElement): number | undefined => {
    switch (element.type) {
      case "block":
        return undefined;
      case "timeline":
      case "child": {
        // The diamond reaches `Xe + 1.5w`, the arrowhead's tip `Xe + 3w`.
        const w = element.style["stroke-width"];
        return Math.max(element.xs + w, element.xe + (element.locked ? 1.5 : 3) * w);
      }
      case "map":
        return Math.max(element.xs, element.xe);
      case "region":
        return Math.max(element.x1, element.x2, element.xm);
      case "jump":
        return Math.max(
          element.start[0],
          element.tip[0],
          element.corners[0][0],
          element.corners[1][0],
        );
      case "break":
        return element.x;
      case "wedge":
        return element.x + MARKER_BASE / 2;
      case "name":
      case "label": {
        const width = measure.width(element.text, element.style["font-size"]);
        return element.anchor === "start" ? element.x + width : element.x + width / 2;
      }
    }
  };
  const rightEdges = elements.map(rightEdge).filter((edge): edge is number => edge !== undefined);
  const Wc = P + (rightEdges.length === 0 ? x0 : Math.max(...rightEdges));
  const W = Math.max(Wc, placement.width ?? 0);
  const H = Math.max(Hc, placement.height ?? 0);
  elements.unshift({ type: "block", address: null, style: blockStyle, width: W, height: H });
  return {
    width: W,
    height: H,
    elements,
    unmapped: [...measure.unmapped].sort((left, right) => left - right),
  };
}
