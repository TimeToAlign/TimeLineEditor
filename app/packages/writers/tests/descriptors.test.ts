import {
  addressKey,
  type ElementAddress,
  placeKeyText,
  sameAddress,
} from "@timetoalign/tilie-core";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  type LineEnd,
  type LineStart,
  manifestLayer,
  type Style,
  wedgeAt,
} from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  type Descriptor,
  descriptorSvg,
  formatNumber,
  type Point,
  type Tag,
  toDescriptors,
  writeSvg,
  writeTikz,
} from "../src/index.ts";
import {
  at,
  boxed,
  everything,
  HIDDEN_ANCESTOR_CARDS,
  loadFixture,
  reviewCases,
  style,
  synthetic,
} from "./support.ts";

const svgBody = (drawing: Drawing) =>
  writeSvg([{ drawing, x: 0, y: 0, scale: 1 }])
    .split("\n")
    .slice(3, -3);
const tikzBody = (drawing: Drawing) => {
  const lines = writeTikz([{ drawing, x: 0, y: 0, scale: 1 }], { standalone: false }).split("\n");
  return lines.slice(lines.findIndex((line) => line.startsWith("\\begin{scope}")) + 2, -3);
};
const BLACK = style({ stroke: "#000000" });

describe("descriptors", () => {
  it("draws a brace and converts its quadratics for TikZ", () => {
    const drawing = synthetic({
      type: "region",
      address: at("region_1"),
      style: BLACK,
      x1: 0,
      x2: 20,
      xm: 10,
      yb: 10,
      ya: 16,
      cuts: [],
    });
    expect(svgBody(drawing)).toEqual([
      '<path data-id="region_1" d="M0 10Q0 13 3 13L7 13Q10 13 10 16Q10 13 13 13L17 13Q20 13 20 10" fill="none" stroke="#000000" stroke-width="1"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[draw=ts000000,line width=1pt] (0,20) .. controls (0,18) and (1,17) .. (3,17) -- (7,17) .. controls (9,17) and (10,16) .. (10,14) .. controls (10,16) and (11,17) .. (13,17) -- (17,17) .. controls (19,17) and (20,18) .. (20,20);",
    ]);
  });

  it("writes a brace cut at gaps as the pieces of its straight parts, each M a move", () => {
    const drawing = synthetic({
      type: "region",
      address: at("region_1"),
      style: BLACK,
      x1: 0,
      x2: 40,
      xm: 20,
      yb: 10,
      ya: 16,
      cuts: [
        [0, 5],
        [8, 10],
        [10, 12],
        [15, 20],
        [25, 30],
      ],
    });
    expect(svgBody(drawing)).toEqual([
      '<path data-id="region_1" d="M0 10Q0 13 3 13M5 13L8 13M12 13L15 13M17 13Q20 13 20 16Q20 13 23 13L25 13M30 13L37 13Q40 13 40 10" fill="none" stroke="#000000" stroke-width="1"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[draw=ts000000,line width=1pt] (0,20) .. controls (0,18) and (1,17) .. (3,17) (5,17) -- (8,17) (12,17) -- (15,17) (17,17) .. controls (19,17) and (20,16) .. (20,14) .. controls (20,16) and (21,17) .. (23,17) -- (25,17) (30,17) -- (37,17) .. controls (39,17) and (40,18) .. (40,20);",
    ]);
  });

  it("writes the background as its template and then opacity, without an address", () => {
    const drawing = boxed(60, 30, style({ opacity: 0.5 }));
    const svg = writeSvg([{ drawing, x: 0, y: 0, scale: 1 }]).split("\n");
    expect(svg[2]).toBe(
      '<rect x="0" y="0" width="60" height="30" rx="0" fill="none" opacity="0.5"/>',
    );
    const tikz = writeTikz([{ drawing, x: 0, y: 0, scale: 1 }], { standalone: false }).split("\n");
    expect(tikz[2]).toBe("\\path[rounded corners=0pt,opacity=0.5] (0,0) rectangle (60,30);");
  });

  it("writes a group's frame as a rect with rx after its coordinates", () => {
    const drawing = synthetic({
      type: "frame",
      address: at("g"),
      style: style({ fill: "#FFFFFF", stroke: "#D1D5DB", "stroke-width": 1, rx: 6 }),
      x: 8,
      y: 4,
      width: 40,
      height: 20,
      shadowOffset: 0,
    });
    expect(svgBody(drawing)).toEqual([
      '<rect data-id="g" x="8" y="4" width="40" height="20" rx="6" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="1"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[rounded corners=6pt,fill=tsFFFFFF,draw=tsD1D5DB,line width=1pt] (8,6) rectangle (48,26);",
    ]);
  });

  const card = (changes: Partial<Style> = {}) =>
    synthetic({
      type: "card",
      address: at("m", "card"),
      style: style({
        fill: "#FFFFFF",
        stroke: "#C4C9D1",
        "stroke-width": 0.75,
        rx: 5,
        shadow: "#B8BEC8",
        ...changes,
      }),
      x: 8,
      y: 4,
      width: 40,
      height: 20,
      shadowOffset: 2,
    });

  it("writes a card's shadow, fill alone, before the card", () => {
    const own =
      '<rect data-id="m" data-part="card" x="8" y="4" width="40" height="20" rx="5" fill="#FFFFFF" stroke="#C4C9D1" stroke-width="0.75"/>';
    expect(svgBody(card())).toEqual([
      '<rect data-id="m" data-part="card" x="10" y="6" width="40" height="20" rx="5" fill="#B8BEC8"/>',
      own,
    ]);
    expect(tikzBody(card())).toEqual([
      "\\path[rounded corners=5pt,fill=tsB8BEC8] (10,4) rectangle (50,24);",
      "\\path[rounded corners=5pt,fill=tsFFFFFF,draw=tsC4C9D1,line width=0.75pt] (8,6) rectangle (48,26);",
    ]);
    expect(svgBody(card({ shadow: "none" }))).toEqual([own]);
  });

  it("writes an ancestor card as a card", () => {
    const drawn = card();
    const ancestor = {
      ...drawn,
      elements: drawn.elements.map((item) =>
        item.type === "card" ? { ...item, type: "ancestor_card" as const } : item,
      ),
    };
    expect(svgBody(ancestor)).toEqual(svgBody(drawn));
    expect(tikzBody(ancestor)).toEqual(tikzBody(drawn));
    expect(
      toDescriptors(ancestor)
        .filter((item) => item.source.type !== "block")
        .map((item) => [item.source.type, item.source.role]),
    ).toEqual([
      ["ancestor_card", "shadow"],
      ["ancestor_card", "primary"],
    ]);
  });

  it("writes a card's dash and opacity, and the opacity on its shadow", () => {
    expect(svgBody(card({ "stroke-dasharray": "2 1", opacity: 0.5 }))).toEqual([
      '<rect data-id="m" data-part="card" x="10" y="6" width="40" height="20" rx="5" fill="#B8BEC8" opacity="0.5"/>',
      '<rect data-id="m" data-part="card" x="8" y="4" width="40" height="20" rx="5" fill="#FFFFFF" stroke="#C4C9D1" stroke-width="0.75" stroke-dasharray="2 1" opacity="0.5"/>',
    ]);
  });

  it("draws no shadow for a group's frame", () => {
    const drawing = synthetic({
      type: "frame",
      address: at("g"),
      style: style({ fill: "#FFFFFF", stroke: "#D1D5DB", rx: 6, shadow: "#B8BEC8" }),
      x: 8,
      y: 4,
      width: 40,
      height: 20,
      shadowOffset: 0,
    });
    expect(svgBody(drawing)).toEqual([
      '<rect data-id="g" x="8" y="4" width="40" height="20" rx="6" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="1"/>',
    ]);
  });

  it("writes a wedge with its fill alone", () => {
    const drawing = synthetic({
      type: "wedge",
      address: at("w"),
      style: style({ fill: "#000000", stroke: "#FF0000" }),
      x: 10,
      yt: 5,
      corners: [
        { dx: -3, y: 18 },
        { dx: 3, y: 18 },
      ],
    });
    expect(svgBody(drawing)).toEqual([
      '<polygon data-id="w" points="10,5 7,18 13,18" fill="#000000"/>',
    ]);
  });

  it("writes a turned wedge's tip, then its corners in their order", () => {
    const drawing = synthetic({
      type: "wedge",
      address: at("w"),
      style: style({ fill: "#000000" }),
      x: 10,
      yt: 5,
      corners: [
        { dx: 13, y: 8 },
        { dx: 13, y: 2 },
      ],
    });
    expect(svgBody(drawing)).toEqual([
      '<polygon data-id="w" points="10,5 23,8 23,2" fill="#000000"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[fill=ts000000] (10,25) -- (23,22) -- (23,28) -- cycle;",
    ]);
  });

  it("takes a wedge's corners, a map's spacing and a card's shadow offset from the element", () => {
    const wedge = synthetic({
      type: "wedge",
      address: at("w"),
      style: style({ fill: "#000000" }),
      x: 10,
      yt: 5,
      corners: [
        { dx: -6, y: 18 },
        { dx: 6, y: 18 },
      ],
    });
    expect(svgBody(wedge)).toEqual([
      '<polygon data-id="w" points="10,5 4,18 16,18" fill="#000000"/>',
    ]);
    const map = synthetic({
      type: "map",
      address: at("m"),
      style: style({ stroke: "#00CC00", "stroke-dasharray": "1 1" }),
      xs: 10,
      xe: 50,
      yc: 20,
      spacing: 4,
      cuts: [],
    });
    expect(svgBody(map)).toEqual([
      '<polygon data-id="m" points="10,18 50,18 50,22 10,22" fill="none" stroke="#00CC00" stroke-width="1" stroke-dasharray="1 1"/>',
    ]);
    const card = synthetic({
      type: "card",
      address: at("m", "card"),
      style: style({
        fill: "#FFFFFF",
        stroke: "#C4C9D1",
        "stroke-width": 0.75,
        rx: 5,
        shadow: "#B8BEC8",
      }),
      x: 8,
      y: 4,
      width: 40,
      height: 20,
      shadowOffset: 4,
    });
    expect(svgBody(card)[0]).toBe(
      '<rect data-id="m" data-part="card" x="12" y="8" width="40" height="20" rx="5" fill="#B8BEC8"/>',
    );
  });

  it("writes a boundary as a line", () => {
    const drawing = synthetic({
      type: "boundary",
      address: at("b", "start"),
      style: BLACK,
      x: 10,
      y1: 12,
      y2: 18,
    });
    expect(svgBody(drawing)).toEqual([
      '<line data-id="b" data-part="start" x1="10" y1="12" x2="10" y2="18" stroke="#000000" stroke-width="1"/>',
    ]);
    expect(tikzBody(drawing)).toEqual(["\\path[draw=ts000000,line width=1pt] (10,18) -- (10,12);"]);
  });

  it("writes a cross-section line from its first ordinate to its second", () => {
    const drawing = synthetic({
      type: "cross_section",
      address: at("s", "line"),
      style: style({ stroke: "#1BA1E2", "stroke-dasharray": "3 3" }),
      x: 10,
      y1: 25,
      y2: 5,
    });
    expect(svgBody(drawing)).toEqual([
      '<line data-id="s" data-part="line" x1="10" y1="25" x2="10" y2="5" stroke="#1BA1E2" stroke-width="1" stroke-dasharray="3 3"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[draw=ts1BA1E2,line width=1pt,dash pattern=on 3pt off 3pt] (10,5) -- (10,25);",
    ]);
  });

  it("writes the timestamps fixture's named timestamps, their stacked labels and their line last", () => {
    const manifest = loadFixture("timestamps");
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, manifestLayer(manifest)],
      fontMetrics,
    );
    const svg = svgBody(drawing);
    expect(svg).toContain(
      '<polygon data-id="timestamp_1" points="124.9155,79.4297 121.9155,92.4297 127.9155,92.4297" fill="#000000"/>',
    );
    expect(svg).toContain(
      '<text data-id="timestamp_1" data-part="name" x="124.9155" y="102.7837" text-anchor="middle" font-size="9" fill="#000000">Downbeat</text>',
    );
    for (const label of [
      '<text data-id="timestamp_3" data-part="name" x="199.9155" y="47.854" text-anchor="middle" font-size="9" fill="#000000">Entry</text>',
      '<text data-id="timestamp_3" data-part="id" x="199.9155" y="58.3306" text-anchor="middle" font-size="9" fill="#000000">timestamp_3</text>',
      '<text data-id="timestamp_3" data-part="coordinate" x="199.9155" y="68.8071" text-anchor="middle" font-size="9" fill="#000000">1 ♩</text>',
    ]) {
      expect(svg).toContain(label);
    }
    const line = (id: string, x: string, y1: string, y2: string) =>
      `<line data-id="${id}" data-part="line" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#1BA1E2" stroke-width="1" stroke-dasharray="3 3"/>`;
    expect(svg.slice(-4)).toEqual([
      line("timestamp_1", "124.9155", "8", "79.4297"),
      line("timestamp_1", "124.9155", "104.9062", "112.9062"),
      line("timestamp_3", "199.9155", "8", "24.5"),
      line("timestamp_3", "199.9155", "70.9297", "112.9062"),
    ]);
    expect(tikzBody(drawing).slice(-1)).toEqual([
      "\\path[draw=ts1BA1E2,line width=1pt,dash pattern=on 3pt off 3pt] (199.9155,51.9766) -- (199.9155,10);",
    ]);
    // An editor's wedge at the same position writes the same points.
    const key = placeKeyText({ item: "clt_1" }) + addressKey({ id: "clt_1" });
    const unnamed = wedgeAt(drawing, key, 124.91552734375);
    const written = toDescriptors(drawing).find(
      (each) => each.tag === "polygon" && sameAddress(each.source.address, at("timestamp_1")),
    );
    expect(written?.tag === "polygon" && written.points).toEqual(unnamed?.points);
  });

  it("writes an alignment anchor's line from its first point to its second", () => {
    const drawing = synthetic({
      type: "alignment_anchor",
      address: at("anchor_1"),
      style: style({ stroke: "#1BA1E2", "stroke-dasharray": "3 3" }),
      x1: 30,
      y1: 5,
      x2: 10,
      y2: 25,
    });
    expect(svgBody(drawing)).toEqual([
      '<line data-id="anchor_1" x1="30" y1="5" x2="10" y2="25" stroke="#1BA1E2" stroke-width="1" stroke-dasharray="3 3"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[draw=ts1BA1E2,line width=1pt,dash pattern=on 3pt off 3pt] (30,25) -- (10,5);",
    ]);
  });

  it("writes the bundle_matchstamps fixture's anchors and their label last, as stored", () => {
    const manifest = loadFixture("bundles/bundle_matchstamps");
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, manifestLayer(manifest)],
      fontMetrics,
    );
    expect(svgBody(drawing).slice(-3)).toEqual([
      '<line data-id="anchor_1" x1="261.0928" y1="78.1836" x2="161.0928" y2="86.1836" stroke="#1BA1E2" stroke-width="1" stroke-dasharray="3 3"/>',
      '<line data-id="anchor_2" x1="261.0928" y1="78.1836" x2="161.0928" y2="143.5625" stroke="#1BA1E2" stroke-width="1" stroke-dasharray="3 3"/>',
      '<text data-id="anchor_1" data-part="name" x="211.0928" y="85.2993" text-anchor="middle" font-size="9" fill="#000000">Bar 2, downbeat (take 1)</text>',
    ]);
    expect(tikzBody(drawing).slice(-3, -2)).toEqual([
      "\\path[draw=ts1BA1E2,line width=1pt,dash pattern=on 3pt off 3pt] (261.0928,124.7578) -- (161.0928,116.7578);",
    ]);
  });

  it("ends a jump's shaft at its filled arrowhead's base", () => {
    const drawing = synthetic({
      type: "jump_from",
      address: at("j"),
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
      '<path data-id="j" d="M10 20C20 40 40 40 48 24" fill="none" stroke="#000000" stroke-width="1.5"/>',
      '<polygon data-id="j" points="50,20 46,23 50,25" fill="#000000"/>',
    ]);
    expect(tikzBody(drawing)[0]).toBe(
      "\\path[draw=ts000000,line width=1.5pt] (10,10) .. controls (20,-10) and (40,-10) .. (48,6);",
    );
  });

  for (const name of ["flow_control", "corpus_score_ms3"]) {
    it(`continues each shaft of ${name} along its head's axis`, () => {
      const manifest = loadFixture(name);
      const count = manifest.timelines
        .flatMap((timeline) => timeline.flow_control)
        .filter((item) => item.type === "jump_from").length;
      const layers = [DEFAULT_LAYER, manifestLayer(manifest)];
      const drawing = draw(manifest, DEFAULT_PLACEMENT, layers, fontMetrics);
      const descriptors = toDescriptors(drawing);
      const paths = descriptors.filter(
        (each) => each.tag === "path" && each.source.type === "jump_from",
      );
      expect(paths.length).toBe(count);
      for (const path of paths) {
        const index = descriptors.indexOf(path);
        const head = descriptors[index + 1];
        const curve = path.tag === "path" ? path.d[1] : undefined;
        const [tip, left, right] = head?.tag === "polygon" ? head.points : [];
        if (curve?.command !== "C" || tip === undefined || left === undefined || !right) {
          throw new Error("a jump is a cubic shaft, then its head");
        }
        const [, c2, base] = curve.points;
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

  const line = (
    type: "timeline" | "child" | "ancestor",
    start: LineStart,
    end: LineEnd,
    changes: Partial<Style> = {},
  ) =>
    synthetic({
      type,
      address: at("c"),
      style: style({
        stroke: "#00CC00",
        fill: "#00CC00",
        "stroke-width": 2,
        "stroke-dasharray": "3 3",
        ...changes,
      }),
      xs: 10,
      xe: 50,
      y: 20,
      start,
      end,
      cuts: [],
    });
  const lineTo = (stop: number) =>
    `<line data-id="c" x1="10" y1="20" x2="${stop}" y2="20" stroke="#00CC00" stroke-width="2" stroke-dasharray="3 3"/>`;
  const startCircle = '<circle data-id="c" cx="10" cy="20" r="2" fill="#00CC00"/>';

  for (const type of ["timeline", "child", "ancestor"] as const) {
    it(`ends a ${type} line with each end of section 6.6`, () => {
      expect(svgBody(line(type, "circle", "arrowhead"))).toEqual([
        lineTo(50),
        startCircle,
        '<polygon data-id="c" points="56,20 50,17 50,23" fill="#00CC00"/>',
      ]);
      expect(svgBody(line(type, "circle", "open"))).toEqual([
        lineTo(50),
        startCircle,
        '<polygon data-id="c" points="56,20 50,17 50,23" fill="none" stroke="#00CC00" stroke-width="1"/>',
      ]);
      expect(svgBody(line(type, "circle", "circle"))).toEqual([
        lineTo(50),
        startCircle,
        '<circle data-id="c" cx="50" cy="20" r="2" fill="#00CC00"/>',
      ]);
      expect(svgBody(line(type, "circle", "diamond"))).toEqual([
        lineTo(47),
        startCircle,
        '<polygon data-id="c" points="47,20 50,17.6 53,20 50,22.4" fill="none" stroke="#00CC00" stroke-width="1"/>',
      ]);
      expect(svgBody(line(type, "circle", "unknown"))).toEqual([
        lineTo(50),
        startCircle,
        '<polyline data-id="c" points="52,17 55,20 52,23" fill="none" stroke="#00CC00" stroke-width="1"/>',
        '<polyline data-id="c" points="55,17 58,20 55,23" fill="none" stroke="#00CC00" stroke-width="1"/>',
        '<polyline data-id="c" points="58,17 61,20 58,23" fill="none" stroke="#00CC00" stroke-width="1"/>',
      ]);
      expect(svgBody(line(type, "circle", "chevrons"))).toEqual([
        lineTo(50),
        startCircle,
        '<polyline data-id="c" points="52,17 55,20 52,23" fill="none" stroke="#00CC00" stroke-width="1"/>',
        '<polyline data-id="c" points="55,17 58,20 55,23" fill="none" stroke="#00CC00" stroke-width="1"/>',
      ]);
      expect(svgBody(line(type, "none", "none"))).toEqual([lineTo(50)]);
      expect(svgBody(line(type, "none", "circle"))).toEqual([
        lineTo(50),
        '<circle data-id="c" cx="50" cy="20" r="2" fill="#00CC00"/>',
      ]);
    });
  }

  it("writes a gap's rectangle only where it is filled, then its continuations", () => {
    const gap = (fill: string, continuations: number[], address = at("e")) =>
      synthetic({
        type: "elision",
        address,
        style: style({ fill, stroke: "#9CA3AF", "stroke-width": 1, "stroke-dasharray": "2 2" }),
        x1: 10,
        x2: 40,
        yt: 4,
        yb: 26,
        continuations,
        elided: { timeline: "t", start: 0, end: 1 },
        origin: "stored",
      });
    const stroke = 'stroke="#9CA3AF" stroke-width="1" stroke-dasharray="2 2"';
    const rect = '<rect data-id="e" x="10" y="4" width="30" height="22" fill="#F2F2F2"/>';
    const continuations = [
      `<line data-id="e" x1="10" y1="12" x2="40" y2="12" ${stroke}/>`,
      `<line data-id="e" x1="10" y1="20" x2="40" y2="20" ${stroke}/>`,
    ];
    expect(svgBody(gap("none", []))).toEqual([]);
    expect(svgBody(gap("none", [12, 20]))).toEqual(continuations);
    expect(svgBody(gap("#F2F2F2", [12, 20]))).toEqual([rect, ...continuations]);
    const dashed = "draw=ts9CA3AF,line width=1pt,dash pattern=on 2pt off 2pt";
    expect(tikzBody(gap("#F2F2F2", [12, 20]))).toEqual([
      "\\path[fill=tsF2F2F2] (10,4) rectangle (40,26);",
      `\\path[${dashed}] (10,18) -- (40,18);`,
      `\\path[${dashed}] (10,10) -- (40,10);`,
    ]);
    expect(svgBody(gap("#F2F2F2", [], at("score", "elision")))[0]).toBe(
      '<rect data-id="score" data-part="elision" x="10" y="4" width="30" height="22" fill="#F2F2F2"/>',
    );
  });

  it("writes an ellipsis as three filled dots, spacing apart, on its row", () => {
    const ellipsis = synthetic({
      type: "ellipsis",
      address: at("e", "ellipsis"),
      style: style({ fill: "#000000" }),
      x: 25,
      y: 12,
      r: 2,
      spacing: 6,
    });
    const dot = (cx: number) =>
      `<circle data-id="e" data-part="ellipsis" cx="${cx}" cy="12" r="2" fill="#000000"/>`;
    expect(svgBody(ellipsis)).toEqual([dot(19), dot(25), dot(31)]);
    expect(tikzBody(ellipsis)).toEqual([
      "\\path[fill=ts000000] (19,18) circle[radius=2];",
      "\\path[fill=ts000000] (25,18) circle[radius=2];",
      "\\path[fill=ts000000] (31,18) circle[radius=2];",
    ]);
  });

  it("writes a line and a map crossing gaps in pieces from run to run", () => {
    const cut = synthetic({
      type: "child",
      address: at("c"),
      style: style({ stroke: "#00CC00", fill: "#00CC00", "stroke-width": 2 }),
      xs: 10,
      xe: 50,
      y: 20,
      start: "circle",
      end: "none",
      cuts: [
        [10, 14],
        [20, 30],
      ],
    });
    const piece = (from: number, to: number) =>
      `<line data-id="c" x1="${from}" y1="20" x2="${to}" y2="20" stroke="#00CC00" stroke-width="2"/>`;
    // The piece from the start to the first gap has no length and is not written.
    expect(svgBody(cut)).toEqual([
      piece(14, 20),
      piece(30, 50),
      '<circle data-id="c" cx="10" cy="20" r="2" fill="#00CC00"/>',
    ]);
    const map = synthetic({
      type: "map",
      address: at("m"),
      style: style({ stroke: "#00CC00" }),
      xs: 10,
      xe: 50,
      yc: 20,
      spacing: 4,
      cuts: [[20, 30]],
    });
    expect(svgBody(map)).toEqual([
      '<polygon data-id="m" points="10,18 20,18 20,22 10,22" fill="none" stroke="#00CC00" stroke-width="1"/>',
      '<polygon data-id="m" points="30,18 50,18 50,22 30,22" fill="none" stroke="#00CC00" stroke-width="1"/>',
    ]);
  });

  /**
   * The points of the polylines a fixture's drawing writes for one address,
   * in order, drawn with the ancestor cards hidden: the chevrons are those of
   * the ancestor line on the member's card, not of the root drawn whole.
   */
  const chevronsOf = (name: string, id: string) => {
    const manifest = loadFixture(name);
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, HIDDEN_ANCESTOR_CARDS, manifestLayer(manifest)],
      fontMetrics,
    );
    const polylines = toDescriptors(drawing).flatMap((each) =>
      each.tag === "polyline" && sameAddress(each.source.address, at(id)) ? [each] : [],
    );
    return {
      points: polylines.map((each) => each.points),
      // Every open path of three points the TikZ writer writes: a chevron.
      chevronPaths: tikzBody(drawing).filter((each) =>
        /^\\path\[[^\]]*\] \([^)]*\) -- \([^)]*\) -- \([^)]*\);$/.test(each),
      ).length,
    };
  };

  it("ends an open line in three chevrons, its outer tip 9.5w past its end", () => {
    const { points, chevronPaths } = chevronsOf("unknown_length", "score");
    expect(chevronPaths).toBe(3);
    expect(points).toEqual([
      [
        [468.798828125, 32.5],
        [473.298828125, 37],
        [468.798828125, 41.5],
      ],
      [
        [473.298828125, 32.5],
        [477.798828125, 37],
        [473.298828125, 41.5],
      ],
      [
        [477.798828125, 32.5],
        [482.298828125, 37],
        [477.798828125, 41.5],
      ],
    ]);
  });

  it("runs an ancestor line on in two chevrons on each side, never three", () => {
    const { points } = chevronsOf("groups/group_grandchild", "score");
    expect(points).toEqual([
      [
        [96.70361328125, 94.68359375],
        [92.20361328125, 99.18359375],
        [96.70361328125, 103.68359375],
      ],
      [
        [92.20361328125, 94.68359375],
        [87.70361328125, 99.18359375],
        [92.20361328125, 103.68359375],
      ],
      [
        [526.70361328125, 94.68359375],
        [531.20361328125, 99.18359375],
        [526.70361328125, 103.68359375],
      ],
      [
        [531.20361328125, 94.68359375],
        [535.70361328125, 99.18359375],
        [531.20361328125, 103.68359375],
      ],
    ]);
  });

  it("runs an ancestor line on at both sides in double chevrons, inner first", () => {
    const drawing = synthetic({
      type: "ancestor",
      address: at("a"),
      style: style({
        stroke: "#00CC00",
        fill: "#00CC00",
        "stroke-width": 2,
        "stroke-dasharray": "3 3",
        opacity: 0.35,
      }),
      xs: 20,
      xe: 40,
      y: 20,
      start: "chevrons",
      end: "chevrons",
      cuts: [],
    });
    const chevron = (points: string) =>
      `<polyline data-id="a" points="${points}" fill="none" stroke="#00CC00" stroke-width="1" opacity="0.35"/>`;
    expect(svgBody(drawing)).toEqual([
      '<line data-id="a" x1="20" y1="20" x2="40" y2="20" stroke="#00CC00" stroke-width="2" stroke-dasharray="3 3" opacity="0.35"/>',
      chevron("18,17 15,20 18,23"),
      chevron("15,17 12,20 15,23"),
      chevron("42,17 45,20 42,23"),
      chevron("45,17 48,20 45,23"),
    ]);
    expect(tikzBody(drawing).slice(0, 2)).toEqual([
      "\\path[draw=ts00CC00,line width=2pt,dash pattern=on 3pt off 3pt,opacity=0.35] (20,10) -- (40,10);",
      "\\path[draw=ts00CC00,line width=1pt,opacity=0.35] (18,13) -- (15,10) -- (18,7);",
    ]);
  });

  it("draws a map as one closed, stroked outline whose dash starts at its first corner", () => {
    const drawing = synthetic({
      type: "map",
      address: at("m"),
      style: style({ stroke: "#00CC00", "stroke-dasharray": "1 1" }),
      xs: 10,
      xe: 50,
      yc: 20,
      spacing: 2,
      cuts: [],
    });
    expect(svgBody(drawing)).toEqual([
      '<polygon data-id="m" points="10,19 50,19 50,21 10,21" fill="none" stroke="#00CC00" stroke-width="1" stroke-dasharray="1 1"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[draw=ts00CC00,line width=1pt,dash pattern=on 1pt off 1pt] (10,11) -- (50,11) -- (50,9) -- (10,9) -- cycle;",
    ]);
  });

  it("writes opacity last and maps dash patterns", () => {
    const line = (dash: string) =>
      synthetic({
        type: "flow_marker",
        address: at("flow_marker_1"),
        style: style({ stroke: "#FF0000", "stroke-dasharray": dash, opacity: 0.5 }),
        x: 10,
        y1: 5,
        y2: 25,
      });
    expect(svgBody(line("2"))).toEqual([
      '<line data-id="flow_marker_1" x1="10" y1="5" x2="10" y2="25" stroke="#FF0000" stroke-width="1" stroke-dasharray="2" opacity="0.5"/>',
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
      type: "flow_marker",
      address: at("flow_marker_1"),
      style: style({ stroke: "#FF0000", "stroke-dasharray": "1.50 0.00001" }),
      x: 10,
      y1: 5,
      y2: 25,
    });
    expect(svgBody(drawing)).toEqual([
      '<line data-id="flow_marker_1" x1="10" y1="5" x2="10" y2="25" stroke="#FF0000" stroke-width="1" stroke-dasharray="1.5 0"/>',
    ]);
    expect(tikzBody(drawing)).toEqual([
      "\\path[draw=tsFF0000,line width=1pt,dash pattern=on 1.5pt off 0pt] (10,25) -- (10,5);",
    ]);
  });

  it("writes no paint option for stroke none", () => {
    const drawing = synthetic({
      type: "flow_marker",
      address: at("flow_marker_1"),
      style: style({ stroke: "none" }),
      x: 10,
      y1: 5,
      y2: 25,
    });
    expect(svgBody(drawing)).toEqual([
      '<line data-id="flow_marker_1" x1="10" y1="5" x2="10" y2="25" stroke="none" stroke-width="1"/>',
    ]);
    expect(tikzBody(drawing)).toEqual(["\\path[line width=1pt] (10,25) -- (10,5);"]);
  });

  it("escapes text", () => {
    const text = (value: string) =>
      synthetic({
        type: "label",
        address: at("region_1", "label"),
        style: style({ fill: "#000000" }),
        x: 10,
        baseline: 20,
        anchor: "middle",
        text: value,
      });
    expect(svgBody(text("a&b<c>"))[0]).toBe(
      '<text data-id="region_1" data-part="label" x="10" y="20" text-anchor="middle" font-size="9" fill="#000000">a&amp;b&lt;c&gt;</text>',
    );
    expect(tikzBody(text("\\~^#$%&_{}"))[0]).toBe(
      "\\node[anchor=base,inner sep=0,font=\\sffamily\\fontsize{9}{10.4766}\\selectfont,text=ts000000] at (10,10) {\\textbackslash{}\\textasciitilde{}\\textasciicircum{}\\#\\$\\%\\&\\_\\{\\}};",
    );
    expect(tikzBody(text(" a  b "))[0]).toContain("{\\ a \\ b\\ }");
  });

  it("escapes attribute values and self-closes elements without text", () => {
    const drawing = synthetic({
      type: "flow_marker",
      address: at('r/&<>",'),
      style: BLACK,
      x: 10,
      y1: 5,
      y2: 25,
    });
    expect(svgBody(drawing)).toEqual([
      '<line data-id="r/&amp;&lt;&gt;&quot;," x1="10" y1="5" x2="10" y2="25" stroke="#000000" stroke-width="1"/>',
    ]);
  });
});

describe("address attributes", () => {
  /** A flow marker's line at `address`, its attributes after the address fixed. */
  const marker = (address: ElementAddress) =>
    synthetic({ type: "flow_marker", address, style: BLACK, x: 10, y1: 5, y2: 25 });
  const tail = 'x1="10" y1="5" x2="10" y2="25" stroke="#000000" stroke-width="1"/>';

  it("writes data-id, data-facet and data-part, each only when present, in that order", () => {
    expect(svgBody(marker({ id: "c" }))).toEqual([`<line data-id="c" ${tail}`]);
    expect(svgBody(marker({ id: "c", facet: "regions" }))).toEqual([
      `<line data-id="c" data-facet="regions" ${tail}`,
    ]);
    expect(svgBody(marker({ id: "c", part: ["start"] }))).toEqual([
      `<line data-id="c" data-part="start" ${tail}`,
    ]);
    expect(svgBody(marker({ part: ["name"] }))).toEqual([`<line data-part="name" ${tail}`]);
  });

  it("joins a wedge label's part words with one space", () => {
    const drawing = synthetic({
      type: "label",
      address: at("c", "start", "label"),
      style: style({ fill: "#000000" }),
      x: 10,
      baseline: 20,
      anchor: "middle",
      text: "0",
    });
    expect(svgBody(drawing)).toEqual([
      '<text data-id="c" data-part="start label" x="10" y="20" text-anchor="middle" font-size="9" fill="#000000">0</text>',
    ]);
  });

  it("writes an ID verbatim, a slash, a space and a URI's # included", () => {
    expect(svgBody(marker({ id: "perf/take 2" }))).toEqual([`<line data-id="perf/take 2" ${tail}`]);
    expect(
      svgBody(marker({ id: "https://example.org/piece/score#exposition", part: ["card"] })),
    ).toEqual([
      `<line data-id="https://example.org/piece/score#exposition" data-part="card" ${tail}`,
    ]);
  });

  it("writes none for the block's background, the bundle's address {}", () => {
    const [background] = toDescriptors(synthetic());
    expect(background?.source.address).toEqual({});
    expect(background?.attrs.some(([name]) => name.startsWith("data-"))).toBe(false);
  });
});

const KIND: { readonly [tag in Tag]: RegExp } = {
  rect: /^\\path\[[^\]]*\] \([^)]*\) rectangle \([^)]*\);$/,
  line: /^\\path\[[^\]]*\] \([^)]*\) -- \([^)]*\);$/,
  circle: /^\\path\[[^\]]*\] \([^)]*\) circle\[radius=[^\]]*\];$/,
  polygon: /^\\path\[[^\]]*\] (\([^)]*\) -- )+cycle;$/,
  polyline: /^\\path\[[^\]]*\] \([^)]*\) -- \([^)]*\) -- \([^)]*\);$/,
  path: /^\\path\[[^\]]*\] \([^)]*\) \.\. controls /,
  text: /^\\node\[anchor=base( west)?,inner sep=0,/,
};

/** An attribute value as SVG escapes it. */
const escaped = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** One SVG line and one TikZ command per descriptor, in order, of the kind its tag selects. */
function oneCommandPerDescriptor(drawing: Drawing, scale: number): Descriptor[] {
  const descriptors = toDescriptors(drawing);
  const placed = [{ drawing, x: 0, y: 0, scale }];
  const svg = writeSvg(placed).split("\n");
  expect(svg.slice(2, -3)).toEqual(descriptors.map(descriptorSvg));
  descriptors.forEach((descriptor, index) => {
    // The attributes of the element's address, first and in this order; none for the background.
    const { id, facet, part } = descriptor.source.address;
    const expected: (readonly [string, string])[] = [
      ...(id === undefined ? [] : [["data-id", id] as const]),
      ...(facet === undefined ? [] : [["data-facet", facet] as const]),
      ...(part === undefined ? [] : [["data-part", part.join(" ")] as const]),
    ];
    expect(expected.length === 0).toBe(index === 0);
    expect(descriptor.attrs.slice(0, expected.length)).toEqual(expected);
    expect(descriptor.attrs.slice(expected.length).some(([name]) => name.startsWith("data-"))).toBe(
      false,
    );
    const head = expected.map(([name, value]) => `${name}="${escaped(value)}" `).join("");
    expect(svg[index + 2]?.startsWith(`<${descriptor.tag} ${head}`)).toBe(true);
  });
  const tikz = writeTikz(placed).split("\n");
  const begin = tikz.findIndex((line) => line.startsWith("\\begin{scope}"));
  const end = tikz.indexOf("\\end{scope}");
  const commands = tikz.slice(begin + 1, end);
  expect(commands.length).toBe(descriptors.length);
  descriptors.forEach((descriptor, index) => {
    expect(commands[index]).toMatch(KIND[descriptor.tag]);
  });
  return descriptors;
}

/**
 * Every descriptor names the element it was written from: the elements in
 * order, each once at least but an unfilled gap without continuations,
 * which writes none (section 7.2), its type and address, `shadow` the role
 * of a card's or an ancestor card's shadow alone.
 */
function sourcesFollowElements(drawing: Drawing): void {
  const descriptors = toDescriptors(drawing);
  const order = descriptors.map((each) => each.source.element);
  expect(order).toEqual([...order].sort((left, right) => left - right));
  const silent = drawing.elements.flatMap((element, index) =>
    element.type === "elision" &&
    element.style.fill === "none" &&
    element.continuations.length === 0
      ? [index]
      : [],
  );
  expect([...new Set(order)]).toEqual(
    [...drawing.elements.keys()].filter((index) => !silent.includes(index)),
  );
  drawing.elements.forEach((element, index) => {
    const own = descriptors.filter((each) => each.source.element === index);
    const shadowed =
      (element.type === "card" || element.type === "ancestor_card") &&
      element.style.shadow !== "none";
    expect(own.map(({ source }) => [source.type, source.address, source.role])).toEqual(
      own.map((_, at) => [
        element.type,
        element.address,
        shadowed && at === 0 ? "shadow" : "primary",
      ]),
    );
  });
}

describe("descriptor sources", () => {
  it("everything", () => {
    sourcesFollowElements(everything());
    const roles = toDescriptors(everything()).map((each) => each.source.role);
    expect(roles.filter((role) => role === "shadow")).toHaveLength(1);
  });

  for (const item of reviewCases()) {
    it(item.name, () => {
      sourcesFollowElements(item.drawing);
    });
  }
});

describe("one command per descriptor", () => {
  it("everything", () => {
    const descriptors = oneCommandPerDescriptor(everything(), 1);
    expect(descriptors.length).toBe(36);
    expect(new Set(descriptors.map((each) => each.tag))).toEqual(new Set(Object.keys(KIND)));
  });

  for (const item of reviewCases()) {
    it(item.name, () => {
      oneCommandPerDescriptor(item.drawing, item.scale);
    });
  }
});
