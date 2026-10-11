/**
 * `draw(manifest, placement, layers, metrics)`: the drawing of one
 * TimeSkeleton manifest (`docs/drawing.md` in timeskeleton, sections 1 to 6).
 */

import {
  type ConversionMap,
  compareReal,
  type Manifest,
  type Real,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import type { ElementType, FontMetrics, Graphical, TimeUnit } from "@timetoalign/timeskeleton";
import { canonicalOrder } from "@timetoalign/timeskeleton";
import {
  Cascade,
  classDomain,
  type ElementKey,
  type Side,
  type Style,
  unitDomain,
} from "./cascade.ts";
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

export type BandGroup = "children" | "maps" | "regions" | "flow";

/** Where and how large the drawing is placed (section 1). */
export interface Placement {
  readonly length: number;
  readonly spacing: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly order: readonly [BandGroup, BandGroup, BandGroup, BandGroup];
}

export const DEFAULT_PLACEMENT: Placement = {
  length: 400,
  spacing: 1,
  width: null,
  height: null,
  order: ["children", "maps", "regions", "flow"],
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
}

export interface MapElement extends Addressed {
  readonly type: "map";
  readonly xs: number;
  readonly xe: number;
  readonly y: number;
}

export interface RegionElement extends Addressed {
  readonly type: "region";
  readonly x1: number;
  readonly x2: number;
  readonly xm: number;
  readonly yb: number;
  readonly ya: number;
}

export interface JumpElement extends Addressed {
  readonly type: "jump";
  readonly xFrom: number;
  readonly xTo: number;
  readonly yf: number;
  readonly yc: number;
  readonly yo: number;
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
export const MAP_SPACING = 3;
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

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0) as number);
  const b = Array.from(right, (character) => character.codePointAt(0) as number);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index] as number) - (b[index] as number);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
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
  readonly band: "root" | "child" | "map";
  readonly row: number;
  readonly items: NameItem[];
}

interface DrawnName {
  readonly row: NameRow;
  readonly first: Styled;
  readonly text: string;
  readonly width: number;
}

const sideSign = (side: Side): -1 | 1 => (side === "above" ? -1 : 1);
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

  const ancestry = new Map<string, readonly string[]>();
  const collect = (timeline: TimelineManifest, path: readonly string[]) => {
    const own = [...path, timeline.id];
    ancestry.set(timeline.id, own);
    for (const child of Object.values(timeline.children)) collect(child.timeline, own);
  };
  collect(root, []);
  const cascade = new Cascade(layers, ancestry);
  const blockStyle = cascade.resolve(
    { type: "block", address: null, timeline: null, domain: null, modality: null, class: null },
    undefined,
  );
  const keyOf = (
    type: ElementType,
    address: string,
    timeline: TimelineManifest,
    map?: ConversionMap,
  ): ElementKey => {
    const [domain, modality] =
      map === undefined
        ? classDomain(timeline.class)
        : (unitDomain(map.target_unit as string | null) ?? [null, null]);
    return {
      type,
      address,
      timeline: timeline.id,
      domain,
      modality,
      class: map === undefined ? timeline.class : map.type,
    };
  };
  const styled = (key: ElementKey, parent: Style): Styled => ({
    address: key.address as string,
    style: cascade.resolve(key, parent),
  });
  const textOf = (owner: ElementKey, ownerStyle: Style, kind: "name" | "label"): Styled =>
    styled({ ...owner, type: kind, address: `${owner.address}/${kind}` }, ownerStyle);

  const entries: Entry[] = [];
  const visit = (timeline: TimelineManifest, parent: Entry | undefined, start: Real) => {
    const key = keyOf(parent === undefined ? "timeline" : "child", timeline.id, timeline);
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
    const children = Object.entries(timeline.children).sort(
      (left, right) =>
        compareReal(coordinateValue(left[1].offset), coordinateValue(right[1].offset)) ||
        compareCodePoints(left[0], right[0]),
    );
    for (const [, child] of children) {
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
    const key = keyOf(type, address, entry.manifest, map);
    const style = cascade.resolve(key, parent);
    return { address, style, entry, side: style.side, label: textOf(key, style, "label") };
  };
  interface MapItem extends Owned {
    readonly name: Styled;
    readonly text: string;
  }
  const maps: MapItem[] = [];
  const regions: (Owned & { start: Real; end: Real; text: string })[] = [];
  const breaks: (Owned & { at: Real; text: string | null })[] = [];
  const jumps: (Owned & { from: Real; to: Real; text: string })[] = [];
  for (const entry of entries) {
    const timeline = entry.manifest;
    for (const map of timeline.conversion_maps) {
      const item = owned("map", `${timeline.id}/map/${map.id}`, entry, entry.style, map);
      const key = keyOf("map", item.address, timeline, map);
      maps.push({
        ...item,
        name: textOf(key, item.style, "name"),
        text: (map.name as string | null | undefined) ?? map.id,
      });
    }
    timeline.regions.forEach((region, index) => {
      regions.push({
        ...owned("region", `${timeline.id}/region/${index}`, entry, entry.style),
        start: add(entry.start, coordinateValue(region.start)),
        end: add(entry.start, coordinateValue(region.end)),
        text: region.name,
      });
    });
    timeline.flow_control.breaks.forEach((item, index) => {
      breaks.push({
        ...owned("break", `${timeline.id}/break/${index}`, entry, entry.style),
        at: add(entry.start, coordinateValue(item.coordinate)),
        text: item.label,
      });
    });
    timeline.flow_control.jumps.forEach((item, index) => {
      jumps.push({
        ...owned("jump", `${timeline.id}/jump/${index}`, entry, entry.style),
        from: add(entry.start, coordinateValue(item.from_coordinate)),
        to: add(entry.start, coordinateValue(item.to_coordinate)),
        text: item.label ?? item.control_type,
      });
    });
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
      .filter((region) => shown(region.label.style))
      .map((region) => [
        region,
        { ...label(region, region.text), at: midpoint(region.start, region.end) },
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
  const drawnMaps = maps.filter((map) => shown(map.style));
  const childRows = { above: new Rows(), below: new Rows() };
  const mapRows = { above: new Rows(), below: new Rows() };
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
  const mapRow = new Map<MapItem, number>();
  for (const map of drawnMaps) {
    mapRow.set(
      map,
      mapRows[map.side].place([relativeX(map.entry.start), relativeX(map.entry.end)]),
    );
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
  for (const map of drawnMaps) {
    joinRow("map", map.side, mapRow.get(map) as number, map.name, map.text);
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
  for (const item of drawnBreaks) {
    const text = breakLabels.get(item);
    if (text === undefined) continue;
    const left = relativeX(item.at) + BREAK_LABEL_OFFSET;
    breakTier.set(item, breakTiers[opposite(item.side)].place([left - 1, left + text.width + 1]));
  }

  const maxSize = (items: readonly Styled[], fallback = 9): number =>
    items.length === 0 ? fallback : Math.max(...items.map((item) => item.style["font-size"]));
  const rootNameSize = rootEntry.name.style["font-size"];
  const nameBandSize = (kind: "child" | "map", side: Side): number =>
    Math.max(
      ...nameRows
        .filter((row) => row.band === kind && row.side === side)
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
  const jumpLabelSize = (side: Side) =>
    maxSize([...jumpLabels.keys()].filter((item) => item.side === side).map((item) => item.label));
  const breakLabelSize = (side: Side) =>
    maxSize(
      [...breakLabels.keys()]
        .filter((item) => opposite(item.side) === side)
        .map((item) => item.label),
    );

  const B = 4 * v;
  interface Bands {
    wedge: number;
    child: number;
    pc: number;
    map: number;
    pm: number;
    region: number;
    pr: number;
    flow: number;
    pj: number;
    breakLabel: number;
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
    const result = {
      wedge: 0,
      child: 0,
      pc: 0,
      map: 0,
      pm: 0,
      region: 0,
      pr: 0,
      flow: 0,
      pj: 0,
      breakLabel: 0,
    };
    const wedgeDrawn = markers.some((marker) => marker.side === side && shown(marker.style));
    if (wedgeDrawn) {
      const tiers = markerTiers[side].count;
      result.wedge = next(
        rootWidth / 2 +
          MARKER_HEIGHT +
          (tiers === 0 ? 0 : LABEL_GAP + tiers * h(wedgeLabelSize(side))),
      );
    }
    const addGroup = (group: BandGroup) => {
      if (group === "children" && childRows[side].count > 0) {
        result.pc = Math.max(14 * v, h(nameBandSize("child", side)));
        result.child = next(childRows[side].count * result.pc, h(rootNameSize) / 2);
      } else if (group === "maps" && mapRows[side].count > 0) {
        result.pm = Math.max(13 * v, h(nameBandSize("map", side)));
        result.map = next(mapRows[side].count * result.pm, h(rootNameSize) / 2);
      } else if (group === "regions" && regionRows[side].count > 0) {
        result.pr = BRACE + LABEL_GAP + h(regionLabelSize(side)) + 4 * v;
        result.region = next(regionRows[side].count * result.pr - 4 * v);
      } else if (group === "flow") {
        const levels = jumpLevels[side].count;
        if (levels > 0 || drawnBreaks.some((item) => item.side === side)) {
          result.pj = 10 * v + h(jumpLabelSize(side));
          result.flow = next(
            levels === 0
              ? 0
              : 8 * v + (levels - 1) * result.pj + LABEL_GAP + h(jumpLabelSize(side)),
          );
        }
      }
    };
    for (const group of placement.order) addGroup(group);
    if (breakTiers[side].count > 0) {
      result.breakLabel = next(breakTiers[side].count * h(breakLabelSize(side)));
    }
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
    const own = band(map.side);
    elements.push({
      type: "map",
      address: map.address,
      style: map.style,
      xs: x(map.entry.start),
      xe: x(map.entry.end),
      y: yAt(map.side, own.map + ((mapRow.get(map) as number) - 1 / 2) * own.pm),
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
    const width = jump.style["stroke-width"];
    elements.push({
      type: "jump",
      address: jump.address,
      style: jump.style,
      xFrom: x(jump.from),
      xTo: x(jump.to),
      yf,
      yc: yf + (4 / 3) * (ya - yf),
      yo: yf + sideSign(jump.side) * (4 * width),
    });
  }
  const lineY = (entry: Entry): number => {
    if (entry === rootEntry) return yRoot;
    const side = entry.style.side;
    const own = band(side);
    return yAt(side, own.child + ((childRow.get(entry) as number) - 1 / 2) * own.pc);
  };
  for (const entry of [rootEntry, ...drawnChildren].filter((item) => shown(item.style))) {
    elements.push({
      type: entry === rootEntry ? "timeline" : "child",
      address: entry.manifest.id,
      style: entry.style,
      xs: x(entry.start),
      xe: x(entry.end),
      y: lineY(entry),
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

  const rowY = (row: NameRow): number => {
    if (row.band === "root") return yRoot;
    const side = row.side as Side;
    const own = band(side);
    return row.band === "child"
      ? yAt(side, own.child + (row.row - 1 / 2) * own.pc)
      : yAt(side, own.map + (row.row - 1 / 2) * own.pm);
  };
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
    const size = jumpLabelSize(jump.side);
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
    const side = opposite(item.side);
    const size = breakLabelSize(side);
    const tier = breakTier.get(item) as number;
    elements.push({
      type: "label",
      address: item.label.address,
      style: item.label.style,
      x: x(item.at) + BREAK_LABEL_OFFSET,
      baseline:
        side === "above"
          ? P + a(size) + (tier - 1) * h(size)
          : Hc - P - d(size) - (tier - 1) * h(size),
      anchor: "start",
      text: text.clean,
    });
  }

  const rightEdge = (element: DrawnElement): number | undefined => {
    switch (element.type) {
      case "block":
        return undefined;
      case "timeline":
        return Math.max(element.xs + element.style["stroke-width"], element.xe);
      case "child":
        return Math.max(
          element.xs + element.style["stroke-width"],
          element.xe + 1.5 * element.style["stroke-width"],
        );
      case "map":
        return Math.max(element.xs, element.xe);
      case "region":
        return Math.max(element.x1, element.x2, element.xm);
      case "jump":
        return Math.max(
          element.xFrom,
          element.xTo,
          element.xTo + 2 * element.style["stroke-width"],
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
