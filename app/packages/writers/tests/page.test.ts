import { describe, expect, it } from "vitest";
import { page, writeSvg, writeTikz } from "../src/index.ts";
import { bare, boxed, style } from "./support.ts";

const box = boxed(100.25, 50, style());
const placed = [
  { drawing: bare(), x: 10, y: 20, scale: 1 },
  { drawing: box, x: -30, y: 5, scale: 2 },
];
const scopes = (text: string) =>
  text.split("\n").filter((line) => line.startsWith("\\begin{scope}"));

describe("the page", () => {
  it("adds a margin of 16 around one drawing", () => {
    const sheet = page([{ drawing: bare(), x: 0, y: 0, scale: 1 }]);
    expect([sheet.width, sheet.height]).toEqual([508.5771484375, 99.37890625]);
    expect(sheet.drawings.map((item) => [item.pageX, item.pageY])).toEqual([[16, 16]]);
  });

  it("bounds several placed boxes", () => {
    const sheet = page(placed);
    expect([sheet.width, sheet.height]).toEqual([548.5771484375, 132]);
    expect(sheet.drawings.map((item) => [item.pageX, item.pageY])).toEqual([
      [56, 31],
      [16, 16],
    ]);
  });

  it("places each drawing in SVG and TikZ", () => {
    const svg = writeSvg(placed).split("\n");
    expect(svg[0]).toContain('width="548.5771" height="132" viewBox="0 0 548.5771 132"');
    expect(svg.filter((line) => line.startsWith("<g "))).toEqual([
      '<g transform="translate(56 31)">',
      '<g transform="translate(16 16) scale(2)">',
    ]);
    expect(scopes(writeTikz(placed))).toEqual([
      "\\begin{scope}[shift={(56,33.6211)}]",
      "\\begin{scope}[shift={(16,16)},scale=2,transform shape]",
    ]);
  });

  it("scales a box by a fractional factor", () => {
    const alone = [{ drawing: box, x: 0, y: 0, scale: 1.5 }];
    const sheet = page(alone);
    expect([sheet.width, sheet.height]).toEqual([182.375, 107]);
    expect(writeSvg(alone).split("\n")[1]).toBe('<g transform="translate(16 16) scale(1.5)">');
    expect(scopes(writeTikz(alone))).toEqual([
      "\\begin{scope}[shift={(16,16)},scale=1.5,transform shape]",
    ]);
  });

  it("refuses an empty page", () => {
    expect(() => page([])).toThrow(RangeError);
  });
});
