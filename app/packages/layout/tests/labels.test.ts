import { type ElementAddress, sameAddress } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  type LeaderElement,
  type LineElement,
  manifestLayer,
  type RegionElement,
  type TextElement,
} from "../src/index.ts";
import { at, build, child, edit, metrics, quarters, set, target } from "./support.ts";

/** `h(9)`, `a(9)` and `d(9)` of the bundled font metrics (section 5.1): 1901 and 483 of 2048. */
const H9 = ((1901 + 483) * 9) / 2048;
const A9 = (1901 * 9) / 2048;
const D9 = (483 * 9) / 2048;

/**
 * The rules of section 4 that hide the atomic sections, show every band and stroke the
 * leaders, as an application layer until the default layer holds them.
 */
const SECTION_4: Graphical = {
  rules: [
    { select: { element: "band", facet: "regions", inside: "band" }, set: { display: "inline" } },
    {
      select: { element: "band", facet: "flow_control", inside: "band" },
      set: { display: "inline" },
    },
    { select: { element: "region", class: "tts:AtomicSection" }, set: { display: "none" } },
    {
      select: { element: "leader" },
      set: { stroke: "#9CA3AF", "stroke-width": 0.5, "stroke-dasharray": "none" },
    },
  ],
};

const ATOMIC = "https://timetoalign.github.io/timetoshare/ns#AtomicSection";

/** The `add` command of a region named `name` on `timeline`, from `start` to `end`. */
const region = (
  timeline: string,
  id: string,
  name: string,
  start: readonly [number, number],
  end: readonly [number, number],
): object => ({ type: "add", into: target(timeline), region: { id, name, start, end, meta: {} } });

const drawn = (manifest: Parameters<typeof draw>[0], ...extra: Graphical[]): Drawing =>
  draw(
    manifest,
    DEFAULT_PLACEMENT,
    [DEFAULT_LAYER, SECTION_4, ...extra, manifestLayer(manifest)],
    metrics,
  );

const ofType = <T extends DrawnElement>(drawing: Drawing, type: T["type"]): T[] =>
  drawing.elements.filter((element): element is T => element.type === type);

const labelAt = (drawing: Drawing, address: ElementAddress): TextElement => {
  const found = ofType<TextElement>(drawing, "label").find((label) =>
    sameAddress(label.address, address),
  );
  if (found === undefined) throw new Error("no label");
  return found;
};

describe("two adjacent regions whose labels conflict", () => {
  const manifest = build(
    "score",
    16,
    region("score", "region_1", "development", quarters(0), quarters(2)),
    region("score", "region_2", "recapitulation", quarters(2), quarters(3)),
  );
  const x0 = 53.798828125;
  const [Yb, Ya] = [53.37890625, 59.37890625];

  it("keeps both braces in row 1", () => {
    const braces = ofType<RegionElement>(drawn(manifest), "region");
    expect(
      braces.map((brace) => [brace.address, brace.x1, brace.x2, brace.xm, brace.yb, brace.ya]),
    ).toEqual([
      [at("region_1"), x0, x0 + 50, x0 + 25, Yb, Ya],
      [at("region_2"), x0 + 50, x0 + 75, x0 + 62.5, Yb, Ya],
    ]);
  });

  it("moves the second label to tier 2 and joins it by a leader", () => {
    const drawing = drawn(manifest);
    expect(labelAt(drawing, at("region_1", "label")).baseline).toBe(69.73291015625);
    expect(labelAt(drawing, at("region_2", "label")).baseline).toBe(80.20947265625);
    expect(61.37890625 + A9).toBe(69.73291015625);
    expect(61.37890625 + H9 + A9).toBe(80.20947265625);
    const leaders = ofType<LeaderElement>(drawing, "leader");
    expect(leaders.map(({ address, x1, y1, x2, y2 }) => [address, x1, y1, x2, y2])).toEqual([
      [at("region_2", "leader"), x0 + 62.5, Ya, x0 + 62.5, 71.85546875],
    ]);
    const [leader] = leaders;
    expect([
      leader?.style.stroke,
      leader?.style["stroke-width"],
      leader?.style["stroke-dasharray"],
    ]).toEqual(["#9CA3AF", 0.5, "none"]);
  });

  it("draws the leaders after the marker labels and before the region labels", () => {
    const order = drawn(manifest).elements.map((element) =>
      element.type === "label" ? element.address.part?.[0] : element.type,
    );
    const leader = order.indexOf("leader");
    expect(order.lastIndexOf("coordinate")).toBeLessThan(leader);
    expect(order.indexOf("label")).toBe(leader + 1);
  });

  it("hides the leader with its label, and the leader alone by its own rule", () => {
    const hiddenLabel = drawn(manifest, {
      rules: [
        {
          select: { addresses: [{ id: "region_2", part: ["label"] }] },
          set: { display: "none" },
        },
      ],
    });
    expect(ofType(hiddenLabel, "leader")).toEqual([]);
    expect(ofType<RegionElement>(hiddenLabel, "region").map((brace) => brace.yb)).toEqual([Yb, Yb]);
    const hiddenLeader = drawn(manifest, {
      rules: [{ select: { element: "leader" }, set: { display: "none" } }],
    });
    expect(ofType(hiddenLeader, "leader")).toEqual([]);
    expect(labelAt(hiddenLeader, at("region_2", "label")).baseline).toBe(80.20947265625);
  });
});

describe("a segment label in tier 2", () => {
  const manifest = edit(
    "segment_line",
    set("b1", { name: "development section" }),
    set("b2", { name: "recapitulation" }),
  );

  it("joins the label to its segment line by a leader", () => {
    const drawing = drawn(manifest);
    const first = labelAt(drawing, at("b1", "label"));
    const second = labelAt(drawing, at("b2", "label"));
    expect(second.baseline).toBe(first.baseline - H9);
    const leaders = ofType<LeaderElement>(drawing, "leader");
    expect(leaders.map((leader) => leader.address)).toEqual([at("b2", "leader")]);
    const [leader] = leaders;
    if (leader === undefined) throw new Error("no leader");
    const boundary = drawing.elements.find(
      (element) => element.type === "boundary" && sameAddress(element.address, at("b2", "start")),
    );
    expect([leader.x1, leader.x2]).toEqual([second.x, second.x]);
    expect(boundary?.type === "boundary" && boundary.y1).toBe(leader.y1);
    expect(leader.y1 - leader.y2).toBe(2 + H9);
    expect(leader.y2).toBe(second.baseline + D9);
  });
});

describe("Op. 106's regions and movements", () => {
  const typed = (
    timeline: string,
    id: string,
    name: string,
    start: [number, number],
    end: [number, number],
  ) => [region(timeline, id, name, start, end), set(id, { statements: { type: [ATOMIC] } })];
  const movement = (
    id: string,
    name: string,
    offset: number,
    length: readonly [number, number],
  ) => {
    const added = child("op106", id, offset, 1) as { readonly child: object };
    return [{ ...added, child: { ...added.child, length } }, set(id, { name })];
  };
  const manifest = build(
    "op106",
    1,
    set("op106", { length: quarters(15833, 4) }),
    ...movement("clt_2", "Allegro", 0, quarters(1644)),
    ...movement("clt_3", "Scherzo. Assai vivace", 1644, quarters(516)),
    ...movement("clt_4", "Adagio sostenuto", 2160, quarters(561)),
    ...movement("clt_5", "Introduzione. Largo – Allegro risoluto", 2721, quarters(4949, 4)),
    ...typed("clt_2", "region_1", "A", quarters(0), quarters(953, 2)),
    ...typed("clt_2", "region_2", "B", quarters(953, 2), quarters(500)),
    ...typed("clt_2", "region_3", "C", quarters(500), quarters(1644)),
    ...typed("clt_3", "region_4", "A", quarters(0), quarters(516)),
    ...typed("clt_4", "region_5", "A", quarters(0), quarters(561)),
    ...typed("clt_5", "region_6", "A", quarters(0), quarters(4949, 4)),
  );
  const shown: Graphical = {
    rules: [
      { select: { element: "region", class: "tts:AtomicSection" }, set: { display: "inline" } },
    ],
  };
  const movements = (drawing: Drawing) =>
    ofType<LineElement>(drawing, "child").map((line) => [line.address, line.y]);

  it("draws no atomic section by default, and the movements in one row", () => {
    const drawing = drawn(manifest);
    expect(ofType(drawing, "region")).toEqual([]);
    expect(ofType(drawing, "leader")).toEqual([]);
    expect(
      ofType<TextElement>(drawing, "label").filter((label) => label.address.part?.[0] === "label"),
    ).toEqual([]);
    const lines = movements(drawing);
    expect(lines.map(([address]) => address)).toEqual(
      ["clt_2", "clt_3", "clt_4", "clt_5"].map((id) => at(id)),
    );
    expect(new Set(lines.map(([, y]) => y)).size).toBe(1);
  });

  it("letters every atomic section in row 1, tier 1, without a leader, when shown", () => {
    const drawing = drawn(manifest, shown);
    const lines = movements(drawing);
    expect(new Set(lines.map(([, y]) => y)).size).toBe(1);
    const y = lines[0]?.[1] as number;
    const braces = ofType<RegionElement>(drawing, "region");
    expect(braces.map((brace) => [brace.address, brace.yb, brace.ya])).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => [at(`region_${n}`), y + 5.5, y + 5.5 + 6]),
    );
    const labels = ofType<TextElement>(drawing, "label").filter(
      (label) => label.address.part?.[0] === "label",
    );
    expect(labels.map((label) => [label.text, label.x, label.baseline])).toEqual(
      braces.map((brace, index) => ["ABCAAA".charAt(index), brace.xm, y + 5.5 + 6 + 2 + A9]),
    );
    expect(ofType(drawing, "leader")).toEqual([]);
  });

  it("names the movements' row once, cut at 160, and starts the root after it", () => {
    const drawing = drawn(manifest, shown);
    const names = ofType<TextElement>(drawing, "name");
    expect(names.map((name) => [name.address, name.text])).toEqual([
      [at("clt_2", "name"), "Allegro, Scherzo. Assai viv…"],
      [at("op106", "name"), "op106"],
    ]);
    expect(ofType<LineElement>(drawing, "timeline")[0]?.xs).toBe(16 + (29003 * 11) / 2048 + 8);
  });
});
