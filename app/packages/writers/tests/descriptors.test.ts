import { describe, expect, it } from "vitest";
import {
  descriptorSvg,
  formatNumber,
  type PathCommand,
  type Point,
  toDescriptors,
  writeSvg,
  writeTikz,
} from "../src/index.ts";
import { reviewCases, style, synthetic } from "./support.ts";

const svgBody = (drawing: ReturnType<typeof synthetic>) =>
  writeSvg([{ drawing, x: 0, y: 0, scale: 1 }])
    .split("\n")
    .slice(3, -3);
const tikzBody = (drawing: ReturnType<typeof synthetic>) => {
  const lines = writeTikz([{ drawing, x: 0, y: 0, scale: 1 }], { standalone: false }).split("\n");
  return lines.slice(lines.findIndex((line) => line.startsWith("\\begin{scope}")) + 2, -3);
};
const BLACK = style({ stroke: "#000000" });

describe("descriptors", () => {
  it("draws a brace and converts its quadratics for TikZ", () => {
    const drawing = synthetic({
      type: "region",
      address: "region_1",
      style: BLACK,
      x1: 0,
      x2: 20,
      xm: 10,
      yb: 10,
      ya: 16,
    });
    expect(svgBody(drawing)).toEqual([
      '<path data-address="region_1" d="M0 10Q0 13 3 13L7 13Q10 13 10 16Q10 13 13 13L17 13Q20 13 20 10" fill="none" stroke="#000000" stroke-width="1"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[draw=ts000000,line width=1pt] (0,20) .. controls (0,18) and (1,17) .. (3,17) -- (7,17) .. controls (9,17) and (10,16) .. (10,14) .. controls (10,16) and (11,17) .. (13,17) -- (17,17) .. controls (19,17) and (20,18) .. (20,20);",
    ]);
  });

  it("ends a jump's shaft at its filled arrowhead's base", () => {
    const drawing = synthetic({
      type: "jump",
      address: "j",
      style: style({ stroke: "#000000", fill: "#000000", "stroke-width": 1.5 }),
      start: [10, 20],
      c1: [20, 40],
      c2: [40, 40],
      tip: [50, 20],
      base: [48, 24],
      corners: [
        [46, 23],
        [50, 25],
      ],
    });
    expect(svgBody(drawing)).toEqual([
      '<path data-address="j" d="M10 20C20 40 40 40 48 24" fill="none" stroke="#000000" stroke-width="1.5"/>',
      '<polygon data-address="j" points="50,20 46,23 50,25" fill="#000000"/>',
    ]);
    expect(tikzBody(drawing)[0]).toBe(
      "\\path[draw=ts000000,line width=1.5pt] (10,10) .. controls (20,-10) and (40,-10) .. (48,6);",
    );
  });

  for (const [name, count] of [
    ["flow_control", 1],
    ["corpus_score_ms3", 4],
  ] as const) {
    it(`continues each shaft of ${name} along its head's axis`, () => {
      const item = reviewCases().find((each) => each.name === name);
      const descriptors = toDescriptors(item?.drawing as ReturnType<typeof synthetic>);
      const jumps = new Set(
        item?.drawing.elements.filter((each) => each.type === "jump").map((each) => each.address),
      );
      const paths = descriptors.filter(
        (each) => each.tag === "path" && jumps.has(String(each.attrs[0]?.[1])),
      );
      expect(paths.length).toBe(count);
      for (const path of paths) {
        const index = descriptors.indexOf(path);
        const head = descriptors[index + 1];
        const d = path.attrs.find(([key]) => key === "d")?.[1] as readonly PathCommand[];
        const [, c2, base] = (d[1] as PathCommand).points as readonly [Point, Point, Point];
        const points = head?.attrs.find(([key]) => key === "points")?.[1];
        const [tip, left, right] = points as readonly [Point, Point, Point];
        const unit = (from: Point, to: Point) => {
          const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
          return [(to[0] - from[0]) / length, (to[1] - from[1]) / length].map(formatNumber);
        };
        expect(unit(c2, base)).toEqual(unit(base, tip));
        expect([(left[0] + right[0]) / 2, (left[1] + right[1]) / 2].map(formatNumber)).toEqual(
          base.map(formatNumber),
        );
        const dot =
          (right[0] - left[0]) * (tip[0] - base[0]) + (right[1] - left[1]) * (tip[1] - base[1]);
        expect(formatNumber(dot)).toBe("0");
      }
    });
  }

  const line = (type: "timeline" | "child", locked: boolean) =>
    synthetic({
      type,
      address: "c",
      style: style({
        stroke: "#00CC00",
        fill: "#00CC00",
        "stroke-width": 2,
        "stroke-dasharray": "3 3",
      }),
      xs: 10,
      xe: 50,
      y: 20,
      locked,
    });
  const diamond = [
    '<line data-address="c" x1="10" y1="20" x2="47" y2="20" stroke="#00CC00" stroke-width="2" stroke-dasharray="3 3"/>',
    '<circle data-address="c" cx="10" cy="20" r="2" fill="#00CC00"/>',
    '<polygon data-address="c" points="47,20 50,17.6 53,20 50,22.4" fill="none" stroke="#00CC00" stroke-width="1"/>',
  ];

  it("ends a locked child or root with an open diamond stroked at half width and no dash", () => {
    expect(svgBody(line("child", true))).toEqual(diamond);
    expect(svgBody(line("timeline", true))).toEqual(diamond);
  });

  it("ends an unlocked child or root with a filled arrowhead beyond its end", () => {
    const arrow = [
      '<line data-address="c" x1="10" y1="20" x2="50" y2="20" stroke="#00CC00" stroke-width="2" stroke-dasharray="3 3"/>',
      '<circle data-address="c" cx="10" cy="20" r="2" fill="#00CC00"/>',
      '<polygon data-address="c" points="56,20 50,17 50,23" fill="#00CC00"/>',
    ];
    expect(svgBody(line("child", false))).toEqual(arrow);
    expect(svgBody(line("timeline", false))).toEqual(arrow);
  });

  it("draws a map as one closed, stroked outline whose dash starts at its first corner", () => {
    const drawing = synthetic({
      type: "map",
      address: "m",
      style: style({ stroke: "#00CC00", "stroke-dasharray": "1 1" }),
      xs: 10,
      xe: 50,
      yc: 20,
    });
    expect(svgBody(drawing)).toEqual([
      '<polygon data-address="m" points="10,19 50,19 50,21 10,21" fill="none" stroke="#00CC00" stroke-width="1" stroke-dasharray="1 1"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[draw=ts00CC00,line width=1pt,dash pattern=on 1pt off 1pt] (10,11) -- (50,11) -- (50,9) -- (10,9) -- cycle;",
    ]);
  });

  it("writes opacity last and maps dash patterns", () => {
    const line = (dash: string) =>
      synthetic({
        type: "break",
        address: "break_1",
        style: style({ stroke: "#FF0000", "stroke-dasharray": dash, opacity: 0.5 }),
        x: 10,
        y1: 5,
        y2: 25,
      });
    expect(svgBody(line("2"))).toEqual([
      '<line data-address="break_1" x1="10" y1="5" x2="10" y2="25" stroke="#FF0000" stroke-width="1" stroke-dasharray="2" opacity="0.5"/>',
    ]);
    expect(tikzBody(line("2"))).toEqual([
      "\\path[draw=tsFF0000,line width=1pt,dash pattern=on 2pt off 2pt,opacity=0.5] (10,25) -- (10,5);",
    ]);
    expect(tikzBody(line("1 2 3"))[0]).toContain(
      "dash pattern=on 1pt off 2pt on 3pt off 1pt on 2pt off 3pt,",
    );
  });

  it("formats each dash number by the number rule", () => {
    const drawing = synthetic({
      type: "break",
      address: "break_1",
      style: style({ stroke: "#FF0000", "stroke-dasharray": "1.50 0.00001" }),
      x: 10,
      y1: 5,
      y2: 25,
    });
    expect(svgBody(drawing)).toEqual([
      '<line data-address="break_1" x1="10" y1="5" x2="10" y2="25" stroke="#FF0000" stroke-width="1" stroke-dasharray="1.5 0"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[draw=tsFF0000,line width=1pt,dash pattern=on 1.5pt off 0pt] (10,25) -- (10,5);",
    ]);
  });

  it("writes no paint option for stroke none", () => {
    const drawing = synthetic({
      type: "break",
      address: "break_1",
      style: style({ stroke: "none" }),
      x: 10,
      y1: 5,
      y2: 25,
    });
    expect(svgBody(drawing)).toEqual([
      '<line data-address="break_1" x1="10" y1="5" x2="10" y2="25" stroke="none" stroke-width="1"/>',
    ]);
    expect(tikzBody(drawing)).toEqual(["\\path[line width=1pt] (10,25) -- (10,5);"]);
  });

  it("escapes text", () => {
    const text = (value: string) =>
      synthetic({
        type: "label",
        address: "region_1/label",
        style: style({ fill: "#000000" }),
        x: 10,
        baseline: 20,
        anchor: "middle",
        text: value,
      });
    expect(svgBody(text("a&b<c>"))[0]).toBe(
      '<text data-address="region_1/label" x="10" y="20" text-anchor="middle" font-size="9" fill="#000000">a&amp;b&lt;c&gt;</text>',
    );
    expect(tikzBody(text("\\~^#$%&_{}"))[0]).toBe(
      "\\node[anchor=base,inner sep=0,font=\\sffamily\\fontsize{9}{10.4766}\\selectfont,text=ts000000] at (10,10) {\\textbackslash{}\\textasciitilde{}\\textasciicircum{}\\#\\$\\%\\&\\_\\{\\}};",
    );
    expect(tikzBody(text(" a  b "))[0]).toContain("{\\ a \\ b\\ }");
  });

  it("escapes attribute values and self-closes elements without text", () => {
    const drawing = synthetic({
      type: "break",
      address: 'r/&<>",',
      style: BLACK,
      x: 10,
      y1: 5,
      y2: 25,
    });
    expect(svgBody(drawing)).toEqual([
      '<line data-address="r/&amp;&lt;&gt;&quot;," x1="10" y1="5" x2="10" y2="25" stroke="#000000" stroke-width="1"/>',
    ]);
  });
});

const KIND: Readonly<Record<string, RegExp>> = {
  rect: /^\\path\[[^\]]*\] \(0,0\) rectangle \([^)]*\);$/,
  line: /^\\path\[[^\]]*\] \([^)]*\) -- \([^)]*\);$/,
  circle: /^\\path\[[^\]]*\] \([^)]*\) circle\[radius=[^\]]*\];$/,
  polygon: /^\\path\[[^\]]*\] (\([^)]*\) -- )+cycle;$/,
  path: /^\\path\[[^\]]*\] \([^)]*\) \.\. controls /,
  text: /^\\node\[anchor=base( west)?,inner sep=0,/,
};

describe("one command per descriptor", () => {
  for (const item of reviewCases()) {
    it(item.name, () => {
      const descriptors = toDescriptors(item.drawing);
      const placed = [{ drawing: item.drawing, x: 0, y: 0, scale: item.scale }];
      const svg = writeSvg(placed).split("\n");
      expect(svg.slice(2, -3)).toEqual(descriptors.map(descriptorSvg));
      descriptors.forEach((descriptor, index) => {
        const line = svg[index + 2] as string;
        expect(line.startsWith(`<${descriptor.tag} `)).toBe(true);
        if (descriptor.tag !== "rect") {
          const address = descriptor.attrs.find(([name]) => name === "data-address")?.[1];
          expect(line.startsWith(`<${descriptor.tag} data-address="${address}" `)).toBe(true);
        }
      });
      const tikz = writeTikz(placed).split("\n");
      const begin = tikz.findIndex((line) => line.startsWith("\\begin{scope}"));
      const end = tikz.indexOf("\\end{scope}");
      const commands = tikz.slice(begin + 1, end);
      expect(commands.length).toBe(descriptors.length);
      commands.forEach((command, index) => {
        expect(command).toMatch(KIND[(descriptors[index] as { tag: string }).tag] as RegExp);
      });
    });
  }
});
