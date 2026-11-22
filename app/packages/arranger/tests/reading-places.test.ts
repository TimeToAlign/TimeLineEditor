// @vitest-environment jsdom
/**
 * A reading belongs to the line it was read on: at every place of every
 * value, the flag a reading there shows and the pin made from it (the
 * timeline's pin at that position, the read line preferred) list the same
 * rows, with the ancestor cards shown and hidden, nothing raised and each
 * root raised. Derived in `README.md` ("A reading and the pin made from it").
 */

import type { Manifest, TimelineManifest, View } from "@timetoalign/tilie-core";
import { DEFAULT_GRANULARITY, idAddress, inBlock } from "@timetoalign/tilie-core";
import { axisCoordinate, Rational, realOf, toRational } from "@timetoalign/tilie-core/numbers";
import { describe, expect, it } from "vitest";
import type { FlagPart } from "../src/coordinates.ts";
import {
  flagParts,
  groupScoped,
  placesAt,
  raisedRoot,
  readingAt,
  timelinePin,
} from "../src/coordinates.ts";
import type { Editing } from "../src/editing.ts";
import type { BlockNode } from "../src/node.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { A, blockIn, metrics, viewOf, withoutAncestorCards } from "./support.ts";

/** The manifest fixtures holding a grouped child, so drawing ancestor cards. */
const FIXTURES = [
  "groups/group_parent_both",
  "groups/group_parent_right",
  "groups/group_parent_exact",
  "groups/group_child_member",
  "groups/group_child_member_stamps",
  "groups/group_grandchild",
  "groups/group_parents_mixed",
  "bundles/bundle_mixed",
  "bundles/bundle_shared_parent",
] as const;

/** A zoom at which half a device pixel spans less than the gap between any two values sampled. */
const ZOOM = 2 ** 20;

/** Every timeline of `manifest`, in pre-order. */
function timelinesOf(manifest: Manifest): TimelineManifest[] {
  const found: TimelineManifest[] = [];
  const walk = (list: readonly TimelineManifest[]) => {
    for (const timeline of list) {
      found.push(timeline);
      walk(timeline.children);
    }
  };
  walk(manifest.timelines);
  return found;
}

/** Each timeline of `manifest` by ID, with its parent's ID (`null` for a root). */
function parentsOf(manifest: Manifest): Map<string, TimelineManifest & { parent: string | null }> {
  const found = new Map<string, TimelineManifest & { parent: string | null }>();
  const walk = (list: readonly TimelineManifest[], parent: string | null) => {
    for (const timeline of list) {
      found.set(timeline.id, { ...timeline, parent });
      walk(timeline.children, timeline.id);
    }
  };
  walk(manifest.timelines, null);
  return found;
}

/**
 * Where `timeline`'s value `value` lies on its root's axis: the value plus
 * the offsets of `timeline` and of each of its ancestors below the root,
 * read on their own axes from the manifest, beside the root's ID.
 */
function onRoot(
  timelines: ReadonlyMap<string, TimelineManifest & { parent: string | null }>,
  timeline: string,
  value: Rational,
): { root: string; position: Rational } {
  let position = value;
  let at = timelines.get(timeline);
  while (at?.parent !== null && at?.parent !== undefined) {
    if (at.offset === undefined) throw new Error(`the child ${at.id} states no offset`);
    position = position.add(toRational(realOf(axisCoordinate(at.offset, at))));
    at = timelines.get(at.parent);
  }
  if (at === undefined) throw new Error(`no timeline ${timeline}`);
  return { root: at.id, position };
}

/**
 * The values sampled on `timeline`: `k × length / 8` for `k` from 0 to 8
 * on its own axis, an int axis's floored, a float axis's rounded to three
 * decimals; none for a timeline of unknown length.
 */
function samples(timeline: TimelineManifest): Rational[] {
  if (timeline.length === null) return [];
  const length = toRational(realOf(axisCoordinate(timeline.length, timeline)));
  return Array.from({ length: 9 }, (_, k) => {
    const exact = length.multiply(Rational.fromParts(BigInt(k), 8n));
    if (timeline.number_type === "int") {
      return Rational.fromParts(exact.numerator / exact.denominator, 1n);
    }
    if (timeline.number_type === "float") {
      const thousandths =
        (exact.numerator * 1000n * 2n + exact.denominator) / (2n * exact.denominator);
      return Rational.fromParts(thousandths, 1000n);
    }
    return exact;
  });
}

/**
 * A flag's parts as `[timeline, name, [row, value]…]`, each value exact: the
 * row's value itself (integers and rationals written out whole, a float as
 * the shortest text giving its double back), else why it has none.
 */
const shown = (parts: readonly FlagPart[]) =>
  JSON.stringify(
    parts.map(({ timeline, name, rows }) => [
      timeline,
      name,
      rows.map((row) => [row.row.map ?? "coordinate", row.value ?? row.missing]),
    ]),
    (_, value: unknown) => (typeof value === "bigint" ? `${value}n` : value),
  );

/** The states a block is read in: nothing open, then each root its timeline editor raises. */
function editorsOf(view: View): (Editing | null)[] {
  const block = blockIn(view, A);
  const [node] = project(view, NOTHING_SELECTED, [], metrics, null);
  const roots = [
    ...new Set(
      (node?.data.drawing.boxes ?? []).flatMap((box) =>
        box.ancestor === undefined || box.address.id === undefined ? [] : [box.address.id],
      ),
    ),
  ];
  const raising = roots.flatMap((root): Editing[] => {
    const editing: Editing = { target: inBlock(A, idAddress(root)), kind: "timeline" };
    return raisedRoot(block, editing) === root ? [editing] : [];
  });
  return [null, ...raising];
}

interface Outcome {
  /** How many places were read and compared. */
  readonly compared: number;
  /** The places whose reading the pin made from it lists otherwise, or not at the value. */
  readonly differing: readonly unknown[];
  /** The places where the reading hovers another line than the place's. */
  readonly elsewhere: readonly unknown[];
  /** The places whose reading's anchor lies under another root than the timeline, so no value is checked. */
  readonly unchecked: readonly unknown[];
}

/** Every place of every sampled value of every timeline of `view`'s block A, read in every editor state. */
function compareAll(view: View): Outcome {
  const block = blockIn(view, A);
  let compared = 0;
  const differing: unknown[] = [];
  const elsewhere: unknown[] = [];
  const unchecked: unknown[] = [];
  for (const editing of editorsOf(view)) {
    const nodes: BlockNode[] = project(view, NOTHING_SELECTED, [], metrics, editing);
    const [node] = nodes;
    if (node === undefined) throw new Error("no node");
    const { drawing } = node.data;
    const raised = raisedRoot(block, editing);
    const timelines = parentsOf(block.manifest);
    for (const timeline of timelinesOf(block.manifest)) {
      for (const value of samples(timeline)) {
        for (const place of placesAt(drawing, timeline.id, value, raised)) {
          compared += 1;
          const point = {
            x: node.position.x + place.x * block.scale,
            y: node.position.y + place.axis.y * block.scale,
          };
          const reading = readingAt(nodes, point, {
            zoom: ZOOM,
            ratio: 1,
            granularity: DEFAULT_GRANULARITY,
          });
          const where = [raised, timeline.id, value.toString(), place.key];
          if (reading === null) {
            differing.push([...where, "nothing read"]);
            continue;
          }
          if (reading.hit.key !== place.key) {
            elsewhere.push([raised, timeline.id, value.toString(), reading.hit.axis.timeline]);
          }
          const anchor = reading.pin.spec.anchor.timeline;
          const pin = timelinePin(
            block.manifest,
            A,
            drawing,
            anchor,
            reading.position,
            DEFAULT_GRANULARITY,
            "no_server",
            groupScoped(editing),
            raised,
            reading.hit.key,
          );
          const flag = shown(flagParts(reading.pin));
          const made = pin === null ? null : shown(flagParts(pin));
          const read = onRoot(timelines, anchor, reading.position);
          const sampled = onRoot(timelines, timeline.id, value);
          if (read.root !== sampled.root) unchecked.push([...where, anchor]);
          const atValue =
            read.root !== sampled.root || read.position.compare(sampled.position) === 0;
          if (!atValue || flag !== made) {
            differing.push([...where, reading.position.toString(), flag, made]);
          }
        }
      }
    }
  }
  return { compared, differing, elsewhere, unchecked };
}

/** Where a recapitulation segment at 0 is read on the segment ending there: `[raised, timeline, value, line read]`. */
const boundary = (raised: string | null, timeline: string) => [
  raised,
  timeline,
  "0",
  "recapitulation_first",
];

/**
 * Per fixture: the places compared with the ancestor cards shown, then
 * hidden, and where the reading hovers another line than the place's,
 * shown, then hidden (`README.md`).
 */
const EXPECTED: readonly (readonly [string, number, number, unknown[], unknown[]])[] = [
  ["groups/group_parent_both", 53, 23, [], []],
  ["groups/group_parent_right", 54, 23, [], []],
  ["groups/group_parent_exact", 54, 27, [], []],
  ["groups/group_child_member", 53, 23, [], []],
  ["groups/group_child_member_stamps", 53, 23, [], []],
  ["groups/group_grandchild", 85, 25, [], []],
  ["groups/group_parents_mixed", 252, 47, [], []],
  ["bundles/bundle_mixed", 117, 47, [], []],
  [
    "bundles/bundle_shared_parent",
    405,
    143,
    [
      boundary(null, "recapitulation_second"),
      boundary(null, "recapitulation_second_1"),
      boundary("score", "recapitulation_second"),
      boundary("score", "recapitulation_second"),
      boundary("score", "recapitulation_second_1"),
      boundary("score", "recapitulation_second_1"),
    ],
    [boundary(null, "recapitulation_second"), boundary(null, "recapitulation_second_1")],
  ],
];

describe("a reading at every place and the pin made from it", () => {
  it("cover the fixtures holding a grouped child", () => {
    expect(EXPECTED.map(([fixture]) => fixture)).toEqual(FIXTURES);
    expect(EXPECTED.reduce((sum, [, shownCount, hidden]) => sum + shownCount + hidden, 0)).toBe(
      1507,
    );
  });

  it.each(EXPECTED)(
    "list the same rows in %s, with its ancestor cards shown (%i places) and hidden (%i)",
    (fixture, shownCount, hidden, shownElsewhere, hiddenElsewhere) => {
      const view = viewOf({ id: A, fixture, x: 40, y: 80 });
      const outcomes = [compareAll(view), compareAll(withoutAncestorCards(view))];
      expect(outcomes).toEqual([
        { compared: shownCount, differing: [], elsewhere: shownElsewhere, unchecked: [] },
        { compared: hidden, differing: [], elsewhere: hiddenElsewhere, unchecked: [] },
      ]);
    },
  );
});
