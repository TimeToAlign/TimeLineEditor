import { describe, expect, it } from "vitest";
import { drawingOf, memberOrderAt, reorderCommand, withMemberOrder } from "../src/index.ts";
import { A, blockIn, changed, metrics, mixedPlain, NUMBERS, viewOf } from "./support.ts";

const view = mixedPlain();
const block = blockIn(view, A);
const drawing = drawingOf(block, view.settings, metrics);

describe("memberOrderAt", () => {
  it.each([
    ["group_1", "score", 100, ["score", "performance"]],
    ["group_1", "score", 170, ["performance", "score"]],
    ["group_1", "score", 165.30078125, ["performance", "score"]],
    ["group_1", "performance", 50, ["performance", "score"]],
    ["group_1", "performance", 93.0859375, ["score", "performance"]],
    ["group_2", "page", 440, ["excerpt", "page"]],
  ] as const)("%s, %s dropped at %d", (group, dragged, y, order) => {
    expect(memberOrderAt(drawing, group, dragged, y)).toEqual(order);
  });

  it("refuses a group that is not drawn", () => {
    expect(() => memberOrderAt(drawing, "group_9", "score", 0)).toThrow(RangeError);
  });
});

describe("withMemberOrder", () => {
  it("previews the order, keeping everything else", () => {
    const manifest = withMemberOrder(block.manifest, "group_1", ["performance", "score"]);
    expect(manifest.graphical).toEqual({
      order: { group_1: ["performance", "score"], group_2: ["page", "excerpt"] },
      statements: [],
      styles: {},
    });
    expect(block.manifest.graphical?.order?.group_1).toEqual(["score", "performance"]);
    const cards = drawingOf(block, view.settings, metrics, { manifest }).elements.flatMap(
      (element) => (element.type === "card" ? [[element.address, element.y]] : []),
    );
    expect(cards.slice(0, 2)).toEqual([
      ["performance/card", 53.609375],
      ["score/card", 111.0859375],
    ]);
  });
});

describe("reorderCommand", () => {
  it("gives null for the displayed order and deletes an entry equal to the members", () => {
    expect(reorderCommand(block, "group_1", ["score", "performance"])).toBeNull();
    expect(reorderCommand(block, "group_1", ["performance", "score"])).toEqual({
      type: "set",
      changes: [{ target: `${A}/group_1`, values: { order: null } }],
    });
  });

  it("states any other order, and core stores it", () => {
    const numbers = viewOf({ id: A, fixture: NUMBERS });
    const group = blockIn(numbers, A);
    expect(reorderCommand(group, "group_1", ["score", "page", "performance"])).toBeNull();
    expect(reorderCommand(group, "group_1", ["page", "performance", "score"])).toEqual({
      type: "set",
      changes: [{ target: `${A}/group_1`, values: { order: null } }],
    });
    const command = reorderCommand(group, "group_1", ["performance", "score", "page"]);
    expect(command).toEqual({
      type: "set",
      changes: [{ target: `${A}/group_1`, values: { order: ["performance", "score", "page"] } }],
    });
    const after = changed(numbers, command);
    expect(blockIn(after, A).manifest.graphical?.order?.group_1).toEqual([
      "performance",
      "score",
      "page",
    ]);
  });
});
