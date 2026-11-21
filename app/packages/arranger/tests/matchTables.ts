/**
 * The MatchClaim tables of `README.md` ("Show matches") as anchor indexes,
 * over the timelines of `bundles/bundle_matchstamps`, and the named
 * MatchStamps of that manifest compared with T.
 */

import type { AnchorIndex, ClaimTimeline, ClaimValues } from "@timetoalign/tilie-core";
import { anchorIndexOf, checkMatchStamp, matchClaimColumns } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { NamedComparison } from "../src/matches.ts";

/** A value of a claim's side, as core's `ClaimValues` takes it. */
type Value = NonNullable<ClaimValues["start"]>[number];

const q = (numerator: number, denominator = 1) => Rational.of([numerator, denominator]);

/** The table T of `README.md`. */
const T_TIMELINES: readonly ClaimTimeline[] = [
  { id: "take_2", numberType: "int" },
  { id: "score", numberType: "fraction" },
  { id: "take_1", numberType: "int" },
  { id: "other", numberType: "float" },
];
export const TAKE_2 = 0;
export const SCORE = 1;
export const TAKE_1 = 2;
export const OTHER = 3;

function claim(
  id: string,
  left: number,
  leftValue: Value,
  right: number,
  rightValue: Value,
): ClaimValues {
  return { id, timelines: [left, right], start: [leftValue, rightValue] };
}

export const T: AnchorIndex = anchorIndexOf(
  matchClaimColumns(T_TIMELINES, [
    claim("claim_1", SCORE, q(4), TAKE_1, 88200n),
    claim("claim_2", SCORE, q(4), TAKE_1, 88200n),
    claim("claim_3", SCORE, q(6), TAKE_1, 264600n),
    claim("claim_4", TAKE_1, 264600n, TAKE_2, 297675n),
    claim("claim_5", TAKE_2, 297675n, TAKE_1, 176400n),
    claim("claim_6", SCORE, q(6), OTHER, 0.5),
    { id: "claim_7", timelines: [SCORE, TAKE_2] },
  ]),
);

/** The table D: `score k/200` ↔ `take_1 220k`, k = 0 … 1600. */
export const D: AnchorIndex = anchorIndexOf(
  matchClaimColumns(
    [
      { id: "score", numberType: "fraction" },
      { id: "take_1", numberType: "int" },
    ],
    Array.from({ length: 1601 }, (_, k) => claim(`claim_${k}`, 0, q(k, 200), 1, BigInt(220 * k))),
  ),
);

/** `matchstamp_1` (stated) and `matchstamp_2` (not) compared with T by core's `checkMatchStamp`. */
export const NAMED: readonly NamedComparison[] = [
  {
    id: "matchstamp_1",
    comparison: checkMatchStamp(T, {
      anchors: [
        {
          coordinates: [
            { timeline: "score", value: q(4) },
            { timeline: "take_1", value: 88200n },
          ],
          carriesName: true,
        },
      ],
      claims: ["claim_1", "claim_2"],
    }),
  },
  {
    id: "matchstamp_2",
    comparison: checkMatchStamp(T, {
      anchors: [
        {
          coordinates: [
            { timeline: "score", value: q(4) },
            { timeline: "take_2", value: 99225n },
          ],
          carriesName: false,
        },
      ],
      claims: ["claim_3"],
    }),
  },
];

/**
 * The user's beliefs B in T's MatchClaims, per row as core's `believedBy`
 * numbers them (false 0, unlikely 1, undecided 2, true 3): `claim_1` true,
 * `claim_2` unlikely, `claim_3` true, `claim_4` false, `claim_5`
 * undecided, `claim_6` true, `claim_7` undecided.
 */
export const BELIEVED: Uint8Array = Uint8Array.from([3, 1, 3, 0, 2, 3, 2]);

/** `matchstamp_1` compared with D, which has no take_1 88200: out of date. */
export const NAMED_IN_D: readonly NamedComparison[] = [
  {
    id: "matchstamp_1",
    comparison: checkMatchStamp(D, {
      anchors: [
        {
          coordinates: [
            { timeline: "score", value: q(4) },
            { timeline: "take_1", value: 88200n },
          ],
          carriesName: true,
        },
      ],
      claims: ["claim_1", "claim_2"],
    }),
  },
];
