/** Timelines of unknown length: the reach, the five end rules, the open end; derived in tests/README.md. */

import type { Manifest } from "@timetoalign/tilie-core";
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
import { BLOCK, child, drawFixture, edit, element, metrics, quarters, set } from "./support.ts";

const drawn = (manifest: Manifest): Drawing =>
  draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, manifestLayer(manifest)], metrics);

/** A line's start, its end and how it ends. */
function line(drawing: Drawing, address: string): Pick<LineElement, "xs" | "xe" | "end"> {
  const found = element(drawing, address);
  if (found.type !== "timeline" && found.type !== "child" && found.type !== "ancestor") {
    throw new Error(`${address} is no line`);
  }
  return { xs: found.xs, xe: found.xe, end: found.end };
}

const addresses = (drawing: Drawing, type: DrawnElement["type"]) =>
  drawing.elements.filter((item) => item.type === type).map((item) => item.address);
const texts = (drawing: Drawing) =>
  drawing.elements.flatMap((item) => (item.type === "label" ? [item.text] : []));
const ordinate = (drawing: Drawing, address: string): number => {
  const found = element(drawing, address);
  if (found.type !== "child") throw new Error(`${address} is no child line`);
  return found.y;
};

describe("a root of unknown length", () => {
  it("is scaled to its reach, the child's end beyond the region and the marker", () => {
    const drawing = drawFixture("unknown_length");
    expect(line(drawing, "score")).toEqual({
      xs: 53.798828125,
      xe: 465.798828125,
      end: "chevrons",
    });
    expect(line(drawing, "coda")).toEqual({
      xs: 339.5131138392857,
      xe: 453.798828125,
      end: "diamond",
    });
  });

  it("has its start wedge and the label 0 only, and the chevron tip sets the box", () => {
    const drawing = drawFixture("unknown_length");
    expect(addresses(drawing, "wedge")).toEqual(["score/start"]);
    expect(texts(drawing)).toEqual(["0 ♩"]);
    expect(drawing.elements.some((item) => item.address?.startsWith("score/end"))).toBe(false);
    expect(drawing.width).toBe(495.798828125);
  });

  it("is drawn L long with no content, its reach 0", () => {
    expect(line(drawFixture("unknown_length_empty"), "score")).toEqual({
      xs: 53.798828125,
      xe: 465.798828125,
      end: "chevrons",
    });
  });

  it("ends in chevrons when locked, never in the circle", () => {
    const drawing = drawFixture("unknown_length_locked");
    expect(line(drawing, "score")).toEqual({
      xs: 53.798828125,
      xe: 465.798828125,
      end: "chevrons",
    });
    expect(line(drawing, "coda").xs).toBe(353.798828125);
  });

  it("counts the measure map's last row in its reach", () => {
    const removed = {
      type: "remove",
      targets: [`${BLOCK}/clt_2`, `${BLOCK}/clt_3`, `${BLOCK}/clt_1/jump_4`],
    };
    const known = drawn(edit("corpus_score_ms3", removed));
    const unknown = drawn(edit("corpus_score_ms3", removed, set("clt_1", { length: null })));
    const flow = (drawing: Drawing) =>
      drawing.elements.filter((item) => item.type === "break" || item.type === "jump");
    expect(flow(unknown)).toEqual(flow(known));
    expect(flow(unknown).map((item) => item.address)).toEqual([
      "clt_1/break_1",
      "clt_1/jump_2",
      "clt_1/jump_1",
      "clt_1/jump_3",
    ]);
    const x0 = line(known, "clt_1").xs;
    expect(line(known, "clt_1")).toEqual({ xs: x0, xe: x0 + 400, end: "arrowhead" });
    expect(line(unknown, "clt_1")).toEqual({ xs: x0, xe: x0 + 400 + 12, end: "chevrons" });
  });
});

describe("a child of unknown length in a known parent", () => {
  it("ends at its offset plus its reach, open, and the root keeps its arrowhead", () => {
    const drawing = drawFixture("unknown_length_child");
    expect(line(drawing, "movement")).toEqual({
      xs: 183.490234375,
      xe: 270.490234375,
      end: "chevrons",
    });
    expect(line(drawing, "score")).toEqual({
      xs: 83.490234375,
      xe: 483.490234375,
      end: "arrowhead",
    });
    expect(addresses(drawing, "wedge")).toEqual(["score/start", "score/end"]);
  });

  it("takes room for its chevrons in its row: 8w past its end", () => {
    const at = (offset: number) =>
      drawn(edit("unknown_length_child", child("score", "brief", offset, 2)));
    const meeting = at(15);
    expect(ordinate(meeting, "brief")).toBe(ordinate(meeting, "movement") - 14);
    const past = at(16);
    expect(ordinate(past, "brief")).toBe(ordinate(past, "movement"));
  });
});

describe("a group member of unknown length", () => {
  it("is drawn with its reach at the shared end, running on into chevrons", () => {
    const drawing = drawFixture("groups/group_unknown_length");
    const region = element(drawing, "performance/region_1");
    if (region.type !== "region") throw new Error("no region");
    expect([region.x1, region.x2]).toEqual([102.640625, 502.640625]);
    expect(line(drawing, "performance")).toEqual({
      xs: 102.640625,
      xe: 514.640625,
      end: "chevrons",
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
    const drawing = drawFixture("unknown_length_segments");
    const region = element(drawing, "form/region_2");
    if (region.type !== "region") throw new Error("no region");
    expect([region.x1, region.x2]).toEqual([379.2520967371323, 449.84033203125]);
    expect(
      ["b/start", "c/start"].map((address) => {
        const boundary = element(drawing, address);
        return boundary.type === "boundary" ? boundary.x : undefined;
      }),
    ).toEqual([238.07562614889704, 379.2520967371323]);
    expect(line(drawing, "form")).toEqual({
      xs: 49.84033203125,
      xe: 461.84033203125,
      end: "chevrons",
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
        item.type === "label" && item.address.length === 7 ? [[item.address, item.x]] : [],
      ),
    ).toEqual([
      ["a/label", 143.95797909007354],
      ["b/label", 308.6638614430147],
      ["c/label", 414.54621438419116],
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
          into: `${BLOCK}/second-half`,
          region: { id: "region_1", name: null, start: quarters(0), end: quarters(8), meta: {} },
        },
      ),
    );
    const x0 = line(drawing, "second-half").xs;
    expect(line(drawing, "second-half")).toEqual({
      xs: x0,
      xe: x0 + 400 + 12,
      end: "chevrons",
    });
    expect(line(drawing, "piece")).toEqual({ xs: x0 - 12, xe: x0 + 400 + 12, end: "chevrons" });
    expect(addresses(drawing, "wedge").filter((item) => item?.startsWith("second-half"))).toEqual([
      "second-half/start",
      "second-half/start",
    ]);
    const marks = drawing.elements.filter(
      (item) => item.type === "label" && item.address === "second-half/start/label",
    );
    expect(marks.map((item) => (item.type === "label" ? item.text : ""))).toEqual(["8 ♩", "0 ♩"]);
  });

  it("run on to the right when the ancestor's length is not known", () => {
    const drawing = drawn(edit("groups/group_child_member", set("piece", { length: null })));
    const x0 = line(drawing, "second-half").xs;
    expect(line(drawing, "piece")).toEqual({ xs: x0 - 12, xe: x0 + 400 + 12, end: "chevrons" });
    const markLabels = drawing.elements.flatMap((item) =>
      item.type === "label" && /^second-half\/(start|end)\/label$/.test(item.address)
        ? [[item.address, item.text]]
        : [],
    );
    expect(markLabels.slice(0, 2)).toEqual([
      ["second-half/start/label", "8 ♩"],
      ["second-half/end/label", "16 ♩"],
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
