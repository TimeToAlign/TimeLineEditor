import { DEFAULT_LAYER, DEFAULT_PLACEMENT, draw } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { page, writeSvg, writeTikz } from "../src/index.ts";
import { loadFixture } from "./support.ts";

const bare = draw(loadFixture("bare"), DEFAULT_PLACEMENT, [DEFAULT_LAYER], fontMetrics);
const nested = draw(loadFixture("nested"), DEFAULT_PLACEMENT, [DEFAULT_LAYER], fontMetrics);
const placed = [
  { drawing: bare, x: 10, y: 20, scale: 1 },
  { drawing: nested, x: -30, y: 5, scale: 2 },
];

describe("the page", () => {
  it("adds a margin of 16 around one drawing", () => {
    const sheet = page([{ drawing: bare, x: 0, y: 0, scale: 1 }]);
    expect([sheet.width, sheet.height]).toEqual([458.5771484375 + 32, 49.37890625 + 32]);
    expect(sheet.drawings[0]).toMatchObject({ pageX: 16, pageY: 16 });
  });

  it("bounds several placed boxes", () => {
    const sheet = page(placed);
    expect([sheet.width, sheet.height]).toEqual([950.38916015625, 187.953125]);
    expect(sheet.drawings.map((item) => [item.pageX, item.pageY])).toEqual([
      [56, 31],
      [16, 16],
    ]);
  });

  it("places each drawing in SVG and TikZ", () => {
    const svg = writeSvg(placed).split("\n");
    expect(svg[0]).toContain('width="950.3892" height="187.9531" viewBox="0 0 950.3892 187.9531"');
    expect(svg.filter((line) => line.startsWith("<g "))).toEqual([
      '<g transform="translate(56 31)">',
      '<g transform="translate(16 16) scale(2)">',
    ]);
    expect(
      writeTikz(placed)
        .split("\n")
        .filter((line) => line.startsWith("\\begin{scope}")),
    ).toEqual([
      "\\begin{scope}[shift={(56,107.5742)}]",
      "\\begin{scope}[shift={(16,16)},scale=2,transform shape]",
    ]);
  });
});
