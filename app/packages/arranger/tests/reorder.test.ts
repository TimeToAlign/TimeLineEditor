import type { View } from "@timetoalign/tilie-core";
import { isCommandError, preview } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { drawingOf } from "../src/drawing.ts";
import { releaseMotion } from "../src/gestures/held.ts";
import { memberOrderAt, reorderCommand } from "../src/reorder.ts";
import {
  A,
  blockIn,
  CHILD_MEMBER,
  changed,
  metrics,
  mixedPlain,
  NUMBERS,
  viewOf,
} from "./support.ts";

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

  describe("with the frame hidden", () => {
    const shown = viewOf({ id: A, fixture: CHILD_MEMBER });
    const hidden = changed(shown, {
      type: "set",
      changes: [
        {
          target: "workspace",
          values: {
            graphical: {
              statements: [{ select: { element: "group" }, set: { display: "none" } }],
            },
          },
        },
      ],
    });
    const drawn = (of: View) => drawingOf(blockIn(of, A), of.settings, metrics);

    it("draws no frame", () => {
      expect(drawn(hidden).elements.filter((element) => element.type === "group")).toEqual([]);
    });

    it.each([
      ["second-half", 100, ["second-half", "recording"]],
      ["second-half", 160, ["recording", "second-half"]],
      ["recording", 50, ["recording", "second-half"]],
    ] as const)("orders %s dropped at %d as with the frame displayed", (dragged, y, order) => {
      expect(memberOrderAt(drawn(hidden), "group_1", dragged, y)).toEqual(order);
      expect(memberOrderAt(drawn(shown), "group_1", dragged, y)).toEqual(order);
    });
  });

  it("refuses a group that is not drawn", () => {
    expect(() => memberOrderAt(drawing, "group_9", "score", 0)).toThrow(RangeError);
  });
});

describe("a reorder's preview", () => {
  it("is the command applied: the cards drawn in the dropped order, everything else kept", () => {
    const command = reorderCommand(block, "group_1", ["performance", "score"]);
    if (command === null) throw new Error("no command");
    const previewed = preview(view, command);
    if (isCommandError(previewed)) throw new Error(previewed.message);
    const shown = blockIn(previewed, A);
    expect(shown.manifest.graphical?.order).toEqual({ group_2: ["page", "excerpt"] });
    expect(block.manifest.graphical?.order?.group_1).toEqual(["score", "performance"]);
    const cards = drawingOf(shown, previewed.settings, metrics).elements.flatMap((element) =>
      element.type === "card" ? [[element.address, element.y]] : [],
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

describe("releaseMotion", () => {
  const reordered = changed(view, reorderCommand(block, "group_1", ["performance", "score"]));
  const shown = drawingOf(blockIn(reordered, A), reordered.settings, metrics);

  it("moves the copy from its drop to the card's place after the release", () => {
    expect(releaseMotion(drawing, shown, "score/card", { x: 10, y: 100 })).toEqual({
      from: { x: 10, y: 100 },
      to: { x: 0, y: 57.4765625 },
    });
    expect(releaseMotion(drawing, drawing, "score/card", { x: 10, y: 100 })).toEqual({
      from: { x: 10, y: 100 },
      to: { x: 0, y: 0 },
    });
  });

  it("gives no motion for a copy already in place, nor for a card not drawn", () => {
    expect(releaseMotion(drawing, shown, "score/card", { x: 0, y: 57.4765625 })).toBeNull();
    expect(releaseMotion(drawing, shown, "nobody/card", { x: 10, y: 100 })).toBeNull();
  });
});
