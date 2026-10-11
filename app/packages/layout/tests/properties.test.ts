import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  draw,
  type LineElement,
  type TextElement,
  TextMeasure,
} from "../src/index.ts";
import { build, child, metrics } from "./support.ts";

const conflicts = ([a1, b1]: readonly number[], [a2, b2]: readonly number[]) =>
  ((a1 as number) < (b2 as number) && (a2 as number) < (b1 as number)) || a1 === a2;

const manifest = fc.integer({ min: 1, max: 64 }).chain((length) =>
  fc.tuple(
    fc.constant(length),
    fc.array(
      fc
        .tuple(fc.integer({ min: 0, max: length - 1 }), fc.integer({ min: 1, max: length }))
        .map(([offset, span]) => [offset, Math.min(span, length - offset)] as const),
      { minLength: 1, maxLength: 8 },
    ),
  ),
);

describe("first fit", () => {
  it("never puts conflicting labels in one tier or children in one row", () => {
    fc.assert(
      fc.property(manifest, ([length, children]) => {
        const built = build(
          "r",
          length,
          ...children.map(([offset, span], index) => child("r", `c${index}`, offset, span)),
        );
        const drawing = draw(built, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
        const measure = new TextMeasure(metrics);
        const labels = drawing.elements.filter(
          (item): item is TextElement =>
            item.type === "label" && /\/(start|end)\/label$/.test(item.address),
        );
        for (const [i, a] of labels.entries()) {
          for (const b of labels.slice(i + 1)) {
            if (a.baseline !== b.baseline) continue;
            const extent = (item: TextElement) => {
              const half = measure.width(item.text, item.style["font-size"]) / 2;
              return [item.x - half - 1, item.x + half + 1];
            };
            expect(conflicts(extent(a), extent(b))).toBe(false);
          }
        }
        const lines = drawing.elements.filter((item): item is LineElement => item.type === "child");
        for (const [i, a] of lines.entries()) {
          for (const b of lines.slice(i + 1)) {
            if (a.y === b.y) expect(conflicts([a.xs, a.xe], [b.xs, b.xe])).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
