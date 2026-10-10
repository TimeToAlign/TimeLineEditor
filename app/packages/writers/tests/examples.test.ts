/** Values derived by hand from the page, formatting and profile rules. */

import { Rational } from "@timetoalign/tilie-core";
import type { LosslessGeometry } from "@timetoalign/tilie-layout";
import { JsonFloat } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { formatNumber, writeSvg, writeTikz } from "../src/index.ts";
import { geometry } from "./support.ts";

type Item = Record<string, unknown>;

const lines = (text: string): string[] => text.split("\n");

/** The bare golden with its blocks changed by `edit`. */
function edited(name: string, edit: (blocks: Item[]) => void): LosslessGeometry {
  const value = geometry(name) as unknown as { blocks: Item[] };
  edit(value.blocks);
  return value as unknown as LosslessGeometry;
}

describe("number formatting", () => {
  const cases: [Rational, string][] = [
    [Rational.of(80n), "80"],
    [Rational.of([25n, 2n]), "12.5"],
    [Rational.of([1n, 3n]), "0.3333"],
    [Rational.of([2n, 3n]), "0.6667"],
    [Rational.of(-6n), "-6"],
    [Rational.of([-1n, 3n]), "-0.3333"],
    [Rational.of([1n, 40000n]), "0"],
    [Rational.of([-1n, 40000n]), "0"],
    [Rational.of([25n, 100000n]), "0.0002"],
    [Rational.of([35n, 100000n]), "0.0004"],
    [Rational.of([99995n, 100000n]), "1"],
    [Rational.of([100005n, 100000n]), "1"],
    [Rational.of([3602879701896397n, 2n ** 55n]), "0.1"],
    [Rational.of(123456789012345678n), "123456789012345678"],
  ];
  it.each(cases)("writes %s as %s", (value, text) => {
    expect(formatNumber(value)).toBe(text);
  });
});

describe("the page of bare", () => {
  const svg = lines(writeSvg(geometry("bare")));
  const tikz = lines(writeTikz(geometry("bare")));

  it("is 432 by 64 with a margin of 16", () => {
    expect(svg[0]).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="432" height="64" viewBox="-16 -16 432 64" font-family="DejaVu Sans, sans-serif" font-size="7">',
    );
    expect(svg[1]).toBe('<rect x="0" y="0" width="400" height="32" fill="#BAC8D3"/>');
  });

  it("draws the root from 80 to 400 at ordinate 16 in both profiles", () => {
    expect(svg[2]).toBe(
      '<line x1="80" y1="16" x2="396" y2="16" stroke="#00CC00" stroke-width="0.8"/>',
    );
    expect(tikz).toContain(
      "\\draw[ts00CC00,{Circle[length=4pt]}-{Stealth[length=6pt,width=4pt,inset=2pt]},shorten <=-2pt] (80,16) -- (400,16);",
    );
  });

  it("puts the end wedge's base at 20 and its label's baseline at 27.25", () => {
    expect(svg).toContain('<path d="M400 16L397 20L403 20Z" fill="#00CC00"/>');
    expect(svg).toContain('<text x="400" y="27.25" text-anchor="middle" fill="#000000">8 ♩</text>');
    expect(svg).toContain('<text x="2" y="17.75" text-anchor="start" fill="#000000">Bare</text>');
    expect(tikz).toContain("\\node[anchor=north,text=ts000000] at (400,12) {8 ♩};");
  });
});

describe("the page of flow_control", () => {
  const svg = lines(writeSvg(geometry("flow_control")));

  it("draws the break at 320 from 0 to 64", () => {
    expect(svg[2]).toBe(
      '<line x1="320" y1="0" x2="320" y2="64" stroke="#00CC00" stroke-width="0.8"/>',
    );
  });

  it("draws the jump from 240 to 120 with controls at 48 and the stealth up at (120, 32)", () => {
    expect(svg[3]).toBe(
      '<path d="M240 32C240 48 120 48 120 32" fill="none" stroke="#00CC00" stroke-width="0.8" stroke-dasharray="0.8 1"/>',
    );
    expect(svg[4]).toBe('<path d="M120 32L118 38L120 36L122 38Z" fill="#00CC00"/>');
  });
});

describe("blocks", () => {
  it("are stacked with a gap of 16", () => {
    const value = edited("bare", (blocks) => {
      const second = structuredClone(blocks[0] as Item);
      second.rows = { min: -1, max: 0 };
      second.primitives = [];
      blocks.push(second);
    });
    const svg = lines(writeSvg(value));
    expect(svg[0]).toContain('height="144" viewBox="-16 -16 432 144"');
    expect(svg).toContain('<rect x="0" y="48" width="400" height="64" fill="#BAC8D3"/>');
  });
});

describe("the name column", () => {
  const named = (width: number) =>
    lines(writeSvg(geometry("bare"), { width })).filter((line) => line.includes("start"));

  it("cuts a name to the code points that fit, with an ellipsis", () => {
    expect(named(100)).toEqual([
      '<text x="2" y="17.75" text-anchor="start" fill="#000000">Ba…</text>',
    ]);
  });

  it("omits a name when no code point fits", () => {
    expect(named(40)).toEqual([]);
  });
});

describe("text", () => {
  const withText = (text: string) =>
    edited("bare", (blocks) => {
      const label = ((blocks[0] as Item).primitives as Item[]).find(
        (item) => item.id === "bare/end/label",
      ) as Item;
      label.text = text;
    });

  it("escapes markup in SVG and turns a tab into a space", () => {
    expect(writeSvg(withText("a<b&c\td"))).toContain(">a&lt;b&amp;c d</text>");
  });

  it("escapes TeX specials in TikZ", () => {
    expect(writeTikz(withText("50% #1 {x}_y \\ ~ ^ $ &"))).toContain(
      "{50\\% \\#1 \\{x\\}\\_y \\textbackslash{} \\textasciitilde{} \\textasciicircum{} \\$ \\&};",
    );
  });

  it("rotates a label about its point", () => {
    const value = edited("bare", (blocks) => {
      const label = ((blocks[0] as Item).primitives as Item[]).find(
        (item) => item.id === "bare/end/label",
      ) as Item;
      label.rotate = 90;
    });
    expect(writeSvg(value)).toContain(
      '<text x="400" y="27.25" text-anchor="middle" transform="rotate(-90 400 20)" fill="#000000">',
    );
    expect(writeTikz(value)).toContain("\\node[anchor=north,rotate=90,text=ts000000] at (400,12)");
    const float = edited("bare", (blocks) => {
      const label = ((blocks[0] as Item).primitives as Item[]).find(
        (item) => item.id === "bare/end/label",
      ) as Item;
      label.rotate = new JsonFloat(45);
    });
    expect(writeTikz(float)).toContain("rotate=45,");
  });
});

describe("unknown kinds and options", () => {
  it("skips a primitive of a kind this version does not know", () => {
    const value = edited("bare", (blocks) => {
      ((blocks[0] as Item).primitives as Item[]).push({ kind: "strip", colour: "#123456" });
    });
    expect(writeSvg(value)).toBe(writeSvg(geometry("bare")));
    expect(writeTikz(value)).toBe(writeTikz(geometry("bare")));
  });

  it("writes the picture alone without the preamble", () => {
    const full = lines(writeTikz(geometry("bare")));
    const picture = lines(writeTikz(geometry("bare"), { standalone: false }));
    expect(picture).toEqual([...full.slice(6, -2), ""]);
    expect(picture[0]?.startsWith("\\begin{tikzpicture}")).toBe(true);
  });
});
