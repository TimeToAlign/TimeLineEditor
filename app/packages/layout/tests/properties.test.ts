/**
 * Properties of `layout` over manifests edited by arbitrary command
 * sequences (core's generator) and drawn under arbitrary style rules.
 */

import {
  applyToManifest,
  isCommandError,
  type Manifest,
  type ManifestCommand,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import { canonicalOrder, dumps, type StyleRule, validateGeometry } from "@timetoalign/timeskeleton";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { commandFor, sequenceArbitrary } from "../../core/tests/generate.ts";
import { layout } from "../src/index.ts";
import { BLOCK, exact, load, manifestNames } from "./support.ts";

type Item = Record<string, unknown>;

const ruleArbitrary: fc.Arbitrary<StyleRule> = fc
  .record({
    select: fc.record(
      {
        element: fc.constantFrom("timeline", "child", "map", "region", "jump", "wedge", "label"),
        domain: fc.constantFrom("graphical", "logical", "physical"),
        modality: fc.constantFrom("continuous", "discrete"),
      },
      { requiredKeys: [] },
    ),
    set: fc.record(
      {
        visible: fc.boolean(),
        side: fc.constantFrom("above", "below"),
        show_length: fc.boolean(),
        show_projected_coordinates: fc.boolean(),
      },
      { requiredKeys: [] },
    ),
  })
  .filter((rule) => Object.keys(rule.set).length > 0) as fc.Arbitrary<StyleRule>;

/** Graphical rules from the manifest and a few containers, known or not. */
const graphicalArbitrary = fc.record({
  styles: fc.array(ruleArbitrary, { maxLength: 4 }),
  timelines: fc.dictionary(
    fc.constantFrom("n0", "n1", "c0", "c1", "tl:23", "score", "ghost"),
    fc.array(ruleArbitrary, { maxLength: 3 }),
    { maxKeys: 3 },
  ),
});

interface Extent {
  readonly start: ReturnType<typeof exact>;
  readonly end: ReturnType<typeof exact>;
}

function extent(item: Item): Extent {
  const [a, b] =
    item.kind === "jump"
      ? [exact(item.from), exact(item.to)]
      : [exact(item.start), exact(item.end)];
  return a.compare(b) <= 0 ? { start: a, end: b } : { start: b, end: a };
}

function conflicts(left: Extent, right: Extent): boolean {
  return (
    (left.start.compare(right.end) < 0 && right.start.compare(left.end) < 0) ||
    left.start.compare(right.start) === 0
  );
}

const BANDS: Readonly<Record<string, string>> = {
  timeline: "line",
  child: "line",
  map: "map",
  region: "region",
  jump: "jump",
};

/** Pairs of consecutive siblings in canonical order, at every depth. */
function siblings(manifest: Manifest): [string, string][] {
  const pairs: [string, string][] = [];
  const visit = (timeline: TimelineManifest) => {
    const children = Object.values(timeline.children).map((entry) => entry.timeline);
    for (let index = 1; index < children.length; index += 1) {
      pairs.push([
        (children[index - 1] as TimelineManifest).id,
        (children[index] as TimelineManifest).id,
      ]);
    }
    for (const child of children) visit(child);
  };
  const ordered = canonicalOrder(manifest as never) as unknown as Manifest;
  visit(ordered.timeline);
  return pairs;
}

function check(manifest: Manifest): void {
  const text = dumps(layout(manifest) as never);
  expect(dumps(layout(manifest) as never)).toBe(text);
  const block = layout(manifest) as unknown as Item;
  validateGeometry({ meta: { schema_version: "0.3.0" }, blocks: [block] });
  const pairs = siblings(manifest);
  const rows = block.rows as { min: number; max: number };
  const items = block.primitives as Item[];
  const placed = items.filter((item) => BANDS[item.kind as string] !== undefined);
  for (const item of items) {
    if (typeof item.row === "number") {
      expect(item.row >= rows.min && item.row <= rows.max).toBe(true);
    }
  }
  placed.forEach((left, index) => {
    for (const right of placed.slice(index + 1)) {
      if (BANDS[left.kind as string] !== BANDS[right.kind as string] || left.row !== right.row) {
        continue;
      }
      expect(conflicts(extent(left), extent(right)), `${left.id} and ${right.id}`).toBe(false);
    }
  });
  const lines = new Map(
    items.filter((item) => item.kind === "child").map((item) => [item.id as string, item]),
  );
  const order = items.filter((item) => item.kind === "child");
  for (const [first, second] of pairs) {
    const a = lines.get(first);
    const b = lines.get(second);
    if (a === undefined || b === undefined) continue;
    if (Math.sign(a.row as number) !== Math.sign(b.row as number)) continue;
    if (exact(b.start).compare(exact(a.end)) !== 0 || a.row === b.row) continue;
    // First fit: b takes a nearer row than its contiguous predecessor's, or
    // something placed before it blocks that row.
    if (Math.abs(b.row as number) < Math.abs(a.row as number)) continue;
    const blockers = order
      .slice(0, order.indexOf(b))
      .filter((item) => item.row === a.row && conflicts(extent(item), extent(b)));
    expect(blockers.length > 0, `${second} could share the row of ${first}`).toBe(true);
  }
}

describe("layout over edited manifests", () => {
  it.each(manifestNames())("holds its properties from %s", (name) => {
    const start = load(name);
    fc.assert(
      fc.property(sequenceArbitrary, graphicalArbitrary, (seeds, graphical) => {
        let manifest: Manifest = start;
        for (const seed of seeds) {
          const result = applyToManifest(manifest, {
            block: BLOCK,
            ...commandFor(manifest, seed),
          } as ManifestCommand);
          if (!isCommandError(result)) manifest = result;
        }
        check({ ...manifest, graphical });
      }),
      { numRuns: 12 },
    );
  });
});
