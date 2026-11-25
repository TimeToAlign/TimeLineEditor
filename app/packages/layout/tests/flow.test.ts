/** The arcs, lines and labels of the flow fixtures, and a rejected element; derived in tests/README.md. */

import { readFileSync } from "node:fs";
import path from "node:path";
import { isLoadError, loadManifest, type Manifest } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";
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
import {
  ARCS_ALONE,
  at,
  drawFixture,
  edit,
  edited,
  FULL_CARDS,
  loadFile,
  metrics,
  quarters,
  target,
} from "./support.ts";

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
    // Its atomic sections shown, as the band they fill is part of the derivation.
    const sections: Graphical = {
      rules: [
        { select: { element: "region", class: "tts:AtomicSection" }, set: { display: "inline" } },
      ],
    };
    const drawing = drawFixture("flow/sonata_exposition", [ARCS_ALONE, sections]);
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
    ]);
  });
});

describe("flow/repeat_end_and_dal_segno", () => {
  it("draws one arc per destination of the one jump, the shorter first, each with its own text", () => {
    const drawing = drawFixture("flow/repeat_end_and_dal_segno", [ARCS_ALONE]);
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
    ]);
  });
});

describe("flow/sections", () => {
  it("lands a destination without a place at the start of its jump's section", () => {
    const drawing = drawFixture("flow/sections", [ARCS_ALONE]);
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
        address: at("break_1", "label"),
        x: 158.05029296875,
        baseline: 57.06103515625,
        anchor: "start",
        text: "Fine",
      },
      {
        type: "label",
        address: at("jump_1", "label"),
        x: 258.05029296875,
        baseline: 57.06103515625,
        anchor: "start",
        text: "D.C. al Fine",
      },
      {
        type: "label",
        address: at("jump_2", "label"),
        x: 458.05029296875,
        baseline: 57.06103515625,
        anchor: "start",
        text: "D.C.",
      },
    ]);
  });

  it("labels no arc with its jump's own label, which its stack draws once", () => {
    const labels = loadFile("flow/sections").timelines[0]?.flow_control.map((item) => item.label);
    expect(labels).toEqual(["Fine", "D.C. al Fine", null, "D.C."]);
    const texts = (anchor: "start" | "middle") =>
      drawFixture("flow/sections", [ARCS_ALONE]).elements.flatMap((item) =>
        item.type === "label" && item.anchor === anchor ? [item.text] : [],
      );
    expect(texts("middle")).toEqual([]);
    expect(texts("start")).toEqual(["Fine", "D.C. al Fine", "D.C."]);
  });

  it("passes over a rejected section break", () => {
    const belief = { actor: "https://example.org/a", belief: "false", date: "2026-11-25" };
    const manifest = edited(loadFile("flow/sections"), {
      type: "set",
      changes: [{ target: target("section_break_1"), values: { belief } }],
    });
    const drawing = drawn(manifest);
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
  it("draws the rejected jump faded, and everything else as it is styled", () => {
    const drawing = drawFixture("flow/repairs", [ARCS_ALONE]);
    const yf = 48.70703125;
    expect(
      drawing.elements
        .filter((item) => ["barline_1", "jump_1", "jump_2"].includes(item.address.id ?? ""))
        .map((item) => [item.type, item.address, item.style.opacity]),
    ).toEqual([
      ["barline", at("barline_1"), 1],
      ["jump", at("jump_2"), 1],
      ["jump", at("jump_1"), FADED_OPACITY],
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

/** A manifest drawn with the default layer and its own. */
const drawn = (manifest: Manifest): Drawing =>
  draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, ARCS_ALONE, manifestLayer(manifest)], metrics);

/** Where each arc of the jump `id` leaves and arrives, in drawing order. */
const arcsOf = (drawing: Drawing, id: string) =>
  drawing.elements
    .filter((item): item is JumpElement => item.type === "jump")
    .filter((item) => item.address.id === id)
    .map((item) => [item.start[0], item.tip[0]]);

describe("the arcs of one jump", () => {
  /** The `add` of a jump of `flow/sections` at 24 with destinations given in this order. */
  const jump = (...targets: object[]) => ({
    type: "add",
    into: target("score"),
    flow_control: { id: "jump_3", role: "jump", coordinate: quarters(24), targets },
  });
  const ends = (manifest: Manifest) => arcsOf(drawn(manifest), "jump_3");

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

describe("a destination without a place", () => {
  it("lands at the nearest section break of the tree before its jump, never before its timeline's start", () => {
    const add = (into: string, item: object) => ({
      type: "add",
      into: target(into),
      flow_control: item,
    });
    const sectionBreak = (into: string, id: string, coordinate: number) =>
      add(into, { id, role: "section_break", coordinate: quarters(coordinate) });
    const jumps = [
      sectionBreak("piece", "section_break_a", 2),
      add("verse", { id: "jump_x", role: "jump", coordinate: quarters(6), targets: [{}] }),
      add("piece", { id: "jump_y", role: "jump", coordinate: quarters(14), targets: [{}] }),
    ];
    const ends = (manifest: Manifest) => {
      const drawing = drawn(manifest);
      const { xs } = rootLine(drawing);
      return ["jump_x", "jump_y"].map((id) =>
        arcsOf(drawing, id).map(([a = 0, b = 0]) => [a - xs, b - xs]),
      );
    };
    // `piece` 16 long at 25 a quarter; `verse` at 4: `jump_x` at 10 on `piece`'s axis.
    const before = edit("child_flow_control", ...jumps);
    expect(ends(before)).toEqual([[[250, 100]], [[350, 50]]]);
    const after = edited(before, sectionBreak("verse", "section_break_c", 2));
    expect(ends(after)).toEqual([[[250, 150]], [[350, 150]]]);
  });
});

describe("the texts of one jump's arcs", () => {
  it("are each destination's label, never its manifestation nor the jump's", () => {
    const manifest = edit("flow/sections", {
      type: "add",
      into: target("score"),
      flow_control: {
        id: "jump_3",
        role: "jump",
        coordinate: quarters(24),
        label: "Leap",
        name: "Named",
        targets: [
          { by: quarters(-4), label: "back" },
          { by: quarters(4), manifestation: "volta" },
          { by: quarters(-8) },
        ],
      },
    });
    const drawing = drawn(manifest);
    expect(arcsOf(drawing, "jump_3")).toEqual([
      [355.05029296875, 305.05029296875],
      [355.05029296875, 405.05029296875],
      [355.05029296875, 255.05029296875],
    ]);
    const labels = drawing.elements.flatMap((item) => (item.type === "label" ? [item] : []));
    expect(
      labels
        .filter((item) => item.address.id === "jump_3")
        .map((item) => [item.address, item.text, item.x]),
    ).toEqual([
      [at("jump_3", "label"), "back", 330.05029296875],
      [at("jump_3", "name"), "Named", 358.05029296875],
      [at("jump_3", "label"), "Leap", 358.05029296875],
    ]);
    // Its arc label centred on the arc, its name and its own label in its stack.
    expect(
      labels.filter((item) => ["Named", "Leap"].includes(item.text)).map((item) => item.anchor),
    ).toEqual(["start", "start"]);
  });
});

describe("a to that names no place", () => {
  const REJECTED = [
    { beliefs: [{ actor: "https://example.org/a", belief: "false", date: "2026-11-25" }] },
  ];
  const added = (element: object) => ({
    type: "add",
    into: target("score"),
    flow_control: element,
  });
  const jump = (id: string, coordinate: number, to: string) =>
    added({
      id,
      role: "jump",
      coordinate: quarters(coordinate),
      targets: [{ to }],
      provenance: REJECTED,
    });
  const struck = { id: "struck", role: "jump_target", coordinate: quarters(4) };
  const commands = (target4: object) => [
    {
      type: "add",
      into: target("score"),
      region: { id: "gone", start: quarters(2), end: quarters(6) },
    },
    added(target4),
    jump("kept", 10, "jump_target_1"),
    jump("lost", 12, "gone"),
    jump("stray", 14, "struck"),
  ];
  const ADDED = ["kept", "lost", "stray"];
  /** The arcs of the jumps added, in drawing order: the jump, where it leaves, where it arrives, its opacity. */
  const arcs = (drawing: Drawing) =>
    drawing.elements
      .filter((item): item is JumpElement => item.type === "jump")
      .filter((item) => ADDED.includes(item.address.id ?? ""))
      .map((item) => [item.address.id, item.start[0], item.tip[0], item.style.opacity]);

  it("draws no arc to a rejected jump target", () => {
    const rejected = drawn(edit("flow/repairs", ...commands({ ...struck, provenance: REJECTED })));
    expect(arcs(rejected)).toEqual([
      ["kept", 305.05029296875, 255.05029296875, FADED_OPACITY],
      ["lost", 355.05029296875, 105.05029296875, FADED_OPACITY],
    ]);
    expect(styles(rejected, "stray")).toEqual([]);
    // The same jump draws its arc to the target while the target is not rejected.
    const believed = drawn(edit("flow/repairs", ...commands(struck)));
    expect(arcs(believed)).toEqual([
      ["kept", 305.05029296875, 255.05029296875, FADED_OPACITY],
      ["lost", 355.05029296875, 105.05029296875, FADED_OPACITY],
      ["stray", 405.05029296875, 155.05029296875, FADED_OPACITY],
    ]);
  });

  it("draws no arc for a rejected jump whose to names nothing any more", () => {
    const drawing = drawn(
      edit("flow/repairs", ...commands({ ...struck, provenance: REJECTED }), {
        type: "remove",
        targets: [target("gone")],
      }),
    );
    expect(styles(drawing, "lost")).toEqual([]);
    expect(
      drawing.elements
        .filter((item): item is JumpElement => item.type === "jump")
        .map((item) => [item.address.id, item.start[0], item.tip[0]]),
    ).toEqual([
      ["kept", 305.05029296875, 255.05029296875],
      ["jump_2", 455.05029296875, 255.05029296875],
      ["jump_1", 455.05029296875, X0],
    ]);
  });
});

describe("a jump that draws no arc", () => {
  it("is not counted among its band's elements, and a band holding nothing else is absent", () => {
    // flow/volta_passes: the volta jump holds `by` 0 and a `to`; flow/loop draws its one arc.
    const volta = drawFixture("flow/volta_passes", [ARCS_ALONE]);
    const jumps = volta.elements.filter((item) => item.type === "jump");
    const going = loadFile("flow/volta_passes").timelines[0]?.flow_control.flatMap((item) =>
      (item.targets ?? []).map((destination) => [item.id, Object.hasOwn(destination, "by")]),
    );
    expect(going?.filter(([, by]) => by === true).length).toBe(1);
    expect(jumps.length).toBe((going?.length ?? 0) - 1);
  });
});

/** The elements of the given types in drawing order, without their styles. */
function ofTypes(drawing: Drawing, ...types: string[]): object[] {
  return drawing.elements
    .filter((item) => types.includes(item.type))
    .map(({ style: _, ...geometry }) => geometry);
}

/** The root's line of a drawing. */
function rootLine(drawing: Drawing): { xs: number; y: number } {
  const line = drawing.elements.find((item) => item.type === "timeline");
  if (line === undefined || line.type !== "timeline") throw new Error("no root line");
  return line;
}

describe("Op. 106 drawn with the defaults", () => {
  const manifest = loadManifest(
    readFileSync(path.join(import.meta.dirname, "data", "op106.manifest.json"), "utf8"),
  );
  if (isLoadError(manifest)) throw new Error("the Op. 106 manifest is refused");
  const drawing = draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
  const { xs: x0, y: yl } = rootLine(drawing);
  const x = (offset: number) => x0 + offset;
  const yf = yl + 5.5;
  const at500 = 50.527379523779445;

  it("draws the movements' flow lines in the root's one flow control band", () => {
    const line = (type: string, id: string, offset: number) => ({
      type,
      address: at(id),
      x: x(offset),
      y1: yf,
      y2: END,
    });
    expect(ofTypes(drawing, "break", "section_break", "barline")).toEqual([
      line("break", "break_1", at500),
      line("barline", "barline_1", 83.26912145518854),
      line("barline", "barline_2", 166.13402387418682),
      line("barline", "barline_3", 180.07958062274994),
      line("barline", "barline_4", 218.2782795427272),
      line("barline", "barline_5", 274.96999936840774),
      line("barline", "barline_6", 276.8647761005495),
      line("barline", "barline_7", 281.7659319143561),
      line("barline", "barline_8", 400),
    ]);
    const stroke = (id: string) =>
      drawing.elements
        .filter((item) => item.address.id === id && item.address.part === undefined)
        .map(({ style }) => [style.stroke, style["stroke-width"], style["stroke-dasharray"]]);
    expect(stroke("break_1")).toEqual([["#D62728", 1.5, "1.5 1.5"]]);
    expect(stroke("barline_1")).toEqual([["#6B7280", 1, "none"]]);
    const bands = drawing.boxes.filter(
      (box) => box.kind === "band" && box.address.facet === "flow_control",
    );
    expect(bands.map((box) => box.address)).toEqual([{ id: "clt_1", facet: "flow_control" }]);
  });

  it("draws the symbols on the symbol row, and no arc", () => {
    const baseline = yf + 11.138671875;
    const symbol = (id: string, offset: number, text: string) => ({
      type: "symbol",
      address: at(id, "symbol"),
      x: x(offset),
      baseline,
      text,
    });
    const [double, final] = ["\u{1D101}", "\u{1D102}"];
    expect(ofTypes(drawing, "symbol")).toEqual([
      symbol("jump_2", at500, "\u{1D107}"),
      symbol("barline_1", 83.26912145518854, double),
      symbol("barline_2", 166.13402387418682, final),
      symbol("barline_3", 180.07958062274994, double),
      symbol("barline_4", 218.2782795427272, final),
      symbol("barline_5", 274.96999936840774, final),
      symbol("barline_6", 276.8647761005495, double),
      symbol("barline_7", 281.7659319143561, double),
      symbol("barline_8", 400, final),
    ]);
    expect(ofTypes(drawing, "jump")).toEqual([]);
  });

  it("draws the two volta brackets of the first movement's run", () => {
    const y = yl + 33.9453125;
    const yh = yl + 21.46875;
    const bracket = (from: number, to: number, closed: boolean, text: string) => ({
      type: "bracket",
      address: at("jump_1", "bracket"),
      x1: x(from),
      x2: x(to),
      y,
      yh,
      closed,
      tx: x(from) + 2,
      baseline: yh + 8.35400390625,
      text,
    });
    expect(ofTypes(drawing, "bracket")).toEqual([
      bracket(48.15259268616182, at500, true, "1."),
      bracket(at500, 52.902166361397086, false, "2."),
    ]);
  });

  it("draws the arcs where a rule shows them", () => {
    const shown = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, { rules: [{ select: { element: "jump" }, set: { display: "inline" } }] }],
      metrics,
    );
    expect(
      ofTypes(shown, "jump").map((arc) => {
        const { address, start, tip } = arc as JumpElement;
        return [address, start[0], tip[0]];
      }),
    ).toEqual([
      [at("jump_1"), x(48.15259268616182), x(at500)],
      [at("jump_2"), x(at500), x0],
    ]);
  });
});

describe("the flow control of a tree", () => {
  it("is drawn by the root's band alone, each element held by its own timeline's band", () => {
    const flowBands = (drawing: Drawing) =>
      drawing.boxes
        .filter((box) => box.kind === "band" && box.address.facet === "flow_control")
        .map((box) => box.address.id);
    const drawing = drawFixture("child_flow_control");
    expect(flowBands(drawing)).toEqual(["piece"]);
    const ids = (shown: Drawing) =>
      shown.elements.flatMap((item) =>
        ["break", "symbol"].includes(item.type) ? [[item.type, item.address.id]] : [],
      );
    expect(ids(drawing)).toEqual([
      ["break", "fine"],
      ["symbol", "fine"],
      ["symbol", "da_capo_al_fine"],
    ]);
    const hidden = (id: string) =>
      drawFixture("child_flow_control", [
        {
          rules: [
            { select: { addresses: [{ id, facet: "flow_control" }] }, set: { display: "none" } },
          ],
        },
      ]);
    expect(ids(hidden("verse"))).toEqual([]);
    expect(ids(hidden("piece"))).toEqual([]);
    expect(flowBands(hidden("piece"))).toEqual([]);
  });

  it("gives a child member's card the elements of its root's tree on its stretch", () => {
    const barline = (into: string, id: string, coordinate: number, role = "barline") => ({
      type: "add",
      into: target(into),
      flow_control: { id, role, coordinate: quarters(coordinate) },
    });
    const manifest = edit(
      "groups/group_child_member",
      barline("piece", "barline_1", 4),
      barline("piece", "barline_2", 8),
      barline("piece", "section_break_1", 12, "section_break"),
      barline("piece", "barline_3", 16),
      barline("second-half", "barline_4", 2),
    );
    // `piece`'s ancestor card drawn whole: no derived gap leaves out its barline at 4.
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, FULL_CARDS, manifestLayer(manifest)],
      metrics,
    );
    const lines = drawing.elements.flatMap((item) =>
      item.type === "barline" || item.type === "section_break" ? [item.address.id] : [],
    );
    // `piece`'s ancestor card first, its whole tree; then `second-half`'s card, on its stretch.
    expect(lines).toEqual([
      "barline_1",
      "barline_2",
      "section_break_1",
      "barline_3",
      "barline_4",
      "barline_2",
      "section_break_1",
      "barline_3",
      "barline_4",
    ]);
  });
});

describe("symbols, brackets and stacks", () => {
  it("draws a jump's symbols as one text, and its jump targets' each at its own position", () => {
    const drawing = drawFixture("flow/repeat_end_and_dal_segno");
    expect(
      ofTypes(drawing, "symbol").map((item) => {
        const { address, x, text } = item as { address: object; x: number; text: string };
        return [address, x, text];
      }),
    ).toEqual([
      [at("jump_target_1", "symbol"), X0 + 400 * (4 / 24), "\u{1D106}"],
      [at("jump_target_2", "symbol"), X0 + 400 * (8 / 24), "\u{1D10B}"],
      [at("jump_1", "symbol"), X0 + 400 * (16 / 24), "\u{1D107}\u{1D109}"],
    ]);
  });

  it("closes every bracket of a run but its last", () => {
    const drawing = drawFixture("flow/volta_passes");
    expect(
      ofTypes(drawing, "bracket").map((item) => {
        const { x1, x2, closed, text } = item as {
          x1: number;
          x2: number;
          closed: boolean;
          text: string;
        };
        return [x1, x2, closed, text];
      }),
    ).toEqual([
      [X0 + 200, X0 + 300, true, "1., 3."],
      [X0 + 300, X0 + 400, false, "2."],
    ]);
  });

  it("draws a lone bracket as long as the distance from its jump to its place, never past its cut", () => {
    const volta = (id: string, coordinate: number, destination: object) => ({
      type: "add",
      into: target("score"),
      flow_control: {
        id,
        role: "jump",
        coordinate: quarters(coordinate),
        targets: [{ manifestation: "volta", passes: [1], ...destination }],
      },
    });
    const drawing = draw(
      edit(
        "flow/volta_passes",
        volta("jump_4", 1, { by: quarters(0) }),
        {
          type: "add",
          into: target("score"),
          flow_control: { id: "jump_target_2", role: "jump_target", coordinate: quarters(4) },
        },
        volta("jump_5", 2, { to: "jump_target_2" }),
      ),
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER],
      metrics,
    );
    expect(
      ofTypes(drawing, "bracket").map((item) => {
        const { address, x1, x2, closed } = item as {
          address: { id: string };
          x1: number;
          x2: number;
          closed: boolean;
        };
        return [address.id, x1, x2, closed];
      }),
    ).toEqual([
      // In the band's order, the canonical order of `flow_control`: by coordinate.
      ["jump_4", X0 + 25, X0 + 25, false],
      ["jump_5", X0 + 100, X0 + 150, false],
      ["jump_1", X0 + 200, X0 + 300, true],
      ["jump_1", X0 + 300, X0 + 400, false],
    ]);
  });

  it("stacks an element's labels as its label-display lists them", () => {
    const labels = (drawing: Drawing) =>
      drawing.elements.flatMap((item) =>
        item.type === "label" ? [[item.address, item.x, item.baseline, item.text]] : [],
      );
    const plain = drawFixture("flow/sections");
    const yf = 59.18359375;
    const line1 = yf - 2.12255859375;
    expect(labels(plain)).toEqual([
      [at("break_1", "label"), X0 + 100 + 3, line1, "Fine"],
      [at("jump_1", "label"), X0 + 200 + 3, line1, "D.C. al Fine"],
      [at("jump_2", "label"), X0 + 400 + 3, line1, "D.C."],
    ]);
    const both = drawFixture("flow/sections", [
      { rules: [{ select: { element: "break" }, set: { "label-display": "id label" } }] },
    ]);
    const yf2 = yf + 10.4765625;
    expect(labels(both).slice(0, 2)).toEqual([
      [at("break_1", "id"), X0 + 100 + 3, yf2 - 2.12255859375, "break_1"],
      [at("break_1", "label"), X0 + 100 + 3, yf2 - 10.4765625 - 2.12255859375, "Fine"],
    ]);
  });
});
