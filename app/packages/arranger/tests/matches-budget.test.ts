/**
 * The budget of "Show matches": the overlay of a view and a hover with
 * 250,000 claims in view. Derived in `README.md` ("Show matches", Budget);
 * run alone (`vitest.budget.config.ts`), never in the default run.
 */

import type { ClaimTimeline, ClaimValues } from "@timetoalign/tilie-core";
import { anchorIndexOf, matchClaimColumns } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { describe, expect, it } from "vitest";
import { drawingOf } from "../src/drawing.ts";
import type { Point } from "../src/gesture.ts";
import type { Screen } from "../src/matches.ts";
import {
  matchFlag,
  matchHitAt,
  matchLinesOf,
  namedGroupstamps,
  overlayOf,
  pathOf,
  stampOverlay,
} from "../src/matches.ts";
import { A, blockIn, metrics, viewOf } from "./support.ts";

const TIMELINES: readonly ClaimTimeline[] = [
  { id: "score", numberType: "fraction" },
  { id: "take_1", numberType: "int" },
  { id: "take_2", numberType: "int" },
];
const CLAIMS = 250_000;
const PAIRS = [
  [0, 1],
  [0, 2],
  [1, 2],
] as const;
/** The largest step: steps run up to 0.8 × 250,000 + 4. */
const STEPS = 200_008;

/** A fixed pseudo-random sequence in [0, 1), so every run measures the same table. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/**
 * Core's budget table (70 % instants, 25 % intervals, 5 % NOMATCH, the
 * same seed), its steps spread over the three lines' spans: score's 8
 * quarters in steps of 1/25001, take_1's 352800 and take_2's 396900
 * samples in whole samples.
 */
function generated(): ClaimValues[] {
  const random = generator(20261121);
  const value = (timeline: number, step: number) =>
    timeline === 0
      ? Rational.fromParts(BigInt(step), 25001n)
      : BigInt(Math.floor((step * (timeline === 1 ? 352800 : 396900)) / STEPS));
  return Array.from({ length: CLAIMS }, (_, row) => {
    const [left, right] = PAIRS[Math.floor(random() * 3)] as readonly [number, number];
    const kind = random();
    const step = Math.floor(row * 0.8 + random() * 4);
    const claim = { id: `claim_${row + 1}`, timelines: [left, right] as const };
    if (kind < 0.05) return claim;
    const start = [value(left, step), value(right, step)] as const;
    if (kind < 0.75) return { ...claim, start };
    const length = 1 + Math.floor(random() * 8);
    return { ...claim, start, end: [value(left, step + length), value(right, step + length)] };
  });
}

/** The shortest of 5 runs after one warm-up, in milliseconds. */
function fastest(run: () => void): number {
  run();
  let best = Number.POSITIVE_INFINITY;
  for (let n = 0; n < 5; n += 1) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

/** Two device pixels per CSS pixel: twice the columns of one. */
const RATIO = 2;
/** The hover tolerance: 8 device pixels at zoom 1, scale 1, two device pixels per CSS pixel. */
const TOLERANCE = 8 / RATIO;

describe("Show matches with 250,000 claims in view", () => {
  it("draws a view within 16 ms and answers a hover within 1 ms", { timeout: 60_000 }, () => {
    const view = viewOf({ id: A, fixture: "bundles/bundle_matchstamps", x: 40, y: 80 });
    const block = blockIn(view, A);
    const drawing = drawingOf(block, view.graphical, metrics);
    const index = anchorIndexOf(matchClaimColumns(TIMELINES, generated()));
    const placed = { origin: { x: 40, y: 80 }, scale: 1 };
    const whole: Screen = { x: 0, y: 0, zoom: 1, width: 1000, height: 600, ratio: RATIO };
    const close: Screen = { x: -1144, y: -340, zoom: 4, width: 1000, height: 600, ratio: RATIO };
    const shown = matchLinesOf(drawing, index);
    const drawn = overlayOf(index, shown, placed, whole);
    const zoom1 = fastest(() => overlayOf(index, shown, placed, whole));
    const zoom4 = fastest(() => overlayOf(index, shown, placed, close));
    /** The path of a view's overlay, written anew for every new overlay: measured, not bounded. */
    const pathAt = (screen: Screen) => {
      const { lines, connectors } = overlayOf(index, shown, placed, screen);
      return fastest(() => pathOf({ lines: [...lines], connectors }));
    };
    const path1 = pathAt(whole);
    const path4 = pathAt(close);
    pathOf(drawn);
    /**
     * A hover: the hit, the view's path again (written once per overlay, so
     * a lookup), the hovered MatchStamp's overlay with what naming would
     * store as a groupstamp (as the canvas reads it) and its path, its flag.
     */
    const hoverAt = (point: Point) => {
      const hit = matchHitAt(index, shown, drawn.connectors, point, TOLERANCE);
      if (hit === null) throw new Error("the budget's point hovers nothing");
      pathOf(drawn);
      pathOf(stampOverlay(index, shown, hit.stamp, namedGroupstamps(block.manifest, index)));
      return matchFlag(index, block.manifest, shown, hit.stamp, 3);
    };
    const point = { x: 261.0927734375, y: 100.5859375 };
    const rows = hoverAt(point).reduce((sum, group) => sum + group.rows.length, 0);
    const hover = fastest(() => hoverAt(point));
    console.info(
      `Show matches: ${index.coordinates.count} coordinates, ${index.anchors.count} anchors; ` +
        `${drawn.lines.length} lines and ${drawn.connectors.length} connectors drawn at zoom 1, ` +
        `ratio ${RATIO}; overlay at zoom 1 ${zoom1.toFixed(2)} ms, at zoom 4 ${zoom4.toFixed(2)} ms; ` +
        `its path at zoom 1 ${path1.toFixed(2)} ms, at zoom 4 ${path4.toFixed(2)} ms; ` +
        `hover (a MatchStamp of ${rows} coordinates) ${hover.toFixed(3)} ms`,
    );
    expect(zoom1).toBeLessThan(16);
    expect(zoom4).toBeLessThan(16);
    expect(hover).toBeLessThan(1);
  });
});
