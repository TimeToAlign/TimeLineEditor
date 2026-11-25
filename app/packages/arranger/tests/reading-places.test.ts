// @vitest-environment jsdom
/**
 * A reading belongs to the line it was read on: at every place of every
 * value, the flag a reading there shows and the pin made from it (the
 * timeline's pin at that position, the read line preferred) list the same
 * rows, with the ancestor cards shown and hidden, nothing raised and each
 * root raised. The cards are drawn whole (the Full view): a reading on an
 * elided card is tested on its own. Derived in `README.md` ("A reading and
 * the pin made from it").
 */

import type { Manifest, TimelineManifest, View } from "@timetoalign/tilie-core";
import { DEFAULT_GRANULARITY, idAddress, inBlock } from "@timetoalign/tilie-core";
import { axisCoordinate, Rational, realOf, toRational } from "@timetoalign/tilie-core/numbers";
import { describe, expect, it } from "vitest";
import { raisedRoot } from "../src/boxes.ts";
import type { FlagPart } from "../src/coordinates.ts";
import {
  axesOf,
  flagParts,
  groupScoped,
  placesAt,
  readingAt,
  timelinePin,
} from "../src/coordinates.ts";
import type { Editing } from "../src/editing.ts";
import type { BlockNode } from "../src/node.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { A, blockIn, metrics, viewOf, withFullCards, withoutAncestorCards } from "./support.ts";

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
  /** How many places are read with another anchor than the timeline sampled, by that timeline. */
  readonly anchored: Readonly<Record<string, number>>;
}

/** Every place of every sampled value of every timeline of `view`'s block A, read in every editor state. */
function compareAll(view: View): Outcome {
  const block = blockIn(view, A);
  let compared = 0;
  const differing: unknown[] = [];
  const elsewhere: unknown[] = [];
  const unchecked: unknown[] = [];
  const anchored: Record<string, number> = {};
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
          if (anchor !== timeline.id) anchored[timeline.id] = (anchored[timeline.id] ?? 0) + 1;
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
  return { compared, differing, elsewhere, unchecked, anchored };
}

/** How many abscissas each line is read at: its ends and the 63 points between, evenly spaced. */
const SAMPLES = 65;

interface Readable {
  /** How many points read a line. */
  readonly read: number;
  /** How many points read nothing: the line is covered there. */
  readonly covered: number;
  /** The points whose reading's line is no place of its position, or whose pin lists other rows. */
  readonly differing: readonly unknown[];
}

/**
 * Every line of `view`'s block A that the pointer reads (`axesOf`), at
 * `SAMPLES` abscissas from its start to its end, on its ordinate, read in
 * every editor state: each reading's line is a place of the reading's
 * position on its anchor's timeline, and the pin made there lists the
 * flag's rows.
 */
function readAll(view: View): Readable {
  const block = blockIn(view, A);
  let read = 0;
  let covered = 0;
  const differing: unknown[] = [];
  for (const editing of editorsOf(view)) {
    const nodes: BlockNode[] = project(view, NOTHING_SELECTED, [], metrics, editing);
    const [node] = nodes;
    if (node === undefined) throw new Error("no node");
    const { drawing } = node.data;
    const raised = raisedRoot(block, editing);
    for (const [key, axis] of axesOf(drawing)) {
      for (let k = 0; k < SAMPLES; k += 1) {
        const x = axis.xStart + ((axis.xEnd - axis.xStart) * k) / (SAMPLES - 1);
        const point = {
          x: node.position.x + x * block.scale,
          y: node.position.y + axis.y * block.scale,
        };
        const reading = readingAt(nodes, point, {
          zoom: ZOOM,
          ratio: 1,
          granularity: DEFAULT_GRANULARITY,
        });
        if (reading === null) {
          covered += 1;
          continue;
        }
        read += 1;
        const anchor = reading.pin.spec.anchor.timeline;
        const line = reading.hit.key;
        const placed = placesAt(drawing, anchor, reading.position, raised).some(
          (place) => place.key === line,
        );
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
          line,
        );
        const flag = shown(flagParts(reading.pin));
        const made = pin === null ? null : shown(flagParts(pin));
        if (!placed || flag !== made) {
          differing.push([raised, key, k, line, reading.position.toString(), placed, flag, made]);
        }
      }
    }
  }
  return { read, covered, differing };
}

/** Where a recapitulation segment at 0 is read on the segment ending there: `[raised, timeline, value, line read]`. */
const boundary = (raised: string | null, timeline: string) => [
  raised,
  timeline,
  "0",
  "recapitulation_first",
];

/** The segments of `bundle_shared_parent` read on their segment lines, each `count` times. */
const segments = (count: number, rest: Record<string, number>) => ({
  exposition_first: count,
  exposition_second: count,
  recapitulation_first_1: count,
  recapitulation_first_2: count,
  ...rest,
  recapitulation_second_1: count,
  recapitulation_second_2: count,
});

/** One fixture's outcome: its places compared, cards shown then hidden, and its readable points. */
interface Expected {
  readonly fixture: string;
  readonly places: readonly [Outcome, Outcome];
  /** Points read and covered, cards shown then hidden. */
  readonly points: readonly [readonly [number, number], readonly [number, number]];
}

/** An outcome where no place differs and every reading's anchor lies under the timeline's root. */
const outcome = (
  compared: number,
  elsewhere: unknown[] = [],
  anchored: Record<string, number> = {},
): Outcome => ({ compared, differing: [], elsewhere, unchecked: [], anchored });

/** Per fixture, the places and the points (`README.md`). */
const EXPECTED: readonly Expected[] = [
  {
    fixture: "groups/group_parent_both",
    places: [outcome(54), outcome(23)],
    points: [
      [776, 134],
      [195, 0],
    ],
  },
  {
    fixture: "groups/group_parent_right",
    places: [outcome(54), outcome(23)],
    points: [
      [648, 132],
      [195, 0],
    ],
  },
  {
    fixture: "groups/group_parent_exact",
    places: [outcome(54), outcome(27)],
    points: [
      [520, 130],
      [195, 0],
    ],
  },
  {
    fixture: "groups/group_child_member",
    places: [outcome(54), outcome(23)],
    points: [
      [648, 132],
      [195, 0],
    ],
  },
  {
    fixture: "groups/group_child_member_stamps",
    places: [outcome(54), outcome(23)],
    points: [
      [776, 134],
      [195, 0],
    ],
  },
  {
    fixture: "groups/group_grandchild",
    places: [outcome(72), outcome(25)],
    points: [
      [1164, 136],
      [260, 0],
    ],
  },
  {
    fixture: "groups/group_parents_mixed",
    places: [outcome(252), outcome(47)],
    points: [
      [3689, 731],
      [455, 0],
    ],
  },
  {
    fixture: "bundles/bundle_mixed",
    places: [outcome(108), outcome(47)],
    points: [
      [1231, 69],
      [390, 0],
    ],
  },
  {
    fixture: "bundles/bundle_shared_parent",
    places: [
      outcome(
        450,
        [
          boundary(null, "recapitulation_second"),
          boundary(null, "recapitulation_second"),
          boundary(null, "recapitulation_second_1"),
          boundary(null, "recapitulation_second_1"),
          boundary("score", "recapitulation_second"),
          boundary("score", "recapitulation_second"),
          boundary("score", "recapitulation_second_1"),
          boundary("score", "recapitulation_second_1"),
        ],
        segments(36, { recapitulation_second: 4, take_1_first: 9, take_1_second: 9 }),
      ),
      outcome(
        143,
        [boundary(null, "recapitulation_second"), boundary(null, "recapitulation_second_1")],
        segments(9, { recapitulation_second: 1, take_1_first: 9, take_1_second: 9 }),
      ),
    ],
    points: [
      [2142, 588],
      [585, 0],
    ],
  },
];

describe("a reading at every place and the pin made from it", () => {
  it("cover the fixtures holding a grouped child", () => {
    expect(EXPECTED.map(({ fixture }) => fixture)).toEqual(FIXTURES);
    expect(
      EXPECTED.reduce((sum, { places }) => sum + places[0].compared + places[1].compared, 0),
    ).toBe(1533);
  });

  it.each(EXPECTED)(
    "list the same rows in $fixture, cards shown and hidden",
    ({ fixture, places }) => {
      const view = withFullCards(viewOf({ id: A, fixture, x: 40, y: 80 }));
      expect([compareAll(view), compareAll(withoutAncestorCards(view))]).toEqual(places);
    },
  );
});

describe("a reading at every point of every line read", () => {
  it.each(EXPECTED)(
    "lies on a place of its position in $fixture, the pin listing the flag's rows",
    ({ fixture, points }) => {
      const view = withFullCards(viewOf({ id: A, fixture, x: 40, y: 80 }));
      expect([readAll(view), readAll(withoutAncestorCards(view))]).toEqual(
        points.map(([read, covered]) => ({ read, covered, differing: [] })),
      );
    },
  );
});
