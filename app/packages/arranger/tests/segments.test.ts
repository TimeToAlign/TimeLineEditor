import type { Gap, View } from "@timetoalign/tilie-core";
import { manifestIds } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { movedByGap } from "../src/affected.ts";
import { preferredGap, removeCommand } from "../src/commands.ts";
import { descriptorsOf, drawingOf, segmentAnchor } from "../src/drawing.ts";
import { project } from "../src/project.ts";
import { A, blockIn, changed, metrics, viewOf } from "./support.ts";

const LEFT_EXTEND: Gap = { side: "left", verb: "extend" };
const RIGHT_EXTEND: Gap = { side: "right", verb: "extend" };
const LEFT_SHIFT: Gap = { side: "left", verb: "shift" };
const RIGHT_SHIFT: Gap = { side: "right", verb: "shift" };

const at = (element: string) => `${A}/${element}`;
const segmentChildren = () => viewOf({ id: A, fixture: "segment_children" });

/** `segment_children` with its segment line `theme` unlocked. */
function themeUnlocked(): View {
  return changed(segmentChildren(), {
    type: "set",
    changes: [{ target: at("theme"), values: { locked: false } }],
  });
}

describe("removeCommand of a segment", () => {
  it("refuses a segment whose gap no way closes", () => {
    expect(removeCommand(segmentChildren(), new Set([at("t2/label")]))).toEqual({
      refused:
        "Segment t2 cannot be deleted: no neighbour may extend and its segment line may not shift.",
    });
  });

  it("gives the segment and the ways of closing its gap", () => {
    expect(removeCommand(themeUnlocked(), new Set([at("t2/label")]))).toEqual({
      segment: at("t2"),
      options: [
        { gap: LEFT_EXTEND, refused: "the preceding segment t1 is locked" },
        { gap: RIGHT_EXTEND, refused: "the following segment t3 is locked" },
        { gap: LEFT_SHIFT, refused: null },
        { gap: RIGHT_SHIFT, refused: null },
      ],
    });
  });

  it("removes the segment closing its gap as chosen", () => {
    const view = themeUnlocked();
    const command = removeCommand(view, new Set([at("t2")]), RIGHT_SHIFT);
    expect(command).toEqual({ type: "remove", targets: [at("t2")], gap: RIGHT_SHIFT });
    const theme = blockIn(changed(view, command), A).manifest.timelines[0]?.children.find(
      (child) => child.id === "theme",
    );
    expect(theme?.children.map((child) => child.id)).toEqual(["t1", "t3"]);
  });

  it("deletes one segment at a time", () => {
    const view = themeUnlocked();
    const refused = { refused: "Delete one segment at a time." };
    expect(removeCommand(view, new Set([at("t2"), at("t3")]))).toEqual(refused);
    expect(removeCommand(view, new Set([at("t2"), at("coda/name")]))).toEqual(refused);
  });

  it("asks nothing of a segment that goes with another target", () => {
    const view = themeUnlocked();
    const withLine = removeCommand(view, new Set([at("theme"), at("t2")]));
    expect(withLine).toEqual({ type: "remove", targets: [at("theme"), at("t2")] });
    const after = manifestIds(blockIn(changed(view, withLine), A).manifest);
    expect(["theme", "t1", "t2", "t3"].filter((id) => after.has(id))).toEqual([]);
    expect(removeCommand(view, new Set([A, at("t2")]))).toEqual({
      type: "remove",
      targets: [A, at("t2")],
    });
  });

  it("preselects the first permitted way", () => {
    const asked = removeCommand(themeUnlocked(), new Set([at("t2")]));
    if (!("segment" in asked)) throw new Error("expected the segment's ways");
    expect(preferredGap(asked.options)).toEqual(LEFT_SHIFT);
    expect(preferredGap(asked.options.map((option) => ({ ...option, refused: "no" })))).toBeNull();
  });
});

describe("movedByGap", () => {
  it("names what each way moves or resizes, with its parts", () => {
    const { manifest } = blockIn(themeUnlocked(), A);
    expect(movedByGap(manifest, "t2", LEFT_SHIFT)).toEqual(
      new Set(["theme", "theme/name", "t1", "t1/label"]),
    );
    expect(movedByGap(manifest, "t2", RIGHT_SHIFT)).toEqual(
      new Set(["theme", "theme/name", "t3", "t3/start", "t3/label"]),
    );
    expect(movedByGap(manifest, "t2", LEFT_EXTEND)).toEqual(new Set());
    const line = blockIn(viewOf({ id: A, fixture: "segment_line" }), A).manifest;
    expect(movedByGap(line, "b", RIGHT_SHIFT)).toEqual(
      new Set([
        "form/card",
        "form",
        "form/name",
        "form/start",
        "form/start/label",
        "form/end",
        "form/end/label",
        "c",
        "c/start",
        "c/label",
        "c1",
        "c1/label",
      ]),
    );
  });
});

describe("segmentAnchor", () => {
  it("is the segment's label, and nothing for a timeline drawn without one", () => {
    const view = themeUnlocked();
    const drawing = drawingOf(blockIn(view, A), view.settings, metrics);
    const label = descriptorsOf(drawing).find(
      (descriptor) =>
        descriptor.tag === "text" &&
        descriptor.attrs.some(([name, value]) => name === "data-address" && value === "t2/label"),
    );
    const attribute = (name: string) => label?.attrs.find(([key]) => key === name)?.[1];
    expect(segmentAnchor(drawing, "t2")).toEqual({ x: attribute("x"), y: attribute("y") });
    expect(segmentAnchor(drawing, "piece")).toBeNull();
  });
});

describe("the Delete preview in the projection", () => {
  it("marks what closing the gap moves, and reuses a node while that is unchanged", () => {
    const view = themeUnlocked();
    const selection = new Set([at("t2")]);
    const { manifest } = blockIn(view, A);
    const plain = project(view, selection, [], metrics);
    expect(plain[0]?.data.movedElements).toEqual(new Set());
    const preview = { segment: at("t2"), gap: RIGHT_SHIFT };
    const first = project(view, selection, plain, metrics, preview);
    expect(first[0]?.data.movedElements).toEqual(movedByGap(manifest, "t2", RIGHT_SHIFT));
    expect(project(view, selection, first, metrics, preview)[0]).toBe(first[0]);
    const other = project(view, selection, first, metrics, { ...preview, gap: LEFT_SHIFT });
    expect(other[0]).not.toBe(first[0]);
    expect(other[0]?.data.movedElements).toEqual(movedByGap(manifest, "t2", LEFT_SHIFT));
  });
});
