/** `bare` as SVG and TikZ, byte for byte; the texts are derived in tests/README.md. */

import { describe, expect, it } from "vitest";
import { writeSvg, writeTikz } from "../src/index.ts";
import { bare } from "./support.ts";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="508.5771" height="99.3789" viewBox="0 0 508.5771 99.3789" font-family="DejaVu Sans" text-rendering="geometricPrecision" style="font-kerning:none;font-variant-ligatures:none">
<g transform="translate(16 16)">
<rect x="0" y="0" width="476.5771" height="67.3789" rx="10" fill="#F3F4F6"/>
<rect data-address="bare/card" x="10" y="10" width="458.5771" height="49.3789" rx="5" fill="#B8BEC8"/>
<rect data-address="bare/card" x="8" y="8" width="458.5771" height="49.3789" rx="5" fill="#FFFFFF" stroke="#C4C9D1" stroke-width="0.75"/>
<line data-address="bare" x1="49.5771" y1="22.4023" x2="449.5771" y2="22.4023" stroke="#00CC00" stroke-width="3"/>
<circle data-address="bare" cx="49.5771" cy="22.4023" r="3" fill="#00CC00"/>
<polygon data-address="bare" points="458.5771,22.4023 449.5771,17.9023 449.5771,26.9023" fill="#00CC00"/>
<polygon data-address="bare/start" points="49.5771,23.9023 46.5771,36.9023 52.5771,36.9023" fill="#000000"/>
<polygon data-address="bare/end" points="449.5771,23.9023 446.5771,36.9023 452.5771,36.9023" fill="#000000"/>
<text data-address="bare/name" x="16" y="26.2104" text-anchor="start" font-size="11" fill="#000000">Bare</text>
<text data-address="bare/start/label" x="49.5771" y="47.2563" text-anchor="middle" font-size="9" fill="#000000">0 ♩</text>
<text data-address="bare/end/label" x="449.5771" y="47.2563" text-anchor="middle" font-size="9" fill="#000000">8 ♩</text>
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
\\definecolor{tsB8BEC8}{HTML}{B8BEC8}
\\definecolor{tsC4C9D1}{HTML}{C4C9D1}
\\definecolor{tsF3F4F6}{HTML}{F3F4F6}
\\definecolor{tsFFFFFF}{HTML}{FFFFFF}
\\begin{scope}[shift={(16,16)}]
\\path[rounded corners=10pt,fill=tsF3F4F6] (0,0) rectangle (476.5771,67.3789);
\\path[rounded corners=5pt,fill=tsB8BEC8] (10,8) rectangle (468.5771,57.3789);
\\path[rounded corners=5pt,fill=tsFFFFFF,draw=tsC4C9D1,line width=0.75pt] (8,10) rectangle (466.5771,59.3789);
\\path[draw=ts00CC00,line width=3pt] (49.5771,44.9766) -- (449.5771,44.9766);
\\path[fill=ts00CC00] (49.5771,44.9766) circle[radius=3];
\\path[fill=ts00CC00] (458.5771,44.9766) -- (449.5771,49.4766) -- (449.5771,40.4766) -- cycle;
\\path[fill=ts000000] (49.5771,43.4766) -- (46.5771,30.4766) -- (52.5771,30.4766) -- cycle;
\\path[fill=ts000000] (449.5771,43.4766) -- (446.5771,30.4766) -- (452.5771,30.4766) -- cycle;
\\node[anchor=base west,inner sep=0,font=\\sffamily\\fontsize{11}{12.8047}\\selectfont,text=ts000000] at (16,41.1685) {Bare};
\\node[anchor=base,inner sep=0,font=\\sffamily\\fontsize{9}{10.4766}\\selectfont,text=ts000000] at (49.5771,20.1226) {0 ♩};
\\node[anchor=base,inner sep=0,font=\\sffamily\\fontsize{9}{10.4766}\\selectfont,text=ts000000] at (449.5771,20.1226) {8 ♩};
\\end{scope}
\\end{tikzpicture}
\\end{document}
`;

const placed = [{ drawing: bare(), x: 0, y: 0, scale: 1 }];

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
