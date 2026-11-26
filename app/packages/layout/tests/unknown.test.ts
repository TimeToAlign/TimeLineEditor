/** Timelines of unknown length: the reach, the five end rules, the open end; derived in tests/README.md. */

import { type Manifest, sameAddress } from "@timetoalign/tilie-core";
import { reachOf } from "@timetoalign/tilie-core/drawing";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  type JumpElement,
  type LineElement,
  manifestLayer,
} from "../src/index.ts";
import {
  ARCS_ALONE,
  at,
  CHILD_REGIONS_HIDDEN,
  child,
  drawFixture,
  edit,
  edited,
  element,
  flowControlAt,
  HIDDEN_ANCESTOR_CARDS,
  load,
  loadFile,
  metrics,
  quarters,
  rootOf,
  set,
  target,
} from "./support.ts";

/**
 * A manifest drawn without its ancestor cards (section 8.8), the subject being its ancestor lines,
 * and with the arcs of its jumps alone (`ARCS_ALONE`), which reach as far as their places.
 */
const drawn = (manifest: Manifest): Drawing =>
  draw(
    manifest,
    DEFAULT_PLACEMENT,
    [DEFAULT_LAYER, HIDDEN_ANCESTOR_CARDS, ARCS_ALONE, manifestLayer(manifest)],
    metrics,
  );

/** The start, the end and how it ends of the line of the timeline `id`. */
function line(drawing: Drawing, id: string): Pick<LineElement, "xs" | "xe" | "end"> {
  const found = element(drawing, at(id));
  if (found.type !== "timeline" && found.type !== "child" && found.type !== "ancestor") {
    throw new Error(`${id} is no line`);
  }
  return { xs: found.xs, xe: found.xe, end: found.end };
}

const addresses = (drawing: Drawing, type: DrawnElement["type"]) =>
  drawing.elements.filter((item) => item.type === type).map((item) => item.address);
const texts = (drawing: Drawing) =>
  drawing.elements.flatMap((item) => (item.type === "label" ? [item.text] : []));
const ordinate = (drawing: Drawing, id: string): number => {
  const found = element(drawing, at(id));
  if (found.type !== "child") throw new Error(`${id} is no child line`);
  return found.y;
};

describe("a root of unknown length", () => {
  it("walks a timeline only once for one reach memo", () => {
    const manifest = load("unknown_length");
    const timeline = manifest.timelines[0];
    if (timeline === undefined) throw new Error("unknown_length has no root");
    let childReads = 0;
    const counted = new Proxy(timeline, {
      get(target, property, receiver) {
        if (property === "children") childReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const reaches = new WeakMap();
    const first = reachOf(counted, manifest, reaches);
    expect(reachOf(counted, manifest, reaches)).toBe(first);
    expect(childReads).toBe(1);
  });

  it("is scaled to its reach, the child's end beyond the region and the marker", () => {
    const drawing = drawFixture("unknown_length");
    expect(line(drawing, "score")).toEqual({
      xs: 53.798828125,
      xe: 465.798828125,
      end: "unknown",
    });
    expect(line(drawing, "coda")).toEqual({
      xs: 339.5131138392857,
      xe: 453.798828125,
      end: "diamond",
    });
  });

  it("has its origin's wedge and the label 0 only, and the outer chevron's tip sets the block", () => {
    const drawing = drawFixture("unknown_length");
    expect(addresses(drawing, "wedge")).toEqual([at("timestamp_1")]);
    expect(texts(drawing)).toEqual(["0 ♩"]);
    // A root of unknown length has no `length` timestamp.
    const end = [at("timestamp_2"), at("timestamp_2", "coordinate")];
    expect(
      drawing.elements.some((item) => end.some((address) => sameAddress(item.address, address))),
    ).toBe(false);
    expect(drawing.width).toBe(500.298828125);
  });

  it("is drawn L long with no content, its reach 0", () => {
    expect(line(drawFixture("unknown_length_empty"), "score")).toEqual({
      xs: 53.798828125,
      xe: 465.798828125,
      end: "unknown",
    });
  });

  it("ends in three chevrons when locked, never in the circle", () => {
    const drawing = drawFixture("unknown_length_locked");
    expect(line(drawing, "score")).toEqual({
      xs: 53.798828125,
      xe: 465.798828125,
      end: "unknown",
    });
    expect(line(drawing, "coda").xs).toBe(353.798828125);
  });

  it("counts every flow-control coordinate in its reach, a jump target's too, and no measure map", () => {
    const MS3 = "corpus_score_ms3";
    const root = rootOf(MS3).id;
    const children = {
      type: "remove",
      targets: rootOf(MS3).children.map((item) => target(item.id)),
    };
    // The fixture states the lock its loader set: the reach is read on the unlocked timeline,
    // whose length a command sets and whose known end is an arrowhead.
    const unlocked = set(root, { locked: false });
    // The flow-control element of `role` at the quarter `quarter`, its loader minting its ID.
    const flowAt = (role: string, quarter: number) => flowControlAt(MS3, role, quarter);
    // A flow-control element is never removed: the manifest is given without the elements after
    // 30 but the jump target at 34, and its Fine without the condition that names the last jump.
    const corpus = loadFile(MS3);
    const dropped = new Set([
      flowAt("jump", 32),
      flowAt("break", 34),
      flowAt("jump", 34),
      flowAt("jump", 37),
    ]);
    const toTheTarget: Manifest = {
      ...corpus,
      timelines: corpus.timelines.map((item) => ({
        ...item,
        flow_control: item.flow_control
          .filter((each) => !dropped.has(each.id))
          .map(({ ends: _, ...each }) => each),
      })),
    };
    const flow = (drawing: Drawing) =>
      drawing.elements.filter((item) => item.type === "break" || item.type === "jump");
    const known = drawn(edit(MS3, children, unlocked));
    const unknown = drawn(edit(MS3, children, unlocked, set(root, { length: null })));
    expect(flow(unknown)).toEqual(flow(known));
    // The breaks by their quarters, then the jumps in their placement order of `placement.test.ts`.
    expect(flow(unknown).map((item) => item.address)).toEqual(
      [9, 10, 12, 34]
        .map((quarter) => flowAt("break", quarter))
        .concat([9, 24, 6, 20, 28, 30, 16, 34, 37].map((quarter) => flowAt("jump", quarter)))
        .map((id) => at(id)),
    );
    const x0 = line(known, root).xs;
    expect(line(known, root)).toEqual({ xs: x0, xe: x0 + 400, end: "arrowhead" });
    expect(line(unknown, root)).toEqual({ xs: x0, xe: x0 + 400 + 12, end: "unknown" });
    // Without them the farthest coordinate is the jump target at 34, which draws nothing; the
    // measure map's rows, reaching past it, are no content.
    const at34 = drawn(edited(toTheTarget, children, unlocked, set(root, { length: [34, 1] })));
    const open = drawn(edited(toTheTarget, children, unlocked, set(root, { length: null })));
    expect(flow(open)).toEqual(flow(at34));
    expect(flow(open)).not.toEqual(flow(unknown));
  });

  it("counts the place a destination reaches by its `by`, so the arc ends on the line", () => {
    // `unknown_length` reaches 14, the end of `coda`; a jump at 4 going on by 16 lands at 20.
    const manifest = edit("unknown_length", {
      type: "add",
      into: target("score"),
      flow_control: {
        id: "far",
        role: "jump",
        coordinate: quarters(4),
        targets: [{ by: quarters(16) }, { by: quarters(-4) }],
      },
    });
    const [root] = manifest.timelines;
    if (root === undefined) throw new Error("unknown_length has no root");
    expect(reachOf(root, manifest)).toEqual(Rational.of(20n));
    const drawing = drawn(manifest);
    const xs = 53.798828125;
    expect(line(drawing, "score")).toEqual({ xs, xe: xs + 400 + 12, end: "unknown" });
    expect(line(drawing, "coda")).toEqual({ xs: xs + 200, xe: xs + 280, end: "diamond" });
    expect(
      drawing.elements
        .filter((item): item is JumpElement => item.type === "jump")
        .map((item) => [item.start[0], item.tip[0]]),
    ).toEqual([
      [xs + 80, xs],
      [xs + 80, xs + 400],
    ]);
  });
});

describe("a child of unknown length in a known parent", () => {
  it("ends at its offset plus its reach, open, and the root keeps its arrowhead", () => {
    const drawing = drawFixture("unknown_length_child");
    expect(line(drawing, "movement")).toEqual({
      xs: 183.490234375,
      xe: 270.490234375,
      end: "unknown",
    });
    expect(line(drawing, "score")).toEqual({
      xs: 83.490234375,
      xe: 483.490234375,
      end: "arrowhead",
    });
    expect(addresses(drawing, "wedge")).toEqual([at("timestamp_1"), at("timestamp_2")]);
  });

  it("takes room for its three chevrons in its row: 9.5w past its end", () => {
    const briefAt = (offset: number) =>
      drawn(edit("unknown_length_child", child("score", "brief", offset, 2)));
    const meeting = briefAt(15);
    expect(ordinate(meeting, "brief")).toBe(ordinate(meeting, "movement") - 14);
    // Within the outer chevron (203.5), past the inner two (199).
    const outer = briefAt(16);
    expect(ordinate(outer, "brief")).toBe(ordinate(outer, "movement") - 14);
    const past = briefAt(17);
    expect(ordinate(past, "brief")).toBe(ordinate(past, "movement"));
  });
});

describe("a group member of unknown length", () => {
  it("is drawn with its reach at the shared end, running on into three chevrons", () => {
    const drawing = drawFixture("groups/group_unknown_length");
    const region = element(drawing, at("region_1"));
    if (region.type !== "region") throw new Error("no region");
    expect([region.x1, region.x2]).toEqual([102.640625, 502.640625]);
    expect(line(drawing, "performance")).toEqual({
      xs: 102.640625,
      xe: 514.640625,
      end: "unknown",
    });
    expect(line(drawing, "score")).toEqual({
      xs: 102.640625,
      xe: 502.640625,
      end: "arrowhead",
    });
  });
});

describe("a segment line whose segments are of unknown length", () => {
  it("reaches the last segment's offset plus its own reach", () => {
    // The regions band of a segment without a line of its own, hidden by a rule, adds nothing;
    // shown, as the defaults show it, its regions join the segment line's regions band.
    expect(
      addresses(drawFixture("unknown_length_segments", [CHILD_REGIONS_HIDDEN]), "region"),
    ).toEqual([]);
    const drawing = drawFixture("unknown_length_segments");
    const region = element(drawing, at("region_2"));
    if (region.type !== "region") throw new Error("no region");
    expect([region.x1, region.x2]).toEqual([379.2520967371323, 449.84033203125]);
    expect(
      [at("b", "start"), at("c", "start")].map((address) => {
        const boundary = element(drawing, address);
        return boundary.type === "boundary" ? boundary.x : undefined;
      }),
    ).toEqual([238.07562614889704, 379.2520967371323]);
    expect(line(drawing, "form")).toEqual({
      xs: 49.84033203125,
      xe: 461.84033203125,
      end: "unknown",
    });
  });

  it("ends a segment at the next one's start, and the last at its segment line's end", () => {
    const drawing = drawn(
      edit(
        "unknown_length_segments",
        set("a", { name: "A" }),
        set("b", { name: "B" }),
        set("c", { name: "C" }),
      ),
    );
    expect(
      drawing.elements.flatMap((item) =>
        // The segments' labels, each with the part word `label`.
        item.type === "label" && item.address.part?.[0] === "label" ? [[item.address, item.x]] : [],
      ),
    ).toEqual([
      [at("a", "label"), 143.95797909007354],
      [at("b", "label"), 308.6638614430147],
      [at("c", "label"), 414.54621438419116],
    ]);
  });
});

describe("ancestor lines and unknown lengths", () => {
  it("run on to the right when the member's length is not known", () => {
    const drawing = drawn(
      edit(
        "groups/group_child_member",
        set("second-half", { locked: false }),
        set("second-half", { length: null }),
        set("second-half", { locked: true }),
        {
          type: "add",
          into: target("second-half"),
          region: { id: "region_1", name: null, start: quarters(0), end: quarters(8), meta: {} },
        },
      ),
    );
    const x0 = line(drawing, "second-half").xs;
    // The member's own unknown length in three chevrons, the ancestor running on in two.
    expect(line(drawing, "second-half")).toEqual({
      xs: x0,
      xe: x0 + 400 + 12,
      end: "unknown",
    });
    expect(line(drawing, "piece")).toEqual({ xs: x0 - 12, xe: x0 + 400 + 12, end: "chevrons" });
    // No ancestor line marks the member: its start is its own `origin`, on its own line.
    expect(addresses(drawing, "wedge").filter((item) => item.id === "second-half")).toEqual([]);
    expect(
      drawing.elements.flatMap((item) =>
        item.type === "label" && sameAddress(item.address, at("timestamp_3", "coordinate"))
          ? [item.text]
          : [],
      ),
    ).toEqual(["0 ♩"]);
  });

  it("run on to the right when the ancestor's length is not known", () => {
    const drawing = drawn(edit("groups/group_child_member", set("piece", { length: null })));
    const x0 = line(drawing, "second-half").xs;
    expect(line(drawing, "piece")).toEqual({ xs: x0 - 12, xe: x0 + 400 + 12, end: "chevrons" });
  });

  it("end short of the member's end, with their own end, where a timeline between has no length", () => {
    const drawing = drawn(
      edit(
        "groups/group_grandchild",
        set("movement", { locked: false }),
        set("movement", { length: null }),
        set("movement", { locked: true }),
        set("score", { length: quarters(28) }),
      ),
    );
    const x0 = line(drawing, "theme").xs;
    expect(line(drawing, "score")).toEqual({ xs: x0 - 12, xe: x0 + 200, end: "arrowhead" });
    expect(line(drawing, "movement")).toEqual({
      xs: x0 - 12,
      xe: x0 + 400 + 12,
      end: "chevrons",
    });
  });
});
