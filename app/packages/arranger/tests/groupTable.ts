/**
 * The MatchClaim table G of `README.md` ("The hovered and the pinned
 * MatchStamp drawn as named") as an anchor index, over the timelines of
 * `bundles/bundle_matchstamp_groupstamp`.
 */

import type { AnchorIndex } from "@timetoalign/tilie-core";
import { anchorIndexOf, matchClaimColumns } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";

/** The manifest whose timelines G names, `score` a member of both its groups. */
export const GROUPSTAMP_FIXTURE = "bundles/bundle_matchstamp_groupstamp";

const q = (numerator: number) => Rational.of([numerator, 1]);

/**
 * G: `g_1` score 4 ↔ performance 1.0, `g_2` score 6 ↔ page 400, `g_3`
 * second-half 2 ↔ performance 3.0; its coordinates c0 score 4, c1 score 6,
 * c2 performance 1.0, c3 performance 3.0, c4 second-half 2, c5 page 400.
 */
export const G: AnchorIndex = anchorIndexOf(
  matchClaimColumns(
    [
      { id: "score", numberType: "fraction" },
      { id: "performance", numberType: "float" },
      { id: "second-half", numberType: "fraction" },
      { id: "page", numberType: "int" },
    ],
    [
      { id: "g_1", timelines: [0, 1], start: [q(4), 1.0] },
      { id: "g_2", timelines: [0, 3], start: [q(6), 400n] },
      { id: "g_3", timelines: [2, 1], start: [q(2), 3.0] },
    ],
  ),
);
