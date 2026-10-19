import type { View } from "@timetoalign/tilie-core";
import { apply, createView, manifestIds } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { removeCommand } from "../src/commands.ts";
import { A, blockIn, changed, loadUnlocked, viewOf } from "./support.ts";

const at = (element: string) => `${A}/${element}`;
const segmentChildren = () => viewOf({ id: A, fixture: "segment_children" });

/** `segment_children` with its segment line `theme` unlocked in the file. */
function themeUnlocked(): View {
  const manifest = loadUnlocked("segment_children", "theme");
  return changed(createView(), {
    type: "add",
    into: "workspace",
    block: { id: A, manifest, x: 0, y: 0 },
  });
}

describe("removeCommand of a segment", () => {
  /** What core answers the remove of `addresses` in `view`: the arranger leaves the segment rule to it. */
  const answer = (view: View, ...addresses: string[]) => {
    const command = removeCommand(view, new Set(addresses));
    if ("refused" in command) throw new Error(command.refused);
    return apply(view, command);
  };
  /** Core's refusal of the segment `segment` of `theme`. */
  const refusal = (segment: string) => ({
    code: "segment_not_removable",
    message: `Removing segment ${segment} of line theme is not supported yet`,
    path: [at(segment)],
  });

  it("dispatches a segment that leaves a gap, which core refuses, whatever ways would close it", () => {
    expect(removeCommand(segmentChildren(), new Set([at("t2/label")]))).toEqual({
      type: "remove",
      targets: [at("t2")],
    });
    expect(answer(segmentChildren(), at("t2/label"))).toEqual(refusal("t2"));
    expect(answer(themeUnlocked(), at("t2"))).toEqual(refusal("t2"));
  });

  it("dispatches a segment with anything it does not go with, which core refuses whole", () => {
    const view = themeUnlocked();
    expect(answer(view, at("t2"), at("t3"))).toEqual(refusal("t2"));
    expect(answer(view, at("t2"), at("coda/name"))).toEqual(refusal("t2"));
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
});
