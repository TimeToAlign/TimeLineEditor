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
import type { Screen } from "../src/matches.ts";
import { matchHitAt, matchLinesOf, overlayOf } from "../src/matches.ts";
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

describe("Show matches with 250,000 claims in view", () => {
  it("draws a view within 16 ms and answers a hover within 1 ms", { timeout: 60_000 }, () => {
    const view = viewOf({ id: A, fixture: "bundles/bundle_matchstamps", x: 40, y: 80 });
    const drawing = drawingOf(blockIn(view, A), view.graphical, metrics);
    const index = anchorIndexOf(matchClaimColumns(TIMELINES, generated()));
    const placed = { origin: { x: 40, y: 80 }, scale: 1 };
    const whole: Screen = { x: 0, y: 0, zoom: 1, width: 1000, height: 600, ratio: 1 };
    const close: Screen = { x: -1144, y: -340, zoom: 4, width: 1000, height: 600, ratio: 1 };
    const shown = matchLinesOf(drawing, index);
    const drawn = overlayOf(index, shown, placed, whole);
    const zoom1 = fastest(() => overlayOf(index, shown, placed, whole));
    const zoom4 = fastest(() => overlayOf(index, shown, placed, close));
    const hover = fastest(() => {
      matchHitAt(index, shown, drawn.connectors, { x: 261.0927734375, y: 100.5859375 }, 8);
    });
    console.info(
      `Show matches: ${index.coordinates.count} coordinates, ${index.anchors.count} anchors; ` +
        `${drawn.lines.length} lines and ${drawn.connectors.length} connectors drawn at zoom 1; ` +
        `overlay at zoom 1 ${zoom1.toFixed(2)} ms, ` +
        `at zoom 4 ${zoom4.toFixed(2)} ms, hover ${hover.toFixed(3)} ms`,
    );
    expect(zoom1).toBeLessThan(16);
    expect(zoom4).toBeLessThan(16);
    expect(hover).toBeLessThan(1);
  });
});
