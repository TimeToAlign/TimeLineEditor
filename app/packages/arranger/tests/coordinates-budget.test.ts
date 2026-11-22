/**
 * The budget of "Show coordinates": a reading per pointer frame on the
 * fixture with the most lines, groups and ancestor cards. Derived in
 * `README.md` ("Show coordinates", Budget); run alone
 * (`vitest.budget.config.ts`), never in the default run.
 */

import { DEFAULT_GRANULARITY } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { axesOf, flagParts, readingAt } from "../src/coordinates.ts";
import type { Point } from "../src/gesture.ts";
import type { BlockNode } from "../src/node.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { A, metrics, viewOf } from "./support.ts";

/** The points of a sweep along each line: its ends and the points between, evenly spaced. */
const POINTS = 64;

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

describe("Show coordinates on bundles/bundle_shared_parent", () => {
  it("reads a pointer frame within 0.15 ms", { timeout: 60_000 }, () => {
    const view = viewOf({ id: A, fixture: "bundles/bundle_shared_parent", x: 40, y: 80 });
    const nodes: BlockNode[] = project(view, NOTHING_SELECTED, [], metrics, null);
    const [node] = nodes;
    if (node === undefined) throw new Error("no node");
    const { drawing } = node.data;
    const points: Point[] = [...axesOf(drawing).values()].flatMap((axis) =>
      Array.from({ length: POINTS }, (_, k) => ({
        x: node.position.x + axis.xStart + ((axis.xEnd - axis.xStart) * k) / (POINTS - 1),
        y: node.position.y + axis.y,
      })),
    );
    const options = { zoom: 1, ratio: 2, granularity: DEFAULT_GRANULARITY };
    let read = 0;
    /** Every point read as a pointer frame reads it: the reading and its flag's rows. */
    const sweep = () => {
      read = 0;
      for (const point of points) {
        const reading = readingAt(nodes, point, options);
        if (reading === null) continue;
        read += flagParts(reading.pin).length > 0 ? 1 : 0;
      }
    };
    const frame = fastest(sweep) / points.length;
    console.info(
      `Show coordinates: ${axesOf(drawing).size} lines read, ${points.length} points, ` +
        `${read} read; a pointer frame ${frame.toFixed(4)} ms`,
    );
    expect(frame).toBeLessThan(0.15);
  });
});
