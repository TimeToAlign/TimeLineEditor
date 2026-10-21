/** Timelines of unknown length: the reach, the five end rules, the open end; derived in tests/README.md. */

import { type Manifest, sameAddress } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  type LineElement,
  manifestLayer,
} from "../src/index.ts";
import { reachOf } from "../src/numbers.ts";
import {
  at,
  child,
  drawFixture,
  edit,
  element,
  load,
  metrics,
  quarters,
  set,
  target,
} from "./support.ts";

const drawn = (manifest: Manifest): Drawing =>
  draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, manifestLayer(manifest)], metrics);

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
    const timeline = load("unknown_length").timelines[0];
    if (timeline === undefined) throw new Error("unknown_length has no root");
    let childReads = 0;
    const counted = new Proxy(timeline, {
      get(target, property, receiver) {
        if (property === "children") childReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const reaches = new WeakMap();
    const first = reachOf(counted, reaches);
    expect(reachOf(counted, reaches)).toBe(first);
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

  it("has its start wedge and the label 0 only, and the outer chevron's tip sets the block", () => {
    const drawing = drawFixture("unknown_length");
    expect(addresses(drawing, "wedge")).toEqual([at("score", "start")]);
    expect(texts(drawing)).toEqual(["0 ♩"]);
    const end = [at("score", "end"), at("score", "end", "label")];
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
    const children = { type: "remove", targets: [target("clt_2"), target("clt_3")] };
    const lastJump = { type: "remove", targets: [target("jump_from_4")] };
    const flow = (drawing: Drawing) =>
      drawing.elements.filter((item) => item.type === "flow_marker" || item.type === "jump_from");
    const known = drawn(edit("corpus_score_ms3", children));
    const unknown = drawn(edit("corpus_score_ms3", children, set("clt_1", { length: null })));
    expect(flow(unknown)).toEqual(flow(known));
    expect(flow(unknown).map((item) => item.address)).toEqual([
      at("flow_marker_1"),
      at("jump_from_2"),
      at("jump_from_1"),
      at("jump_from_3"),
      at("jump_from_4"),
    ]);
    const x0 = line(known, "clt_1").xs;
    expect(line(known, "clt_1")).toEqual({ xs: x0, xe: x0 + 400, end: "arrowhead" });
    expect(line(unknown, "clt_1")).toEqual({ xs: x0, xe: x0 + 400 + 12, end: "unknown" });
    // Without `jump_from_4` (at 37) the farthest coordinate is the jump target `jump_to_2` at 30,
    // which draws nothing; the measure map's rows, reaching past it, are no content.
    const at30 = drawn(
      edit("corpus_score_ms3", children, lastJump, set("clt_1", { length: [30, 1] })),
    );
    const open = drawn(
      edit("corpus_score_ms3", children, lastJump, set("clt_1", { length: null })),
    );
    expect(flow(open)).toEqual(flow(at30));
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
    expect(addresses(drawing, "wedge")).toEqual([at("score", "start"), at("score", "end")]);
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
    // The defaults hide the regions band of a segment without a line of its own; shown, its
    // regions join the segment line's regions band.
    expect(addresses(drawFixture("unknown_length_segments"), "region")).toEqual([]);
    const drawing = drawFixture("unknown_length_segments", [
      {
        statements: [{ select: { element: "band", facet: "regions" }, set: { display: "inline" } }],
      },
    ]);
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
        // The segments' labels, each with the one part word `label`.
        item.type === "label" && item.address.part?.length === 1 ? [[item.address, item.x]] : [],
      ),
    ).toEqual([
      [at("a", "label"), 143.95797909007354],
      [at("b", "label"), 308.6638614430147],
      [at("c", "label"), 414.54621438419116],
    ]);
  });
});

describe("ancestor lines and unknown lengths", () => {
  it("run on to the right when the member's length is not known, marking its start only", () => {
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
    expect(addresses(drawing, "wedge").filter((item) => item.id === "second-half")).toEqual([
      at("second-half", "start"),
      at("second-half", "start"),
    ]);
    const marks = drawing.elements.filter(
      (item) =>
        item.type === "label" && sameAddress(item.address, at("second-half", "start", "label")),
    );
    expect(marks.map((item) => (item.type === "label" ? item.text : ""))).toEqual(["8 ♩", "0 ♩"]);
  });

  it("run on to the right when the ancestor's length is not known", () => {
    const drawing = drawn(edit("groups/group_child_member", set("piece", { length: null })));
    const x0 = line(drawing, "second-half").xs;
    expect(line(drawing, "piece")).toEqual({ xs: x0 - 12, xe: x0 + 400 + 12, end: "chevrons" });
    const ends = [at("second-half", "start", "label"), at("second-half", "end", "label")];
    const markLabels = drawing.elements.flatMap((item) =>
      item.type === "label" && ends.some((address) => sameAddress(item.address, address))
        ? [[item.address, item.text]]
        : [],
    );
    expect(markLabels.slice(0, 2)).toEqual([
      [at("second-half", "start", "label"), "8 ♩"],
      [at("second-half", "end", "label"), "16 ♩"],
    ]);
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
