/**
 * The markers band: a timeline's coordinate markers, the wedges of its named
 * timestamps with the stacks of their labels, the cross-section lines of
 * those timestamps, which its timeline's line holds and the band only lays
 * out, and the reach of a line's marks, which ancestor lines share
 * (`docs/drawing.md` in TimeToShare, sections 2, 6.4, Markers, 6.6 and 8.3).
 */

import {
  type ElementAddress,
  idAddress,
  type NamedTimestamp,
  partAddress,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import {
  cardStamps,
  type ElementKey,
  elementKey,
  namedTimestamps,
  type StampCoordinate,
  TIMESTAMP_LABELS,
  type TimestampLabel,
} from "@timetoalign/tilie-core/drawing";
import type { Real } from "@timetoalign/tilie-core/numbers";
import { type LinePosition, opposite, type PreparedBand, type Side } from "./bands.ts";
import type { AxisTimestamp } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import { LABEL_GAP, MARKER_HEIGHT } from "./constants.ts";
import { FADED_OPACITY } from "./defaults.ts";
import type {
  MarkerElement,
  ShownCoordinate,
  TextElement,
  VerticalLineElement,
} from "./elements.ts";
import { type Extent, labelExtent } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { add, coordinateText, coordinateValue, negate } from "./numbers.ts";
import { type WedgeCorner, type WedgeOffset, wedgeCorners, wedgeSpan } from "./rotation.ts";
import { carried, cut, gapOf, type Span, tiersOf } from "./stacks.ts";
import {
  type Entry,
  known,
  type Measured,
  maxSize,
  nth,
  type Scope,
  type Styled,
  shown,
} from "./traversal.ts";

/** The reach of the wedges or marks of a line of width `w`: `w / 2 + 13`, and `lines` label lines beyond. */
export const markReach = (scope: Scope, w: number, lines: number, size: number): number =>
  lines === 0 ? w / 2 + MARKER_HEIGHT : w / 2 + MARKER_HEIGHT + LABEL_GAP + lines * scope.h(size);

/** The distance from the axis of a line of width `w` to the inner edge of its mark label line `line`. */
export const markLabelOffset = (scope: Scope, w: number, line: number, size: number): number =>
  w / 2 + MARKER_HEIGHT + LABEL_GAP + (line - 1) * scope.h(size);

/**
 * A wedge's style with its `rotation` read (section 2.5): the value a rule
 * set, else the initial value 0.
 */
export function rotatedStyle(style: Style): Style {
  return style.rotation === null ? { ...style, rotation: 0 } : style;
}

/**
 * The style of what marks a position that has no coordinate (section 6.6:
 * a groupstamp's secondary coordinate where a length of the group is not
 * known, and the piece of the frame's line over such a member's card): its
 * opacity times `FADED_OPACITY`, the defaults' opacity of ancestor lines.
 */
export function fadedStyle(style: Style): Style {
  return { ...style, opacity: style.opacity * FADED_OPACITY };
}

/**
 * A wedge at `x` of the markers band of the line placed at `at`, the band
 * starting at `start` outwards on `side` and `w` the line's stroke width
 * (section 6.6, Wedges): its tip `start + w / 2` out, and each corner of its
 * base, turned by the style's `rotation` (0 where unset) about the tip, at
 * its offset across and its distance beyond the tip's, that distance added
 * to the tip's before it becomes an ordinate; unturned, its base 13 further
 * out and 6 wide. A named timestamp's wedge is drawn by it, and so is the
 * wedge an editor shows at a position no named timestamp holds (`wedgeAt`).
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
  const rotated = rotatedStyle(style);
  const tip = start + w / 2;
  const corner = ({ dx, out }: WedgeOffset): WedgeCorner => ({ dx, y: at.yAt(side, tip + out) });
  const [first, second] = wedgeCorners(rotated.rotation ?? 0);
  return {
    type: "wedge",
    address,
    style: rotated,
    x,
    yt: at.yAt(side, tip),
    corners: [corner(first), corner(second)],
  };
}

/**
 * The cross-section line at `x` from `(x, y1)` to `(x, y2)`, one piece of a
 * line across its card less its gap (section 6.6). Every named timestamp's
 * line is drawn by it.
 */
export function crossSectionElement(
  address: ElementAddress,
  style: Style,
  x: number,
  [y1, y2]: readonly [number, number],
): VerticalLineElement {
  return { type: "cross_section", address, style, x, y1, y2 };
}

/** A drawn label of a named timestamp: its element, its text measured, and what a coordinate label shows. */
interface StampLabel extends Styled, Measured {
  readonly coordinate: ShownCoordinate | undefined;
}

/**
 * A coordinate of a named timestamp marked in a markers band, at its
 * position on the root's axis (section 3.1): its primary coordinate on the
 * band's timeline or a segment joining it, or a secondary one (section 2),
 * with what it draws there: its wedge, its stack of labels and, for its
 * primary coordinate, its cross-section line, each only when its `display`
 * lists it and it is displayed (section 2.4); and the `rotation` its wedge
 * has, drawn or not, which carries its stack (section 6.6).
 */
interface Stamp {
  readonly id: string;
  readonly at: Real;
  readonly primary: boolean;
  readonly rotation: number;
  readonly wedge: Styled | undefined;
  /** Its stack: its drawn labels in the order of `TIMESTAMP_LABELS`. */
  readonly labels: readonly StampLabel[];
  readonly line: Styled | undefined;
}

/** A secondary coordinate's value on the timeline it marks; `null` where it has none (section 6.6). */
interface Secondary {
  readonly value: Real | null;
}

/** A stamp with a stack, placed in the band's tiers: its first line and its widest label. */
interface Stacked {
  readonly stamp: Stamp;
  readonly n1: number;
  readonly width: number;
}

/**
 * The markers band of the timeline drawn with the line `line`, with what its
 * segments without a line join to it (section 6.4, Markers and Segments
 * without a line), `sources` the line and those segments (none when its
 * line is not displayed).
 */
export interface MarkersBand extends PreparedBand {
  /**
   * The drawn cross-section lines of the named timestamps it holds, in the order it places their
   * timestamps, the band drawn from `start` on `side` of the line placed at `at`, each across
   * `span`, the card's top and bottom, less its gap (section 6.6). Each is held by its
   * timeline's line, not by the band: drawn whether or not its wedge or its labels are, whether or
   * not the band is displayed or present, since it takes no room.
   */
  crossSections(at: LinePosition, start: number, side: Side, span: Span): VerticalLineElement[];
  /**
   * Every named timestamp it holds, in the order it places them, with the abscissa of its
   * cross-section line at the line placed at `at`, whether or not that line is drawn: where the
   * alignment anchors joining its timestamp meet it (section 8.7), the card's span `span`; and
   * that line's style.
   */
  timestamps(at: LinePosition, span: Span): AxisTimestamp[];
  /**
   * The styles of a wedge and a cross-section line of the band's timeline that no named
   * timestamp holds: the cascade's, the wedge held by the band and the line by the timeline's
   * line, without the rules naming `addresses` (`Cascade.resolveUnaddressed`).
   */
  readonly unnamed: { readonly wedge: Style; readonly crossSection: Style };
}

/**
 * The markers band of the timeline drawn with the line `line` (section 6.4,
 * Markers): the named timestamps of each of `sources`, the line's own first
 * and then each joined segment's, segment after segment, each one's in
 * canonical order, each at its timeline's start plus its coordinate (section
 * 3.1); then the secondary coordinates on each of `sources` of every named
 * timestamp the card draws whose position its span holds (core's
 * `cardStamps`), source after source, in canonical order of their
 * timestamps, each read on that source's axis. Of each, the wedge and the
 * labels its `display` lists are drawn when they are displayed and its
 * timeline's markers band is displayed; its labels, name, ID and coordinate
 * (sections 5.2 and 5.3), form its stack. The stacks are placed by one first
 * fit, in that order, into tiers counted in lines (`tiersOf`), each stack
 * one item as wide as its widest label, centred on its timestamp's `X`, at
 * its unturned place; a wedge's `rotation`, 0 where no rule sets it, carries
 * its stack (`carried`). The band holds its wedges and its labels directly
 * and is present when it draws either; it is `w / 2 + 13` wide without a
 * label, `w / 2 + 13 + 2 + T × h(9)` with `T ≥ 1` lines of labels, `w` the
 * stroke width of the line and 9 the largest font size of its drawn labels;
 * it adds to its timeline's extent `[L × u + a, L × u + b]` for every wedge
 * it draws, `a` and `b` the smallest and largest of 0 and its corners'
 * offsets across (`[−3, 3]` unturned), and the extent of every stack where
 * its wedge carries it. A cross-section line is held by its timeline's line,
 * not by the band: it is drawn when its timestamp's `display` lists it and
 * its own display is `inline`, whatever the band's, and takes no room.
 */
export function markersBand(scope: Scope, line: Entry, sources: readonly Entry[]): MarkersBand {
  const { relativeX, u, h, cascade, styled, measured } = scope;
  const stampOf = (
    source: Entry,
    timeline: TimelineManifest,
    timestamp: NamedTimestamp,
    at: Real,
    secondary: Secondary | undefined,
  ): Stamp => {
    const primary = secondary === undefined;
    const band = source.bands.markers;
    const banded = shown(band.style);
    const address = idAddress(timestamp.id);
    const coordinates: StampCoordinate = primary ? "primary" : "secondary";
    const lists = (word: (typeof timestamp.display)[number]) => timestamp.display.includes(word);
    const drawn = (item: Styled): Styled | undefined => (shown(item.style) ? item : undefined);
    const keyed = (type: "wedge" | "label", where: typeof address) => ({
      ...elementKey(type, where, timeline, band.key),
      coordinates,
    });
    // The value the wedge marks, on the timeline it marks (section 5.2): a secondary coordinate's
    // as core's `cardStamps` writes it in the timeline's number type, none where it has no value.
    const own = secondary === undefined ? add(at, negate(source.start)) : secondary.value;
    // A match timestamp may have no name, and draws no name label then (section 2); a coordinate
    // without a value draws no coordinate label (section 6.6).
    const texts: Readonly<Record<TimestampLabel, string | undefined>> = {
      name: timestamp.name,
      id: timestamp.id,
      coordinate:
        own === null ? undefined : coordinateText(own, timeline.number_type, timeline.unit),
    };
    const labels = !banded
      ? []
      : TIMESTAMP_LABELS.filter(lists).flatMap((word): StampLabel[] => {
          const text = texts[word];
          if (text === undefined) return [];
          const label = styled(keyed("label", partAddress(address, word)), band.style);
          if (!shown(label.style)) return [];
          const coordinate =
            word === "coordinate" && own !== null ? { unit: timeline.unit, value: own } : undefined;
          return [{ ...label, ...measured(label, text), coordinate }];
        });
    const turned = rotated(styled(keyed("wedge", address), band.style));
    const wedge = own === null ? { ...turned, style: fadedStyle(turned.style) } : turned;
    return {
      id: timestamp.id,
      at,
      primary,
      rotation: wedge.style.rotation ?? 0,
      wedge: banded && lists("wedge") ? drawn(wedge) : undefined,
      labels,
      line:
        primary && lists("cross_section")
          ? drawn(lineOf(scope, source, partAddress(address, "line")))
          : undefined,
    };
  };
  const primaries = sources.flatMap((source) => {
    const timeline = source.manifest;
    return namedTimestamps(scope.manifest, timeline.id).map((timestamp) =>
      stampOf(
        source,
        timeline,
        timestamp,
        add(source.start, coordinateValue(timestamp.coordinate, timeline.number_type)),
        undefined,
      ),
    );
  });
  // A hidden secondary coordinate takes no room.
  const secondaries = sources.flatMap((source) =>
    crossingStamps(scope, source)
      .map(({ timestamp, at, value }) => stampOf(source, source.manifest, timestamp, at, { value }))
      .filter((stamp) => stamp.wedge !== undefined || stamp.labels.length > 0),
  );
  const stamps = [...primaries, ...secondaries];
  const widest = (stamp: Stamp) => Math.max(...stamp.labels.map((label) => label.width));
  const withStacks = stamps.filter((stamp) => stamp.labels.length > 0);
  const tiers = tiersOf(
    withStacks.map((stamp) => ({
      x: relativeX(stamp.at),
      lines: stamp.labels.length,
      width: widest(stamp),
    })),
  );
  const stacks = new Map<Stamp, Stacked>(
    withStacks.map((stamp, index) => [
      stamp,
      { stamp, n1: nth(tiers.first, index), width: widest(stamp) },
    ]),
  );
  const labels = withStacks.flatMap((stamp) => stamp.labels);
  const size = maxSize(labels);
  const wedges = stamps.filter((stamp) => stamp.wedge !== undefined);
  const w = line.style["stroke-width"];
  // Where its wedge carries the stack of `stamp`, the band starting at `start` (0 for the carry
  // alone, which no start moves).
  const carry = (stacked: Stacked, start: number) =>
    carried(
      stacked.stamp.rotation,
      start + w / 2,
      stacked.n1,
      stacked.stamp.labels.length,
      stacked.width,
      h(size),
    );
  const vxOf = new Map([...stacks].map(([stamp, stacked]) => [stamp, carry(stacked, 0).vx]));
  const wedgeExtent = ({ at, rotation }: Stamp): Extent => {
    const [left, right] = wedgeSpan(rotation);
    return [relativeX(at) + left, relativeX(at) + right];
  };
  const unnamedKey = (type: "wedge" | "cross_section", holder: ElementKey) =>
    elementKey(type, idAddress(line.manifest.id), line.manifest, holder);
  const count = wedges.length + labels.length;
  // The gap of the cross-section line of `stamp` in a band drawn from `start` (section 6.6).
  const gap = (stamp: Stamp, at: LinePosition, start: number, side: Side): Span | null => {
    const stacked = stacks.get(stamp);
    const distances = gapOf(
      at.x(stamp.at),
      stamp.rotation,
      start + w / 2,
      stamp.wedge !== undefined,
      stacked === undefined ? null : { carried: carry(stacked, start), width: stacked.width },
    );
    if (distances === null) return null;
    const [first, second] = distances.map((distance) => at.yAt(side, distance));
    return [Math.min(first ?? 0, second ?? 0), Math.max(first ?? 0, second ?? 0)];
  };
  return {
    facet: "markers",
    elements: count,
    width: count === 0 ? 0 : markReach(scope, w, tiers.lines, size),
    extents: [
      ...wedges.map(wedgeExtent),
      ...withStacks.map((stamp) =>
        labelExtent(relativeX(stamp.at) + (vxOf.get(stamp) ?? 0), widest(stamp)),
      ),
    ],
    centred: withStacks.flatMap((stamp) =>
      stamp.labels.map((label) => ({
        width: label.width,
        u: u(stamp.at),
        v: vxOf.get(stamp) ?? 0,
      })),
    ),
    draw: (start, side, at) => ({
      wedges: wedges.flatMap(({ wedge, at: position }) =>
        wedge === undefined
          ? []
          : [wedgeElement(wedge.address, wedge.style, at.x(position), at, side, start, w)],
      ),
      wedgeLabels: withStacks.flatMap((stamp) => {
        const placed = carry(known(stacks, stamp), start);
        const towards = placed.inwards ? opposite(side) : side;
        return stamp.labels.map(
          (label, index): TextElement =>
            centredLabel(
              label,
              at.x(stamp.at) + placed.vx,
              at.beyond(towards, at.yAt(side, nth(placed.starts, index)), size),
              label,
              label.coordinate,
            ),
        );
      }),
    }),
    crossSections: (at, start, side, span) =>
      primaries.flatMap((stamp) => {
        const drawn = stamp.line;
        if (drawn === undefined) return [];
        return cut(span, gap(stamp, at, start, side)).map((piece) =>
          crossSectionElement(drawn.address, drawn.style, at.x(stamp.at), piece),
        );
      }),
    timestamps: (at, span) =>
      primaries.map((stamp) => ({
        id: stamp.id,
        x: at.x(stamp.at),
        line: stamp.line?.style ?? null,
        segment: { y1: span[0], y2: span[1] },
      })),
    unnamed: {
      wedge: cascade.resolveUnaddressed(
        unnamedKey("wedge", line.bands.markers.key),
        line.bands.markers.style,
      ),
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

/** A wedge's styled element with its `rotation` read, 0 where no rule sets it (`rotatedStyle`). */
function rotated(wedge: Styled): Styled {
  return { ...wedge, style: rotatedStyle(wedge.style) };
}

/**
 * The named timestamps with a secondary coordinate on the timeline of
 * `source` (section 2, core's `cardStamps` of the card in its frame), each at
 * its position on the root's axis with its coordinate on that timeline (`null`
 * where it has none, section 6.6), in the canonical order of
 * `graphical.timestamps`.
 */
function crossingStamps(
  scope: Scope,
  source: Entry,
): { readonly timestamp: NamedTimestamp; readonly at: Real; readonly value: Real | null }[] {
  const card = cardStamps(scope.manifest, scope.member, scope.frame);
  const origin = negate(card.window[0]);
  return (card.secondaries.get(source.manifest.id) ?? []).map(({ timestamp, position, value }) => ({
    timestamp,
    at: add(position, origin),
    value,
  }));
}
