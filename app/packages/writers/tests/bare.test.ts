/** `bare` as SVG and TikZ, byte for byte; the texts are derived in tests/README.md. */

import { DEFAULT_LAYER, DEFAULT_PLACEMENT, draw } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { writeSvg, writeTikz } from "../src/index.ts";
import { loadFixture } from "./support.ts";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="490.5771" height="81.3789" viewBox="0 0 490.5771 81.3789" font-family="DejaVu Sans" style="font-kerning:none;font-variant-ligatures:none">
<g transform="translate(16 16)">
<rect x="0" y="0" width="458.5771" height="49.3789" rx="10" fill="#F3F4F6"/>
<line data-address="bare" x1="41.5771" y1="14.4023" x2="441.5771" y2="14.4023" stroke="#00CC00" stroke-width="3"/>
<circle data-address="bare" cx="41.5771" cy="14.4023" r="3" fill="#00CC00"/>
<polygon data-address="bare" points="450.5771,14.4023 441.5771,9.9023 441.5771,18.9023" fill="#00CC00"/>
<polygon data-address="bare/start" points="41.5771,15.9023 38.5771,28.9023 44.5771,28.9023" fill="#000000"/>
<polygon data-address="bare/end" points="441.5771,15.9023 438.5771,28.9023 444.5771,28.9023" fill="#000000"/>
<text data-address="bare/name" x="8" y="18.2104" text-anchor="start" font-size="11" fill="#000000">Bare</text>
<text data-address="bare/start/label" x="41.5771" y="39.2563" text-anchor="middle" font-size="9" fill="#000000">0 ♩</text>
<text data-address="bare/end/label" x="441.5771" y="39.2563" text-anchor="middle" font-size="9" fill="#000000">8 ♩</text>
</g>
</svg>
`;

const TIKZ = `\\documentclass{standalone}
\\usepackage{fontspec}
\\setsansfont{DejaVuSans.ttf}[Path=/fonts/,Kerning=Off,Ligatures={TeXOff,NoCommon}]
\\usepackage{tikz}
\\begin{document}
\\begin{tikzpicture}[x=1pt,y=1pt,miter limit=4,font=\\sffamily]
\\definecolor{ts000000}{HTML}{000000}
\\definecolor{ts00CC00}{HTML}{00CC00}
\\definecolor{tsF3F4F6}{HTML}{F3F4F6}
\\begin{scope}[shift={(16,16)}]
\\path[rounded corners=10pt,fill=tsF3F4F6] (0,0) rectangle (458.5771,49.3789);
\\path[draw=ts00CC00,line width=3pt] (41.5771,34.9766) -- (441.5771,34.9766);
\\path[fill=ts00CC00] (41.5771,34.9766) circle[radius=3];
\\path[fill=ts00CC00] (450.5771,34.9766) -- (441.5771,39.4766) -- (441.5771,30.4766) -- cycle;
\\path[fill=ts000000] (41.5771,33.4766) -- (38.5771,20.4766) -- (44.5771,20.4766) -- cycle;
\\path[fill=ts000000] (441.5771,33.4766) -- (438.5771,20.4766) -- (444.5771,20.4766) -- cycle;
\\node[anchor=base west,inner sep=0,font=\\sffamily\\fontsize{11}{12.8047}\\selectfont,text=ts000000] at (8,31.1685) {Bare};
\\node[anchor=base,inner sep=0,font=\\sffamily\\fontsize{9}{10.4766}\\selectfont,text=ts000000] at (41.5771,10.1226) {0 ♩};
\\node[anchor=base,inner sep=0,font=\\sffamily\\fontsize{9}{10.4766}\\selectfont,text=ts000000] at (441.5771,10.1226) {8 ♩};
\\end{scope}
\\end{tikzpicture}
\\end{document}
`;

const placed = [
  {
    drawing: draw(loadFixture("bare"), DEFAULT_PLACEMENT, [DEFAULT_LAYER], fontMetrics),
    x: 0,
    y: 0,
    scale: 1,
  },
];

describe("bare", () => {
  it("writes the derived SVG", () => {
    expect(writeSvg(placed)).toBe(SVG);
  });

  it("writes the derived TikZ", () => {
    expect(writeTikz(placed, { fontDirectory: "/fonts" })).toBe(TIKZ);
  });

  it("writes the tikzpicture alone without standalone, and . as the default font directory", () => {
    const lines = TIKZ.split("\n");
    const picture = lines.slice(
      lines.indexOf("\\begin{tikzpicture}[x=1pt,y=1pt,miter limit=4,font=\\sffamily]"),
      lines.indexOf("\\end{tikzpicture}") + 1,
    );
    expect(writeTikz(placed, { standalone: false, fontDirectory: "/fonts" })).toBe(
      `${picture.join("\n")}\n`,
    );
    expect(writeTikz(placed).split("\n")[2]).toBe(
      "\\setsansfont{DejaVuSans.ttf}[Path=./,Kerning=Off,Ligatures={TeXOff,NoCommon}]",
    );
  });
});
