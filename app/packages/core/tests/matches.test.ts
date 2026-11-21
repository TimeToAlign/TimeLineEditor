import { JsonFloat } from "@timetoalign/timetoshare";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { anchorValues } from "../src/commands/matchstamps.ts";
import type { AnchorIndex } from "../src/matches/anchors.ts";
import {
  anchorIndexOf,
  claimRowsOf,
  coordinateNear,
  coordinateOf,
  coordinatesWithin,
  coordinateValue,
  matchStampAnchors,
  matchStampMembers,
  segmentsOf,
} from "../src/matches/anchors.ts";
import {
  ANCHOR_BELIEFS,
  actorIri,
  anchorBelief,
  BELIEF_FILTERS,
  BELIEFS,
  beliefMask,
  believedBy,
} from "../src/matches/beliefs.ts";
import type { ClaimTimeline, ClaimValues } from "../src/matches/columns.ts";
import { matchClaimColumns } from "../src/matches/columns.ts";
import type { NamedAnchor, NamedMatchStampSpec } from "../src/matches/compare.ts";
import { checkMatchStamp } from "../src/matches/compare.ts";
import type { CoordinateValue } from "../src/number/coordinate.ts";
import { Rational } from "../src/number/rational.ts";
import { toRational } from "../src/number/real.ts";

const TIMELINES: readonly ClaimTimeline[] = [
  { id: "clt_1", numberType: "fraction" },
  { id: "dpt_1", numberType: "int" },
  { id: "cpt_1", numberType: "float" },
];
const CLT = 0;
const DPT = 1;
const CPT = 2;

const q = (numerator: number, denominator = 1) =>
  Rational.fromParts(BigInt(numerator), BigInt(denominator));
/** The double nearest 1/3, as an exact fraction. */
const D = Rational.fromParts(6004799503160661n, 18014398509481984n);
const TWO_53 = 9007199254740992n;

const CASE: readonly ClaimValues[] = [
  { id: "claim_1", timelines: [CLT, DPT], start: [q(1, 2), 22050n] },
  { id: "claim_2", timelines: [CLT, DPT], start: [q(1), 44100n], end: [q(2), 88200n] },
  { id: "claim_3", timelines: [CLT, DPT], start: [q(3, 2), 66150n] },
  { id: "claim_4", timelines: [CLT, DPT], start: [q(3), 132300n] },
  { id: "claim_5", timelines: [DPT, CLT], start: [132300n, q(3)] },
  { id: "claim_6", timelines: [DPT, CPT], start: [132300n, 3.0] },
  { id: "claim_7", timelines: [CLT, DPT], start: [q(4), 176400n] },
  { id: "claim_8", timelines: [CLT, CPT], start: [q(4), 4.0] },
  { id: "claim_9", timelines: [CLT, DPT] },
  { id: "claim_10", timelines: [CLT, DPT], start: [q(5), 220500n] },
  { id: "claim_11", timelines: [CLT, DPT], start: [q(1, 2), 22050n] },
  { id: "claim_12", timelines: [CLT, DPT], start: [q(1, 3), 14700n] },
  { id: "claim_13", timelines: [CLT, DPT], start: [D, 14701n] },
  { id: "claim_14", timelines: [CLT, DPT], start: [q(6), TWO_53] },
  { id: "claim_15", timelines: [CLT, DPT], start: [q(7), TWO_53 + 1n] },
];
const MASK = Uint8Array.from(CASE, (_, row) => (row === 9 || row === 10 ? 0 : 1));

function caseIndex(): AnchorIndex {
  return anchorIndexOf(matchClaimColumns(TIMELINES, CASE), MASK);
}

/** Offset lists as nested arrays, for exact comparison. */
function lists(offsets: Uint32Array, items: Uint32Array): number[][] {
  return Array.from({ length: offsets.length - 1 }, (_, at) =>
    Array.from(items.subarray(offsets[at] as number, offsets[at + 1] as number)),
  );
}

describe("the anchor index of the case", () => {
  const index = caseIndex();

  it("holds each coordinate once, ordered by timeline, position and exact value", () => {
    const { coordinates } = index;
    expect(coordinates.count).toBe(22);
    expect(Array.from(coordinates.byTimeline)).toEqual([0, 10, 20, 22]);
    expect(Array.from(coordinates.timeline)).toEqual([
      ...Array(10).fill(CLT),
      ...Array(10).fill(DPT),
      CPT,
      CPT,
    ]);
    const values = Array.from({ length: 22 }, (_, c) => coordinateValue(index, c));
    expect(values).toEqual([
      D,
      q(1, 3),
      q(1, 2),
      q(1),
      q(3, 2),
      q(2),
      q(3),
      q(4),
      q(6),
      q(7),
      14700n,
      14701n,
      22050n,
      44100n,
      66150n,
      88200n,
      132300n,
      176400n,
      TWO_53,
      TWO_53 + 1n,
      3.0,
      4.0,
    ]);
    expect(coordinates.position[0]).toBe(0.3333333333333333);
    expect(coordinates.position[1]).toBe(0.3333333333333333);
    expect(coordinates.position[18]).toBe(9007199254740992);
    expect(coordinates.position[19]).toBe(9007199254740992);
  });

  it("holds each anchor once with the rows stating it", () => {
    const { anchors } = index;
    expect(anchors.count).toBe(12);
    expect(Array.from(anchors.low)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 16]);
    expect(Array.from(anchors.high)).toEqual([11, 10, 12, 13, 14, 15, 16, 17, 21, 18, 19, 20]);
    expect(lists(anchors.claimOffsets, anchors.claimRows)).toEqual([
      [12],
      [11],
      [0],
      [1],
      [2],
      [1],
      [3, 4],
      [6],
      [7],
      [13],
      [14],
      [5],
    ]);
    expect(Array.from(anchors.startOf)).toEqual([2, 3, 4, 6, 6, 11, 7, 8, -1, -1, -1, 1, 0, 9, 10]);
    expect(Array.from(anchors.endOf)).toEqual([-1, 5, ...Array(13).fill(-1)]);
  });

  it("lists each coordinate's neighbours ascending with the anchor joining each", () => {
    const { neighbours } = index;
    const joined = lists(neighbours.offsets, neighbours.coordinates);
    const via = lists(neighbours.offsets, neighbours.anchors);
    expect(joined).toEqual([
      [11],
      [10],
      [12],
      [13],
      [14],
      [15],
      [16],
      [17, 21],
      [18],
      [19],
      [1],
      [0],
      [2],
      [3],
      [4],
      [5],
      [6, 20],
      [7],
      [8],
      [9],
      [16],
      [7],
    ]);
    expect(via[7]).toEqual([7, 8]);
    expect(via[16]).toEqual([6, 11]);
    expect(via[0]).toEqual([0]);
  });

  it("joins the coordinates into potential MatchStamps", () => {
    const { matchStamps } = index;
    expect(matchStamps.count).toBe(10);
    expect(lists(matchStamps.offsets, matchStamps.members)).toEqual([
      [0, 11],
      [1, 10],
      [2, 12],
      [3, 13],
      [4, 14],
      [5, 15],
      [6, 16, 20],
      [7, 17, 21],
      [8, 18],
      [9, 19],
    ]);
    expect(Array.from(matchStamps.of)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 6, 7,
    ]);
    expect(Array.from(matchStampMembers(index, 6))).toEqual([6, 16, 20]);
    expect(Array.from(matchStampAnchors(index, 6))).toEqual([6, 11]);
    expect(Array.from(claimRowsOf(index, matchStampAnchors(index, 6)))).toEqual([3, 4, 5]);
  });

  it("bounds a matched span per interval claim", () => {
    const { spans } = index;
    expect(spans.count).toBe(1);
    expect(Array.from(spans.rows)).toEqual([1]);
    expect(Array.from(spans.start)).toEqual([3]);
    expect(Array.from(spans.end)).toEqual([5]);
  });

  it("gives the segments of two timelines with the gaps a matched span covers", () => {
    const forward = segmentsOf(index, CLT, DPT);
    expect(Array.from(forward.anchors)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10]);
    expect(Array.from(forward.covered)).toEqual([0, 0, 0, 1, 1, 0, 0, 0, 0]);
    const backward = segmentsOf(index, DPT, CLT);
    expect(Array.from(backward.anchors)).toEqual([1, 0, 2, 3, 4, 5, 6, 7, 9, 10]);
    expect(Array.from(backward.covered)).toEqual([0, 0, 0, 1, 1, 0, 0, 0, 0]);
    const lone = segmentsOf(index, CLT, CPT);
    expect(Array.from(lone.anchors)).toEqual([8]);
    expect(Array.from(lone.covered)).toEqual([]);
    expect(() => segmentsOf(index, CLT, CLT)).toThrow(
      new RangeError("segments need two timelines, not 0 twice"),
    );
  });

  it("hit-tests by position and looks values up exactly", () => {
    expect(coordinateNear(index, CLT, 1.4, 0.2)).toBe(4);
    expect(coordinateNear(index, CLT, 2.5, 0.25)).toBe(-1);
    expect(coordinateNear(index, CLT, 2.5, 0.5)).toBe(5);
    expect(coordinateNear(index, CLT, 0.3333333333333333, 0)).toBe(0);
    expect(coordinatesWithin(index, DPT, 44100, 88200)).toEqual([13, 16]);
    expect(coordinateOf(index, "clt_1", q(1, 3))).toBe(1);
    expect(coordinateOf(index, "clt_1", D)).toBe(0);
    expect(coordinateOf(index, "dpt_1", TWO_53 + 1n)).toBe(19);
    expect(coordinateOf(index, "cpt_1", 3.0)).toBe(20);
    expect(coordinateOf(index, "cpt_1", 3n)).toBe(-1);
    expect(coordinateOf(index, "clt_1", q(5))).toBe(-1);
    expect(coordinateOf(index, "nope", q(1))).toBe(-1);
  });

  it("counts every row without a mask", () => {
    const all = anchorIndexOf(matchClaimColumns(TIMELINES, CASE));
    expect(all.coordinates.count).toBe(24);
    expect(all.anchors.count).toBe(13);
    expect(all.matchStamps.count).toBe(11);
    const anchor = Array.from(all.anchors.low).findIndex(
      (low, a) =>
        coordinateValue(all, low).toString() === "1/2" &&
        coordinateValue(all, all.anchors.high[a] as number) === 22050n,
    );
    const { claimOffsets, claimRows } = all.anchors;
    expect(
      Array.from(
        claimRows.subarray(claimOffsets[anchor] as number, claimOffsets[anchor + 1] as number),
      ),
    ).toEqual([0, 10]);
  });

  it("takes −0.0 and 0.0 on a float axis as one coordinate", () => {
    const columns = matchClaimColumns(TIMELINES, [
      { id: "x", timelines: [CPT, DPT], start: [0, 0n] },
      { id: "y", timelines: [CPT, DPT], start: [0, 1n] },
    ]);
    columns.a.start.position[0] = -0;
    expect(Object.is(columns.a.start.position[0], -0)).toBe(true);
    const zeros = anchorIndexOf(columns);
    expect(zeros.coordinates.count).toBe(3);
    expect(Object.is(zeros.coordinates.position[2], 0)).toBe(true);
    expect(Array.from(zeros.anchors.low)).toEqual([0, 1]);
    expect(Array.from(zeros.anchors.high)).toEqual([2, 2]);
  });
});

describe("refusals", () => {
  const columns = () => matchClaimColumns(TIMELINES, CASE.slice(0, 3));

  it("refuses a column of another length", () => {
    const given = columns();
    const short = { ...given, a: { ...given.a, timeline: new Uint32Array(2) } };
    expect(() => anchorIndexOf(short)).toThrow(
      new RangeError("a.timeline has 2 entries for 3 rows"),
    );
    expect(() => anchorIndexOf(given, new Uint8Array(4))).toThrow(
      new RangeError("the mask has 4 entries for 3 rows"),
    );
  });

  it("refuses a claim ID given to two rows", () => {
    const repeated = matchClaimColumns(TIMELINES, [
      ...CASE.slice(0, 2),
      { ...(CASE[0] as ClaimValues) },
    ]);
    expect(() => anchorIndexOf(repeated)).toThrow(
      new RangeError("row 2: the claim ID 'claim_1' names row 0 already"),
    );
  });

  it("refuses a timeline number beyond the timelines", () => {
    const given = columns();
    given.b.timeline[1] = 3;
    expect(() => anchorIndexOf(given)).toThrow(
      new RangeError("row 1: b.timeline 3 names no timeline (3 given)"),
    );
  });

  it("refuses an end anchor without a start anchor", () => {
    const given = columns();
    given.startPresent[1] = 0;
    expect(() => anchorIndexOf(given)).toThrow(
      new RangeError("row 1: an end anchor without a start anchor"),
    );
  });

  it("refuses values off their axis's encoding", () => {
    const int = columns();
    int.b.start.denominator[0] = 2n;
    expect(() => anchorIndexOf(int)).toThrow(
      new RangeError("row 0: b.start on 'dpt_1': the denominator 2 of an int value"),
    );
    const zero = columns();
    zero.a.end.denominator[1] = 0n;
    expect(() => anchorIndexOf(zero)).toThrow(
      new RangeError("row 1: a.end on 'clt_1': the denominator 0"),
    );
    const unreduced = columns();
    unreduced.a.start.numerator[0] = 2n;
    unreduced.a.start.denominator[0] = 4n;
    expect(() => anchorIndexOf(unreduced)).toThrow(
      new RangeError("row 0: a.start on 'clt_1': 2/4 is not in lowest terms"),
    );
    const large = columns();
    large.a.start.numerator[0] = 2n ** 60n;
    large.a.start.denominator[0] = 2n ** 61n;
    expect(() => anchorIndexOf(large)).toThrow(
      new RangeError(
        "row 0: a.start on 'clt_1': 1152921504606846976/2305843009213693952 is not in lowest terms",
      ),
    );
    const infinite = columns();
    infinite.b.start.position[2] = Number.POSITIVE_INFINITY;
    expect(() => anchorIndexOf(infinite)).toThrow(
      new RangeError("row 2: b.start on 'dpt_1': the position Infinity"),
    );
  });

  it("refuses an exact value whose position is not the double nearest it", () => {
    const half = columns();
    half.a.start.position[0] = 0.75;
    expect(() => anchorIndexOf(half)).toThrow(
      new RangeError("row 0: a.start on 'clt_1': the position 0.75 of 1/2, whose double is 0.5"),
    );
    const large = matchClaimColumns(TIMELINES, CASE);
    expect(large.b.start.position[14]).toBe(9007199254740992);
    large.b.start.position[14] = 9007199254740994;
    expect(() => anchorIndexOf(large)).toThrow(
      new RangeError(
        "row 14: b.start on 'dpt_1': the position 9007199254740994 of 9007199254740993, " +
          "whose double is 9007199254740992",
      ),
    );
    const third = matchClaimColumns(TIMELINES, CASE);
    const above = 0.3333333333333333 + 2 ** -54;
    expect(above).toBe(0.33333333333333337);
    third.a.start.position[11] = above;
    expect(() => anchorIndexOf(third)).toThrow(
      new RangeError(
        "row 11: a.start on 'clt_1': the position 0.33333333333333337 of 1/3, " +
          "whose double is 0.3333333333333333",
      ),
    );
  });
});

describe("spans that overlap and run backwards", () => {
  const index = anchorIndexOf(
    matchClaimColumns(TIMELINES, [
      { id: "claim_1", timelines: [CLT, DPT], start: [q(0), 0n], end: [q(4), 40n] },
      { id: "claim_2", timelines: [DPT, CLT], start: [20n, q(2)], end: [60n, q(6)] },
      { id: "claim_3", timelines: [CLT, DPT], start: [q(5), 50n] },
      { id: "claim_4", timelines: [CLT, DPT], start: [q(9), 90n], end: [q(7), 70n] },
      { id: "claim_5", timelines: [CLT, DPT], start: [q(8), 80n] },
    ]),
  );
  const steps = [0, 1, 2, 3, 4, 5, 6, 7];

  it("holds the coordinates and anchors of both timelines alike", () => {
    expect(index.coordinates.count).toBe(16);
    expect(Array.from(index.coordinates.byTimeline)).toEqual([0, 8, 16, 16]);
    expect(Array.from({ length: 16 }, (_, c) => coordinateValue(index, c))).toEqual([
      ...[0, 2, 4, 5, 6, 7, 8, 9].map((n) => q(n)),
      ...[0n, 20n, 40n, 50n, 60n, 70n, 80n, 90n],
    ]);
    const { anchors } = index;
    expect(anchors.count).toBe(8);
    expect(Array.from(anchors.low)).toEqual(steps);
    expect(Array.from(anchors.high)).toEqual(steps.map((k) => k + 8));
    expect(lists(anchors.claimOffsets, anchors.claimRows)).toEqual([
      [0],
      [1],
      [0],
      [2],
      [1],
      [3],
      [4],
      [3],
    ]);
    expect(Array.from(anchors.startOf)).toEqual([0, 1, 3, 7, 6]);
    expect(Array.from(anchors.endOf)).toEqual([2, 4, -1, 5, -1]);
  });

  it("joins each coordinate to its partner", () => {
    const { neighbours, matchStamps } = index;
    expect(lists(neighbours.offsets, neighbours.coordinates)).toEqual([
      ...steps.map((k) => [k + 8]),
      ...steps.map((k) => [k]),
    ]);
    expect(lists(neighbours.offsets, neighbours.anchors)).toEqual([
      ...steps.map((k) => [k]),
      ...steps.map((k) => [k]),
    ]);
    expect(matchStamps.count).toBe(8);
    expect(lists(matchStamps.offsets, matchStamps.members)).toEqual(steps.map((k) => [k, k + 8]));
  });

  it("bounds a span per interval claim, whichever end comes first", () => {
    const { spans } = index;
    expect(spans.count).toBe(3);
    expect(Array.from(spans.rows)).toEqual([0, 1, 3]);
    expect(Array.from(spans.start)).toEqual([0, 1, 7]);
    expect(Array.from(spans.end)).toEqual([2, 4, 5]);
  });

  it("covers every gap under a span once, and no gap under none", () => {
    for (const [first, second] of [
      [CLT, DPT],
      [DPT, CLT],
    ] as const) {
      const segments = segmentsOf(index, first, second);
      expect(Array.from(segments.anchors)).toEqual(steps);
      expect(Array.from(segments.covered)).toEqual([1, 1, 1, 1, 0, 1, 1]);
    }
  });
});

describe("the index against a reference", () => {
  /** A coordinate's reference key: its timeline and its exact value's text. */
  const keyOf = (timeline: number, value: CoordinateValue) =>
    `${timeline}:${typeof value === "number" ? `f${value + 0}` : toRational(value).toString()}`;

  function reference(columns: readonly ClaimValues[], mask: readonly boolean[]) {
    const values = new Map<string, { timeline: number; value: CoordinateValue }>();
    const anchors = new Map<string, number[]>();
    const pairs: [string, string, number][] = [];
    columns.forEach((claim, row) => {
      if (!mask[row]) return;
      for (const pair of [claim.start, claim.end]) {
        if (pair === undefined) continue;
        const keys = pair.map((value, side) => {
          const timeline = claim.timelines[side] as number;
          const key = keyOf(timeline, value);
          values.set(key, { timeline, value });
          return key;
        }) as [string, string];
        pairs.push([keys[0], keys[1], row]);
      }
    });
    const sorted = [...values.entries()].sort(([, left], [, right]) => {
      if (left.timeline !== right.timeline) return left.timeline - right.timeline;
      return toRational(left.value).compare(toRational(right.value));
    });
    const number = new Map(sorted.map(([key], at) => [key, at]));
    for (const [left, right, row] of pairs) {
      const u = number.get(left) as number;
      const v = number.get(right) as number;
      const key = `${Math.min(u, v)}|${Math.max(u, v)}`;
      const rows = anchors.get(key) ?? [];
      if (!rows.includes(row)) rows.push(row);
      anchors.set(key, rows);
    }
    const adjacency = sorted.map(() => new Set<number>());
    for (const key of anchors.keys()) {
      const [u, v] = key.split("|").map(Number) as [number, number];
      adjacency[u]?.add(v);
      adjacency[v]?.add(u);
    }
    const seen = new Set<number>();
    const sets: number[][] = [];
    sorted.forEach((_, start) => {
      if (seen.has(start)) return;
      const found = [start];
      seen.add(start);
      for (let at = 0; at < found.length; at += 1) {
        for (const next of adjacency[found[at] as number] ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            found.push(next);
          }
        }
      }
      sets.push(found.sort((x, y) => x - y));
    });
    const anchorList = [...anchors.entries()]
      .map(([key, rows]) => [...key.split("|").map(Number), rows.sort((x, y) => x - y)] as const)
      .sort((x, y) => (x[0] as number) - (y[0] as number) || (x[1] as number) - (y[1] as number));
    return { coordinates: sorted.map(([key]) => key), anchors: anchorList, sets };
  }

  const valueArbitrary = (timeline: number): fc.Arbitrary<CoordinateValue> =>
    timeline === CLT
      ? fc
          .tuple(fc.integer({ min: -2, max: 4 }), fc.integer({ min: 1, max: 3 }))
          .map(([n, d]) => q(n, d))
      : timeline === DPT
        ? fc.integer({ min: 0, max: 5 }).map(BigInt)
        : fc.constantFrom(0, -0, 0.5, 1, 1.5);
  const claimArbitrary = fc
    .tuple(
      fc.integer({ min: 0, max: 2 }),
      fc.integer({ min: 0, max: 2 }),
      fc.integer({ min: 0, max: 2 }),
    )
    .chain(([left, right, kind]) =>
      fc
        .tuple(
          valueArbitrary(left),
          valueArbitrary(right),
          valueArbitrary(left),
          valueArbitrary(right),
        )
        .map(([a, b, c, d]) => ({
          timelines: [left, right] as const,
          start: kind >= 1 ? ([a, b] as const) : undefined,
          end: kind === 2 ? ([c, d] as const) : undefined,
        })),
    );

  it("equals a reference built from exact value texts", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(claimArbitrary, fc.boolean()), { maxLength: 40 }), (drawn) => {
        const claims: ClaimValues[] = drawn.map(([claim], row) => ({
          id: `claim_${row + 1}`,
          timelines: claim.timelines,
          ...(claim.start === undefined ? {} : { start: claim.start }),
          ...(claim.end === undefined ? {} : { end: claim.end }),
        }));
        const mask = drawn.map(([, passes]) => passes);
        const index = anchorIndexOf(
          matchClaimColumns(TIMELINES, claims),
          Uint8Array.from(mask, Number),
        );
        const expected = reference(claims, mask);
        const coordinates = Array.from({ length: index.coordinates.count }, (_, c) =>
          keyOf(index.coordinates.timeline[c] as number, coordinateValue(index, c)),
        );
        expect(coordinates).toEqual(expected.coordinates);
        const { low, high, claimOffsets, claimRows } = index.anchors;
        const anchors = Array.from(low, (u, a) => [
          u,
          high[a] as number,
          Array.from(claimRows.subarray(claimOffsets[a] as number, claimOffsets[a + 1] as number)),
        ]);
        expect(anchors).toEqual(expected.anchors);
        const { offsets, members } = index.matchStamps;
        expect(lists(offsets, members)).toEqual(expected.sets);
      }),
      { numRuns: 300, seed: 20261121 },
    );
  });
});

describe("a named MatchStamp against the index", () => {
  const index = caseIndex();
  const at = (timeline: string, value: CoordinateValue) => ({ timeline, value });
  const anchor = (
    left: ReturnType<typeof at>,
    right: ReturnType<typeof at>,
    carriesName = false,
  ): NamedAnchor => ({ coordinates: [left, right], carriesName });
  const spec = (anchors: NamedAnchor[], claims: string[]): NamedMatchStampSpec => ({
    anchors,
    claims,
  });
  const chain = [
    anchor(at("clt_1", q(3)), at("dpt_1", 132300n)),
    anchor(at("dpt_1", 132300n), at("cpt_1", 3.0), true),
  ];
  const unchanged = {
    anchorsGone: [],
    anchorsNew: [],
    claimsMissing: [],
    claimsBelievedFalse: [],
    claimsElsewhere: [],
    claimsNew: [],
  };

  it("finds one that matches the table up to date", () => {
    const check = checkMatchStamp(index, spec(chain, ["claim_4", "claim_5", "claim_6"]));
    expect(check).toMatchObject({ stated: [6, 11], outOfDate: false, current: [6], ...unchanged });
    expect(check.statedBy).toEqual([Uint32Array.from([3, 4]), Uint32Array.from([5])]);
    expect(check.update).toEqual({
      matchStamp: 6,
      coordinates: Uint32Array.from([6, 16, 20]),
      anchors: Uint32Array.from([6, 11]),
      claims: ["claim_4", "claim_5", "claim_6"],
      nameAnchor: 11,
    });
    const elsewhere = checkMatchStamp(
      index,
      spec(chain, ["claim_4", "claim_5", "claim_6", "claim_1", "claim_9"]),
    );
    expect(elsewhere).toMatchObject({
      outOfDate: true,
      ...unchanged,
      claimsElsewhere: ["claim_1", "claim_9"],
    });
  });

  it("finds anchors gone and new, claims missing, believed false and new", () => {
    const check = checkMatchStamp(
      index,
      spec(
        [
          anchor(at("clt_1", q(4)), at("dpt_1", 176400n), true),
          anchor(at("clt_1", q(5)), at("dpt_1", 220500n)),
        ],
        ["claim_7", "claim_10", "claim_99"],
      ),
    );
    expect(check).toMatchObject({
      stated: [7, null],
      outOfDate: true,
      current: [7],
      anchorsGone: [1],
      anchorsNew: [8],
      claimsMissing: ["claim_99"],
      claimsBelievedFalse: ["claim_10"],
      claimsElsewhere: [],
      claimsNew: ["claim_8"],
    });
    expect(check.statedBy).toEqual([Uint32Array.from([6]), new Uint32Array(0)]);
    expect(check.update).toEqual({
      matchStamp: 7,
      coordinates: Uint32Array.from([7, 17, 21]),
      anchors: Uint32Array.from([7, 8]),
      claims: ["claim_7", "claim_8"],
      nameAnchor: 7,
    });
  });

  it("updates a split MatchStamp from the one holding more of its stated anchors", () => {
    const check = checkMatchStamp(
      index,
      spec(
        [
          anchor(at("clt_1", q(4)), at("dpt_1", 176400n)),
          ...chain.map((given) => ({ ...given, carriesName: false })),
          anchor(at("dpt_1", 176400n), at("cpt_1", 3.0), true),
        ],
        ["claim_4", "claim_5", "claim_6", "claim_7", "claim_17"],
      ),
    );
    expect(check).toMatchObject({
      stated: [7, 6, 11, null],
      outOfDate: true,
      current: [6, 7],
      anchorsGone: [3],
      anchorsNew: [8],
      claimsMissing: ["claim_17"],
      claimsBelievedFalse: [],
      claimsElsewhere: [],
      claimsNew: ["claim_8"],
    });
    expect(check.update).toEqual({
      matchStamp: 6,
      coordinates: Uint32Array.from([6, 16, 20]),
      anchors: Uint32Array.from([6, 11]),
      claims: ["claim_4", "claim_5", "claim_6"],
      nameAnchor: null,
    });
  });

  it("updates from the largest when no stated anchor carries the name", () => {
    const check = checkMatchStamp(
      index,
      spec(
        [
          anchor(at("clt_1", q(1, 2)), at("dpt_1", 22050n)),
          anchor(at("clt_1", q(4)), at("dpt_1", 176400n)),
        ],
        ["claim_1", "claim_7"],
      ),
    );
    expect(check.stated).toEqual([2, 7]);
    expect(check.update?.matchStamp).toBe(7);
    expect(check.update?.nameAnchor).toBeNull();
  });

  it("updates from the first stated anchor between MatchStamps of one size and count", () => {
    const one = anchor(at("clt_1", q(1)), at("dpt_1", 44100n));
    const half = anchor(at("clt_1", q(1, 2)), at("dpt_1", 22050n));
    const forward = checkMatchStamp(index, spec([one, half], []));
    expect(forward.stated).toEqual([3, 2]);
    expect(forward.update).toEqual({
      matchStamp: 3,
      coordinates: Uint32Array.from([3, 13]),
      anchors: Uint32Array.from([3]),
      claims: ["claim_2"],
      nameAnchor: null,
    });
    const backward = checkMatchStamp(index, spec([half, one], []));
    expect(backward.stated).toEqual([2, 3]);
    expect(backward.update).toEqual({
      matchStamp: 2,
      coordinates: Uint32Array.from([2, 12]),
      anchors: Uint32Array.from([2]),
      claims: ["claim_1"],
      nameAnchor: null,
    });
  });

  it("updates from the largest current MatchStamp, though it holds no stated anchor", () => {
    const check = checkMatchStamp(
      index,
      spec(
        [
          anchor(at("clt_1", q(1, 2)), at("dpt_1", 22050n)),
          anchor(at("dpt_1", 176400n), at("cpt_1", 3.0), true),
        ],
        [],
      ),
    );
    expect(check.stated).toEqual([2, null]);
    expect(check.current).toEqual([2, 6, 7]);
    expect(check.update).toEqual({
      matchStamp: 6,
      coordinates: Uint32Array.from([6, 16, 20]),
      anchors: Uint32Array.from([6, 11]),
      claims: ["claim_4", "claim_5", "claim_6"],
      nameAnchor: null,
    });
  });

  it("gives an index's anchors as a command gives them", () => {
    expect(anchorValues(index, [6, 11])).toEqual([
      [
        { timeline: "clt_1", coordinate: [3, 1] },
        { timeline: "dpt_1", coordinate: 132300 },
      ],
      [
        { timeline: "dpt_1", coordinate: 132300 },
        { timeline: "cpt_1", coordinate: new JsonFloat(3) },
      ],
    ]);
  });

  it("offers no Update when no anchor is stated", () => {
    const gone = checkMatchStamp(
      index,
      spec([anchor(at("clt_1", q(5)), at("dpt_1", 220500n), true)], ["claim_10"]),
    );
    expect(gone).toMatchObject({
      stated: [null],
      outOfDate: true,
      current: [],
      anchorsGone: [0],
      anchorsNew: [],
      claimsMissing: [],
      claimsBelievedFalse: ["claim_10"],
      claimsElsewhere: [],
      claimsNew: [],
      update: null,
    });
    const crossed = checkMatchStamp(
      index,
      spec([anchor(at("clt_1", q(1, 2)), at("dpt_1", 44100n))], ["claim_99"]),
    );
    expect(crossed).toMatchObject({
      stated: [null],
      outOfDate: true,
      current: [2, 3],
      anchorsGone: [0],
      anchorsNew: [2, 3],
      claimsMissing: ["claim_99"],
      claimsNew: ["claim_1", "claim_2"],
      update: null,
    });
  });
});

describe("the belief filter", () => {
  const A = "https://orcid.org/0000-0002-1825-0097";
  const B = "https://orcid.org/0000-0001-5109-3700";
  // The beliefs of TimeToShare's table fixture as the client decodes them.
  const beliefs = {
    actors: [B, A],
    offsets: Uint32Array.from([0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 5, 6, 6]),
    actor: Uint32Array.from([1, 1, 1, 1, 0, 0]),
    word: Uint8Array.from([0, 2, 0, 1, 0, 0]),
  };
  const rows = (mask: Uint8Array | null) =>
    mask === null ? null : Array.from(mask.keys()).filter((row) => mask[row] === 1);
  const every = Array.from({ length: 15 }, (_, row) => row);

  it("numbers the words as TimeToShare does and reads two filters", () => {
    expect(BELIEFS).toEqual(["true", "false", "unlikely"]);
    expect(BELIEF_FILTERS).toEqual(["not_false", "true"]);
  });

  it("gives the rows of the table fixture's cases", () => {
    expect(beliefMask(beliefs, null)).toBeNull();
    expect(beliefMask(beliefs, null, "true")).toBeNull();
    expect(rows(beliefMask(beliefs, A))).toEqual(every.filter((row) => row !== 12));
    expect(rows(beliefMask(beliefs, A, "true"))).toEqual([0, 10]);
    expect(rows(beliefMask(beliefs, B, "true"))).toEqual([12, 13]);
    expect(rows(beliefMask(beliefs, B))).toEqual(every);
    expect(rows(beliefMask(beliefs, "https://example.org/nobody"))).toEqual(every);
    expect(rows(beliefMask(beliefs, "https://example.org/nobody", "true"))).toEqual([]);
  });

  it("compares actors as the IRIs they stand for under the manifest's context", () => {
    const context = { orcid: "https://orcid.org/" };
    const compact = "orcid:0000-0002-1825-0097";
    expect(actorIri(context, compact)).toBe(A);
    expect(actorIri(null, compact)).toBe(compact);
    expect(actorIri(context, A)).toBe(A);
    expect(actorIri(context, "tag:example.org,2026:other")).toBe("tag:example.org,2026:other");
    expect(actorIri(context, "someone")).toBe("someone");

    const written = { ...beliefs, actors: [B, compact] };
    const notTwelve = every.filter((row) => row !== 12);
    expect(rows(beliefMask(written, A, "not_false", context))).toEqual(notTwelve);
    expect(rows(beliefMask(written, A, "true", context))).toEqual([0, 10]);
    expect(rows(beliefMask(written, compact, "not_false", context))).toEqual(notTwelve);
    expect(rows(beliefMask(written, compact, "true", context))).toEqual([0, 10]);
    expect(rows(beliefMask(written, A))).toEqual(every);
    expect(rows(beliefMask(written, A, "true"))).toEqual([]);

    const twice = {
      actors: [compact, A],
      offsets: Uint32Array.from([0, 2, 2]),
      actor: Uint32Array.from([0, 1]),
      word: Uint8Array.from([BELIEFS.indexOf("false"), BELIEFS.indexOf("true")]),
    };
    expect(rows(beliefMask(twice, A, "not_false", context))).toEqual([1]);
    expect(rows(beliefMask(twice, A, "true", context))).toEqual([0]);
  });

  it("gives the believer's belief per row, the most critical of several", () => {
    expect(ANCHOR_BELIEFS).toEqual(["false", "unlikely", "undecided", "true"]);
    const ofA = believedBy(beliefs, A);
    expect(Array.from(ofA)).toEqual([3, 2, 2, 2, 2, 1, 2, 2, 2, 2, 3, 2, 0, 2, 2]);
    expect(believedBy(beliefs, A)).toBe(ofA);
    const ofB = Array.from(believedBy(beliefs, B));
    expect(ofB).toEqual(every.map((row) => (row === 12 || row === 13 ? 3 : 2)));
    expect(Array.from(believedBy(beliefs, "https://example.org/nobody"))).toEqual(
      every.map(() => 2),
    );

    const context = { orcid: "https://orcid.org/" };
    const compact = "orcid:0000-0002-1825-0097";
    const written = { ...beliefs, actors: [B, compact] };
    expect(Array.from(believedBy(written, A, context))).toEqual(Array.from(ofA));
    const twice = {
      actors: [compact, A],
      offsets: Uint32Array.from([0, 2, 2]),
      actor: Uint32Array.from([0, 1]),
      word: Uint8Array.from([BELIEFS.indexOf("false"), BELIEFS.indexOf("true")]),
    };
    expect(Array.from(believedBy(twice, A, context))).toEqual([0, 2]);
  });

  it("draws an anchor by the most critical belief in the MatchClaims stating it", () => {
    const ofA = believedBy(beliefs, A);
    expect(anchorBelief(ofA, [0, 10])).toBe("true");
    expect(anchorBelief(ofA, [0, 5])).toBe("unlikely");
    expect(anchorBelief(ofA, Uint32Array.from([0, 5, 12]))).toBe("false");
    expect(anchorBelief(ofA, [1, 2])).toBe("undecided");
    expect(anchorBelief(ofA, [])).toBe("undecided");
  });

  it("refuses another filter word", () => {
    expect(() => beliefMask(beliefs, A, "false" as "true")).toThrow(
      new RangeError("'false' is no belief filter: write 'not_false' or 'true'"),
    );
  });
});
