import type { View } from "@timetoalign/tilie-core";
import { isIndex, manifestIds } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import type { ZOrderAction } from "../src/index.ts";
import {
  addCommand,
  moveCommand,
  nudgeCommand,
  removeCommand,
  zOrderCommand,
} from "../src/index.ts";
import {
  A,
  B,
  blockIn,
  C,
  CHILD_MEMBER,
  changed,
  load,
  MPM,
  numbersView,
  viewOf,
  withGrid,
} from "./support.ts";

describe("moveCommand", () => {
  const view = viewOf({ id: A, fixture: "bare", x: 40, y: 80 }, { id: B, fixture: "nested" });
  const moves = [
    { id: A, x: 41.5771484375, y: 203 },
    { id: B, x: 19.999999999999943, y: 0 },
  ];

  it("quantizes to 1/2048, in the order of the moves", () => {
    expect(moveCommand(view, moves)).toEqual({
      type: "set",
      changes: [
        { target: A, values: { x: 41.5771484375, y: 203 } },
        { target: B, values: { x: 20, y: 0 } },
      ],
    });
  });

  it("leaves out a block that did not move, and gives null when none moved", () => {
    expect(moveCommand(view, [])).toBeNull();
    expect(moveCommand(view, [{ id: A, x: 40.0001, y: 79.9999 }])).toBeNull();
    expect(moveCommand(view, [{ id: A, x: 40.0001, y: 79.9999 }, ...moves.slice(1)])).toEqual({
      type: "set",
      changes: [{ target: B, values: { x: 20, y: 0 } }],
    });
  });

  it("is accepted by apply", () => {
    const after = changed(view, moveCommand(view, moves));
    expect([blockIn(after, A).x, blockIn(after, A).y, blockIn(after, B).x]).toEqual([
      41.5771484375, 203, 20,
    ]);
  });
});

describe("nudgeCommand", () => {
  const view = viewOf({ id: A, fixture: "bare", x: 40, y: 80 });
  const offGrid = viewOf({ id: A, fixture: "bare", x: 41, y: 80 });

  it("moves by grid steps", () => {
    expect(nudgeCommand(view, [A], 1, 0)).toEqual({
      type: "set",
      changes: [{ target: A, values: { x: 48, y: 80 } }],
    });
    expect(nudgeCommand(view, [A], -8, 2)).toEqual({
      type: "set",
      changes: [{ target: A, values: { x: -24, y: 96 } }],
    });
  });

  it("snaps an off-grid block, and steps by the grid size without snapping", () => {
    expect(nudgeCommand(offGrid, [A], 1, 0)?.changes).toEqual([
      { target: A, values: { x: 48, y: 80 } },
    ]);
    expect(nudgeCommand(withGrid(offGrid, 8, false), [A], 1, 0)?.changes).toEqual([
      { target: A, values: { x: 49, y: 80 } },
    ]);
  });

  it("gives null for no block or no step", () => {
    expect(nudgeCommand(view, [], 1, 0)).toBeNull();
    expect(nudgeCommand(offGrid, [A], 0, 0)).toBeNull();
  });
});

describe("zOrderCommand", () => {
  const view = viewOf(
    { id: A, fixture: "bare" },
    { id: B, fixture: "bare" },
    { id: C, fixture: "bare" },
  );

  function order(after: View): string[] {
    return Object.values(after.blocks)
      .sort((left, right) => (left.index < right.index ? -1 : 1))
      .map((block) => block.id);
  }

  it.each<[string[], ZOrderAction, string[], string[]]>([
    [[A], "front", [B, C, A], [A]],
    [[C], "back", [C, A, B], [C]],
    [[A], "forward", [B, A, C], [A]],
    [[C], "backward", [A, C, B], [C]],
    [[A, B], "forward", [C, A, B], [A, B]],
  ])("moves %j %s", (ids, action, expected, touched) => {
    const command = zOrderCommand(view, ids, action);
    expect(command?.changes.map((change) => change.target)).toEqual(touched);
    for (const change of command?.changes ?? []) {
      expect(isIndex(change.values.index as string)).toBe(true);
    }
    expect(order(changed(view, command))).toEqual(expected);
  });

  it("never gives a block an index another chosen block still holds", () => {
    const front = changed(view, zOrderCommand(view, [A], "front"));
    expect(order(changed(front, zOrderCommand(front, [A, B], "front")))).toEqual([C, B, A]);
  });

  it("gives null when the order is unchanged", () => {
    expect(zOrderCommand(view, [C], "front")).toBeNull();
    expect(zOrderCommand(view, [A], "back")).toBeNull();
    expect(zOrderCommand(view, [A], "backward")).toBeNull();
    expect(zOrderCommand(view, [], "front")).toBeNull();
  });
});

describe("removeCommand", () => {
  const nested = viewOf({ id: A, fixture: "nested" }, { id: B, fixture: "bare" });
  const region = viewOf({ id: A, fixture: "with_region" });
  const hint = `Block ${A}: its root timeline clt_1 is removed only with the block; select the block to delete it.`;

  it("removes the selected addresses", () => {
    expect(removeCommand(nested, new Set([A]))).toEqual({ type: "remove", targets: [A] });
    expect(removeCommand(nested, new Set([`${A}/clt_3`]))).toEqual({
      type: "remove",
      targets: [`${A}/clt_3`],
    });
  });

  it("folds an element's parts into the element", () => {
    expect(removeCommand(nested, new Set([`${A}/clt_3/name`, `${A}/clt_3`]))).toEqual({
      type: "remove",
      targets: [`${A}/clt_3`],
    });
    const command = removeCommand(region, new Set([`${A}/region_1/label`]));
    expect(command).toEqual({ type: "remove", targets: [`${A}/region_1`] });
    expect(manifestIds(blockIn(changed(region, command), A).manifest)).toEqual(
      new Set(["clt_1", "clt_2", "clt_3"]),
    );
  });

  it("refuses a root timeline whole", () => {
    expect(removeCommand(nested, new Set([`${A}/clt_1`]))).toEqual({ refused: hint });
    expect(removeCommand(nested, new Set([B, `${A}/clt_1/start`]))).toEqual({ refused: hint });
  });

  it("refuses an empty selection", () => {
    expect(removeCommand(nested, new Set())).toEqual({ refused: "Nothing is selected." });
  });

  it("is accepted by apply", () => {
    const after = changed(nested, removeCommand(nested, new Set([`${A}/clt_3`])));
    expect(manifestIds(blockIn(after, A).manifest)).toEqual(new Set(["clt_1"]));
  });

  describe("in a group or bundle block", () => {
    const numbers = numbersView();
    const refusal = (element: string) => ({
      refused: `Block ${A}: removing ${element} from a group or bundle block is not supported yet.`,
    });

    it("removes an element of a root's tree by its root-qualified address", () => {
      const command = removeCommand(numbers, new Set([`${A}/score/region_1/label`]));
      expect(command).toEqual({ type: "remove", targets: [`${A}/score/region_1`] });
      expect(
        manifestIds(blockIn(changed(numbers, command), A).manifest).has("score/region_1"),
      ).toBe(false);
      expect(
        removeCommand(numbers, new Set([`${A}/score/region_1`, `${A}/score/region_1/label`])),
      ).toEqual({ type: "remove", targets: [`${A}/score/region_1`] });
      const mpm = viewOf({ id: A, fixture: MPM });
      const map = removeCommand(mpm, new Set([`${A}/score:clt_1/tmap_1`]));
      expect(map).toEqual({ type: "remove", targets: [`${A}/score:clt_1/tmap_1`] });
      expect(manifestIds(blockIn(changed(mpm, map), A).manifest).has("score:clt_1/tmap_1")).toBe(
        false,
      );
    });

    it("refuses a selection holding a timeline, a group or the bundle whole", () => {
      expect(removeCommand(numbers, new Set([`${A}/score`]))).toEqual(refusal("score"));
      expect(removeCommand(numbers, new Set([`${A}/score/region_1`, `${A}/page/name`]))).toEqual(
        refusal("page"),
      );
      const child = viewOf({ id: A, fixture: CHILD_MEMBER });
      expect(removeCommand(child, new Set([`${A}/second-half/start`]))).toEqual(
        refusal("second-half"),
      );
      expect(removeCommand(numbers, new Set([`${A}/group_1/name`]))).toEqual(refusal("group_1"));
      const mpm = viewOf({ id: A, fixture: MPM });
      expect(removeCommand(mpm, new Set([`${A}/bundle_1/name`]))).toEqual(refusal("bundle_1"));
    });
  });
});

describe("addCommand", () => {
  const view = viewOf({ id: A, fixture: "bare", x: 40, y: 80 });
  const bare = load("bare");
  const visible = { x: 100, y: 50, zoom: 2, width: 1000, height: 600 };

  it("places the block's top-left at the centre of the view, snapped to the grid", () => {
    expect(addCommand(view, C, bare, visible)).toEqual({
      type: "add",
      into: "workspace",
      block: { id: C, manifest: bare, x: 200, y: 128 },
    });
  });

  it("quantizes to 1/2048 when the grid does not snap", () => {
    const free = withGrid(view, 8, false);
    expect(addCommand(free, C, bare, visible).block).toEqual({
      id: C,
      manifest: bare,
      x: 200,
      y: 125,
    });
    const odd = { x: 0, y: 0, zoom: 3, width: 1001, height: 1 };
    expect(addCommand(free, C, bare, odd).block).toEqual({
      id: C,
      manifest: bare,
      x: 166.83349609375,
      y: 0.16650390625,
    });
  });

  it("is accepted by apply, giving the block the workspace's defaults", () => {
    const after = changed(view, addCommand(view, C, bare, visible));
    const block = blockIn(after, C);
    const { scale, length, spacing, width, height, order } = view.settings.blockDefaults;
    expect([block.x, block.y, block.scale, block.length, block.spacing]).toEqual([
      200,
      128,
      scale,
      length,
      spacing,
    ]);
    expect([block.width, block.height, block.order]).toEqual([width, height, order]);
    expect(block.manifest).toEqual(bare);
    expect(block.index > blockIn(after, A).index).toBe(true);
  });
});
