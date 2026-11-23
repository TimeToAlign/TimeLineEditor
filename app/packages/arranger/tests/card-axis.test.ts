/**
 * The axis of a container (README, "Elisions on the canvas", items 5 and
 * 6): the scale of the run beside each gap edge, the base each timeline is
 * read on, and the abscissas of coordinates on the run list.
 */

import type { View } from "@timetoalign/tilie-core";
import { placeKeyText } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { cardAxisAt, zeroOf } from "../src/cardAxis.ts";
import { drawingOf } from "../src/drawing.ts";
import { A, blockIn, metrics, viewOf } from "./support.ts";

const STORED = viewOf({ id: A, fixture: "bundles/bundle_elisions_stored" });
const MEMBERS = viewOf({ id: A, fixture: "groups/group_elided_members" });

const drawingIn = (view: View): Drawing => drawingOf(blockIn(view, A), view.graphical, metrics);

function axisAt(view: View, key: { item: string; member?: string }) {
  const found = cardAxisAt(blockIn(view, A).manifest, drawingIn(view), key);
  if (found === null) throw new Error(`no axis at ${placeKeyText(key)}`);
  return found;
}

const SCORE_CARD = { item: "group_1", member: "score" };
const q = (n: bigint) => Rational.fromParts(n, 1n);

describe("the scale of a run", () => {
  it("is the run's L over the base's length beside every gap edge", () => {
    const scales = (view: View, key: { item: string; member?: string }) => {
      const axis = axisAt(view, key);
      return axis.exposure.gaps.flatMap((gap) =>
        gap.origin === "carried" ? [] : [axis.edgeScale(gap, "start"), axis.edgeScale(gap, "end")],
      );
    };
    expect(scales(STORED, SCORE_CARD)).toEqual([50, 50, 50, 50, 50, 50]);
    expect(scales(STORED, { item: "group_1" })).toEqual([40, 40]);
    expect(scales(STORED, { item: "page" })).toEqual([0.22805017103762829, 0.22805017103762829]);
    expect(scales(MEMBERS, { item: "group_1" })).toEqual([
      25, 25, 16.666666666666668, 16.666666666666668,
    ]);
  });

  it("reads a timeline on its card's root, in a frame on its member", () => {
    const base = axisAt(MEMBERS, { item: "group_1" }).baseOf("phrase");
    expect([base?.base, base?.zero.toString(), String(base?.lambda)]).toEqual([
      "voice",
      "12",
      "24",
    ]);
    expect(axisAt(MEMBERS, { item: "group_1" }).baseOf("piece")).toBeNull();
    expect(axisAt(STORED, SCORE_CARD).baseOf("theme")?.zero.toString()).toBe("16");
    expect(zeroOf(blockIn(STORED, A).manifest, "theme").toString()).toBe("16");
  });
});

describe("abscissas on the runs", () => {
  it("draws a gap's edges and nothing inside it", () => {
    const axis = axisAt(STORED, SCORE_CARD);
    expect([
      axis.abscissaOf("score", q(32n)),
      axis.abscissaOf("score", q(48n)),
      axis.abscissaOf("score", q(40n)),
      axis.valueAt("score", 1532.2615751378676),
      axis.valueAt("score", 1662.2615751378676 + 200),
    ]).toEqual([1432.2615751378676, 1632.2615751378676, null, null, 60]);
  });
});
