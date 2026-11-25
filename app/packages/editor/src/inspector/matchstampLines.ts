/**
 * What the Matchstamp tab shows of a MatchStamp's timestamps beside what
 * `matchstamps.ts` gives: their Coordinates exactly as the Timestamp tab
 * shows a timestamp's (the arranger's pins), each timeline marked with how
 * it takes part, and the
 * MatchStamp's **lines**, every dashed line it draws (its timestamps'
 * lines and its anchors' connectors) in the one screen order, each with
 * what its toggles act on. Values, rows and the order are core's and the
 * arranger's; nothing here computes one.
 */

import { inScreenOrder, namedPin, timelinePin } from "@timetoalign/tilie-arranger";
import type {
  Granularity,
  Knots,
  Manifest,
  NamedMatchStamp,
  NamedTimestamp,
} from "@timetoalign/tilie-core";
import {
  ancestorMembers,
  findTimeline,
  groupsHolding,
  isGroupMember,
  matchStampSpec,
  namedAsGroupstamp,
  prettyText,
} from "@timetoalign/tilie-core";
import { toRational } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { ShownStamp, StampAnchor, StampCoordinate } from "./matchstamps.ts";
import { matchStampsOf } from "./matchstamps.ts";
import type { TimelineRows } from "./timestamp.ts";
import { coordinateGroup, holdingGroupNames, timelineRows } from "./timestamp.ts";

// --- Coordinates -------------------------------------------------------------

/**
 * How a timeline of a MatchStamp's Coordinates takes part: `claimed` the
 * coordinate's own timeline, the value its MatchClaims state; `ancestor` an
 * ancestor of it; `crossed` a timeline of its subtree its line crosses;
 * `group` a timeline read through a group its match timestamp is a
 * GroupStamp of (another member, scaled, its ancestors and the descendants
 * its line crosses).
 */
export type Through = "claimed" | "ancestor" | "crossed" | "group";

/**
 * A group of the Matchstamp tab's Coordinates: the rows the Timestamp tab
 * shows for that timeline, with how the timeline takes part and, for
 * `group`, the names (else IDs) of the groups it is read through.
 */
export interface StampGroup extends TimelineRows {
  readonly through: Through;
  readonly groups: readonly string[];
}

/**
 * The names (else IDs) of the groups of `manifest` holding `timeline`
 * (core's `groupsHolding`) through which `other` is read: those holding
 * `other` too, and those one of whose listed members has `other` as an
 * ancestor (a member's ancestors are read with it).
 */
function groupsThrough(manifest: Manifest, timeline: string, other: string): string[] {
  const holding = new Set(groupsHolding(manifest, other).map((group) => group.id));
  return groupsHolding(manifest, timeline)
    .filter(
      (group) =>
        holding.has(group.id) ||
        group.members.some((member) =>
          ancestorMembers(manifest, member).some((item) => item.timeline === other),
        ),
    )
    .map((group) => group.name ?? group.id);
}

/**
 * The groups of the timestamps of `stamp`, a MatchStamp of block `block`'s
 * `manifest`, drawn as `drawing`, in screen order, each exactly as the
 * Timestamp tab's Coordinates show that timestamp: the rows
 * (`timelineRows`, top to bottom) of a named MatchStamp's match timestamp
 * read through its own pin (the arranger's `namedPin`, which adds the
 * members of its groups where it is a GroupStamp), of a potential one's
 * coordinate through the arranger's `timelinePin`, nothing stored, read as
 * a GroupStamp exactly where naming stores one (core's
 * `namedAsGroupstamp`), so that the Coordinates show before naming what
 * they show after it, under `granularity` with `knots`, on the lines the
 * canvas shows while the root `raised` has its ancestor cards raised (the
 * arranger's `raisedRoot`, `null` for none). Each group says how its
 * timeline takes part (`Through`). A coordinate whose timeline the
 * manifest no longer holds is its text alone, `claimed`. Each group's key
 * is unique among them, two coordinates on one timeline, or on timelines
 * sharing an ancestor, included.
 */
export function stampGroups(
  manifest: Manifest,
  block: string,
  drawing: Drawing,
  stamp: ShownStamp,
  granularity: Granularity,
  knots: Knots,
  raised: string | null = null,
): StampGroup[] {
  const stamped = inScreenOrder(
    drawing,
    stampedOf(manifest, stamp),
    (item) => item.coordinate,
    raised,
  );
  return stamped.flatMap(({ coordinate, timestamp }, at) => {
    const pin =
      timestamp === null
        ? timelinePin(
            manifest,
            block,
            drawing,
            coordinate.timeline,
            toRational(coordinate.value),
            granularity,
            knots,
            namedAsGroupstamp(manifest, coordinate.timeline, coordinate.value),
            raised,
            null,
          )
        : namedPin(manifest, block, drawing, timestamp.id, granularity, knots, raised, null);
    if (pin === null) {
      const key = JSON.stringify([at, coordinate.timeline]);
      const text = String(coordinate.value);
      const group = coordinateGroup(key, coordinate.timeline, coordinate.timeline, text);
      return [{ ...group, through: "claimed" as const, groups: [] }];
    }
    const own = coordinate.timeline;
    const ancestors = new Set(ancestorMembers(manifest, own).map((item) => item.timeline));
    const scaled = new Set(
      pin.spec.members.filter((item) => item.scale !== undefined).map((item) => item.timeline),
    );
    return timelineRows(pin).map((group): StampGroup => {
      const key = JSON.stringify([at, group.timeline]);
      const through: Through =
        group.timeline === own
          ? "claimed"
          : scaled.has(group.timeline)
            ? "group"
            : ancestors.has(group.timeline)
              ? "ancestor"
              : "crossed";
      const groups = through === "group" ? groupsThrough(manifest, own, group.timeline) : [];
      return { ...group, key, through, groups };
    });
  });
}

// --- Lines -------------------------------------------------------------------

/**
 * A timestamp's line of a MatchStamp: its timeline's name (else its ID)
 * and its coordinate in pretty text, the match timestamp it is (`null` while
 * the MatchStamp is potential: naming stores it), the other named
 * MatchStamps whose anchors name that match timestamp too, whose drawing a
 * change of its display changes as well, and whether it is a GroupStamp:
 * `null` where its timeline lies in no group, else `on` as stored, or for a
 * potential MatchStamp as naming stores it (core's `namedAsGroupstamp`: the
 * match timestamp lying there keeps its own, a new one is a GroupStamp),
 * with the names of the groups holding its timeline (`holdingGroupNames`).
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
  readonly groupstamp: { readonly on: boolean; readonly groups: readonly string[] } | null;
}

/** An alignment anchor's connector: the anchor, and the names of its two timelines in its order. */
export interface AnchorLine {
  readonly kind: "anchor";
  /** Unique among the lines of one MatchStamp. */
  readonly key: string;
  readonly anchor: StampAnchor;
  readonly names: readonly [string, string];
}

/** A line of a MatchStamp: a timestamp's line or an alignment anchor's connector. */
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
 * meeting one coordinate by their upper one, `raised` naming the root whose
 * ancestor cards are raised (the arranger's `raisedRoot`), else `null`. A
 * chain of timestamps and anchors therefore alternates as drawn: the top
 * timestamp, the anchor down to the next, that timestamp, and so on.
 */
export function stampLines(
  manifest: Manifest,
  stamp: ShownStamp,
  drawing: Drawing,
  raised: string | null = null,
): StampLine[] {
  const nameOf = (timeline: string) => {
    const found = findTimeline(manifest, timeline);
    return found === undefined ? timeline : (found.name ?? found.id);
  };
  const prettyOf = ({ timeline, value }: StampCoordinate) => {
    const found = findTimeline(manifest, timeline);
    return found === undefined ? String(value) : prettyText(value, found.number_type, found.unit);
  };
  const anchors = inScreenOrder(
    drawing,
    stamp.anchors,
    (anchor) => anchor.coordinates[0],
    raised,
  ).map((anchor): { at: StampCoordinate; line: StampLine } => ({
    at: anchor.coordinates[1],
    line: {
      kind: "anchor",
      key: JSON.stringify(["anchor", anchor.key]),
      anchor,
      names: [nameOf(anchor.coordinates[0].timeline), nameOf(anchor.coordinates[1].timeline)],
    },
  }));
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
        groupstamp: isGroupMember(manifest, coordinate.timeline)
          ? {
              on:
                timestamp?.groupstamp ??
                namedAsGroupstamp(manifest, coordinate.timeline, coordinate.value),
              groups: holdingGroupNames(manifest, coordinate.timeline),
            }
          : null,
      },
    }),
  );
  // Stable: at one place an anchor comes before the timestamp it reaches down to.
  return inScreenOrder(drawing, [...anchors, ...timestamps], (item) => item.at, raised).map(
    (item) => item.line,
  );
}
