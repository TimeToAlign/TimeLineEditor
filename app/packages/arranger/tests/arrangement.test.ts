// @vitest-environment jsdom
/**
 * Arrangements on the canvas (README, "Arrangements on the canvas"): the
 * rules of an arranged level, where a content drops, the blocks of an
 * arranged canvas, the items of an arranged block and the cards pinned side
 * by side, the scale beside an arrangement gap and the editor's zoom.
 */

import type { Command, View } from "@timetoalign/tilie-core";
import {
  apply,
  DEFAULT_GRANULARITY,
  idAddress,
  inBlock,
  indexBetween,
  isCommandError,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import type { ArrangedDrop, NodeDrag } from "../src/blockDrag.ts";
import { arrangedDrop, BlockDrag } from "../src/blockDrag.ts";
import { cardAxisAt } from "../src/cardAxis.ts";
import type { Arranged } from "../src/containers.ts";
import { arrangedOf, LEVELS, rulesOf } from "../src/containers.ts";
import { drawingOf, nodePosition } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { elidedReach } from "../src/focus.ts";
import { DEFAULT_GAP_MODES, gapsOf, subjectOf } from "../src/gaps.ts";
import { arrangedGesture } from "../src/gestures/arranged.ts";
import { heldGesture, heldRefusal, isPinned } from "../src/gestures/held.ts";
import type { NodeHost } from "../src/gestures/host.ts";
import type { KeyContext } from "../src/keys.ts";
import { arrangedStep, handleKey } from "../src/keys.ts";
import type { BlockNode } from "../src/node.ts";
import { blocksInOrder, project } from "../src/project.ts";
import type { OrderEntry } from "../src/reorder.ts";
import { orderAt, rowRefusal, steppedOrder } from "../src/reorder.ts";
import type { Selection } from "../src/selection.ts";
import { NOTHING_SELECTED, selectionOf } from "../src/selection.ts";
import { recordingActions } from "./dom.ts";
import { A, B, blockIn, C, CHILD_MEMBER, changed, metrics, NUMBERS, viewOf } from "./support.ts";

const D = "0000000003";
const E = "0000000004";

const ARRANGED_ROOTS = "bundles/bundle_arranged_roots";
const CONFLICT = "bundles/bundle_arranged_conflict";

const FREE = { locked: false, readonly: false } as const;

/** `view` with the workspace's blocks arranged as `arrangement` states (`null` none). */
const canvasArranged = (view: View, arrangement: object | null) =>
  changed(view, { type: "set", changes: [{ target: WORKSPACE, values: { arrangement } }] });

/** `view` with block A's items arranged `direction` from the stored order `[]`. */
const itemsArranged = (view: View, direction: "vertical" | "horizontal") =>
  changed(view, {
    type: "set",
    changes: [{ target: { block: A }, values: { arrangement: { direction, order: [] } } }],
  });

const bundleOf = (block: string): Editing => ({ target: { block }, kind: "bundle" });
const groupOf = (block: string, group: string): Editing => ({
  target: inBlock(block, idAddress(group)),
  kind: "group",
});

const drawn = (view: View, id: string = A): Drawing =>
  drawingOf(blockIn(view, id), view.graphical, metrics);

// ---------------------------------------------------------------- the rules of a level

describe("the rules of an arranged level", () => {
  const blocks = viewOf(
    { id: A, fixture: "bare" },
    { id: B, fixture: "bare" },
    { id: C, fixture: "bare" },
    { id: D, fixture: "bare" },
    { id: E, fixture: "bare" },
  );

  it("reads the arranger's arrangement of the blocks", () => {
    expect(arrangedOf(blocks, null)).toBe(null);
    expect(arrangedOf(canvasArranged(blocks, { direction: "vertical" }), null)).toEqual({
      direction: "vertical",
      columns: 1,
    });
    expect(arrangedOf(canvasArranged(blocks, { direction: "matrix" }), null)).toEqual({
      direction: "matrix",
      columns: 3,
    });
    expect(arrangedOf(canvasArranged(blocks, { direction: "matrix", columns: 2 }), null)).toEqual({
      direction: "matrix",
      columns: 2,
    });
  });

  it("reads a bundle editor's items as drawn, and nothing in a group or timeline editor", () => {
    const roots = itemsArranged(viewOf({ id: A, fixture: ARRANGED_ROOTS }), "horizontal");
    expect(arrangedOf(roots, bundleOf(A))).toEqual({ direction: "horizontal", columns: 1 });
    expect(arrangedOf(roots, groupOf(A, "group_1"))).toBe(null);
    expect(
      arrangedOf(roots, { target: inBlock(A, idAddress("exposition")), kind: "timeline" }),
    ).toBe(null);
    const conflict = changed(viewOf({ id: A, fixture: CONFLICT }), {
      type: "set",
      changes: [
        { target: { block: A }, values: { arrangement: { direction: "vertical", order: [] } } },
      ],
    });
    expect(arrangedOf(conflict, bundleOf(A))).toEqual({ direction: "vertical", columns: 1 });
  });

  it("keeps a stored horizontal arrangement the rules refuse, read as vertical", () => {
    // Core refuses to store a refused one, so the conflict comes after: a member moved.
    const view = itemsArranged(viewOf({ id: A, fixture: ARRANGED_ROOTS }), "horizontal");
    const moved = changed(view, {
      type: "set",
      changes: [{ target: inBlock(A, idAddress("development")), values: { offset: [8, 1] } }],
    });
    expect(blockIn(moved, A).arrangement?.direction).toBe("horizontal");
    expect(arrangedOf(moved, bundleOf(A))).toEqual({ direction: "vertical", columns: 1 });
  });

  const vertical: Arranged = { direction: "vertical", columns: 1 };

  it("moves and nudges nothing freely where arranged, the arrangement carried", () => {
    expect(rulesOf(null, { ...FREE, arranged: vertical })).toStrictEqual({
      ...LEVELS.arranger,
      move: false,
      nudge: false,
      arranged: vertical,
    });
    expect(rulesOf(bundleOf(A), { ...FREE, arranged: vertical })).toStrictEqual({
      ...LEVELS.bundle,
      move: false,
      nudge: false,
      arranged: vertical,
    });
    expect(rulesOf(groupOf(A, "group_1"), { ...FREE, arranged: vertical })).toBe(LEVELS.group);
  });

  it("turns the arrangement off with the lock and on a read-only canvas", () => {
    const locked = { locked: true, readonly: false };
    const readonly = { locked: false, readonly: true };
    expect(rulesOf(null, { ...locked, arranged: vertical })).toStrictEqual(rulesOf(null, locked));
    expect(rulesOf(null, { ...readonly, arranged: vertical })).toStrictEqual(
      rulesOf(null, readonly),
    );
  });
});

// ---------------------------------------------------------------- where a content drops

describe("orderAt", () => {
  const square = (id: string, x: number, y: number): OrderEntry => ({
    id,
    x,
    y,
    width: 10,
    height: 10,
  });
  const column = [square("a", 0, 0), square("b", 0, 20), square("c", 0, 40)];
  const row = [square("a", 0, 0), square("b", 20, 0), square("c", 40, 0)];
  const matrix = [
    square("a", 0, 0),
    square("b", 20, 0),
    square("c", 0, 20),
    square("d", 20, 20),
    square("e", 0, 40),
  ];

  it.each([
    [24, ["a", "b", "c"]],
    [25, ["b", "a", "c"]],
    [26, ["b", "a", "c"]],
    [100, ["b", "c", "a"]],
  ] as const)("drops a at y %d of a column as %j", (y, order) => {
    expect(orderAt(column, "a", { x: 0, y }, "vertical")).toEqual(order);
  });

  it("drops along a row by abscissa", () => {
    expect(orderAt(row, "c", { x: 12, y: 0 }, "horizontal")).toEqual(["a", "c", "b"]);
  });

  it("drops in a matrix row by row", () => {
    expect(orderAt(matrix, "e", { x: 25, y: 5 }, "matrix")).toEqual(["a", "b", "e", "c", "d"]);
    expect(orderAt(matrix, "a", { x: 2, y: 30 }, "matrix")).toEqual(["b", "a", "c", "d", "e"]);
    expect(orderAt(matrix, "a", { x: 100, y: 100 }, "matrix")).toEqual(["b", "c", "d", "e", "a"]);
  });

  it("steps one content along an order", () => {
    expect(steppedOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(steppedOrder(["a", "b", "c"], "c", 1)).toBe(null);
    expect(steppedOrder(["a", "b", "c"], "a", -1)).toBe(null);
    expect(steppedOrder(["a", "b", "c"], "a", 0)).toBe(null);
  });

  it("reads an arrow as a step along the arrangement", () => {
    const of = (direction: Arranged["direction"], columns = 1) => ({ direction, columns });
    expect(
      ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].map((key) =>
        arrangedStep(of("vertical"), key),
      ),
    ).toEqual([1, -1, 0, 0]);
    expect(
      ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].map((key) =>
        arrangedStep(of("horizontal"), key),
      ),
    ).toEqual([0, 0, -1, 1]);
    expect(
      ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].map((key) =>
        arrangedStep(of("matrix", 3), key),
      ),
    ).toEqual([3, -3, -1, 1]);
  });
});

// ---------------------------------------------------------------- blocks

/** The three blocks of the README's block cases, free. */
const THREE = viewOf(
  { id: A, fixture: "bare", x: 40, y: 80 },
  { id: B, fixture: NUMBERS, x: 600, y: 0 },
  { id: C, fixture: CHILD_MEMBER, x: 0, y: 600 },
);

/** Block `id`'s node size and its stated node place `P`, from its drawing's records. */
function sized(view: View, id: string) {
  const block = blockIn(view, id);
  const drawing = drawn(view, id);
  return {
    w: drawing.width * block.scale,
    h: drawing.height * block.scale,
    P: nodePosition(block, drawing),
  };
}

/** The packing origin of blocks sized `sizes`: the top left of their stated places. */
const originOf = (...sizes: readonly { readonly P: { x: number; y: number } }[]) => ({
  x: Math.min(...sizes.map(({ P }) => P.x)),
  y: Math.min(...sizes.map(({ P }) => P.y)),
});

/** Every node's position, by block id. */
function positions(view: View): Record<string, { x: number; y: number }> {
  return Object.fromEntries(
    project(view, NOTHING_SELECTED, [], metrics, null).map((node) => [node.id, node.position]),
  );
}

const nodeIn = (nodes: readonly BlockNode[], id: string): BlockNode => {
  const node = nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(`no node ${id}`);
  return node;
};

describe("arranged blocks", () => {
  const a = sized(THREE, A);
  const b = sized(THREE, B);
  const c = sized(THREE, C);
  const O = originOf(a, b, c);

  it("packs them one under another from the top left of their places, 32 apart", () => {
    const vertical = canvasArranged(THREE, { direction: "vertical" });
    const yB = O.y + a.h + 32;
    expect(positions(vertical)).toEqual({
      [A]: O,
      [B]: { x: O.x, y: yB },
      [C]: { x: O.x, y: yB + b.h + 32 },
    });
  });

  it("packs them side by side", () => {
    const xB = O.x + a.w + 32;
    expect(positions(canvasArranged(THREE, { direction: "horizontal" }))).toEqual({
      [A]: O,
      [B]: { x: xB, y: O.y },
      [C]: { x: xB + b.w + 32, y: O.y },
    });
  });

  it("packs five blocks in a matrix of two columns", () => {
    const five = [D, E].reduce(
      (view, id) =>
        changed(view, {
          type: "add",
          into: WORKSPACE,
          block: { id, manifest: blockIn(THREE, A).manifest, x: 0, y: 0 },
        }),
      THREE,
    );
    const d = sized(five, D);
    const e = sized(five, E);
    const { x: left, y: top } = originOf(a, b, c, d, e);
    const right = left + Math.max(a.w, c.w, e.w) + 32;
    const middle = top + Math.max(a.h, b.h) + 32;
    const bottom = middle + Math.max(c.h, d.h) + 32;
    expect(positions(canvasArranged(five, { direction: "matrix", columns: 2 }))).toEqual({
      [A]: { x: left, y: top },
      [B]: { x: right, y: top },
      [C]: { x: left, y: middle },
      [D]: { x: right, y: middle },
      [E]: { x: left, y: bottom },
    });
  });

  const vertical = canvasArranged(THREE, { direction: "vertical" });
  const arranged: Arranged = { direction: "vertical", columns: 1 };
  const nodes = project(vertical, NOTHING_SELECTED, [], metrics, null);

  it("drops a dragged block at its new place and stores one index", () => {
    const nodeC = nodeIn(nodes, C);
    const drop: ArrangedDrop = arrangedDrop(
      nodes,
      nodeIn(nodes, A),
      { x: nodeC.position.x, y: nodeC.position.y + c.h },
      arranged,
    );
    const yC = O.y + b.h + 32;
    expect(drop.order).toEqual([B, C, A]);
    expect(Object.fromEntries(drop.places)).toEqual({
      [B]: O,
      [C]: { x: O.x, y: yC },
      [A]: { x: O.x, y: yC + c.h + 32 },
    });
    const dispatched: Command[] = [];
    let view = vertical;
    let shown: BlockNode[] = [...nodes];
    const drag = new BlockDrag({
      view: () => view,
      metrics: () => metrics,
      pane: () => undefined,
      zoom: () => 1,
      projected: () => nodes,
      shown: () => shown,
      show: (next) => {
        shown = next;
      },
      selection: () => NOTHING_SELECTED,
      select: () => {},
      guides: () => {},
      arranged: () => arranged,
      dispatch(command) {
        dispatched.push(command);
        const next = apply(view, command);
        if (isCommandError(next)) return false;
        view = next;
        return true;
      },
      report: () => {},
    });
    const lead = {
      ...nodeIn(nodes, A),
      position: { x: nodeC.position.x, y: nodeC.position.y + c.h },
    };
    const event: NodeDrag = { targetNode: lead, nodes: [lead] };
    drag.start(event);
    drag.drag(event);
    expect(nodeIn(shown, B).position).toEqual(O);
    drag.stop(event);
    expect(dispatched).toEqual([
      {
        type: "set",
        changes: [
          {
            target: { block: A },
            values: { index: indexBetween(blockIn(vertical, C).index, null) },
          },
        ],
      },
    ]);
    expect(positions(view)).toEqual(Object.fromEntries(drop.places));
  });

  it("stores nothing for a block dropped where it lay", () => {
    const nodeA = nodeIn(nodes, A);
    const drop = arrangedDrop(nodes, nodeA, nodeA.position, arranged);
    expect(drop.order).toEqual([A, B, C]);
  });

  it("puts every block at its stated place again when Free", () => {
    expect(positions(canvasArranged(vertical, null))).toEqual({ [A]: a.P, [B]: b.P, [C]: c.P });
  });

  it("packs them again from the same origin in the order Ctrl+] gives", () => {
    const { context, dispatched } = keyContext(vertical, selectionOf([{ block: A }]), null);
    const taken = handleKey(
      context,
      new KeyboardEvent("keydown", { key: "]", code: "BracketRight", ctrlKey: true }),
    );
    expect(taken).toBe(true);
    const [command] = dispatched;
    const raised = changed(vertical, command ?? null);
    expect(blocksInOrder(raised).map((block) => block.id)).toEqual([B, A, C]);
    const yA = O.y + b.h + 32;
    expect(positions(raised)).toEqual({
      [B]: O,
      [A]: { x: O.x, y: yA },
      [C]: { x: O.x, y: yA + a.h + 32 },
    });
  });

  it("moves the selected block one place by an arrow, and nudges nothing", () => {
    const down = pressed(vertical, selectionOf([{ block: A }]), null, "ArrowDown");
    expect(down.taken).toBe(true);
    expect(down.dispatched).toEqual([
      {
        type: "set",
        changes: [
          {
            target: { block: A },
            values: {
              index: indexBetween(blockIn(vertical, B).index, blockIn(vertical, C).index),
            },
          },
        ],
      },
    ]);
    const up = pressed(vertical, selectionOf([{ block: A }]), null, "ArrowUp");
    expect(up).toEqual({ taken: true, dispatched: [], refused: [] });
    const across = pressed(vertical, selectionOf([{ block: A }]), null, "ArrowLeft");
    expect(across).toEqual({ taken: true, dispatched: [], refused: [] });
  });

  it("moves a block a row down in a matrix", () => {
    const five = [D, E].reduce(
      (view, id) =>
        changed(view, {
          type: "add",
          into: WORKSPACE,
          block: { id, manifest: blockIn(THREE, A).manifest, x: 0, y: 0 },
        }),
      canvasArranged(THREE, { direction: "matrix", columns: 2 }),
    );
    const { dispatched } = pressed(five, selectionOf([{ block: A }]), null, "ArrowDown");
    const [command] = dispatched;
    expect(blocksInOrder(changed(five, command ?? null)).map((block) => block.id)).toEqual([
      B,
      C,
      A,
      D,
      E,
    ]);
  });
});

// ---------------------------------------------------------------- the keys

/** A key context on `view` recording what it dispatches and refuses. */
function keyContext(view: View, selection: Selection, editing: Editing | null) {
  const dispatched: Command[] = [];
  const refused: string[] = [];
  const context: KeyContext = {
    view,
    selection,
    editing,
    rules: rulesOf(editing, { ...FREE, arranged: arrangedOf(view, editing) }),
    metrics,
    pane: undefined,
    granularity: DEFAULT_GRANULARITY,
    gapModes: DEFAULT_GAP_MODES,
    toggleGapMode: () => {},
    gapEdge: "end",
    chooseGapEdge: () => {},
    editors: editing === null ? 0 : 1,
    select: () => {},
    dispatch: (command) => {
      dispatched.push(command);
      return !isCommandError(apply(view, command));
    },
    refuse: (message) => refused.push(message),
    confirmDelete: (question) => Promise.resolve(question.remove),
    setMode: () => {},
    toggleLock: () => {},
    toggleCoordinates: () => {},
    toggleMatches: () => {},
    zoomIn: () => {},
    zoomOut: () => {},
    fit: () => {},
    abortGesture: () => false,
    done: () => {},
    open: () => {},
    openable: () => null,
    pressed: () => null,
  };
  return { context, dispatched, refused };
}

/** `key` pressed on the canvas of `view`: whether it was taken, what it dispatched and refused. */
function pressed(view: View, selection: Selection, editing: Editing | null, key: string) {
  const { context, dispatched, refused } = keyContext(view, selection, editing);
  const taken = handleKey(context, new KeyboardEvent("keydown", { key }));
  return { taken, dispatched, refused };
}

// ---------------------------------------------------------------- items

const ROOTS = viewOf({ id: A, fixture: ARRANGED_ROOTS });
const SIDE_BY_SIDE = itemsArranged(ROOTS, "horizontal");
const ONE_UNDER_ANOTHER = itemsArranged(ROOTS, "vertical");
const ROOTS_MANIFEST = blockIn(ROOTS, A).manifest;

describe("the stretches order the items side by side", () => {
  it.each([
    [
      "group_3",
      ["group_3", "group_1", "group_2", "page"],
      '"Recapitulation" stays right of "Exposition", "Development" on "Score"; "Recapitulation" stays right of "Exposition" on "Session"',
    ],
    [
      "group_1",
      ["group_2", "group_3", "group_1", "page"],
      '"Exposition" stays left of "Development", "Recapitulation" on "Score"; "Exposition" stays left of "Recapitulation" on "Session"',
    ],
    [
      "group_2",
      ["group_1", "group_3", "page", "group_2"],
      '"Development" stays left of "Recapitulation" on "Score"',
    ],
    ["page", ["page", "group_1", "group_2", "group_3"], null],
    ["page", ["group_1", "page", "group_2", "group_3"], null],
  ] as const)("moving %s to %j", (moved, order, reason) => {
    expect(rowRefusal(ROOTS_MANIFEST, order, moved)).toBe(reason);
  });
});

/** A host of block A's node in `view` under `editing`, its node actions recorded. */
function hostOf(view: View, editing: Editing) {
  const [node] = project(view, NOTHING_SELECTED, [], metrics, editing);
  if (node === undefined) throw new Error("no node");
  const recorded = recordingActions(view, {
    rules: rulesOf(editing, { ...FREE, arranged: arrangedOf(view, editing) }),
  });
  const refused: string[] = [];
  const host: NodeHost = {
    actions: { ...recorded.actions, refuse: (message) => refused.push(message) },
    data: () => node.data,
    slide: () => {},
    ghost: () => {},
  };
  return { host, calls: recorded.calls, refused };
}

const at = (x: number, y: number) => ({ drawing: { x, y }, screen: { x, y } });

/** An item of block A pressed at `from` and released at `to`: its command, its calls, its refusals. */
function dragItem(
  view: View,
  item: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const { host, calls, refused } = hostOf(view, bundleOf(A));
  const strategy = arrangedGesture(host, { item });
  const press = strategy.takes(new PointerEvent("pointerdown"), at(from.x, from.y));
  if (press === null) throw new Error("not taken");
  strategy.start?.(press);
  const value = strategy.value(press, at(to.x, to.y));
  if (value === null) throw new Error("no value");
  strategy.preview(press, value);
  const command = strategy.command(press, value);
  strategy.preview(press, null);
  return { command, calls, refused, value };
}

describe("dragging an arranged item", () => {
  const REASON =
    '"Recapitulation" stays right of "Exposition", "Development" on "Score"; "Recapitulation" stays right of "Exposition" on "Session"';

  it("refuses a drop the stretches refuse, previewing the stored order", () => {
    const { command, calls, refused, value } = dragItem(
      SIDE_BY_SIDE,
      "group_3",
      { x: 1500, y: 100 },
      { x: 100, y: 100 },
    );
    expect(value.order).toEqual(["group_3", "group_1", "group_2", "page"]);
    expect(command).toBe(null);
    expect(refused).toEqual([REASON]);
    const previews = calls.flatMap((call) => ("preview" in call ? [call.with] : []));
    expect(previews).toEqual([{ view: SIDE_BY_SIDE }, null]);
  });

  it("stores the order of an item hanging on nothing, side by side", () => {
    const { command, refused } = dragItem(
      SIDE_BY_SIDE,
      "page",
      { x: 2100, y: 40 },
      { x: 100, y: 40 },
    );
    const order = ["page", "group_1", "group_2", "group_3"];
    expect(refused).toEqual([]);
    expect(command).toEqual({
      type: "set",
      changes: [
        { target: { block: A }, values: { arrangement: { direction: "horizontal", order } } },
      ],
    });
    expect(blockIn(changed(SIDE_BY_SIDE, command), A).arrangement).toEqual({
      direction: "horizontal",
      order,
    });
  });

  it("stores the order one under another, refusing nothing", () => {
    const drawing = drawn(ONE_UNDER_ANOTHER);
    const page = drawing.boxes.find(
      (box) => box.key?.item === "page" && box.key.member === undefined,
    );
    if (page === undefined) throw new Error("no page");
    const { command } = dragItem(
      ONE_UNDER_ANOTHER,
      "page",
      { x: page.x + 1, y: page.y + 1 },
      { x: page.x + 1, y: 0 },
    );
    expect(command).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A },
          values: {
            arrangement: {
              direction: "vertical",
              order: ["page", "group_1", "group_2", "group_3"],
            },
          },
        },
      ],
    });
  });

  it("moves an item by an arrow, refusing a step the stretches refuse", () => {
    const left = pressed(
      SIDE_BY_SIDE,
      selectionOf([inBlock(A, idAddress("page"))]),
      bundleOf(A),
      "ArrowLeft",
    );
    expect(left.refused).toEqual([]);
    expect(left.dispatched).toEqual([
      {
        type: "set",
        changes: [
          {
            target: { block: A },
            values: {
              arrangement: {
                direction: "horizontal",
                order: ["group_1", "group_2", "page", "group_3"],
              },
            },
          },
        ],
      },
    ]);
    const refused = pressed(
      SIDE_BY_SIDE,
      selectionOf([inBlock(A, idAddress("group_3"))]),
      bundleOf(A),
      "ArrowLeft",
    );
    expect(refused).toEqual({
      taken: true,
      dispatched: [],
      refused: ['"Recapitulation" stays right of "Development" on "Score"'],
    });
  });
});

describe("the cards of a group side by side", () => {
  const sideBySide = drawn(SIDE_BY_SIDE);

  it("pins the anchors of a group, side by side only", () => {
    expect(
      ["recapitulation", "annotations", "take_b"].map((member) =>
        isPinned(ROOTS_MANIFEST, sideBySide, "group_3", member),
      ),
    ).toEqual([true, false, true]);
    expect(isPinned(ROOTS_MANIFEST, drawn(ONE_UNDER_ANOTHER), "group_3", "recapitulation")).toBe(
      false,
    );
  });

  const editing = groupOf(A, "group_3");

  it("takes no press on a pinned card", () => {
    const { host } = hostOf(SIDE_BY_SIDE, editing);
    const strategy = heldGesture(host, "group_3", "recapitulation");
    expect(strategy.takes(new PointerEvent("pointerdown"), at(1500, 80))).toBe(null);
  });

  it("stores a root member's drop above an anchor", () => {
    const { host, refused } = hostOf(SIDE_BY_SIDE, editing);
    const strategy = heldGesture(host, "group_3", "annotations");
    const press = strategy.takes(new PointerEvent("pointerdown"), at(1500, 150));
    if (press === null) throw new Error("not taken");
    const value = strategy.value(press, at(1500, 40));
    if (value === null) throw new Error("no value");
    expect(value.order).toEqual(["annotations", "recapitulation", "take_b"]);
    expect(value.refused).toBe(null);
    expect(strategy.command(press, value)).toEqual({
      type: "set",
      changes: [
        // The group's members are listed in that order, so its entry is deleted.
        { target: inBlock(A, idAddress("group_3")), values: { order: null } },
      ],
    });
    expect(refused).toEqual([]);
  });

  it("refuses an order that changes an anchor", () => {
    let view = changed(SIDE_BY_SIDE, {
      type: "add",
      into: inBlock(A, idAddress("score")),
      child: { id: "coda", unit: "quarters", offset: [40, 1], length: [8, 1] },
    });
    view = changed(view, {
      type: "set",
      changes: [{ target: inBlock(A, idAddress("coda")), values: { groups: ["group_3"] } }],
    });
    const manifest = blockIn(view, A).manifest;
    const order = ["coda", "recapitulation", "annotations", "take_b"];
    expect(heldRefusal(manifest, drawn(view), "group_3", order)).toBe(
      'would anchor "coda" on "Score" instead of "Recapitulation"',
    );
    expect(heldRefusal(manifest, drawn(itemsArranged(view, "vertical")), "group_3", order)).toBe(
      null,
    );
  });
});

// ---------------------------------------------------------------- the gaps of an arrangement

describe("an arrangement gap", () => {
  const stretched = changed(SIDE_BY_SIDE, {
    type: "set",
    changes: [{ target: inBlock(A, idAddress("group_3")), values: { place: { length: 600 } } }],
  });
  const drawing = drawn(stretched);
  const manifest = blockIn(stretched, A).manifest;

  it("gives each edge the scale of the run beside it", () => {
    const axis = cardAxisAt(manifest, drawing, { item: "group_1", member: "session" });
    const [gap] = axis?.exposure.gaps ?? [];
    if (axis === null || gap === undefined) throw new Error("no gap");
    expect(gap.origin).toBe("arrangement");
    expect([String(gap.start), String(gap.end)]).toEqual(["33", "63"]);
    expect(axis.edgeScale(gap, "start")).toBe(1733.3333333333335 / 130);
    expect(axis.edgeScale(gap, "start")).toBe(13.333333333333334);
    expect(axis.edgeScale(gap, "end")).toBe(2600.0000000000005 / 130);
    expect(axis.edgeScale(gap, "end")).toBe(20.000000000000004);
  });

  it("is no subject of an edit", () => {
    const arranged = gapsOf(drawing).filter((piece) => piece.gap?.origin === "arrangement");
    expect(arranged.map(({ gap }) => [String(gap.start), String(gap.end)])).toEqual([["33", "63"]]);
    expect(arranged.map((piece) => subjectOf(manifest, drawing, piece))).toEqual(
      arranged.map(() => null),
    );
  });
});

// ---------------------------------------------------------------- the editor's zoom

describe("the zoom of a group editor side by side", () => {
  const [node] = project(SIDE_BY_SIDE, NOTHING_SELECTED, [], metrics, null);
  if (node === undefined) throw new Error("no node");
  const { drawing } = node.data;
  const boxOf = (item: string, member?: string) => {
    const box = drawing.boxes.find(
      (candidate) => candidate.key?.item === item && candidate.key.member === member,
    );
    if (box === undefined) throw new Error(`no box ${item} ${member}`);
    return box;
  };

  it("counts a once card for every group it lies behind", () => {
    const frame = boxOf("group_3");
    const once = boxOf("group_1", "session");
    expect(once.ancestor?.groups).toEqual(["group_1", "group_3"]);
    const centre = frame.x + frame.width / 2;
    const reach = Math.max(centre - once.x, once.x + once.width - centre);
    expect(elidedReach(node, inBlock(A, idAddress("group_3")))).toBe(reach);
  });

  it("has no reach behind a once card that elides nothing", () => {
    expect(boxOf("group_1", "score").ancestor?.groups).toEqual(["group_1", "group_2", "group_3"]);
    expect(elidedReach(node, inBlock(A, idAddress("group_2")))).toBe(null);
  });
});
