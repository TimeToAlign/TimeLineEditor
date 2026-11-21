/**
 * The markers band: a timeline's coordinate markers, the wedges of its named
 * timestamps with the stacks of their labels, the cross-section lines of
 * those timestamps, which its timeline's line holds and the band only lays
 * out, and the reach of a line's marks, which ancestor lines share
 * (`docs/drawing.md` in TimeToShare, sections 2, 6.4, Markers, 6.6 and 8.3).
 */

import { type ElementAddress, idAddress, partAddress } from "@timetoalign/tilie-core";
import {
  type ElementKey,
  elementKey,
  namedTimestamps,
  TIMESTAMP_LABELS,
  type TimestampLabel,
} from "@timetoalign/tilie-core/drawing";
import type { Real } from "@timetoalign/tilie-core/numbers";
import type { LinePosition, PreparedBand, Side } from "./bands.ts";
import type { AxisTimestamp } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import { GROUPSTAMP_ROTATION, LABEL_GAP, MARKER_HEIGHT } from "./constants.ts";
import type {
  MarkerElement,
  ShownCoordinate,
  TextElement,
  VerticalLineElement,
} from "./elements.ts";
import { type Extent, labelExtent, Rows } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { add, coordinateText, coordinateValue } from "./numbers.ts";
import { type WedgeCorner, type WedgeOffset, wedgeCorners, wedgeSpan } from "./rotation.ts";
import {
  type Entry,
  known,
  type Measured,
  maxSize,
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
 * set, else `initial`, −45 on a groupstamp's wedge and 0 on any other.
 */
export function rotatedStyle(style: Style, initial = 0): Style {
  return style.rotation === null ? { ...style, rotation: initial } : style;
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
 * The ordinates `[y1, y2]` of the cross-section lines of one line, `y1` the
 * smaller (section 6.6, Cross-section lines); null where they have no
 * length and are not drawn.
 */
export type CrossSectionExtent = readonly [number, number] | null;

/**
 * The cross-section line at `x` from `(x, y1)` to `(x, y2)`, `[y1, y2]` the
 * extent of its line's cross-section lines (section 6.6). Every named
 * timestamp's line is drawn by it, and so is the line an editor shows at a
 * position no named timestamp holds (`crossSection`).
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
 * A named timestamp held by a markers band, at its position on the root's
 * axis (section 3.1), with what it draws: its wedge, its stack of labels and
 * its cross-section line, each only when its `display` lists it and it is
 * displayed (section 2.4).
 */
interface Stamp {
  readonly id: string;
  readonly at: Real;
  readonly wedge: Styled | undefined;
  /** Its stack: its drawn labels in the order of `TIMESTAMP_LABELS`. */
  readonly labels: readonly StampLabel[];
  readonly line: Styled | undefined;
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
   * timestamps, at the line placed at `at`, `extent` the extent of the cross-section lines of
   * that line (section 6.6). Each is
   * held by its timeline's line, not by the band: drawn whether or not its wedge or its labels
   * are, whether or not the band is displayed or present, since it takes no room; none where
   * `extent` is null.
   */
  crossSections(at: LinePosition, extent: CrossSectionExtent): VerticalLineElement[];
  /**
   * Every named timestamp it holds, in the order it places them, with the abscissa of its
   * cross-section line at the line placed at `at`, whether or not that line is drawn: where the
   * alignment anchors joining its timestamp meet it (section 8.7); that line's style; and the
   * ordinates of the lines its stack of labels lies on, the band drawn from `start` on `side`.
   */
  timestamps(at: LinePosition, start: number, side: Side): AxisTimestamp[];
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
 * 3.1). Of each, the wedge and the labels its `display` lists are drawn when
 * they are displayed and its timeline's markers band is displayed; its
 * labels, name, ID and coordinate (sections 5.2 and 5.3), form its stack.
 * The stacks are placed by one first fit, in that order, into tiers, each
 * stack one item as wide as its widest label, centred on its timestamp's
 * `X`; a tier is as many lines high as its highest stack, and the label `j`
 * of a stack in tier `k` lies on line `m1 + … + m(k−1) + j`. The band holds
 * its wedges and its labels directly and is present when it draws either;
 * it is `w / 2 + 13` wide without a label, `w / 2 + 13 + 2 + T × h(9)` with
 * `T ≥ 1` lines of labels, `w` the stroke width of the line and 9 the
 * largest font size of its drawn labels; it adds to its timeline's extent
 * `[L × u + a, L × u + b]` for every wedge it draws, `a` and `b` the smallest
 * and largest of 0 and its corners' offsets across (`[−3, 3]` unturned), and
 * the extent of every stack. A wedge's `rotation` is 0 where no rule sets it,
 * −45 on a groupstamp's. Drawn from its start `c`, a wedge's tip lies
 * `c + w / 2` out, its base unturned 13 further, and line `n` starts
 * `c + w / 2 + 13 + 2 + (n − 1) × h(9)` out, summed in that order (section
 * 6.6), whether or not a wedge is drawn and whatever its rotation.
 * A cross-section line is held by its timeline's line, not by the band: it
 * is drawn when its timestamp's `display` lists it and its own display is
 * `inline`, whatever the band's, and takes no room in it.
 */
export function markersBand(scope: Scope, line: Entry, sources: readonly Entry[]): MarkersBand {
  const { relativeX, u, h, cascade, styled, measured } = scope;
  const stamps: Stamp[] = sources.flatMap((source) => {
    const band = source.bands.markers;
    const banded = shown(band.style);
    const timeline = source.manifest;
    return namedTimestamps(scope.manifest, timeline.id).map((timestamp): Stamp => {
      const own = coordinateValue(timestamp.coordinate, timeline.number_type);
      const at = idAddress(timestamp.id);
      const lists = (word: (typeof timestamp.display)[number]) => timestamp.display.includes(word);
      const drawn = (item: Styled): Styled | undefined => (shown(item.style) ? item : undefined);
      // A match timestamp may have no name, and draws no name label then (section 2).
      const texts: Readonly<Record<TimestampLabel, string | undefined>> = {
        name: timestamp.name,
        id: timestamp.id,
        coordinate: coordinateText(own, timeline.number_type, timeline.unit),
      };
      const labels = !banded
        ? []
        : TIMESTAMP_LABELS.filter(lists).flatMap((word): StampLabel[] => {
            const text = texts[word];
            if (text === undefined) return [];
            const label = styled(
              elementKey("label", partAddress(at, word), timeline, band.key),
              band.style,
            );
            if (!shown(label.style)) return [];
            const coordinate =
              word === "coordinate" ? { unit: timeline.unit, value: own } : undefined;
            return [{ ...label, ...measured(label, text), coordinate }];
          });
      return {
        id: timestamp.id,
        at: add(source.start, own),
        wedge:
          banded && lists("wedge")
            ? rotated(
                drawn(styled(elementKey("wedge", at, timeline, band.key), band.style)),
                timestamp.groupstamp ? GROUPSTAMP_ROTATION : 0,
              )
            : undefined,
        labels,
        line: lists("cross_section")
          ? drawn(lineOf(scope, source, partAddress(at, "line")))
          : undefined,
      };
    });
  });
  const stacks = stamps.filter((stamp) => stamp.labels.length > 0);
  const widest = (stamp: Stamp) => Math.max(...stamp.labels.map((label) => label.width));
  const tiers = new Rows();
  const tierOf = new Map(
    stacks.map((stamp) => [stamp, tiers.place(labelExtent(relativeX(stamp.at), widest(stamp)))]),
  );
  // The height of each tier in lines, its highest stack's, and the lines of the tiers before it.
  const heights = tiers.rows.map(() => 0);
  for (const stamp of stacks) {
    const index = known(tierOf, stamp) - 1;
    heights[index] = Math.max(heights[index] ?? 0, stamp.labels.length);
  }
  const before: number[] = [];
  let lines = 0;
  for (const height of heights) {
    before.push(lines);
    lines += height;
  }
  const labels = stacks.flatMap((stamp) => stamp.labels);
  const size = maxSize(labels);
  const wedges = stamps.filter((stamp) => stamp.wedge !== undefined);
  const w = line.style["stroke-width"];
  const wedgeExtent = ({ at, wedge }: Stamp): Extent => {
    const [left, right] = wedgeSpan(wedge?.style.rotation ?? 0);
    return [relativeX(at) + left, relativeX(at) + right];
  };
  const unnamedKey = (type: "wedge" | "cross_section", holder: ElementKey) =>
    elementKey(type, idAddress(line.manifest.id), line.manifest, holder);
  const count = wedges.length + labels.length;
  return {
    facet: "markers",
    elements: count,
    width: count === 0 ? 0 : markReach(scope, w, lines, size),
    extents: [
      ...wedges.map(wedgeExtent),
      ...stacks.map((stamp) => labelExtent(relativeX(stamp.at), widest(stamp))),
    ],
    centred: stacks.flatMap((stamp) =>
      stamp.labels.map((label) => ({ width: label.width, u: u(stamp.at) })),
    ),
    draw: (start, side, at) => ({
      wedges: wedges.flatMap(({ wedge, at: position }) =>
        wedge === undefined
          ? []
          : [wedgeElement(wedge.address, wedge.style, at.x(position), at, side, start, w)],
      ),
      wedgeLabels: stacks.flatMap((stamp) =>
        stamp.labels.map((label, index): TextElement => {
          const n = (before[known(tierOf, stamp) - 1] ?? 0) + index + 1;
          const outwards = start + w / 2 + MARKER_HEIGHT + LABEL_GAP + (n - 1) * h(size);
          return centredLabel(
            label,
            at.x(stamp.at),
            at.beyond(side, at.yAt(side, outwards), size),
            label,
            label.coordinate,
          );
        }),
      ),
    }),
    crossSections: (at, extent) =>
      extent === null
        ? []
        : stamps.flatMap(({ line: drawn, at: position }) =>
            drawn === undefined
              ? []
              : [crossSectionElement(drawn.address, drawn.style, at.x(position), extent)],
          ),
    timestamps: (at, start, side) =>
      stamps.map((stamp) => {
        const tier = tierOf.get(stamp);
        const first = tier === undefined ? 0 : (before[tier - 1] ?? 0);
        const from = start + w / 2 + MARKER_HEIGHT + LABEL_GAP + first * h(size);
        const ordinates = [
          at.yAt(side, from),
          at.yAt(side, from + stamp.labels.length * h(size)),
        ] as const;
        return {
          id: stamp.id,
          x: at.x(stamp.at),
          line: stamp.line?.style ?? null,
          labels:
            stamp.labels.length === 0 ? null : [Math.min(...ordinates), Math.max(...ordinates)],
        };
      }),
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

/** A drawn wedge with its `rotation` read, `initial` where no rule sets it (`rotatedStyle`). */
function rotated(wedge: Styled | undefined, initial: number): Styled | undefined {
  return wedge === undefined ? undefined : { ...wedge, style: rotatedStyle(wedge.style, initial) };
}
