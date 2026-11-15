/**
 * The markers band: a timeline's coordinate markers (the wedges of the
 * root's start and end and of the named timestamps, with their label tiers),
 * the cross-section lines of its named timestamps, which its timeline's line
 * holds and the band only lays out, and the reach of a line's
 * marks, which ancestor lines share (`docs/drawing.md` in TimeToShare,
 * sections 6.4, Markers, 6.6 and 8.3).
 */

import { type ElementAddress, idAddress, partAddress } from "@timetoalign/tilie-core";
import { type ElementKey, elementKey, namedTimestamps } from "@timetoalign/tilie-core/drawing";
import type { Real } from "@timetoalign/tilie-core/numbers";
import type { LinePosition, PreparedBand, Side } from "./bands.ts";
import type { Style } from "./cascade.ts";
import { LABEL_GAP, MARKER_BASE, MARKER_HEIGHT } from "./constants.ts";
import type { MarkerElement, ShownCoordinate, VerticalLineElement } from "./elements.ts";
import { type Extent, labelExtent, labelTiers, Rows } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { add, coordinateText, coordinateValue } from "./numbers.ts";
import {
  type Entry,
  known,
  maxSize,
  type Owned,
  type Scope,
  type Styled,
  shown,
} from "./traversal.ts";

/** The reach of the wedges or marks of a line of width `w`: `w / 2 + 13`, and the label tiers beyond. */
export const markReach = (scope: Scope, w: number, tiers: number, size: number): number =>
  tiers === 0 ? w / 2 + MARKER_HEIGHT : w / 2 + MARKER_HEIGHT + LABEL_GAP + tiers * scope.h(size);

/** The distance from the axis of a line of width `w` to the inner edge of its mark label tier `tier`. */
export const markLabelOffset = (scope: Scope, w: number, tier: number, size: number): number =>
  w / 2 + MARKER_HEIGHT + LABEL_GAP + (tier - 1) * scope.h(size);

/**
 * A wedge at `x` of the markers band of the line placed at `at`, the band
 * starting at `start` outwards on `side` and `w` the line's stroke width
 * (section 6.6, Wedges): its tip `start + w / 2` out and its base 13
 * further, each distance summed in that order before it becomes an
 * ordinate, its base 6 wide. A named timestamp's wedge and the root's start
 * and end wedges are drawn by it alike, and so is the wedge an editor shows
 * at a position no named timestamp holds (`wedgeAt`).
 */
export function wedgeElement(
  address: ElementAddress,
  style: Style,
  x: number,
  at: LinePosition,
  side: Side,
  start: number,
  w: number,
): MarkerElement {
  return {
    type: "wedge",
    address,
    style,
    x,
    yt: at.yAt(side, start + w / 2),
    yb: at.yAt(side, start + w / 2 + MARKER_HEIGHT),
    base: MARKER_BASE,
  };
}

/**
 * The cross-section line at `x` of a named timestamp whose wedge lies at the
 * line placed at `at` (section 6.6, Cross-section lines): from `(x, y1)` to
 * `(x, y2)`, the extent `at.crossSection` gives. Every named timestamp's
 * line is drawn by it, and so is the line an editor shows at a position no
 * named timestamp holds (`crossSection`).
 */
export function crossSectionElement(
  address: ElementAddress,
  style: Style,
  x: number,
  at: LinePosition,
): VerticalLineElement {
  const [y1, y2] = at.crossSection;
  return { type: "cross_section", address, style, x, y1, y2 };
}

/** A wedge a markers band draws: its element, its position and its label's text. */
interface Wedge extends Owned {
  readonly at: Real;
  readonly text: string;
  /** What a coordinate label shows; none for a named timestamp's label, which is its name. */
  readonly coordinate: ShownCoordinate | undefined;
}

/** A named timestamp held by a markers band, at its position on the root's axis (section 3.1). */
interface Held {
  readonly source: Entry;
  readonly id: string;
  readonly name: string;
  readonly at: Real;
}

/**
 * The markers band of the timeline drawn with the line `line`, with what its
 * segments without a line join to it (section 6.4, Markers and Segments
 * without a line), `sources` the line and those segments (none when its
 * line is not displayed).
 */
export interface MarkersBand extends PreparedBand {
  /**
   * The displayed cross-section lines of the named timestamps whose wedges it draws or would
   * draw, in the order of those wedges, drawn at the line placed at `at` (section 6.6). Each is
   * held by its timeline's line, not by the band: drawn whether or not its wedge is, whether
   * or not the band is displayed or present, since it takes no room.
   */
  crossSections(at: LinePosition): VerticalLineElement[];
  /**
   * The styles of a wedge and a cross-section line of the band's timeline that no named
   * timestamp holds: the cascade's, the wedge held by the band and the line by the timeline's
   * line, without the statements naming `addresses` (`Cascade.resolveUnaddressed`).
   */
  readonly unnamed: { readonly wedge: Style; readonly crossSection: Style };
}

/**
 * The markers band of the timeline drawn with the line `line` (section 6.4,
 * Markers). The root's band draws first the wedges of its start and end
 * when the root is among `sources` (its line displayed, section 2.4), its
 * start alone when its end is open, each labelled with the coordinate it
 * marks in the root's unit; every band then the wedge of each named
 * timestamp of each of `sources`, the line's own first and then each joined
 * segment's, segment after segment, each one's in canonical order, at the
 * timeline's start plus its coordinate (section 3.1), labelled with its
 * name. A wedge is drawn when it is displayed and the band holding it (its
 * timeline's markers band) is displayed; its label when it is drawn and the
 * label is displayed. The labels are placed by one first fit in that order
 * into the band's tiers, centred on their wedge's `X`. Its width is `w / 2 +
 * 13`, or `w / 2 + 13 + 2 + T × h(9)` when the labels fill `T ≥ 1` tiers,
 * `w` the stroke width of the line and 9 the largest font size of its drawn
 * labels; it adds to its timeline's extent the extent `[L × u − 3, L × u +
 * 3]` of every wedge it draws and the extent of every label. Drawn from its
 * start `c`, a wedge's tip lies `c + w / 2` out and its base 13 further, and
 * tier `k` starts `c + w / 2 + 13 + 2 + (k − 1) × h(9)` out, summed in that
 * order (section 6.6, Wedges): never `c` plus `markLabelOffset`, which sums
 * from `w / 2`. A named timestamp's cross-section line is held by its
 * timeline's line, not by the band: it is drawn when its own display is
 * `inline`, whatever the band's, and takes no room in it.
 */
export function markersBand(scope: Scope, line: Entry, sources: readonly Entry[]): MarkersBand {
  const { root, rootEntry, lambda, owned, measured, u, relativeX, h, cascade } = scope;
  const band = line.bands.markers;
  const ends: Wedge[] = !sources.includes(rootEntry)
    ? []
    : [
        { at: rootEntry.start, part: "start" as const },
        ...(rootEntry.open ? [] : [{ at: lambda, part: "end" as const }]),
      ]
        .filter(() => shown(band.style))
        .map(({ at, part }) => ({
          ...owned("wedge", partAddress(idAddress(root.id), part), line, "markers"),
          at,
          text: coordinateText(at, root.unit),
          coordinate: { unit: root.unit, value: at },
        }));
  const held: Held[] = sources.flatMap((source) =>
    namedTimestamps(scope.manifest, source.manifest.id).map((timestamp) => ({
      source,
      id: timestamp.id,
      name: timestamp.name,
      at: add(source.start, coordinateValue(timestamp.coordinate, source.manifest.number_type)),
    })),
  );
  const named: Wedge[] = held
    .filter((item) => shown(item.source.bands.markers.style))
    .map((item) => ({
      ...owned("wedge", idAddress(item.id), item.source, "markers"),
      at: item.at,
      text: item.name,
      coordinate: undefined,
    }));
  const wedges = [...ends, ...named].filter((wedge) => shown(wedge.style));
  const crossings = held
    .map((item) => ({
      at: item.at,
      ...lineOf(scope, item.source, partAddress(idAddress(item.id), "line")),
    }))
    .filter((item) => shown(item.style));
  const labels = wedges
    .filter((wedge) => shown(wedge.label.style))
    .map((wedge) => ({ wedge, ...measured(wedge.label, wedge.text) }));
  const tiers = new Rows();
  const tier = labelTiers(labels, (item) => relativeX(item.wedge.at), tiers);
  const size = maxSize(labels.map((item) => item.wedge.label));
  const w = line.style["stroke-width"];
  const wedgeExtent = (at: Real): Extent => [
    relativeX(at) - MARKER_BASE / 2,
    relativeX(at) + MARKER_BASE / 2,
  ];
  const unnamedKey = (type: "wedge" | "cross_section", holder: ElementKey) =>
    elementKey(type, idAddress(line.manifest.id), line.manifest, holder);
  return {
    facet: "markers",
    elements: wedges.length,
    width: wedges.length === 0 ? 0 : markReach(scope, w, tiers.count, size),
    extents: [
      ...wedges.map((wedge) => wedgeExtent(wedge.at)),
      ...labels.map((item) => labelExtent(relativeX(item.wedge.at), item.width)),
    ],
    centred: labels.map((item) => ({ width: item.width, u: u(item.wedge.at) })),
    draw: (start, side, at) => ({
      wedges: wedges.map((wedge) =>
        wedgeElement(wedge.address, wedge.style, at.x(wedge.at), at, side, start, w),
      ),
      wedgeLabels: labels.map((item) => {
        const outwards =
          start + w / 2 + MARKER_HEIGHT + LABEL_GAP + (known(tier, item) - 1) * h(size);
        return centredLabel(
          item.wedge.label,
          at.x(item.wedge.at),
          at.beyond(side, at.yAt(side, outwards), size),
          item,
          item.wedge.coordinate,
        );
      }),
    }),
    crossSections: (at) =>
      crossings.map((item) => crossSectionElement(item.address, item.style, at.x(item.at), at)),
    unnamed: {
      wedge: cascade.resolveUnaddressed(unnamedKey("wedge", band.key), band.style),
      crossSection: cascade.resolveUnaddressed(unnamedKey("cross_section", line.key), line.style),
    },
  };
}

/**
 * The cross-section line at `address` of a named timestamp of `source`, held
 * by the line of `source` (its node, for a segment without a line), not by
 * its markers band, so that hiding the band leaves the line (section 2.1):
 * its address and its cascaded style.
 */
function lineOf(scope: Scope, source: Entry, address: ElementAddress): Styled {
  return scope.styled(
    elementKey("cross_section", address, source.manifest, source.key),
    source.style,
  );
}
