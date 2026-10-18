import type { Block, View } from "@timetoalign/tilie-core";
import {
  apply,
  createStore,
  createView,
  elementOf,
  isCommandError,
  manifestElements,
  manifestIds,
} from "@timetoalign/tilie-core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ResizeMode, ZOrderAction } from "../src/index.ts";
import {
  affectedBy,
  drawingOf,
  handlesFor,
  itemHandlesFor,
  itemResizeCommand,
  itemResizeValues,
  moveCommand,
  nudgeCommand,
  placeKeyOf,
  project,
  removeCommand,
  resize,
  resizeCommand,
  resizedItemOf,
  zOrderCommand,
} from "../src/index.ts";
import {
  A,
  blockIn,
  CHILD_MEMBER,
  changed,
  load,
  metrics,
  mixedPlain,
  numbersView,
  placed,
} from "./support.ts";

/** `bundle_mixed` holds frames, members' cards (a root's and a child's) and an ungrouped card. */
const FIXTURES = [
  "bare",
  "nested",
  "flow_control",
  "with_region",
  "map",
  "bundles/bundle_mixed",
] as const;
/** The manifests of the removal property: `numbers` is a manifest with one group and a region. */
const REMOVAL_FIXTURES = [...FIXTURES, CHILD_MEMBER, "numbers"] as const;
const MODES: readonly ResizeMode[] = ["scale", "box", "stretch"];
const ACTIONS: readonly ZOrderAction[] = ["front", "back", "forward", "backward"];
const PLACEMENT = ["x", "y", "index", "scale", "length", "spacing", "width", "height"] as const;

const coordinate = fc.double({ min: -2000, max: 2000, noNaN: true });
const delta = fc.double({ min: -1000, max: 1000, noNaN: true });

const gesture = fc.oneof(
  fc.record({ kind: fc.constant("move" as const), pick: fc.nat(), x: coordinate, y: coordinate }),
  fc.record({
    kind: fc.constant("nudge" as const),
    pick: fc.nat(),
    dx: fc.integer({ min: -8, max: 8 }),
    dy: fc.integer({ min: -8, max: 8 }),
  }),
  fc.record({
    kind: fc.constant("zOrder" as const),
    picks: fc.array(fc.nat(), { maxLength: 3 }),
    action: fc.constantFrom(...ACTIONS),
  }),
  fc.record({
    kind: fc.constant("resize" as const),
    pick: fc.nat(),
    mode: fc.constantFrom(...MODES),
    handle: fc.nat(),
    dx: delta,
    dy: delta,
  }),
  fc.record({
    kind: fc.constant("itemResize" as const),
    pick: fc.nat(),
    box: fc.nat(),
    mode: fc.constantFrom(...MODES),
    handle: fc.nat(),
    dx: delta,
    dy: delta,
  }),
  fc.record({ kind: fc.constant("remove" as const), picks: fc.array(fc.nat(), { maxLength: 3 }) }),
);
type Gesture = typeof gesture extends fc.Arbitrary<infer T> ? T : never;

const blocks = fc.array(
  fc.record({ fixture: fc.constantFrom(...FIXTURES), x: coordinate, y: coordinate }),
  { minLength: 1, maxLength: 5 },
);

function initial(specs: readonly { fixture: string; x: number; y: number }[]): View {
  return specs.reduce(
    (view, { fixture, x, y }, index) =>
      changed(view, {
        type: "add",
        into: "workspace",
        block: { id: `000000000${index}`, manifest: load(fixture), x, y },
      }),
    createView(),
  );
}

/**
 * Every address a click can select in `view`: block ids, then the addresses
 * of their drawn elements and parts (a marker is not drawn).
 */
function addresses(view: View): string[] {
  const ids = Object.keys(view.blocks).sort();
  const drawn = (id: string) =>
    drawingOf(view.blocks[id] as Block, view.settings, metrics).elements.flatMap((element) =>
      element.address === null ? [] : [`${id}/${element.address}`],
    );
  return [...ids, ...ids.flatMap(drawn)];
}

/** The command a gesture gives on `view`, or `null` when it gives none. */
function commandOf(view: View, item: Gesture): object | null {
  const ids = Object.keys(view.blocks).sort();
  if (ids.length === 0) return null;
  const one = (pick: number) => ids[pick % ids.length] as string;
  switch (item.kind) {
    case "move":
      return moveCommand(view, [{ id: one(item.pick), x: item.x, y: item.y }], metrics);
    case "nudge":
      return nudgeCommand(view, [one(item.pick)], item.dx, item.dy, metrics);
    case "zOrder":
      return zOrderCommand(view, item.picks.map(one), item.action);
    case "resize": {
      const block = view.blocks[one(item.pick)];
      if (block === undefined) return null;
      const handles = handlesFor(item.mode);
      const handle = handles[item.handle % handles.length] as (typeof handles)[number];
      const { values } = resize(block, view.settings, metrics, item.mode, handle, item);
      return resizeCommand(block, values);
    }
    case "itemResize": {
      const block = view.blocks[one(item.pick)];
      if (block === undefined) return null;
      const drawing = drawingOf(block, view.settings, metrics);
      const boxes = [...drawing.items, ...drawing.cards].map((drawn) => drawn.address);
      if (boxes.length === 0) return null;
      const resized = resizedItemOf(drawing, boxes[item.box % boxes.length] as string);
      if (resized === undefined) return null;
      const handles = itemHandlesFor(item.mode, resized.kind, "arranger");
      const handle = handles[item.handle % handles.length] as (typeof handles)[number];
      const values = itemResizeValues(
        block,
        view.settings,
        metrics,
        "arranger",
        resized,
        item.mode,
        handle,
        item,
      );
      const key = placeKeyOf(resized, item.mode);
      return itemResizeCommand(view, block.id, key, values, "arranger", metrics);
    }
    case "remove": {
      const all = addresses(view);
      const command = removeCommand(
        view,
        new Set(item.picks.map((pick) => all[pick % all.length] as string)),
      );
      return "refused" in command ? null : command;
    }
  }
}

describe("gesture commands", () => {
  it("are accepted by apply", () => {
    fc.assert(
      fc.property(blocks, fc.array(gesture, { maxLength: 8 }), (specs, gestures) => {
        let view = initial(specs);
        for (const item of gestures) {
          const command = commandOf(view, item);
          if (command === null) continue;
          const next = apply(view, command);
          expect(isCommandError(next) ? next : null).toBeNull();
          view = next as View;
        }
      }),
      { numRuns: 60 },
    );
  });

  it("are undone exactly through the store", () => {
    fc.assert(
      fc.property(blocks, fc.array(gesture, { maxLength: 8 }), (specs, gestures) => {
        const store = createStore({ view: initial(specs), journal: [], sessions: {} });
        const before: View[] = [];
        for (const item of gestures) {
          const command = commandOf(store.view, item);
          if (command === null) continue;
          before.push(store.view);
          expect(store.dispatch(command)).toBeNull();
        }
        for (const expected of before.reverse()) {
          store.undo();
          const view = store.view;
          expect(Object.keys(view.blocks).sort()).toEqual(Object.keys(expected.blocks).sort());
          for (const [id, block] of Object.entries(expected.blocks)) {
            for (const member of PLACEMENT) expect(view.blocks[id]?.[member]).toBe(block[member]);
            expect(view.blocks[id]?.places).toStrictEqual(block.places);
          }
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe("a member's Stretch", () => {
  it("states only its group's length at every level outside the group editor", () => {
    const view = mixedPlain();
    const { cards } = drawingOf(blockIn(view, A), view.settings, metrics);
    fc.assert(
      fc.property(
        fc.constantFrom(...cards),
        fc.option(fc.integer({ min: 2048, max: 2000 * 2048 }), { nil: null }),
        fc.constantFrom(...(["arranger", "bundle", "timeline"] as const)),
        delta,
        (card, steps, level, dx) => {
          const width = steps === null ? null : steps / 2048;
          const framed = width === null ? view : placed(view, A, card.group, { width });
          const resized = { kind: "member", key: card.key, item: card.group } as const;
          const block = blockIn(framed, A);
          const at = { dx, dy: 0 };
          const values = itemResizeValues(
            block,
            framed.settings,
            metrics,
            level,
            resized,
            "stretch",
            "right",
            at,
          );
          expect(Object.keys(values)).toEqual(["length"]);
          const store = createStore({ view: framed, journal: [], sessions: {} });
          const editor = { arranger: null, bundle: A, timeline: `${A}/${card.key}` }[level];
          if (editor !== null) expect(store.open(editor)).toBeNull();
          const command = itemResizeCommand(framed, A, card.group, values, level, metrics);
          if (command !== null) expect(store.dispatch(command)).toBeNull();
          expect(blockIn(store.view, A).places[card.group]?.width).toBe(width ?? undefined);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("projection", () => {
  it("returns the identical nodes for an unchanged view", () => {
    fc.assert(
      fc.property(
        blocks,
        fc.array(gesture, { maxLength: 6 }),
        fc.array(fc.nat(), { maxLength: 4 }),
        (specs, gestures, picks) => {
          let view = initial(specs);
          for (const item of gestures) {
            const command = commandOf(view, item);
            if (command !== null) view = changed(view, command);
          }
          const all = addresses(view);
          const selection = new Set(
            all.length === 0 ? [] : picks.map((pick) => all[pick % all.length] as string),
          );
          const first = project(view, selection, [], metrics, null);
          const second = project(view, selection, first, metrics, null);
          expect(second).toHaveLength(Object.keys(view.blocks).length);
          for (const [index, node] of second.entries()) {
            expect(node).toBe(first[index]);
            expect(node.width).toBe(node.data.drawing.width * node.data.block.scale);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe("affectedBy", () => {
  it("names exactly what a remove deletes besides the selection", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REMOVAL_FIXTURES),
        fc.array(fc.nat(), { minLength: 1, maxLength: 4 }),
        (fixture, picks) => {
          const view = fixture === "numbers" ? numbersView() : initial([{ fixture, x: 0, y: 0 }]);
          const manifest = blockIn(view, A).manifest;
          const elements = manifestElements(manifest).flatMap((key) =>
            key.address === null ? [] : [key.address],
          );
          const local = new Set(picks.map((pick) => elements[pick % elements.length] as string));
          const owners = [...local].map((address) => elementOf(manifest, address));
          const command = removeCommand(view, new Set([...local].map((path) => `${A}/${path}`)));
          const direct = apply(view, { type: "remove", targets: owners.map((o) => `${A}/${o}`) });
          expect("refused" in command).toBe(isCommandError(direct));
          if ("refused" in command) return;
          const before = manifestIds(manifest);
          const after = manifestIds(blockIn(changed(view, command), A).manifest);
          const expected = new Set(
            [...owners, ...affectedBy(manifest, local)].filter((item) => before.has(item)),
          );
          expect(new Set([...before].filter((item) => !after.has(item)))).toEqual(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});
