/** The arcs, lines and labels of the flow fixtures, and a rejected element; derived in tests/README.md. */

import type { Manifest } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  type JumpElement,
  manifestLayer,
} from "../src/index.ts";
import { at, drawFixture, edit, edited, loadFile, metrics, quarters, target } from "./support.ts";

const X0 = 55.05029296875;
/** `x0` of `flow/loop`, whose root is named `Take`. */
const X_TAKE = 50.59765625;
/** The opacity of a rejected element and its label: the defaults' opacity of ancestor lines. */
const FADED_OPACITY = 0.35;
const LINE = 43.20703125;
/** Where a line of a root's flow control band below its line ends: the card's top plus the padding. */
const END = 36.8046875;

/** The flow-control elements of a drawing and their labels, in drawing order, without their styles. */
function flow(drawing: Drawing): object[] {
  const ids = new Set(
    drawing.elements.flatMap((item) =>
      ["break", "section_break", "barline", "jump"].includes(item.type) ? [item.address.id] : [],
    ),
  );
  return drawing.elements
    .filter((item) => ids.has(item.address.id))
    .map(({ style: _, ...geometry }) => geometry);
}

const styles = (drawing: Drawing, id: string): DrawnElement[] =>
  drawing.elements.filter((item) => item.address.id === id);

describe("flow/sonata_exposition", () => {
  it("draws the break, the second bracket's arc and the repeat's arc to the timeline's start", () => {
    const drawing = drawFixture("flow/sonata_exposition");
    const yf = 71.18359375;
    const x16 = 321.71695963541663;
    expect(drawing.elements.find((item) => item.type === "timeline")).toMatchObject({
      xs: X0,
      xe: X0 + 400,
      y: LINE,
    });
    expect(flow(drawing)).toEqual([
      { type: "break", address: at("break_1"), x: x16, y1: yf, y2: END },
      {
        type: "jump",
        address: at("jump_1"),
        start: [255.05029296875, yf],
        c1: [271.71695963541663, 81.85026041666666],
        c2: [305.05029296875, 81.85026041666666],
        tip: [x16, yf],
        base: [318.34787403277056, 73.33980853569346],
        corners: [
          [317.26976663992383, 71.65526573437046],
          [319.4259814256173, 75.0243513370165],
        ],
      },
      {
        type: "jump",
        address: at("jump_2"),
        start: [x16, yf],
        c1: [255.05029296874997, 109.15234375],
        c2: [121.71695963541666, 109.15234375],
        tip: [X0, yf],
        base: [58.52610278516582, 73.16317605950557],
        corners: [
          [57.53631163041303, 74.90108096771348],
          [59.515893939918605, 71.42527115129766],
        ],
      },
      {
        type: "label",
        address: at("jump_1", "label"),
        x: 288.38362630208337,
        baseline: 89.53759765625,
        anchor: "middle",
        text: "volta",
      },
      {
        type: "label",
        address: at("jump_2", "label"),
        x: 188.38362630208331,
        baseline: 110.01416015625,
        anchor: "middle",
        text: "repeat_end",
      },
    ]);
  });
});

describe("flow/repeat_end_and_dal_segno", () => {
  it("draws one arc per destination of the one jump, the shorter first, each with its own text", () => {
    const drawing = drawFixture("flow/repeat_end_and_dal_segno");
    const yf = 48.70703125;
    const x16 = 321.71695963541663;
    expect(flow(drawing)).toEqual([
      {
        type: "jump",
        address: at("jump_1"),
        start: [x16, yf],
        c1: [288.3836263020833, 59.373697916666664],
        c2: [221.71695963541663, 59.373697916666664],
        tip: [188.38362630208331, yf],
        base: [192.1933228908806, 49.92613415841514],
        corners: [
          [191.58377143667303, 51.830982452813785],
          [192.80287434508818, 48.02128586401649],
        ],
      },
      {
        type: "jump",
        address: at("jump_1"),
        start: [x16, yf],
        c1: [271.71695963541663, 86.67578125],
        c2: [171.71695963541666, 86.67578125],
        tip: [121.71695963541666, yf],
        base: [124.90256731729734, 51.12610208342815],
        corners: [
          [123.69303190058326, 52.71890592436849],
          [126.11210273401142, 49.5332982424878],
        ],
      },
      {
        type: "label",
        address: at("jump_1", "label"),
        x: 255.05029296875,
        baseline: 67.06103515625,
        anchor: "middle",
        text: "D.S.",
      },
      {
        type: "label",
        address: at("jump_1", "label"),
        x: 221.71695963541669,
        baseline: 87.53759765625,
        anchor: "middle",
        text: "repeat_end",
      },
    ]);
  });
});

describe("flow/sections", () => {
  it("lands a destination without a place at the start of its jump's section", () => {
    const drawing = drawFixture("flow/sections");
    const yf = 59.18359375;
    const yc = 69.85026041666666;
    expect(flow(drawing)).toEqual([
      { type: "break", address: at("break_1"), x: 155.05029296875, y1: yf, y2: END },
      {
        type: "section_break",
        address: at("section_break_1"),
        x: 255.05029296875,
        y1: yf,
        y2: END,
      },
      {
        type: "jump",
        address: at("jump_1"),
        start: [255.05029296875, yf],
        c1: [205.05029296875, yc],
        c2: [105.05029296875, yc],
        tip: [X0, yf],
        base: [58.96226431444723, 60.01814763708208],
        corners: [
          [58.54498737090619, 61.97413330993069],
          [59.37954125798827, 58.06216196423346],
        ],
      },
      {
        type: "jump",
        address: at("jump_2"),
        start: [455.05029296875, yf],
        c1: [405.05029296875, yc],
        c2: [305.05029296875, yc],
        tip: [255.05029296875, yf],
        base: [258.9622643144472, 60.01814763708208],
        corners: [
          [258.5449873709062, 61.97413330993069],
          [259.37954125798825, 58.06216196423346],
        ],
      },
      {
        type: "label",
        address: at("jump_1", "label"),
        x: 155.05029296875,
        baseline: 77.53759765625,
        anchor: "middle",
        text: "D.C. al Fine",
      },
      {
        type: "label",
        address: at("jump_2", "label"),
        x: 355.05029296875,
        baseline: 77.53759765625,
        anchor: "middle",
        text: "D.C.",
      },
      {
        type: "label",
        address: at("break_1", "label"),
        x: 158.05029296875,
        baseline: 57.06103515625,
        anchor: "start",
        text: "Fine",
      },
    ]);
  });

  it("passes over a rejected section break", () => {
    const provenance = [
      { beliefs: [{ actor: "https://example.org/a", belief: "false", date: "2026-11-25" }] },
    ];
    const manifest = edited(loadFile("flow/sections"), {
      type: "set",
      changes: [{ target: target("section_break_1"), values: { provenance } }],
    });
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    const arcs = drawing.elements.filter((item): item is JumpElement => item.type === "jump");
    // Both jumps now lie in one section, which starts at 0: the spans are 16 and 32.
    expect(arcs.map((item) => [item.address, item.start[0], item.tip[0]])).toEqual([
      [at("jump_1"), 255.05029296875, X0],
      [at("jump_2"), 455.05029296875, X0],
    ]);
    expect(styles(drawing, "section_break_1").map((item) => item.style.opacity)).toEqual([
      FADED_OPACITY,
    ]);
  });
});

describe("flow/repairs", () => {
  it("draws the rejected jump and its label faded, and everything else as it is styled", () => {
    const drawing = drawFixture("flow/repairs");
    const yf = 48.70703125;
    expect(
      drawing.elements
        .filter((item) => ["barline_1", "jump_1", "jump_2"].includes(item.address.id ?? ""))
        .map((item) => [item.type, item.address, item.style.opacity]),
    ).toEqual([
      ["barline", at("barline_1"), 1],
      ["jump", at("jump_2"), 1],
      ["jump", at("jump_1"), FADED_OPACITY],
      ["label", at("jump_2", "label"), 1],
      ["label", at("jump_1", "label"), FADED_OPACITY],
    ]);
    // The rejected jump keeps its place in the rows: the replacement in row 1, it in row 2.
    const arcs = drawing.elements.filter((item): item is JumpElement => item.type === "jump");
    expect(arcs.map((item) => [item.start, item.c1, item.tip])).toEqual([
      [
        [455.05029296875, yf],
        [405.05029296875, 59.373697916666664],
        [255.05029296875, yf],
      ],
      [
        [455.05029296875, yf],
        [355.05029296875, 86.67578125],
        [X0, yf],
      ],
    ]);
    expect(drawing.elements.find((item) => item.type === "barline")).toMatchObject({
      x: 255.05029296875,
      y1: yf,
      y2: END,
    });
  });
});

describe("the arcs of one jump", () => {
  /** The `add` of a jump of `flow/sections` at 24 with destinations given in this order. */
  const jump = (...targets: object[]) => ({
    type: "add",
    into: target("score"),
    flow_control: { id: "jump_3", role: "jump", coordinate: quarters(24), targets },
  });
  const ends = (manifest: Manifest) =>
    draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, manifestLayer(manifest)], metrics)
      .elements.filter((item): item is JumpElement => item.type === "jump")
      .filter((item) => item.address.id === "jump_3")
      .map((item) => [item.start[0], item.tip[0]]);

  it("follow the canonical order of its destinations, whatever order they are given in", () => {
    // Both arcs span 4, so the stable sort by span keeps their order: `by` −4 before `by` 4.
    const expected = [
      [355.05029296875, 305.05029296875],
      [355.05029296875, 405.05029296875],
    ];
    const back = { by: quarters(-4) };
    const on = { by: quarters(4) };
    expect(ends(edit("flow/sections", jump(on, back)))).toEqual(expected);
    expect(ends(edit("flow/sections", jump(back, on)))).toEqual(expected);
  });

  it("leave out a destination whose `by` is 0 and no other, however near it lands", () => {
    expect(ends(edit("flow/sections", jump({ by: quarters(0) }, { by: quarters(4) })))).toEqual([
      [355.05029296875, 405.05029296875],
    ]);
    // On a float axis 8.0 + 1e-17 is 8.0: the arc leaves and arrives at one position.
    const near = {
      type: "add",
      into: target("take"),
      flow_control: { id: "jump_3", role: "jump", coordinate: 8.0, targets: [{ by: 1e-17 }] },
    };
    expect(ends(edit("flow/loop", near))).toEqual([[X_TAKE + 320, X_TAKE + 320]]);
  });
});

describe("a jump that draws no arc", () => {
  it("is not counted among its band's elements, and a band holding nothing else is absent", () => {
    // flow/volta_passes: the volta jump holds `by` 0 and a `to`; flow/loop draws its one arc.
    const volta = drawFixture("flow/volta_passes");
    const jumps = volta.elements.filter((item) => item.type === "jump");
    const going = loadFile("flow/volta_passes").timelines[0]?.flow_control.flatMap((item) =>
      (item.targets ?? []).map((destination) => [item.id, Object.hasOwn(destination, "by")]),
    );
    expect(going?.filter(([, by]) => by === true).length).toBe(1);
    expect(jumps.length).toBe((going?.length ?? 0) - 1);
  });
});
