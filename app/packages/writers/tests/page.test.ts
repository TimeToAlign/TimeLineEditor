import { DEFAULT_LAYER, DEFAULT_PLACEMENT, draw } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { page, writeSvg, writeTikz } from "../src/index.ts";
import { loadFixture } from "./support.ts";

const bare = draw(loadFixture("bare"), DEFAULT_PLACEMENT, [DEFAULT_LAYER], fontMetrics);
const nested = draw(loadFixture("nested"), DEFAULT_PLACEMENT, [DEFAULT_LAYER], fontMetrics);
const placed = [
  { drawing: bare, x: 10, y: 20, zoom: 1 },
  { drawing: nested, x: -30, y: 5, zoom: 2 },
];

describe("the page", () => {
  it("adds a margin of 16 around one drawing", () => {
    const sheet = page([{ drawing: bare, x: 0, y: 0, zoom: 1 }]);
    expect([sheet.width, sheet.height]).toEqual([455.9931640625 + 32, 49.37890625 + 32]);
    expect(sheet.drawings[0]).toMatchObject({ pageX: 16, pageY: 16 });
  });

  it("bounds several placed boxes", () => {
    const sheet = page(placed);
    expect([sheet.width, sheet.height]).toEqual([948.70263671875, 186.7578125]);
    expect(sheet.drawings.map((item) => [item.pageX, item.pageY])).toEqual([
      [56, 31],
      [16, 16],
    ]);
  });

  it("places each drawing in SVG and TikZ", () => {
    const svg = writeSvg(placed).split("\n");
    expect(svg[0]).toContain('width="948.7026" height="186.7578" viewBox="0 0 948.7026 186.7578"');
    expect(svg.filter((line) => line.startsWith("<g "))).toEqual([
      '<g transform="translate(56 31)">',
      '<g transform="translate(16 16) scale(2)">',
    ]);
    expect(
      writeTikz(placed)
        .split("\n")
        .filter((line) => line.startsWith("\\begin{scope}")),
    ).toEqual([
      "\\begin{scope}[shift={(56,106.3789)}]",
      "\\begin{scope}[shift={(16,16)},scale=2,transform shape]",
    ]);
  });
});
