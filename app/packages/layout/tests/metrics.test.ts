import { describe, expect, it } from "vitest";
import { cleanText, type TextElement, TextMeasure } from "../src/index.ts";
import { drawFixture, manifestNames, metrics } from "./support.ts";

describe("font measures", () => {
  it("reads the metrics file", () => {
    expect([metrics.units_per_em, metrics.ascender, metrics.descender, metrics.fallback]).toEqual([
      2048, 1901, 483, 1229,
    ]);
    expect(Object.keys(metrics.advances).length).toBe(5918);
    expect([metrics.advances["9833"], metrics.advances["48"], metrics.advances["32"]]).toEqual([
      966, 1303, 651,
    ]);
  });

  it("measures widths, ascent, descent and line height", () => {
    const measure = new TextMeasure(metrics);
    expect(measure.width("0 ♩", 9)).toBe(12.83203125);
    expect(measure.width("16 ♩", 9)).toBe(18.55810546875);
    expect(measure.ascent(9)).toBe(8.35400390625);
    expect(measure.descent(9)).toBe(2.12255859375);
    expect(measure.lineHeight(9)).toBe(10.4765625);
    expect(measure.lineHeight(11)).toBe(12.8046875);
    expect([...measure.unmapped]).toEqual([]);
  });

  it("counts fallback for unmapped code points and lists them", () => {
    const measure = new TextMeasure(metrics);
    expect(measure.width("\u{E000}", 2048)).toBe(1229);
    expect(measure.width("\u{4E00}\u{E000}", 2048)).toBe(2458);
    expect([...measure.unmapped].sort((a, b) => a - b)).toEqual([0x4e00, 0xe000]);
  });

  it("turns control characters into spaces", () => {
    expect(cleanText("a\tb\u0000")).toBe("a b ");
    expect(cleanText("\u001F ")).toBe("  ");
    expect(new TextMeasure(metrics).width(cleanText("\t"), 2048)).toBe(651);
  });

  it("gives every drawn text the width of the formula", () => {
    for (const name of manifestNames()) {
      const drawing = drawFixture(name);
      expect(drawing.unmapped, name).toEqual([]);
      for (const item of drawing.elements) {
        if (item.type !== "name" && item.type !== "label") continue;
        const text = (item as TextElement).text;
        let sum = 0;
        for (const character of text) {
          sum += metrics.advances[String(character.codePointAt(0))] as number;
        }
        const size = item.style["font-size"];
        expect(new TextMeasure(metrics).width(text, size), `${name} ${text}`).toBe(
          (sum * size) / 2048,
        );
      }
    }
  });
});
