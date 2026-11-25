/**
 * One timeline drawn with a line of its own (the root of a member drawing, a
 * displayed child, a displayed segment that is a segment line) laid out with
 * its five bands at its own line (`docs/drawing.md` in TimeToShare, section
 * 6.4, Every timeline's bands). Its bands draw what it holds and what each
 * segment without a line of its own adds to them. The three passes of
 * section 6.4 split the work: `prepareTimeline` (every first fit), then,
 * once the slots of its conversion maps band are known, `reachOf`,
 * `ownStart` and `layoutTimeline` (the distances, once its children are laid
 * out), `TimelineDrawing.elements` (the ordinates). The children band's
 * first fit and its rows, and the slots and start of its conversion maps
 * band, shared with the other lines of its row, are laid out by `rows.ts`,
 * `children.ts` and `slots.ts`; this module never places a child.
 */

import { bandOrderOf, FACETS, type Facet, LINE } from "@timetoalign/tilie-core";
import { compareReal } from "@timetoalign/tilie-core/numbers";
import {
  bandSides,
  bandStart,
  type Centred,
  fillSide,
  type JointSpans,
  type LaidBand,
  type LineElements,
  type LineMarker,
  type LinePosition,
  levelsOf,
  type PreparedBand,
  type Side,
} from "./bands.ts";
import { P } from "./constants.ts";
import type { Cut } from "./elements.ts";
import { type Extent, labelTiers, Rows, tieredFit, widen } from "./fit.ts";
import { flowControlBand } from "./flow.ts";
import { type LevelZero, levelZero, ownTiers, type StagedZero } from "./line.ts";
import { conversionMapsBand, drawMaps, type MapMember, mapMembers, type Slots } from "./maps.ts";
import { type MarkersBand, markersBand, type StagedMarkers, wedgeElement } from "./markers.ts";
import { regionsAlone, regionsBand, type StagedRegions } from "./regions.ts";
import { gapOf, tiersOf } from "./stacks.ts";
import { type Entry, known, nth, type Scope, shown } from "./traversal.ts";

/**
 * The bands of a timeline as its modules prepare them, those with a first fit
 * of their own before it is placed: the markers band's stacks, the regions
 * band's regions and level 0's segment labels (section 6.4, Rows of one band
 * order); the children, conversion maps and flow control bands as they are.
 */
export interface Stages {
  readonly markers: StagedMarkers;
  readonly regions: StagedRegions;
  readonly zero: StagedZero;
  readonly children: PreparedBand;
  readonly conversion_maps: PreparedBand;
  readonly flow_control: PreparedBand;
}

/** One timeline once every first fit of its own bands is done (section 6.4, the first pass). */
export interface PreparedTimeline {
  readonly scope: Scope;
  /** Its bands before their first fits are placed, so that a row of one band order places them together. */
  readonly stages: Stages;
  /** Its line's own extent, its labels and its children's left out (section 6.4, Children). */
  readonly lineExtent: Extent;
  /** Its entry: a timeline drawn with a line of its own. */
  readonly line: Entry;
  /** Its band order (core's `bandOrderOf`): `line` and its five facets, top to bottom. */
  readonly order: readonly string[];
  /** The side of its line each of its bands lies on, by its band order (section 6.4, The band order). */
  readonly sides: Readonly<Record<Facet, Side>>;
  /** Its five bands, present or not; the children and conversion maps bands without their widths. */
  readonly bands: Readonly<Record<Facet, PreparedBand>>;
  /** Its markers band, `bands.markers`, with the cross-section lines it holds. */
  readonly markers: MarkersBand;
  /** The facets of its present bands on each side, from level 1 or −1 outwards (section 6.4, Levels). */
  readonly levels: Readonly<Record<Side, readonly Facet[]>>;
  /**
   * The child lines its children band places, in the order its first fit takes them (section
   * 6.4, Children and Segments without a line): its own displayed children with a line of their
   * own (every child of a timeline that is no segment line; every segment that is a segment line)
   * in canonical order, then the displayed children of each joined segment, segment after segment
   * in traversal order, each one's in canonical order. Its children band is present exactly when
   * this is not empty.
   */
  readonly children: readonly Entry[];
  /**
   * The maps of its conversion maps band in the order they are taken (section 6.4, Conversion
   * maps): its own, then those of each joined segment. Its band is present exactly when this is
   * not empty.
   */
  readonly maps: readonly MapMember[];
  /** Its line, its segments' boundaries and labels. */
  readonly levelZero: LevelZero;
  /**
   * Its own extent (section 6.4, Children), from the root's start: the smallest interval holding
   * its line's extent and every extent its bands and its level 0 add, its children's left out.
   */
  readonly extent: Extent;
  /** Its drawn centred labels (section 6.7): its segment labels and its bands'. */
  readonly centred: readonly Centred[];
}

/** Where a timeline's line lies once every distance is known (section 6.4, the third pass). */
export interface LinePlace {
  /** The shared start `x0` (section 8.2), in item coordinates. */
  readonly x0: number;
  /** The ordinate `yl` of its line, in item coordinates. */
  readonly y: number;
  /** The name size `s` of the row its line lies in (section 6.2): the root's own name size for the root. */
  readonly size: number;
  /** The member drawing's top, in item coordinates (section 8.4). */
  readonly top: number;
  /** The member drawing's content height `Hc` (section 6.5), its ancestor band included (section 8.4). */
  readonly Hc: number;
  /**
   * The bottom of the card drawing the member drawing, in item coordinates: its top `top` plus its
   * height (sections 8.4 and 8.6), which every cross-section line of the card reaches (section
   * 6.6).
   */
  readonly bottom: number;
}

/** A child placed in its parent's children band (section 6.4, Children). */
export interface PlacedChild {
  /** The child's own drawing, laid out at its own line. */
  readonly drawing: TimelineDrawing;
  /** Its row `k` in its parent's children band, from 1, by that band's first fit (section 6.3). */
  readonly row: number;
  /**
   * `lk`, the distance of its row from its parent's line, outwards on the band's side, shared by
   * the rows `k` of every children band laid out together with its parent's.
   */
  readonly distance: number;
}

/**
 * A conversion maps band laid out together with the conversion maps bands of
 * the other lines of its row on the same side at the same level (section
 * 6.4, Conversion maps): what `rows.ts` gives `layoutTimeline`.
 */
export interface LaidMaps {
  /** The slots the bands share. */
  readonly slots: Slots;
  /** `c0`, the largest of the own starts of the bands laid out together (`ownStart`). */
  readonly start: number;
}

/**
 * A children band laid out together with the children bands of the other
 * lines of its timeline's row on the same side (section 6.4, Children): what
 * `rows.ts` gives `layoutTimeline`.
 */
export interface LaidChildren {
  /** `c0`, the largest of the own starts of the bands laid out together (`ownStart`). */
  readonly start: number;
  /** Its width: `i1 + o1 + … + iC + oC`, its own `C` rows with the halves they share, summed left to right. */
  readonly width: number;
  /** The children it places, in the order of `PreparedTimeline.children`. */
  readonly children: readonly PlacedChild[];
}

/**
 * One timeline drawn with a line of its own, laid out with its bands and its
 * children at every depth (section 6.4): the recursion's unit. A member
 * drawing is the tree of these from its root.
 */
export interface TimelineDrawing {
  readonly prepared: PreparedTimeline;
  /**
   * Its present bands, top to bottom: those above from the outermost to level 1, then those below
   * from level −1 outwards.
   */
  readonly bands: readonly LaidBand[];
  /**
   * The outer edge of each side (section 6.4, Where a band lies): for a child, its edges, which
   * size the halves of its row (Children); for the root, `Ea` and `Eb` before the ancestor band
   * (sections 6.5 and 8.3).
   */
  readonly edges: Readonly<Record<Side, number>>;
  /** Its children band laid out, `undefined` when it is absent. */
  readonly children: LaidChildren | undefined;
  /** How far its line reaches on each side (section 6.4, Level 0; `reachOf`). */
  readonly reach: Readonly<Record<Side, number>>;
  /**
   * Its own elements with its line at `place`: its line and what its bands hold, by the
   * categories of section 7.2, never its children's, which each draw their own.
   */
  elements(place: LinePlace): LineElements;
}

/**
 * The timelines whose content the bands of the line `line` draw (section
 * 6.4, Segments without a line): `line` itself, then, when it is a segment
 * line, each of its displayed segments that is no segment line, in
 * traversal order. Such a segment's bands lie at `line`'s line: what each of
 * its displayed bands holds joins the band of `line` of the same facet, after
 * `line`'s own content; its own band order places nothing. None when `line`
 * is not displayed, which hides its timeline's whole drawing (section 2.4):
 * only the root is laid out so, every other line being placed only when
 * displayed.
 */
export function sourcesOf(scope: Scope, line: Entry): readonly Entry[] {
  if (!line.drawn) return [];
  if (!line.manifest.is_segment_line) return [line];
  return (scope.index.sourcesByLine.get(line) ?? []).filter((entry) => entry.line || entry.drawn);
}

/** The children band: the child lines it places, which each draw their own elements. */
function childrenBand(children: readonly Entry[]): PreparedBand {
  return {
    facet: "children",
    elements: children.length,
    width: 0,
    extents: [],
    centred: [],
    draw: () => ({}),
  };
}

/**
 * The width of the band lying against the line of `prepared` on `side` and
 * sharing its room (section 6.4, Where a band lies, Level 0 and Segment
 * lines): the conversion maps band at level 1 or −1, the line's map stack,
 * `e` by its slots `slots`, or the markers band at level 1, which the line's
 * segment labels lie beyond; else 0.
 */
function againstOf(prepared: PreparedTimeline, slots: Slots | undefined, side: Side): number {
  const facet = prepared.levels[side][0];
  if (facet === "conversion_maps") {
    if (slots === undefined)
      throw new Error("a conversion maps band is laid out without its slots");
    return slots.width;
  }
  return facet === "markers" && side === "above" ? prepared.bands.markers.width : 0;
}

/**
 * How far the line of `prepared` reaches on each side (section 6.4, Level
 * 0), `slots` the slots of its conversion maps band when it is present: its
 * map stack on a side is that band when it lies there at level 1 or −1,
 * reaching `e`, and empty otherwise.
 */
export function reachOf(
  prepared: PreparedTimeline,
  slots: Slots | undefined,
): Readonly<Record<Side, number>> {
  const { levelZero } = prepared;
  return {
    above: levelZero.reach("above", againstOf(prepared, slots, "above")),
    below: levelZero.reach("below", againstOf(prepared, slots, "below")),
  };
}

/**
 * The first pass for the timeline drawn with the line `line` (section 6.4):
 * its band order (core's `bandOrderOf` over the scope's manifest), the side
 * of each band, each band prepared by its module from `sourcesOf` (markers,
 * conversion maps, regions, flow control; the children band from
 * `children`), its markers stacks, regions and segment labels placed by its
 * own first fits alone, the present bands' levels, its maps, its level 0,
 * its own extent and its centred labels. Uses no distance and no other
 * line's layout, so every line of a member drawing can be prepared first;
 * `prepareRow` places the first fits of a row of one band order together.
 */
export function prepareTimeline(scope: Scope, line: Entry): PreparedTimeline {
  const id = line.manifest.id;
  const order = bandOrderOf(scope.manifest, id);
  const sources = sourcesOf(scope, line);
  const children = sources.flatMap((source) =>
    (scope.index.childrenByParent.get(source.manifest.id) ?? []).filter(
      (entry) => entry.line && entry.drawn,
    ),
  );
  const maps = mapMembers(scope, sources);
  const stages: Stages = {
    markers: markersBand(scope, line, sources),
    regions: regionsBand(scope, sources),
    zero: levelZero(scope, line),
    children: childrenBand(children),
    conversion_maps: conversionMapsBand(maps),
    flow_control: flowControlBand(scope, line),
  };
  return assembled(
    { scope, line, order, children, maps, stages },
    stages.markers.band(tiersOf(stages.markers.stacks)),
    regionsAlone(stages.regions),
    stages.zero.zero(ownTiers(stages.zero)),
  );
}

/** What a line's preparation keeps before its first fits are placed. */
interface Unfitted {
  readonly scope: Scope;
  readonly line: Entry;
  readonly order: readonly string[];
  readonly children: readonly Entry[];
  readonly maps: readonly MapMember[];
  readonly stages: Stages;
}

/**
 * A line prepared from `base` with its markers band, regions band and level 0
 * placed: its present bands' levels (those drawing an element, or the facets
 * `present` lists in a row of one band order), its extent and its centred
 * labels.
 */
function assembled(
  base: Unfitted,
  markers: MarkersBand,
  regions: PreparedBand,
  zero: LevelZero,
  present?: ReadonlySet<Facet>,
): PreparedTimeline {
  const { stages, order } = base;
  const bands: Record<Facet, PreparedBand> = {
    children: stages.children,
    conversion_maps: stages.conversion_maps,
    markers,
    regions,
    flow_control: stages.flow_control,
  };
  const levels = levelsOf(
    order,
    present ?? new Set(FACETS.filter((facet) => bands[facet].elements > 0)),
  );
  const own = [...zero.extents, ...FACETS.flatMap((facet) => bands[facet].extents)];
  const [firstExtent, ...otherExtents] = own;
  if (firstExtent === undefined) throw new Error("a timeline has no extent");
  return {
    ...base,
    sides: bandSides(order),
    bands,
    markers,
    levels,
    levelZero: zero,
    lineExtent: stages.zero.lineExtent,
    extent: wholeExtent(firstExtent, otherExtents),
    centred: [...zero.centred, ...FACETS.flatMap((facet) => bands[facet].centred)],
  };
}

/**
 * The lines of a row of one band order prepared together (section 6.4, Rows
 * of one band order), `lines` in traversal order, each prepared alone
 * (`prepareTimeline`): the stacks of all their markers bands placed by one
 * first fit into one set of tiers, line after line; the regions of all their
 * regions bands by one tiered first fit, line after line, so that their
 * rows, label tiers and pitches are one, at the largest font size of their
 * drawn labels; the segment labels of their segment lines by one first fit
 * into one set of segment-label tiers, at one `m`, which counts `k` when any
 * of them draws a boundary. On each side the band of a facet is present for
 * every line when it is present for one, and the markers and regions bands
 * of each facet are as wide as the widest of them; the children and
 * conversion maps bands take their spans where the row's bands are laid out
 * (`rows.ts`).
 */
export function prepareRow(lines: readonly PreparedTimeline[]): PreparedTimeline[] {
  if (lines.length < 2) return [...lines];
  const slices = <T>(all: readonly T[], counts: readonly number[]): T[][] => {
    let offset = 0;
    return counts.map((count) => {
      const slice = all.slice(offset, offset + count);
      offset += count;
      return slice;
    });
  };
  const markers = tiersOf(lines.flatMap((line) => line.stages.markers.stacks));
  const firsts = slices(
    markers.first,
    lines.map((line) => line.stages.markers.stacks.length),
  );
  const regions = tieredFit(lines.flatMap((line) => line.stages.regions.items));
  const regionCounts = lines.map((line) => line.stages.regions.items.length);
  const [rows, tiers] = [slices(regions.row, regionCounts), slices(regions.tier, regionCounts)];
  const regionSize = Math.max(...lines.map((line) => line.stages.regions.size));
  const segmentLines = lines.filter((line) => line.stages.zero.segmentLine);
  const segmentRows = new Rows();
  const segmentLabels = segmentLines.flatMap((line) => line.stages.zero.labels);
  const segmentTier = labelTiers(segmentLabels, (label) => label.x, segmentRows);
  const shared = {
    count: segmentRows.count,
    bounded: segmentLines.some((line) => line.stages.zero.bounded),
    size: Math.max(...segmentLines.map((line) => line.stages.zero.size)),
  };
  const fitted = lines.map((line, index) => {
    const { zero } = line.stages;
    return {
      line,
      markers: line.stages.markers.band({ first: nth(firsts, index), lines: markers.lines }),
      regions: line.stages.regions.band(
        { row: nth(rows, index), tier: nth(tiers, index), tiers: regions.tiers },
        regionSize,
      ),
      zero: zero.zero(
        zero.segmentLine
          ? { ...shared, tier: zero.labels.map((label) => known(segmentTier, label)) }
          : ownTiers(zero),
      ),
    };
  });
  const present = new Set(
    fitted.flatMap(({ line, markers: band, regions: band2 }) =>
      FACETS.filter((facet) => {
        const own = facet === "markers" ? band : facet === "regions" ? band2 : line.bands[facet];
        return own.elements > 0;
      }),
    ),
  );
  const widest = (facet: "markers" | "regions") =>
    Math.max(...fitted.map((each) => each[facet].width));
  const [markersWidth, regionsWidth] = [widest("markers"), widest("regions")];
  return fitted.map(({ line, markers: band, regions: band2, zero }) =>
    assembled(
      line,
      { ...band, width: markersWidth },
      { ...band2, width: regionsWidth },
      zero,
      present,
    ),
  );
}

/**
 * The own start of the children band or the conversion maps band of
 * `prepared`, `facet`, on its side (section 6.4, Where a band lies): the
 * start `bandStart` gives it after the present bands at lower levels of its
 * side, those laid out with other lines' at `spans`, its line reaching as
 * `slots` makes it (`reachOf`); for a children band the larger of that and
 * `pl / 2`, `pl` the pitch of the row its line lies in (`p0` for the root).
 * Defined only for a present band.
 */
export function ownStart(
  prepared: PreparedTimeline,
  slots: Slots | undefined,
  facet: "children" | "conversion_maps",
  spans: JointSpans,
  pl: number,
): number {
  const { scope, line, sides, levels, bands } = prepared;
  const side = sides[facet];
  const reach = reachOf(prepared, slots)[side];
  const lower = levels[side].slice(0, levels[side].indexOf(facet));
  const w = line.style["stroke-width"];
  const before = fillSide(
    side,
    lower.map((each) => bands[each]),
    reach,
    scope.S,
    w,
    spans,
  );
  const start = bandStart(facet, lower.length === 0 ? undefined : before.edge, reach, w, scope.S);
  return facet === "children" ? Math.max(start, pl / 2) : start;
}

/**
 * The smallest interval holding `own` and every one of `children`, each end
 * compared exactly (section 6.4, Children): a timeline's own extent from
 * what its line and its bands add, and its extent from its own and its
 * placed children's, once for every line in the first pass (`Fitted.extent`).
 */
export function wholeExtent(own: Extent, children: readonly Extent[]): Extent {
  return children.reduce(widen, own);
}

/** Merge the typed categories drawn by level zero and each band. */
function mergeLineElements(parts: readonly Partial<LineElements>[]): LineElements {
  return {
    flowLines: parts.flatMap((part) => part.flowLines ?? []),
    maps: parts.flatMap((part) => part.maps ?? []),
    regions: parts.flatMap((part) => part.regions ?? []),
    jumps: parts.flatMap((part) => part.jumps ?? []),
    brackets: parts.flatMap((part) => part.brackets ?? []),
    symbols: parts.flatMap((part) => part.symbols ?? []),
    line: parts.flatMap((part) => part.line ?? []),
    boundaries: parts.flatMap((part) => part.boundaries ?? []),
    wedges: parts.flatMap((part) => part.wedges ?? []),
    wedgeLabels: parts.flatMap((part) => part.wedgeLabels ?? []),
    segmentLabels: parts.flatMap((part) => part.segmentLabels ?? []),
    segmentLeaders: parts.flatMap((part) => part.segmentLeaders ?? []),
    regionLeaders: parts.flatMap((part) => part.regionLeaders ?? []),
    jumpLeaders: parts.flatMap((part) => part.jumpLeaders ?? []),
    stackLeaders: parts.flatMap((part) => part.stackLeaders ?? []),
    regionLabels: parts.flatMap((part) => part.regionLabels ?? []),
    jumpLabels: parts.flatMap((part) => part.jumpLabels ?? []),
    flowLineLabels: parts.flatMap((part) => part.flowLineLabels ?? []),
    crossSections: parts.flatMap((part) => part.crossSections ?? []),
    gapLabels: parts.flatMap((part) => part.gapLabels ?? []),
    markers: parts.flatMap((part) => part.markers ?? []),
  };
}

/**
 * The start of the markers band of `prepared` on its side (section 6.4,
 * Where a band lies), `laid` the present bands of that side in level order,
 * `reach` the line's reach there and `w` its stroke width: the band's own
 * start when it is present, else the start `bandStart` would give it after
 * the present bands its band order lists between the line and it, as an
 * editor's mark at a position no named timestamp holds is drawn
 * (`DrawnAxis.marker`).
 */
function markersStart(
  prepared: PreparedTimeline,
  laid: readonly LaidBand[],
  reach: number,
  w: number,
): number {
  const own = laid.find((band) => band.facet === "markers");
  if (own !== undefined) return own.start;
  const { order, sides, scope } = prepared;
  const line = order.indexOf(LINE);
  const outwards =
    sides.markers === "above" ? order.slice(0, line).reverse() : order.slice(line + 1);
  const nearer = new Set(outwards.slice(0, outwards.indexOf("markers")));
  const before = laid.filter((band) => nearer.has(band.facet)).at(-1);
  return bandStart("markers", before?.edge, reach, w, scope.S);
}

/**
 * The second pass for one timeline, once its children band and its
 * conversion maps band are laid out with those of the other lines of its row
 * (`children` and `maps`, each `undefined` exactly when its band is absent):
 * its reach by its slots (`reachOf`), each side filled by `fillSide` from
 * its present bands in level order, the children band at `children.start`
 * and `children.width` wide, the conversion maps band at `maps.start` and as
 * wide as its slots make it, or every band where `aligned` gives the spans
 * of a row of one band order; its outer edges; and its elements once its
 * line's place is known.
 */
export function layoutTimeline(
  prepared: PreparedTimeline,
  children: LaidChildren | undefined,
  maps: LaidMaps | undefined,
  aligned?: JointSpans,
): TimelineDrawing {
  const { scope, line, levels, bands } = prepared;
  const slots = maps?.slots;
  const reach = reachOf(prepared, slots);
  const w = line.style["stroke-width"];
  const spans: JointSpans = aligned ?? {
    ...(children === undefined
      ? {}
      : { children: { start: children.start, width: children.width } }),
    ...(maps === undefined
      ? {}
      : { conversion_maps: { start: maps.start, width: maps.slots.width } }),
  };
  const fill = (side: Side) =>
    fillSide(
      side,
      levels[side].map((facet) => bands[facet]),
      reach[side],
      scope.S,
      w,
      spans,
    );
  const above = fill("above");
  const below = fill("below");
  const edges = { above: above.edge, below: below.edge };
  const laid = [...above.bands.toReversed(), ...below.bands];

  const descendants = linesIn(children)
    .sort(scope.byTraversal)
    .map((entry) => entry.manifest.id);

  const elements = (place: LinePlace): LineElements => {
    const at = linePosition(prepared, place);
    // The card's span, from its top to its bottom, that every cross-section line crosses
    // (section 6.6), and where the markers band starts, present or not.
    const span = [place.top, place.bottom] as const;
    const side = prepared.sides.markers;
    const start = markersStart(prepared, (side === "above" ? above : below).bands, reach[side], w);
    const parts = [
      prepared.levelZero.draw(at, againstOf(prepared, slots, "above")),
      ...laid.map((band) =>
        band.facet === "conversion_maps" && slots !== undefined
          ? drawMaps(prepared.maps, slots, band.start, band.side, at)
          : bands[band.facet].draw(band.start, band.side, at),
      ),
      {
        crossSections: prepared.markers.crossSections(at, start, side, span),
        gapLabels: [...prepared.markers.elisionLabels()],
      },
    ];
    const merged = mergeLineElements(parts);
    const [drawnLine] = merged.line;
    if (drawnLine === undefined) return merged;
    // Where a wedge and a cross-section line of the line lie, drawn by the code that draws a
    // named timestamp's, at the abscissa 0.
    const { unnamed } = prepared.markers;
    const wedge = wedgeElement(drawnLine.address, unnamed.wedge, 0, at, side, start, w);
    const rotation = wedge.style.rotation ?? 0;
    const distances = gapOf(0, rotation, start + w / 2, shown(wedge.style), null);
    const gap =
      distances === null
        ? null
        : (() => {
            const [first, second] = distances.map((distance) => at.yAt(side, distance));
            return { y1: Math.min(first ?? 0, second ?? 0), y2: Math.max(first ?? 0, second ?? 0) };
          })();
    const marker: LineMarker = {
      line: drawnLine,
      marker: {
        wedge: { yt: wedge.yt, corners: wedge.corners, style: wedge.style },
        crossSection: { span: { y1: span[0], y2: span[1] }, gap, style: unnamed.crossSection },
        descendants,
      },
      timestamps: prepared.markers.timestamps(at, span),
    };
    return { ...merged, markers: [marker] };
  };

  return {
    prepared,
    bands: laid,
    edges,
    children,
    reach,
    elements,
  };
}

/**
 * The lines a children band laid out as `laid` holds at any depth: its
 * children, each followed by the lines its own children band holds; every
 * one displayed (a child that is not is not placed, section 6.4, Children).
 */
function linesIn(laid: LaidChildren | undefined): Entry[] {
  return (laid?.children ?? []).flatMap(({ drawing }) => [
    drawing.prepared.line,
    ...linesIn(drawing.children),
  ]);
}

/**
 * The line of `prepared` placed at `place` (sections 3.2, 3.3 and 6.4): what
 * its bands and its level 0 draw from.
 */
function linePosition(prepared: PreparedTimeline, place: LinePlace): LinePosition {
  const { scope, line } = prepared;
  const { x0, y, top, Hc } = place;
  const elided = scope.axis;
  // The card margin `V` above the first row and below the last, inside the padding, counted from
  // the drawing's top.
  const near = top + (P + scope.V);
  const far = top + (Hc - P - scope.V);
  // On an elided axis a position lies `D` further left, an open root end `D` short of `x0 + L`,
  // a seam at it counted on the side facing the protected span (section 3.2).
  const axis: Pick<LinePosition, "x" | "xAfter" | "xEnd" | "gap" | "cuts"> =
    elided === undefined
      ? {
          x: (value) => x0 + scope.relativeX(value),
          xAfter: (value) => x0 + scope.relativeX(value),
          xEnd: (entry) => x0 + scope.relativeEnd(entry),
          gap: () => undefined,
          cuts: () => [],
        }
      : {
          // What lies at the line's own start lies on the run right of a seam there (section 8.8).
          x: (value) =>
            x0 +
            (compareReal(value, line.start) === 0 ? elided.startAt(value) : elided.relative(value)),
          xAfter: (value) => x0 + elided.startAt(value),
          xEnd: (entry) =>
            x0 + (entry.rootEnd ? elided.endAt(entry.end) : elided.relative(entry.end)),
          gap: (value) => {
            const gap = elided.gapOf(value);
            return gap === undefined ? undefined : [x0 + gap.left, x0 + gap.right];
          },
          cuts: (start, end) =>
            elided.gaps
              .filter((gap) => elided.crosses(gap, start, end))
              .map((gap): Cut => [x0 + gap.left, x0 + gap.right]),
        };
  return {
    x0,
    ...axis,
    y,
    yAt: (side, outwards) => (side === "above" ? y - outwards : y + outwards),
    beyond: (side, ordinate, labelSize) =>
      side === "above" ? ordinate - scope.d(labelSize) : ordinate + scope.a(labelSize),
    // The breaks, section breaks and barlines, drawn by the root's band alone, run to the card
    // margin of the opposite side, inside the padding, counted from the drawing's top.
    flowLineEnd: (side) => (side === "below" ? near : far),
  };
}
