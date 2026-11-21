/**
 * What the Matchstamp tab shows of a MatchStamp's timestamps beside what
 * `matchstamps.ts` gives: their Coordinates as the Timestamp tab shows a
 * timestamp's, each with its timeline's conversion-map rows, and the
 * MatchStamp's **lines**, every dashed line it draws (its timestamps'
 * lines and its anchors' connectors) in the one screen order, each with
 * what its toggles act on. Values, rows and the order are core's and the
 * arranger's; nothing here computes one.
 */

import { inScreenOrder } from "@timetoalign/tilie-arranger";
import type {
  CrossSectionSpec,
  Granularity,
  Knots,
  Manifest,
  NamedMatchStamp,
  NamedTimestamp,
} from "@timetoalign/tilie-core";
import {
  findTimeline,
  matchStampSpec,
  prettyText,
  timelineAxisOf,
  timestampAt,
} from "@timetoalign/tilie-core";
import { toRational } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { ShownStamp, StampAnchor, StampCoordinate } from "./matchstamps.ts";
import { matchStampsOf } from "./matchstamps.ts";
import type { TimelineRows } from "./timestamp.ts";
import { coordinateGroup, timelineRows } from "./timestamp.ts";

// --- Coordinates -------------------------------------------------------------

/**
 * The groups of `coordinates` of a MatchStamp of block `block`'s
 * `manifest`, in the order given, as the Timestamp tab's Coordinates show a
 * timestamp's own timeline (`timelineRows` of a pin anchored on it, read
 * under `granularity` with `knots`): headed by the timeline's name, else its
 * ID, its row "coordinate", then one row per conversion map of the timeline
 * (its value at the coordinate, as core evaluates it). A coordinate whose
 * timeline the manifest no longer holds is its text alone. Each group's key
 * is unique among them, two coordinates on one timeline included.
 */
export function stampGroups(
  manifest: Manifest,
  block: string,
  coordinates: readonly StampCoordinate[],
  granularity: Granularity,
  knots: Knots,
): TimelineRows[] {
  return coordinates.map((coordinate, at) => {
    const key = JSON.stringify([at, coordinate.timeline]);
    const timeline = findTimeline(manifest, coordinate.timeline);
    if (timeline === undefined) {
      return coordinateGroup(
        key,
        coordinate.timeline,
        coordinate.timeline,
        String(coordinate.value),
      );
    }
    const spec: CrossSectionSpec = {
      block,
      granularity,
      anchor: timelineAxisOf(timeline, timeline.conversion_maps),
      members: [],
    };
    const timestamp = timestampAt(spec, toRational(coordinate.value), knots);
    const [group] = timelineRows({ spec, knots, timestamp, named: null });
    if (group === undefined) throw new Error("a timestamp has its anchor's rows");
    return { ...group, key };
  });
}

// --- Lines -------------------------------------------------------------------

/**
 * A timestamp's line of a MatchStamp: its timeline's name (else its ID)
 * and its coordinate in pretty text, the match timestamp it is (`null` while
 * the MatchStamp is potential: naming stores it), and the other named
 * MatchStamps whose anchors name that match timestamp too, whose drawing a
 * change of its display changes as well.
 */
export interface TimestampLine {
  readonly kind: "timestamp";
  /** Unique among the lines of one MatchStamp. */
  readonly key: string;
  readonly timeline: string;
  readonly name: string;
  readonly value: string;
  readonly timestamp: NamedTimestamp | null;
  readonly shared: readonly NamedMatchStamp[];
}

/** An alignment anchor's connector: the anchor, and the names of its two timelines in its order. */
export interface AnchorLine {
  readonly kind: "anchor";
  /** Unique among the lines of one MatchStamp. */
  readonly key: string;
  readonly anchor: StampAnchor;
  readonly names: readonly [string, string];
}

export type StampLine = TimestampLine | AnchorLine;

/** A timestamp of the MatchStamp: its coordinate and, once named, its match timestamp. */
interface Stamped {
  readonly coordinate: StampCoordinate;
  readonly timestamp: NamedTimestamp | null;
}

/**
 * The timestamps of `stamp`: a named MatchStamp's match timestamps, each
 * once, read through core's `matchStampSpec` (an anchor's coordinates in
 * the order of its `timestamps`); a potential one's coordinates, none
 * named.
 */
function stampedOf(manifest: Manifest, stamp: ShownStamp): Stamped[] {
  const named =
    stamp.id === null
      ? undefined
      : manifest.graphical?.matchstamps?.find((item) => item.id === stamp.id);
  if (named === undefined) {
    return stamp.coordinates.map((coordinate) => ({ coordinate, timestamp: null }));
  }
  const timestamps = new Map(
    (manifest.graphical?.timestamps ?? []).map((item) => [item.id, item] as const),
  );
  const spec = matchStampSpec(manifest, named);
  const found = new Map<string, Stamped>();
  named.alignment_anchors.forEach((anchor, at) => {
    anchor.timestamps.forEach((id, side) => {
      const coordinate = spec.anchors[at]?.coordinates[side];
      const timestamp = timestamps.get(id);
      if (coordinate !== undefined && timestamp !== undefined && !found.has(id)) {
        found.set(id, { coordinate, timestamp });
      }
    });
  });
  return [...found.values()];
}

/**
 * The lines of `stamp`, a MatchStamp of `manifest` drawn as `drawing`, in
 * screen order (the arranger's `inScreenOrder`, top-down, then
 * left-to-right): every timestamp's line at its coordinate's place, and
 * every anchor's connector just before the line of its lower coordinate
 * (an anchor's coordinates are in screen order, so its second), anchors
 * meeting one coordinate by their upper one. A chain of timestamps and
 * anchors therefore alternates as drawn: the top timestamp, the anchor
 * down to the next, that timestamp, and so on.
 */
export function stampLines(manifest: Manifest, stamp: ShownStamp, drawing: Drawing): StampLine[] {
  const nameOf = (timeline: string) => {
    const found = findTimeline(manifest, timeline);
    return found === undefined ? timeline : (found.name ?? found.id);
  };
  const prettyOf = ({ timeline, value }: StampCoordinate) => {
    const found = findTimeline(manifest, timeline);
    return found === undefined ? String(value) : prettyText(value, found.number_type, found.unit);
  };
  const anchors = inScreenOrder(drawing, stamp.anchors, (anchor) => anchor.coordinates[0]).map(
    (anchor): { at: StampCoordinate; line: StampLine } => ({
      at: anchor.coordinates[1],
      line: {
        kind: "anchor",
        key: JSON.stringify(["anchor", anchor.key]),
        anchor,
        names: [nameOf(anchor.coordinates[0].timeline), nameOf(anchor.coordinates[1].timeline)],
      },
    }),
  );
  const timestamps = stampedOf(manifest, stamp).map(
    ({ coordinate, timestamp }, at): { at: StampCoordinate; line: StampLine } => ({
      at: coordinate,
      line: {
        kind: "timestamp",
        key: JSON.stringify(["timestamp", timestamp?.id ?? at]),
        timeline: coordinate.timeline,
        name: nameOf(coordinate.timeline),
        value: prettyOf(coordinate),
        timestamp,
        shared:
          timestamp === null
            ? []
            : matchStampsOf(manifest, timestamp.id).filter((item) => item.id !== stamp.id),
      },
    }),
  );
  // Stable: at one place an anchor comes before the timestamp it reaches down to.
  return inScreenOrder(drawing, [...anchors, ...timestamps], (item) => item.at).map(
    (item) => item.line,
  );
}
